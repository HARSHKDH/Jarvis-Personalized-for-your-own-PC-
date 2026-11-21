const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');

const { connectDB } = require('./config/db');
const logger = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const { registerSocketEvents } = require('./socket/events');

// Routes
const chatRoute = require('./routes/chat');
const historyRoute = require('./routes/history');
const commandsRoute = require('./routes/commands');
const healthRoute = require('./routes/health');
const authRoute = require('./routes/auth'); // Voice authentication

// ═══════════════════════════════════════════════
// App Setup
// ═══════════════════════════════════════════════
const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const PORT = process.env.PORT || 5000;

const ALLOWED_ORIGINS = [
  CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3456',  // Electron assistant (http static server)
  'http://localhost:3457',  // fallback port
];

// Socket.io
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

// Attach io instance to app
app.set('io', io);

// ═══════════════════════════════════════════════
// Middleware
// ═══════════════════════════════════════════════
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(logger);

const transcribeRoute = require('./routes/transcribe');

// ═══════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════
app.post('/api/chat', chatRoute);
app.use('/api/history', historyRoute);
app.use('/api/commands', commandsRoute);
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/transcribe', transcribeRoute);

// ── Screenshot — direct REST trigger (also works via socket pipeline) ────────
const { exec } = require('child_process');
const pathModule = require('path');

app.post('/api/jarvis/screenshot', (req, res) => {
  // Build the payload JARVIS executor expects
  const payload = JSON.stringify({ action: 'take_screenshot', target: '', details: {} });
  const escapedPayload = payload.replace(/"/g, '\\"');
  const executorPath = pathModule.join(__dirname, '../python/executor.py');

  // Try python, python3, py — same order as executor.js
  const tryPython = (candidates, idx = 0) => {
    if (idx >= candidates.length) {
      return res.json({ success: false, message: 'Python interpreter not found. Ensure Python is installed and in PATH.' });
    }
    const cmd = `${candidates[idx]} "${executorPath}" "${escapedPayload}"`;
    exec(cmd, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error && (error.code === 'ENOENT' || (stderr && stderr.includes('is not recognized')))) {
        return tryPython(candidates, idx + 1); // try next candidate
      }
      if (error) {
        console.error('[Screenshot Route] exec error:', error.message);
        return res.json({ success: false, message: error.message });
      }
      try {
        const jsonMatch = stdout.trim().match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return res.json(result);
        }
        return res.json({ success: false, message: 'Python error: ' + stdout.trim() });
      } catch (parseErr) {
        return res.json({ success: false, message: 'Parse error: ' + stdout.trim() });
      }
    });
  };

  tryPython(['python', 'python3', 'py']);
});

// ── Screenshot Take (for screen analysis — Flask returns file path) ──────────
app.post('/api/jarvis/screenshot/take', async (req, res) => {
  const result = await proxyToPython('/screenshot/take', 'POST', {}, 20000);
  res.status(result.success ? 200 : 500).json(result);
});

// ── Screen Recording — proxy to persistent Python Flask server (port 5001) ──
// The Flask server (python/jarvis_server.py) holds the recording thread alive
// between start and stop calls — something exec() can't do per-call.

const PYTHON_SERVER = 'http://127.0.0.1:5001';

// Helper: forward request to Python Flask server
async function proxyToPython(endpoint, method = 'POST', payload = null, timeoutMs = 10000) {
  try {
    const hasBody = payload !== null && payload !== undefined;
    const resp = await fetch(`${PYTHON_SERVER}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(hasBody ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return await resp.json();
  } catch (err) {
    return { success: false, message: `Python server unreachable: ${err.message}` };
  }
}

app.post('/api/jarvis/record/start', async (req, res) => {
  console.log('[Record] Start request received');
  const result = await proxyToPython('/record/start', 'POST');
  res.json(result);
});

app.post('/api/jarvis/record/stop', async (req, res) => {
  console.log('[Record] Stop request received');
  const result = await proxyToPython('/record/stop', 'POST');
  res.json(result);
});

app.get('/api/jarvis/record/status', async (req, res) => {
  const result = await proxyToPython('/record/status', 'GET');
  res.json(result);
});

app.post('/api/jarvis/open-file', async (req, res) => {
  const filename = (req.body?.filename || '').trim();
  if (!filename) return res.status(400).json({ success: false, message: 'filename is required' });
  const result = await proxyToPython('/open-file', 'POST', { filename });
  res.status(result.success ? 200 : 404).json(result);
});

app.post('/api/jarvis/open-folder', async (req, res) => {
  const foldername = (req.body?.foldername || '').trim();
  if (!foldername) return res.status(400).json({ success: false, message: 'foldername is required' });
  const result = await proxyToPython('/open-folder', 'POST', { foldername });
  res.status(result.success ? 200 : 404).json(result);
});

app.post('/api/jarvis/open-app', async (req, res) => {
  const appname = (req.body?.appname || '').trim();
  if (!appname) return res.status(400).json({ success: false, message: 'appname is required' });
  const result = await proxyToPython('/open-app', 'POST', { appname });
  res.status(result.success ? 200 : 404).json(result);
});

app.post('/api/jarvis/close-app', async (req, res) => {
  const appname = (req.body?.appname || '').trim();
  if (!appname) return res.status(400).json({ success: false, message: 'appname is required' });
  const result = await proxyToPython('/close-app', 'POST', { appname });
  res.status(result.success ? 200 : 404).json(result);
});

app.get('/api/jarvis/running-apps', async (_req, res) => {
  const result = await proxyToPython('/running-apps', 'GET');
  res.status(result.success === false ? 500 : 200).json(result);
});

app.post('/api/jarvis/add-app', async (req, res) => {
  const appname = (req.body?.appname || '').trim();
  const path = (req.body?.path || '').trim();
  if (!appname || !path) return res.status(400).json({ success: false, message: 'appname and path are required' });
  const result = await proxyToPython('/add-app', 'POST', { appname, path });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/browser/search', async (req, res) => {
  const query = (req.body?.query || '').trim();
  const engine = (req.body?.engine || 'google').trim();
  if (!query) return res.status(400).json({ success: false, message: 'query is required' });
  const result = await proxyToPython('/browser/search', 'POST', { query, engine });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/browser/open', async (req, res) => {
  const site = (req.body?.site || '').trim();
  if (!site) return res.status(400).json({ success: false, message: 'site is required' });
  const result = await proxyToPython('/browser/open', 'POST', { site });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/browser/action', async (req, res) => {
  const action = (req.body?.action || '').trim();
  if (!action) return res.status(400).json({ success: false, message: 'action is required' });
  const result = await proxyToPython('/browser/action', 'POST', { action });
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/jarvis/browser/current-url', async (_req, res) => {
  const result = await proxyToPython('/browser/current-url', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/up', async (req, res) => {
  const step = Number(req.body?.step ?? 10);
  const result = await proxyToPython('/volume/up', 'POST', { step });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/down', async (req, res) => {
  const step = Number(req.body?.step ?? 10);
  const result = await proxyToPython('/volume/down', 'POST', { step });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/set', async (req, res) => {
  const level = Number(req.body?.level);
  if (Number.isNaN(level)) return res.status(400).json({ success: false, message: 'level is required' });
  const result = await proxyToPython('/volume/set', 'POST', { level });
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/mute', async (_req, res) => {
  const result = await proxyToPython('/volume/mute', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/unmute', async (_req, res) => {
  const result = await proxyToPython('/volume/unmute', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/volume/toggle-mute', async (_req, res) => {
  const result = await proxyToPython('/volume/toggle-mute', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/jarvis/volume/current', async (_req, res) => {
  const result = await proxyToPython('/volume/current', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});


// ── WhatsApp control (proxy to Flask) ──────────────────────────────
// WhatsApp Web needs 15-20s to load, so these use a longer timeout.
const WHATSAPP_TIMEOUT_MS = 90000;

app.post('/api/jarvis/whatsapp/message', async (req, res) => {
  const { contact, message } = req.body || {};
  const result = await proxyToPython('/whatsapp/message', 'POST', { contact, message }, WHATSAPP_TIMEOUT_MS);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/whatsapp/file', async (req, res) => {
  const { contact, filename, caption } = req.body || {};
  const result = await proxyToPython('/whatsapp/file', 'POST', { contact, filename, caption }, WHATSAPP_TIMEOUT_MS);
  res.status(result.success ? 200 : 400).json(result);
});

app.post('/api/jarvis/whatsapp/add-contact', async (req, res) => {
  const { name, phone } = req.body || {};
  const result = await proxyToPython('/whatsapp/add-contact', 'POST', { name, phone });
  res.status(result.success ? 200 : 400).json(result);
});

app.get('/api/jarvis/whatsapp/contacts', async (_req, res) => {
  const result = await proxyToPython('/whatsapp/contacts', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});


// ── System control (proxy to Flask) ────────────────────────────────
app.post('/api/jarvis/system/lock', async (_req, res) => {
  const result = await proxyToPython('/system/lock', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/sleep', async (_req, res) => {
  const result = await proxyToPython('/system/sleep', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/shutdown', async (req, res) => {
  const minutes = Number(req.body?.minutes ?? 0);
  const result = await proxyToPython('/system/shutdown', 'POST', { minutes });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/cancel-shutdown', async (_req, res) => {
  const result = await proxyToPython('/system/cancel-shutdown', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/restart', async (req, res) => {
  const minutes = Number(req.body?.minutes ?? 0);
  const result = await proxyToPython('/system/restart', 'POST', { minutes });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/logoff', async (_req, res) => {
  const result = await proxyToPython('/system/logoff', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/battery', async (_req, res) => {
  const result = await proxyToPython('/system/battery', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/ram', async (_req, res) => {
  const result = await proxyToPython('/system/ram', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/cpu', async (_req, res) => {
  const result = await proxyToPython('/system/cpu', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/disk', async (_req, res) => {
  const result = await proxyToPython('/system/disk', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/ip', async (_req, res) => {
  const result = await proxyToPython('/system/ip', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/info', async (_req, res) => {
  const result = await proxyToPython('/system/info', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/brightness/set', async (req, res) => {
  const level = Number(req.body?.level);
  const result = await proxyToPython('/system/brightness/set', 'POST', { level });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/brightness/up', async (req, res) => {
  const step = Number(req.body?.step ?? 10);
  const result = await proxyToPython('/system/brightness/up', 'POST', { step });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/system/brightness/down', async (req, res) => {
  const step = Number(req.body?.step ?? 10);
  const result = await proxyToPython('/system/brightness/down', 'POST', { step });
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/system/brightness/current', async (_req, res) => {
  const result = await proxyToPython('/system/brightness/current', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});

// ── Confirmation (REST) — executes/clears a pending dangerous action ─
const pendingActions = require('./controllers/pendingActions');
app.post('/api/jarvis/confirm', async (req, res) => {
  const sessionId = req.body?.sessionId || 'default';
  const pending = pendingActions.get(sessionId);
  if (!pending) {
    return res.status(400).json({ success: false, message: 'No pending action to confirm' });
  }
  pendingActions.clear(sessionId);
  const { executeOsCommand } = require('./controllers/executor');
  const result = await executeOsCommand(pending.action, pending.target || '', pending.details || {}, sessionId, pending.rawCommand || pending.action);
  res.status(result.success ? 200 : 400).json({ ...result, action: pending.action });
});
app.post('/api/jarvis/cancel', (req, res) => {
  const sessionId = req.body?.sessionId || 'default';
  pendingActions.clear(sessionId);
  res.json({ success: true, message: 'Action cancelled' });
});

// ── Clipboard control (proxies to Flask 5001) ───────────────────────
app.get('/api/jarvis/clipboard/read', async (_req, res) => {
  const result = await proxyToPython('/clipboard/read', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/copy', async (req, res) => {
  const result = await proxyToPython('/clipboard/copy', 'POST', { text: req.body?.text });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/simulate-copy', async (_req, res) => {
  const result = await proxyToPython('/clipboard/simulate-copy', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/simulate-paste', async (_req, res) => {
  const result = await proxyToPython('/clipboard/simulate-paste', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/simulate-cut', async (_req, res) => {
  const result = await proxyToPython('/clipboard/simulate-cut', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/select-all', async (_req, res) => {
  const result = await proxyToPython('/clipboard/select-all', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/undo', async (_req, res) => {
  const result = await proxyToPython('/clipboard/undo', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/redo', async (_req, res) => {
  const result = await proxyToPython('/clipboard/redo', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/clipboard/history', async (_req, res) => {
  const result = await proxyToPython('/clipboard/history', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/paste-history', async (req, res) => {
  const result = await proxyToPython('/clipboard/paste-history', 'POST', { index: req.body?.index });
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/clear', async (_req, res) => {
  const result = await proxyToPython('/clipboard/clear', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/clipboard/clear-history', async (_req, res) => {
  const result = await proxyToPython('/clipboard/clear-history', 'POST');
  res.status(result.success ? 200 : 400).json(result);
});


// ── Date/Time + Reminders (proxies to Flask 5001) ───────────────────
app.get('/api/jarvis/system/datetime', async (_req, res) => {
  const result = await proxyToPython('/system/datetime', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/reminders/add', async (req, res) => {
  const result = await proxyToPython('/reminders/add', 'POST', {
    text: req.body?.text,
    time: req.body?.time,
    date: req.body?.date,
  });
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/reminders/list', async (_req, res) => {
  const result = await proxyToPython('/reminders/list', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});
app.post('/api/jarvis/reminders/cancel', async (req, res) => {
  const result = await proxyToPython('/reminders/cancel', 'POST', {
    time: req.body?.time,
    id: req.body?.id,
  });
  res.status(result.success ? 200 : 400).json(result);
});
app.get('/api/jarvis/reminders/check', async (_req, res) => {
  const result = await proxyToPython('/reminders/check', 'GET');
  res.status(result.success ? 200 : 400).json(result);
});


// ── Root status page (stops browser 404 on localhost:5000) ──────────
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>J.A.R.V.I.S. Neural Server</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#020c1b;color:#00d4ff;font-family:'Courier New',monospace;
         display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px}
    .logo{font-size:2rem;letter-spacing:.3em;color:#00d4ff;text-shadow:0 0 20px #00d4ff}
    .tag{font-size:.75rem;letter-spacing:.2em;color:rgba(0,212,255,.5)}
    .status{display:flex;align-items:center;gap:8px;margin-top:8px}
    .dot{width:10px;height:10px;border-radius:50%;background:#34d399;box-shadow:0 0 10px #34d399;animation:pulse 1.5s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
    .info{font-size:.7rem;color:rgba(0,212,255,.4);margin-top:4px}
    a{color:#00d4ff;opacity:.6;text-decoration:none;font-size:.7rem}
    a:hover{opacity:1}
  </style>
</head>
<body>
  <div class="logo">J.A.R.V.I.S.</div>
  <div class="tag">NEURAL SERVER · ONLINE</div>
  <div class="status"><div class="dot"></div><span style="font-size:.8rem">All systems nominal</span></div>
  <div class="info">Port ${PORT} &nbsp;|&nbsp; ${new Date().toUTCString()}</div>
  <br/>
  <a href="/api/health">→ Health Check</a>
</body>
</html>`);
});

// ── Favicon (stops browser 404 on /favicon.ico) ─────────────────────
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler (must be last)
app.use(errorHandler);

// ═══════════════════════════════════════════════
// Socket.io Events
// ═══════════════════════════════════════════════
registerSocketEvents(io);

// ═══════════════════════════════════════════════
// Reminder checker — polls Flask every 60s, emits to overlay when due
// ═══════════════════════════════════════════════
const REMINDER_POLL_MS = 60000;
setInterval(async () => {
  try {
    const data = await proxyToPython('/reminders/check', 'GET', null, 8000);
    if (data && data.triggered && Array.isArray(data.reminders)) {
      data.reminders.forEach((rem) => {
        io.emit('jarvis:reminder', {
          text: rem.text,
          time: rem.time,
          id: rem.id,
          speak: `Reminder, Harsh: ${rem.text}`,
        });
      });
    }
  } catch (err) {
    // Flask may be offline — stay quiet, retry next cycle
  }
}, REMINDER_POLL_MS);

// ═══════════════════════════════════════════════
// Database + Start
// ═══════════════════════════════════════════════
const start = async () => {
  // Start HTTP server IMMEDIATELY (don't block on DB)
  server.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║    J.A.R.V.I.S. Server v5.0.0       ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Server  : http://localhost:${PORT}     ║`);
    console.log(`║  Client  : ${CLIENT_URL}  ║`);
    console.log(`║  Mode    : ${(process.env.NODE_ENV || 'development').padEnd(26)}║`);
    console.log('╚══════════════════════════════════════╝\n');
  });

  // Connect to MongoDB in background (non-blocking)
  // Auth will use local JSON store if Mongo is unavailable
  connectDB().catch((err) => {
    console.warn('[Server] MongoDB unavailable — using local file store for auth:', err.message);
  });
};

start().catch((err) => {
  console.error('[Server] Fatal error:', err.message);
  process.exit(1);
});

// ═══════════════════════════════════════════════
// Graceful Shutdown
// ═══════════════════════════════════════════════
const shutdown = (signal) => {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    const mongoose = require('mongoose');
    mongoose.connection.close(false, () => {
      console.log('[MongoDB] Connection closed');
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection:', reason);
});
