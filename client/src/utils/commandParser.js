/**
 * commandParser.js
 * Pre-parse voice/text commands to extract intent before sending to backend
 */

const BROWSER_PATTERNS = [
  /^(open|launch|go to|navigate to)\s+(https?:\/\/\S+)/i,
  /^(open|go to)\s+(\w+\.(com|org|net|io|dev|ai))/i,
];

const APP_PATTERNS = [
  /^(open|launch|start|run)\s+(.+)/i,
];

const SEARCH_PATTERNS = [
  /^(search|google|look up|find)\s+(.+)/i,
  /^(what is|who is|how|why|when|where|define)\s+(.+)/i,
];

const YOUTUBE_PATTERNS = [
  /^(play|watch|find on youtube|youtube)\s+(.+)/i,
  /^(search youtube for)\s+(.+)/i,
];

const SCREENSHOT_PATTERNS = [
  /^(take|capture|get|grab)\s+(a\s+)?(screenshot|screen shot|screen capture)/i,
];

const SYSTEM_PATTERNS = [
  /^(shutdown|restart|reboot|sleep|lock|hibernate)\s*(the\s+)?(pc|computer|system|laptop)?/i,
];

const VOLUME_PATTERNS = [
  /^(volume\s+)(up|down|mute|increase|decrease)/i,
  /^(mute|unmute)\s*(the\s+)?(volume|sound|audio)?/i,
  /^(turn\s+)(up|down)\s+(the\s+)?(volume|sound)/i,
];

/**
 * Quick pre-parse to identify command type for optimistic UI feedback
 * Full parsing is done by Claude on the backend
 */
export const parseCommandHint = (input) => {
  const trimmed = input.trim().toLowerCase();

  if (SCREENSHOT_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'system', hint: 'Taking screenshot...' };
  }

  if (SYSTEM_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'system', hint: 'Executing system command...' };
  }

  if (VOLUME_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'system', hint: 'Adjusting volume...' };
  }

  if (YOUTUBE_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'browser', hint: 'Opening YouTube...' };
  }

  if (BROWSER_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'browser', hint: 'Opening browser...' };
  }

  if (APP_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'app', hint: 'Launching application...' };
  }

  if (SEARCH_PATTERNS.some(p => p.test(trimmed))) {
    return { type: 'search', hint: 'Searching...' };
  }

  return { type: 'chat', hint: 'Processing...' };
};

/**
 * Clean up voice transcript artifacts
 */
export const cleanTranscript = (text) => {
  return text
    .replace(/\b(um|uh|er|ah|hmm|like)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
};
