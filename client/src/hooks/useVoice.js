import { useState, useEffect, useRef, useCallback } from 'react';

const WAKE_WORDS = ['jarvis', 'hey jarvis', 'ok jarvis', 'computer'];

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
  // Fallback to any English male voice
  return voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('male'))
    || voices.find(v => v.lang.startsWith('en'))
    || voices[0]
    || null;
};

export const useVoice = () => {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const commandCallbackRef = useRef(null);
  const activeListenRef = useRef(false);
  const wakeWordModeRef = useRef(false);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[Voice] Web Speech API not supported in this browser');
      setVoiceSupported(false);
      return;
    }

    setVoiceSupported(true);
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    let restartTimer = null;

    const scheduleRestart = (delay = 500) => {
      clearTimeout(restartTimer);
      if (wakeWordModeRef.current) {
        restartTimer = setTimeout(() => {
          try { recognition.start(); } catch (e) { /* already running */ }
        }, delay);
      }
    };

    recognition.onstart = () => {
      console.log('[Voice] Recognition started');
    };

    recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const lastResult = results[results.length - 1];
      const text = lastResult[0].transcript.trim().toLowerCase();

      if (lastResult.isFinal) {
        const finalText = lastResult[0].transcript.trim();

        if (!activeListenRef.current) {
          // Wake word detection mode
          const containsWakeWord = WAKE_WORDS.some(w => text.includes(w));
          if (containsWakeWord) {
            setWakeWordDetected(true);
            activeListenRef.current = true;
            setListening(true);
            setTranscript('');
            setTimeout(() => setWakeWordDetected(false), 2000);
          }
        } else {
          // Active listening mode — collect full command
          const cleanText = finalText;

          // Filter out wake word from beginning of command
          let command = cleanText;
          for (const wakeWord of WAKE_WORDS) {
            const regex = new RegExp(`^${wakeWord}[,.]?\\s*`, 'i');
            command = command.replace(regex, '').trim();
          }

          if (command && commandCallbackRef.current) {
            commandCallbackRef.current(command);
            activeListenRef.current = false;
            setListening(false);
            setTranscript('');
          }
        }
      } else {
        // Show interim results
        if (activeListenRef.current) {
          setTranscript(lastResult[0].transcript);
        }
      }
    };

    recognition.onerror = (event) => {
      // Ignore non-fatal errors
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        console.error('[Voice] Microphone permission denied! Please allow mic access in browser settings.');
        setVoiceSupported(false);
        setListening(false);
        activeListenRef.current = false;
        wakeWordModeRef.current = false;
        return;
      }

      // Recoverable errors (network glitch, audio-capture hiccup): log and restart
      console.warn('[Voice] Recognition error (will retry):', event.error);
      setListening(false);
      activeListenRef.current = false;
      scheduleRestart(1000);
    };

    recognition.onend = () => {
      // Auto-restart if wake word mode is active
      if (wakeWordModeRef.current) {
        scheduleRestart(300);
      } else {
        setListening(false);
        activeListenRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    // Load voices
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      clearTimeout(restartTimer);
      try {
        recognition.abort();
      } catch (e) {}
      wakeWordModeRef.current = false;
    };
  }, []);

  // Start continuous wake-word listening
  const startWakeWordMode = useCallback((onCommand) => {
    if (!recognitionRef.current || !voiceEnabled) return;
    commandCallbackRef.current = onCommand;
    wakeWordModeRef.current = true;
    try {
      recognitionRef.current.start();
    } catch (e) {
      // Already started
    }
  }, [voiceEnabled]);

  const stopWakeWordMode = useCallback(() => {
    wakeWordModeRef.current = false;
    activeListenRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch (e) {}
    setListening(false);
  }, []);

  // Manually trigger active listening
  const startListening = useCallback((onCommand) => {
    if (!recognitionRef.current) return;
    commandCallbackRef.current = onCommand;
    activeListenRef.current = true;
    setListening(true);
    setTranscript('');
    if (!wakeWordModeRef.current) {
      try {
        recognitionRef.current.start();
      } catch (e) {}
    }
  }, []);

  const stopListening = useCallback(() => {
    activeListenRef.current = false;
    setListening(false);
    setTranscript('');
    if (!wakeWordModeRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch (e) {}
    }
  }, []);

  // Text-to-speech
  const speak = useCallback((text) => {
    if (!voiceEnabled || !text) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Strip markdown for speech
    const cleanText = text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      .replace(/^[-*•]\s/gm, '')
      .replace(/\n+/g, '. ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 500); // Limit length for TTS

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.88;
    utterance.pitch = 0.82;
    utterance.volume = 1.0;

    // Set preferred voice
    const voices = voicesRef.current;
    if (voices.length > 0) {
      const voice = findBestVoice(voices);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  return {
    transcript,
    listening,
    speaking,
    wakeWordDetected,
    voiceEnabled,
    voiceSupported,
    setVoiceEnabled,
    startListening,
    stopListening,
    startWakeWordMode,
    stopWakeWordMode,
    speak,
    stopSpeaking,
  };
};
