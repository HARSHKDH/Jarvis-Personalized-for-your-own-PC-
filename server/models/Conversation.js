const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['user', 'jarvis'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    expertId: {
      type: String,
      default: 'jarvis',
    },
    commandType: {
      type: String,
      enum: ['chat', 'file', 'browser', 'system', 'search'],
      default: 'chat',
    },
    webSearchUsed: {
      type: Boolean,
      default: false,
    },
    executionResult: {
      type: String,
      default: null,
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

// Compound index for fast session history queries
conversationSchema.index({ sessionId: 1, timestamp: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
