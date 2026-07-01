import React from 'react';
import { renderMarkdown } from '../utils/renderMarkdown';

const EXPERT_NAMES = {
  jarvis: 'J.A.R.V.I.S.',
  physicist: 'Dr. Feynman',
  neurosurgeon: 'Dr. Chen',
  coach: 'Coach Elite',
  lawyer: 'Counselor',
  financial: 'Wolf',
  developer: 'Dev.AI',
  historian: 'Prof. Historia',
};

const formatTime = (timestamp) => {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';
  const expertName = EXPERT_NAMES[message.expertId] || 'J.A.R.V.I.S.';

  return (
    <div className={`message-bubble ${isUser ? 'user' : ''}`}>
      {/* Avatar */}
      <div className={`message-avatar ${isUser ? 'user' : 'jarvis'}`}>
        {isUser ? 'SIR' : 'AI'}
      </div>

      {/* Content */}
      <div className="message-content">
        {isUser ? (
          <div className="message-body user">
            <span style={{ color: 'var(--text)' }}>{message.content}</span>
          </div>
        ) : (
          <div
            className="message-body jarvis md-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}

        {/* Meta info */}
        <div className={`message-meta ${isUser ? 'user' : ''}`}>
          <span>{formatTime(message.timestamp)}</span>

          {!isUser && message.expertId && (
            <span className="expert-badge">{expertName}</span>
          )}

          {!isUser && message.webSearchUsed && (
            <span className="web-badge">🔍 Web Search</span>
          )}

          {!isUser && message.action && message.action !== 'answer' && (
            <span
              style={{
                fontSize: '8px',
                color: message.success === false ? 'var(--red)' : 'var(--green)',
                letterSpacing: '0.08em',
              }}
            >
              {message.success === false ? '✗' : '✓'} {message.action?.replace(/_/g, ' ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
