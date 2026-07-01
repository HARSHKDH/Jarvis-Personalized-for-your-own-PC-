import { useState, useRef, useCallback } from 'react';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

/**
 * useSilentAuth
 * 
 * Silent face recognition hook. Requires a videoRef pointing to a hidden
 * <video> element in the DOM. Call scan() to start / restart.
 * 
 * status: 'idle' | 'scanning' | 'authenticated' | 'failed' | 'no-profile'
 */
export const useSilentAuth = (videoRef) => {
  const [status, setStatus] = useState('idle');
  const streamRef    = useRef(null);
  const cancelledRef = useRef(false);
  const timeoutRef   = useRef(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [videoRef]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    stopCamera();
  }, [stopCamera]);

  const scan = useCallback(async () => {
    // Reset any previous run
    cancel();
    await new Promise(r => setTimeout(r, 50)); // micro-tick for cleanup
    cancelledRef.current = false;
    setStatus('scanning');

    // Hard timeout — 16 seconds max
    timeoutRef.current = setTimeout(() => {
      if (!cancelledRef.current) {
        cancelledRef.current = true;
        stopCamera();
        setStatus('failed');
      }
    }, 16000);

    try {
      // ── 1. Check if face profile exists ─────────────────────────────────
      let profile;
      try {
        const res = await fetch(`${SERVER_URL}/api/auth/face-profile`);
        profile = await res.json();
      } catch {
        clearTimeout(timeoutRef.current);
        setStatus('no-profile');
        return;
      }

      if (!profile.faceEnrolled || !profile.descriptor) {
        clearTimeout(timeoutRef.current);
        setStatus('no-profile');
        return;
      }
      if (cancelledRef.current) return;

      // ── 2. Start camera ──────────────────────────────────────────────────
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240, facingMode: 'user' },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
        }
      } catch {
        clearTimeout(timeoutRef.current);
        setStatus('failed');
        return;
      }
      if (cancelledRef.current) { stopCamera(); return; }

      // ── 3. Load face-api models ──────────────────────────────────────────
      const faceapi = await import('face-api.js');
      const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      if (cancelledRef.current) { stopCamera(); return; }

      // ── 4. Let camera stabilise ──────────────────────────────────────────
      if (videoRef.current) {
        try { await videoRef.current.play(); } catch { /* autoplay blocked — ok */ }
        await new Promise(r => setTimeout(r, 800));
      }
      if (cancelledRef.current) { stopCamera(); return; }

      // ── 5. Collect up to 5 good face detections (max 10 s) ──────────────
      const detections = [];
      for (let i = 0; i < 20; i++) {
        if (cancelledRef.current || !videoRef.current) break;
        await new Promise(r => setTimeout(r, 500));
        try {
          const d = await faceapi
            .detectSingleFace(
              videoRef.current,
              new faceapi.SsdMobilenetv1Options({ minConfidence: 0.38 })
            )
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (d) {
            detections.push(d);
            if (detections.length >= 5) break;
          }
        } catch { /* skip bad frame */ }
      }

      if (cancelledRef.current) { stopCamera(); return; }
      stopCamera();
      clearTimeout(timeoutRef.current);

      if (detections.length === 0) {
        setStatus('failed');
        return;
      }

      // ── 6. Match against enrolled descriptor ────────────────────────────
      const storedDesc = new Float32Array(profile.descriptor);
      let bestDist = Infinity;
      for (const d of detections) {
        const dist = faceapi.euclideanDistance(d.descriptor, storedDesc);
        if (dist < bestDist) bestDist = dist;
      }

      setStatus(bestDist < 0.50 ? 'authenticated' : 'failed');
    } catch {
      if (!cancelledRef.current) {
        stopCamera();
        setStatus('failed');
      }
      clearTimeout(timeoutRef.current);
    }
  }, [videoRef, stopCamera, cancel]);

  return { status, scan, cancel };
};
