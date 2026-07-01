import React, { useRef, useEffect } from 'react';

const ArcReactor = ({ size = 160, state = 'idle' }) => {
  const outerRingRef = useRef(null);
  const middleRingRef = useRef(null);
  const innerCoreRef = useRef(null);

  const COLORS = {
    idle: { primary: '#00d4ff', core: '#00a8cc', glow: 'rgba(0,212,255,0.8)', accent: '#40e8ff' },
    listening: { primary: '#00d4ff', core: '#00ffff', glow: 'rgba(0,255,255,1)', accent: '#80ffff' },
    thinking: { primary: '#a78bfa', core: '#8b5cf6', glow: 'rgba(139,92,246,0.9)', accent: '#c4b5fd' },
    speaking: { primary: '#ffffff', core: '#e0f4ff', glow: 'rgba(255,255,255,0.95)', accent: '#ffffff' },
  };

  const colors = COLORS[state] || COLORS.idle;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;

  // Ring radii
  const outerR = r * 0.9;
  const midR = r * 0.72;
  const innerR = r * 0.52;
  const coreR = r * 0.28;
  const glowR = r * 0.2;

  // Triangle points (inner design)
  const triR = r * 0.42;
  const trianglePoints = [0, 1, 2].map(i => {
    const angle = (i * 120 - 90) * (Math.PI / 180);
    return `${cx + triR * Math.cos(angle)},${cy + triR * Math.sin(angle)}`;
  }).join(' ');

  const innerTriR = r * 0.26;
  const innerTrianglePoints = [0, 1, 2].map(i => {
    const angle = (i * 120 + 90) * (Math.PI / 180);
    return `${cx + innerTriR * Math.cos(angle)},${cy + innerTriR * Math.sin(angle)}`;
  }).join(' ');

  // Speed based on state
  const outerSpeed = state === 'thinking' ? '2s' : state === 'speaking' ? '1s' : '6s';
  const middleSpeed = state === 'thinking' ? '1.5s' : state === 'speaking' ? '0.8s' : '4s';

  const pulseAnimation = state === 'idle'
    ? 'arcPulse 3s ease-in-out infinite'
    : state === 'speaking'
    ? 'arcPulseWhite 1s ease-in-out infinite'
    : state === 'thinking'
    ? 'arcPulseGold 2s ease-in-out infinite'
    : 'arcPulse 1.5s ease-in-out infinite';

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`arc-reactor-svg ${state}`}
      style={{ animation: pulseAnimation }}
    >
      <defs>
        <radialGradient id={`coreGrad-${state}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={colors.accent} stopOpacity="1" />
          <stop offset="60%" stopColor={colors.primary} stopOpacity="0.9" />
          <stop offset="100%" stopColor={colors.core} stopOpacity="0.5" />
        </radialGradient>
        <filter id={`glow-${state}`}>
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`coreGlow-${state}`}>
          <feGaussianBlur stdDeviation="5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer glow ring */}
      <circle
        cx={cx} cy={cy} r={outerR}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1"
        strokeOpacity="0.3"
        style={{
          animation: `rotate ${outerSpeed} linear infinite`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
        strokeDasharray="8 4"
      />

      {/* Outer rotating ring with segments */}
      <circle
        cx={cx} cy={cy} r={outerR - 2}
        fill="none"
        stroke={colors.primary}
        strokeWidth="2"
        strokeOpacity="0.8"
        strokeDasharray="60 10 30 10 60 10"
        style={{
          animation: `rotate ${outerSpeed} linear infinite`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
        filter={`url(#glow-${state})`}
      />

      {/* Second outer tick ring */}
      <circle
        cx={cx} cy={cy} r={outerR - 6}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1"
        strokeOpacity="0.4"
        strokeDasharray="3 12"
        style={{
          animation: `rotateReverse ${outerSpeed} linear infinite`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
      />

      {/* Middle counter-rotating ring */}
      <circle
        cx={cx} cy={cy} r={midR}
        fill="none"
        stroke={colors.primary}
        strokeWidth="3"
        strokeOpacity="0.9"
        strokeDasharray="40 8 20 8"
        style={{
          animation: `rotateReverse ${middleSpeed} linear infinite`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
        filter={`url(#glow-${state})`}
      />

      {/* Middle inner ring */}
      <circle
        cx={cx} cy={cy} r={midR - 6}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1"
        strokeOpacity="0.3"
        strokeDasharray="4 8"
        style={{
          animation: `rotate ${middleSpeed} linear infinite`,
          transformOrigin: `${cx}px ${cy}px`,
        }}
      />

      {/* Inner static ring */}
      <circle
        cx={cx} cy={cy} r={innerR}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1.5"
        strokeOpacity="0.6"
        strokeDasharray="2 6"
      />

      {/* Outer triangle */}
      <polygon
        points={trianglePoints}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1.5"
        strokeOpacity="0.7"
        filter={`url(#glow-${state})`}
      />

      {/* Inner inverted triangle */}
      <polygon
        points={innerTrianglePoints}
        fill="none"
        stroke={colors.primary}
        strokeWidth="1"
        strokeOpacity="0.5"
      />

      {/* Core background */}
      <circle
        cx={cx} cy={cy} r={coreR}
        fill={`url(#coreGrad-${state})`}
        opacity="0.9"
      />

      {/* Core outer glow ring */}
      <circle
        cx={cx} cy={cy} r={coreR + 2}
        fill="none"
        stroke={colors.primary}
        strokeWidth="2"
        strokeOpacity="0.8"
        filter={`url(#coreGlow-${state})`}
      />

      {/* Center bright core */}
      <circle
        cx={cx} cy={cy} r={glowR}
        fill={colors.accent}
        opacity="0.6"
        filter={`url(#coreGlow-${state})`}
      />

      {/* Center dot */}
      <circle
        cx={cx} cy={cy} r={4}
        fill="#ffffff"
        opacity="0.9"
      />
    </svg>
  );
};

export default ArcReactor;
