import { useEffect, useRef, useCallback, useState } from 'react';

const WAKE_PHRASES = ['hello jarvis', 'hey jarvis', 'jarvis', 'wake up jarvis'];

/**
 * useWakeWord — continuously listens for "Hello JARVIS" or "Hey JARVIS"
 * Uses the Web Speech API (works in Chrome/Edge).
 * @param {function} onWake - called when wake word detected
 * @param {boolean} enabled - whether to listen
 */
export const useWakeWord = (onWake, enabled = true) => {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const enabledRef = useRef(enabled);
  const onWakeRef = useRef(onWake);       // stable ref — never recreates startListening
  const restartTimerRef = useRef(null);
  const networkBackoffRef = useRef(0);

  enabledRef.current = enabled;
  onWakeRef.current  = onWake;            // always points to latest callback

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return; // Not supported

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      // A result means the backend is reachable — clear any error backoff.
      networkBackoffRef.current = 0;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        // Only act on FINAL results — interim partials can falsely match wake words
        if (!result.isFinal) continue;
        const transcript = result[0].transcript.toLowerCase().trim();
        if (transcript) setLastTranscript(transcript);
        const detected = WAKE_PHRASES.some(phrase => transcript.includes(phrase));
        if (detected && enabledRef.current) {
          console.log('[WakeWord] Detected (final):', transcript);
          onWakeRef.current?.(transcript);
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Restart after a brief delay to keep it continuous
      if (enabledRef.current) {
        // Back off when the speech backend is unreachable ('network' error),
        // otherwise a tight retry loop spams the console and pins the CPU.
        const delay = networkBackoffRef.current > 0
          ? Math.min(1000 * 2 ** networkBackoffRef.current, 8000)
          : 500;
        restartTimerRef.current = setTimeout(() => {
          if (enabledRef.current) startListening();
        }, delay);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is normal — just restart
      if (event.error === 'network' || event.error === 'service-not-allowed') {
        // Speech recognition backend unreachable (common in Electron, offline,
        // or when Google's speech service is blocked). Back off and retry.
        networkBackoffRef.current = Math.min(networkBackoffRef.current + 1, 5);
        if (networkBackoffRef.current === 1) {
          console.warn('[WakeWord] Speech backend unreachable — backing off retries');
        }
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[WakeWord] Error:', event.error);
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { /* already running */ }
  // No deps — uses refs so this never needs to recreate
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enabled) {
      // Small delay to not conflict with other audio processes
      const t = setTimeout(startListening, 1000);
      return () => {
        clearTimeout(t);
        clearTimeout(restartTimerRef.current);
        if (recognitionRef.current) {
          enabledRef.current = false;
          try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
        }
      };
    } else {
      clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
      setIsListening(false);
    }
  }, [enabled, startListening]);

  return { isListening, lastTranscript };
};
