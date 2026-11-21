import React, { useRef, useEffect, useState } from 'react';
import { useSilentFaceAuth } from '../hooks/useSilentFaceAuth';

/**
 * SilentBootScreen
 *
 * Renders a full-screen JARVIS boot animation while face recognition
 * runs silently in the background. The camera feed is hidden (1×1 px, opacity 0).
 *
 * Props:
 *   onAuthenticated  () => void   — called if face recognised successfully
 *   onFailed         () => void   — called if face fails / no-profile / timeout
 *   enabled          boolean      — start scanning immediately (default true)
 */
const SilentBootScreen = ({ onAuthenticated, onFailed, enabled = true }) => {
  const videoRef = useRef(null);
  const { status } = useSilentFaceAuth(videoRef, enabled);

  // Boot sequence lines that appear one by one
  const BOOT_LINES = [
    'JARVIS INITIALIZING...',
    'LOADING NEURAL CORE',
    'ESTABLISHING SECURE CHANNEL',
    'CALIBRATING SENSORS',
    'VERIFYING ENVIRONMENT',
    'SYSTEM READY',
  ];
  const [shownLines, setShownLines] = useState(0);
  const [scanPct, setScanPct] = useState(0);

  // Animate boot text lines every 1.2s
  useEffect(() => {
    if (shownLines >= BOOT_LINES.length) return;
    const t = setTimeout(() => setShownLines(n => n + 1), 1200);
    return () => clearTimeout(t);
  }, [shownLines]);

  // Animate a fake progress bar (reaches ~90% then waits for face result)
  useEffect(() => {
    const interval = setInterval(() => {
      setScanPct(p => {
        if (p >= 90) { clearInterval(interval); return p; }
        return p + (90 - p) * 0.07 + 0.4;
      });
    }, 120);
    return () => clearInterval(interval);
  }, []);

  // When face auth resolves, snap to 100% then callback
  useEffect(() => {
    if (status === 'authenticated') {
      setScanPct(100);
      const t = setTimeout(() => onAuthenticated?.(), 600);
      return () => clearTimeout(t);
    }
    if (status === 'failed' || status === 'no-profile' || status === 'no-camera') {
      const t = setTimeout(() => onFailed?.(), 400);
      return () => clearTimeout(t);
    }
  }, [status, onAuthenticated, onFailed]);

  const progressColor =
    status === 'authenticated' ? 'var(--green)' :
    status === 'failed'        ? 'var(--red)' : 'var(--cyan)';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'radial-gradient(ellipse at 50% 40%, rgba(var(--surface-2-rgb),1) 0%, rgba(var(--surface-0-rgb),1) 60%, var(--bg-deep) 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', userSelect: 'none',
    }}>
      <style>{`
        @keyframes sb-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(1.06)} }
        @keyframes sb-scan  { 0%{transform:translateY(-120%)} 100%{transform:translateY(220%)} }
        @keyframes sb-flicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:0.4} 95%{opacity:1} }
        @keyframes sb-fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes sb-hexrot { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes sb-glow { 0%,100%{box-shadow:0 0 18px rgba(var(--cyan-rgb),0.35)} 50%{box-shadow:0 0 38px rgba(var(--cyan-rgb),0.7)} }
      `}</style>

      {/* ── Hidden video element for face recognition ── */}
      <video
        ref={videoRef}
        width={1} height={1}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', top: 0, left: 0 }}
        muted playsInline autoPlay
      />

      {/* ── Grid overlay ── */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'linear-gradient(rgba(var(--cyan-rgb),0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--cyan-rgb),0.6) 1px,transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* ── Horizontal scan line ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(var(--cyan-rgb),0.5), transparent)',
        animation: 'sb-scan 4s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* ── Arc reactor / logo ── */}
      <div style={{ position: 'relative', marginBottom: '40px' }}>
        {/* Outer ring */}
        <div style={{
          width: 90, height: 90, borderRadius: '50%',
          border: '1.5px solid rgba(var(--cyan-rgb),0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'sb-glow 3s ease-in-out infinite',
        }}>
          {/* Spinning ring */}
          <div style={{
            position: 'absolute', width: 90, height: 90, borderRadius: '50%',
            border: '1.5px solid transparent',
            borderTopColor: 'rgba(var(--cyan-rgb),0.8)',
            borderRightColor: 'rgba(var(--cyan-rgb),0.3)',
            animation: 'sb-hexrot 2.4s linear infinite',
          }} />
          {/* Inner glow dot */}
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(var(--cyan-rgb),0.45) 0%, rgba(var(--surface-4-rgb),0.4) 50%, transparent 70%)',
            border: '1px solid rgba(var(--cyan-rgb),0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'sb-pulse 2.8s ease-in-out infinite',
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'var(--cyan)',
              boxShadow: '0 0 16px var(--cyan), 0 0 32px rgba(var(--cyan-rgb),0.5)',
            }} />
          </div>
        </div>
      </div>

      {/* ── Brand title ── */}
      <div style={{
        fontFamily: '"Orbitron", "Rajdhani", "Courier New", monospace',
        fontSize: '28px', fontWeight: '700',
        color: 'var(--cyan)',
        letterSpacing: '0.45em',
        textShadow: '0 0 20px rgba(var(--cyan-rgb),0.6), 0 0 50px rgba(var(--cyan-rgb),0.3)',
        marginBottom: '6px',
        animation: 'sb-flicker 5s ease-in-out infinite',
      }}>
        J.A.R.V.I.S
      </div>
      <div style={{
        fontFamily: 'monospace', fontSize: '9px',
        color: 'rgba(var(--cyan-rgb),0.45)', letterSpacing: '0.3em',
        marginBottom: '40px',
      }}>
        JUST A RATHER VERY INTELLIGENT SYSTEM
      </div>

      {/* ── Boot log lines ── */}
      <div style={{
        width: '320px', marginBottom: '28px',
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        color: 'rgba(var(--cyan-rgb),0.5)', letterSpacing: '0.08em',
        display: 'flex', flexDirection: 'column', gap: '5px',
      }}>
        {BOOT_LINES.slice(0, shownLines).map((line, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            animation: 'sb-fadeIn 0.35s ease-out',
          }}>
            <span style={{ color: 'var(--green)', fontSize: '8px' }}>▶</span>
            <span>{line}</span>
            {i === shownLines - 1 && (
              <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: '8px' }}>OK</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ width: '320px' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontFamily: 'monospace', fontSize: '8px',
          color: 'rgba(var(--cyan-rgb),0.35)', letterSpacing: '0.1em',
          marginBottom: '6px',
        }}>
          <span>SYSTEM LOAD</span>
          <span style={{ color: progressColor }}>{Math.round(scanPct)}%</span>
        </div>
        <div style={{
          height: '2px', background: 'rgba(var(--cyan-rgb),0.1)',
          borderRadius: '2px', overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: `${scanPct}%`,
            background: `linear-gradient(90deg, rgba(var(--cyan-rgb),0.6), ${progressColor})`,
            boxShadow: `0 0 8px ${progressColor}`,
            transition: 'width 0.12s ease-out',
            borderRadius: '2px',
          }} />
        </div>
      </div>

      {/* ── Corner decorations ── */}
      {[
        { top: 20, left: 20,  borderTop: '1px solid rgba(var(--cyan-rgb),0.25)', borderLeft: '1px solid rgba(var(--cyan-rgb),0.25)' },
        { top: 20, right: 20, borderTop: '1px solid rgba(var(--cyan-rgb),0.25)', borderRight: '1px solid rgba(var(--cyan-rgb),0.25)' },
        { bottom: 20, left: 20,  borderBottom: '1px solid rgba(var(--cyan-rgb),0.25)', borderLeft: '1px solid rgba(var(--cyan-rgb),0.25)' },
        { bottom: 20, right: 20, borderBottom: '1px solid rgba(var(--cyan-rgb),0.25)', borderRight: '1px solid rgba(var(--cyan-rgb),0.25)' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
      ))}
    </div>
  );
};

export default SilentBootScreen;
