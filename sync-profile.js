/**
 * sync-profile.js
 * Run ONCE after whitelisting your IP in MongoDB Atlas.
 * Pulls your existing face profile from Atlas and saves it to local data/profile.json
 * After this, JARVIS works offline — no MongoDB needed for auth.
 *
 * Usage (from JARVIS folder):  node sync-profile.js
 */

const path = require('path');

// Use server's node_modules since this script lives in the root
const serverModules = path.join(__dirname, 'server', 'node_modules');
require(path.join(serverModules, 'dotenv')).config({ path: path.join(__dirname, 'server/.env') });
const mongoose = require(path.join(serverModules, 'mongoose'));
const fs = require('fs');

const LOCAL_PATH = path.join(__dirname, 'data/profile.json');

async function sync() {
  console.log('\n[Sync] Connecting to MongoDB Atlas...');

  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('[Sync] No MONGODB_URI in .env'); process.exit(1); }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      family: 4,
      tls: true,
      tlsAllowInvalidCertificates: true,
    });
    console.log('[Sync] ✅ Connected to Atlas:', mongoose.connection.host);
  } catch (e) {
    console.error('[Sync] ❌ Could not connect:', e.message);
    console.error('\n  👉 Make sure your IP is whitelisted in Atlas:');
    console.error('     https://cloud.mongodb.com → Security → Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)');
    process.exit(1);
  }

  // Load schema
  const VoiceProfile = require('./server/models/VoiceProfile');
  const userId = process.env.AUTH_USER_ID || 'harsh';

  const profile = await VoiceProfile.findOne({ userId }).lean();
  if (!profile) {
    console.log('[Sync] No profile found in Atlas for userId:', userId);
    console.log('[Sync] You will need to enroll at http://localhost:5173');
    process.exit(0);
  }

  // Save to local store
  const dir = path.dirname(LOCAL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let existing = {};
  if (fs.existsSync(LOCAL_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch {}
  }

  existing[userId] = {
    userId:          profile.userId,
    displayName:     profile.displayName,
    voiceprint:      profile.voiceprint,
    faceDescriptor:  profile.faceDescriptor,
    faceEnrolled:    profile.faceEnrolled,
    isEnrolled:      profile.isEnrolled,
    enrolledAt:      profile.enrolledAt,
    failedAttempts:  0,
    isLocked:        false,
    lockUntil:       null,
    syncedFromAtlas: new Date().toISOString(),
  };

  fs.writeFileSync(LOCAL_PATH, JSON.stringify(existing, null, 2));

  console.log('\n[Sync] ✅ Profile synced successfully!');
  console.log(`  User       : ${profile.displayName} (${userId})`);
  console.log(`  Face       : ${profile.faceEnrolled ? '✅ enrolled' : '❌ not enrolled'}`);
  console.log(`  Voice      : ${profile.isEnrolled ? '✅ enrolled' : '❌ not enrolled'}`);
  console.log(`  Saved to   : ${LOCAL_PATH}`);
  console.log('\n  JARVIS will now authenticate you without needing MongoDB. ✅\n');

  await mongoose.disconnect();
}

sync().catch(e => { console.error(e); process.exit(1); });
