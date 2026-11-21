import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useJarvisContext } from '../context/JarvisContext';
import { Mic, MicOff, X, Maximize2, Camera, FileText, Search, Zap, ShieldOff, RefreshCw } from 'lucide-react';
import ToastNotification from './ToastNotification';

// ─────────────────────────────────────────────────────────────────────────────
// Delete Confirmation Modal
// ─────────────────────────────────────────────────────────────────────────────
export const DeleteConfirmModal = ({ data, onConfirm, onCancel }) => {
  if (!data) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(var(--shadow-rgb),0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(var(--surface-1-rgb),0.98), rgba(var(--surface-danger-rgb),0.98))',
        border: '1px solid rgba(var(--red-rgb),0.5)',
        borderRadius: '12px', padding: '28px 32px', maxWidth: '420px', width: '90%',
        boxShadow: '0 0 40px rgba(var(--red-rgb),0.2), 0 20px 60px rgba(var(--shadow-rgb),0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: '700', color: 'var(--red)', letterSpacing: '0.15em' }}>
            DELETE CONFIRMATION
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(var(--halo-rgb),0.75)', lineHeight: 1.6, marginBottom: '8px' }}>
          Sir, I am about to permanently delete:
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--red)', background: 'rgba(var(--red-rgb),0.08)', border: '1px solid rgba(var(--red-rgb),0.2)', borderRadius: '6px', padding: '10px 14px', marginBottom: '16px', wordBreak: 'break-all' }}>
          {data.target}
        </div>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'rgba(var(--red-rgb),0.7)', marginBottom: '20px', letterSpacing: '0.1em' }}>
          ⚠ THIS ACTION CANNOT BE UNDONE
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '9px 22px', background: 'transparent',
            border: '1px solid rgba(var(--halo-rgb),0.15)', borderRadius: '6px',
            color: 'rgba(var(--halo-rgb),0.5)', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
          }}>
            CANCEL
          </button>
          <button onClick={onConfirm} style={{
            padding: '9px 22px',
            background: 'linear-gradient(135deg, rgba(var(--red-rgb),0.2), rgba(var(--red-rgb),0.15))',
            border: '1px solid rgba(var(--red-rgb),0.5)', borderRadius: '6px',
            color: 'var(--red)', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
            boxShadow: '0 0 12px rgba(var(--red-rgb),0.2)',
          }}>
            YES, DELETE
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Power Action Confirmation Modal (shutdown / restart / logoff) — with countdown
// ─────────────────────────────────────────────────────────────────────────────
export const ActionConfirmModal = ({ data, onConfirm, onCancel }) => {
  const total = Math.round((data?.timeoutMs || 10000) / 1000);
  const [remaining, setRemaining] = useState(total);

  useEffect(() => {
    if (!data) return undefined;
    setRemaining(total);
    const started = Date.now();
    const tick = setInterval(() => {
      const left = Math.max(0, total - Math.floor((Date.now() - started) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(tick);
        onCancel?.();
      }
    }, 250);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(var(--shadow-rgb),0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(var(--surface-1-rgb),0.98), rgba(var(--surface-warm-rgb),0.98))',
        border: '1px solid rgba(var(--warn-rgb),0.5)',
        borderRadius: '12px', padding: '28px 32px', maxWidth: '420px', width: '90%',
        boxShadow: '0 0 40px rgba(var(--warn-rgb),0.18), 0 20px 60px rgba(var(--shadow-rgb),0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <span style={{ fontSize: '24px' }}>⚠️</span>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: '700', color: 'var(--warn)', letterSpacing: '0.15em' }}>
            CONFIRM ACTION
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'rgba(var(--halo-rgb),0.9)', lineHeight: 1.5, marginBottom: '18px' }}>
          {data.label || 'Are you sure?'}
        </div>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'rgba(var(--warn-rgb),0.7)', marginBottom: '18px', letterSpacing: '0.1em' }}>
          AUTO-CANCEL IN {remaining}s
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '9px 22px', background: 'transparent',
            border: '1px solid rgba(var(--halo-rgb),0.15)', borderRadius: '6px',
            color: 'rgba(var(--halo-rgb),0.5)', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
          }}>
            CANCEL
          </button>
          <button onClick={onConfirm} style={{
            padding: '9px 22px',
            background: 'linear-gradient(135deg, rgba(var(--warn-rgb),0.22), rgba(var(--warn-rgb),0.16))',
            border: '1px solid rgba(var(--warn-rgb),0.5)', borderRadius: '6px',
            color: 'var(--warn)', fontFamily: 'var(--font-hud)',
            fontSize: '10px', letterSpacing: '0.12em', cursor: 'pointer',
            boxShadow: '0 0 12px rgba(var(--warn-rgb),0.2)',
          }}>
            {(data.confirmLabel || 'YES').toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Mini Floating HUD — bottom-right corner
// ─────────────────────────────────────────────────────────────────────────────
const MiniHUD = ({ onExpand, locked = false, onReauth, rescanning = false }) => {
  const [visible, setVisible] = useState(false);
  const [input, setInput] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [micBlocked, setMicBlocked] = useState(false);
  // ── Screen recording state ──────────────────────────────────────────────
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [recElapsed, setRecElapsed]               = useState(0);   // seconds
  const [recFilename, setRecFilename]             = useState('');
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  // Track whether MiniHUD is already open so we don't double-greet
  const visibleRef = useRef(false);

  const SERVER = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const {
    sendCommand, thinking, speaking, listening, messages, socket, sessionId,
    wakeWordDetected, wakeWordHasCommand, voiceSupported,
  } = useJarvisContext();

  // ── Keep visibleRef in sync with visible state ───────────────────────────
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  // ── ALWAYS-ON wake word: active whenever this page is open (authenticated) ──
  // This is SEPARATE from the auth-time wake word in App.jsx.
  // When "Hello JARVIS" is detected here, pop the MiniHUD open and greet.
  const handleWakeWordOnWebsite = useCallback((transcript) => {
    if (locked) {
      // Locked state → trigger reauth instead
      onReauth?.();
      return;
    }
    if (visibleRef.current) return;  // Already open — don't double-greet
    setVisible(true);
    setPulseKey(k => k + 1);
    // Speak greeting
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('Hello sir, what can I do for you?');
      u.rate = 0.95; u.pitch = 0.85;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v =>
        v.name.toLowerCase().includes('google uk') ||
        v.name.toLowerCase().includes('ryan') ||
        v.name.toLowerCase().includes('daniel')
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
      if (preferred) u.voice = preferred;
      window.speechSynthesis.speak(u);
    }
    setTimeout(() => inputRef.current?.focus(), 350);
  }, [locked, onReauth]);

  // Wake word is detected by the shared useVoice instance in useJarvis (via JarvisContext).
  // The wakeWordDetected effect below (line ~800) handles the UI pop-up.
  // We do NOT run a separate useWakeWord here — that caused 3 concurrent listeners
  // (useWakeWord here + useVoice + useVADTranscribe) which doubled responses.
  const isWakeListeningOwn = listening; // reflect shared voice state

  // ── Page focus/blur → tell Electron overlay to pause its own WSR ─────────
  // When this page is focused: overlay pauses → only website handles wake word
  // When this page is hidden/blurred: overlay resumes → handles wake word
  useEffect(() => {
    const broadcast = (active) => {
      if (socket?.emit) {
        socket.emit('browser:hud-active', { active });
        console.log('[MiniHUD] browser:hud-active =>', active);
      }
    };

    const onFocus    = () => broadcast(true);
    const onBlur     = () => broadcast(false);
    const onVisible  = () => { if (!document.hidden) broadcast(true); else broadcast(false); };

    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisible);

    // Announce presence immediately on mount
    broadcast(!document.hidden);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisible);
      // Tell overlay to resume when website unmounts
      broadcast(false);
    };
  // Only re-run if socket changes — not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  // ── Screenshot toast state ───────────────────────────────────────────────
  const [toast, setToast] = useState({ visible: false });
  const [volumeWidget, setVolumeWidget] = useState({ visible: false, level: 0, muted: false });
  const volumeHideTimerRef = useRef(null);
  const [brightnessWidget, setBrightnessWidget] = useState({ visible: false, level: 0 });
  const brightnessHideTimerRef = useRef(null);
  const [sysCards, setSysCards] = useState([]);
  const sysCardsHideTimerRef = useRef(null);
  const [clipboardPanel, setClipboardPanel] = useState(null);
  const clipboardHideTimerRef = useRef(null);

  const showClipboardPanel = useCallback((panel, ttl = 8000) => {
    setClipboardPanel(panel);
    if (clipboardHideTimerRef.current) clearTimeout(clipboardHideTimerRef.current);
    clipboardHideTimerRef.current = setTimeout(() => setClipboardPanel(null), ttl);
  }, []);

  // ── Conversation Mode: help / status / reminder / sleep-mode / listening ──
  const [helpPanel, setHelpPanel] = useState(false);
  const helpHideTimerRef = useRef(null);
  const [statusPanel, setStatusPanel] = useState(null);
  const statusHideTimerRef = useRef(null);
  const [reminderNote, setReminderNote] = useState(null);
  const [sleepMode, setSleepMode] = useState(false);
  const [listeningPaused, setListeningPaused] = useState(false);

  // Local TTS helper (JARVIS voice) — reused for reminder announcements.
  const speakText = useCallback((text) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.toLowerCase().includes('google uk') ||
      v.name.toLowerCase().includes('ryan') ||
      v.name.toLowerCase().includes('daniel')
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  }, []);

  const showHelpPanel = useCallback(() => {
    setHelpPanel(true);
    if (helpHideTimerRef.current) clearTimeout(helpHideTimerRef.current);
    helpHideTimerRef.current = setTimeout(() => setHelpPanel(false), 15000);
  }, []);

  const showStatusPanel = useCallback((status) => {
    setStatusPanel(Array.isArray(status) ? status : []);
    if (statusHideTimerRef.current) clearTimeout(statusHideTimerRef.current);
    statusHideTimerRef.current = setTimeout(() => setStatusPanel(null), 12000);
  }, []);

  const showBrightnessWidget = useCallback((level) => {
    setBrightnessWidget({ visible: true, level: Math.max(0, Math.min(100, Number(level) || 0)) });
    if (brightnessHideTimerRef.current) clearTimeout(brightnessHideTimerRef.current);
    brightnessHideTimerRef.current = setTimeout(() => {
      setBrightnessWidget((prev) => ({ ...prev, visible: false }));
    }, 2000);
  }, []);

  const showSysCards = useCallback((cards) => {
    if (!cards || cards.length === 0) return;
    setSysCards(cards);
    if (sysCardsHideTimerRef.current) clearTimeout(sysCardsHideTimerRef.current);
    sysCardsHideTimerRef.current = setTimeout(() => setSysCards([]), 6000);
  }, []);

  const showVolumeWidget = useCallback((level, muted = false) => {
    setVolumeWidget({ visible: true, level: Math.max(0, Math.min(100, Number(level) || 0)), muted: !!muted });
    if (volumeHideTimerRef.current) clearTimeout(volumeHideTimerRef.current);
    volumeHideTimerRef.current = setTimeout(() => {
      setVolumeWidget((prev) => ({ ...prev, visible: false }));
    }, 2000);
  }, []);

  // ── Poll /api/jarvis/record/status every 2 seconds ──────────────────────
  useEffect(() => {
    const poll = async () => {
      if (document.hidden) return; // skip when tab is in background
      try {
        const res = await fetch(`${SERVER}/api/jarvis/record/status`);
        if (!res.ok) return;
        const data = await res.json();
        setIsScreenRecording(!!data.isRecording);
        setRecElapsed(data.elapsed || 0);
        if (data.filename) setRecFilename(data.filename);
      } catch { /* Python server not running yet — ignore */ }
    };
    poll(); // immediate first poll
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [SERVER]);

  // ── Format elapsed seconds as MM:SS ─────────────────────────────────────
  const fmtElapsed = (secs) => {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  // Listen for screenshot execution results via socket
  useEffect(() => {
    if (!socket) return;

    const handleResponse = (data) => {
      // ── Screenshot toasts ────────────────────────────────────────────────
      if (data?.action === 'take_screenshot') {
        const succeeded = data?.success !== false && data?.executionResult?.success !== false;
        const filename  = data?.executionResult?.filename || data?.executionResult?.path?.split('/').pop() || '';
        if (succeeded) {
          setToast({ visible: true, type: 'success', title: '📸 Screenshot saved', subtitle: filename || 'Saved to JARVIS/Screenshots/' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Screenshot failed', subtitle: data?.executionResult?.message || 'Screenshot failed' });
        }
      }

      // ── Recording toasts ─────────────────────────────────────────────────
      if (data?.action === 'record_start') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        if (ok) {
          setIsScreenRecording(true);
          setRecElapsed(0);
          const fn = data?.executionResult?.filename || '';
          if (fn) setRecFilename(fn);
          setToast({ visible: true, type: 'recording', title: '🔴 Recording started', subtitle: 'Screen recording is active' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Recording failed', subtitle: data?.executionResult?.message || 'Could not start recording' });
        }
      }

      if (data?.action === 'record_stop') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        setIsScreenRecording(false);
        if (ok) {
          const fn = data?.executionResult?.filename || recFilename;
          setToast({ visible: true, type: 'success', title: '✅ Recording saved', subtitle: fn || 'Saved to JARVIS/Recordings/' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Recording stop failed', subtitle: data?.executionResult?.message || 'Error stopping recording' });
        }
      }

      // ── Open file/folder toasts ────────────────────────────────────────────
      if (data?.action === 'open_file') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const exec = data?.executionResult || {};
        const path = exec.path || '';
        const inferredName = path.split(/[\\/]/).pop();
        const requested = exec.filename || data?.target || inferredName || 'file';
        if (ok) {
          setToast({
            visible: true,
            type: 'info',
            title: `📂 Opening ${requested}`,
            subtitle: path || requested,
          });
        } else {
          setToast({
            visible: true,
            type: 'error',
            title: `❌ File not found: ${requested}`,
            subtitle: 'Try saying the exact filename',
          });
        }
      }

      if (data?.action === 'open_folder') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const exec = data?.executionResult || {};
        const path = exec.path || '';
        const inferredName = path.split(/[\\/]/).pop();
        const requested = exec.foldername || data?.target || inferredName || 'folder';
        if (ok) {
          setToast({
            visible: true,
            type: 'info',
            title: `📁 Opening ${requested} folder`,
            subtitle: path || requested,
          });
        } else {
          setToast({
            visible: true,
            type: 'error',
            title: `❌ Folder not found: ${requested}`,
            subtitle: 'Try saying the exact folder name',
          });
        }
      }

      if (data?.action === 'open_app') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const app = data?.executionResult?.appname || data?.target || data?.executionResult?.path || 'app';
        if (ok) {
          setToast({
            visible: true,
            type: 'info',
            title: `🚀 Opening ${app}`,
            subtitle: data?.executionResult?.path || app,
          });
        } else {
          setToast({
            visible: true,
            type: 'error',
            title: `❌ App not found: ${app}`,
            subtitle: `Say "add app ${app}" to add it`,
          });
        }
      }

      if (data?.action === 'close_app') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const app = data?.executionResult?.appname || data?.target || 'app';
        setToast({
          visible: true,
          type: ok ? 'success' : 'error',
          title: ok ? `✅ ${app} closed` : `❌ Could not close ${app}`,
          subtitle: data?.executionResult?.message || '',
        });
      }

      if (data?.action === 'running_apps') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const apps = Array.isArray(data?.executionResult?.apps) ? data.executionResult.apps : [];
        if (ok) {
          setToast({
            visible: true,
            type: 'neutral',
            title: `🧩 Running apps (${apps.length})`,
            subtitle: apps.length ? apps.join(', ') : 'No tracked apps are currently open',
          });
        } else {
          setToast({
            visible: true,
            type: 'error',
            title: '❌ Failed to fetch running apps',
            subtitle: data?.executionResult?.message || 'Try again',
          });
        }
      }

      if (data?.action === 'web_search') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const query = data?.executionResult?.query || data?.target || data?.executionResult?.site || '';
        const engine = data?.executionResult?.engine || data?.details?.engine || 'google';
        setToast({
          visible: true,
          type: ok ? 'info' : 'error',
          title: ok ? `🔍 Searching ${engine} for ${query}` : '❌ Web search failed',
          subtitle: ok ? (data?.executionResult?.url || query) : (data?.executionResult?.message || 'Try again'),
        });
      }

      if (data?.action === 'open_website') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const site = data?.executionResult?.site || data?.target || 'website';
        setToast({
          visible: true,
          type: ok ? 'info' : 'error',
          title: ok ? `🌐 Opening ${site}` : `❌ Could not open ${site}`,
          subtitle: ok ? (data?.executionResult?.url || site) : (data?.executionResult?.message || 'Try again'),
        });
      }

      if (data?.action === 'browser_action') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const action = data?.executionResult?.action || data?.target || data?.executionResult?.message || '';
        const labelMap = {
          new_tab: '🗂 New tab opened',
          close_tab: '🧩 Tab closed',
          go_back: '↩️ Going back',
          refresh: '🔄 Refreshing page',
          zoom_in: '🔍 Zooming in',
          zoom_out: '🔎 Zooming out',
          close_browser: '🛑 Closing Chrome',
        };
        setToast({
          visible: true,
          type: ok ? 'neutral' : 'error',
          title: ok ? (labelMap[action] || `🧭 Browser action: ${action}`) : '❌ Browser action failed',
          subtitle: data?.executionResult?.message || action,
        });
      }

      if (data?.action === 'current_url') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const url = data?.executionResult?.url || '';
        setToast({
          visible: true,
          type: ok ? 'neutral' : 'error',
          title: ok ? '📋 Current URL' : '❌ Could not read current URL',
          subtitle: ok ? url : (data?.executionResult?.message || 'Try again'),
          copyable: ok,
          copyValue: ok ? url : '',
          duration: ok ? 8000 : 3500,
        });
      }

      if (data?.action === 'volume_up' || data?.action === 'volume_down' || data?.action === 'set_volume') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const level = Number(data?.executionResult?.level ?? 0);
        const muted = !!data?.executionResult?.muted;
        if (ok) {
          showVolumeWidget(level, muted);
          const titlePrefix = data?.action === 'volume_down' ? '🔉' : '🔊';
          const title = data?.action === 'set_volume' ? `🔊 Volume set to ${level}%` : `${titlePrefix} Volume: ${level}%`;
          setToast({ visible: true, type: 'neutral', title, subtitle: muted ? 'Muted' : '' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Volume control failed', subtitle: data?.executionResult?.message || 'Try again' });
        }
      }

      if (data?.action === 'mute' || data?.action === 'unmute' || data?.action === 'toggle_mute') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const muted = data?.executionResult?.muted === true || data?.executionResult?.status === 'muted';
        const level = Number(data?.executionResult?.level ?? volumeWidget.level ?? 0);
        if (ok) {
          showVolumeWidget(level, muted);
          setToast({
            visible: true,
            type: 'neutral',
            title: muted ? '🔇 Muted' : '🔊 Unmuted',
            subtitle: `Volume: ${level}%`,
          });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Mute action failed', subtitle: data?.executionResult?.message || 'Try again' });
        }
      }

      if (data?.action === 'get_volume') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const level = Number(data?.executionResult?.level ?? 0);
        const muted = !!data?.executionResult?.muted;
        if (ok) {
          showVolumeWidget(level, muted);
          setToast({
            visible: true,
            type: 'neutral',
            title: `🔊 Volume: ${level}%`,
            subtitle: muted ? 'Muted' : 'Sound on',
          });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Could not read volume', subtitle: data?.executionResult?.message || 'Try again' });
        }
      }

      if (data?.action === 'whatsapp_message') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const contact = er.contact || data?.details?.contact || 'contact';
        if (ok) {
          setToast({ visible: true, type: 'success', title: `💬 Message sent to ${contact}`, subtitle: '' });
        } else if (er.contactMissing) {
          setToast({ visible: true, type: 'error', title: `❌ Contact not found: ${data?.details?.contact || ''}`, subtitle: "Say 'add contact [name] [number]'" });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ WhatsApp message failed', subtitle: er.message || 'Try again' });
        }
      }

      if (data?.action === 'whatsapp_file') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const contact = er.contact || data?.details?.contact || 'contact';
        const fname = er.filename || data?.details?.filename || 'file';
        if (ok) {
          setToast({ visible: true, type: 'success', title: `📎 ${fname} sent to ${contact}`, subtitle: '' });
        } else if (er.contactMissing) {
          setToast({ visible: true, type: 'error', title: `❌ Contact not found: ${data?.details?.contact || ''}`, subtitle: "Say 'add contact [name] [number]'" });
        } else if (er.fileMissing) {
          setToast({ visible: true, type: 'error', title: `❌ File not found: ${data?.details?.filename || ''}`, subtitle: '' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ WhatsApp file send failed', subtitle: er.message || 'Try again' });
        }
      }

      if (data?.action === 'add_contact') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const name = er.name || data?.details?.name || 'Contact';
        if (ok) {
          setToast({ visible: true, type: 'success', title: `✅ ${name} added to contacts`, subtitle: er.phone || '' });
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Could not add contact', subtitle: er.message || 'Try again' });
        }
      }

      // ── SYSTEM: brightness bar ────────────────────────────────────────────
      if (data?.action === 'brightness_up' || data?.action === 'brightness_down' || data?.action === 'set_brightness') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const level = Number(data?.executionResult?.level ?? 0);
        if (ok) {
          showBrightnessWidget(level);
        } else {
          setToast({ visible: true, type: 'error', title: '❌ Brightness control failed', subtitle: data?.executionResult?.message || 'Try again' });
        }
      }

      // ── SYSTEM: power action toasts ───────────────────────────────────────
      if (['lock_screen', 'sleep', 'shutdown', 'restart', 'cancel_shutdown', 'logoff'].includes(data?.action)) {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const titles = {
          lock_screen: '🔒 Locking screen',
          sleep: '🌙 Going to sleep',
          shutdown: '⏻ Shutting down',
          restart: '🔄 Restarting',
          cancel_shutdown: '✖️ Shutdown cancelled',
          logoff: '👋 Logging off',
        };
        setToast({
          visible: true,
          type: ok ? 'info' : 'error',
          title: ok ? (titles[data.action] || 'System') : '❌ Action failed',
          subtitle: er.message || '',
        });
      }

      // ── SYSTEM: info cards (battery/ram/cpu/disk/ip) ──────────────────────
      if (['get_battery', 'get_ram', 'get_cpu', 'get_disk', 'get_ip', 'get_system_info'].includes(data?.action)) {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        if (!ok) {
          setToast({ visible: true, type: 'error', title: '❌ Could not read system info', subtitle: er.message || 'Try again' });
        } else {
          const cards = [];
          const bat = data.action === 'get_system_info' ? er.battery : (data.action === 'get_battery' ? er : null);
          const ram = data.action === 'get_system_info' ? er.ram : (data.action === 'get_ram' ? er : null);
          const cpu = data.action === 'get_system_info' ? er.cpu : (data.action === 'get_cpu' ? er : null);
          const disk = data.action === 'get_system_info' ? er.disk : (data.action === 'get_disk' ? er : null);
          const ip = data.action === 'get_system_info' ? er.ip : (data.action === 'get_ip' ? er : null);
          if (bat && bat.percent != null) {
            const p = Number(bat.percent);
            cards.push({ key: 'battery', icon: '🔋', title: `${p}%`,
              sub: `${bat.plugged ? 'Charging' : 'On Battery'}${bat.time_left ? ' • ' + bat.time_left : ''}`,
              pct: p, color: p > 50 ? 'var(--green)' : p > 20 ? 'var(--warn)' : 'var(--red)' });
          }
          if (ram && ram.total_gb != null) {
            cards.push({ key: 'ram', icon: '💾', title: `${ram.available_gb} GB Free`,
              sub: `${ram.total_gb} GB Total • ${ram.percent_used}% Used`,
              pct: Number(ram.percent_used) || 0, color: 'var(--blue)' });
          }
          if (cpu && cpu.percent != null) {
            cards.push({ key: 'cpu', icon: '⚡', title: `${cpu.percent}% Usage`,
              sub: `${cpu.cores} Cores • ${cpu.frequency_ghz} GHz`,
              pct: Number(cpu.percent) || 0, color: 'var(--cyan)' });
          }
          if (disk && disk.total_gb != null) {
            cards.push({ key: 'disk', icon: '💿', title: `${disk.free_gb} GB Free`,
              sub: `${disk.total_gb} GB Total • ${disk.percent_used}% Used`,
              pct: Number(disk.percent_used) || 0, color: 'var(--purple)' });
          }
          if (ip && ip.ip) {
            cards.push({ key: 'ip', icon: '🌐', title: ip.ip,
              sub: ip.hostname || 'Local IP', pct: null, color: 'var(--cyan)' });
          }
          if (cards.length) showSysCards(cards);
        }
      }

      // ── CLIPBOARD: content display (read) ─────────────────────────────────
      if (data?.action === 'read_clipboard') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        if (!ok) {
          setToast({ visible: true, type: 'error', title: '❌ Could not read clipboard', subtitle: er.message || 'Try again' });
        } else if (!er.text) {
          setToast({ visible: true, type: 'info', title: '📋 Clipboard is empty', subtitle: '' });
        } else {
          showClipboardPanel({ kind: 'content', text: String(er.text) });
        }
      }

      // ── CLIPBOARD: history panel ──────────────────────────────────────────
      if (data?.action === 'clipboard_history') {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const history = Array.isArray(er.history) ? er.history : [];
        if (!ok) {
          setToast({ visible: true, type: 'error', title: '❌ Could not read history', subtitle: er.message || 'Try again' });
        } else if (history.length === 0) {
          setToast({ visible: true, type: 'info', title: '📋 Clipboard history is empty', subtitle: '' });
        } else {
          showClipboardPanel({ kind: 'history', items: history }, 12000);
        }
      }

      // ── CLIPBOARD: quick-action toasts ────────────────────────────────────
      if (['simulate_copy', 'simulate_paste', 'simulate_cut', 'select_all', 'undo', 'redo', 'copy_text', 'paste_history', 'clear_clipboard', 'clear_history'].includes(data?.action)) {
        const ok = data?.success !== false && data?.executionResult?.success !== false;
        const er = data?.executionResult || {};
        const titles = {
          simulate_copy: '📋 Copied',
          copy_text: '📋 Copied to clipboard',
          simulate_paste: '📋 Pasted',
          paste_history: '📋 Pasted from history',
          simulate_cut: '✂️ Cut',
          select_all: '🔲 Selected all',
          undo: '↩️ Undone',
          redo: '↪️ Redone',
          clear_clipboard: '🗑️ Clipboard cleared',
          clear_history: '🗑️ History cleared',
        };
        setToast({
          visible: true,
          type: ok ? 'success' : 'error',
          title: ok ? (titles[data.action] || '📋 Done') : '❌ Clipboard action failed',
          subtitle: ok ? '' : (er.message || 'Try again'),
        });
      }
    };

    socket.on('jarvis:response', handleResponse);
    return () => socket.off('jarvis:response', handleResponse);
  }, [socket, showVolumeWidget, volumeWidget.level, showBrightnessWidget, showSysCards, showClipboardPanel]);

  // ── Conversation Mode socket events (help / status / reminder / mode) ──
  useEffect(() => {
    if (!socket) return;

    const onHelp = () => showHelpPanel();
    const onStatus = (data) => showStatusPanel(data?.status);
    const onReminder = (data) => {
      if (!data) return;
      setReminderNote({ text: data.text || 'Reminder', time: data.time || '' });
      speakText(data.speak || `Reminder: ${data.text || ''}`);
    };
    const onMode = (data) => {
      if (data?.mode === 'sleep') setSleepMode(true);
      else if (data?.mode === 'awake') setSleepMode(false);
    };
    const onListening = (data) => setListeningPaused(data?.listening === false);

    socket.on('jarvis:help', onHelp);
    socket.on('jarvis:status', onStatus);
    socket.on('jarvis:reminder', onReminder);
    socket.on('jarvis:mode', onMode);
    socket.on('jarvis:listening', onListening);
    return () => {
      socket.off('jarvis:help', onHelp);
      socket.off('jarvis:status', onStatus);
      socket.off('jarvis:reminder', onReminder);
      socket.off('jarvis:mode', onMode);
      socket.off('jarvis:listening', onListening);
    };
  }, [socket, showHelpPanel, showStatusPanel, speakText]);

  useEffect(() => () => {
    if (volumeHideTimerRef.current) clearTimeout(volumeHideTimerRef.current);
  }, []);

  const lastJarvisMsg = messages.filter(m => m.role === 'jarvis').slice(-1)[0];

  // ── Mic permission check on first mount ─────────────────────────────────
  useEffect(() => {
    if (!voiceSupported) return;
    navigator.permissions?.query({ name: 'microphone' }).then((result) => {
      if (result.state === 'denied') {
        setMicBlocked(true);
        console.warn('[MiniHUD] Microphone permission denied. Voice commands will not work.');
      }
      result.addEventListener('change', () => {
        setMicBlocked(result.state === 'denied');
      });
    }).catch(() => {/* permissions API not supported */});
  }, [voiceSupported]);

  // ── React to wake word detected by the shared useVoice instance ─────────
  // We no longer run a separate useWakeWord here to avoid double-recognition.
  // useVoice in useJarvis already detects wake words and calls sendCommand.
  // This effect just handles the UI pop-up response.
  const prevWakeWordRef = useRef(false);
  useEffect(() => {
    if (wakeWordDetected && !prevWakeWordRef.current) {
      if (locked) {
        onReauth?.();
      } else {
        setVisible(true);
        setPulseKey(k => k + 1);
        // Only greet when the wake word was spoken alone (no inline command).
        // If the user said "Hello JARVIS open Chrome", the command is already
        // being processed — skip the greeting to avoid the double-response.
        if (!wakeWordHasCommand) {
          const utterance = new SpeechSynthesisUtterance('Hello sir, what can I do for you?');
          utterance.rate = 0.95;
          utterance.pitch = 0.85;
          window.speechSynthesis.speak(utterance);
          setTimeout(() => inputRef.current?.focus(), 300);
        }
      }
    }
    prevWakeWordRef.current = wakeWordDetected;
  }, [wakeWordDetected, wakeWordHasCommand, locked, onReauth]);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  // Whether wake word is actively being listened for (own hook OR shared voice engine)
  const isWakeListening = isWakeListeningOwn || listening || (!visible && voiceSupported && !micBlocked);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    if (!input.trim()) return;
    const lower = input.toLowerCase();
    if (lower.includes('close') || lower.includes('hide')) {
        handleClose();
    } else {
        sendCommand(input.trim());
    }
    setInput('');
  }, [input, sendCommand, handleClose]);

  const toggleVoiceInput = useCallback(async () => {
    if (isRecordingVoice) {
      // Stop recording if already recording
      setIsRecordingVoice(false);
      return;
    }

    // Use MediaRecorder so we don't conflict with the shared wake-word SpeechRecognition
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const chunks = [];
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recognitionRef.current = rec;

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setIsRecordingVoice(false);
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 400) return;
        try {
          const b64 = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result.split(',')[1]);
            r.onerror = rej;
            r.readAsDataURL(blob);
          });
          const SERVER = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
          const resp = await fetch(`${SERVER}/api/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: b64, mimeType: mime }),
          });
          const { transcript: text = '' } = await resp.json();
          if (!text) return;
          if (text.toLowerCase().includes('close') || text.toLowerCase().includes('hide')) {
            handleClose();
          } else {
            sendCommand(text);
          }
        } catch (err) {
          console.warn('[MiniHUD] Transcribe failed:', err.message);
        }
      };

      rec.start();
      setIsRecordingVoice(true);
      // Auto-stop after 5 seconds
      setTimeout(() => {
        if (rec.state !== 'inactive') rec.stop();
      }, 5000);
    } catch (err) {
      console.error('[MiniHUD] getUserMedia failed:', err.message);
    }
  }, [isRecordingVoice, sendCommand, handleClose]);

  const handleAction = (cmd) => sendCommand(cmd);

  const arcState = thinking ? 'thinking' : speaking ? 'speaking' : listening ? 'listening' : 'idle';
  const arcColor = arcState === 'thinking' ? 'var(--gold)' : arcState === 'speaking' ? 'var(--green)' : arcState === 'listening' ? 'var(--red)' : 'var(--cyan)';

  // ── Shared red REC indicator (shown in all states when recording) ─────────
  const RecDot = isScreenRecording ? (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9050,
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(var(--shadow-rgb),0.7)', backdropFilter: 'blur(8px)',
      border: '1px solid rgba(var(--red-rgb),0.5)',
      borderRadius: 20, padding: '4px 10px',
      pointerEvents: 'none',
    }}>
      <style>{`
        @keyframes recPulse {
          0%,100%{opacity:1;transform:scale(1)}
          50%{opacity:0.4;transform:scale(1.3)}
        }
      `}</style>
      <div style={{
        width: 8, height: 8, borderRadius: '50%',
        background: 'var(--red)', boxShadow: '0 0 8px var(--red)',
        animation: 'recPulse 1s ease-in-out infinite',
      }} />
      <span style={{ fontFamily: 'var(--font-hud,monospace)', fontSize: 9, color: 'var(--red)', letterSpacing: '0.12em', fontWeight: 700 }}>
        REC {fmtElapsed(recElapsed)}
      </span>
    </div>
  ) : null;

  const VolumeBar = volumeWidget.visible ? (
    <div style={{
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9060,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      background: 'rgba(var(--surface-1-rgb),0.9)',
      border: '1px solid rgba(var(--blue-rgb),0.45)',
      borderRadius: 10,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 0 20px rgba(var(--blue-rgb),0.2), 0 10px 26px rgba(var(--shadow-rgb),0.45)',
      pointerEvents: 'none',
    }}>
      <div style={{ width: 140, height: 8, borderRadius: 999, background: 'rgba(var(--slate-rgb),0.25)', overflow: 'hidden' }}>
        <div style={{
          width: `${volumeWidget.level}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--cyan), var(--blue))',
          transition: 'width 220ms ease',
        }} />
      </div>
      <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'var(--blue)', letterSpacing: '0.08em', minWidth: 40 }}>
        {volumeWidget.level}%
      </span>
    </div>
  ) : null;

  const MuteIndicator = volumeWidget.muted ? (
    <div style={{
      position: 'fixed',
      top: isScreenRecording ? 52 : 20,
      right: 20,
      zIndex: 9061,
      padding: '4px 10px',
      borderRadius: 20,
      border: '1px solid rgba(var(--red-rgb),0.45)',
      background: 'rgba(var(--shadow-rgb),0.68)',
      color: 'var(--red)',
      fontFamily: 'var(--font-hud)',
      fontSize: '10px',
      letterSpacing: '0.1em',
      pointerEvents: 'none',
    }}>
      🔇 MUTED
    </div>
  ) : null;

  const BrightnessBar = brightnessWidget.visible ? (
    <div style={{
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9060,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      background: 'rgba(var(--surface-warm-rgb),0.9)',
      border: '1px solid rgba(var(--warn-rgb),0.5)',
      borderRadius: 10,
      backdropFilter: 'blur(10px)',
      boxShadow: '0 0 20px rgba(var(--warn-rgb),0.2), 0 10px 26px rgba(var(--shadow-rgb),0.45)',
      pointerEvents: 'none',
    }}>
      <div style={{ width: 140, height: 8, borderRadius: 999, background: 'rgba(var(--slate-rgb),0.25)', overflow: 'hidden' }}>
        <div style={{
          width: `${brightnessWidget.level}%`,
          height: '100%',
          background: 'linear-gradient(90deg, var(--warn), var(--gold))',
          transition: 'width 220ms ease',
        }} />
      </div>
      <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'var(--warn)', letterSpacing: '0.08em', minWidth: 40 }}>
        🔆 {brightnessWidget.level}%
      </span>
    </div>
  ) : null;

  const SysCards = sysCards.length > 0 ? (
    <div style={{
      position: 'fixed',
      top: isScreenRecording ? 56 : 24,
      right: 20,
      zIndex: 9062,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}>
      {sysCards.map((c) => (
        <div key={c.key} style={{
          minWidth: 220,
          padding: '10px 14px',
          background: 'rgba(var(--surface-1-rgb),0.92)',
          border: `1px solid ${c.color}66`,
          borderRadius: 10,
          backdropFilter: 'blur(10px)',
          boxShadow: `0 0 18px ${c.color}22, 0 10px 24px rgba(var(--shadow-rgb),0.45)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{c.icon}</span>
            <span style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: 700, color: 'var(--halo)' }}>{c.title}</span>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(var(--halo-rgb),0.6)', marginBottom: c.pct != null ? 6 : 0 }}>
            {c.sub}
          </div>
          {c.pct != null && (
            <div style={{ width: '100%', height: 6, borderRadius: 999, background: 'rgba(var(--slate-rgb),0.25)', overflow: 'hidden' }}>
              <div style={{ width: `${c.pct}%`, height: '100%', background: c.color, transition: 'width 260ms ease' }} />
            </div>
          )}
        </div>
      ))}
    </div>
  ) : null;

  const clipboardAction = (path, body) => {
    fetch(`${SERVER}/api/jarvis/clipboard/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    }).catch(() => { /* Python server not running — ignore */ });
  };

  const clipBtnStyle = (color, small = false) => ({
    padding: small ? '3px 8px' : '7px 12px',
    background: `${color}22`,
    border: `1px solid ${color}66`,
    borderRadius: 5,
    color,
    fontFamily: 'var(--font-hud)',
    fontSize: small ? '9px' : '10px',
    letterSpacing: '0.08em',
    cursor: 'pointer',
    flex: small ? '0 0 auto' : 1,
  });

  const ClipboardPanel = clipboardPanel ? (
    <div style={{
      position: 'fixed',
      top: isScreenRecording ? 56 : 24,
      right: 20,
      zIndex: 9063,
      width: 300,
      maxHeight: '60vh',
      overflowY: 'auto',
      padding: '12px 14px',
      background: 'rgba(var(--surface-1-rgb),0.95)',
      border: '1px solid rgba(var(--sky-rgb),0.4)',
      borderRadius: 10,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 0 22px rgba(var(--sky-rgb),0.18), 0 12px 28px rgba(var(--shadow-rgb),0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--sky)' }}>
          📋 {clipboardPanel.kind === 'history' ? 'CLIPBOARD HISTORY' : 'CLIPBOARD CONTENT'}
        </span>
        <span
          onClick={() => setClipboardPanel(null)}
          style={{ cursor: 'pointer', color: 'rgba(var(--halo-rgb),0.4)', fontSize: '14px', lineHeight: 1 }}
        >✕</span>
      </div>

      {clipboardPanel.kind === 'content' && (
        <>
          <div style={{
            maxHeight: 160, overflowY: 'auto',
            fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(var(--halo-rgb),0.85)',
            background: 'rgba(var(--shadow-rgb),0.35)', border: '1px solid rgba(var(--halo-rgb),0.08)',
            borderRadius: 6, padding: '8px 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {clipboardPanel.text}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={() => clipboardAction('copy', { text: clipboardPanel.text })} style={clipBtnStyle('var(--sky)')}>COPY AGAIN</button>
            <button onClick={() => { clipboardAction('clear'); setClipboardPanel(null); }} style={clipBtnStyle('var(--red)')}>CLEAR</button>
          </div>
        </>
      )}

      {clipboardPanel.kind === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {clipboardPanel.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(var(--shadow-rgb),0.3)', border: '1px solid rgba(var(--halo-rgb),0.07)',
              borderRadius: 6, padding: '6px 8px',
            }}>
              <span style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', color: 'var(--sky)', minWidth: 16 }}>{i + 1}.</span>
              <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(var(--halo-rgb),0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {String(item).slice(0, 50)}
              </span>
              <button onClick={() => clipboardAction('paste-history', { index: i + 1 })} style={clipBtnStyle('var(--sky)', true)}>PASTE</button>
              <button onClick={() => clipboardAction('copy', { text: item })} style={clipBtnStyle('var(--slate)', true)}>COPY</button>
            </div>
          ))}
        </div>
      )}
    </div>
  ) : null;

  // ── HELP PANEL ───────────────────────────────────────────────────────────
  const HELP_SECTIONS = [
    { icon: '📸', title: 'CAPTURE', items: ['Take a screenshot', 'Start / Stop recording'] },
    { icon: '📁', title: 'FILES & FOLDERS', items: ['Open file [name]', 'Open folder [name]', 'Copy / Move / Delete [file]'] },
    { icon: '🚀', title: 'APPS', items: ['Open / Close [app]', 'What apps are running'] },
    { icon: '🌐', title: 'BROWSER', items: ['Search [query] on Google', 'Open [website]'] },
    { icon: '🔊', title: 'SYSTEM', items: ['Volume up / down / mute', 'Brightness up / down', 'Lock / Sleep / Shutdown'] },
    { icon: '💬', title: 'WHATSAPP', items: ['Send message to [contact]', 'Send [file] to [contact]'] },
    { icon: '📋', title: 'CLIPBOARD', items: ['Copy / Paste / Cut that', "What's on my clipboard?"] },
    { icon: 'ℹ️', title: 'INFO', items: ['Battery / RAM / CPU / Disk', 'What time / date is it?'] },
    { icon: '⏰', title: 'REMINDERS', items: ['Remind me to [task] at [time]', 'What are my reminders?'] },
  ];
  const HelpPanel = helpPanel ? (
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 9070, width: 420, maxHeight: '78vh', overflowY: 'auto',
      padding: '18px 20px', background: 'rgba(var(--surface-1-rgb),0.97)',
      border: '1px solid rgba(var(--cyan-rgb),0.4)', borderRadius: 14,
      backdropFilter: 'blur(16px)', boxShadow: '0 0 40px rgba(var(--cyan-rgb),0.16), 0 20px 60px rgba(var(--shadow-rgb),0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '15px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--cyan)' }}>
          ❓ WHAT I CAN DO
        </span>
        <span onClick={() => setHelpPanel(false)} style={{ cursor: 'pointer', color: 'rgba(var(--halo-rgb),0.5)', fontSize: '18px', lineHeight: 1 }}>✕</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {HELP_SECTIONS.map((s) => (
          <div key={s.title} style={{ background: 'rgba(var(--shadow-rgb),0.3)', border: '1px solid rgba(var(--halo-rgb),0.07)', borderRadius: 8, padding: '9px 11px' }}>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--sky)', marginBottom: 6 }}>
              {s.icon} {s.title}
            </div>
            {s.items.map((it, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(var(--halo-rgb),0.78)', marginBottom: 3 }}>• {it}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // ── STATUS PANEL ─────────────────────────────────────────────────────────
  const STATE_COLORS = { online: 'var(--green)', offline: 'var(--red)', warning: 'var(--gold)' };
  const StatusPanel = statusPanel ? (
    <div style={{
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      zIndex: 9070, width: 320, padding: '18px 20px',
      background: 'rgba(var(--surface-1-rgb),0.97)', border: '1px solid rgba(var(--cyan-rgb),0.4)', borderRadius: 14,
      backdropFilter: 'blur(16px)', boxShadow: '0 0 40px rgba(var(--cyan-rgb),0.16), 0 20px 60px rgba(var(--shadow-rgb),0.6)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '15px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--cyan)' }}>
          📊 JARVIS STATUS
        </span>
        <span onClick={() => setStatusPanel(null)} style={{ cursor: 'pointer', color: 'rgba(var(--halo-rgb),0.5)', fontSize: '18px', lineHeight: 1 }}>✕</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {statusPanel.map((svc) => (
          <div key={svc.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: STATE_COLORS[svc.state] || 'var(--slate)', boxShadow: `0 0 8px ${STATE_COLORS[svc.state] || 'var(--slate)'}` }} />
            <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(var(--halo-rgb),0.85)' }}>{svc.name}</span>
            <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', letterSpacing: '0.08em', color: STATE_COLORS[svc.state] || 'var(--slate)' }}>
              {(svc.state || '').toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  // ── REMINDER NOTIFICATION ────────────────────────────────────────────────
  const ReminderNote = reminderNote ? (
    <div style={{
      position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9075, minWidth: 280, maxWidth: 380, padding: '14px 18px',
      background: 'linear-gradient(135deg, rgba(var(--surface-warm-rgb),0.97), rgba(var(--surface-warm-rgb),0.98))',
      border: '1px solid rgba(var(--gold-rgb),0.55)', borderRadius: 12,
      backdropFilter: 'blur(14px)', boxShadow: '0 0 30px rgba(var(--gold-rgb),0.25), 0 12px 32px rgba(var(--shadow-rgb),0.5)',
      animation: 'reminderPulse 1.4s ease-in-out infinite',
    }}>
      <style>{`@keyframes reminderPulse {0%,100%{box-shadow:0 0 24px rgba(var(--gold-rgb),0.2),0 12px 32px rgba(var(--shadow-rgb),0.5)}50%{box-shadow:0 0 40px rgba(var(--gold-rgb),0.45),0 12px 32px rgba(var(--shadow-rgb),0.5)}}`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', letterSpacing: '0.1em', color: 'var(--gold)', marginBottom: 4 }}>REMINDER</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--halo)' }}>{reminderNote.text}</div>
          {reminderNote.time && <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(var(--halo-rgb),0.55)', marginTop: 2 }}>{reminderNote.time}</div>}
        </div>
        <span onClick={() => setReminderNote(null)} style={{ cursor: 'pointer', color: 'rgba(var(--halo-rgb),0.5)', fontSize: '15px', lineHeight: 1 }}>✕</span>
      </div>
    </div>
  ) : null;

  // ── SLEEP MODE OVERLAY ───────────────────────────────────────────────────
  const SleepOverlay = sleepMode ? (
    <div
      onClick={() => setSleepMode(false)}
      title='Say "Hello JARVIS" or click to wake'
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9068,
        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px',
        background: 'linear-gradient(135deg, rgba(var(--surface-1-rgb),0.92), rgba(var(--surface-1-rgb),0.95))',
        border: '1px solid rgba(var(--slate-rgb),0.35)', borderRadius: 30,
        backdropFilter: 'blur(12px)', boxShadow: '0 4px 20px rgba(var(--shadow-rgb),0.5)',
        cursor: 'pointer', userSelect: 'none',
      }}>
      <span style={{ fontSize: 14 }}>😴</span>
      <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', letterSpacing: '0.15em', color: 'rgba(var(--slate-rgb),0.8)' }}>
        JARVIS SLEEPING
      </span>
    </div>
  ) : null;

  const ConvPanels = (
    <>
      {HelpPanel}
      {StatusPanel}
      {ReminderNote}
      {SleepOverlay}
    </>
  );

  // ── LOCKED STATE ─────────────────────────────────────────────────────────
  if (locked) {
    return (
      <>
        {RecDot}
        {VolumeBar}
        {MuteIndicator}
        {BrightnessBar}
        {SysCards}
        {ClipboardPanel}
        {ConvPanels}
        <ToastNotification toast={toast} onDone={() => setToast({ visible: false })} />
        <div
          onClick={rescanning ? undefined : onReauth}
          title={rescanning ? 'Scanning...' : 'Click or say "authenticate me" to unlock'}
          style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
            display: 'flex', alignItems: 'center', gap: '9px',
            padding: '8px 14px',
            background: 'linear-gradient(135deg, rgba(var(--surface-danger-rgb),0.94), rgba(var(--surface-danger-rgb),0.96))',
            border: `1px solid ${rescanning ? 'rgba(var(--gold-rgb),0.45)' : 'rgba(var(--red-rgb),0.4)'}`,
            borderRadius: '30px',
            boxShadow: rescanning
              ? '0 0 16px rgba(var(--gold-rgb),0.2), 0 4px 20px rgba(var(--shadow-rgb),0.5)'
              : '0 0 14px rgba(var(--red-rgb),0.15), 0 4px 20px rgba(var(--shadow-rgb),0.5)',
            cursor: rescanning ? 'default' : 'pointer',
            backdropFilter: 'blur(14px)',
            transition: 'all 0.3s ease',
            userSelect: 'none',
            animation: rescanning ? 'none' : 'lockedPulse 3s ease-in-out infinite',
          }}
        >
          <style>{`
            @keyframes lockedPulse {
              0%,100%{box-shadow:0 0 14px rgba(var(--red-rgb),0.15),0 4px 20px rgba(var(--shadow-rgb),0.5)}
              50%{box-shadow:0 0 22px rgba(var(--red-rgb),0.35),0 4px 20px rgba(var(--shadow-rgb),0.5)}
            }
            @keyframes scanSpin {
              from{transform:rotate(0deg)} to{transform:rotate(360deg)}
            }
          `}</style>

          {/* Icon */}
          {rescanning ? (
            <div style={{
              width: 10, height: 10, borderRadius: '50%',
              border: '1.5px solid rgba(var(--gold-rgb),0.8)',
              borderTopColor: 'transparent',
              animation: 'scanSpin 0.9s linear infinite',
            }} />
          ) : (
            <ShieldOff size={10} style={{ color: 'rgba(var(--red-rgb),0.85)' }} />
          )}

          <span style={{
            fontFamily: 'var(--font-hud)', fontSize: '10px',
            color: rescanning ? 'rgba(var(--gold-rgb),0.8)' : 'rgba(var(--red-rgb),0.8)',
            letterSpacing: '0.15em',
          }}>
            {rescanning ? 'SCANNING' : 'LOCKED'}
          </span>

          {/* Mic icon when listening for "authenticate me" */}
          {isWakeListening && !rescanning && (
            <Mic size={9} style={{ color: 'rgba(var(--red-rgb),0.4)' }} />
          )}
        </div>
      </>
    );
  }

  // ── COLLAPSED — normal unlocked pill ─────────────────────────────────────
  if (!visible) {
    return (
      <>
        {RecDot}
        {VolumeBar}
        {MuteIndicator}
        {BrightnessBar}
        {SysCards}
        {ClipboardPanel}
        {ConvPanels}
        <ToastNotification toast={toast} onDone={() => setToast({ visible: false })} />
        <div
          onClick={() => setVisible(true)}
          style={{
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '8px 14px',
            background: 'linear-gradient(135deg, rgba(var(--surface-2-rgb),0.92), rgba(var(--surface-1-rgb),0.95))',
            border: `1px solid ${
              micBlocked ? 'rgba(var(--gold-rgb),0.5)'
              : isWakeListening ? 'rgba(var(--cyan-rgb),0.5)'
              : 'rgba(var(--cyan-rgb),0.2)'
            }`,
            borderRadius: '30px',
            boxShadow: micBlocked
              ? '0 0 16px rgba(var(--gold-rgb),0.2), 0 4px 20px rgba(var(--shadow-rgb),0.5)'
              : isWakeListening
              ? '0 0 20px rgba(var(--cyan-rgb),0.25), 0 4px 20px rgba(var(--shadow-rgb),0.5)'
              : '0 4px 20px rgba(var(--shadow-rgb),0.4)',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            transition: 'all 0.3s ease',
            userSelect: 'none',
          }}
          title={micBlocked ? 'Microphone blocked! Click to open — allow mic in browser settings.' : 'Say "JARVIS" or click to open'}
        >
          <div style={{ position: 'relative', width: 10, height: 10 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: micBlocked ? 'var(--gold)' : arcColor,
              boxShadow: `0 0 6px ${micBlocked ? 'var(--gold)' : arcColor}`,
              animation: isWakeListening && !micBlocked ? 'pulse 2s ease-in-out infinite' : 'none',
            }} />
          </div>
          <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: micBlocked ? 'rgba(var(--gold-rgb),0.8)' : 'rgba(var(--cyan-rgb),0.8)', letterSpacing: '0.15em' }}>
            J.A.R.V.I.S
          </span>
          {micBlocked && (
            <MicOff size={10} style={{ color: 'rgba(var(--gold-rgb),0.7)' }} />
          )}
          {!micBlocked && isWakeListening && (
            <Mic size={10} style={{ color: 'rgba(var(--cyan-rgb),0.5)' }} />
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {RecDot}
      {VolumeBar}
      {MuteIndicator}
      {BrightnessBar}
      {SysCards}
      {ClipboardPanel}
      {ConvPanels}
      <ToastNotification toast={toast} onDone={() => setToast({ visible: false })} />
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px', zIndex: 8000,
        width: '340px',
        background: 'linear-gradient(135deg, rgba(var(--surface-1-rgb),0.97), rgba(var(--surface-1-rgb),0.98))',
        border: `1px solid rgba(var(--cyan-rgb),0.35)`,
        borderRadius: '16px',
        boxShadow: '0 0 40px rgba(var(--cyan-rgb),0.12), 0 20px 60px rgba(var(--shadow-rgb),0.6)',
        backdropFilter: 'blur(20px)',
        overflow: 'hidden',
        animation: 'slideUpIn 0.25s ease-out',
      }}>
      <style>{`
        @keyframes slideUpIn { from { opacity:0; transform:translateY(20px) scale(0.95); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes miniPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.15)} }
      `}</style>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        background: 'rgba(var(--cyan-rgb),0.04)',
        borderBottom: '1px solid rgba(var(--cyan-rgb),0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: arcColor,
            boxShadow: `0 0 6px ${arcColor}`,
            animation: arcState !== 'idle' ? 'miniPulse 1.5s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: 'var(--cyan)', letterSpacing: '0.2em' }}>
            J.A.R.V.I.S
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button onClick={onExpand} title="Expand" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--cyan-rgb),0.5)' }}>
            <Maximize2 size={12} />
          </button>
          <button onClick={handleClose} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(var(--halo-rgb),0.3)' }}>
            <X size={12} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', padding: '10px' }}>
        {[
          { icon: <Camera size={12}/>, label: 'Snap', cmd: 'Take a screenshot' },
          { icon: <FileText size={12}/>, label: 'Scan', cmd: 'Scan current page' },
          { icon: <Search size={12}/>, label: 'Search', cmd: 'Search the web' },
          isScreenRecording
            ? { icon: <span style={{ fontSize: 10 }}>⏹</span>, label: 'Stop Rec', cmd: 'Stop recording', _red: true }
            : { icon: <span style={{ fontSize: 10 }}>🔴</span>, label: 'Record', cmd: 'Start recording' },
        ].map((btn, i) => (
          <button key={i} onClick={() => handleAction(btn.cmd)} style={{
            background: btn._red ? 'rgba(var(--red-rgb),0.1)' : 'rgba(var(--cyan-rgb),0.05)',
            border: `1px solid ${btn._red ? 'rgba(var(--red-rgb),0.3)' : 'rgba(var(--cyan-rgb),0.1)'}`,
            borderRadius: '8px', padding: '8px 4px',
            color: btn._red ? 'var(--red)' : 'var(--cyan)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer'
          }}>
            {btn.icon}
            <span style={{ fontSize: '8px', fontFamily: 'var(--font-hud)' }}>{btn.label}</span>
          </button>
        ))}
      </div>

      {/* Last JARVIS message preview */}
      {lastJarvisMsg && (
        <div style={{
          margin: '0 14px',
          padding: '8px 10px',
          background: 'rgba(var(--cyan-rgb),0.04)',
          border: '1px solid rgba(var(--cyan-rgb),0.1)',
          borderLeft: '2px solid rgba(var(--cyan-rgb),0.4)',
          borderRadius: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'rgba(var(--text-rgb),0.7)',
          lineHeight: 1.5,
          maxHeight: '60px',
          overflowY: 'auto',
          wordBreak: 'break-word',
        }}>
          {String(lastJarvisMsg.content || '').substring(0, 200)}
          {(lastJarvisMsg.content || '').length > 200 ? '…' : ''}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '6px', padding: '0 14px 14px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }}
          placeholder="Ask JARVIS..."
          style={{
            flex: 1, background: 'rgba(var(--cyan-rgb),0.05)',
            border: '1px solid rgba(var(--cyan-rgb),0.3)', borderRadius: '8px',
            padding: '7px 10px', color: 'white', fontSize: '12px', outline: 'none',
            fontFamily: 'var(--font-mono)',
          }}
        />
        <button type="button" onClick={toggleVoiceInput} title={isRecordingVoice ? 'Stop recording' : 'Voice input'} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: isRecordingVoice ? 'rgba(var(--red-rgb),0.3)' : 'rgba(var(--cyan-rgb),0.1)',
            color: isRecordingVoice ? 'var(--red)' : 'var(--cyan)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, boxShadow: isRecordingVoice ? '0 0 12px rgba(var(--red-rgb),0.4)' : 'none',
            animation: isRecordingVoice ? 'miniPulse 0.8s ease-in-out infinite' : 'none',
        }}>
          {isRecordingVoice ? <MicOff size={12} /> : <Mic size={12} />}
        </button>
        <button type="submit" disabled={!input.trim() || thinking} title="Send" style={{
            width: 30, height: 30, borderRadius: '8px', border: '1px solid rgba(var(--cyan-rgb),0.4)',
            background: input.trim() && !thinking ? 'rgba(var(--cyan-rgb),0.15)' : 'rgba(var(--cyan-rgb),0.04)',
            color: input.trim() && !thinking ? 'var(--cyan)' : 'rgba(var(--cyan-rgb),0.3)',
            cursor: input.trim() && !thinking ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: '14px', transition: 'all 0.2s',
        }}>
          ➤
        </button>
      </form>

      {/* Wake word indicator */}
      <div style={{ padding: '4px 14px 8px', fontFamily: 'var(--font-hud)', fontSize: '7px', color: 'rgba(var(--cyan-rgb),0.3)', letterSpacing: '0.1em' }}>
        Say "JARVIS close" to minimize · Wake word resumes on close
      </div>
    </div>
    </>
  );
};

export default MiniHUD;
