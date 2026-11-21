import { useState, useEffect, useRef, useCallback } from 'react';

// Longest phrases FIRST so we strip the most specific match
const WAKE_WORDS = ['hello jarvis', 'hey jarvis', 'ok jarvis', 'jarvis', 'computer'];

// Preferred voices in order of preference
const PREFERRED_VOICES = [
  'Google UK English Male',
  'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  'Daniel',
  'Google US English',
  'Microsoft David Desktop',
];

const findBestVoice = (voices) => {
  for (const preferred of PREFERRED_VOICES) {
    const found = voices.find(v => v.name.toLowerCase().includes(preferred.toLowerCase()));
    if (found) return found;
  }
  return voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0]
    || null;
};

export const useVoice = () => {
  const [transcript, setTranscript]           = useState('');
  const [listening, setListening]             = useState(false);
  const [speaking, setSpeaking]               = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [wakeWordHasCommand, setWakeWordHasCommand] = useState(false); // true = inline cmd alongside wake word
  const [voiceEnabled, setVoiceEnabledState]  = useState(true);
  const [voiceSupported, setVoiceSupported]   = useState(false);
  // True when the browser's Web Speech backend is unreachable (e.g. Electron /
  // embedded Chromium have no Google speech key → permanent 'network' errors).
  // Signals the app to switch to the server-side transcription fallback.
  const [voiceBackendFailed, setVoiceBackendFailed] = useState(false);

  // ── Refs: never stale inside closures ────────────────────────────────────────
  const recognitionRef      = useRef(null);
  const voicesRef           = useRef([]);
  const commandCallbackRef  = useRef(null);
  const activeListenRef     = useRef(false);   // true = listening for a command
  const wakeWordModeRef     = useRef(false);   // true = wake-word loop running
  const voiceEnabledRef     = useRef(true);    // mirrors voiceEnabled state
  const speakingRef         = useRef(false);   // mirrors speaking state
  const restartTimerRef     = useRef(null);
  const isStartingRef       = useRef(false);   // prevent double-start races
  const networkBackoffRef   = useRef(0);       // grows on repeated 'network' errors

  // Keep voiceEnabledRef in sync
  const setVoiceEnabled = useCallback((val) => {
    voiceEnabledRef.current = val;
    setVoiceEnabledState(val);
    if (!val) {
      // If disabled while in wake-word mode, stop everything
      wakeWordModeRef.current = false;
      activeListenRef.current = false;
      clearTimeout(restartTimerRef.current);
      try { recognitionRef.current?.abort(); } catch (e) {}
    }
  }, []);

  // ── Schedule a restart of the recognition loop ────────────────────────────────
  const scheduleRestart = useCallback((delayMs = 400) => {
    clearTimeout(restartTimerRef.current);
    restartTimerRef.current = setTimeout(() => {
      if (!wakeWordModeRef.current || !voiceEnabledRef.current || speakingRef.current) return;
      if (!recognitionRef.current) return;
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      try {
        recognitionRef.current.start();
        console.log('[Voice] Recognition restarted');
      } catch (e) {
        // "already started" is fine — just clear the flag
      } finally {
        isStartingRef.current = false;
      }
    }, delayMs);
  }, []);

  // ── Initialize speech recognition ONCE ───────────────────────────────────────
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Voice] Web Speech API not supported in this browser');
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);

    const recognition = new SpeechRecognition();
    recognition.lang            = 'en-US';
    recognition.interimResults  = true;
    recognition.continuous      = true;
    recognition.maxAlternatives = 3;   // more alternatives = better wake word detection

    recognition.onstart = () => {
      console.log('[Voice] Recognition started ✓');
      isStartingRef.current = false;
    };

    recognition.onresult = (event) => {
      const results    = Array.from(event.results);
      const lastResult = results[results.length - 1];
      // A result means the speech backend is reachable — clear error backoff.
      networkBackoffRef.current = 0;
      setVoiceBackendFailed(false);

      // Check ALL alternatives, not just [0], for wake word (improves accuracy)
      const allTranscripts = Array.from({ length: lastResult.length }, (_, i) =>
        lastResult[i].transcript.trim().toLowerCase()
      );
      const primaryText = lastResult[0].transcript.trim();
      const lowerText   = primaryText.toLowerCase();

      if (lastResult.isFinal) {
        if (!activeListenRef.current) {
          // ── Wake word detection mode ──────────────────────────────────────────
          const containsWakeWord = WAKE_WORDS.some(w =>
            allTranscripts.some(t => t.includes(w))
          );

          if (containsWakeWord) {
            console.log('[Voice] Wake word detected:', primaryText);
            setWakeWordDetected(true);
            setTimeout(() => setWakeWordDetected(false), 2000);

            // Try to extract an inline command from the SAME utterance
            // e.g. "Hello Jarvis what's the time" → "what's the time"
            let inlineCommand = primaryText;
            for (const wakeWord of WAKE_WORDS) {
              const regex  = new RegExp(`^${wakeWord}[,.]?\\s*`, 'i');
              const stripped = inlineCommand.replace(regex, '').trim();
              if (stripped !== inlineCommand) {
                inlineCommand = stripped;
                break;
              }
            }

            const hasInlineCommand = inlineCommand.length > 1;

            if (hasInlineCommand && commandCallbackRef.current) {
              // Fire the command immediately — mark that there IS an inline command
              // so the MiniHUD greeting is suppressed (command already being handled)
              console.log('[Voice] Inline command:', inlineCommand);
              setWakeWordHasCommand(true);
              setTimeout(() => setWakeWordHasCommand(false), 2000);
              commandCallbackRef.current(inlineCommand);
            } else {
              // No inline command → wake word only, clear the flag
              setWakeWordHasCommand(false);
              // Wait for next utterance
              activeListenRef.current = true;
              setListening(true);
              setTranscript('');
            }
          }
        } else {
          // ── Active listen mode: collect the command ───────────────────────────
          let command = primaryText;
          for (const wakeWord of WAKE_WORDS) {
            const regex = new RegExp(`^${wakeWord}[,.]?\\s*`, 'i');
            command = command.replace(regex, '').trim();
          }

          if (command && commandCallbackRef.current) {
            console.log('[Voice] Command:', command);
            commandCallbackRef.current(command);
          }
          activeListenRef.current = false;
          setListening(false);
          setTranscript('');
        }
      } else if (activeListenRef.current) {
        // Show interim transcript while user is speaking
        setTranscript(primaryText);
      }
    };

    recognition.onerror = (event) => {
      isStartingRef.current = false;
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // Normal — just restart
        if (wakeWordModeRef.current && !speakingRef.current) {
          scheduleRestart(300);
        }
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        console.error('[Voice] ❌ Microphone permission denied — switching to VAD fallback');
        // Don't set voiceSupported=false here; the VAD fallback uses getUserMedia
        // directly and may still work. Just declare the Web Speech backend failed.
        setVoiceBackendFailed(true);
        setListening(false);
        activeListenRef.current   = false;
        wakeWordModeRef.current   = false;
        return;
      }
      if (event.error === 'network') {
        // Speech backend unreachable (Electron w/o Google key, offline, or the
        // service is blocked). Back off but switch to VAD after just 1 failure.
        networkBackoffRef.current = Math.min(networkBackoffRef.current + 1, 5);
        if (networkBackoffRef.current === 1) {
          console.warn('[Voice] Speech backend unreachable — switching to VAD fallback');
          // After the FIRST network error, declare the browser speech backend
          // dead so the app immediately switches to the server-transcription
          // (Gemini VAD) fallback. This is the common Electron case.
          setVoiceBackendFailed(true);
        }
        setListening(false);
        activeListenRef.current = false;
        if (wakeWordModeRef.current && !speakingRef.current) {
          // Use a shorter max backoff (10s) so we retry the browser path
          // occasionally in case the network comes back.
          scheduleRestart(Math.min(1000 * 2 ** networkBackoffRef.current, 10000));
        }
        return;
      }
      // Other recoverable errors
      console.warn('[Voice] Recognition error (will retry):', event.error);
      setListening(false);
      activeListenRef.current = false;
      scheduleRestart(1000);
    };

    recognition.onend = () => {
      console.log('[Voice] Recognition ended');
      isStartingRef.current = false;
      if (wakeWordModeRef.current && voiceEnabledRef.current && !speakingRef.current) {
        scheduleRestart(300);
      } else {
        setListening(false);
        activeListenRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    // Load TTS voices
    const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      clearTimeout(restartTimerRef.current);
      wakeWordModeRef.current = false;
      try { recognition.abort(); } catch (e) {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Start continuous wake-word listening ──────────────────────────────────────
  // Safe to call multiple times — idempotent
  const startWakeWordMode = useCallback((onCommand) => {
    if (!recognitionRef.current) {
      console.warn('[Voice] startWakeWordMode: recognition not ready yet');
      return;
    }
    if (!voiceEnabledRef.current) return;

    commandCallbackRef.current = onCommand;

    if (wakeWordModeRef.current) {
      // Already running — just update the callback
      console.log('[Voice] startWakeWordMode: already active, updating callback');
      return;
    }

    console.log('[Voice] Starting wake-word mode');
    wakeWordModeRef.current = true;

    // Use scheduleRestart with a tiny delay to avoid the "already started" race
    // that happens when startWakeWordMode is called right after the recognizer
    // just started (e.g. during initial render)
    scheduleRestart(200);
  }, [scheduleRestart]);

  const stopWakeWordMode = useCallback(() => {
    wakeWordModeRef.current   = false;
    activeListenRef.current   = false;
    clearTimeout(restartTimerRef.current);
    try { recognitionRef.current?.abort(); } catch (e) {}
    setListening(false);
  }, []);

  // ── Manual active listening (button press) ───────────────────────────────────
  const startListening = useCallback((onCommand) => {
    if (!recognitionRef.current) return;
    commandCallbackRef.current = onCommand;
    activeListenRef.current    = true;
    setListening(true);
    setTranscript('');
    if (!wakeWordModeRef.current) {
      try { recognitionRef.current.start(); } catch (e) {}
    }
  }, []);

  const stopListening = useCallback(() => {
    activeListenRef.current = false;
    setListening(false);
    setTranscript('');
    if (!wakeWordModeRef.current) {
      try { recognitionRef.current?.stop(); } catch (e) {}
    }
  }, []);

  // ── Text-to-speech ────────────────────────────────────────────────────────────
  // Pauses recognition while speaking so it doesn't pick up its own voice,
  // then automatically resumes wake-word mode when done.
  const speak = useCallback((text) => {
    if (!voiceEnabledRef.current || !text) return;

    window.speechSynthesis.cancel();

    const cleanText = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*•]\s/gm, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500);

    const utterance    = new SpeechSynthesisUtterance(cleanText);
    utterance.rate     = 0.88;
    utterance.pitch    = 0.82;
    utterance.volume   = 1.0;

    const voices = voicesRef.current;
    if (voices.length > 0) {
      const voice = findBestVoice(voices);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      speakingRef.current = true;
      setSpeaking(true);
      // Pause recognition while speaking to avoid feedback loop
      clearTimeout(restartTimerRef.current);
      try { recognitionRef.current?.abort(); } catch (e) {}
    };

    const onSpeakEnd = () => {
      speakingRef.current = false;
      setSpeaking(false);
      // Resume wake-word listening after speaking finishes
      if (wakeWordModeRef.current && voiceEnabledRef.current) {
        scheduleRestart(600);
      }
    };

    utterance.onend   = onSpeakEnd;
    utterance.onerror = onSpeakEnd;

    window.speechSynthesis.speak(utterance);
  }, [scheduleRestart]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeaking(false);
    if (wakeWordModeRef.current && voiceEnabledRef.current) {
      scheduleRestart(400);
    }
  }, [scheduleRestart]);

  return {
    transcript,
    listening,
    speaking,
    wakeWordDetected,
    wakeWordHasCommand,
    voiceEnabled,
    voiceSupported,
    voiceBackendFailed,
    setVoiceEnabled,
    startListening,
    stopListening,
    startWakeWordMode,
    stopWakeWordMode,
    speak,
    stopSpeaking,
  };
};
