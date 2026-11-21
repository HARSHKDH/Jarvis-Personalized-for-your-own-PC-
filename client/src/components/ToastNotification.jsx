import React, { useState, useEffect, useRef } from 'react';

/**
 * ToastNotification
 *
 * Shows a slide-in-from-right toast in the bottom-right corner.
 * Auto-dismisses after `duration` ms with a fade-out.
 *
 * Props:
 *   toast   — { visible, type: 'success'|'error'|'info'|'recording'|'neutral', title, subtitle, copyable, copyValue, duration }
 *   onDone  — callback fired when the toast finishes (so parent can reset state)
 *
 * Usage:
 *   const [toast, setToast] = useState({ visible: false });
 *   <ToastNotification toast={toast} onDone={() => setToast({ visible: false })} />
 *
 *   // To show:
 *   setToast({ visible: true, type: 'success', title: '📸 Screenshot saved', subtitle: 'screenshot_2025-01-15_14-30-45.png' });
 */
const ToastNotification = ({ toast, onDone, duration = 3500 }) => {
  const [phase, setPhase] = useState('hidden'); // 'hidden' | 'entering' | 'visible' | 'leaving'
  const timerRef = useRef(null);
  const leaveRef = useRef(null);

  const effectiveDuration = toast?.duration || duration;

  useEffect(() => {
    if (!toast?.visible) {
      // If already showing, start leave animation
      if (phase !== 'hidden') {
        clearTimeout(timerRef.current);
        clearTimeout(leaveRef.current);
        setPhase('leaving');
        leaveRef.current = setTimeout(() => {
          setPhase('hidden');
          onDone?.();
        }, 350);
      }
      return;
    }

    // New toast → enter
    clearTimeout(timerRef.current);
    clearTimeout(leaveRef.current);
    setPhase('entering');

    // Transition to 'visible' after a tick so CSS animation fires
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPhase('visible'));
    });

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setPhase('leaving');
      leaveRef.current = setTimeout(() => {
        setPhase('hidden');
        onDone?.();
      }, 400);
    }, effectiveDuration);

    return () => {
      clearTimeout(timerRef.current);
      clearTimeout(leaveRef.current);
    };
  }, [toast?.visible, toast?.title, toast?.subtitle, toast?.copyValue, effectiveDuration]); // re-trigger on content change too

  if (phase === 'hidden') return null;

  const isError = toast?.type === 'error';
  const isInfo = toast?.type === 'info' || toast?.type === 'recording';
  const isNeutral = toast?.type === 'neutral';
  const isSuccess = !isError && !isInfo && !isNeutral;

  // ── Colors ──────────────────────────────────────────────────────────────────
  const accent = isError ? 'var(--red)' : isInfo ? 'var(--blue)' : isNeutral ? 'var(--slate)' : 'var(--green)';   // red | blue | white | green
  const accentDim = isError ? 'rgba(var(--red-rgb),0.12)' : isInfo ? 'rgba(var(--blue-rgb),0.16)' : isNeutral ? 'rgba(var(--slate-rgb),0.12)' : 'rgba(var(--green-rgb),0.15)';
  const borderClr = isError ? 'rgba(var(--red-rgb),0.35)' : isInfo ? 'rgba(var(--blue-rgb),0.38)' : isNeutral ? 'rgba(var(--slate-rgb),0.35)' : 'rgba(var(--green-rgb),0.35)';

  // ── Slide / fade transform ───────────────────────────────────────────────────
  const sliding = phase === 'entering';
  const fading  = phase === 'leaving';

  return (
    <>
      <style>{`
        @keyframes jarvis-toast-in {
          from { opacity: 0; transform: translateX(110%); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes jarvis-toast-out {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(110%); }
        }
        .jarvis-toast-bar {
          position: fixed;
          bottom: 90px;          /* sits just above the MiniHUD pill */
          right: 20px;
          z-index: 9100;
          min-width: 240px;
          max-width: 320px;
          pointer-events: none;  /* never blocks clicks */
        }
        .jarvis-toast-bar.entering {
          animation: jarvis-toast-in 0.28s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }
        .jarvis-toast-bar.visible {
          opacity: 1;
          transform: translateX(0);
        }
        .jarvis-toast-bar.leaving {
          animation: jarvis-toast-out 0.35s ease-in forwards;
        }
      `}</style>

      <div className={`jarvis-toast-bar ${phase}`} style={{ pointerEvents: toast?.copyable ? 'auto' : 'none' }}>
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(var(--surface-1-rgb),0.97), rgba(var(--surface-1-rgb),0.98))',
            border: `1px solid ${borderClr}`,
            borderLeft: `3px solid ${accent}`,
            borderRadius: '10px',
            padding: '11px 14px',
            backdropFilter: 'blur(16px)',
            boxShadow: `0 0 24px ${accentDim}, 0 8px 32px rgba(var(--shadow-rgb),0.55)`,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          {/* Icon dot */}
          <div
            style={{
              marginTop: '2px',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 8px ${accent}`,
              flexShrink: 0,
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Title */}
            <div
              style={{
                fontFamily: 'var(--font-hud, "Orbitron", monospace)',
                fontSize: '11px',
                color: accent,
                letterSpacing: '0.08em',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {toast?.title || (isError ? '✗ Error' : isInfo ? 'ℹ Info' : isNeutral ? '◦ Status' : '✓ Done')}
            </div>

            {/* Subtitle / filename */}
            {toast?.copyable ? (
              <div style={{ marginTop: '6px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono, "Courier New", monospace)',
                    fontSize: '9px',
                    color: 'rgba(var(--text-rgb),0.82)',
                    background: 'rgba(var(--halo-rgb),0.06)',
                    border: '1px solid rgba(var(--halo-rgb),0.14)',
                    borderRadius: '6px',
                    padding: '6px 8px',
                    wordBreak: 'break-all',
                    userSelect: 'text',
                  }}
                >
                  {toast?.copyValue || toast?.subtitle}
                </div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(toast?.copyValue || toast?.subtitle || '')}
                  style={{
                    marginTop: '6px',
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    border: `1px solid ${borderClr}`,
                    background: 'rgba(var(--halo-rgb),0.05)',
                    color: 'var(--blue)',
                    fontFamily: 'var(--font-hud, "Orbitron", monospace)',
                    fontSize: '9px',
                    padding: '4px 8px',
                    letterSpacing: '0.06em',
                  }}
                >
                  COPY URL
                </button>
              </div>
            ) : toast?.subtitle && (
              <div
                style={{
                  fontFamily: 'var(--font-mono, "Courier New", monospace)',
                  fontSize: '9px',
                  color: 'rgba(var(--text-rgb),0.55)',
                  letterSpacing: '0.04em',
                  marginTop: '3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {toast.subtitle}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default ToastNotification;
