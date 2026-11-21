import React, { useCallback } from 'react';
import StatusBar from './StatusBar';
import ArcReactor from './ArcReactor';
import Waveform from './Waveform';
import ChatLog from './ChatLog';
import ExpertPanel from './ExpertPanel';
import CommandInput from './CommandInput';
import HexGrid from './HexGrid';
import ScanLine from './ScanLine';
import MiniHUD from './MiniHUD';
import { useJarvisContext } from '../context/JarvisContext';
import { useSystemStats } from '../hooks/useSystemStats';
import { Trash2, RefreshCw, Zap, Monitor, Globe, Mic2, FileSearch, Camera } from 'lucide-react';

const HUD = () => {
  const {
    listening, speaking, thinking, messages, commandHistory,
    sendCommand, clearMessages, sessionId, socket,
  } = useJarvisContext();

  const { cpu, ram, temperature, uptime, mongoStatus, apiStatus } = useSystemStats();

  // Determine arc reactor state
  const arcState = thinking ? 'thinking' : speaking ? 'speaking' : listening ? 'listening' : 'idle';

  const cpuClass = cpu > 75 ? 'high' : cpu > 50 ? 'med' : '';
  const ramClass = ram > 80 ? 'high' : ram > 60 ? 'med' : '';

  const quickActions = [
    { icon: <Globe size={10} />, label: 'Google', cmd: 'Search Google for latest tech news' },
    { icon: <Camera size={10} />, label: 'Screenshot', cmd: 'Take a screenshot' },
    { icon: <FileSearch size={10} />, label: 'Scan Page', cmd: '__page_scan__' },
    { icon: <Mic2 size={10} />, label: 'Voice Help', cmd: 'How do I use voice commands?' },
  ];

  const handleQuickAction = useCallback((cmd) => {
    if (cmd === '__page_scan__') {
      if (!socket) return;
      const pageText = document.body.innerText;
      socket.emit('user:page_scan', {
        pageText, url: window.location.href,
        instruction: 'Summarize this page and highlight key insights',
        sessionId, expertId: 'jarvis',
      });
    } else {
      sendCommand(cmd);
    }
  }, [socket, sendCommand, sessionId]);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Background layers */}
      <HexGrid />
      <ScanLine />

      {/* Ambient glow */}
      <div style={{
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '400px',
        background: 'radial-gradient(ellipse, rgba(var(--cyan-rgb),0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* HUD Grid Layout */}
      <div className="hud-root" style={{ position: 'relative', zIndex: 1 }}>

        {/* ── STATUS BAR ── */}
        <div className="hud-statusbar">
          <StatusBar />
        </div>

        {/* ── LEFT PANEL ── */}
        <div className="hud-left">
          {/* Arc Reactor */}
          <div className="glass-panel corner-brackets" style={{ padding: '8px', flexShrink: 0 }}>
            <div className="panel-header">◈ CORE SYSTEM</div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
              <ArcReactor size={130} state={arcState} />
            </div>
            <div style={{ textAlign: 'center', fontFamily: 'var(--font-hud)', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--text-muted)', paddingBottom: '8px' }}>
              {arcState.toUpperCase()}
            </div>
          </div>

          {/* System Stats */}
          <div className="glass-panel" style={{ flexShrink: 0 }}>
            <div className="panel-header">◈ SYSTEM VITALS</div>
            <div className="stat-row">
              <span className="stat-label">CPU</span>
              <span className="stat-value">{cpu}%</span>
            </div>
            <div className="stat-bar">
              <div className={`stat-bar-fill ${cpuClass}`} style={{ width: `${cpu}%` }} />
            </div>
            <div className="stat-row">
              <span className="stat-label">RAM</span>
              <span className="stat-value">{ram}%</span>
            </div>
            <div className="stat-bar">
              <div className={`stat-bar-fill ${ramClass}`} style={{ width: `${ram}%` }} />
            </div>
            <div className="stat-row">
              <span className="stat-label">TEMP</span>
              <span className="stat-value" style={{ color: temperature > 70 ? 'var(--red)' : 'var(--cyan)' }}>
                {temperature}°C
              </span>
            </div>
            <div className="stat-row" style={{ borderTop: '1px solid var(--cyan-dim)', marginTop: '4px', paddingTop: '6px' }}>
              <span className="stat-label">UPTIME</span>
              <span className="stat-value" style={{ fontSize: '10px' }}>{uptime}</span>
            </div>
          </div>

          {/* Expert Panel */}
          <div className="glass-panel corner-brackets flex-1 overflow-hidden">
            <ExpertPanel />
          </div>
        </div>

        {/* ── CHAT CENTER ── */}
        <div className="hud-chat">
          <ChatLog />
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="hud-right">
          {/* Waveform */}
          <div className="glass-panel" style={{ flexShrink: 0 }}>
            <div className="panel-header">◈ VOICE MONITOR</div>
            <Waveform state={arcState} />
          </div>

          {/* Quick Actions */}
          <div className="glass-panel" style={{ flexShrink: 0 }}>
            <div className="panel-header">◈ QUICK ACTIONS</div>
            <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  className="quick-action-btn"
                  onClick={() => handleQuickAction(action.cmd)}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
              <button
                className="quick-action-btn"
                onClick={clearMessages}
                style={{ color: 'var(--text-muted)', marginTop: '4px' }}
              >
                <Trash2 size={10} />
                Clear Chat
              </button>
            </div>
          </div>

          {/* Command History */}
          <div className="glass-panel flex-1 overflow-hidden flex flex-col">
            <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>◈ CMD HISTORY</span>
              <span style={{ color: 'var(--text-muted)' }}>{commandHistory.length}</span>
            </div>
            <div className="command-history-list">
              {commandHistory.length === 0 ? (
                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                  No commands yet
                </div>
              ) : (
                commandHistory.slice(0, 20).map((cmd, i) => (
                  <div
                    key={i}
                    className="command-history-item"
                    onClick={() => sendCommand(cmd)}
                    title={cmd}
                  >
                    <span style={{ color: 'var(--cyan-dim)', marginRight: '4px' }}>{i + 1}.</span>
                    {cmd}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Session info */}
          <div className="glass-panel" style={{ flexShrink: 0 }}>
            <div className="panel-header">◈ SESSION</div>
            <div className="stat-row">
              <span className="stat-label">MSG COUNT</span>
              <span className="stat-value">{messages.length}</span>
            </div>
            <div style={{ padding: '4px 12px 8px', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', wordBreak: 'break-all', letterSpacing: '0.03em' }}>
              {sessionId}
            </div>
          </div>
        </div>

        {/* ── INPUT BAR ── */}
        <div className="hud-input">
          <CommandInput />
        </div>
      </div>

      {/* ── Mini floating HUD — always available in corner ── */}
      <MiniHUD onExpand={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
    </div>
  );
};

export default HUD;
