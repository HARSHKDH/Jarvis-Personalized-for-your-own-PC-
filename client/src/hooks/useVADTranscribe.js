import { useEffect, useRef, useCallback } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── VAD tuning (mirrors the Electron overlay's proven values) ─────────────────
const VAD_VOICE_THRESH   = 6;    // RMS threshold — lowered for quieter speech
const VAD_VOICE_FRAMES   = 1;    // frames of voice before recording starts (~100ms)
const VAD_SILENCE_FRAMES = 8;    // frames of silence before recording stops (~800ms)
const VAD_POLL_MS        = 100;  // poll interval
const VAD_MIN_BYTES      = 200;  // ignore clips shorter than this
let   _vadRmsLog         = 0;    // rate-limit debug log

/**
 * useVADTranscribe — browser-independent voice input.
 *
 * When the browser's Web Speech API is unavailable (Electron / embedded
 * Chromium have no Google speech key → permanent 'network' errors), this hook
 * records speech segments with a simple energy-based VAD and sends them to the
 * server's /api/transcribe (Gemini) endpoint. Each recognised transcript is
 * passed to `onTranscript`.
 *
 * @param {(text: string) => void} onTranscript  called with each transcript
 * @param {boolean} enabled                        start/stop listening
 * @param {() => boolean} isSpeakingRef            optional: returns true while
 *                                                 JARVIS is talking (so we don't
 *                                                 record its own TTS output)
 */
export const useVADTranscribe = (onTranscript, enabled, isSpeaking = () => false) => {
  const streamRef      = useRef(null);
  const ctxRef         = useRef(null);
  const analyserRef    = useRef(null);
  const intervalRef    = useRef(null);
  const recorderRef    = useRef(null);
  const chunksRef      = useRef([]);
  const voiceFramesRef = useRef(0);
  const silenceRef     = useRef(0);
  const recordingRef   = useRef(false);
  const activeRef      = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const isSpeakingRef  = useRef(isSpeaking);

  onTranscriptRef.current = onTranscript;
  isSpeakingRef.current   = isSpeaking;

  const handleBlob = useCallback(async (blob, mimeType) => {
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload  = () => resolve(String(r.result).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });

      const res = await fetch(`${SERVER_URL}/api/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio: base64, mimeType }),
      });
      if (!res.ok) return;

      const { transcript = '' } = await res.json();
      const text = transcript.trim();
      if (text) {
        console.log('[VAD] 📝 Transcript:', text);
        onTranscriptRef.current?.(text);
      }
    } catch (e) {
      console.warn('[VAD] Transcription error:', e.message);
    }
  }, []);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (recordingRef.current && recorderRef.current?.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recordingRef.current = false;
    voiceFramesRef.current = silenceRef.current = 0;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (ctxRef.current) { ctxRef.current.close().catch(() => {}); ctxRef.current = null; }
  }, []);

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    voiceFramesRef.current = silenceRef.current = 0;

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
        video: false,
      });

      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctxRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = ctxRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      src.connect(analyserRef.current);

      const buf = new Uint8Array(analyserRef.current.frequencyBinCount);

      intervalRef.current = setInterval(() => {
        if (!activeRef.current) return;
        // Don't record JARVIS's own TTS voice.
        if (isSpeakingRef.current?.()) return;

        analyserRef.current.getByteFrequencyData(buf);
        const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);

        // Log RMS every ~2 seconds so you can see audio level in console
        _vadRmsLog++;
        if (_vadRmsLog % 20 === 0) {
          console.debug(`[VAD] RMS=${rms.toFixed(1)} thresh=${VAD_VOICE_THRESH} recording=${recordingRef.current}`);
        }

        if (rms > VAD_VOICE_THRESH) {
          voiceFramesRef.current++;
          silenceRef.current = 0;

          if (!recordingRef.current && voiceFramesRef.current >= VAD_VOICE_FRAMES) {
            chunksRef.current = [];
            const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus' : 'audio/webm';
            recorderRef.current = new MediaRecorder(streamRef.current, { mimeType: mime });
            recorderRef.current.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
            recorderRef.current.start();
            recordingRef.current = true;
          }
        } else {
          silenceRef.current++;
          voiceFramesRef.current = 0;

          if (recordingRef.current && silenceRef.current >= VAD_SILENCE_FRAMES) {
            recordingRef.current = false;
            const recorder = recorderRef.current;
            recorder.onstop = async () => {
              const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
              if (blob.size >= VAD_MIN_BYTES) await handleBlob(blob, recorder.mimeType);
            };
            try { recorder.stop(); } catch { /* ignore */ }
          }
        }
      }, VAD_POLL_MS);

      console.log('[VAD] ✅ Server-transcription listening active');
    } catch (e) {
      console.error('[VAD] ❌ Failed to start:', e.message);
      activeRef.current = false;
    }
  }, [handleBlob]);

  useEffect(() => {
    if (enabled) start();
    else stop();
    return () => stop();
  }, [enabled, start, stop]);
};
