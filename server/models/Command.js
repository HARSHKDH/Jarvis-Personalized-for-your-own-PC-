const mongoose = require('mongoose');

const commandSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
    },
    rawCommand: {
      type: String,
      required: true,
    },
    parsedAction: {
      type: String,
      default: 'answer',
    },
    target: {
      type: String,
      default: '',
    },
    success: {
      type: Boolean,
      default: false,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    executionTimeMs: {
      type: Number,
      default: 0,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Index for fast session command queries
commandSchema.index({ sessionId: 1, timestamp: -1 });

module.exports = mongoose.model('Command', commandSchema);
