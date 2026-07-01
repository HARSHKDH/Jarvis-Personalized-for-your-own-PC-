import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useJarvisContext } from '../context/JarvisContext';
import { Mic, MicOff, X, Maximize2, Camera, FileText, Search, Zap, ShieldOff, RefreshCw } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────
export const DeleteConfirmModal = ({ data, onConfirm, onCancel }) => {
  if (!data) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(10,14,23,0.98), rgba(20,6,6,0.98))',
        border: '1px solid rgba(248,113,113,0.5)',
        borderRadius: '12px', padding: '28px 32px', maxWidth: '420px', width: '90%',
        boxShadow: '0 0 40px rgba(248,113,113,0.2), 0 20px 60px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: '700', color: '#f87171', letterSpacing: '0.15em' }}>
            DELETE CONFIRMATION
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, marginBottom: '8px' }}>
          Sir, I am about to permanently delete:
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', wordBreak: 'break-all' }}>
          {data.target}
        </div>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'rgba(248,113,113,0.7)', marginBottom: '20px', letterSpacing: '0.1em' }}>
          ⚠ THIS ACTION CANNOT BE UNDONE
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '9px 22px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px',
            color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
          }}>
            CANCEL
          </button>
          <button onClick={onConfirm} style={{
            padding: '9px 22px',
            background: 'linear-gradient(135deg, rgba(248,113,113,0.2), rgba(220,38,38,0.15))',
            border: '1px solid rgba(248,113,113,0.5)', borderRadius: '6px',
            color: '#f87171', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
            boxShadow: '0 0 12px rgba(248,113,113,0.2)',
          }}>
            YES, DELETE
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mini Floating HUD — bottom-right corner
// ─────────────────────────────────────────────────────────────────────────────
const MiniHUD = ({ onExpand, locked = false, onReauth, rescanning = false }) => {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [micBlocked, setMicBlocked] = useState(false);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  const {
    sendCommand, thinking, speaking, listening, messages, socket, sessionId,
    wakeWordDetected, voiceSupported,
  } = useJarvisContext();

  const lastJarvisMsg = messages.filter(m => m.role === 'jarvis').slice(-1)[0];

  // ── Mic permission check on first mount ─────────────────────────────────
  useEffect(() => {
    if (!voiceSupported) return;
    navigator.permissions?.query({ name: 'microphone' }).then((result) => {
      if (result.state === 'denied') {
        setMicBlocked(true);
        console.warn('[MiniHUD] Microphone permission denied. Voice commands will not work.');
      }
      result.addEventListener('change', () => {
        setMicBlocked(result.state === 'denied');
      });
    }).catch(() => {/* permissions API not supported */});
  }, [voiceSupported]);

  // ── React to wake word detected by the shared useVoice instance ─────────
  // We no longer run a separate useWakeWord here to avoid double-recognition.
  // useVoice in useJarvis already detects wake words and calls sendCommand.
  // This effect just handles the UI pop-up response.
  const prevWakeWordRef = useRef(false);
  useEffect(() => {
    if (wakeWordDetected && !prevWakeWordRef.current) {
      if (locked) {
        onReauth?.();
      } else {
        setVisible(true);
        setPulseKey(k => k + 1);
        const utterance = new SpeechSynthesisUtterance('Hello sir, what can I do for you?');
        utterance.rate = 0.95;
        utterance.pitch = 0.85;
        window.speechSynthesis.speak(utterance);
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    }
    prevWakeWordRef.current = wakeWordDetected;
  }, [wakeWordDetected, locked, onReauth]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  // Whether the shared voice engine is actively listening for wake words
  const isWakeListening = listening || (!visible && voiceSupported && !micBlocked);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const lower = input.toLowerCase();
    if (lower.includes('close') || lower.includes('hide')) {
        handleClose();
    } else {
        sendCommand(input.trim());
    }
    setInput('');
  }, [input, sendCommand, handleClose]);

  const toggleVoiceInput = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (isRecordingVoice) {
      recognitionRef.current?.stop();
      setIsRecordingVoice(false);
      return;
    }

    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      if (text.toLowerCase().includes('close')) {
        handleClose();
      } else {
        setInput(text);
        sendCommand(text);
      }
      setIsRecordingVoice(false);
      setInput('');
    };
    rec.onerror = () => setIsRecordingVoice(false);
    rec.onend = () => setIsRecordingVoice(false);
    recognitionRef.current = rec;
    rec.start();
    setIsRecordingVoice(true);
  }, [isRecordingVoice, sendCommand, handleClose]);

  const handleAction = (cmd) => sendCommand(cmd);

  const arcState = thinking ? 'thinking' : speaking ? 'speaking' : listening ? 'listening' : 'idle';
  const arcColor = arcState === 'thinking' ? '#fbbf24' : arcState === 'speaking' ? '#34d399' : arcState === 'listening' ? '#f87171' : '#00d4ff';

  // ── LOCKED STATE — red pill, click or say "authenticate me" to re-auth ──
  if (locked) {
    return (
      <div
        onClick={rescanning ? undefined : onReauth}
        title={rescanning ? 'Scanning...' : 'Click or say "authenticate me" to unlock'}
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
          display: 'flex', alignItems: 'center', gap: '9px',
          padding: '8px 14px',
          background: 'linear-gradient(135deg, rgba(30,5,5,0.94), rgba(20,0,0,0.96))',
          border: `1px solid ${rescanning ? 'rgba(251,191,36,0.45)' : 'rgba(248,113,113,0.4)'}`,
          borderRadius: '30px',
          boxShadow: rescanning
            ? '0 0 16px rgba(251,191,36,0.2), 0 4px 20px rgba(0,0,0,0.5)'
            : '0 0 14px rgba(248,113,113,0.15), 0 4px 20px rgba(0,0,0,0.5)',
          cursor: rescanning ? 'default' : 'pointer',
          backdropFilter: 'blur(14px)',
          transition: 'all 0.3s ease',
          userSelect: 'none',
          animation: rescanning ? 'none' : 'lockedPulse 3s ease-in-out infinite',
        }}
      >
        <style>{`
          @keyframes lockedPulse {
            0%,100%{box-shadow:0 0 14px rgba(248,113,113,0.15),0 4px 20px rgba(0,0,0,0.5)}
            50%{box-shadow:0 0 22px rgba(248,113,113,0.35),0 4px 20px rgba(0,0,0,0.5)}
          }
          @keyframes scanSpin {
            from{transform:rotate(0deg)} to{transform:rotate(360deg)}
          }
        `}</style>

        {/* Icon */}
        {rescanning ? (
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            border: '1.5px solid rgba(251,191,36,0.8)',
            borderTopColor: 'transparent',
            animation: 'scanSpin 0.9s linear infinite',
          }} />
        ) : (
          <ShieldOff size={10} style={{ color: 'rgba(248,113,113,0.85)' }} />
        )}

        <span style={{
          fontFamily: 'var(--font-hud)', fontSize: '10px',
          color: rescanning ? 'rgba(251,191,36,0.8)' : 'rgba(248,113,113,0.8)',
          letterSpacing: '0.15em',
        }}>
          {rescanning ? 'SCANNING' : 'LOCKED'}
        </span>

        {/* Mic icon when listening for "authenticate me" */}
        {isWakeListening && !rescanning && (
          <Mic size={9} style={{ color: 'rgba(248,113,113,0.4)' }} />
        )}
      </div>
    );
  }

  // ── COLLAPSED — normal unlocked pill ─────────────────────────────────────
  if (!visible) {
    return (
      <div
        onClick={() => setVisible(true)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px',
          background: 'linear-gradient(135deg, rgba(0,20,40,0.92), rgba(0,10,25,0.95))',
          border: `1px solid ${
            micBlocked ? 'rgba(251,191,36,0.5)'
            : isWakeListening ? 'rgba(0,212,255,0.5)'
            : 'rgba(0,212,255,0.2)'
          }`,
          borderRadius: '30px',
          boxShadow: micBlocked
            ? '0 0 16px rgba(251,191,36,0.2), 0 4px 20px rgba(0,0,0,0.5)'
            : isWakeListening
            ? '0 0 20px rgba(0,212,255,0.25), 0 4px 20px rgba(0,0,0,0.5)'
            : '0 4px 20px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          backdropFilter: 'blur(12px)',
          transition: 'all 0.3s ease',
          userSelect: 'none',
        }}
        title={micBlocked ? 'Microphone blocked! Click to open — allow mic in browser settings.' : 'Say "JARVIS" or click to open'}
      >
        <div style={{ position: 'relative', width: 10, height: 10 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: micBlocked ? '#fbbf24' : arcColor,
            boxShadow: `0 0 6px ${micBlocked ? '#fbbf24' : arcColor}`,
            animation: isWakeListening && !micBlocked ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
        </div>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: micBlocked ? 'rgba(251,191,36,0.8)' : 'rgba(0,212,255,0.8)', letterSpacing: '0.15em' }}>
          J.A.R.V.I.S
        </span>
        {micBlocked && (
          <MicOff size={10} style={{ color: 'rgba(251,191,36,0.7)' }} />
        )}
        {!micBlocked && isWakeListening && (
          <Mic size={10} style={{ color: 'rgba(0,212,255,0.5)' }} />
        )}
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
      width: '340px',
      background: 'linear-gradient(135deg, rgba(6,12,26,0.97), rgba(0,8,20,0.98))',
      border: `1px solid rgba(0,212,255,0.35)`,
      borderRadius: '16px',
      boxShadow: '0 0 40px rgba(0,212,255,0.12), 0 20px 60px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden',
      animation: 'slideUpIn 0.25s ease-out',
    }}>
      <style>{`
        @keyframes slideUpIn { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes miniPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.15)} }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(0,212,255,0.04)',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: arcColor,
            boxShadow: `0 0 6px ${arcColor}`,
            animation: arcState !== 'idle' ? 'miniPulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: '#00d4ff', letterSpacing: '0.2em' }}>
            J.A.R.V.I.S
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={onExpand} title="Expand" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,212,255,0.5)' }}>
            <Maximize2 size={12} />
          </button>
          <button onClick={handleClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)' }}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '10px' }}>
        {[
          { icon: <Camera size={12}/>, label: 'Snap', cmd: 'Take a screenshot' },
          { icon: <FileText size={12}/>, label: 'Scan', cmd: 'Scan current page' },
          { icon: <Search size={12}/>, label: 'Search', cmd: 'Search the web' },
          { icon: <Zap size={12}/>, label: 'Fast', cmd: 'Summarize page quickly' },
        ].map((btn, i) => (
          <button key={i} onClick={() => handleAction(btn.cmd)} style={{
            background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)',
            borderRadius: '8px', padding: '8px 4px', color: '#00d4ff', display: 'flex',
            flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer'
          }}>
            {btn.icon}
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-hud)' }}>{btn.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '6px', padding: '0 14px 14px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Command..."
          style={{
            flex: 1, background: 'rgba(0,212,255,0.05)',
            border: '1px solid rgba(0,212,255,0.3)', borderRadius: '8px',
            padding: '7px 10px', color: 'white', fontSize: '12px', outline: 'none',
          }}
        />
        <button type="button" onClick={toggleVoiceInput} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: isRecordingVoice ? '#f87171' : 'rgba(0,212,255,0.1)',
            color: isRecordingVoice ? 'white' : '#00d4ff', cursor: 'pointer'
        }}>
          {isRecordingVoice ? <MicOff size={12} /> : <Mic size={12} />}
        </button>
      </form>

      {/* Wake word indicator */}
      <div style={{ padding: '4px 14px 8px', fontFamily: 'var(--font-hud)', fontSize: '7px', color: 'rgba(0,212,255,0.3)', letterSpacing: '0.1em' }}>
        Say "JARVIS close" to minimize · Wake word resumes on close
      </div>
    </div>
  );
};

export default MiniHUD;
