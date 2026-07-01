const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const VoiceProfile = require('../models/VoiceProfile');

const ENROLL_SAMPLE_SCRIPT = path.join(__dirname, '../../python/enroll_sample.py');
const VERIFY_SCRIPT = path.join(__dirname, '../../python/verify.py');
const LOCK_DURATION_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;  // More forgiving attempt limit
const VOICE_THRESHOLD = 0.40;   // Calibrated for browser AudioContext → resemblyzer pipeline

// ─── Helper: run Python and return parsed JSON output ─────────────────────────
const runPython = (scriptPath, args = [], timeoutMs = 60000, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const lines = [];
    const errLines = [];

    const child = spawn('python', [scriptPath, ...args], { windowsHide: true });

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
            try { onProgress(JSON.parse(trimmed)); } catch (e) { /* ignore */ }
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
    const profile = await VoiceProfile.findOne({ userId }).lean();

    if (!profile) return res.json({ isEnrolled: false, faceEnrolled: false, userId });

    const isCurrentlyLocked =
      profile.isLocked && profile.lockUntil && new Date(profile.lockUntil) > new Date();

    return res.json({
      isEnrolled: profile.isEnrolled,
      faceEnrolled: profile.faceEnrolled || false,
      isLocked: isCurrentlyLocked,
      lockUntil: profile.lockUntil,
      displayName: profile.displayName,
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

    // Always clean up the temp file
    fs.unlink(audioPath, () => {});

    if (!result.success) {
      return res.json({
        success: false,
        error: result.error || 'Sample processing failed',
        quality: 'poor',
      });
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

    // Average all embeddings into master voiceprint
    const master = new Array(dim).fill(0);
    for (const emb of embeddings) {
      for (let i = 0; i < dim; i++) master[i] += emb[i];
    }
    for (let i = 0; i < dim; i++) master[i] /= embeddings.length;

    // L2 normalize
    const norm = Math.sqrt(master.reduce((s, v) => s + v * v, 0));
    const normalized = norm > 0 ? master.map(v => v / norm) : master;

    await VoiceProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          displayName: displayName || 'Sir',
          voiceprint: normalized,
          isEnrolled: true,
          enrolledAt: new Date(),
          failedAttempts: 0,
          isLocked: false,
          lockUntil: null,
        },
      },
      { upsert: true, new: true }
    );

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
// ENROLL FACE — save browser face-api.js descriptor to DB
// ════════════════════════════════════════════════════════════
const enrollFace = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';
  const { descriptor, displayName } = req.body;

  if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
    return res.status(400).json({ success: false, error: 'Invalid face descriptor (need 128 floats)' });
  }

  try {
    await VoiceProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId, displayName: displayName || 'Sir',
          faceDescriptor: descriptor,
          faceEnrolled: true,
          isEnrolled: true,       // face enrollment counts as enrolled
          enrolledAt: new Date(),
          failedAttempts: 0,
          isLocked: false,
          lockUntil: null,
        },
      },
      { upsert: true, new: true }
    );

    console.log(`[Auth] Face enrolled for: ${userId}`);
    return res.json({ success: true, message: 'Face profile saved.' });
  } catch (err) {
    console.error('[Auth] enrollFace error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
};

// ════════════════════════════════════════════════════════════
// GET FACE PROFILE — return stored descriptor for client-side comparison
// ════════════════════════════════════════════════════════════
const getFaceProfile = async (req, res) => {
  const userId = process.env.AUTH_USER_ID || 'harsh';
  try {
    const profile = await VoiceProfile.findOne({ userId }).lean();
    if (!profile || !profile.faceEnrolled) {
      return res.json({ success: false, faceEnrolled: false });
    }
    return res.json({
      success: true, faceEnrolled: true,
      descriptor: profile.faceDescriptor,
      displayName: profile.displayName,
    });
  } catch (err) {
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
    const profile = await VoiceProfile.findOne({ userId });

    if (!profile || !profile.isEnrolled) {
      fs.unlink(audioPath, () => {});
      return res.status(400).json({ success: false, error: 'Voice profile not found. Please enroll first.' });
    }

    if (profile.isLocked && profile.lockUntil && profile.lockUntil > new Date()) {
      fs.unlink(audioPath, () => {});
      return res.json({ success: false, locked: true, lockUntil: profile.lockUntil });
    }

    if (profile.isLocked && profile.lockUntil && profile.lockUntil <= new Date()) {
      profile.isLocked = false;
      profile.failedAttempts = 0;
      profile.lockUntil = null;
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
    profile.accessLog.push({ timestamp: new Date(), success: match, score });

    if (match || score >= VOICE_THRESHOLD) {
      profile.failedAttempts = 0;
      profile.isLocked = false;
      profile.lockUntil = null;
      profile.lastVerified = new Date();
      await profile.save();
      console.log(`[Auth] ✅ Voice verified: ${userId} (score: ${score})`);
      return res.json({ success: true, match: true, score, displayName: profile.displayName });
    } else {
      profile.failedAttempts += 1;
      const attemptsLeft = MAX_FAILED_ATTEMPTS - profile.failedAttempts;
      if (profile.failedAttempts >= MAX_FAILED_ATTEMPTS) {
        profile.isLocked = true;
        profile.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await profile.save();
      console.warn(`[Auth] ❌ Verify failed: ${userId} (score: ${score}, threshold: ${VOICE_THRESHOLD})`);
      return res.json({
        success: false, match: false, score,
        locked: profile.isLocked, lockUntil: profile.lockUntil,
        attemptsLeft: Math.max(0, attemptsLeft),
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
    await VoiceProfile.findOneAndUpdate({ userId }, { $set: { isLocked: false, failedAttempts: 0, lockUntil: null } });
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
    await VoiceProfile.deleteOne({ userId });
    console.log('[Auth] Voice profile reset for:', userId);
    return res.json({ success: true, message: 'Profile reset. Please re-enroll.' });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { getStatus, enrollSample, finalizeEnrollment, enrollFace, getFaceProfile, verifyVoice, resetLock, resetProfile };
