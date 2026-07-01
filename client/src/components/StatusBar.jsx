import React, { useState, useEffect } from 'react';
import { useJarvisContext } from '../context/JarvisContext';
import { useSystemStats } from '../hooks/useSystemStats';

const EXPERT_LABELS = {
  jarvis: 'J.A.R.V.I.S.',
  physicist: 'Dr. Feynman',
  neurosurgeon: 'Dr. Chen',
  coach: 'Coach Elite',
  lawyer: 'Counselor',
  financial: 'Wolf',
  developer: 'Dev.AI',
  historian: 'Prof. Historia',
};

const StatusBar = () => {
  const { expertId, sessionId, connected, listening, speaking } = useJarvisContext();
  const { mongoStatus, apiStatus } = useSystemStats();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();

  const sessionShort = sessionId ? sessionId.substring(0, 8).toUpperCase() : '--------';

  return (
    <div className="glass-panel status-bar" style={{ borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="status-logo">◈ J.A.R.V.I.S.</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9px', letterSpacing: '0.1em' }}>v5.0.0</span>
        <span style={{ 
          background: 'rgba(0,212,255,0.1)', 
          border: '1px solid var(--cyan-dim)', 
          color: 'var(--cyan)', 
          padding: '1px 8px', 
          fontSize: '9px', 
          letterSpacing: '0.12em',
          borderRadius: '2px',
        }}>
          MODE: {EXPERT_LABELS[expertId]?.toUpperCase()}
        </span>
      </div>

      {/* Center */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
        <span style={{
          fontFamily: 'var(--font-hud)',
          fontSize: '16px',
          fontWeight: '700',
          color: 'var(--cyan)',
          letterSpacing: '0.15em',
          textShadow: 'var(--glow-sm)',
        }}>
          {timeStr}
        </span>
        <span style={{ fontSize: '8px', letterSpacing: '0.15em', color: 'var(--text-muted)' }}>
          {dateStr} · SID:{sessionShort}
        </span>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* MongoDB status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '9px', letterSpacing: '0.08em' }}>
          <span className={`status-dot ${mongoStatus === 'connected' ? 'online' : mongoStatus === 'connecting' ? 'connecting' : 'offline'}`} />
          <span style={{ color: 'var(--text-muted)' }}>MONGO</span>
        </div>

        {/* API status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '9px', letterSpacing: '0.08em' }}>
          <span className={`status-dot ${apiStatus === 'online' ? 'online' : 'offline'}`} />
          <span style={{ color: 'var(--text-muted)' }}>API</span>
        </div>

        {/* Socket */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '9px', letterSpacing: '0.08em' }}>
          <span className={`status-dot ${connected ? 'online' : 'offline'}`} />
          <span style={{ color: 'var(--text-muted)' }}>SOCKET</span>
        </div>

        {/* Voice status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '9px', letterSpacing: '0.08em' }}>
          <span className={`status-dot ${listening ? 'online' : speaking ? 'connecting' : 'offline'}`} />
          <span style={{ color: 'var(--text-muted)' }}>
            {listening ? 'LISTENING' : speaking ? 'SPEAKING' : 'VOICE'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
