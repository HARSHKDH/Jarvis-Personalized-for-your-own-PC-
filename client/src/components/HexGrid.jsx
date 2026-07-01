import React, { useMemo } from 'react';

const HEX_SIZE = 32;
const HEX_GAP = 4;

// Hexagon SVG path
const hexPath = (size) => {
  const r = size / 2;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${r + r * Math.cos(angle)},${r + r * Math.sin(angle)}`;
  }).join(' ');
  return `polygon(${points})`;
};

const HexGrid = () => {
  const cols = Math.ceil(window.innerWidth / (HEX_SIZE + HEX_GAP)) + 1;
  const rows = Math.ceil(window.innerHeight / (HEX_SIZE + HEX_GAP)) + 1;
  const total = cols * rows;

  const hexes = useMemo(() => {
    return Array.from({ length: Math.min(total, 600) }, (_, i) => ({
      id: i,
      delay: (i * 137.5) % 8000, // Golden angle for natural distribution
    }));
  }, [total]);

  return (
    <div className="hex-grid" aria-hidden="true">
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: `${HEX_GAP}px`,
          padding: `${HEX_GAP}px`,
          width: '100%',
          height: '100%',
          alignContent: 'flex-start',
        }}
      >
        {hexes.map(({ id, delay }) => (
          <div
            key={id}
            style={{
              width: HEX_SIZE,
              height: HEX_SIZE,
              clipPath: `polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)`,
              background: 'rgba(0, 212, 255, 0.04)',
              border: '1px solid rgba(0, 212, 255, 0.08)',
              animation: `hexPulse ${4000 + (delay % 4000)}ms ease-in-out infinite`,
              animationDelay: `${delay}ms`,
              flexShrink: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
};

export default HexGrid;
