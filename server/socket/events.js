const { processCommand } = require('../controllers/brain');
const { executeOsCommand } = require('../controllers/executor');
const { getHistory } = require('../controllers/history');
const pendingActions = require('../controllers/pendingActions');
const Session = require('../models/Session');

const OS_ACTIONS = new Set([
  'open_app', 'close_app', 'running_apps', 'add_app', 'open_file', 'open_folder', 'run_command', 'take_screenshot',
  'volume_up', 'volume_down', 'set_volume', 'mute', 'unmute', 'toggle_mute', 'get_volume',
  'whatsapp_message', 'whatsapp_file', 'add_contact',
  'lock_screen', 'sleep', 'shutdown', 'cancel_shutdown', 'restart', 'logoff',
  'get_battery', 'get_ram', 'get_cpu', 'get_disk', 'get_ip', 'get_system_info',
  'brightness_up', 'brightness_down', 'set_brightness',
  'read_clipboard', 'copy_text', 'simulate_copy', 'simulate_paste', 'simulate_cut',
  'select_all', 'undo', 'redo', 'clipboard_history', 'paste_history', 'clear_clipboard', 'clear_history',
  'get_time', 'get_date', 'add_reminder', 'list_reminders', 'cancel_reminder',   // ← date/time + reminders
  'send_whatsapp', 'volume_control', 'system_action', 'create_file', 'delete_file',
  'record_start', 'record_stop',   // ← screen recording actions
  'analyze_screen',                // ← screen analysis via Gemini Vision
]);
const BROWSER_ACTIONS = new Set(['search_web', 'open_youtube', 'play_spotify', 'web_search', 'open_website', 'browser_action', 'current_url']);
const DANGEROUS_ACTIONS = new Set(['delete_file']); // require double-confirm

// Local actions handled entirely in Node (no Flask) — drive overlay panels / modes.
const LOCAL_ACTIONS = new Set([
  'jarvis_help', 'jarvis_status', 'stop_listening', 'start_listening',
  'sleep_mode', 'wake_mode', 'what_did_i_say', 'repeat_response', 'do_again',
]);

// Per-session conversation memory (in-memory only, not persisted).
const jarvisMemory = {};
const getMemory = (sessionId) => {
  if (!jarvisMemory[sessionId]) {
    jarvisMemory[sessionId] = {
      lastCommand: '', lastResponse: '', lastAction: '', lastTarget: '',
      lastActionParams: {}, history: [],
    };
  }
  return jarvisMemory[sessionId];
};

// Rotating "action complete" acknowledgements so JARVIS doesn't feel repetitive.
const DONE_PHRASES = ['Done, sir.', 'All set.', 'Got it.', 'Consider it done.', 'Right away, sir.'];
const randomDone = () => DONE_PHRASES[Math.floor(Math.random() * DONE_PHRASES.length)];

// Time-of-day greeting used when JARVIS wakes.
const timeGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning, Harsh. How can I help?';
  if (h >= 12 && h < 17) return 'Good afternoon, Harsh.';
  if (h >= 17 && h < 21) return 'Good evening, Harsh.';
  return 'Working late, Harsh? What do you need?';
};

// Ping the Flask OS server /health with a short timeout.
const pingFlask = () => new Promise((resolve) => {
  const req = require('http').get(
    { hostname: '127.0.0.1', port: 5001, path: '/health', timeout: 2500 },
    (res) => { res.resume(); resolve(res.statusCode === 200); }
  );
  req.on('error', () => resolve(false));
  req.on('timeout', () => { req.destroy(); resolve(false); });
});

// Collect real-time service health for the JARVIS status panel.
const gatherStatus = async () => {
  const flaskOnline = await pingFlask();
  let mongoOnline = false;
  try { mongoOnline = require('mongoose').connection.readyState === 1; } catch (_) { /* ignore */ }
  const geminiReady = !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  return [
    { name: 'JARVIS Core', state: 'online' },
    { name: 'Flask Server (port 5001)', state: flaskOnline ? 'online' : 'offline' },
    { name: 'Gemini AI', state: geminiReady ? 'online' : 'offline' },
    { name: 'Wake Word', state: 'online' },
    { name: 'WhatsApp', state: 'warning' },
    { name: 'MongoDB', state: mongoOnline ? 'online' : 'offline' },
  ];
};

// Dangerous power actions that require a confirmation step before running.
// Maps the "*_confirm" intent to the real action that runs on confirm.
const CONFIRM_ACTIONS = {
  shutdown_confirm: { action: 'shutdown', details: { minutes: 0 }, label: 'Shutdown your PC?', question: 'Are you sure you want to shutdown? Say yes to confirm', confirmSpeak: 'Shutting down. Goodbye', confirmLabel: 'Yes, Shutdown' },
  restart_confirm: { action: 'restart', details: { minutes: 0 }, label: 'Restart your PC?', question: 'Are you sure you want to restart? Say yes to confirm', confirmSpeak: 'Restarting your PC', confirmLabel: 'Yes, Restart' },
  logoff_confirm: { action: 'logoff', details: {}, label: 'Log off Windows?', question: 'Are you sure you want to log off? Say yes to confirm', confirmSpeak: 'Logging you off', confirmLabel: 'Yes, Log Off' },
};

const registerSocketEvents = (io) => {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── USER:COMMAND ─────────────────────────────────────────────
    socket.on('user:command', async ({ message, sessionId, expertId }) => {
      if (!message || !sessionId) {
        socket.emit('jarvis:error', { message: 'Invalid command payload' });
        return;
      }
      console.log(`[Socket] Command from ${sessionId}: "${message}" [Expert: ${expertId}]`);
      socket.emit('jarvis:thinking', { sessionId });

      try {
        await Session.findOneAndUpdate(
          { sessionId },
          { $set: { expertId: expertId || 'jarvis', lastSeen: new Date() }, $inc: { totalCommands: 1 }, $setOnInsert: { firstSeen: new Date() } },
          { upsert: true, new: true }
        );
      } catch (e) { console.warn('[Socket] Session upsert failed:', e.message); }

      let brainResult = null;
      try {
        brainResult = await processCommand(
          message, sessionId, expertId || 'jarvis',
          () => socket.emit('jarvis:searching', { sessionId })
        );
      } catch (err) {
        console.error('[Socket] Brain error:', err.message);
        socket.emit('jarvis:response', {
          speak: "I'm having trouble connecting to my neural cores, sir. Please try again.",
          display: `**System Error**\n\n${err.message}\n\nPlease ensure your GEMINI_API_KEY is set correctly in server/.env.`,
          action: 'answer', success: false, sessionId,
          expertId: expertId || 'jarvis', webSearchUsed: false, commandType: 'chat',
        });
        return;
      }

      // ── Delete requires confirmation — never execute silently ──
      if (brainResult.action && DANGEROUS_ACTIONS.has(brainResult.action)) {
        socket.emit('jarvis:confirm_delete', {
          target: brainResult.target,
          speak: `Sir, I am about to permanently delete "${brainResult.target}". Please confirm.`,
          display: `⚠️ **Delete Confirmation Required**\n\nAbout to permanently delete:\n\n\`${brainResult.target}\`\n\nThis **cannot be undone**.`,
          sessionId, expertId: expertId || 'jarvis',
        });
        return;
      }

      // ── Power actions requiring confirmation (shutdown/restart/logoff) ──
      if (brainResult.action && CONFIRM_ACTIONS[brainResult.action]) {
        const spec = CONFIRM_ACTIONS[brainResult.action];
        pendingActions.set(sessionId, {
          action: spec.action,
          target: '',
          details: { ...spec.details },
          confirmSpeak: spec.confirmSpeak,
          rawCommand: message,
        });
        socket.emit('jarvis:confirm_action', {
          pendingAction: spec.action,
          label: spec.label,
          confirmLabel: spec.confirmLabel,
          speak: spec.question,
          display: `⚠️ **${spec.label}**\n\nSay "yes" to confirm, or "cancel".`,
          timeoutMs: 10000,
          sessionId, expertId: expertId || 'jarvis',
        });
        return;
      }

      // ── Voice confirm / cancel of a pending power action ──
      if (brainResult.action === 'confirm') {
        const pending = pendingActions.get(sessionId);
        if (!pending) {
          socket.emit('jarvis:response', {
            speak: 'There is nothing to confirm, sir.', display: 'Nothing to confirm.',
            action: 'answer', success: true, sessionId, expertId: expertId || 'jarvis',
            webSearchUsed: false, commandType: 'system', timestamp: new Date().toISOString(),
          });
          return;
        }
        pendingActions.delete(sessionId);
        socket.emit('jarvis:executing', { action: pending.action, target: '', sessionId });
        const result = await executeOsCommand(pending.action, pending.target || '', pending.details || {}, sessionId, pending.rawCommand || pending.action);
        socket.emit('jarvis:response', {
          speak: result.success ? (pending.confirmSpeak || 'Done, sir.') : `That action failed, sir. ${result.message || ''}`,
          display: `**${pending.action}** ${result.success ? '✅' : '❌'}\n\n${result.message || ''}`,
          action: pending.action, target: '', success: result.success, executionResult: result,
          sessionId, expertId: expertId || 'jarvis', webSearchUsed: false, commandType: 'system',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (brainResult.action === 'cancel') {
        const had = pendingActions.get(sessionId);
        pendingActions.delete(sessionId);
        socket.emit('jarvis:cancel_action', { sessionId });
        socket.emit('jarvis:response', {
          speak: had ? 'Cancelled, sir.' : 'Nothing to cancel, sir.',
          display: had ? '🚫 **Action cancelled**' : 'Nothing to cancel.',
          action: 'answer', success: true, sessionId, expertId: expertId || 'jarvis',
          webSearchUsed: false, commandType: 'system', timestamp: new Date().toISOString(),
        });
        return;
      }

      // ── Local JARVIS self-commands (help / status / modes / memory) ──
      if (brainResult.action && LOCAL_ACTIONS.has(brainResult.action)) {
        const mem = getMemory(sessionId);
        const act = brainResult.action;

        if (act === 'jarvis_help') {
          socket.emit('jarvis:help', { sessionId });
        } else if (act === 'jarvis_status') {
          const status = await gatherStatus();
          socket.emit('jarvis:status', { sessionId, status });
        } else if (act === 'stop_listening') {
          socket.emit('jarvis:listening', { sessionId, listening: false });
        } else if (act === 'start_listening') {
          socket.emit('jarvis:listening', { sessionId, listening: true });
        } else if (act === 'sleep_mode') {
          socket.emit('jarvis:mode', { sessionId, mode: 'sleep' });
        } else if (act === 'wake_mode') {
          brainResult.speak = timeGreeting();
          brainResult.display = `🟢 **${brainResult.speak}**`;
          socket.emit('jarvis:mode', { sessionId, mode: 'awake' });
        } else if (act === 'what_did_i_say') {
          brainResult.speak = mem.lastCommand
            ? `You said: ${mem.lastCommand}`
            : "You haven't said anything yet, sir.";
          brainResult.display = mem.lastCommand ? `🔁 **You said:**\n\n"${mem.lastCommand}"` : 'No previous command recorded.';
        } else if (act === 'repeat_response') {
          brainResult.speak = mem.lastResponse || "I haven't said anything yet, sir.";
          brainResult.display = mem.lastResponse ? `🔁 **Repeating:**\n\n${mem.lastResponse}` : 'Nothing to repeat.';
        } else if (act === 'do_again') {
          if (mem.lastAction && (OS_ACTIONS.has(mem.lastAction) || BROWSER_ACTIONS.has(mem.lastAction))) {
            socket.emit('jarvis:executing', { action: mem.lastAction, target: mem.lastTarget, sessionId });
            const redo = await executeOsCommand(mem.lastAction, mem.lastTarget, mem.lastActionParams || {}, sessionId, message);
            brainResult.speak = redo.success ? randomDone() : 'That action failed the second time, sir.';
            brainResult.display = `🔁 **Repeated:** ${mem.lastAction} ${redo.success ? '✅' : '❌'}`;
          } else {
            brainResult.speak = "There's no repeatable action yet, sir.";
            brainResult.display = 'Nothing to repeat.';
          }
        }

        // Update memory for this turn
        mem.lastCommand = message;
        mem.lastResponse = brainResult.speak || '';
        mem.history.push({ command: message, response: brainResult.speak || '' });
        if (mem.history.length > 5) mem.history.shift();

        socket.emit('jarvis:response', {
          speak: brainResult.speak || 'Done, sir.',
          display: brainResult.display || brainResult.speak,
          action: brainResult.action, target: brainResult.target || '',
          details: brainResult.details || {}, success: true, executionResult: null,
          sessionId, expertId: expertId || 'jarvis', webSearchUsed: false,
          commandType: brainResult.commandType || 'chat', timestamp: new Date().toISOString(),
        });
        return;
      }

      let executionResult = null;
      if (brainResult.action && (OS_ACTIONS.has(brainResult.action) || BROWSER_ACTIONS.has(brainResult.action))) {
        socket.emit('jarvis:executing', { action: brainResult.action, target: brainResult.target, sessionId });
        executionResult = await executeOsCommand(brainResult.action, brainResult.target, brainResult.details || {}, sessionId, message);
        if (executionResult) {
          if (brainResult.action === 'open_file' || brainResult.action === 'open_folder') {
            const requestedName = brainResult.target
              || brainResult.details?.filename
              || brainResult.details?.foldername
              || 'item';
            if (executionResult.shellFolder) {
              // Windows system location (This PC, Recycle Bin, …). The Python
              // server returns a properly cased label — and "Opening This PC
              // folder" would read badly, so no "folder" suffix here.
              brainResult.speak = `Opening ${executionResult.foldername || requestedName}`;
            } else {
              brainResult.speak = executionResult.success
                ? (brainResult.action === 'open_folder'
                  ? `Opening ${requestedName} folder`
                  : `Opening ${requestedName}`)
                : `Sorry, I couldn't find ${requestedName} on your system`;
            }
          } else if (brainResult.action === 'open_app') {
            const appName = brainResult.details?.appname || brainResult.target || executionResult.appname || 'app';
            brainResult.speak = executionResult.success
              ? `Opening ${appName}`
              : `I don't have ${appName} in my list. You can ask me to add it`;
          } else if (brainResult.action === 'close_app') {
            const appName = brainResult.details?.appname || brainResult.target || executionResult.appname || 'app';
            brainResult.speak = executionResult.success
              ? `${appName} has been closed`
              : `I could not close ${appName}, sir.`;
          } else if (brainResult.action === 'running_apps') {
            const apps = Array.isArray(executionResult.apps) ? executionResult.apps : [];
            const count = apps.length;
            if (count === 0) {
              brainResult.speak = 'No tracked apps are currently open, sir.';
            } else {
              const spoken = apps.slice(0, 5).map((name) => name.replace(/\b\w/g, (c) => c.toUpperCase())).join(', ');
              brainResult.speak = `You have ${count} apps open: ${spoken}`;
            }
          } else if (brainResult.action === 'add_app') {
            const appName = brainResult.details?.appname || brainResult.target || executionResult.appname || 'app';
            brainResult.speak = executionResult.success
              ? `${appName} added to JARVIS app list`
              : `I couldn't add ${appName}, sir.`;
          } else if (brainResult.action === 'web_search') {
            const query = brainResult.details?.query || brainResult.target || executionResult.query || '';
            const engine = brainResult.details?.engine || executionResult.engine || 'google';
            brainResult.speak = executionResult.success
              ? `Searching ${engine.charAt(0).toUpperCase() + engine.slice(1)} for ${query}`
              : `I could not run that search, sir.`;
          } else if (brainResult.action === 'open_website') {
            const site = brainResult.details?.site || brainResult.target || executionResult.site || 'website';
            brainResult.speak = executionResult.success
              ? `Opening ${site}`
              : `I could not open ${site}, sir.`;
          } else if (brainResult.action === 'browser_action') {
            const action = brainResult.details?.action || brainResult.target || executionResult.action || '';
            if (executionResult.success) {
              if (action === 'new_tab') brainResult.speak = 'New tab opened';
              else if (action === 'go_back') brainResult.speak = 'Going back';
              else if (action === 'refresh') brainResult.speak = 'Page refreshed';
              else if (action === 'zoom_in') brainResult.speak = 'Zooming in';
              else if (action === 'zoom_out') brainResult.speak = 'Zooming out';
              else if (action === 'close_browser') brainResult.speak = 'Closing Chrome';
            } else {
              brainResult.speak = 'I could not perform that browser action, sir.';
            }
          } else if (brainResult.action === 'current_url') {
            const url = executionResult.url || '';
            brainResult.speak = executionResult.success
              ? `You are on ${url}`
              : 'I could not read the current URL, sir.';
          } else if (brainResult.action === 'volume_up' || brainResult.action === 'volume_down' || brainResult.action === 'set_volume') {
            const level = executionResult.level;
            brainResult.speak = executionResult.success
              ? `Volume ${level}`
              : 'Volume control failed';
          } else if (brainResult.action === 'mute') {
            brainResult.speak = executionResult.success ? 'Muted' : 'Mute failed';
          } else if (brainResult.action === 'unmute') {
            brainResult.speak = executionResult.success ? 'Unmuted' : 'Unmute failed';
          } else if (brainResult.action === 'toggle_mute') {
            const muted = executionResult.status === 'muted' || executionResult.muted === true;
            brainResult.speak = executionResult.success ? (muted ? 'Muted' : 'Unmuted') : 'Mute toggle failed';
          } else if (brainResult.action === 'get_volume') {
            brainResult.speak = executionResult.success
              ? `Volume is at ${executionResult.level} percent`
              : 'Could not read volume level';
          } else if (brainResult.action === 'whatsapp_message') {
            const contact = executionResult.contact || brainResult.details?.contact || 'your contact';
            if (executionResult.success) {
              brainResult.speak = `Message sent to ${contact} on WhatsApp`;
            } else if (executionResult.contactMissing) {
              brainResult.speak = `I don't have ${brainResult.details?.contact || 'that contact'} in my contacts. Say add contact followed by their name and number to add them.`;
            } else {
              brainResult.speak = 'I could not send that WhatsApp message, sir.';
            }
          } else if (brainResult.action === 'whatsapp_file') {
            const contact = executionResult.contact || brainResult.details?.contact || 'your contact';
            if (executionResult.success) {
              brainResult.speak = `File sent to ${contact} on WhatsApp`;
            } else if (executionResult.contactMissing) {
              brainResult.speak = `I don't have ${brainResult.details?.contact || 'that contact'} in my contacts, sir.`;
            } else if (executionResult.fileMissing) {
              brainResult.speak = `I couldn't find ${brainResult.details?.filename || 'that file'} on your system, sir.`;
            } else {
              brainResult.speak = 'I could not send that file, sir.';
            }
          } else if (brainResult.action === 'add_contact') {
            const name = executionResult.name || brainResult.details?.name || 'The contact';
            brainResult.speak = executionResult.success
              ? `${name} has been added to your contacts`
              : 'I could not add that contact, sir.';
          } else if (brainResult.action === 'lock_screen') {
            brainResult.speak = executionResult.success ? 'Locking screen' : 'I could not lock the screen, sir.';
          } else if (brainResult.action === 'sleep') {
            brainResult.speak = executionResult.success ? 'Going to sleep. Goodnight' : 'I could not put the PC to sleep, sir.';
          } else if (brainResult.action === 'shutdown') {
            brainResult.speak = executionResult.success ? (executionResult.message || 'Shutting down') : 'Shutdown failed, sir.';
          } else if (brainResult.action === 'restart') {
            brainResult.speak = executionResult.success ? (executionResult.message || 'Restarting your PC') : 'Restart failed, sir.';
          } else if (brainResult.action === 'cancel_shutdown') {
            brainResult.speak = executionResult.success ? 'Shutdown cancelled' : (executionResult.message || 'There was no shutdown to cancel, sir.');
          } else if (brainResult.action === 'logoff') {
            brainResult.speak = executionResult.success ? 'Logging you off' : 'Logoff failed, sir.';
          } else if (brainResult.action === 'get_battery') {
            const er = executionResult;
            brainResult.speak = er.success
              ? `Battery at ${er.percent}%, ${er.plugged ? 'charging' : 'on battery'}${er.time_left ? ', ' + er.time_left : ''}`
              : 'Could not read battery, sir.';
          } else if (brainResult.action === 'get_ram') {
            brainResult.speak = executionResult.success
              ? `${executionResult.available_gb}GB free out of ${executionResult.total_gb}GB`
              : 'Could not read memory, sir.';
          } else if (brainResult.action === 'get_cpu') {
            brainResult.speak = executionResult.success ? `CPU at ${executionResult.percent} percent` : 'Could not read CPU, sir.';
          } else if (brainResult.action === 'get_disk') {
            brainResult.speak = executionResult.success ? `${executionResult.free_gb}GB free on C drive` : 'Could not read disk, sir.';
          } else if (brainResult.action === 'get_ip') {
            brainResult.speak = executionResult.success ? `Your IP is ${executionResult.ip}` : 'Could not read your IP, sir.';
          } else if (brainResult.action === 'get_system_info') {
            brainResult.speak = executionResult.success ? executionResult.message : 'Could not gather system info, sir.';
          } else if (brainResult.action === 'brightness_up' || brainResult.action === 'brightness_down') {
            brainResult.speak = executionResult.success ? `Brightness ${executionResult.level}` : 'Brightness control failed, sir.';
          } else if (brainResult.action === 'set_brightness') {
            brainResult.speak = executionResult.success ? `Brightness set to ${executionResult.level}` : 'Brightness control failed, sir.';
          } else if (brainResult.action === 'read_clipboard') {
            if (!executionResult.success) {
              brainResult.speak = 'I could not read your clipboard, sir.';
            } else if (!executionResult.text) {
              brainResult.speak = 'Your clipboard is empty, sir.';
            } else {
              const snippet = String(executionResult.text).slice(0, 50);
              brainResult.speak = `Your clipboard contains: ${snippet}`;
            }
          } else if (brainResult.action === 'copy_text') {
            brainResult.speak = executionResult.success ? 'Copied' : 'I could not copy that, sir.';
          } else if (brainResult.action === 'simulate_copy') {
            brainResult.speak = executionResult.success ? 'Copied' : 'Copy failed, sir.';
          } else if (brainResult.action === 'simulate_paste') {
            brainResult.speak = executionResult.success ? 'Pasted' : 'Paste failed, sir.';
          } else if (brainResult.action === 'simulate_cut') {
            brainResult.speak = executionResult.success ? 'Cut' : 'Cut failed, sir.';
          } else if (brainResult.action === 'select_all') {
            brainResult.speak = executionResult.success ? 'Selected all' : 'Select all failed, sir.';
          } else if (brainResult.action === 'undo') {
            brainResult.speak = executionResult.success ? 'Undone' : 'Undo failed, sir.';
          } else if (brainResult.action === 'redo') {
            brainResult.speak = executionResult.success ? 'Redone' : 'Redo failed, sir.';
          } else if (brainResult.action === 'clipboard_history') {
            const count = executionResult.count || 0;
            brainResult.speak = executionResult.success
              ? (count ? `You have ${count} item${count === 1 ? '' : 's'} in clipboard history` : 'Your clipboard history is empty, sir.')
              : 'Could not read clipboard history, sir.';
          } else if (brainResult.action === 'paste_history') {
            brainResult.speak = executionResult.success ? `Pasting item ${executionResult.index}` : (executionResult.message || 'Could not paste that item, sir.');
          } else if (brainResult.action === 'clear_clipboard') {
            brainResult.speak = executionResult.success ? 'Clipboard cleared' : 'Could not clear clipboard, sir.';
          } else if (brainResult.action === 'clear_history') {
            brainResult.speak = executionResult.success ? 'Clipboard history cleared' : 'Could not clear history, sir.';
          } else if (brainResult.action === 'get_time') {
            brainResult.speak = executionResult.success ? `It's ${executionResult.time}, sir.` : 'I could not read the time, sir.';
            if (executionResult.success) brainResult.display = `🕐 **${executionResult.time}**\n\n${executionResult.date}`;
          } else if (brainResult.action === 'get_date') {
            brainResult.speak = executionResult.success ? `Today is ${executionResult.date}.` : 'I could not read the date, sir.';
            if (executionResult.success) brainResult.display = `📅 **${executionResult.date}**`;
          } else if (brainResult.action === 'add_reminder') {
            brainResult.speak = executionResult.success ? (executionResult.message || 'Reminder set') : (executionResult.message || 'I could not set that reminder, sir.');
            if (executionResult.success) brainResult.display = `⏰ **Reminder set**\n\n${executionResult.reminder?.text || ''} at ${executionResult.display_time || executionResult.time || ''}`;
          } else if (brainResult.action === 'list_reminders') {
            const reminders = Array.isArray(executionResult.reminders) ? executionResult.reminders : [];
            const count = reminders.length;
            brainResult.speak = executionResult.success
              ? (count ? `You have ${count} reminder${count === 1 ? '' : 's'}.` : 'You have no active reminders, sir.')
              : 'Could not read your reminders, sir.';
            if (executionResult.success && count) {
              brainResult.display = '⏰ **Your Reminders**\n\n' + reminders.map((r) => `• ${r.text} — ${r.time}`).join('\n');
            }
          } else if (brainResult.action === 'cancel_reminder') {
            brainResult.speak = executionResult.success ? (executionResult.message || 'Reminder cancelled') : (executionResult.message || 'No matching reminder found, sir.');
          } else if (brainResult.action === 'analyze_screen') {
            if (executionResult.success) {
              const desc = executionResult.description || executionResult.message || 'Screen analyzed';
              // Trim for speech (150 chars max) but show full in display
              const spoken = desc.length > 150 ? desc.substring(0, 150).trimEnd() + '...' : desc;
              brainResult.speak = spoken;
              brainResult.display = `## 🖥️ Screen Analysis\n\n${desc}`;
            } else {
              brainResult.speak = `I couldn't analyze the screen, sir. ${executionResult.message || ''}`;
              brainResult.display = `## ❌ Screen Analysis Failed\n\n${executionResult.message || 'Unknown error'}`;
            }
          }
        }
        if (executionResult) {
          const status = executionResult.success ? '✅' : '❌';
          const txt = executionResult.message || executionResult.output || '';
          if (txt) brainResult.display += `\n\n---\n**Execution Result** ${status}\n\`\`\`\n${txt}\n\`\`\``;
        }
      }

      socket.emit('jarvis:response', {
        speak: brainResult.speak || 'Command processed, sir.',
        display: brainResult.display || brainResult.speak,
        action: brainResult.action, target: brainResult.target,
        details: brainResult.details || {},
        steps: brainResult.steps || [],
        success: executionResult ? executionResult.success : true,
        executionResult, sessionId, expertId: expertId || 'jarvis',
        webSearchUsed: brainResult.webSearchUsed || false,
        commandType: brainResult.commandType || 'chat',
        timestamp: new Date().toISOString(),
      });

      // ── Update conversation memory for context / repeat commands ──
      const mem = getMemory(sessionId);
      mem.lastCommand = message;
      mem.lastResponse = brainResult.speak || '';
      if (brainResult.action && (OS_ACTIONS.has(brainResult.action) || BROWSER_ACTIONS.has(brainResult.action))) {
        mem.lastAction = brainResult.action;
        mem.lastTarget = brainResult.target || '';
        mem.lastActionParams = brainResult.details || {};
      }
      mem.history.push({ command: message, response: brainResult.speak || '' });
      if (mem.history.length > 5) mem.history.shift();
    });

    // ── USER:CONFIRM_DELETE — user clicked YES in modal ──────────
    socket.on('user:confirm_delete', async ({ target, sessionId, rawCommand }) => {
      console.log(`[Socket] Delete confirmed: ${target}`);
      socket.emit('jarvis:executing', { action: 'delete_file', target, sessionId });
      const result = await executeOsCommand('delete_file', target, {}, sessionId, rawCommand || `delete ${target}`);
      socket.emit('jarvis:response', {
        speak: result.success ? `Done, sir. "${target}" has been permanently deleted.` : `Deletion failed, sir. ${result.message}`,
        display: `**Delete Operation** ${result.success ? '✅' : '❌'}\n\n\`\`\`\n${result.message}\n\`\`\``,
        action: 'delete_file', target, success: result.success, executionResult: result,
        sessionId, expertId: 'jarvis', webSearchUsed: false, commandType: 'file',
        timestamp: new Date().toISOString(),
      });
    });

    // ── USER:CONFIRM_ACTION — user clicked YES on a power confirmation ──
    socket.on('user:confirm_action', async ({ sessionId, expertId }) => {
      const pending = pendingActions.get(sessionId);
      if (!pending) {
        socket.emit('jarvis:response', {
          speak: 'There is nothing to confirm, sir.', display: 'Nothing to confirm.',
          action: 'answer', success: true, sessionId, expertId: expertId || 'jarvis',
          webSearchUsed: false, commandType: 'system', timestamp: new Date().toISOString(),
        });
        return;
      }
      pendingActions.delete(sessionId);
      console.log(`[Socket] Power action confirmed: ${pending.action}`);
      socket.emit('jarvis:executing', { action: pending.action, target: '', sessionId });
      const result = await executeOsCommand(pending.action, pending.target || '', pending.details || {}, sessionId, pending.rawCommand || pending.action);
      socket.emit('jarvis:response', {
        speak: result.success ? (pending.confirmSpeak || 'Done, sir.') : `That action failed, sir. ${result.message || ''}`,
        display: `**${pending.action}** ${result.success ? '✅' : '❌'}\n\n${result.message || ''}`,
        action: pending.action, target: '', success: result.success, executionResult: result,
        sessionId, expertId: expertId || 'jarvis', webSearchUsed: false, commandType: 'system',
        timestamp: new Date().toISOString(),
      });
    });

    // ── USER:CANCEL_ACTION — user clicked CANCEL / timeout on confirmation ──
    socket.on('user:cancel_action', ({ sessionId }) => {
      const had = pendingActions.get(sessionId);
      pendingActions.delete(sessionId);
      if (had) console.log(`[Socket] Power action cancelled: ${had.action}`);
    });

    // ── USER:PAGE_SCAN — browser sends visible page text ─────────
    socket.on('user:page_scan', async ({ pageText, url, instruction, sessionId, expertId }) => {
      console.log(`[Socket] Page scan from: ${url}`);
      socket.emit('jarvis:thinking', { sessionId });
      const truncated = (pageText || '').substring(0, 6000);
      const cmd = `[PAGE SCAN]\nURL: ${url || 'unknown'}\nTask: ${instruction || 'Summarize this page'}\n\n--- CONTENT ---\n${truncated}\n--- END ---`;
      try {
        const br = await processCommand(cmd, sessionId, expertId || 'jarvis', () => socket.emit('jarvis:searching', { sessionId }));
        socket.emit('jarvis:response', {
          speak: br.speak || 'Page analyzed, sir.',
          display: br.display || br.speak,
          action: 'answer', success: true, sessionId,
          expertId: expertId || 'jarvis', webSearchUsed: false,
          commandType: 'chat', timestamp: new Date().toISOString(),
        });
      } catch (err) {
        socket.emit('jarvis:response', {
          speak: 'Page scan failed, sir.',
          display: `**Page Scan Error**\n\n${err.message}`,
          action: 'answer', success: false, sessionId,
          expertId: 'jarvis', webSearchUsed: false, commandType: 'chat',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // ── USER:EXPERT_SWITCH ────────────────────────────────────────
    socket.on('user:expert_switch', async ({ sessionId, expertId }) => {
      try {
        await Session.findOneAndUpdate({ sessionId }, { $set: { expertId, lastSeen: new Date() } }, { upsert: true });
        socket.emit('jarvis:expert_switched', { expertId, sessionId });
      } catch (err) { console.error('[Socket] Expert switch error:', err.message); }
    });

    // ── USER:GET_HISTORY ──────────────────────────────────────────
    socket.on('user:get_history', async ({ sessionId, limit, skip }) => {
      try {
        const history = await getHistory(sessionId, limit || 50, skip || 0);
        socket.emit('jarvis:history', history);
      } catch (err) {
        socket.emit('jarvis:error', { message: 'Failed to load history' });
      }
    });

    // ── BROWSER:HUD-ACTIVE — website tab focus/blur coordinator ─────────
    // The main website (localhost:5173) emits this when its tab gains/loses
    // focus. The server broadcasts it to ALL other sockets (i.e. the Electron
    // overlay at localhost:3456) so the overlay can pause/resume its own
    // wake-word listener, preventing double responses.
    socket.on('browser:hud-active', (data) => {
      const active = !!(data?.active);
      console.log(`[Socket] browser:hud-active from ${socket.id}: ${active}`);
      // Broadcast to every OTHER connected client (the overlay, etc.)
      socket.broadcast.emit('browser:hud-active', { active });
    });

    // ── DISCONNECT ────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
      // When the website tab closes/disconnects, tell overlay to resume
      socket.broadcast.emit('browser:hud-active', { active: false });
    });
  });
};

module.exports = { registerSocketEvents };
