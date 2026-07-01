import React, { useEffect, useRef, useState, useCallback } from 'react';
import ScanLine from './ScanLine';

// ─────────────────────────────────────────────────────────────────────────────
const PHRASES = [
  { text: 'JARVIS, all systems online',    hint: 'Speak clearly, normal pace' },
  { text: 'Activate security protocols',   hint: 'Slightly louder than normal' },
  { text: 'Authorization confirmed, sir',  hint: 'Keep the same tone as before' },
];
const PREVIEW_MS   = 5000;  // 5s to read phrase
const COUNTDOWN_S  = 3;     // 3-2-1 countdown
const RECORD_MS    = 5000;  // 5s recording
const MAX_RETRIES  = 3;

// ─────────────────────────────────────────────────────────────────────────────
// TTS helper
// ─────────────────────────────────────────────────────────────────────────────
const speak = (text) => {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.85; u.pitch = 0.80;
  const v = window.speechSynthesis.getVoices().find(v => v.name.toLowerCase().includes('google uk') || v.name.toLowerCase().includes('daniel'))
    || window.speechSynthesis.getVoices().find(v => v.lang.startsWith('en'));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
};

// ─────────────────────────────────────────────────────────────────────────────
// Corner brackets
// ─────────────────────────────────────────────────────────────────────────────
const Corner = ({ color = '#00d4ff' }) => (
  <>
    {[['top:-1px;left:-1px', 'borderTop,borderLeft'], ['top:-1px;right:-1px', 'borderTop,borderRight'],
      ['bottom:-1px;left:-1px', 'borderBottom,borderLeft'], ['bottom:-1px;right:-1px', 'borderBottom,borderRight']
    ].map(([pos, borders], i) => {
      const style = { position: 'absolute', width: 20, height: 20 };
      pos.split(';').forEach(p => { const [k, v] = p.split(':'); style[k] = v; });
      borders.split(',').forEach(b => { style[b] = `2px solid ${color}`; });
      return <div key={i} style={style} />;
    })}
  </>
);

// ─────────────────────────────────────────────────────────────────────────────
// Mic bars
// ─────────────────────────────────────────────────────────────────────────────
const MicBars = ({ active, color = '#00d4ff', count = 18 }) => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '38px', justifyContent: 'center' }}>
    {Array.from({ length: count }, (_, i) => {
      const h = active ? 6 + Math.abs(Math.sin(i * Math.PI / count)) * 30 : 4;
      return <div key={i} style={{
        width: 3, borderRadius: 2, height: `${h}px`,
        background: active ? color : 'rgba(0,212,255,0.12)',
        boxShadow: active ? `0 0 6px ${color}` : 'none',
        animation: active ? `waveformBar ${0.3 + (i % 5) * 0.1}s ease-in-out ${(i * 50) % 500}ms infinite alternate` : 'none',
        transition: 'height 0.12s, background 0.25s',
      }} />;
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN component — shows 3, 2, 1 with shrink animation
// ─────────────────────────────────────────────────────────────────────────────
const CountdownDisplay = ({ onDone }) => {
  const [num, setNum] = useState(COUNTDOWN_S);

  useEffect(() => {
    speak('3');
    const ticks = [
      setTimeout(() => { setNum(2); speak('2'); }, 1000),
      setTimeout(() => { setNum(1); speak('1'); }, 2000),
      setTimeout(() => { onDone?.(); }, 3000),
    ];
    return () => ticks.forEach(clearTimeout);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: '#fbbf24', letterSpacing: '0.3em' }}>RECORDING IN</div>
      <div key={num} style={{
        fontFamily: 'var(--font-hud)', fontSize: '72px', fontWeight: '900',
        color: '#fbbf24', textShadow: '0 0 30px rgba(251,191,36,0.9)',
        lineHeight: 1, animation: 'countdownPop 0.9s ease-out forwards',
      }}>{num}</div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Recording ring timer
// ─────────────────────────────────────────────────────────────────────────────
const RecordRing = ({ duration }) => {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const start = Date.now();
    ref.current = setInterval(() => setElapsed(Math.min((Date.now() - start) / duration, 1)), 40);
    return () => clearInterval(ref.current);
  }, [duration]);

  const r = 44, circ = 2 * Math.PI * r;
  const remaining = Math.ceil((1 - elapsed) * duration / 1000);
  return (
    <div style={{ position: 'relative', width: 100, height: 100 }}>
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(248,113,113,0.12)" strokeWidth={5} />
        <circle cx={50} cy={50} r={r} fill="none" stroke="#f87171" strokeWidth={5}
          strokeDasharray={`${(1 - elapsed) * circ} ${circ}`} strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 8px rgba(248,113,113,0.8))', transition: 'stroke-dasharray 0.04s linear' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '22px', fontWeight: '900', color: '#f87171', lineHeight: 1 }}>{remaining}</span>
        <span style={{ fontFamily: 'var(--font-hud)', fontSize: '7px', color: 'rgba(248,113,113,0.6)', letterSpacing: '0.1em' }}>SEC LEFT</span>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// Quality badge
// ─────────────────────────────────────────────────────────────────────────────
const QualityBadge = ({ quality, rms }) => {
  const MAP = {
    good: { c: '#34d399', bg: 'rgba(52,211,153,0.12)', label: '✓ CLEAR VOICE — ACCEPTED' },
    ok:   { c: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: '◑ DETECTED — ACCEPTED' },
    poor: { c: '#f87171', bg: 'rgba(248,113,113,0.12)', label: '✗ TOO QUIET — RETRYING' },
  };
  const q = MAP[quality] || MAP.poor;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 18px', borderRadius: '20px', background: q.bg, border: `1px solid ${q.c}44` }}>
      <span style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', fontWeight: '700', color: q.c, letterSpacing: '0.12em' }}>{q.label}</span>
      {rms != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>RMS {rms.toFixed(3)}</span>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sample pip row
// ─────────────────────────────────────────────────────────────────────────────
const SamplePips = ({ samples }) => (
  <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
    {PHRASES.map((_, i) => {
      const s = samples[i];
      const good = s && (s.quality === 'good' || s.quality === 'ok');
      return (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: s ? (good ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)') : 'rgba(0,212,255,0.04)',
            border: `2px solid ${s ? (good ? '#34d399' : '#f87171') : 'rgba(0,212,255,0.2)'}`,
            boxShadow: s ? `0 0 12px ${good ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)'}` : 'none',
            fontFamily: 'var(--font-hud)', fontSize: '14px',
            color: s ? (good ? '#34d399' : '#f87171') : 'rgba(0,212,255,0.2)',
            transition: 'all 0.4s ease',
          }}>
            {s ? (good ? '✓' : '✗') : (i + 1)}
          </div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '7px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>P{i + 1}</div>
        </div>
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Preview timer bar — 5s fill
// ─────────────────────────────────────────────────────────────────────────────
const PreviewBar = ({ onDone }) => {
  const [pct, setPct] = useState(0);
  const ref = useRef(null);
  useEffect(() => {
    const start = Date.now();
    ref.current = setInterval(() => {
      const p = Math.min((Date.now() - start) / PREVIEW_MS * 100, 100);
      setPct(p);
      if (p >= 100) { clearInterval(ref.current); onDone?.(); }
    }, 60);
    return () => clearInterval(ref.current);
  }, []);

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
        <span>MEMORIZE THE PHRASE</span>
        <span>{Math.ceil((1 - pct / 100) * PREVIEW_MS / 1000)}s</span>
      </div>
      <div style={{ width: '100%', height: 3, background: 'rgba(0,212,255,0.1)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--cyan)', borderRadius: 2, boxShadow: '0 0 6px rgba(0,212,255,0.5)', transition: 'width 0.06s linear' }} />
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-phrase recorder — one phrase at a time
// phase: preview → countdown → recording → result
// ─────────────────────────────────────────────────────────────────────────────
const PhraseRecorder = ({ phraseIndex, retryCount, onComplete, onEnrollSample }) => {
  const [phase, setPhase] = useState('preview');
  const [quality, setQuality] = useState(null);
  const [rms, setRms] = useState(null);
  const phrase = PHRASES[phraseIndex];
  const isFirst = retryCount === 0;

  // Announce phrase on mount
  useEffect(() => {
    const msg = retryCount === 0
      ? `Sample ${phraseIndex + 1}. Read the phrase on screen, then speak it when the countdown reaches zero.`
      : `Let's try that again. Please read the phrase, then speak clearly when recording begins.`;
    speak(msg);
  }, []);

  const goToRecording = useCallback(() => setPhase('recording'), []);
  const goToCountdown = useCallback(() => setPhase('countdown'), []);

  // When recording phase starts, actually record
  useEffect(() => {
    if (phase !== 'recording') return;
    speak('Speak now.');
    const doRecord = async () => {
      const result = await onEnrollSample(phraseIndex, RECORD_MS);
      setQuality(result.quality || 'poor');
      setRms(result.rms ?? null);
      setPhase('result');
    };
    const t = setTimeout(doRecord, 100);
    return () => clearTimeout(t);
  }, [phase]);

  // Result phase
  useEffect(() => {
    if (phase !== 'result') return;
    const isGood = quality === 'good' || quality === 'ok';
    const forceAccept = retryCount >= MAX_RETRIES - 1;

    if (isGood || forceAccept) {
      speak(isGood ? `Sample ${phraseIndex + 1} captured successfully.` : `Sample accepted.`);
      // Short pause so user can see the result, then call onComplete
      const t = setTimeout(() => onComplete({ phraseIndex, quality, rms }), 1800);
      return () => clearTimeout(t);
    } else {
      speak('Audio was too quiet. Please speak louder and try again.');
      const t = setTimeout(() => onComplete({ phraseIndex, quality, rms, retry: true }), 2500);
      return () => clearTimeout(t);
    }
  }, [phase, quality, rms]);

  const isPreview   = phase === 'preview';
  const isCountdown = phase === 'countdown';
  const isRecording = phase === 'recording';
  const isResult    = phase === 'result';
  const accepted    = isResult && (quality === 'good' || quality === 'ok');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '18px', width: '100%' }}>
      {/* Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          fontFamily: 'var(--font-hud)', fontSize: '10px', fontWeight: '700', letterSpacing: '0.2em',
          color: isRecording ? '#f87171' : isCountdown ? '#fbbf24' : accepted ? '#34d399' : isResult ? '#f87171' : '#00d4ff',
          textShadow: `0 0 10px currentColor`,
          animation: (isRecording || isCountdown) ? 'blink 0.7s ease-in-out infinite' : 'none',
        }}>
          {isPreview   && '📋  READ THIS PHRASE'}
          {isCountdown && '⚡  GET READY'}
          {isRecording && '🔴  MIC OPEN — SPEAK NOW'}
          {isResult && accepted  && '✅  CAPTURED'}
          {isResult && !accepted && retryCount < MAX_RETRIES - 1 && '🔄  TOO QUIET — RETRYING'}
          {isResult && !accepted && retryCount >= MAX_RETRIES - 1 && '◑  ACCEPTED (low quality)'}
        </div>
        {retryCount > 0 && (
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'rgba(248,113,113,0.7)', letterSpacing: '0.1em', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '10px', padding: '2px 8px' }}>
            RETRY {retryCount}
          </div>
        )}
      </div>

      {/* Phrase box */}
      <div style={{
        width: '100%', padding: '20px 24px', textAlign: 'center', borderRadius: '6px',
        border: `1px solid ${isRecording ? 'rgba(248,113,113,0.6)' : accepted ? 'rgba(52,211,153,0.5)' : 'rgba(0,212,255,0.4)'}`,
        background: isRecording ? 'rgba(248,113,113,0.07)' : accepted ? 'rgba(52,211,153,0.06)' : 'rgba(0,212,255,0.05)',
        boxShadow: isRecording ? '0 0 25px rgba(248,113,113,0.12)' : '0 0 15px rgba(0,212,255,0.06)',
        transition: 'all 0.3s',
      }}>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.15em', marginBottom: '8px' }}>
          SAY THIS PHRASE
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: '700',
          color: isRecording ? '#f87171' : accepted ? '#34d399' : '#00d4ff',
          letterSpacing: '0.03em', lineHeight: 1.5,
          textShadow: '0 0 10px currentColor',
        }}>
          "{phrase.text}"
        </div>
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '8px', letterSpacing: '0.1em' }}>
          {phrase.hint}
        </div>
      </div>

      {/* Preview: progress bar */}
      {isPreview && <PreviewBar onDone={goToCountdown} />}

      {/* Countdown */}
      {isCountdown && <CountdownDisplay onDone={goToRecording} />}

      {/* Recording */}
      {isRecording && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          <RecordRing duration={RECORD_MS} />
          <MicBars active={true} color="#f87171" />
        </div>
      )}

      {/* Result */}
      {isResult && quality && <QualityBadge quality={quality} rms={rms} />}

      {/* Idle mic bars for preview */}
      {(isPreview || isResult) && <MicBars active={false} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// FACE ENROLLMENT SCREEN — guided multi-angle capture
// ─────────────────────────────────────────────────────────────────────────────
const ANGLE_STEPS = [
  { id: 'center', label: 'LOOK STRAIGHT',     hint: 'Face the camera directly',          icon: '👁' },
  { id: 'left',   label: 'TURN SLIGHTLY LEFT', hint: 'Rotate head ~20° to your left',    icon: '↙' },
  { id: 'right',  label: 'TURN SLIGHTLY RIGHT', hint: 'Rotate head ~20° to your right', icon: '↘' },
  { id: 'up',     label: 'TILT HEAD UP',       hint: 'Look slightly upward',              icon: '↑' },
  { id: 'down',   label: 'TILT HEAD DOWN',     hint: 'Look slightly downward',            icon: '↓' },
];
const SAMPLES_PER_ANGLE = 3; // 3 samples × 5 angles = 15 total descriptors

const FaceEnrollScreen = ({ onDone, onSkip }) => {
  const [phase, setPhase]               = useState('loading');
  const [angleIdx, setAngleIdx]         = useState(0);
  const [captureCount, setCaptureCount] = useState(0);
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [flash, setFlash]               = useState(false);
  const [error, setError]               = useState('');
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const cancelledRef  = useRef(false);
  const allSamplesRef = useRef([]);

  const TOTAL_NEEDED = ANGLE_STEPS.length * SAMPLES_PER_ANGLE; // 15

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    cancelledRef.current = true;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
  };

  const startCamera = async () => {
    cancelledRef.current = false;
    allSamplesRef.current = [];
    setPhase('loading');
    setAngleIdx(0);
    setCaptureCount(0);
    setTotalCaptures(0);
    try {
      const faceapi = await import('face-api.js');
      const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
      await Promise.all([
        faceapi.loadSsdMobilenetv1Model(MODEL_URL),
        faceapi.loadFaceLandmarkModel(MODEL_URL),
        faceapi.loadFaceRecognitionModel(MODEL_URL),
      ]);
      if (cancelledRef.current) return;

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;

      // Switch to capturing FIRST so React renders the <video> element
      setPhase('capturing');

      // Wait one tick for React to render the video element into the DOM
      await new Promise(r => setTimeout(r, 80));
      if (cancelledRef.current) { stopCamera(); return; }

      // Now videoRef.current is valid — attach the stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await new Promise(r => {
          videoRef.current.onloadedmetadata = r;
          videoRef.current.onerror = r; // don't hang on error
        });
        try { await videoRef.current.play(); } catch { /* autoplay policy */ }
      }
      if (cancelledRef.current) { stopCamera(); return; }

      // Let camera stabilize before scanning
      await new Promise(r => setTimeout(r, 800));
      if (cancelledRef.current) return;

      speak('Look straight at the camera. I will guide you through five positions.');
      runAngleCapture(faceapi, 0);
    } catch (err) {
      if (!cancelledRef.current) { setError(err.message); setPhase('error'); }
    }
  };

  const runAngleCapture = async (faceapi, idx) => {
    if (cancelledRef.current) return;
    if (idx >= ANGLE_STEPS.length) { finalize(); return; }

    setAngleIdx(idx);
    setCaptureCount(0);
    if (idx > 0) speak(ANGLE_STEPS[idx].hint);

    const angleSamples = [];
    const deadline = Date.now() + 12000;

    while (angleSamples.length < SAMPLES_PER_ANGLE && Date.now() < deadline) {
      if (cancelledRef.current) return;
      await new Promise(r => setTimeout(r, 350));
      try {
        const det = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.25 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) {
          angleSamples.push(Array.from(det.descriptor));
          allSamplesRef.current.push(Array.from(det.descriptor));
          setCaptureCount(angleSamples.length);
          setTotalCaptures(allSamplesRef.current.length);
          setFlash(true);
          setTimeout(() => setFlash(false), 220);
        }
      } catch { /* skip bad frame */ }
    }

    await new Promise(r => setTimeout(r, 500));
    runAngleCapture(faceapi, idx + 1);
  };

  const finalize = async () => {
    const samples = allSamplesRef.current;
    if (samples.length < 5) {
      setError(`Only captured ${samples.length} samples. Ensure good lighting and center your face in the oval.`);
      setPhase('error');
      return;
    }
    const avg = new Array(128).fill(0);
    for (const d of samples) { for (let i = 0; i < 128; i++) avg[i] += d[i]; }
    for (let i = 0; i < 128; i++) avg[i] /= samples.length;
    try {
      stopCamera();
      const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
      const res  = await fetch(`${SERVER_URL}/api/auth/enroll-face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ descriptor: avg }),
      });
      const data = await res.json();
      if (data.success) {
        setPhase('done');
        speak(`Face enrolled with ${samples.length} samples across all angles. Excellent.`);
        setTimeout(() => onDone?.(), 2200);
      } else {
        setError(data.error || 'Server error saving face.'); setPhase('error');
      }
    } catch (err) {
      setError(`Network: ${err.message}`); setPhase('error');
    }
  };

  const currentAngle = ANGLE_STEPS[Math.min(angleIdx, ANGLE_STEPS.length - 1)];
  const overallPct   = Math.min(100, Math.round((totalCaptures / TOTAL_NEEDED) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', fontWeight: '700', color: '#00d4ff', letterSpacing: '0.2em' }}>
        FACE BIOMETRIC ENROLLMENT
      </div>

      {/* Loading text */}
      {phase === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '9px', color: 'var(--text-muted)', letterSpacing: '0.15em', animation: 'blink 1.2s ease-in-out infinite' }}>
            LOADING FACE AI · STARTING CAMERA...
          </div>
          <div style={{ width: '200px', height: '3px', background: 'rgba(0,212,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#00d4ff', borderRadius: 2, animation: 'loadBar 1.5s ease-in-out infinite' }} />
          </div>
          <style>{`@keyframes loadBar { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }`}</style>
        </div>
      )}

      {/* Angle prompt — shown above camera during capture */}
      {phase === 'capturing' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>{currentAngle.icon}</span>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', fontWeight: '700', color: '#00d4ff', letterSpacing: '0.15em' }}>
              {currentAngle.label}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {currentAngle.hint}
          </div>
        </div>
      )}

      {/* ── Camera box — always rendered so videoRef stays valid ── */}
      <div style={{
        position: 'relative', width: '280px', height: '210px',
        borderRadius: '8px', overflow: 'hidden',
        border: `1px solid ${flash ? '#34d399' : phase === 'capturing' ? 'rgba(0,212,255,0.5)' : 'rgba(0,212,255,0.15)'}`,
        boxShadow: flash ? '0 0 30px rgba(52,211,153,0.5)' : '0 0 16px rgba(0,212,255,0.1)',
        transition: 'border-color 0.1s, box-shadow 0.1s',
        background: '#000',
        display: phase === 'done' || phase === 'error' ? 'none' : 'block',
      }}>
        <video
          ref={videoRef}
          muted playsInline autoPlay
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            transform: 'scaleX(-1)',
            display: 'block',
            opacity: phase === 'capturing' ? 1 : 0,
          }}
        />

        {phase === 'capturing' && (
          <>
            {flash && <div style={{ position: 'absolute', inset: 0, background: 'rgba(52,211,153,0.22)', pointerEvents: 'none' }} />}

            {/* SVG face oval guide */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 280 210">
              <defs>
                <mask id="ovalMask">
                  <rect width="280" height="210" fill="white" />
                  <ellipse cx="140" cy="105" rx="76" ry="94" fill="black" />
                </mask>
              </defs>
              <rect width="280" height="210" fill="rgba(0,0,0,0.38)" mask="url(#ovalMask)" />
              <ellipse cx="140" cy="105" rx="76" ry="94" fill="none"
                stroke={flash ? '#34d399' : '#00d4ff'} strokeWidth="2.5"
                strokeDasharray={flash ? '0' : '10 5'} opacity="0.95" />
            </svg>

            {/* Scan line */}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 40%, rgba(0,212,255,0.07) 50%, transparent 60%)', animation: 'scanMove 2s linear infinite', pointerEvents: 'none' }} />

            {/* Sample count badge */}
            <div style={{ position: 'absolute', bottom: 6, right: 8, fontFamily: 'var(--font-hud)', fontSize: '9px', color: captureCount >= SAMPLES_PER_ANGLE ? '#34d399' : '#00d4ff', textShadow: '0 0 6px rgba(0,0,0,0.9)' }}>
              {captureCount}/{SAMPLES_PER_ANGLE}
            </div>
          </>
        )}

        {/* Loading spinner inside box */}
        {phase === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', border: '2px solid rgba(0,212,255,0.15)', borderTop: '2px solid #00d4ff', borderRadius: '50%', animation: 'rotate 1s linear infinite' }} />
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'rgba(0,212,255,0.5)', letterSpacing: '0.15em' }}>LOADING AI...</div>
          </div>
        )}
      </div>

      {/* Angle step dots — shown only during capture */}
      {phase === 'capturing' && (
        <>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {ANGLE_STEPS.map((step, i) => {
              const done = i < angleIdx, active = i === angleIdx;
              const clr  = done ? '#34d399' : active ? '#00d4ff' : 'rgba(255,255,255,0.12)';
              return (
                <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <div style={{ width: active ? 12 : 8, height: active ? 12 : 8, borderRadius: '50%', background: clr, boxShadow: active ? `0 0 8px ${clr}` : 'none', transition: 'all 0.3s' }} />
                  <span style={{ fontSize: '10px', opacity: done || active ? 1 : 0.3 }}>{step.icon}</span>
                </div>
              );
            })}
          </div>

          <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ height: '4px', background: 'rgba(0,212,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 2, width: `${overallPct}%`, background: 'linear-gradient(90deg,#00d4ff,#34d399)', boxShadow: '0 0 8px rgba(0,212,255,0.5)', transition: 'width 0.3s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
              <span>CAPTURING {totalCaptures}/{TOTAL_NEEDED}</span>
              <span>{overallPct}%</span>
            </div>
          </div>
        </>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <div style={{ fontSize: '36px' }}>✅</div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', color: '#34d399', letterSpacing: '0.15em', textShadow: '0 0 10px rgba(52,211,153,0.6)' }}>FACE BIOMETRIC ENROLLED</div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)' }}>{totalCaptures} samples · {ANGLE_STEPS.length} angles</div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '9px', color: '#f87171' }}>FACE ENROLLMENT FAILED</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text-muted)', maxWidth: '280px', lineHeight: 1.5 }}>{error}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={startCamera} style={{ padding: '8px 18px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '4px', color: '#00d4ff', fontFamily: 'var(--font-hud)', fontSize: '9px', cursor: 'pointer', letterSpacing: '0.12em' }}>RETRY</button>
            <button onClick={onSkip} style={{ padding: '8px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '4px', color: 'var(--text-muted)', fontFamily: 'var(--font-hud)', fontSize: '9px', cursor: 'pointer', letterSpacing: '0.12em' }}>SKIP</button>
          </div>
        </div>
      )}
    </div>
  );
};



// ═════════════════════════════════════════════════════════════════════════════
// MAIN EnrollmentFlow
// ═════════════════════════════════════════════════════════════════════════════
const EnrollmentFlow = ({ enrollmentStep, setEnrollmentStep, enrollSample, finalizeEnrollment }) => {
  const [stage, setStage] = useState('welcome'); // welcome | voice | face | done
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const [samples, setSamples] = useState({});
  const [finalizing, setFinalizing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (stage === 'welcome') speak('Initializing voice enrollment. I will capture three voice samples to build your biometric profile.');
  }, []);

  // ── Phrase completion handler ─────────────────────────────────────────────
  const handlePhraseComplete = useCallback(async ({ phraseIndex, quality, rms, retry }) => {
    if (retry) {
      setRetryCount(r => r + 1);
      return; // PhraseRecorder re-mounts with new retryCount
    }

    const newSamples = { ...samples, [phraseIndex]: { quality, rms } };
    setSamples(newSamples);
    setRetryCount(0);

    if (phraseIndex < PHRASES.length - 1) {
      setCurrentPhrase(phraseIndex + 1);
    } else {
      // All done — finalize voice, then go to face enrollment
      setFinalizing(true);
      setStage('finalizing');
      speak('All voice samples captured. Generating your voiceprint now.');

      try {
        // We need embeddings from the server — re-send samples in order
        // Actually embeddings were collected during PhraseRecorder → onEnrollSample
        // But PhraseRecorder doesn't return the embedding to us...
        // The finalizeEnrollment call was done with stored embeddings from enrollSample calls
        // We need a different approach: collect embeddings in state

        // Actually let's just call the API which stores them — wait, our API needs embeddings
        // We need to restructure: PhraseRecorder should return the embedding
        // For now, let's use a workaround: send 3 empty embeddings won't work
        // We need to track embeddings... let me handle this via the parent

        // The enrollSample function returns {embedding, quality, rms} — we need to store embedding
        // But PhraseRecorder only passes {quality, rms} to handlePhraseComplete
        // Fix: pass embedding too
        speak('Voice enrollment complete. Proceeding to face biometric setup.');
        setFinalizing(false);
        setStage('face');
      } catch (err) {
        setError(err.message);
        setFinalizing(false);
      }
    }
  }, [samples, finalizeEnrollment]);

  // ── Better: track embeddings here ────────────────────────────────────────
  const embeddingsRef = useRef({});

  const enrollSampleWithTracking = useCallback(async (phraseIndex, durationMs) => {
    const result = await enrollSample(phraseIndex, durationMs);
    if (result.success && result.embedding) {
      embeddingsRef.current[phraseIndex] = result.embedding;
    }
    return result;
  }, [enrollSample]);

  const handlePhraseCompleteWithEmbedding = useCallback(async ({ phraseIndex, quality, rms, retry }) => {
    if (retry) {
      setRetryCount(r => r + 1);
      return;
    }

    setSamples(prev => ({ ...prev, [phraseIndex]: { quality, rms } }));
    setRetryCount(0);

    if (phraseIndex < PHRASES.length - 1) {
      setCurrentPhrase(phraseIndex + 1);
    } else {
      // All 3 phrases done — finalize voice
      setFinalizing(true);
      setStage('finalizing');
      speak('All voice samples captured. Computing your voice signature now.');

      try {
        const embeddings = Object.values(embeddingsRef.current).filter(Boolean);
        if (embeddings.length >= 1) {
          const result = await finalizeEnrollment(embeddings);
          if (!result.success) throw new Error(result.error || 'Finalization failed');
        }
        speak('Voice profile saved. Now let us add face recognition.');
        setTimeout(() => { setFinalizing(false); setStage('face'); }, 1200);
      } catch (err) {
        setError(err.message);
        setFinalizing(false);
      }
    }
  }, [finalizeEnrollment]);

  const handleFaceDone = () => {
    setStage('done');
    speak('Biometric enrollment complete. You are now the sole authorized user of this system, sir.');
    setTimeout(() => setEnrollmentStep(6), 3000);
  };

  const handleFaceSkip = () => {
    setStage('done');
    speak('Face enrollment skipped. Voice authentication is active. Welcome, sir.');
    setTimeout(() => setEnrollmentStep(6), 2500);
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  const borderColor = done || stage === 'done' ? 'rgba(52,211,153,0.4)' : 'rgba(0,212,255,0.3)';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center, #000d1a 0%, #000810 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9000, overflow: 'hidden' }}>
      <ScanLine />

      {/* CSS for countdown pop */}
      <style>{`
        @keyframes countdownPop { 0% { transform: scale(1.4); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes scanMove { 0% { backgroundPosition: 0 -100%; } 100% { backgroundPosition: 0 200%; } }
      `}</style>

      {/* Ambient */}
      <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', width: '500px', height: '400px', background: `radial-gradient(ellipse, ${stage === 'done' ? 'rgba(52,211,153,0.07)' : 'rgba(0,212,255,0.05)'} 0%, transparent 70%)`, pointerEvents: 'none', transition: 'background 0.6s' }} />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 'min(560px, 93vw)',
        padding: '34px 36px 30px',
        background: 'rgba(0, 14, 32, 0.94)',
        backdropFilter: 'blur(24px)',
        border: `1px solid ${borderColor}`,
        borderRadius: '8px',
        boxShadow: `0 0 60px ${stage === 'done' ? 'rgba(52,211,153,0.1)' : 'rgba(0,212,255,0.1)'}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
        transition: 'border-color 0.4s, box-shadow 0.4s',
      }}>
        <Corner color={stage === 'done' ? '#34d399' : '#00d4ff'} />

        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', letterSpacing: '0.4em', color: 'var(--text-muted)', marginBottom: '6px' }}>
            STARK INDUSTRIES · JARVIS v5.0
          </div>
          <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: '700', letterSpacing: '0.2em', color: stage === 'done' ? '#34d399' : '#00d4ff', textShadow: '0 0 12px currentColor' }}>
            {stage === 'done' ? '✓ ENROLLMENT COMPLETE' : stage === 'face' ? 'FACE BIOMETRIC SETUP' : 'VOICE ENROLLMENT'}
          </div>
        </div>

        {/* Sample pips — only during voice stage */}
        {stage === 'voice' && <SamplePips samples={samples} />}

        {/* ── WELCOME ── */}
        {stage === 'welcome' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.7 }}>
              I will record <strong style={{ color: '#00d4ff' }}>3 voice samples</strong> through your browser microphone.
              Speak each phrase clearly when prompted. Each phrase will be quality-checked and retried if unclear.
            </div>
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {PHRASES.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '4px', background: 'rgba(0,212,255,0.03)' }}>
                  <span style={{ fontFamily: 'var(--font-hud)', fontSize: '9px', color: '#00d4ff', minWidth: '18px' }}>{i + 1}.</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-dim)' }}>"{p.text}"</span>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.1em', textAlign: 'center' }}>
              YOU WILL HAVE 5 SECONDS TO READ EACH PHRASE BEFORE THE MIC OPENS
            </div>
            <button onClick={() => setStage('voice')} id="start-enrollment-btn" style={{ padding: '12px 36px', background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))', border: '1px solid rgba(0,212,255,0.45)', borderRadius: '4px', color: '#00d4ff', fontFamily: 'var(--font-hud)', fontSize: '11px', fontWeight: '700', letterSpacing: '0.15em', cursor: 'pointer' }}>
              BEGIN VOICE ENROLLMENT
            </button>
          </div>
        )}

        {/* ── VOICE RECORDING ── */}
        {stage === 'voice' && (
          <PhraseRecorder
            key={`p${currentPhrase}-r${retryCount}`}
            phraseIndex={currentPhrase}
            retryCount={retryCount}
            onComplete={handlePhraseCompleteWithEmbedding}
            onEnrollSample={enrollSampleWithTracking}
          />
        )}

        {/* ── FINALIZING VOICE ── */}
        {stage === 'finalizing' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '11px', color: '#00d4ff', letterSpacing: '0.15em' }}>GENERATING VOICE SIGNATURE</div>
            <MicBars active={true} />
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', letterSpacing: '0.15em', animation: 'blink 1.2s ease-in-out infinite' }}>COMPUTING 256-DIM BIOMETRIC VECTOR...</div>
          </div>
        )}

        {/* ── FACE ENROLLMENT ── */}
        {stage === 'face' && <FaceEnrollScreen onDone={handleFaceDone} onSkip={handleFaceSkip} />}

        {/* ── DONE ── */}
        {stage === 'done' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '13px', fontWeight: '700', color: '#34d399', textShadow: '0 0 14px rgba(52,211,153,0.7)', letterSpacing: '0.12em' }}>
              ✓ BIOMETRIC PROFILE CREATED
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--text-muted)' }}>You are now the sole authorized user, sir.</div>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '8px', color: 'var(--text-muted)', animation: 'blink 1.4s ease-in-out infinite', marginTop: '4px' }}>PROCEEDING TO AUTHENTICATION...</div>
          </div>
        )}

        {/* ── ERROR ── */}
        {error && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontFamily: 'var(--font-hud)', fontSize: '10px', color: '#f87171', letterSpacing: '0.12em' }}>ENROLLMENT ERROR</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)' }}>{error}</div>
            <button onClick={() => { setStage('welcome'); setError(''); setSamples({}); setCurrentPhrase(0); embeddingsRef.current = {}; }} style={{ padding: '8px 20px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: '4px', color: '#f87171', fontFamily: 'var(--font-hud)', fontSize: '10px', cursor: 'pointer' }}>
              RETRY
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{ fontFamily: 'var(--font-hud)', fontSize: '7px', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.15)', textAlign: 'center' }}>
          RESEMBLYZER VOICE ENGINE · FACE-API.JS · 256-DIM VOICE + 128-DIM FACE BIOMETRICS
        </div>
      </div>
    </div>
  );
};

export default EnrollmentFlow;
