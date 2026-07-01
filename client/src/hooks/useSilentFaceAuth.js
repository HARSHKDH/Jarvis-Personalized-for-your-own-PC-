import { useState, useEffect, useRef, useCallback } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

/**
 * useSilentFaceAuth
 *
 * Silently runs face recognition in the background using a hidden video element.
 * The caller must pass a `videoRef` pointing to a hidden <video> DOM element.
 *
 * Returns:
 *   status: 'pending' | 'authenticated' | 'failed' | 'no-profile' | 'no-camera'
 *   cancel: () => void  — stops the scan and releases the camera
 */
export const useSilentFaceAuth = (videoRef, enabled = true) => {
  const [status, setStatus] = useState('pending');
  const streamRef   = useRef(null);
  const canceledRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    canceledRef.current = true;
    stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (!enabled) return;
    canceledRef.current = false;

    // Hard timeout — if we take > 14s total, just fail gracefully
    const hardTimeout = setTimeout(() => {
      if (!canceledRef.current && status === 'pending') {
        canceledRef.current = true;
        stopCamera();
        setStatus('failed');
      }
    }, 14000);

    const run = async () => {
      try {
        // ── 1. Check if face is enrolled ────────────────────────────────────
        const profileRes = await fetch(`${SERVER_URL}/api/auth/face-profile`).catch(() => null);
        if (!profileRes || !profileRes.ok) {
          setStatus('no-profile');
          clearTimeout(hardTimeout);
          return;
        }
        const profile = await profileRes.json();
        if (!profile.faceEnrolled || !profile.descriptor) {
          setStatus('no-profile');
          clearTimeout(hardTimeout);
          return;
        }
        if (canceledRef.current) return;

        // ── 2. Load face-api models in parallel with camera init ─────────────
        const [faceapi] = await Promise.all([
          import('face-api.js'),
          // Start camera simultaneously so we don't waste time
          navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: 'user' },
          }).then(stream => {
            streamRef.current = stream;
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
              videoRef.current.muted = true;
              videoRef.current.playsInline = true;
            }
          }).catch(() => null),
        ]);
        if (canceledRef.current) { stopCamera(); return; }

        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        if (canceledRef.current) { stopCamera(); return; }

        // ── 3. Play camera, let it stabilize ────────────────────────────────
        if (!streamRef.current) {
          // Camera permission denied
          setStatus('no-camera');
          clearTimeout(hardTimeout);
          return;
        }
        if (videoRef.current) {
          try {
            await videoRef.current.play();
          } catch { /* autoplay may be blocked, continue anyway */ }
          await new Promise(r => setTimeout(r, 700));
        }
        if (canceledRef.current) { stopCamera(); return; }

        // ── 4. Collect face detections (up to 5 good frames, max 10s) ───────
        const SCAN_ROUNDS = 20;  // up to 20 frames × 500ms = 10s
        const MAX_SAMPLES = 5;
        const detections  = [];

        for (let i = 0; i < SCAN_ROUNDS; i++) {
          if (canceledRef.current || !videoRef.current) break;
          await new Promise(r => setTimeout(r, 500));
          try {
            const d = await faceapi
              .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.38 }))
              .withFaceLandmarks()
              .withFaceDescriptor();
            if (d) {
              detections.push(d);
              if (detections.length >= MAX_SAMPLES) break;
            }
          } catch { /* skip frame */ }
        }

        if (canceledRef.current) { stopCamera(); return; }
        stopCamera();

        if (detections.length === 0) {
          setStatus('failed');
          clearTimeout(hardTimeout);
          return;
        }

        // ── 5. Compare against enrolled descriptor ───────────────────────────
        const storedDesc = new Float32Array(profile.descriptor);
        let bestDist = Infinity;
        for (const d of detections) {
          const dist = faceapi.euclideanDistance(d.descriptor, storedDesc);
          if (dist < bestDist) bestDist = dist;
        }

        const THRESHOLD = 0.50;
        clearTimeout(hardTimeout);
        setStatus(bestDist < THRESHOLD ? 'authenticated' : 'failed');
      } catch (err) {
        if (!canceledRef.current) {
          stopCamera();
          setStatus('failed');
        }
        clearTimeout(hardTimeout);
      }
    };

    run();

    return () => {
      canceledRef.current = true;
      clearTimeout(hardTimeout);
      stopCamera();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { status, cancel, stopCamera };
};
