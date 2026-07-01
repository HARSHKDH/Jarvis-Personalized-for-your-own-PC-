const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    expertId: {
      type: String,
      default: 'jarvis',
    },
    totalCommands: {
      type: Number,
      default: 0,
    },
    firstSeen: {
      type: Date,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Note: unique: true on the field handles the index automatically

module.exports = mongoose.model('Session', sessionSchema);
