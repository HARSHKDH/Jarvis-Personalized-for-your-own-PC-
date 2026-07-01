const express = require('express');
const router = express.Router();
const multer = require('multer');
const os = require('os');

const {
  getStatus,
  enrollSample,
  finalizeEnrollment,
  enrollFace,
  getFaceProfile,
  verifyVoice,
  resetLock,
  resetProfile,
} = require('../controllers/authController');

// ── Multer: save audio uploads to OS temp dir ──────────────────────────────
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/') || file.originalname.endsWith('.wav')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files accepted'), false);
    }
  },
});

// Auth status + enrollment state
router.get('/status', getStatus);

// Voice enrollment (browser WAV → embedding → quality)
router.post('/enroll-sample', upload.single('audio'), enrollSample);

// Finalize voice enrollment (averaged embeddings → voiceprint)
router.post('/finalize-enrollment', finalizeEnrollment);

// Face enrollment (browser face-api.js descriptor → DB)
router.post('/enroll-face', enrollFace);

// Get face profile descriptor for client-side comparison
router.get('/face-profile', getFaceProfile);

// Voice verification
router.post('/verify', upload.single('audio'), verifyVoice);

// Admin reset
router.post('/reset-lock', resetLock);
router.post('/reset-profile', resetProfile);

module.exports = router;
