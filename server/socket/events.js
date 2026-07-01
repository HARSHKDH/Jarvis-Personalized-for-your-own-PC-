const { processCommand } = require('../controllers/brain');
const { executeOsCommand } = require('../controllers/executor');
const { getHistory } = require('../controllers/history');
const Session = require('../models/Session');

const OS_ACTIONS = new Set([
  'open_app', 'open_file', 'run_command', 'take_screenshot',
  'send_whatsapp', 'volume_control', 'system_action', 'create_file', 'delete_file',
]);
const BROWSER_ACTIONS = new Set(['search_web', 'open_youtube', 'play_spotify']);
const DANGEROUS_ACTIONS = new Set(['delete_file']); // require double-confirm

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

      let executionResult = null;
      if (brainResult.action && (OS_ACTIONS.has(brainResult.action) || BROWSER_ACTIONS.has(brainResult.action))) {
        socket.emit('jarvis:executing', { action: brainResult.action, target: brainResult.target, sessionId });
        executionResult = await executeOsCommand(brainResult.action, brainResult.target, brainResult.details || {}, sessionId, message);
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
        steps: brainResult.steps || [],
        success: executionResult ? executionResult.success : true,
        executionResult, sessionId, expertId: expertId || 'jarvis',
        webSearchUsed: brainResult.webSearchUsed || false,
        commandType: brainResult.commandType || 'chat',
        timestamp: new Date().toISOString(),
      });
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

    // ── DISCONNECT ────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] Client disconnected: ${socket.id} (${reason})`);
    });
  });
};

module.exports = { registerSocketEvents };
