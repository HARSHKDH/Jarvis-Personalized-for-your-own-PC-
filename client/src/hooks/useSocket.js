import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export const useSocket = () => {
  const [connected, setConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef({});

  useEffect(() => {
    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      setConnected(true);
      setSocketId(socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      setConnected(false);
    });

    socket.on('reconnect', (attempt) => {
      console.log('[Socket] Reconnected after', attempt, 'attempts');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  /**
   * Emit an event to the server
   */
  const emit = useCallback((event, data) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    } else {
      console.warn('[Socket] Cannot emit — not connected');
    }
  }, []);

  /**
   * Register an event listener
   */
  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
    // Store for cleanup
    listenersRef.current[event] = callback;
  }, []);

  /**
   * Remove an event listener
   */
  const off = useCallback((event) => {
    if (socketRef.current) {
      const cb = listenersRef.current[event];
      if (cb) socketRef.current.off(event, cb);
      delete listenersRef.current[event];
    }
  }, []);

  /**
   * Send a user command
   */
  const sendCommand = useCallback(({ message, sessionId, expertId }) => {
    emit('user:command', { message, sessionId, expertId });
  }, [emit]);

  /**
   * Switch expert persona
   */
  const switchExpert = useCallback(({ sessionId, expertId }) => {
    emit('user:expert_switch', { sessionId, expertId });
  }, [emit]);

  /**
   * Request conversation history
   */
  const requestHistory = useCallback(({ sessionId, limit, skip }) => {
    emit('user:get_history', { sessionId, limit, skip });
  }, [emit]);

  return {
    connected,
    socketId,
    emit,
    on,
    off,
    sendCommand,
    switchExpert,
    requestHistory,
  };
};
