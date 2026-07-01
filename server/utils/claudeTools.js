/**
 * aiTools.js  (was claudeTools.js)
 *
 * ACTIVE (Gemini):  Google Search grounding is configured directly in brain.js
 *                   via model.getGenerativeModel({ tools: [{ google_search: {} }] })
 *                   This file is kept for backward compatibility.
 *
 * STANDBY (Claude): webSearchTool was used with Anthropic's web_search_20250305 type.
 *                   Restore when switching back.
 */

// Legacy export — no longer used by Gemini path but kept to avoid import errors
const webSearchTool = {
  type: 'web_search_20250305',
  name: 'web_search',
};

module.exports = { webSearchTool };
