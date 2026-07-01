import { useState, useEffect, useCallback, useRef } from 'react';
import { useVoice } from './useVoice';
import { useSocket } from './useSocket';
import { getSessionId } from '../utils/sessionId';

const MAX_COMMAND_HISTORY = 50;

export const useJarvis = () => {
  const [messages, setMessages] = useState([]);
  const [thinking, setThinking] = useState(false);
  const [searching, setSearching] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [expertId, setExpertIdState] = useState('jarvis');
  const [commandHistory, setCommandHistory] = useState([]);
  const [deleteConfirmData, setDeleteConfirmData] = useState(null);
  const [sessionId] = useState(() => getSessionId());

  const voice = useVoice();
  const socket = useSocket();
  const commandHistoryIndexRef = useRef(-1);
  // Ref so the wake-word callback always calls the latest sendCommand
  // without needing to restart the speech recognizer on every re-render.
  const sendCommandRef = useRef(null);

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
        voice.speak(data.speak);
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
      if (data.speak) voice.speak(data.speak);
    });

    return () => {
      socket.off('jarvis:thinking');
      socket.off('jarvis:searching');
      socket.off('jarvis:executing');
      socket.off('jarvis:response');
      socket.off('jarvis:error');
      socket.off('jarvis:history');
      socket.off('jarvis:confirm_delete');
    };
  }, [socket, voice, expertId]);

  // Load history on connect
  useEffect(() => {
    if (socket.connected) {
      socket.requestHistory({ sessionId, limit: 50 });
    }
  }, [socket.connected, sessionId]);

  // Start wake word mode — use a stable ref-based callback so the
  // speech recognizer doesn't need to restart every time sendCommand changes.
  useEffect(() => {
    if (voice.voiceSupported && voice.voiceEnabled) {
      voice.startWakeWordMode((cmd) => {
        // Always calls the latest sendCommand via ref
        sendCommandRef.current?.(cmd);
      });
    }
    // Only re-run if voice support/enabled changes — NOT on sendCommand changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.voiceSupported, voice.voiceEnabled]);

  /**
   * Send a command to JARVIS
   */
  const sendCommand = useCallback((message) => {
    if (!message?.trim()) return;
    const trimmed = message.trim();

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

  return {
    messages,
    thinking,
    searching,
    executing,
    expertId,
    sessionId,
    commandHistory,
    deleteConfirmData,
    connected: socket.connected,
    socket: socket, // raw socket for page scan etc.
    // Voice
    transcript: voice.transcript,
    listening: voice.listening,
    speaking: voice.speaking,
    wakeWordDetected: voice.wakeWordDetected,
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
  };
};
