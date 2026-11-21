const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Command = require('../models/Command');

const EXECUTOR_PATH = path.join(__dirname, '../../python/executor.py');
const TIMEOUT_MS = 10000;

// Windows may have 'python', 'python3', or 'py' — try in order
const PYTHON_CANDIDATES = ['python', 'python3', 'py'];
const PYTHON_BIN = resolvePythonBin();

function resolvePythonBin() {
  for (const bin of PYTHON_CANDIDATES) {
    const probe = spawnSync(bin, ['--version'], {
      windowsHide: true,
      shell: false,
      stdio: 'ignore',
    });
    if (!probe.error && probe.status === 0) return bin;
  }
  return null;
}

/**
 * Try spawning a python process with fallback binary names.
 * Returns { child, pythonBin } or throws if none found.
 */
function spawnPython(args) {
  if (!PYTHON_BIN) throw new Error('No python interpreter found');
  const child = spawn(PYTHON_BIN, args, { windowsHide: true, shell: false });
  return { child, pythonBin: PYTHON_BIN };
}

const executeOsCommand = async (action, target, details = {}, sessionId = '', rawCommand = '') => {
  const startTime = Date.now();

  // ── Actions handled by persistent Python Flask server (port 5001) ────────────
  // We keep these in Flask so behavior is shared across Electron/REST/socket paths.
  if (
    action === 'record_start' ||
    action === 'record_stop' ||
    action === 'open_file' ||
    action === 'open_folder' ||
    action === 'open_app' ||
    action === 'close_app' ||
    action === 'running_apps' ||
    action === 'add_app' ||
    action === 'web_search' ||
    action === 'open_website' ||
    action === 'browser_action' ||
    action === 'current_url' ||
    action === 'volume_up' ||
    action === 'volume_down' ||
    action === 'set_volume' ||
    action === 'mute' ||
    action === 'unmute' ||
    action === 'toggle_mute' ||
    action === 'get_volume' ||
    action === 'whatsapp_message' ||
    action === 'whatsapp_file' ||
    action === 'add_contact' ||
    action === 'lock_screen' ||
    action === 'sleep' ||
    action === 'shutdown' ||
    action === 'cancel_shutdown' ||
    action === 'restart' ||
    action === 'logoff' ||
    action === 'get_battery' ||
    action === 'get_ram' ||
    action === 'get_cpu' ||
    action === 'get_disk' ||
    action === 'get_ip' ||
    action === 'get_system_info' ||
    action === 'brightness_up' ||
    action === 'brightness_down' ||
    action === 'set_brightness' ||
    action === 'read_clipboard' ||
    action === 'copy_text' ||
    action === 'simulate_copy' ||
    action === 'simulate_paste' ||
    action === 'simulate_cut' ||
    action === 'select_all' ||
    action === 'undo' ||
    action === 'redo' ||
    action === 'clipboard_history' ||
    action === 'paste_history' ||
    action === 'clear_clipboard' ||
    action === 'clear_history' ||
    action === 'get_time' ||
    action === 'get_date' ||
    action === 'add_reminder' ||
    action === 'list_reminders' ||
    action === 'cancel_reminder' ||
    action === 'analyze_screen'
  ) {
    let endpoint = '';
    let method = 'POST';
    let body = '';
    let requestTimeout = 8000;
    if (action === 'record_start') endpoint = '/record/start';
    if (action === 'record_stop') endpoint = '/record/stop';
    if (action === 'open_file') {
      endpoint = '/open-file';
      const filename = (details?.filename || target || '').trim();
      if (!filename) {
        return { success: false, message: 'No filename specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ filename });
    }
    if (action === 'open_folder') {
      endpoint = '/open-folder';
      const foldername = (details?.foldername || target || '').trim();
      if (!foldername) {
        return { success: false, message: 'No folder name specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ foldername });
    }
    if (action === 'open_app') {
      endpoint = '/open-app';
      const appname = (details?.appname || target || '').trim();
      if (!appname) {
        return { success: false, message: 'No app name specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ appname });
    }
    if (action === 'close_app') {
      endpoint = '/close-app';
      const appname = (details?.appname || target || '').trim();
      if (!appname) {
        return { success: false, message: 'No app name specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ appname });
    }
    if (action === 'running_apps') {
      endpoint = '/running-apps';
      method = 'GET';
    }
    if (action === 'add_app') {
      endpoint = '/add-app';
      const appname = (details?.appname || target || '').trim();
      const appPath = (details?.path || '').trim();
      if (!appname || !appPath) {
        return { success: false, message: 'appname and path are required', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ appname, path: appPath });
    }
    if (action === 'web_search') {
      endpoint = '/browser/search';
      const query = (details?.query || target || '').trim();
      const engine = (details?.engine || 'google').trim();
      if (!query) {
        return { success: false, message: 'No search query specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ query, engine });
    }
    if (action === 'open_website') {
      endpoint = '/browser/open';
      const site = (details?.site || target || '').trim();
      if (!site) {
        return { success: false, message: 'No website specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ site });
    }
    if (action === 'browser_action') {
      endpoint = '/browser/action';
      const browserAction = (details?.action || target || '').trim();
      if (!browserAction) {
        return { success: false, message: 'No browser action specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ action: browserAction });
    }
    if (action === 'current_url') {
      endpoint = '/browser/current-url';
      method = 'GET';
    }
    if (action === 'volume_up') {
      endpoint = '/volume/up';
      const step = Number(details?.step ?? 10);
      body = JSON.stringify({ step: Number.isNaN(step) ? 10 : step });
    }
    if (action === 'volume_down') {
      endpoint = '/volume/down';
      const step = Number(details?.step ?? 10);
      body = JSON.stringify({ step: Number.isNaN(step) ? 10 : step });
    }
    if (action === 'set_volume') {
      endpoint = '/volume/set';
      const level = Number(details?.level ?? target);
      if (Number.isNaN(level)) {
        return { success: false, message: 'No volume level specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ level });
    }
    if (action === 'mute') endpoint = '/volume/mute';
    if (action === 'unmute') endpoint = '/volume/unmute';
    if (action === 'toggle_mute') endpoint = '/volume/toggle-mute';
    if (action === 'get_volume') {
      endpoint = '/volume/current';
      method = 'GET';
    }
    if (action === 'whatsapp_message') {
      endpoint = '/whatsapp/message';
      const contact = (details?.contact || target || '').trim();
      const message = (details?.message || '').trim();
      if (!contact) {
        return { success: false, message: 'No contact specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ contact, message });
      requestTimeout = 90000;
    }
    if (action === 'whatsapp_file') {
      endpoint = '/whatsapp/file';
      const contact = (details?.contact || '').trim();
      const filename = (details?.filename || target || '').trim();
      const caption = (details?.caption || '').trim();
      if (!contact) {
        return { success: false, message: 'No contact specified', executionTimeMs: Date.now() - startTime };
      }
      if (!filename) {
        return { success: false, message: 'No filename specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ contact, filename, caption });
      requestTimeout = 90000;
    }
    if (action === 'add_contact') {
      endpoint = '/whatsapp/add-contact';
      const name = (details?.name || target || '').trim();
      const phone = (details?.phone || details?.number || '').trim();
      if (!name) {
        return { success: false, message: 'No contact name specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ name, phone });
    }
    // ── System control ──────────────────────────────────────────────
    if (action === 'lock_screen') endpoint = '/system/lock';
    if (action === 'sleep') endpoint = '/system/sleep';
    if (action === 'shutdown') {
      endpoint = '/system/shutdown';
      const minutes = Number(details?.minutes ?? target);
      body = JSON.stringify({ minutes: Number.isNaN(minutes) ? 0 : minutes });
    }
    if (action === 'cancel_shutdown') endpoint = '/system/cancel-shutdown';
    if (action === 'restart') {
      endpoint = '/system/restart';
      const minutes = Number(details?.minutes ?? target);
      body = JSON.stringify({ minutes: Number.isNaN(minutes) ? 0 : minutes });
    }
    if (action === 'logoff') endpoint = '/system/logoff';
    if (action === 'get_battery') { endpoint = '/system/battery'; method = 'GET'; }
    if (action === 'get_ram') { endpoint = '/system/ram'; method = 'GET'; }
    if (action === 'get_cpu') { endpoint = '/system/cpu'; method = 'GET'; requestTimeout = 12000; }
    if (action === 'get_disk') { endpoint = '/system/disk'; method = 'GET'; }
    if (action === 'get_ip') { endpoint = '/system/ip'; method = 'GET'; }
    if (action === 'get_system_info') { endpoint = '/system/info'; method = 'GET'; requestTimeout = 12000; }
    if (action === 'brightness_up') {
      endpoint = '/system/brightness/up';
      const step = Number(details?.step ?? 10);
      body = JSON.stringify({ step: Number.isNaN(step) ? 10 : step });
    }
    if (action === 'brightness_down') {
      endpoint = '/system/brightness/down';
      const step = Number(details?.step ?? 10);
      body = JSON.stringify({ step: Number.isNaN(step) ? 10 : step });
    }
    if (action === 'set_brightness') {
      endpoint = '/system/brightness/set';
      const level = Number(details?.level ?? target);
      if (Number.isNaN(level)) {
        return { success: false, message: 'No brightness level specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ level });
    }
    // ── Clipboard ──
    if (action === 'read_clipboard') { endpoint = '/clipboard/read'; method = 'GET'; }
    if (action === 'copy_text') {
      endpoint = '/clipboard/copy';
      const text = details?.text ?? target ?? '';
      body = JSON.stringify({ text });
    }
    if (action === 'simulate_copy') endpoint = '/clipboard/simulate-copy';
    if (action === 'simulate_paste') endpoint = '/clipboard/simulate-paste';
    if (action === 'simulate_cut') endpoint = '/clipboard/simulate-cut';
    if (action === 'select_all') endpoint = '/clipboard/select-all';
    if (action === 'undo') endpoint = '/clipboard/undo';
    if (action === 'redo') endpoint = '/clipboard/redo';
    if (action === 'clipboard_history') { endpoint = '/clipboard/history'; method = 'GET'; }
    if (action === 'paste_history') {
      endpoint = '/clipboard/paste-history';
      const index = Number(details?.index ?? target);
      if (Number.isNaN(index)) {
        return { success: false, message: 'No history index specified', executionTimeMs: Date.now() - startTime };
      }
      body = JSON.stringify({ index });
    }
    if (action === 'clear_clipboard') endpoint = '/clipboard/clear';
    if (action === 'clear_history') endpoint = '/clipboard/clear-history';
    if (action === 'get_time' || action === 'get_date') { endpoint = '/system/datetime'; method = 'GET'; }
    if (action === 'add_reminder') {
      endpoint = '/reminders/add';
      const text = details?.text ?? '';
      const time = details?.time ?? target ?? '';
      body = JSON.stringify({ text, time });
    }
    if (action === 'list_reminders') { endpoint = '/reminders/list'; method = 'GET'; }
    if (action === 'cancel_reminder') {
      endpoint = '/reminders/cancel';
      const time = details?.time ?? target ?? '';
      body = JSON.stringify({ time });
    }

    // ── Screen Analysis ─────────────────────────────────────────────────────────
    // Takes a screenshot via Flask, reads as base64, sends to Gemini Vision.
    if (action === 'analyze_screen') {
      // Step 1: take the screenshot
      let screenshotPath = '';
      try {
        const ssResp = await new Promise((resolve) => {
          const ssBody = JSON.stringify({});
          const ssReq = require('http').request(
            {
              hostname: '127.0.0.1',
              port: 5001,
              path: '/screenshot/take',
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(ssBody) },
            },
            (res) => {
              let raw = '';
              res.on('data', (c) => { raw += c; });
              res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({ success: false }); } });
            }
          );
          ssReq.on('error', () => resolve({ success: false, message: 'Screenshot server unreachable' }));
          ssReq.setTimeout(15000, () => { ssReq.destroy(); resolve({ success: false, message: 'Screenshot timed out' }); });
          ssReq.write(ssBody);
          ssReq.end();
        });

        if (!ssResp.success || !ssResp.path) {
          const result = { success: false, message: ssResp.message || 'Could not take screenshot for analysis' };
          try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: false, errorMessage: result.message, executionTimeMs: Date.now() - startTime }); } catch (_) {}
          return { ...result, executionTimeMs: Date.now() - startTime };
        }
        screenshotPath = ssResp.path;
      } catch (err) {
        const result = { success: false, message: `Screenshot error: ${err.message}` };
        try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: false, errorMessage: result.message, executionTimeMs: Date.now() - startTime }); } catch (_) {}
        return { ...result, executionTimeMs: Date.now() - startTime };
      }

      // Step 2: read the image as base64
      let imageBase64 = '';
      let mimeType = 'image/png';
      try {
        imageBase64 = fs.readFileSync(screenshotPath).toString('base64');
        if (screenshotPath.endsWith('.jpg') || screenshotPath.endsWith('.jpeg')) mimeType = 'image/jpeg';
      } catch (err) {
        const result = { success: false, message: `Could not read screenshot file: ${err.message}` };
        try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: false, errorMessage: result.message, executionTimeMs: Date.now() - startTime }); } catch (_) {}
        return { ...result, executionTimeMs: Date.now() - startTime };
      }

      // Step 3: send to Gemini Vision
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
      if (!GEMINI_API_KEY) {
        const result = { success: false, message: 'No GEMINI_API_KEY set — cannot analyze screen.' };
        try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: false, errorMessage: result.message, executionTimeMs: Date.now() - startTime }); } catch (_) {}
        return { ...result, executionTimeMs: Date.now() - startTime };
      }

      const userPrompt = (details?.instruction || target || '').trim() ||
        'Please analyze this screenshot and describe what is on the screen. Summarize the main content visible, including any text, applications, websites, or activities shown. Be concise but comprehensive.';

      const geminiPayload = {
        contents: [{
          parts: [
            { text: userPrompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
          ],
        }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
      };

      // Try vision-capable models in order
      const visionModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];
      let description = '';
      let visionError = '';
      for (const model of visionModels) {
        try {
          const visionRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(geminiPayload),
              signal: AbortSignal.timeout(30000),
            }
          );
          const visionData = await visionRes.json();
          const candidate = visionData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) {
            description = candidate.trim();
            break;
          }
          visionError = visionData?.error?.message || 'No description returned';
        } catch (err) {
          visionError = err.message;
        }
      }

      if (!description) {
        const result = { success: false, message: `Screen analysis failed: ${visionError}` };
        try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: false, errorMessage: result.message, executionTimeMs: Date.now() - startTime }); } catch (_) {}
        return { ...result, executionTimeMs: Date.now() - startTime };
      }

      const result = {
        success: true,
        description,
        screenshotPath,
        message: description,
        executionTimeMs: Date.now() - startTime,
      };
      try { await Command.create({ sessionId, rawCommand, parsedAction: action, target, success: true, errorMessage: null, executionTimeMs: result.executionTimeMs }); } catch (_) {}
      return result;
    }

    const result = await new Promise((resolve) => {
      const req = require('http').request(
        {
          hostname: '127.0.0.1',
          port: 5001,
          path: endpoint,
          method,
          headers: body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {},
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({ success: false, message: 'Invalid response from Python server' }); }
          });
        }
      );
      req.on('error', (err) => {
        resolve({
          success: false,
          message: `Python server (port 5001) unreachable. Start it with: python python/jarvis_server.py — Error: ${err.message}`,
        });
      });
      req.setTimeout(requestTimeout, () => {
        req.destroy();
        resolve({ success: false, message: 'Python server request timed out' });
      });
      if (body) req.write(body);
      req.end();
    });

    // Log to Command collection
    try {
      await Command.create({
        sessionId, rawCommand, parsedAction: action, target,
        success: result.success,
        errorMessage: result.success ? null : result.message,
        executionTimeMs: Date.now() - startTime,
      });
    } catch (err) { console.warn('[Executor] Could not log command:', err.message); }

    return { ...result, executionTimeMs: Date.now() - startTime };
  }

  const payload = JSON.stringify({ action, target, details });


  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;

    try {
      ({ child } = spawnPython([EXECUTOR_PATH, payload]));
    } catch (spawnErr) {
      console.error('[Executor] Could not spawn Python:', spawnErr.message);
      resolve({
        success: false,
        message: `Python not found. Install Python and ensure it is in PATH. Error: ${spawnErr.message}`,
        executionTimeMs: Date.now() - startTime,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      console.warn('[Executor] Command timed out after 10s');
    }, TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.trim()) console.warn('[Executor] Python stderr:', data.toString().trim());
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;

      let result = { success: false, message: 'Unknown error', output: '' };

      if (timedOut) {
        result = { success: false, message: 'Command timed out after 10 seconds', output: '' };
      } else {
        try {
          const jsonMatch = stdout.trim().match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else if (code === 0) {
            result = { success: true, message: stdout.trim() || 'Command executed', output: stdout.trim() };
          } else {
            result = { success: false, message: stderr.trim() || `Exit code ${code}`, output: '' };
          }
        } catch (e) {
          result = {
            success: code === 0,
            message: stdout.trim() || stderr.trim() || 'Command completed',
            output: stdout.trim(),
          };
        }
      }

      // Log to Command collection
      try {
        await Command.create({
          sessionId,
          rawCommand,
          parsedAction: action,
          target,
          success: result.success,
          errorMessage: result.success ? null : result.message,
          executionTimeMs,
        });
      } catch (err) {
        console.warn('[Executor] Could not log command:', err.message);
      }

      resolve({ ...result, executionTimeMs });
    });

    child.on('error', async (err) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;
      console.error('[Executor] Spawn error:', err.message);

      try {
        await Command.create({
          sessionId,
          rawCommand,
          parsedAction: action,
          target,
          success: false,
          errorMessage: err.message,
          executionTimeMs,
        });
      } catch (e) {
        console.warn('[Executor] Could not log error:', e.message);
      }

      resolve({ success: false, message: `Failed to start executor: ${err.message}`, executionTimeMs });
    });
  });
};

module.exports = { executeOsCommand };
