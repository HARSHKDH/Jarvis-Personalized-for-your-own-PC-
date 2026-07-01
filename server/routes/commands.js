const express = require('express');
const router = express.Router();
const Command = require('../models/Command');

/**
 * GET /api/commands/:sessionId
 * Returns command execution log with success/failure stats
 */
router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const commands = await Command.find({ sessionId })
      .sort({ timestamp: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const total = await Command.countDocuments({ sessionId });
    const successful = await Command.countDocuments({ sessionId, success: true });
    const failed = await Command.countDocuments({ sessionId, success: false });

    res.json({
      success: true,
      commands,
      stats: {
        total,
        successful,
        failed,
        successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
