const mongoose = require('mongoose');

const accessLogEntrySchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    success: { type: Boolean, required: true },
    score: { type: Number, default: 0 },
  },
  { _id: false }
);

const voiceProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    displayName: {
      type: String,
      default: 'Sir',
    },
    voiceprint: {
      type: [Number],
      default: [],
      validate: {
        validator: (v) => v.length === 0 || v.length === 256,
        message: 'Voiceprint must be a 256-dimensional vector',
      },
    },
    faceDescriptor: {
      type: [Number],   // 128-dim face-api.js descriptor
      default: [],
    },
    faceEnrolled: {
      type: Boolean,
      default: false,
    },
    isEnrolled: {
      type: Boolean,
      default: false,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    lockUntil: {
      type: Date,
      default: null,
    },
    similarityThreshold: {
      type: Number,
      default: 0.50,  // lowered for browser mic audio
    },
    enrolledAt: {
      type: Date,
      default: null,
    },
    lastVerified: {
      type: Date,
      default: null,
    },
    accessLog: {
      type: [accessLogEntrySchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Keep access log trimmed to last 100 entries
voiceProfileSchema.pre('save', function (next) {
  if (this.accessLog.length > 100) {
    this.accessLog = this.accessLog.slice(-100);
  }
  next();
});

module.exports = mongoose.model('VoiceProfile', voiceProfileSchema);
