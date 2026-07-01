#!/usr/bin/env python3
"""
J.A.R.V.I.S. Single Sample Enrollment — enroll_sample.py
Computes a 256-dim voice embedding for a single browser-recorded WAV file.
Used by the new browser-based enrollment flow.

Usage: python enroll_sample.py <audio_file_path>
Output: { "success": true, "embedding": [256 floats], "rms": 0.05, "has_voice": true }
"""

import sys
import json
import numpy as np
import os

def emit(obj):
    print(json.dumps(obj), flush=True)

def log_err(msg):
    print(f"[enroll_sample] {msg}", file=sys.stderr)

if len(sys.argv) < 2:
    emit({"success": False, "error": "Usage: enroll_sample.py <audio_file_path>"})
    sys.exit(1)

audio_path = sys.argv[1]

if not os.path.exists(audio_path):
    emit({"success": False, "error": f"Audio file not found: {audio_path}"})
    sys.exit(1)

try:
    from resemblyzer import VoiceEncoder, preprocess_wav
    from pathlib import Path
except ImportError:
    emit({"success": False, "error": "resemblyzer not installed"})
    sys.exit(1)

try:
    from scipy.io import wavfile
except ImportError:
    emit({"success": False, "error": "scipy not installed"})
    sys.exit(1)

try:
    # ── Load WAV and compute RMS for quality check ────────────────────────────
    sr, audio_data = wavfile.read(audio_path)

    # Convert to float32 [-1, 1]
    if audio_data.dtype == np.int16:
        audio_float = audio_data.astype(np.float32) / 32768.0
    elif audio_data.dtype == np.int32:
        audio_float = audio_data.astype(np.float32) / 2147483648.0
    elif audio_data.dtype == np.float32 or audio_data.dtype == np.float64:
        audio_float = audio_data.astype(np.float32)
    else:
        audio_float = audio_data.astype(np.float32)

    # Stereo → mono
    if len(audio_float.shape) == 2:
        audio_float = audio_float.mean(axis=1)

    # RMS = root mean square (volume indicator)
    rms = float(np.sqrt(np.mean(audio_float ** 2)))

    # Energy in top 75% of frames (voice activity estimate)
    frame_size = 512
    num_frames = len(audio_float) // frame_size
    frame_energies = [
        float(np.sqrt(np.mean(audio_float[i*frame_size:(i+1)*frame_size] ** 2)))
        for i in range(num_frames)
    ]
    if frame_energies:
        sorted_energies = sorted(frame_energies, reverse=True)
        voice_rms = float(np.mean(sorted_energies[:max(1, len(sorted_energies)//4)]))
    else:
        voice_rms = rms

    # Quality classification
    # good: clear voice detected
    # ok:   voice present but quiet
    # poor: mostly silence or too noisy
    if voice_rms > 0.04:
        quality = 'good'
    elif voice_rms > 0.015:
        quality = 'ok'
    else:
        quality = 'poor'

    has_voice = rms > 0.005

    # ── Compute voice embedding ───────────────────────────────────────────────
    encoder = VoiceEncoder()
    wav = preprocess_wav(Path(audio_path))
    embedding = encoder.embed_utterance(wav)

    emit({
        "success": True,
        "embedding": embedding.tolist(),
        "rms": round(rms, 5),
        "voice_rms": round(voice_rms, 5),
        "has_voice": has_voice,
        "quality": quality,
        "duration_s": round(len(audio_float) / sr, 2),
    })

except Exception as e:
    log_err(f"Error: {e}")
    emit({"success": False, "error": str(e)})
    sys.exit(1)
