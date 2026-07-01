const Conversation = require('../models/Conversation');
const Session = require('../models/Session');

const getHistory = async (sessionId, limit = 50, skip = 0) => {
  try {
    const messages = await Conversation.find({ sessionId })
      .sort({ timestamp: 1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const session = await Session.findOne({ sessionId }).lean();
    const total = await Conversation.countDocuments({ sessionId });

    return {
      messages,
      session: session || { sessionId, totalCommands: 0 },
      total,
      page: { skip: parseInt(skip), limit: parseInt(limit) },
    };
  } catch (err) {
    console.error('[HistoryController] Error:', err.message);
    throw err;
  }
};

module.exports = { getHistory };
