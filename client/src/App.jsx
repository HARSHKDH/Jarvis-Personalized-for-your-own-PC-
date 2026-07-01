import React, { useState, useCallback } from 'react';
import { JarvisProvider } from './context/JarvisContext';
import { useJarvisContext } from './context/JarvisContext';
import BootSequence from './components/BootSequence';
import HUD from './components/HUD';
import VoiceAuth from './components/VoiceAuth';
import EnrollmentFlow from './components/EnrollmentFlow';
import MiniHUD, { DeleteConfirmModal } from './components/MiniHUD';
import { useVoiceAuth } from './hooks/useVoiceAuth';
import { useWakeWord } from './hooks/useWakeWord';

// ── Bridge: reads deleteConfirmData from JarvisContext, shows modal ────────────
const DeleteConfirmBridge = () => {
  const { deleteConfirmData, confirmDelete, cancelDelete } = useJarvisContext();
  return (
    <DeleteConfirmModal
      data={deleteConfirmData}
      onConfirm={confirmDelete}
      onCancel={cancelDelete}
    />
  );
};

// ── Authenticated app: boot sequence → full HUD ────────────────────────────────
const AuthenticatedApp = () => {
  const [booted, setBooted] = useState(false);
  const handleBootComplete = useCallback(() => setBooted(true), []);

  return (
    <>
      {!booted && <BootSequence onBootComplete={handleBootComplete} />}
      {booted && (
        <JarvisProvider>
          <HUD />
          <DeleteConfirmBridge />
        </JarvisProvider>
      )}
    </>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
const App = () => {
  const {
    authStatus, isRecording, score, attemptsLeft, lockTimeRemaining,
    displayName, errorMessage, enrollmentStep, enrollmentStatus,
    setEnrollmentStep, setAuthStatus,
    recordAndVerify, enrollSample, finalizeEnrollment,
    resetLock, resetProfile,
  } = useVoiceAuth();

  // Wake word only active on the auth screen
  const handleWakeWord = useCallback(() => {
    if (authStatus === 'authenticating') recordAndVerify();
  }, [authStatus, recordAndVerify]);

  const wakeWordEnabled = authStatus === 'authenticating';
  const { isListening } = useWakeWord(handleWakeWord, wakeWordEnabled);

  // Face auth success callback (used by FaceVerifyWidget inside VoiceAuth)
  const handleFaceAuthenticated = useCallback(() => {
    setAuthStatus('authenticated');
  }, [setAuthStatus]);

  // ── ENROLLING ─────────────────────────────────────────────────────────────
  if (authStatus === 'enrolling') {
    return (
      <EnrollmentFlow
        enrollmentStep={enrollmentStep}
        enrollmentStatus={enrollmentStatus}
        setEnrollmentStep={setEnrollmentStep}
        onStartEnrollment={() => setEnrollmentStep(1)}
        onTriggerEnroll={() => {}}
        enrollSample={enrollSample}
        finalizeEnrollment={finalizeEnrollment}
      />
    );
  }

  // ── NOT YET AUTHENTICATED ─────────────────────────────────────────────────
  // VoiceAuth auto-scans face (autoStartFace=true). If face matches → calls
  // onFaceAuthenticated and skips the voice step entirely.
  if (authStatus !== 'authenticated') {
    return (
      <VoiceAuth
        authStatus={authStatus}
        isRecording={isRecording}
        score={score}
        attemptsLeft={attemptsLeft}
        lockTimeRemaining={lockTimeRemaining}
        displayName={displayName}
        errorMessage={errorMessage}
        isWakeWordListening={isListening}
        onRecordAndVerify={recordAndVerify}
        onFaceAuthenticated={handleFaceAuthenticated}
        onResetLock={resetLock}
        onResetProfile={resetProfile}
        autoStartFace={true}
      />
    );
  }

  // ── AUTHENTICATED ─────────────────────────────────────────────────────────
  return <AuthenticatedApp />;
};

export default App;
