const { processCommand } = require('../controllers/brain');

/**
 * POST /api/chat
 * REST fallback if socket connection fails
 */
const chatHandler = async (req, res, next) => {
  try {
    const { message, sessionId, expertId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'message and sessionId are required' });
    }

    const result = await processCommand(message, sessionId, expertId || 'jarvis');

    return res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = chatHandler;
