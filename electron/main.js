const {
  app, BrowserWindow, Tray, Menu, screen,
  ipcMain, nativeImage, shell, session, globalShortcut,
} = require('electron');
const path  = require('path');
const http  = require('http');
const fs    = require('fs');
const { spawn } = require('child_process');

// ── Root of the JARVIS project (one level above /electron) ───────────────────
const PROJECT_ROOT = path.join(__dirname, '..');

// ── Single instance guard ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Speech recognition & microphone flags ─────────────────────────────────────
app.commandLine.appendSwitch('enable-speech-input');
app.commandLine.appendSwitch('enable-features', 'SpeechRecognition,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
// Allow microphone access without OS-level permission dialogs in Electron.
// The permission handler below grants all requests programmatically.
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
// Ensure the AudioContext starts even without user gesture (Electron-specific)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-START: Spawn the Node server + Vite client if they aren't already up.
// This means you only need to launch Electron — it starts everything.
// ─────────────────────────────────────────────────────────────────────────────
let serverProc = null;
let clientProc = null;

/**
 * Check if a TCP port is already in use.
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      res.destroy();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

/**
 * Wait until a port starts responding (up to maxWaitMs).
 */
function waitForPort(port, maxWaitMs = 30000, intervalMs = 500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      if (await isPortInUse(port)) return resolve(true);
      if (Date.now() - start > maxWaitMs) return resolve(false);
      setTimeout(check, intervalMs);
    };
    check();
  });
}

/**
 * Spawn a process. Logs its stdout/stderr with a prefix.
 */
function spawnProcess(name, cmd, args, cwd) {
  console.log(`[${name}] Spawning: ${cmd} ${args.join(' ')} in ${cwd}`);
  const proc = spawn(cmd, args, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout?.on('data', (d) => {
    d.toString().trim().split('\n').forEach(line => {
      if (line) console.log(`[${name}] ${line}`);
    });
  });
  proc.stderr?.on('data', (d) => {
    d.toString().trim().split('\n').forEach(line => {
      if (line) console.log(`[${name}:ERR] ${line}`);
    });
  });
  proc.on('exit', (code) => console.log(`[${name}] Exited with code`, code));
  return proc;
}

async function startBackendServices() {
  // ── 1. Node server (port 5000) ───────────────────────────────────────────
  const serverRunning = await isPortInUse(5000);
  if (serverRunning) {
    console.log('[Server] Already running on port 5000 — skipping spawn.');
  } else {
    console.log('[Server] Starting on port 5000...');
    serverProc = spawnProcess('Server', 'node', ['index.js'], path.join(PROJECT_ROOT, 'server'));
    const serverUp = await waitForPort(5000, 20000);
    if (serverUp) {
      console.log('[Server] ✅ Ready on port 5000');
    } else {
      console.warn('[Server] ⚠ Timed out waiting for port 5000 — continuing anyway');
    }
  }

  // ── 2. Vite client (port 5173) ───────────────────────────────────────────
  const clientRunning = await isPortInUse(5173);
  if (clientRunning) {
    console.log('[Client] Already running on port 5173 — skipping spawn.');
  } else {
    console.log('[Client] Starting Vite on port 5173...');
    clientProc = spawnProcess('Client', 'npm', ['run', 'dev'], path.join(PROJECT_ROOT, 'client'));
    const clientUp = await waitForPort(5173, 45000);
    if (clientUp) {
      console.log('[Client] ✅ Ready on port 5173');
    } else {
      console.warn('[Client] ⚠ Timed out waiting for port 5173 — continuing anyway');
    }
  }
}

// ── Built-in HTTP server — serves assistant.html on localhost:3456 ─────────
// REASON: Web Speech API is BLOCKED on file:// — http://localhost IS a secure context.
const ASSISTANT_PORT = 3456;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

let httpServer = null;

function startStaticServer() {
  httpServer = http.createServer((req, res) => {
    const urlPath  = req.url.split('?')[0];
    const filePath = path.join(__dirname, urlPath === '/' ? 'assistant.html' : urlPath);
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  httpServer.listen(ASSISTANT_PORT, '127.0.0.1', () => {
    console.log(`[JARVIS] Assistant serving on http://localhost:${ASSISTANT_PORT}`);
  });
}

let win        = null;
let tray       = null;
let isQuitting = false;

const STATES = {
  scanning: { w: 1,   h: 1   },
  greeting: { w: 340, h: 145 },
  mini:     { w: 200, h: 50  },
  locked:   { w: 170, h: 50  },
  chat:     { w: 370, h: 480 },
};

function bottomRight(w, h) {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return { x: width - w - 20, y: height - h - 20 };
}

function makeTrayIcon() {
  try {
    const buf = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAJBJREFU' +
      'OI3Nkj0KwkAQhb+NIiKI4AEEwcJKsNXGK3iAXMBb2HqFdJ7BwivYiYiglY2IiGDjJ8SYbHaz' +
      'ycLCP+jAY97MezNvFv5VSqkGnEopq8gDwDUAqGoDQFV1B4CZlVJKOecOAEkAkCSAGoBVVe8A' +
      'pqoqAHjv3QHQ930PwBjTAhjGGHvv3RFCeANSSiEAdwAAAABJRU5ErkJggg==',
      'base64'
    );
    const img = nativeImage.createFromBuffer(buf);
    return img.isEmpty() ? nativeImage.createEmpty() : img;
  } catch {
    return nativeImage.createEmpty();
  }
}

// ── Main floating window ───────────────────────────────────────────────────────
function createWindow() {
  const pos = bottomRight(200, 50);

  win = new BrowserWindow({
    width: 1, height: 1,
    x: pos.x, y: pos.y,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow:   false,
    resizable:   false,
    show:        true,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  // 'screen-saver' level ensures the overlay appears above ALL windows —
  // including full-screen apps, the taskbar, and system overlays.
  // Without this level, alwaysOnTop only beats normal app windows.
  win.setAlwaysOnTop(true, 'screen-saver');

  // Grant ALL permissions (camera, mic, speech)
  win.webContents.session.setPermissionRequestHandler((_wc, perm, cb) => {
    console.log('[Permission]', perm, '→ GRANTED');
    cb(true);
  });
  win.webContents.session.setPermissionCheckHandler(() => true);

  // Load via http://localhost (secure context → Web Speech API works!)
  win.loadURL(`http://localhost:${ASSISTANT_PORT}/assistant.html`);
  win.setIgnoreMouseEvents(true, { forward: true });

  win.webContents.on('did-finish-load', () => {
    console.log('[JARVIS] Renderer loaded — http://localhost secure context active');
  });

  win.webContents.on('console-message', (_e, level, msg) => {
    const prefix = level === 3 ? '[Renderer:ERR]' : level === 2 ? '[Renderer:WARN]' : '[Renderer]';
    console.log(prefix, msg);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── System tray ───────────────────────────────────────────────────────────────
function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('J.A.R.V.I.S.  (Ctrl+Shift+Space to activate)');

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '⬡  J.A.R.V.I.S. — System Assistant', enabled: false },
    { type: 'separator' },
    { label: '💬  Open JARVIS HUD (browser)',  click: () => shell.openExternal('http://localhost:5173') },
    { label: '🔄  Re-authenticate',            click: () => win?.webContents.send('cmd:reauth') },
    { label: '🎙  Test microphone',            click: () => win?.webContents.send('cmd:test-mic') },
    { type: 'separator' },
    { label: '❌  Quit JARVIS', click: () => { isQuitting = true; app.quit(); } },
  ]));

  tray.on('click', () => win?.webContents.send('cmd:tray-click'));
}

// ── IPC: resize window ────────────────────────────────────────────────────────
ipcMain.on('set-state', (_e, state) => {
  if (!win) return;
  const dims = STATES[state];
  if (!dims) return;

  if (dims.w <= 1) {
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setBounds({ width: 1, height: 1, ...bottomRight(1, 1) });
    return;
  }
  const { x, y } = bottomRight(dims.w, dims.h);
  win.setIgnoreMouseEvents(false);
  win.setBounds({ x, y, width: dims.w, height: dims.h });
  // Re-assert screen-saver level after resize — setBounds can reset z-order on Windows
  win.setAlwaysOnTop(true, 'screen-saver');
});

// ── IPC: right-click context menu on the bubble ───────────────────────────────
// Popped when the user right-clicks the mini pill / chat panel. Gives a quick
// "Re-authenticate" action (plus open-HUD and quit) directly on the overlay.
ipcMain.on('show-context-menu', () => {
  if (!win) return;
  const menu = Menu.buildFromTemplate([
    { label: '⬡  J.A.R.V.I.S.', enabled: false },
    { type: 'separator' },
    { label: '🔄  Re-authenticate', click: () => win?.webContents.send('cmd:reauth') },
    { label: '💬  Open Full HUD', click: () => shell.openExternal('http://localhost:5173') },
    { label: '🎙  Test microphone', click: () => win?.webContents.send('cmd:test-mic') },
    { type: 'separator' },
    { label: '❌  Quit JARVIS', click: () => { isQuitting = true; app.quit(); } },
  ]);
  menu.popup({ window: win });
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.on('ready', async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Start backend services first (server + client), then open the window
  await startBackendServices();

  startStaticServer();
  createWindow();
  createTray();

  // Global shortcut: Ctrl+Shift+Space = activate JARVIS from anywhere
  const shortcutKey = 'CommandOrControl+Shift+Space';
  const ok = globalShortcut.register(shortcutKey, () => {
    console.log('[Shortcut] Triggered →', shortcutKey);
    win?.webContents.send('cmd:tray-click');
  });
  console.log('[Shortcut] Registered:', ok, '(' + shortcutKey + ')');
  if (!ok) console.warn('[Shortcut] FAILED — shortcut may be taken by another app');

  // Auto-start is handled by jarvis-autostart.vbs (Startup-folder shortcut),
  // which launches Flask + this Electron app (which then starts server+client).
  // So DISABLE Electron's own login item — otherwise it registers a duplicate,
  // half-broken 'electron.app.Electron' Run entry that opens a bare Electron
  // window at login and races the VBS launcher.
  if (process.platform === 'win32') {
    try { app.setLoginItemSettings({ openAtLogin: false }); } catch (_) { /* ignore */ }
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  httpServer?.close();
  // Kill spawned children when Electron quits
  serverProc?.kill();
  clientProc?.kill();
});

app.on('window-all-closed', (e) => { if (!isQuitting) e.preventDefault(); });

app.on('before-quit', () => {
  isQuitting = true;
  tray?.destroy();
});

app.on('second-instance', () => win?.webContents.send('cmd:tray-click'));
