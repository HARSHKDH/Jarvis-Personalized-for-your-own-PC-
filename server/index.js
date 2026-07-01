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
// Database + Start
// ═══════════════════════════════════════════════
const start = async () => {
  await connectDB();

  server.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════╗');
    console.log('║    J.A.R.V.I.S. Server v5.0.0       ║');
    console.log('╠══════════════════════════════════════╣');
    console.log(`║  Server  : http://localhost:${PORT}     ║`);
    console.log(`║  Client  : ${CLIENT_URL}  ║`);
    console.log(`║  Mode    : ${(process.env.NODE_ENV || 'development').padEnd(26)}║`);
    console.log('╚══════════════════════════════════════╝\n');
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
