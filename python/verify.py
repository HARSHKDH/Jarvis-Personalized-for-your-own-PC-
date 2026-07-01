#!/usr/bin/env python3
"""
J.A.R.V.I.S. Voice Verification — verify.py
Compares an audio sample against a stored voiceprint using cosine similarity.

Usage: python verify.py <audio_file_path> '<voiceprint_json_array>'
Output: { "match": true/false, "score": 0.92, "success": true }
"""

import sys
import json
import numpy as np

SIMILARITY_THRESHOLD = 0.40  # Calibrated for browser AudioContext → resemblyzer pipeline

def log_err(msg):
    print(f"[verify] {msg}", file=sys.stderr)

# ─── Validate args ─────────────────────────────────────────────────────────────
if len(sys.argv) < 3:
    print(json.dumps({
        "success": False,
        "error": "Usage: verify.py <audio_path> '<voiceprint_json>'"
    }))
    sys.exit(1)

audio_path = sys.argv[1]
voiceprint_json = sys.argv[2]

# ─── Import resemblyzer ────────────────────────────────────────────────────────
try:
    from resemblyzer import VoiceEncoder, preprocess_wav
    from pathlib import Path
except ImportError:
    log_err("resemblyzer not installed. Run: pip install resemblyzer")
    print(json.dumps({"success": False, "error": "resemblyzer not installed"}))
    sys.exit(1)

# ─── Import scipy ─────────────────────────────────────────────────────────────
try:
    from scipy.io import wavfile
    from scipy.spatial.distance import cosine as cosine_distance
except ImportError:
    log_err("scipy not installed. Run: pip install scipy")
    print(json.dumps({"success": False, "error": "scipy not installed"}))
    sys.exit(1)

import os
import tempfile


def load_voiceprint(voiceprint_json: str) -> np.ndarray:
    """Parse the stored voiceprint JSON array."""
    try:
        data = json.loads(voiceprint_json)
        vec = np.array(data, dtype=np.float32)
        if len(vec) != 256:
            raise ValueError(f"Expected 256-dim voiceprint, got {len(vec)}")
        return vec
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid voiceprint JSON: {e}")


def resample_to_16k(audio_path: str) -> str:
    """
    If the audio file is not 16kHz, resample it.
    Returns path to a 16kHz wav (may be the original or a temp file).
    """
    import wave
    try:
        with wave.open(audio_path, 'r') as wf:
            sr = wf.getframerate()
            channels = wf.getnchannels()
            frames = wf.readframes(wf.getnframes())
    except Exception:
        # Not a standard WAV — resemblyzer will try to handle it
        return audio_path

    if sr == 16000 and channels == 1:
        return audio_path

    # Resample using scipy
    audio_int16 = np.frombuffer(frames, dtype=np.int16)

    # Convert stereo to mono
    if channels == 2:
        audio_int16 = audio_int16.reshape(-1, 2).mean(axis=1).astype(np.int16)

    # Resample to 16kHz
    if sr != 16000:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(16000, sr)
        audio_float = audio_int16.astype(np.float32)
        audio_float = resample_poly(audio_float, 16000 // g, sr // g)
        audio_int16 = np.clip(audio_float, -32768, 32767).astype(np.int16)

    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    tmp_path = tmp.name
    tmp.close()
    wavfile.write(tmp_path, 16000, audio_int16)
    return tmp_path


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity in range [0, 1]."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def main():
    # ── Load stored voiceprint ─────────────────────────────────────────────────
    try:
        stored_voiceprint = load_voiceprint(voiceprint_json)
    except ValueError as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

    # ── Check audio file exists ────────────────────────────────────────────────
    if not os.path.exists(audio_path):
        print(json.dumps({"success": False, "error": f"Audio file not found: {audio_path}"}))
        sys.exit(1)

    # ── Load encoder ──────────────────────────────────────────────────────────
    try:
        encoder = VoiceEncoder()
    except Exception as e:
        print(json.dumps({"success": False, "error": f"VoiceEncoder failed: {str(e)}"}))
        sys.exit(1)

    # ── Preprocess audio ──────────────────────────────────────────────────────
    resampled_path = audio_path
    created_temp = False
    try:
        resampled_path = resample_to_16k(audio_path)
        created_temp = (resampled_path != audio_path)

        wav = preprocess_wav(Path(resampled_path))
        sample_embedding = encoder.embed_utterance(wav)

    except Exception as e:
        print(json.dumps({"success": False, "error": f"Audio processing failed: {str(e)}"}))
        sys.exit(1)
    finally:
        if created_temp and os.path.exists(resampled_path):
            os.unlink(resampled_path)

    # ── Compare voiceprints ───────────────────────────────────────────────────
    score = cosine_similarity(sample_embedding, stored_voiceprint)
    score = round(score, 4)
    match = score >= SIMILARITY_THRESHOLD

    result = {
        "success": True,
        "match": match,
        "score": score,
        "threshold": SIMILARITY_THRESHOLD,
    }

    print(json.dumps(result))


if __name__ == '__main__':
    main()
