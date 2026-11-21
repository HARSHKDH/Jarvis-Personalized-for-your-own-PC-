// ─────────────────────────────────────────────────────────────────────────────
// Pending confirmation store — shared by socket (events.js) and REST (index.js).
// Keyed by sessionId. Dangerous actions (shutdown/restart/logoff) are staged here
// until the user confirms via voice ("yes"/"confirm") or clicks the Yes button.
// Entries auto-expire so a stale pending action never fires later.
// ─────────────────────────────────────────────────────────────────────────────

const PENDING_TTL_MS = 30000; // safety expiry (UI countdown is shorter, 10s)

const store = new Map();

function set(sessionId, pending) {
  if (!sessionId) return;
  const existing = store.get(sessionId);
  if (existing && existing.timer) clearTimeout(existing.timer);
  const timer = setTimeout(() => store.delete(sessionId), PENDING_TTL_MS);
  if (timer.unref) timer.unref();
  store.set(sessionId, { ...pending, timer });
}

function get(sessionId) {
  const entry = store.get(sessionId);
  if (!entry) return null;
  const { timer, ...data } = entry;
  return data;
}

function clear(sessionId) {
  const entry = store.get(sessionId);
  if (entry && entry.timer) clearTimeout(entry.timer);
  store.delete(sessionId);
}

module.exports = { set, get, clear };
