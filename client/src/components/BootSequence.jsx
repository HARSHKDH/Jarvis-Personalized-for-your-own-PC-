import React, { useState, useEffect } from 'react';
import ArcReactor from './ArcReactor';

const BOOT_LINES = [
  { text: 'Initializing J.A.R.V.I.S. v5.0...', delay: 300 },
  { text: 'Loading neural cores: ████████████ 100%', delay: 700 },
  { text: 'MongoDB connection: ESTABLISHED', delay: 1100 },
  { text: 'Claude Sonnet API: ONLINE', delay: 1450 },
  { text: 'Voice interface: READY', delay: 1750 },
  { text: 'Web search module: ACTIVE', delay: 2050 },
  { text: 'OS control bridge: CONNECTED', delay: 2350 },
  { text: 'Stark security protocols: ENABLED', delay: 2600 },
  { text: 'All systems nominal. Welcome back, sir.', delay: 2950 },
];

const TOTAL_DURATION = 3600;

const BootSequence = ({ onBootComplete }) => {
  const [visibleLines, setVisibleLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const [taglineVisible, setTaglineVisible] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timers = [];

    BOOT_LINES.forEach((line, i) => {
      const t = setTimeout(() => {
        setVisibleLines(prev => [...prev, i]);
        setProgress(((i + 1) / BOOT_LINES.length) * 100);
      }, line.delay);
      timers.push(t);
    });

    const taglineTimer = setTimeout(() => setTaglineVisible(true), 3100);
    timers.push(taglineTimer);

    const doneTimer = setTimeout(() => {
      setDone(true);
      setTimeout(onBootComplete, 600);
    }, TOTAL_DURATION);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  }, [onBootComplete]);

  const getStatus = (index) => {
    if (index < visibleLines.length - 1) return 'ok';
    if (index === visibleLines.length - 1) return 'loading';
    return null;
  };

  return (
    <div
      className="boot-screen"
      style={{
        opacity: done ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
      }}
    >
      <div className="boot-reactor">
        <ArcReactor size={120} state="idle" />
      </div>

      <div className="boot-lines">
        {BOOT_LINES.map((line, i) => {
          const isVisible = visibleLines.includes(i);
          if (!isVisible) return null;
          const status = getStatus(i);
          const isLast = i === BOOT_LINES.length - 1;

          return (
            <div key={i} className="boot-line" style={{ animationDelay: '0ms' }}>
              <span className="boot-line-prefix">{isLast ? '◈' : '›'}</span>
              <span
                className="boot-line-text"
                style={{ color: isLast ? 'var(--cyan)' : undefined }}
              >
                {line.text}
              </span>
              {status && (
                <span className={`boot-line-status ${status}`}>
                  {status === 'ok' ? '[ OK ]' : '[ ... ]'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="boot-progress-bar">
        <div
          className="boot-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className={`boot-tagline ${taglineVisible ? 'visible' : ''}`}>
        Stark Industries · Advanced AI Division
      </div>
    </div>
  );
};

export default BootSequence;
