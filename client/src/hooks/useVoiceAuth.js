import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
// WAV file builder (16kHz, Mono, 16-bit PCM) — used for BOTH enroll & verify
// ─────────────────────────────────────────────────────────────────────────────
const writeString = (view, offset, string) => {
  for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
};

const floatTo16BitPCM = (output, offset, input) => {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};

const buildWav = (samples, sampleRate = 16000) => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return new Blob([view], { type: 'audio/wav' });
};

// Compute RMS in browser for instant feedback
const computeRMS = (samples) => {
  const sum = samples.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sum / samples.length);
};

// ─────────────────────────────────────────────────────────────────────────────
// Record audio via AudioContext — returns { blob, rms }
// ─────────────────────────────────────────────────────────────────────────────
const recordAudio = async (durationMs = 4000) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

  return new Promise((resolve, reject) => {
    try {
      // Use MediaRecorder (no deprecated ScriptProcessorNode)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        try {
          const blob = new Blob(chunks, { type: mimeType });
          const arrayBuf = await blob.arrayBuffer();

          // Decode to PCM at 16kHz using OfflineAudioContext
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          const tmpCtx = new AudioContextClass();
          const decoded = await tmpCtx.decodeAudioData(arrayBuf);
          tmpCtx.close();

          const TARGET_SR = 16000;
          const offlineCtx = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SR), TARGET_SR);
          const bufSrc = offlineCtx.createBufferSource();
          bufSrc.buffer = decoded;
          bufSrc.connect(offlineCtx.destination);
          bufSrc.start(0);
          const rendered = await offlineCtx.startRendering();

          const samples = rendered.getChannelData(0);
          const rms = computeRMS(samples);
          const wavBlob = buildWav(samples, TARGET_SR);
          resolve({ blob: wavBlob, rms });
        } catch (err) {
          reject(err);
        }
      };

      recorder.start();
      setTimeout(() => recorder.stop(), durationMs);
    } catch (err) {
      stream.getTracks().forEach(t => t.stop());
      reject(err);
    }
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ─────────────────────────────────────────────────────────────────────────────
export const useVoiceAuth = () => {
  const socket = useSocket();

  const [authStatus, setAuthStatus] = useState('checking');
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [score, setScore] = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [lockTimeRemaining, setLockTimeRemaining] = useState(0);
  const [lockUntil, setLockUntil] = useState(null);
  const [displayName, setDisplayName] = useState('Sir');
  const [errorMessage, setErrorMessage] = useState('');
  const [enrollmentStep, setEnrollmentStep] = useState(0);
  const [enrollmentStatus, setEnrollmentStatus] = useState('idle');

  const lockCountdownRef = useRef(null);

  useEffect(() => {
    checkEnrollmentStatus();
    return () => { if (lockCountdownRef.current) clearInterval(lockCountdownRef.current); };
  }, []);

  useEffect(() => {
    if (lockUntil) startCountdown(lockUntil);
    return () => { if (lockCountdownRef.current) clearInterval(lockCountdownRef.current); };
  }, [lockUntil]);

  // ── Check enrollment status ─────────────────────────────────────────────────
  const checkEnrollmentStatus = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/status`);
      const data = await res.json();

      if (data.error) {
        setErrorMessage(`DB offline: running in offline mode.`);
        setAuthStatus('authenticated');
        return;
      }

      setDisplayName(data.displayName || 'Sir');

      // Either voice OR face enrolled is enough to show the auth screen
      const anyEnrolled = data.isEnrolled || data.faceEnrolled;

      if (!anyEnrolled) {
        setIsEnrolled(false);
        setAuthStatus('enrolling');
        return;
      }

      setIsEnrolled(true);

      if (data.isLocked) {
        setLockUntil(new Date(data.lockUntil));
        setAuthStatus('locked');
        return;
      }

      setAuthStatus('authenticating');
    } catch (err) {
      setErrorMessage('Server unreachable. Offline mode.');
      setAuthStatus('authenticated');
    }
  }, []);

  // ── Lockout countdown ───────────────────────────────────────────────────────
  const startCountdown = useCallback((until) => {
    if (lockCountdownRef.current) clearInterval(lockCountdownRef.current);
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(until) - new Date()) / 1000));
      setLockTimeRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(lockCountdownRef.current);
        setAuthStatus('authenticating');
        setLockUntil(null);
      }
    };
    tick();
    lockCountdownRef.current = setInterval(tick, 1000);
  }, []);

  // ── ENROLL A SINGLE SAMPLE (browser recording → server embedding) ───────────
  const enrollSample = useCallback(async (phraseIndex, durationMs = 4000) => {
    const { blob, rms } = await recordAudio(durationMs);

    // Client-side quick check
    if (rms < 0.003) {
      return { success: false, quality: 'poor', rms, error: 'No voice detected' };
    }

    const formData = new FormData();
    formData.append('audio', blob, `enroll_sample_${phraseIndex + 1}.wav`);

    const res = await fetch(`${SERVER_URL}/api/auth/enroll-sample`, {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    return data; // { success, embedding, rms, quality, has_voice }
  }, []);

  // ── FINALIZE ENROLLMENT (send all embeddings → save voiceprint) ─────────────
  // NOTE: does NOT redirect — EnrollmentFlow must call setEnrollmentStep(6) after
  // face enrollment is done/skipped. That step-6 transition triggers auth below.
  const finalizeEnrollment = useCallback(async (embeddings, name) => {
    const res = await fetch(`${SERVER_URL}/api/auth/finalize-enrollment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeddings, displayName: name || displayName }),
    });
    const data = await res.json();
    if (data.success) {
      setIsEnrolled(true);
      // Do NOT redirect here — face enrollment comes next
    }
    return data;
  }, [displayName]);

  // ── When enrollment is fully complete (step 6), move to auth ────────────────
  useEffect(() => {
    if (enrollmentStep === 6) {
      const t = setTimeout(() => setAuthStatus('authenticating'), 2500);
      return () => clearTimeout(t);
    }
  }, [enrollmentStep]);

  // ── VERIFY VOICE ────────────────────────────────────────────────────────────
  const recordAndVerify = useCallback(async () => {
    if (isRecording) return;
    setIsRecording(true);
    setErrorMessage('');
    setScore(null);

    try {
      const { blob } = await recordAudio(3500);
      setIsRecording(false);

      const formData = new FormData();
      formData.append('audio', blob, 'voice_verify.wav');

      const res = await fetch(`${SERVER_URL}/api/auth/verify`, { method: 'POST', body: formData });
      const data = await res.json();

      setScore(data.score ?? null);

      if (data.locked) {
        setLockUntil(new Date(data.lockUntil));
        setAuthStatus('locked');
        return data;
      }

      if (data.success && data.match) {
        setDisplayName(data.displayName || 'Sir');
        setAuthStatus('authenticated');
      } else {
        setAttemptsLeft(data.attemptsLeft ?? 0);
        setAuthStatus('denied');
        setTimeout(() => setAuthStatus('authenticating'), 3000);
      }
      return data;
    } catch (err) {
      setIsRecording(false);
      setErrorMessage(err.message);
      setAuthStatus('authenticating');
      return { success: false, error: err.message };
    }
  }, [isRecording]);

  // ── RESET LOCK ──────────────────────────────────────────────────────────────
  const resetLock = useCallback(async () => {
    await fetch(`${SERVER_URL}/api/auth/reset-lock`, { method: 'POST' });
    setAuthStatus('authenticating');
    setLockUntil(null);
    setLockTimeRemaining(0);
    setAttemptsLeft(3);
  }, []);

  // ── RESET PROFILE ───────────────────────────────────────────────────────────
  const resetProfile = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/reset-profile`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setAuthStatus('enrolling');
        setEnrollmentStep(0);
        setEnrollmentStatus('idle');
        setIsEnrolled(false);
        setErrorMessage('');
      } else {
        setErrorMessage(data.error || 'Failed to reset');
      }
    } catch (err) {
      setErrorMessage('Server unreachable.');
    }
  }, []);

  return {
    authStatus, isEnrolled, isRecording, score, attemptsLeft,
    lockTimeRemaining, lockUntil, displayName, errorMessage,
    enrollmentStep, enrollmentStatus,
    setEnrollmentStep, setAuthStatus,
    checkEnrollmentStatus, recordAndVerify,
    enrollSample, finalizeEnrollment,
    resetLock, resetProfile,
  };
};
