import React from 'react';

const ScanLine = () => (
  <div
    className="scan-line"
    aria-hidden="true"
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '2px',
      background: 'linear-gradient(90deg, transparent 0%, rgba(var(--cyan-rgb),0.3) 20%, rgba(var(--cyan-rgb),0.8) 50%, rgba(var(--cyan-rgb),0.3) 80%, transparent 100%)',
      pointerEvents: 'none',
      zIndex: 9999,
      animation: 'scanLine 8s linear infinite',
      opacity: 0,
    }}
  />
);

export default ScanLine;
