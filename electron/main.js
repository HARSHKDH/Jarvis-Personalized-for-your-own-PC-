const {
  app, BrowserWindow, Tray, Menu, screen,
  ipcMain, nativeImage, shell, session, globalShortcut,
} = require('electron');
const path = require('path');
const http = require('http');
const fs   = require('fs');

// ── Single instance guard ─────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── Speech recognition flags ──────────────────────────────────────────────────
app.commandLine.appendSwitch('enable-speech-input');
app.commandLine.appendSwitch('enable-features', 'SpeechRecognition,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

// ── Built-in HTTP server — serves assistant.html on localhost:3456 ────────────
// REASON: Web Speech API (SpeechRecognition) is BLOCKED on file:// and custom
// schemes in Electron because they aren't a "secure context".
// http://localhost IS explicitly a secure context in Chrome/Electron,
// so the Google Speech API works without any API key.
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
    // Only serve files from our __dirname (electron folder)
    const urlPath = req.url.split('?')[0];
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
  tray.setToolTip('J.A.R.V.I.S.  (Ctrl+Shift+J to activate)');

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
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.on('ready', () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(true));
  session.defaultSession.setPermissionCheckHandler(() => true);

  startStaticServer();
  createWindow();
  createTray();

  // Global shortcut: Ctrl+Shift+Space = activate JARVIS from anywhere
  // NOTE: Ctrl+Shift+J conflicts with Chrome DevTools — use Space instead
  const shortcutKey = 'CommandOrControl+Shift+Space';
  const ok = globalShortcut.register(shortcutKey, () => {
    console.log('[Shortcut] Triggered →', shortcutKey);
    win?.webContents.send('cmd:tray-click');
  });
  console.log('[Shortcut] Registered:', ok, '(' + shortcutKey + ')');
  if (!ok) console.warn('[Shortcut] FAILED to register — shortcut may be taken by another app');

  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true, path: process.execPath });
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  httpServer?.close();
});

app.on('window-all-closed', (e) => { if (!isQuitting) e.preventDefault(); });

app.on('before-quit', () => {
  isQuitting = true;
  tray?.destroy();
});

app.on('second-instance', () => win?.webContents.send('cmd:tray-click'));
