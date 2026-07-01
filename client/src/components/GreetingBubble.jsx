import React, { useEffect, useState, useCallback } from 'react';

/**
 * GreetingBubble
 *
 * A speech-bubble notification that floats up from the bottom-right corner,
 * shows a typewriter greeting, then morphs/shrinks away — calling onDone()
 * when the exit animation completes.
 *
 * Props:
 *   success      boolean   — green (auth ok) or red (auth failed)
 *   displayName  string    — e.g. "Sir"
 *   onDone       () => void
 */
const GreetingBubble = ({ success, displayName = 'Sir', onDone }) => {
  // 'enter' → 'typing' → 'hold' → 'exit' → done
  const [anim, setAnim]   = useState('enter');
  const [typed, setTyped] = useState('');

  const fullText = success
    ? `Hello, ${displayName}. Systems online. I'm at your service.`
    : `Identity unverified. Access to JARVIS is restricted.`;

  // Phase transitions
  useEffect(() => {
    const t = setTimeout(() => setAnim('typing'), 350);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (anim !== 'typing') return;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(iv);
        setTimeout(() => setAnim('hold'), 500);
      }
    }, 38);
    return () => clearInterval(iv);
  }, [anim, fullText]);

  useEffect(() => {
    if (anim !== 'hold') return;
    const t = setTimeout(() => setAnim('exit'), 2000);
    return () => clearTimeout(t);
  }, [anim]);

  useEffect(() => {
    if (anim !== 'exit') return;
    const t = setTimeout(() => onDone?.(), 550);
    return () => clearTimeout(t);
  }, [anim, onDone]);

  const color  = success ? '#34d399' : '#f87171';
  const glow   = success ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)';
  const border = success ? 'rgba(52,211,153,0.28)' : 'rgba(248,113,113,0.28)';
  const label  = success ? 'J.A.R.V.I.S' : 'ACCESS DENIED';

  // CSS values per phase
  const styles = {
    enter: { opacity: 0, transform: 'scale(0.4) translateY(18px)', bottom: '16px' },
    typing: { opacity: 1, transform: 'scale(1) translateY(0)',     bottom: '72px' },
    hold:   { opacity: 1, transform: 'scale(1) translateY(0)',     bottom: '72px' },
    exit:   { opacity: 0, transform: 'scale(0.3) translateY(14px)',bottom: '16px' },
  };
  const s = styles[anim] || styles.enter;
  const transition = anim === 'enter'
    ? 'all 0.38s cubic-bezier(0.34,1.56,0.64,1)'
    : 'all 0.52s cubic-bezier(0.4,0,0.6,1)';

  return (
    <>
      <style>{`
        @keyframes gb-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(1.3)} }
        @keyframes gb-cur { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes gb-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        right: '20px',
        bottom: s.bottom,
        zIndex: 9999,
        opacity: s.opacity,
        transform: s.transform,
        transition,
        transformOrigin: 'bottom right',
        pointerEvents: 'none',
      }}>
        {/* ── Bubble card ── */}
        <div style={{
          position: 'relative',
          background: 'linear-gradient(135deg, rgba(6,12,26,0.97), rgba(0,8,20,0.98))',
          border: `1px solid ${border}`,
          borderRadius: '16px 16px 4px 16px',
          padding: '14px 18px 14px 16px',
          minWidth: '240px',
          maxWidth: '310px',
          backdropFilter: 'blur(20px)',
          boxShadow: `0 0 28px ${glow}, 0 16px 48px rgba(0,0,0,0.7)`,
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '9px' }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: color,
              boxShadow: `0 0 8px ${color}`,
              animation: 'gb-dot 1.6s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span style={{
              fontFamily: 'monospace', fontSize: '8.5px',
              color, letterSpacing: '0.22em', fontWeight: 700,
            }}>
              {label}
            </span>
          </div>

          {/* Typewriter text */}
          <div style={{
            fontFamily: '"Courier New", monospace',
            fontSize: '12.5px',
            color: 'rgba(255,255,255,0.86)',
            lineHeight: 1.55,
            minHeight: '19px',
          }}>
            {typed}
            {anim === 'typing' && (
              <span style={{
                display: 'inline-block', width: '1.5px', height: '13px',
                background: color, marginLeft: '2px', verticalAlign: 'middle',
                animation: 'gb-cur 0.65s ease-in-out infinite',
              }} />
            )}
          </div>

          {/* Shimmer bottom bar */}
          {success && anim === 'hold' && (
            <div style={{
              marginTop: '10px', height: '1px',
              background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              backgroundSize: '200% 100%',
              animation: 'gb-shimmer 1.8s linear infinite',
            }} />
          )}

          {/* Speech-bubble tail (pointing down-right) */}
          <div style={{
            position: 'absolute', bottom: -8, right: 18,
            width: 0, height: 0,
            borderLeft: '9px solid transparent',
            borderTop: `9px solid ${border}`,
          }} />
          <div style={{
            position: 'absolute', bottom: -6, right: 19,
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderTop: '8px solid rgba(6,12,26,0.97)',
          }} />
        </div>
      </div>
    </>
  );
};

export default GreetingBubble;
