import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Square } from 'lucide-react';
import { useJarvisContext } from '../context/JarvisContext';
import { cleanTranscript } from '../utils/commandParser';

const CommandInput = () => {
  const {
    sendCommand,
    listening,
    speaking,
    thinking,
    transcript,
    wakeWordDetected,
    voiceEnabled,
    setVoiceEnabled,
    startListening,
    stopListening,
    stopSpeaking,
    getPreviousCommand,
    getNextCommand,
  } = useJarvisContext();

  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  // Sync live transcript to input while listening
  useEffect(() => {
    if (listening && transcript) {
      setInputValue(transcript);
    }
  }, [transcript, listening]);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text || thinking) return;
    sendCommand(text);
    setInputValue('');
  }, [inputValue, thinking, sendCommand]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = getPreviousCommand();
      if (prev !== null) setInputValue(prev);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = getNextCommand();
      setInputValue(next || '');
    }
  };

  const handleMicClick = () => {
    if (speaking) {
      stopSpeaking();
      return;
    }
    if (listening) {
      stopListening();
    } else {
      startListening((cmd) => {
        const cleaned = cleanTranscript(cmd);
        if (cleaned) {
          sendCommand(cleaned);
          setInputValue('');
        }
      });
    }
  };

  const micState = wakeWordDetected ? 'wake-detected' : listening ? 'listening' : '';

  return (
    <div
      className="glass-panel hud-input"
      style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}
    >
      <div className="command-input-bar">
        {/* Mic button */}
        <button
          className={`mic-button ${micState}`}
          onClick={handleMicClick}
          title={listening ? 'Stop listening' : speaking ? 'Stop speaking' : 'Start listening'}
          id="mic-button"
        >
          {speaking ? (
            <Square size={18} />
          ) : listening ? (
            <Mic size={18} />
          ) : (
            <MicOff size={18} style={{ opacity: 0.6 }} />
          )}
        </button>

        {/* Voice toggle */}
        <button
          onClick={() => setVoiceEnabled(!voiceEnabled)}
          title={voiceEnabled ? 'Disable voice output' : 'Enable voice output'}
          style={{
            background: 'transparent',
            border: `1px solid ${voiceEnabled ? 'var(--cyan-border)' : 'var(--text-muted)'}`,
            color: voiceEnabled ? 'var(--cyan)' : 'var(--text-muted)',
            borderRadius: '3px',
            padding: '4px 8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-hud)',
            fontSize: '8px',
            letterSpacing: '0.1em',
            flexShrink: 0,
            transition: 'all 0.2s',
          }}
        >
          {voiceEnabled ? '🔊' : '🔇'}
        </button>

        {/* Text input */}
        <div className="command-input-wrapper">
          <input
            ref={inputRef}
            id="command-input"
            type="text"
            className={`command-input ${listening ? 'listening-active' : ''}`}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              listening
                ? 'Listening... speak your command'
                : wakeWordDetected
                ? 'Wake word detected — speak now...'
                : 'Issue command, sir... (↑ for history)'
            }
            disabled={false}
            autoComplete="off"
            spellCheck={false}
          />
          {(listening || thinking) && (
            <span className={`input-status-badge ${thinking ? 'executing-badge' : 'searching-badge'}`}>
              {thinking ? 'PROCESSING' : 'LISTENING'}
            </span>
          )}
        </div>

        {/* Character count */}
        {inputValue.length > 0 && (
          <span style={{
            fontFamily: 'var(--font-hud)',
            fontSize: '9px',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}>
            {inputValue.length}
          </span>
        )}

        {/* Send button */}
        <button
          className="send-button"
          onClick={handleSend}
          disabled={!inputValue.trim() || thinking}
          id="send-button"
        >
          <Send size={14} />
          SEND
        </button>
      </div>
    </div>
  );
};

export default CommandInput;
