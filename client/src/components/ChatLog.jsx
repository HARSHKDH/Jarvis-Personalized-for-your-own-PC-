import React, { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import ArcReactor from './ArcReactor';
import { useJarvisContext } from '../context/JarvisContext';

const ChatLog = () => {
  const { messages, thinking, searching, executing } = useJarvisContext();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  return (
    <div
      className="glass-panel corner-brackets"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div className="panel-header flex items-center justify-between" style={{ flexShrink: 0 }}>
        <span>◈ COMMUNICATION LOG</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
          {messages.length} ENTRIES
        </span>
      </div>

      <div
        className="chat-log"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {messages.length === 0 ? (
          <div className="chat-empty">
            <ArcReactor size={60} state="idle" />
            <div className="chat-empty-text">Awaiting command, sir.</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id || msg._id} message={msg} />
          ))
        )}

        {/* Thinking / Loading indicator */}
        {thinking && (
          <div className="message-bubble" style={{ animation: 'slideUp 0.3s ease-out' }}>
            <div className="message-avatar jarvis">AI</div>
            <div>
              <div className="thinking-indicator">
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                {searching && (
                  <span className="searching-badge">Searching Web...</span>
                )}
                {executing && (
                  <span className="executing-badge">Executing...</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};

export default ChatLog;
