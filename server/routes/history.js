const express = require('express');
const router = express.Router();
const { getHistory } = require('../controllers/history');

/**
 * GET /api/history/:sessionId
 * Returns paginated conversation history + session metadata
 */
router.get('/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    const data = await getHistory(sessionId, limit, skip);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
