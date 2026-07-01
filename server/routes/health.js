const express = require('express');
const router = express.Router();
const { getConnectionStatus } = require('../config/db');

/**
 * GET /api/health
 * Server health check with all service statuses
 */
router.get('/', (req, res) => {
  const mongoStatus = getConnectionStatus();

  res.json({
    server: 'ok',
    mongodb: mongoStatus,
    gemini: process.env.GEMINI_API_KEY ? 'configured' : 'missing',
    anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: '5.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

module.exports = router;
