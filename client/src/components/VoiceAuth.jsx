import React, { useEffect, useRef, useState, useCallback } from 'react';
import ArcReactor from './ArcReactor';
import ScanLine from './ScanLine';

// ─── Face Verification Widget ────────────────────────────────────────────────
const FaceVerifyWidget = ({ onAuthenticated, onError }) => {
  const [fStatus, setFStatus] = useState('init'); // init|loading|scanning|match|nomatch|error|no-face
  const [distance, setDistance] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cancelledRef = useRef(false);

  const stopCam = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const run = useCallback(async () => {
    cancelledRef.current = false;
    setDistance(null);
    setFStatus('loading');
    try {
      // Fetch stored face descriptor
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const profileRes = await fetch(`${SERVER_URL}/api/auth/face-profile`);
      const profile = await profileRes.json();
      if (!profile.faceEnrolled || !profile.descriptor) {
        setFStatus('no-profile');
        return;
      }

      // Load face-api models (they cache after first load)
      const faceapi = await import('face-api.js');
      const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      if (cancelledRef.current) return;

      // Start webcam
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise(r => { videoRef.current.onloadedmetadata = r; });
        videoRef.current.play();
        // Let video stabilize
        await new Promise(r => setTimeout(r, 600));
      }
      if (cancelledRef.current) { stopCam(); return; }
      setFStatus('scanning');

      // Collect up to 5 good face detections, keep the best match
      const SCAN_ROUNDS = 16;   // max frames (~8 seconds)
      const MAX_SAMPLES = 5;    // stop early once we have enough
      const detections  = [];

      for (let i = 0; i < SCAN_ROUNDS; i++) {
        if (cancelledRef.current || !videoRef.current) break;
        await new Promise(r => setTimeout(r, 500));
        try {
          const d = await faceapi
            .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.40 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (d) {
            detections.push(d);
            if (detections.length >= MAX_SAMPLES) break;
          }
        } catch { /* skip frame */ }
      }

      if (cancelledRef.current) { stopCam(); return; }

      if (detections.length === 0) {
        setFStatus('no-face');
        stopCam();
        return;
      }

      // Compare every detection, take the BEST (lowest) distance
      const storedDesc = new Float32Array(profile.descriptor);
      let bestDist = Infinity;
      for (const d of detections) {
        const dist = faceapi.euclideanDistance(d.descriptor, storedDesc);
        if (dist < bestDist) bestDist = dist;
      }

      setDistance(Number(bestDist.toFixed(3)));
      const THRESHOLD = 0.50; // balanced — strict enough to reject strangers, lenient for lighting/angle
      const isMatch = bestDist < THRESHOLD;
      setFStatus(isMatch ? 'match' : 'nomatch');
      stopCam();
      if (isMatch) setTimeout(() => onAuthenticated?.({ face: true, distance: bestDist }), 700);
    } catch (err) {
      if (!cancelledRef.current) { setFStatus('error'); onError?.(err.message); }
    }
  }, [retryCount]);

  useEffect(() => {
    run();
    return () => { cancelledRef.current = true; stopCam(); };
  }, [run]);

  const handleRetry = () => {
    stopCam();
    setRetryCount(c => c + 1);
  };

  if (fStatus === 'no-profile') return null; // No face enrolled — don't show widget

  const statusMap = {
    init:       { color: 'var(--cyan)', label: 'INITIALIZING...' },
    loading:    { color: 'var(--cyan)', label: 'LOADING FACE AI...' },
    scanning:   { color: 'var(--gold)', label: 'SCANNING FACE...' },
    match:      { color: 'var(--green)', label: '✓ FACE VERIFIED' },
    nomatch:    { color: 'var(--red)', label: '✗ FACE NOT RECOGNIZED' },
    'no-face':  { color: 'var(--red)', label: '✗ NO FACE DETECTED' },
    error:      { color: 'var(--red)', label: '⚠ CAMERA ERROR' },
  };
  const st = statusMap[fStatus] || statusMap.init;
  const canRetry = fStatus === 'nomatch' || fStatus === 'no-face' || fStatus === 'error';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', letterSpacing: '0.2em', color: 'var(--text-muted)' }}>FACE BIOMETRIC</div>
      <div style={{ position: 'relative', width: '160px', height: '120px', borderRadius: '6px', overflow: 'hidden', border: `1px solid ${st.color}44`, background: 'var(--bg-deep)' }}>
        <video ref={videoRef} width={160} height={120} muted playsInline autoPlay style={{ objectFit: 'cover', transform: 'scaleX(-1)', opacity: (fStatus === 'scanning' || fStatus === 'match' || fStatus === 'nomatch') ? 1 : 0.3 }} />
        {/* Scan overlay */}
        {fStatus === 'scanning' && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(var(--cyan-rgb),0.12) 50%, transparent 60%)', animation: 'faceScan 1.5s linear infinite' }} />
        )}
        {/* Match/nomatch overlay */}
        {(fStatus === 'match' || fStatus === 'nomatch') && (
          <div style={{ position: 'absolute', inset: 0, background: fStatus === 'match' ? 'rgba(var(--green-rgb),0.2)' : 'rgba(var(--red-rgb),0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: '32px' }}>{fStatus === 'match' ? '✓' : '✗'}</span>
          </div>
        )}
        {/* Corner brackets */}
        <div style={{ position: 'absolute', top: 6, left: 6, width: 14, height: 14, borderTop: `1.5px solid ${st.color}`, borderLeft: `1.5px solid ${st.color}` }} />
        <div style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderTop: `1.5px solid ${st.color}`, borderRight: `1.5px solid ${st.color}` }} />
        <div style={{ position: 'absolute', bottom: 6, left: 6, width: 14, height: 14, borderBottom: `1.5px solid ${st.color}`, borderLeft: `1.5px solid ${st.color}` }} />
        <div style={{ position: 'absolute', bottom: 6, right: 6, width: 14, height: 14, borderBottom: `1.5px solid ${st.color}`, borderRight: `1.5px solid ${st.color}` }} />
      </div>
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '9px', fontWeight: '600', color: st.color, letterSpacing: '0.15em', textShadow: `0 0 8px ${st.color}`, animation: fStatus === 'scanning' ? 'blink 1s ease-in-out infinite' : 'none' }}>
        {st.label}
        {distance != null && <span style={{ marginLeft: '8px', opacity: 0.5, fontWeight: '400' }}>d={distance}</span>}
      </div>
      {canRetry && (
        <button onClick={handleRetry} style={{ padding: '4px 14px', background: 'transparent', border: '1px solid rgba(var(--cyan-rgb),0.3)', borderRadius: '3px', color: 'var(--cyan)', fontFamily: 'var(--font-hud)', fontSize: '8px', letterSpacing: '0.12em', cursor: 'pointer' }}>
          RETRY FACE SCAN
        </button>
      )}
      <style>{`@keyframes faceScan { 0%{transform:translateY(-100%)} 100%{transform:translateY(200%)} }`}</style>
    </div>
  );
};

// ─── Micro speak helper (uses existing SpeechSynthesis) ──────────────────────
const speak = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.88;
  u.pitch = 0.82;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    v.name.toLowerCase().includes('google uk') ||
    v.name.toLowerCase().includes('ryan') ||
    v.name.toLowerCase().includes('daniel')
  ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
  if (preferred) u.voice = preferred;
  window.speechSynthesis.speak(u);
};

// ─── Animated mic icon ───────────────────────────────────────────────────────
// Colour is driven by `color` on the root + currentColor on the strokes, because
// CSS var() is not valid inside SVG presentation attributes.
const MicIcon = ({ active, size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ color: active ? 'var(--red)' : 'var(--cyan)' }}>
    <rect x="9" y="2" width="6" height="12" rx="3"
      style={{ fill: active ? 'rgba(var(--red-rgb),0.3)' : 'rgba(var(--cyan-rgb),0.2)' }} />
    <path d="M19 10a7 7 0 0 1-14 0" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="8" y1="22" x2="16" y2="22" />
  </svg>
);

// ─── Score bar ───────────────────────────────────────────────────────────────
const ScoreBar = ({ score }) => {
  if (score === null || score === undefined) return null;
  const pct = Math.round(score * 100);
  const color = score >= 0.75 ? 'var(--green)' : score >= 0.55 ? 'var(--gold)' : 'var(--red)';
  return (
    <div style={{ width: '260px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-hud)', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px', letterSpacing: '0.1em' }}>
        <span>MATCH SCORE</span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', background: 'rgba(var(--halo-rgb),0.05)', borderRadius: '2px', overflow: 'hidden', border: '1px solid rgba(var(--cyan-rgb),0.15)' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}`, borderRadius: '2px', transition: 'width 0.8s ease-out' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
        Threshold: 75%
      </div>
    </div>
  );
};

// ─── Corner bracket decoration ───────────────────────────────────────────────
const CornerBrackets = ({ color = 'var(--cyan)', size = 20, thickness = 2 }) => (
  <>
    {/* TL */}
    <div style={{ position: 'absolute', top: -1, left: -1, width: size, height: size, borderTop: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
    {/* TR */}
    <div style={{ position: 'absolute', top: -1, right: -1, width: size, height: size, borderTop: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
    {/* BL */}
    <div style={{ position: 'absolute', bottom: -1, left: -1, width: size, height: size, borderBottom: `${thickness}px solid ${color}`, borderLeft: `${thickness}px solid ${color}` }} />
    {/* BR */}
    <div style={{ position: 'absolute', bottom: -1, right: -1, width: size, height: size, borderBottom: `${thickness}px solid ${color}`, borderRight: `${thickness}px solid ${color}` }} />
  </>
);

// ─── Countdown pill ──────────────────────────────────────────────────────────
const RecordingCountdown = ({ active }) => {
  const [count, setCount] = useState(3);
  const ref = useRef(null);

  useEffect(() => {
    if (!active) { setCount(3); return; }
    setCount(3);
    ref.current = setInterval(() => {
      setCount(c => {
        if (c <= 1) { clearInterval(ref.current); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(ref.current);
  }, [active]);

  if (!active) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontFamily: 'var(--font-hud)',
      fontSize: '12px',
      color: 'var(--red)',
      letterSpacing: '0.15em',
      animation: 'blink 0.8s ease-in-out infinite',
    }}>
      <span style={{ fontSize: '20px', fontWeight: '800' }}>{count}</span>
      <span>RECORDING...</span>
    </div>
  );
};

// ─── Attempt pips ────────────────────────────────────────────────────────────
const AttemptPips = ({ attemptsLeft, max = 3 }) => (
  <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
    {Array.from({ length: max }, (_, i) => (
      <div key={i} style={{
        width: 10, height: 10, borderRadius: '50%',
        background: i < attemptsLeft ? 'var(--green)' : 'rgba(var(--halo-rgb),0.1)',
        border: '1px solid',
        borderColor: i < attemptsLeft ? 'var(--green)' : 'rgba(var(--halo-rgb),0.15)',
        boxShadow: i < attemptsLeft ? '0 0 6px var(--green)' : 'none',
        transition: 'all 0.3s',
      }} />
    ))}
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

const VoiceAuth = ({
  authStatus,
  isRecording,
  score,
  attemptsLeft,
  lockTimeRemaining,
  displayName,
  errorMessage,
  isWakeWordListening,
  onRecordAndVerify,
  onFaceAuthenticated,
  onResetLock,
  onResetProfile,
}) => {
  const [flashState, setFlashState] = useState(null); // 'success' | 'denied' | 'locked'
  const prevStatus = useRef(authStatus);

  // Trigger flash + voice lines on status change
  useEffect(() => {
    if (authStatus === prevStatus.current) return;
    prevStatus.current = authStatus;

    if (authStatus === 'authenticated') {
      setFlashState('success');
      speak(`Voice signature confirmed. Welcome back, ${displayName}. All systems are online.`);
    } else if (authStatus === 'denied') {
      setFlashState('denied');
      const msg = attemptsLeft > 0
        ? `Unrecognized voice signature. ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before system lockdown.`
        : 'Final warning. System lockdown imminent.';
      speak(msg);
      setTimeout(() => setFlashState(null), 1500);
    } else if (authStatus === 'locked') {
      setFlashState('locked');
      speak(`Security lockout initiated. System will resume in ${Math.ceil(lockTimeRemaining / 60)} minutes. This attempt has been logged.`);
    } else if (authStatus === 'authenticating') {
      if (prevStatus.current === 'checking') {
        speak('Voice authentication required. Please speak to confirm identity.');
      }
    }
  }, [authStatus, displayName, attemptsLeft, lockTimeRemaining]);

  // Announce recording start
  useEffect(() => {
    if (isRecording) {
      speak('Analyzing vocal patterns. Please speak now.');
    }
  }, [isRecording]);

  // ── Derive visual state ─────────────────────────────────────────────────────
  const arcState =
    authStatus === 'authenticated' ? 'speaking'
    : authStatus === 'locked' ? 'idle'
    : isRecording ? 'listening'
    : authStatus === 'authenticating' && !isRecording ? 'thinking'
    : 'idle';

  const statusColors = {
    authenticated: { primary: 'var(--green)', glow: 'rgba(var(--green-rgb),0.4)' },
    denied: { primary: 'var(--red)', glow: 'rgba(var(--red-rgb),0.4)' },
    locked: { primary: 'var(--red)', glow: 'rgba(var(--red-rgb),0.6)' },
    authenticating: { primary: 'var(--cyan)', glow: 'rgba(var(--cyan-rgb),0.25)' },
    checking: { primary: 'var(--cyan)', glow: 'rgba(var(--cyan-rgb),0.15)' },
  };

  const { primary: statusColor, glow: statusGlow } = statusColors[flashState || authStatus] || statusColors.authenticating;

  const formatLockTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: authStatus === 'locked'
        ? 'radial-gradient(ellipse at center, rgb(var(--surface-danger-rgb)) 0%, var(--bg-deep) 100%)'
        : 'radial-gradient(ellipse at center, var(--bg-dark) 0%, var(--bg-deep) 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9000,
      transition: 'background 0.5s',
      overflow: 'hidden',
    }}>
      <ScanLine />

      {/* Ambient glow */}
      <div style={{
        position: 'absolute', top: '40%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px', height: '400px',
        background: `radial-gradient(ellipse, ${statusGlow} 0%, transparent 70%)`,
        pointerEvents: 'none',
        transition: 'background 0.5s',
      }} />

      {/* Flash overlay */}
      {flashState && (
        <div style={{
          position: 'absolute', inset: 0,
          background: flashState === 'success'
            ? 'rgba(var(--green-rgb),0.08)'
            : 'rgba(var(--red-rgb),0.1)',
          animation: 'fadeIn 0.2s ease-out',
          pointerEvents: 'none',
        }} />
      )}

      {/* Main panel */}
      <div style={{
        position: 'relative',
        width: 'min(440px, 90vw)',
        padding: '40px 36px',
        background: 'rgba(var(--surface-2-rgb), 0.85)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${statusColor}44`,
        borderRadius: '8px',
        boxShadow: `0 0 40px ${statusGlow}, inset 0 0 30px rgba(var(--cyan-rgb),0.02)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '24px',
        transition: 'border-color 0.4s, box-shadow 0.4s',
      }}>
        <CornerBrackets color={statusColor} size={18} />

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-hud)',
            fontSize: '10px',
            letterSpacing: '0.4em',
            color: 'var(--text-muted)',
            marginBottom: '4px',
            textTransform: 'uppercase',
          }}>
            STARK INDUSTRIES · JARVIS v5.0
          </div>
          <div style={{
            fontFamily: 'var(--font-hud)',
            fontSize: '15px',
            fontWeight: '700',
            letterSpacing: '0.2em',
            color: statusColor,
            textShadow: `0 0 12px ${statusColor}88`,
            transition: 'color 0.3s',
          }}>
            VOICE AUTHENTICATION
          </div>
        </div>

        {/* Arc Reactor */}
        <div style={{ position: 'relative' }}>
          <ArcReactor size={140} state={arcState} />
          {/* Spinning ring for processing */}
          {authStatus === 'authenticating' && !isRecording && (
            <div style={{
              position: 'absolute', inset: -8,
              border: '1px solid rgba(var(--cyan-rgb),0.2)',
              borderTop: '1px solid var(--cyan)',
              borderRadius: '50%',
              animation: 'rotate 1s linear infinite',
            }} />
          )}
        </div>

        {/* ── STATUS MESSAGES ── */}
        {authStatus === 'checking' && (
          <StatusText color="var(--text-muted)" animate>
            INITIALIZING BIOMETRIC SCANNER...
          </StatusText>
        )}

        {authStatus === 'authenticating' && !isRecording && (
          <>
            {/* Face biometric — auto-attempts on mount */}
            <FaceVerifyWidget
              onAuthenticated={onFaceAuthenticated}
              onError={(err) => console.warn('[FaceAuth]', err)}
            />
            {/* Divider */}
            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(var(--cyan-rgb),0.1)' }} />
              <span style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.15em' }}>OR VOICE</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(var(--cyan-rgb),0.1)' }} />
            </div>
            <StatusText color="var(--cyan)">SPEAK TO AUTHENTICATE</StatusText>
            <AttemptPips attemptsLeft={attemptsLeft} />
          </>
        )}

        {isRecording && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <StatusText color="var(--red)">SCANNING VOCAL BIOMETRICS</StatusText>
            <RecordingCountdown active={isRecording} />
          </div>
        )}

        {authStatus === 'authenticating' && !isRecording && score !== null && (
          <div style={{ width: '100%' }}>
            <StatusText color="var(--text-muted)" small>VOICE ANALYSIS COMPLETE</StatusText>
            <ScoreBar score={score} />
          </div>
        )}

        {authStatus === 'denied' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <StatusText color="var(--red)">UNRECOGNIZED VOICE SIGNATURE</StatusText>
            <StatusText color="var(--text-muted)" small>ACCESS DENIED</StatusText>
            {score !== null && <ScoreBar score={score} />}
            <AttemptPips attemptsLeft={attemptsLeft} />
          </div>
        )}

        {authStatus === 'locked' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <StatusText color="var(--red)">SECURITY LOCKOUT ACTIVE</StatusText>
            <div style={{
              fontFamily: 'var(--font-hud)',
              fontSize: '32px',
              fontWeight: '900',
              color: 'var(--red)',
              letterSpacing: '0.1em',
              textShadow: '0 0 20px rgba(var(--red-rgb),0.8)',
              animation: 'blink 2s ease-in-out infinite',
            }}>
              {formatLockTime(lockTimeRemaining)}
            </div>
            <StatusText color="var(--text-muted)" small>RESUME IN</StatusText>
          </div>
        )}

        {authStatus === 'authenticated' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <StatusText color="var(--green)">BIOMETRIC CONFIRMED</StatusText>
            <StatusText color="var(--text-muted)" small>
              WELCOME BACK, {(displayName || 'SIR').toUpperCase()}
            </StatusText>
            {score !== null && <ScoreBar score={score} />}
          </div>
        )}

        {errorMessage && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            color: 'var(--text-muted)',
            textAlign: 'center',
            padding: '4px 8px',
            border: '1px solid rgba(var(--red-rgb),0.2)',
            borderRadius: '3px',
            maxWidth: '300px',
          }}>
            {errorMessage}
          </div>
        )}

        {/* ── ACTION BUTTON ── */}
        {authStatus === 'authenticating' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <button
              id="voice-auth-btn"
              onClick={onRecordAndVerify}
              disabled={isRecording}
              style={{
                width: '88px', height: '88px', borderRadius: '50%',
                background: isRecording ? 'rgba(var(--red-rgb),0.15)' : 'rgba(var(--cyan-rgb),0.08)',
                border: `2px solid ${isRecording ? 'var(--red)' : 'var(--cyan-border)'}`,
                cursor: isRecording ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
                boxShadow: isRecording ? '0 0 30px rgba(var(--red-rgb),0.5), inset 0 0 20px rgba(var(--red-rgb),0.1)' : '0 0 20px rgba(var(--cyan-rgb),0.2)',
                animation: isRecording ? 'glowPulse 0.8s ease-in-out infinite' : 'none',
              }}
            >
              <MicIcon active={isRecording} size={32} />
            </button>
            {/* Wake word indicator */}
            {isWakeWordListening && !isRecording && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.12em' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', animation: 'blink 2s ease-in-out infinite' }} />
                SAY "HELLO JARVIS" TO AUTO-VERIFY
              </div>
            )}
          </div>
        )}

        {/* Lock reset link */}
        {authStatus === 'locked' && (
          <button
            onClick={onResetLock}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontFamily: 'var(--font-hud)',
              fontSize: '8px', letterSpacing: '0.1em', cursor: 'pointer',
              textDecoration: 'underline', textDecorationColor: 'transparent',
              transition: 'all 0.2s',
            }}
            onMouseOver={e => e.target.style.color = 'var(--cyan)'}
            onMouseOut={e => e.target.style.color = 'var(--text-muted)'}
          >
            ADMINISTRATOR OVERRIDE
          </button>
        )}

        {/* Re-enroll profile option */}
        {(authStatus === 'authenticating' || authStatus === 'denied') && (
          <button
            onClick={onResetProfile}
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontFamily: 'var(--font-hud)',
              fontSize: '8px', letterSpacing: '0.1em', cursor: 'pointer',
              textDecoration: 'underline',
              transition: 'all 0.2s',
              marginTop: '4px',
            }}
            onMouseOver={e => e.target.style.color = 'var(--red)'}
            onMouseOut={e => e.target.style.color = 'var(--text-muted)'}
          >
            RESET VOICE PROFILE & RE-ENROLL
          </button>
        )}


        {/* Footer */}
        <div style={{
          fontFamily: 'var(--font-hud)',
          fontSize: '8px',
          letterSpacing: '0.15em',
          color: 'var(--text-muted)',
          opacity: 0.4,
          textAlign: 'center',
        }}>
          BIOMETRIC SECURITY SYSTEM v2.0 · RESEMBLYZER ENGINE
        </div>
      </div>
    </div>
  );
};

// ── Sub-component for status text ─────────────────────────────────────────────
const StatusText = ({ children, color, animate, small }) => (
  <div style={{
    fontFamily: 'var(--font-hud)',
    fontSize: small ? '9px' : '11px',
    fontWeight: '600',
    letterSpacing: '0.2em',
    color: color || 'var(--text)',
    textAlign: 'center',
    textTransform: 'uppercase',
    animation: animate ? 'blink 1.5s ease-in-out infinite' : 'none',
    textShadow: color ? `0 0 8px ${color}66` : 'none',
    transition: 'color 0.3s',
  }}>
    {children}
  </div>
);

export default VoiceAuth;
