import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from 'face-api.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

// CDN for model weights — loads once and is cached by the browser
const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

// Face match threshold: Euclidean distance < 0.45 = same person
const FACE_MATCH_THRESHOLD = 0.45;

// Number of face samples to average during enrollment
const ENROLL_SAMPLES = 8;

export const useFaceAuth = () => {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [faceStatus, setFaceStatus] = useState('idle');
  // idle | loading-models | ready | scanning | found | no-face | enrolling | enrolled | failed | match | nomatch
  const [faceDistance, setFaceDistance] = useState(null);
  const [captureCount, setCaptureCount] = useState(0);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectLoopRef = useRef(null);
  const storedDescriptorRef = useRef(null);

  // ── Load models ───────────────────────────────────────────────────────────
  const loadModels = useCallback(async () => {
    if (modelsLoaded || modelsLoading) return;
    setModelsLoading(true);
    setModelsError('');
    setFaceStatus('loading-models');
    try {
      await Promise.all([
        faceapi.loadSsdMobilenetv1Model(MODEL_URL),
        faceapi.loadFaceLandmarkModel(MODEL_URL),
        faceapi.loadFaceRecognitionModel(MODEL_URL),
      ]);
      setModelsLoaded(true);
      setFaceStatus('ready');
      console.log('[FaceAuth] Models loaded.');
    } catch (err) {
      setModelsError(`Model load failed: ${err.message}`);
      setFaceStatus('idle');
      console.error('[FaceAuth] Failed to load models:', err);
    } finally {
      setModelsLoading(false);
    }
  }, [modelsLoaded, modelsLoading]);

  // ── Start webcam ───────────────────────────────────────────────────────────
  const startWebcam = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise(r => { videoRef.current.onloadedmetadata = r; });
        videoRef.current.play();
      }
      setFaceStatus('scanning');
    } catch (err) {
      setFaceStatus('idle');
      throw new Error(`Webcam access failed: ${err.message}`);
    }
  }, []);

  // ── Stop webcam ────────────────────────────────────────────────────────────
  const stopWebcam = useCallback(() => {
    if (detectLoopRef.current) { clearInterval(detectLoopRef.current); detectLoopRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setFaceStatus('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => () => stopWebcam(), [stopWebcam]);

  // ── Detect single face from video ─────────────────────────────────────────
  const detectFaceFromVideo = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;
    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
      return det || null;
    } catch {
      return null;
    }
  }, []);

  // ── ENROLL FACE ───────────────────────────────────────────────────────────
  const enrollFace = useCallback(async () => {
    if (!modelsLoaded) throw new Error('Models not loaded');
    setFaceStatus('enrolling');
    setCaptureCount(0);

    const samples = [];
    const needed = ENROLL_SAMPLES;

    while (samples.length < needed) {
      const det = await detectFaceFromVideo();
      if (det) {
        samples.push(Array.from(det.descriptor));
        setCaptureCount(samples.length);
        console.log(`[FaceAuth] Sample ${samples.length}/${needed} captured`);
      }
      await new Promise(r => setTimeout(r, 350));
    }

    // Average descriptor
    const avg = new Array(128).fill(0);
    for (const d of samples) { for (let i = 0; i < 128; i++) avg[i] += d[i]; }
    for (let i = 0; i < 128; i++) avg[i] /= samples.length;

    // Save to server
    const res = await fetch(`${SERVER_URL}/api/auth/enroll-face`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ descriptor: avg }),
    });
    const data = await res.json();

    if (data.success) {
      storedDescriptorRef.current = avg;
      setFaceStatus('enrolled');
    } else {
      setFaceStatus('idle');
      throw new Error(data.error || 'Face enrollment failed');
    }

    return data;
  }, [modelsLoaded, detectFaceFromVideo]);

  // ── VERIFY FACE ───────────────────────────────────────────────────────────
  // storedDescArray — the descriptor fetched from server
  const verifyFace = useCallback(async (storedDescArray) => {
    if (!modelsLoaded) return { match: false, distance: 999, error: 'Models not loaded' };
    setFaceStatus('scanning');

    // Try up to 5 times to get a clear face detection
    let det = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      det = await detectFaceFromVideo();
      if (det) break;
      await new Promise(r => setTimeout(r, 400));
    }

    if (!det) {
      setFaceStatus('no-face');
      return { match: false, distance: 999, error: 'No face detected — ensure good lighting and face the camera.' };
    }

    // Compare using Euclidean distance
    const stored = new Float32Array(storedDescArray);
    const distance = faceapi.euclideanDistance(det.descriptor, stored);
    const match = distance < FACE_MATCH_THRESHOLD;

    setFaceDistance(distance);
    setFaceStatus(match ? 'match' : 'nomatch');
    console.log(`[FaceAuth] Distance: ${distance.toFixed(4)} → ${match ? 'MATCH' : 'NO MATCH'}`);

    return { match, distance: Number(distance.toFixed(4)) };
  }, [modelsLoaded, detectFaceFromVideo]);

  // ── Load stored face profile from server ──────────────────────────────────
  const loadFaceProfile = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/face-profile`);
      const data = await res.json();
      if (data.success && data.faceEnrolled) {
        storedDescriptorRef.current = data.descriptor;
        return data;
      }
      return { faceEnrolled: false };
    } catch {
      return { faceEnrolled: false };
    }
  }, []);

  return {
    modelsLoaded, modelsLoading, modelsError,
    faceStatus, faceDistance, captureCount,
    videoRef, storedDescriptorRef,
    loadModels, startWebcam, stopWebcam,
    enrollFace, verifyFace, loadFaceProfile,
    FACE_MATCH_THRESHOLD,
  };
};
