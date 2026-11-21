import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoice } from './useVoice';
import { useVADTranscribe } from './useVADTranscribe';
import { useSocket } from './useSocket';
import { getSessionId } from '../utils/sessionId';

const MAX_COMMAND_HISTORY = 50;

// Wake words used by the server-transcription fallback (Electron / browsers
// without a Google speech key). A command must contain one of these so we
// don't forward ambient speech to the AI.
const VAD_WAKE_WORDS = ['hello jarvis', 'hey jarvis', 'ok jarvis', 'jarvis', 'computer'];

export const useJarvis = () => {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [expertId, setExpertIdState] = useState('jarvis');
  const [commandHistory, setCommandHistory] = useState([]);
  const [deleteConfirmData, setDeleteConfirmData] = useState(null);
  const [actionConfirmData, setActionConfirmData] = useState(null);
  const [sessionId] = useState(() => getSessionId());

  const voice = useVoice();
  const socket = useSocket();
  const commandHistoryIndexRef = useRef(-1);
  // Ref so the wake-word callback always calls the latest sendCommand
  // without needing to restart the speech recognizer on every re-render.
  const sendCommandRef = useRef(null);
  // Stable ref to voice.speak — avoids recreating handleVadTranscript on every render
  const voiceSpeakRef = useRef(null);
  voiceSpeakRef.current = voice.speak;

  // ── VAD "active listen" window ────────────────────────────────────────────
  // When the VAD hears "Hello JARVIS" with NO inline command, it sets this
  // flag for 10 seconds. Any speech during that window is treated as the
  // follow-on command — no wake word required.
  const vadActivatedRef  = useRef(false);
  const vadActivateTimer = useRef(null);

  const activateVadListen = useCallback(() => {
    vadActivatedRef.current = true;
    clearTimeout(vadActivateTimer.current);
    vadActivateTimer.current = setTimeout(() => {
      vadActivatedRef.current = false;
    }, 10000); // 10-second listen window
  }, []);

  // ── Server-transcription voice fallback ───────────────────────────────────
  // Runs at all times in parallel — primary listener in Electron, reliable
  // backup in the browser (Web Speech API can silently drop out).
  const handleVadTranscript = useCallback((text) => {
    const lower = text.toLowerCase().trim();
    const hasWakeWord = VAD_WAKE_WORDS.some(w => lower.includes(w));

    if (!hasWakeWord) {
      // No wake word — but accept if we're in the active listen window
      if (vadActivatedRef.current) {
        vadActivatedRef.current = false;
        clearTimeout(vadActivateTimer.current);
        console.log('[VAD] 🎤 Active listen → command:', text);
        sendCommandRef.current?.(text.trim());
      } else {
        console.log('[VAD] No wake word in:', lower);
      }
      return;
    }

    // Strip wake word to extract any inline command
    let cmd = text;
    for (const w of VAD_WAKE_WORDS) {
      cmd = cmd.replace(new RegExp(w, 'ig'), '');
    }
    cmd = cmd.replace(/^[\s,.]+/, '').trim();
    console.log('[VAD] ✅ Wake word detected! Command:', cmd || '(activation only)');

    if (cmd.length > 0) {
      // Inline command — fire immediately
      sendCommandRef.current?.(cmd);
    } else {
      // Bare wake word — open a listen window for the next utterance
      activateVadListen();
      voiceSpeakRef.current?.('Yes, Sir?');
    }
  }, [activateVadListen]);

  // Always run VAD — primary background listener.
  // Previously gated on voiceBackendFailed which caused long silence gaps.
  const vadEnabled = voice.voiceEnabled;

  useVADTranscribe(
    handleVadTranscript,
    vadEnabled,
    () => voice.speaking
  );

  // Register socket event listeners
  useEffect(() => {
    socket.on('jarvis:thinking', () => {
      setThinking(true);
      setSearching(false);
      setExecuting(false);
    });

    socket.on('jarvis:searching', () => {
      setSearching(true);
    });

    socket.on('jarvis:executing', () => {
      setExecuting(true);
    });

    socket.on('jarvis:response', (data) => {
      setThinking(false);
      setSearching(false);
      setExecuting(false);

      const jarvisMessage = {
        id: Date.now() + Math.random(),
        role: 'jarvis',
        content: data.display || data.speak,
        speak: data.speak,
        expertId: data.expertId || expertId,
        commandType: data.commandType,
        webSearchUsed: data.webSearchUsed,
        action: data.action,
        success: data.success,
        timestamp: data.timestamp || new Date().toISOString(),
      };

      setMessages(prev => [...prev, jarvisMessage]);

      // Speak the response
      if (data.speak) {
        voiceSpeakRef.current?.(data.speak);
      }
    });

    socket.on('jarvis:error', (data) => {
      setThinking(false);
      setSearching(false);
      setExecuting(false);

      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'jarvis',
        content: `**Error**: ${data.message}`,
        speak: data.message,
        expertId,
        commandType: 'chat',
        timestamp: new Date().toISOString(),
        isError: true,
      }]);
    });

    socket.on('jarvis:history', (data) => {
      if (data.messages && data.messages.length > 0) {
        const formatted = data.messages.map(msg => ({
          id: msg._id || Date.now() + Math.random(),
          role: msg.role,
          content: msg.message,
          expertId: msg.expertId,
          commandType: msg.commandType,
          webSearchUsed: msg.webSearchUsed,
          timestamp: msg.timestamp,
        }));
        setMessages(formatted);
      }
    });

    // Delete confirmation gate
    socket.on('jarvis:confirm_delete', (data) => {
      setThinking(false);
      setSearching(false);
      setExecuting(false);
      setDeleteConfirmData(data);
      // Speak the confirmation request
      if (data.speak) voiceSpeakRef.current?.(data.speak);
    });

    // Power action confirmation gate (shutdown/restart/logoff)
    socket.on('jarvis:confirm_action', (data) => {
      setThinking(false);
      setSearching(false);
      setExecuting(false);
      setActionConfirmData(data);
      if (data.speak) voiceSpeakRef.current?.(data.speak);
    });

    // Server-side cancel of a pending power action
    socket.on('jarvis:cancel_action', () => {
      setActionConfirmData(null);
    });

    return () => {
      socket.off('jarvis:thinking');
      socket.off('jarvis:searching');
      socket.off('jarvis:executing');
      socket.off('jarvis:response');
      socket.off('jarvis:error');
      socket.off('jarvis:history');
      socket.off('jarvis:confirm_delete');
      socket.off('jarvis:confirm_action');
      socket.off('jarvis:cancel_action');
    };
  // NOTE: 'voice' object intentionally excluded — it's a new object every render.
  // voice.speak is accessed via voiceSpeakRef.current to avoid restarting listeners.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, expertId]);

  // Load history on connect
  useEffect(() => {
    if (socket.connected) {
      socket.requestHistory({ sessionId, limit: 50 });
    }
  }, [socket.connected, sessionId]);

  // Start wake word mode — use a stable ref-based callback so the
  // speech recognizer doesn't need to restart every time sendCommand changes.
  // We start it even if voiceBackendFailed so the browser periodically retries,
  // and the VAD fallback runs in parallel via useVADTranscribe.
  useEffect(() => {
    if (voice.voiceSupported && voice.voiceEnabled) {
      voice.startWakeWordMode((cmd) => {
        // Always calls the latest sendCommand via ref
        sendCommandRef.current?.(cmd);
      });
    } else if (!voice.voiceSupported && voice.voiceEnabled) {
      // Web Speech API not supported — rely entirely on VAD fallback.
      // Log once so the user knows.
      console.warn('[Jarvis] Web Speech API unavailable. Using Gemini VAD transcription fallback.');
    }
    // Re-run only when voice support or enabled status changes.
    // sendCommand changes are handled via sendCommandRef — no need to restart
    // the speech recognizer every time (that's what causes wake word dropouts).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.voiceSupported, voice.voiceEnabled]);

  /**
   * Send a command to JARVIS
   */
  const sendCommand = useCallback((message) => {
    if (!message?.trim()) return;
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    // ── Filter out bare wake-word-only utterances ──────────────────────────────
    // If the user says just "Hello Jarvis" / "Hey Jarvis" with no command after,
    // the wake word detector already handled it — don't forward to the AI.
    const BARE_WAKE_WORDS = ['hello jarvis', 'hey jarvis', 'ok jarvis', 'jarvis', 'computer'];
    if (BARE_WAKE_WORDS.some(w => lower === w)) return;

    if (lower === 'mute jarvis' || lower === 'mute jarvis voice' || lower === 'jarvis mute') {
      voice.setVoiceEnabled(false);
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        role: 'user',
        content: trimmed,
        expertId,
        commandType: 'system',
        timestamp: new Date().toISOString(),
      }, {
        id: Date.now() + Math.random(),
        role: 'jarvis',
        content: '🔇 JARVIS voice muted',
        speak: '',
        expertId,
        commandType: 'system',
        timestamp: new Date().toISOString(),
      }]);
      return;
    }

    if (lower === 'unmute jarvis' || lower === 'unmute jarvis voice' || lower === 'jarvis unmute') {
      voice.setVoiceEnabled(true);
      setMessages(prev => [...prev, {
        id: Date.now() + Math.random(),
        role: 'user',
        content: trimmed,
        expertId,
        commandType: 'system',
        timestamp: new Date().toISOString(),
      }, {
        id: Date.now() + Math.random(),
        role: 'jarvis',
        content: '🔊 JARVIS voice unmuted',
        speak: 'Unmuted',
        expertId,
        commandType: 'system',
        timestamp: new Date().toISOString(),
      }]);
      voice.speak('Unmuted');
      return;
    }

    // Add user message to UI
    const userMessage = {
      id: Date.now() + Math.random(),
      role: 'user',
      content: trimmed,
      expertId,
      commandType: 'chat',
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);

    // Add to command history
    setCommandHistory(prev => {
      const updated = [trimmed, ...prev.filter(c => c !== trimmed)];
      return updated.slice(0, MAX_COMMAND_HISTORY);
    });
    commandHistoryIndexRef.current = -1;

    // Try socket first, fall back to REST
    if (socket.connected) {
      socket.sendCommand({ message: trimmed, sessionId, expertId });
    } else {
      // REST fallback
      setThinking(true);
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, sessionId, expertId }),
      })
        .then(r => r.json())
        .then(data => {
          setThinking(false);
          setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'jarvis',
            content: data.display || data.speak,
            speak: data.speak,
            expertId,
            commandType: data.commandType,
            timestamp: new Date().toISOString(),
          }]);
          if (data.speak) voice.speak(data.speak);
        })
        .catch(err => {
          setThinking(false);
          console.error('[Jarvis] REST fallback failed:', err);
          setMessages(prev => [...prev, {
            id: Date.now(),
            role: 'jarvis',
            content: '**Connection error.** Could not reach the server, sir. Please check that the server is running.',
            speak: 'Connection error. Server unreachable, sir.',
            expertId,
            commandType: 'chat',
            timestamp: new Date().toISOString(),
            isError: true,
          }]);
        });
    }
  }, [socket, sessionId, expertId, voice]);

  // Keep the ref always pointing to the latest sendCommand
  sendCommandRef.current = sendCommand;

  /**
   * Switch expert persona
   */
  const setExpertId = useCallback((newExpertId) => {
    setExpertIdState(newExpertId);
    socket.switchExpert({ sessionId, expertId: newExpertId });
    setMessages([]); // Clear chat on expert switch
  }, [socket, sessionId]);

  /**
   * Navigate command history
   */
  const getPreviousCommand = useCallback(() => {
    const nextIndex = commandHistoryIndexRef.current + 1;
    if (nextIndex < commandHistory.length) {
      commandHistoryIndexRef.current = nextIndex;
      return commandHistory[nextIndex];
    }
    return null;
  }, [commandHistory]);

  const getNextCommand = useCallback(() => {
    const prevIndex = commandHistoryIndexRef.current - 1;
    if (prevIndex >= 0) {
      commandHistoryIndexRef.current = prevIndex;
      return commandHistory[prevIndex];
    }
    commandHistoryIndexRef.current = -1;
    return '';
  }, [commandHistory]);

  /**
   * Clear all messages
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /** Confirm a pending delete */
  const confirmDelete = useCallback(() => {
    if (!deleteConfirmData) return;
    socket.emit('user:confirm_delete', {
      target: deleteConfirmData.target,
      sessionId,
      rawCommand: `delete ${deleteConfirmData.target}`,
    });
    setDeleteConfirmData(null);
  }, [deleteConfirmData, socket, sessionId]);

  /** Cancel a pending delete */
  const cancelDelete = useCallback(() => {
    setDeleteConfirmData(null);
    voice.speak('Delete cancelled, sir.');
  }, [voice]);

  /** Confirm a pending power action (shutdown/restart/logoff) */
  const confirmAction = useCallback(() => {
    if (!actionConfirmData) return;
    socket.emit('user:confirm_action', { sessionId, expertId });
    setActionConfirmData(null);
  }, [actionConfirmData, socket, sessionId, expertId]);

  /** Cancel a pending power action */
  const cancelAction = useCallback(() => {
    setActionConfirmData(null);
    socket.emit('user:cancel_action', { sessionId });
    voice.speak('Cancelled, sir.');
  }, [socket, sessionId, voice]);

  return {
    messages,
    thinking,
    searching,
    executing,
    expertId,
    sessionId,
    commandHistory,
    deleteConfirmData,
    actionConfirmData,
    connected: socket.connected,
    socket: socket, // raw socket for page scan etc.
    // Voice
    transcript: voice.transcript,
    listening: voice.listening,
    speaking: voice.speaking,
    wakeWordDetected: voice.wakeWordDetected,
    wakeWordHasCommand: voice.wakeWordHasCommand,
    voiceEnabled: voice.voiceEnabled,
    voiceSupported: voice.voiceSupported,
    setVoiceEnabled: voice.setVoiceEnabled,
    startListening: voice.startListening,
    stopListening: voice.stopListening,
    stopSpeaking: voice.stopSpeaking,
    speak: voice.speak,
    // Actions
    sendCommand,
    setExpertId,
    getPreviousCommand,
    getNextCommand,
    clearMessages,
    confirmDelete,
    cancelDelete,
    confirmAction,
    cancelAction,
  };
};
