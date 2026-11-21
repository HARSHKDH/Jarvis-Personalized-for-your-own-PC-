const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

// ── Local JSON store (works without MongoDB) ──────────────────────────────────
// All auth data is kept here. MongoDB is used as secondary backup when connected.
const LOCAL_STORE_PATH = path.join(__dirname, '../../data/profile.json');

function isMongoReady() {
  return mongoose.connection.readyState === 1;
}

function loadLocalProfile(userId) {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) return null;
    const all = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
    return all[userId] || null;
  } catch {
    return null;
  }
}

function saveLocalProfile(userId, data) {
  try {
    const dir = path.dirname(LOCAL_STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let all = {};
    if (fs.existsSync(LOCAL_STORE_PATH)) {
      try { all = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8')); } catch {}
    }
    all[userId] = { ...all[userId], ...data, updatedAt: new Date().toISOString() };
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(all, null, 2));
    return all[userId];
  } catch (e) {
    console.error('[LocalStore] Write error:', e.message);
    return data;
  }
}

function deleteLocalProfile(userId) {
  try {
    if (!fs.existsSync(LOCAL_STORE_PATH)) return;
    const all = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, 'utf8'));
    delete all[userId];
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(all, null, 2));
  } catch {}
}

// ── Lazy-load VoiceProfile only when Mongo is ready ───────────────────────────
let VoiceProfile = null;
function getModel() {
  if (!VoiceProfile && isMongoReady()) {
    VoiceProfile = require('../models/VoiceProfile');
  }
  return VoiceProfile;
}

async function findProfile(userId) {
  const Model = getModel();
  if (Model) {
    try { return await Model.findOne({ userId }).lean(); } catch {}
  }
  return loadLocalProfile(userId);
}

async function upsertProfile(userId, data) {
  // Always write to local store first (fast, reliable)
  const saved = saveLocalProfile(userId, data);
  // Try MongoDB as backup
  const Model = getModel();
  if (Model) {
    try {
      await Model.findOneAndUpdate({ userId }, { $set: data }, { upsert: true, new: true });
    } catch (e) {
      console.warn('[Auth] MongoDB upsert failed (local store is authoritative):', e.message);
    }
  }
  return saved;
}

async function deleteProfile(userId) {
  deleteLocalProfile(userId);
  const Model = getModel();
  if (Model) {
    try { await Model.deleteOne({ userId }); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const ENROLL_SAMPLE_SCRIPT = path.join(__dirname, '../../python/enroll_sample.py');
const VERIFY_SCRIPT        = path.join(__dirname, '../../python/verify.py');
const LOCK_DURATION_MS     = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS  = 5;
const VOICE_THRESHOLD      = 0.40;
const PYTHON_CANDIDATES    = ['python', 'python3', 'py'];
const PYTHON_BIN           = resolvePythonBin();

function resolvePythonBin() {
  for (const bin of PYTHON_CANDIDATES) {
    const probe = spawnSync(bin, ['--version'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    if (!probe.error && probe.status === 0) return bin;
  }
  return null;
}

// ─── Helper: run Python and return parsed JSON output ─────────────────────────
const runPython = (scriptPath, args = [], timeoutMs = 60000, onProgress = null) => {
  return new Promise((resolve, reject) => {
    if (!PYTHON_BIN) {
      reject(new Error('No python interpreter found. Install Python and ensure it is in PATH.'));
      return;
    }
    const lines = [];
    const errLines = [];

    const child = spawn(PYTHON_BIN, [scriptPath, ...args], { windowsHide: true });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Python script timed out'));
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      data.toString().split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          lines.push(trimmed);
          if (onProgress) {
            try { onProgress(JSON.parse(trimmed)); } catch {}
          }
        }
      });
    });

    child.stderr.on('data', (data) => { errLines.push(data.toString()); });

    child.on('close', (code) => {
      clearTimeout(timer);
      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        return reject(new Error(`Python exited code ${code}. Stderr: ${errLines.join('')}`));
      }
      try { resolve(JSON.parse(lastLine)); }
      catch (e) { reject(new Error(`Bad Python output: ${lastLine}`)); }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start Python: ${err.message}`));
    });
  });
};

// ════════════════════════════════════════════════════════════
// GET STATUS
// ════════════════════════════════════════════════════════════
const getStatus = async (req, res) => {
  try {
    const userId = process.env.AUTH_USER_ID || 'harsh';
    const profile = await findProfile(userId);

    if (!profile) return res.json({ isEnrolled: false, faceEnrolled: false, userId });

    const isCurrentlyLocked =
      profile.isLocked && profile.lockUntil && new Date(profile.lockUntil) > new Date();

    return res.json({
      isEnrolled:   profile.isEnrolled   || false,
      faceEnrolled: profile.faceEnrolled || false,
      isLocked:     isCurrentlyLocked    || false,
      lockUntil:    profile.lockUntil,
      displayName:  profile.displayName,
      userId,
    });
  } catch (err) {
    console.error('[Auth] getStatus error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// ENROLL SINGLE SAMPLE (browser-recorded WAV → embedding)
// ════════════════════════════════════════════════════════════
const enrollSample = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No audio file uploaded' });
  }

  const audioPath = req.file.path;
  console.log(`[Auth] Processing enrollment sample: ${req.file.originalname}, size: ${req.file.size} bytes`);

  try {
    const result = await runPython(ENROLL_SAMPLE_SCRIPT, [audioPath], 30000);
    fs.unlink(audioPath, () => {});

    if (!result.success) {
      return res.json({ success: false, error: result.error || 'Sample processing failed', quality: 'poor' });
    }

    console.log(`[Auth] Sample quality: ${result.quality}, rms: ${result.rms}, has_voice: ${result.has_voice}`);
    return res.json({
      success: true,
      embedding: result.embedding,
      rms: result.rms,
      voice_rms: result.voice_rms,
      has_voice: result.has_voice,
      quality: result.quality,
      duration_s: result.duration_s,
    });
  } catch (err) {
    fs.unlink(audioPath, () => {});
    console.error('[Auth] enrollSample error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// FINALIZE ENROLLMENT (average embeddings → save voiceprint)
// ════════════════════════════════════════════════════════════
const finalizeEnrollment = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';
  const { embeddings, displayName } = req.body;

  if (!embeddings || !Array.isArray(embeddings) || embeddings.length < 3) {
    return res.status(400).json({ success: false, error: 'Need at least 3 good embeddings' });
  }

  try {
    const dim = embeddings[0].length;
    if (dim !== 256) {
      return res.status(400).json({ success: false, error: `Expected 256-dim embeddings, got ${dim}` });
    }

    const master = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) master[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) master[i] /= embeddings.length;

    const norm = Math.sqrt(master.reduce((s, v) => s + v * v, 0));
    const normalized = norm > 0 ? master.map(v => v / norm) : master;

    await upsertProfile(userId, {
      userId,
      displayName: displayName || 'Sir',
      voiceprint: normalized,
      isEnrolled: true,
      enrolledAt: new Date().toISOString(),
      failedAttempts: 0,
      isLocked: false,
      lockUntil: null,
    });

    console.log(`[Auth] Enrollment finalized for: ${userId}, samples: ${embeddings.length}`);
    return res.json({
      success: true,
      message: `Voice profile created for ${displayName || 'Sir'}.`,
      dimensions: normalized.length,
      samples_used: embeddings.length,
    });
  } catch (err) {
    console.error('[Auth] finalizeEnrollment error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// ENROLL FACE — save browser face-api.js descriptor
// ════════════════════════════════════════════════════════════
const enrollFace = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';
  const { descriptor, displayName } = req.body;

  if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({ success: false, error: 'Invalid face descriptor (need 128 floats)' });
  }

  try {
    await upsertProfile(userId, {
      userId,
      displayName: displayName || 'Sir',
      faceDescriptor: descriptor,
      faceEnrolled: true,
      isEnrolled: true,
      enrolledAt: new Date().toISOString(),
      failedAttempts: 0,
      isLocked: false,
      lockUntil: null,
    });

    console.log(`[Auth] Face enrolled for: ${userId}`);
    return res.json({ success: true, message: 'Face profile saved.' });
  } catch (err) {
    console.error('[Auth] enrollFace error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET FACE PROFILE — return stored descriptor for client comparison
// ════════════════════════════════════════════════════════════
const getFaceProfile = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';
  try {
    const profile = await findProfile(userId);
    if (!profile || !profile.faceEnrolled) {
      return res.json({ success: false, faceEnrolled: false });
    }
    return res.json({
      success: true,
      faceEnrolled: true,
      descriptor: profile.faceDescriptor,
      displayName: profile.displayName,
    });
  } catch (err) {
    console.error('[Auth] getFaceProfile error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// VERIFY VOICE
// ════════════════════════════════════════════════════════════
const verifyVoice = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';

  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No audio file uploaded' });
  }

  const audioPath = req.file.path;

  try {
    const profile = await findProfile(userId);

    if (!profile || !profile.isEnrolled) {
      fs.unlink(audioPath, () => {});
      return res.status(400).json({ success: false, error: 'Voice profile not found. Please enroll first.' });
    }

    if (profile.isLocked && profile.lockUntil && new Date(profile.lockUntil) > new Date()) {
      fs.unlink(audioPath, () => {});
      return res.json({ success: false, locked: true, lockUntil: profile.lockUntil });
    }

    const voiceprintJson = JSON.stringify(profile.voiceprint);
    let result;
    try {
      result = await runPython(VERIFY_SCRIPT, [audioPath, voiceprintJson], 30000);
    } finally {
      fs.unlink(audioPath, () => {});
    }

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Verification failed' });
    }

    const { match, score } = result;

    if (match || score >= VOICE_THRESHOLD) {
      await upsertProfile(userId, {
        failedAttempts: 0,
        isLocked: false,
        lockUntil: null,
        lastVerified: new Date().toISOString(),
      });
      console.log(`[Auth] ✅ Voice verified: ${userId} (score: ${score})`);
      return res.json({ success: true, match: true, score, displayName: profile.displayName });
    } else {
      const failedAttempts = (profile.failedAttempts || 0) + 1;
      const isLocked = failedAttempts >= MAX_FAILED_ATTEMPTS;
      const lockUntil = isLocked ? new Date(Date.now() + LOCK_DURATION_MS).toISOString() : null;
      await upsertProfile(userId, { failedAttempts, isLocked, lockUntil });
      console.warn(`[Auth] ❌ Verify failed: ${userId} (score: ${score})`);
      return res.json({
        success: false, match: false, score,
        locked: isLocked, lockUntil,
        attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts),
        threshold: VOICE_THRESHOLD,
      });
    }
  } catch (err) {
    fs.unlink(audioPath, () => {});
    console.error('[Auth] verifyVoice error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// RESET LOCK
// ════════════════════════════════════════════════════════════
const resetLock = async (req, res) => {
  try {
    const userId = process.env.AUTH_USER_ID || 'harsh';
    await upsertProfile(userId, { isLocked: false, failedAttempts: 0, lockUntil: null });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// RESET PROFILE
// ════════════════════════════════════════════════════════════
const resetProfile = async (req, res) => {
  try {
    const userId = process.env.AUTH_USER_ID || 'harsh';
    await deleteProfile(userId);
    console.log('[Auth] Profile reset for:', userId);
    return res.json({ success: true, message: 'Profile reset. Please re-enroll.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getStatus, enrollSample, finalizeEnrollment,
  enrollFace, getFaceProfile, verifyVoice,
  resetLock, resetProfile,
};
