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
  const restartTimerRef = useRef(null);

  enabledRef.current = enabled;

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
      // Look at all results from the latest segment
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript.toLowerCase().trim();

        if (transcript) setLastTranscript(transcript);

        // Check for wake phrases
        const detected = WAKE_PHRASES.some(phrase => transcript.includes(phrase));
        if (detected && enabledRef.current) {
          console.log('[WakeWord] Detected:', transcript);
          onWake?.(transcript);
        }
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // Restart after a brief delay to keep it continuous
      if (enabledRef.current) {
        restartTimerRef.current = setTimeout(() => {
          if (enabledRef.current) startListening();
        }, 500);
      }
    };

    recognition.onerror = (event) => {
      // 'no-speech' is normal — just restart
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        console.warn('[WakeWord] Error:', event.error);
      }
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try { recognition.start(); } catch (e) { /* already running */ }
  }, [onWake]);

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
