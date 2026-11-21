import React from 'react';
import { useJarvisContext } from '../context/JarvisContext';

const EXPERTS = [
  {
    id: 'jarvis',
    icon: '🤖',
    name: 'J.A.R.V.I.S.',
    desc: 'General AI + OS Control',
    color: 'var(--cyan)',
  },
  {
    id: 'physicist',
    icon: '⚛️',
    name: 'Dr. Feynman',
    desc: 'Nobel Physicist',
    color: 'var(--blue)',
  },
  {
    id: 'neurosurgeon',
    icon: '🧠',
    name: 'Dr. Chen',
    desc: 'Neurosurgeon, Johns Hopkins',
    color: 'var(--red)',
  },
  {
    id: 'coach',
    icon: '🏆',
    name: 'Coach Elite',
    desc: 'Olympic Performance Coach',
    color: 'var(--green)',
  },
  {
    id: 'lawyer',
    icon: '⚖️',
    name: 'Counselor',
    desc: 'Senior Attorney · US & India',
    color: 'var(--gold)',
  },
  {
    id: 'financial',
    icon: '📈',
    name: 'Wolf',
    desc: '30yr Wall Street Veteran',
    color: 'var(--green)',
  },
  {
    id: 'developer',
    icon: '💻',
    name: 'Dev.AI',
    desc: 'Principal Engineer · MERN',
    color: 'var(--purple)',
  },
  {
    id: 'historian',
    icon: '📜',
    name: 'Prof. Historia',
    desc: 'World Historian · Oxford',
    color: 'var(--gold)',
  },
];

const ExpertPanel = () => {
  const { expertId, setExpertId } = useJarvisContext();

  return (
    <div className="expert-panel">
      <div className="expert-panel-title">◈ Expert Mode</div>
      {EXPERTS.map((expert) => {
        const isSelected = expertId === expert.id;
        return (
          <div
            key={expert.id}
            className={`expert-card ${isSelected ? 'selected' : ''}`}
            onClick={() => setExpertId(expert.id)}
            style={isSelected ? {
              borderColor: expert.color + '66',
              background: expert.color + '12',
              boxShadow: `0 0 12px ${expert.color}22`,
            } : {}}
          >
            <span className="expert-card-icon">{expert.icon}</span>
            <div className="expert-card-info">
              <div
                className="expert-card-name"
                style={isSelected ? { color: expert.color, textShadow: `0 0 6px ${expert.color}80` } : {}}
              >
                {expert.name}
              </div>
              <div className="expert-card-desc">{expert.desc}</div>
            </div>
            {isSelected && (
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: expert.color,
                  boxShadow: `0 0 6px ${expert.color}`,
                  flexShrink: 0,
                  animation: 'pulseDot 2s ease-in-out infinite',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExpertPanel;
