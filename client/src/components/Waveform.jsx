import React, { useEffect, useRef } from 'react';

const BAR_COUNT = 20;

const getBarStyle = (index, state) => {
  const base = {
    width: '3px',
    borderRadius: '2px',
    transformOrigin: 'bottom',
    transition: 'background-color 0.3s',
    display: 'inline-block',
    minHeight: '4px',
  };

  if (state === 'idle') {
    return {
      ...base,
      height: `${6 + (index % 3) * 2}px`,
      background: 'rgba(0, 212, 255, 0.2)',
      animation: `none`,
    };
  }

  const delay = (index * 60) % 800;

  if (state === 'listening') {
    const height = 10 + Math.abs(Math.sin((index * Math.PI) / BAR_COUNT)) * 50;
    return {
      ...base,
      height: `${height}px`,
      background: 'var(--cyan)',
      boxShadow: '0 0 6px var(--cyan)',
      animation: `waveformBar ${0.4 + (index % 4) * 0.1}s ease-in-out infinite alternate`,
      animationDelay: `${delay}ms`,
    };
  }

  if (state === 'thinking') {
    const wave = Math.sin((index / BAR_COUNT) * Math.PI * 2) * 20 + 24;
    return {
      ...base,
      height: `${wave}px`,
      background: 'var(--purple)',
      boxShadow: '0 0 4px rgba(167,139,250,0.6)',
      animation: `waveformBar ${1.2 + (index % 3) * 0.3}s ease-in-out infinite alternate`,
      animationDelay: `${delay}ms`,
    };
  }

  if (state === 'speaking') {
    const height = 8 + Math.random() * 40;
    return {
      ...base,
      height: `${height}px`,
      background: 'linear-gradient(to top, var(--cyan), #ffffff)',
      boxShadow: '0 0 8px rgba(255,255,255,0.5)',
      animation: `waveformBar ${0.2 + (index % 5) * 0.08}s ease-in-out infinite alternate`,
      animationDelay: `${delay}ms`,
    };
  }

  return base;
};

const Waveform = ({ state = 'idle' }) => {
  return (
    <div className="waveform-container">
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="waveform-bar"
          style={getBarStyle(i, state)}
        />
      ))}
    </div>
  );
};

export default Waveform;
