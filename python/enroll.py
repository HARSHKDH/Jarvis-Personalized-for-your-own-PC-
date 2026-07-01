#!/usr/bin/env python3
"""
J.A.R.V.I.S. Voice Enrollment — enroll.py
Records 3 audio samples, generates a master voiceprint using resemblyzer,
and outputs JSON to stdout.

Timing per sample:
  1. Emit 'ready'   → 3 second pause (user reads phrase on screen)
  2. Emit 'countdown' → 1 second countdown
  3. Emit 'recording' → 4 seconds of actual recording
  4. Emit 'processing' → embedding computed
  5. Emit 'sample_done' → 1.5 second gap before next phrase

Usage: python enroll.py
Output: { "voiceprint": [256 floats], "success": true }
"""

import sys
import json
import time
import numpy as np
import tempfile
import os

def emit(obj):
    """Write a JSON event to stdout immediately."""
    print(json.dumps(obj), flush=True)

def log_err(msg):
    print(f"[enroll] {msg}", file=sys.stderr)

# ─── Import resemblyzer ────────────────────────────────────────────────────────
try:
    from resemblyzer import VoiceEncoder, preprocess_wav
    from pathlib import Path
except ImportError:
    log_err("resemblyzer not installed. Run: pip install resemblyzer")
    emit({"success": False, "error": "resemblyzer not installed"})
    sys.exit(1)

# ─── Import sounddevice ────────────────────────────────────────────────────────
try:
    import sounddevice as sd
except ImportError:
    log_err("sounddevice not installed. Run: pip install sounddevice")
    emit({"success": False, "error": "sounddevice not installed"})
    sys.exit(1)

# ─── Import scipy for wav writing ─────────────────────────────────────────────
try:
    from scipy.io import wavfile
except ImportError:
    log_err("scipy not installed. Run: pip install scipy")
    emit({"success": False, "error": "scipy not installed"})
    sys.exit(1)


# ─── Config ───────────────────────────────────────────────────────────────────
SAMPLE_RATE     = 16000   # resemblyzer expects 16kHz
RECORD_DURATION = 4       # seconds per recording (longer = more data = better accuracy)
PREVIEW_DELAY   = 3.0     # seconds to show phrase BEFORE recording starts
GAP_BETWEEN     = 1.5     # seconds after sample_done before next phrase
NUM_SAMPLES     = 3

PHRASES = [
    "JARVIS, all systems online",
    "Activate security protocols",
    "Authorization confirmed, sir",
]


def record_sample(phrase_index: int) -> np.ndarray:
    """Record RECORD_DURATION seconds of audio from the default microphone."""
    try:
        audio = sd.rec(
            int(RECORD_DURATION * SAMPLE_RATE),
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype='float32'
        )
        sd.wait()  # Block until recording is done
        return audio.flatten()
    except sd.PortAudioError as e:
        raise RuntimeError(f"Microphone error: {e}. Check mic permissions.")


def audio_to_embedding(encoder: VoiceEncoder, audio: np.ndarray) -> np.ndarray:
    """Convert raw audio ndarray to a 256-dim voiceprint embedding."""
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
        tmp_path = tmp.name

    try:
        audio_int16 = (audio * 32767).astype(np.int16)
        wavfile.write(tmp_path, SAMPLE_RATE, audio_int16)
        wav = preprocess_wav(Path(tmp_path))
        embedding = encoder.embed_utterance(wav)
        return embedding
    finally:
        os.unlink(tmp_path)


def main():
    emit({"status": "init", "message": "Loading voice encoder..."})

    try:
        encoder = VoiceEncoder()
    except Exception as e:
        log_err(f"Failed to load VoiceEncoder: {e}")
        emit({"success": False, "error": f"VoiceEncoder load failed: {str(e)}"})
        sys.exit(1)

    emit({"status": "encoder_ready", "message": "Encoder loaded. Starting enrollment."})

    embeddings = []

    for i in range(NUM_SAMPLES):
        phrase = PHRASES[i]

        # ── Step 1: Tell UI to show this phrase. User has PREVIEW_DELAY seconds to read it.
        emit({
            "status": "ready",
            "sample": i + 1,
            "total": NUM_SAMPLES,
            "phrase": phrase,
            "record_in": PREVIEW_DELAY,
        })

        # Give the user time to see the phrase and prepare to speak
        time.sleep(PREVIEW_DELAY)

        # ── Step 2: Countdown (1 second warning before mic opens)
        emit({
            "status": "countdown",
            "sample": i + 1,
            "phrase": phrase,
        })
        time.sleep(1.0)

        # ── Step 3: Start recording — mic is now OPEN
        emit({
            "status": "recording",
            "sample": i + 1,
            "phrase": phrase,
            "duration": RECORD_DURATION,
        })

        try:
            audio = record_sample(i)
        except RuntimeError as e:
            emit({"success": False, "error": str(e)})
            sys.exit(1)

        # ── Step 4: Processing embedding
        emit({"status": "processing", "sample": i + 1})

        try:
            embedding = audio_to_embedding(encoder, audio)
            embeddings.append(embedding)
        except Exception as e:
            emit({"success": False, "error": f"Sample {i+1} processing failed: {str(e)}"})
            sys.exit(1)

        # ── Step 5: Sample done — brief pause before moving to next
        emit({"status": "sample_done", "sample": i + 1, "total": NUM_SAMPLES})

        # Gap between phrases (not after the last one)
        if i < NUM_SAMPLES - 1:
            time.sleep(GAP_BETWEEN)

    # ── All samples collected — generate master voiceprint
    emit({"status": "finalizing", "message": "Computing master voiceprint..."})

    master_voiceprint = np.mean(embeddings, axis=0)

    # L2-normalize for cosine similarity comparisons
    norm = np.linalg.norm(master_voiceprint)
    if norm > 0:
        master_voiceprint = master_voiceprint / norm

    result = {
        "success": True,
        "voiceprint": master_voiceprint.tolist(),
        "dimensions": len(master_voiceprint),
        "samples_used": NUM_SAMPLES,
    }

    # Final result line — Node.js parses this
    emit(result)


if __name__ == '__main__':
    main()
