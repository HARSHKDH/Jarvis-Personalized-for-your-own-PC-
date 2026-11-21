import React, { useState, useCallback, useRef } from 'react';
import { JarvisProvider } from './context/JarvisContext';
import { useJarvisContext } from './context/JarvisContext';
import BootSequence from './components/BootSequence';
import HUD from './components/HUD';
import VoiceAuth from './components/VoiceAuth';
import EnrollmentFlow from './components/EnrollmentFlow';
import SilentBootScreen from './components/SilentBootScreen';
import MiniHUD, { DeleteConfirmModal, ActionConfirmModal } from './components/MiniHUD';
import ThemeToggle from './components/ThemeToggle';
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

// ── Bridge: reads actionConfirmData (power actions), shows confirm modal ───────
const ActionConfirmBridge = () => {
  const { actionConfirmData, confirmAction, cancelAction } = useJarvisContext();
  return (
    <ActionConfirmModal
      data={actionConfirmData}
      onConfirm={confirmAction}
      onCancel={cancelAction}
    />
  );
};

// ── Authenticated app: boot sequence → full HUD ────────────────────────────────
const AuthenticatedApp = ({ skipBoot = false }) => {
  const [booted, setBooted] = useState(skipBoot);
  const handleBootComplete = useCallback(() => setBooted(true), []);

  return (
    <>
      {!booted && (
        <>
          <BootSequence onBootComplete={handleBootComplete} />
          {/* StatusBar (which hosts the inline toggle) isn't mounted yet */}
          <ThemeToggle variant="floating" />
        </>
      )}
      {booted && (
        <JarvisProvider>
          <HUD />
          <DeleteConfirmBridge />
          <ActionConfirmBridge />
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

  // Track if silent face auth already ran + whether it succeeded silently
  const silentAuthDoneRef = useRef(false);
  const [silentAuthWasSuccess, setSilentAuthWasSuccess] = useState(false);

  // Wake word only active on the auth screen
  const handleWakeWord = useCallback(() => {
    if (authStatus === 'authenticating') recordAndVerify();
  }, [authStatus, recordAndVerify]);

  const wakeWordEnabled = authStatus === 'authenticating';
  const { isListening } = useWakeWord(handleWakeWord, wakeWordEnabled);

  // ── Silent face auth success (from SilentBootScreen) ──────────────────────
  const handleSilentFaceSuccess = useCallback(() => {
    silentAuthDoneRef.current = true;
    setSilentAuthWasSuccess(true);
    setAuthStatus('authenticated');
  }, [setAuthStatus]);

  // ── Silent face auth failure — fall through to voice auth screen ──────────
  const handleSilentFaceFailed = useCallback(() => {
    silentAuthDoneRef.current = true;
    // Stay on 'checking'→'authenticating' path — VoiceAuth will render
    setAuthStatus('authenticating');
  }, [setAuthStatus]);

  // ── Face auth success callback (used by FaceVerifyWidget inside VoiceAuth) ──
  const handleFaceAuthenticated = useCallback(() => {
    setAuthStatus('authenticated');
  }, [setAuthStatus]);

  // ─────────────────────────────────────────────────────────────────────────
  // CHECKING — first-load: run silent face auth in the background
  // Show the SilentBootScreen while face recognition runs. This covers the
  // window between app start and checkEnrollmentStatus completing.
  // ─────────────────────────────────────────────────────────────────────────
  if (authStatus === 'checking') {
    const cachedEnrolled = localStorage.getItem('jarvis_enrolled') === 'true';

    if (cachedEnrolled && !silentAuthDoneRef.current) {
      // User is enrolled → run face auth silently during boot animation
      return (
        <>
          <SilentBootScreen
            onAuthenticated={handleSilentFaceSuccess}
            onFailed={handleSilentFaceFailed}
            enabled={true}
          />
          <ThemeToggle variant="floating" />
        </>
      );
    }

    // Not enrolled yet (first time) or silent auth already ran — show a
    // minimal loading state while useVoiceAuth determines the next step.
    return (
      <div style={{
        position: 'fixed', inset: 0,
        background: 'radial-gradient(ellipse at 50% 40%, rgba(var(--surface-2-rgb),1) 0%, rgba(var(--surface-0-rgb),1) 60%, var(--bg-deep) 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: '"Courier New", monospace',
          color: 'rgba(var(--cyan-rgb),0.5)',
          fontSize: '12px',
          letterSpacing: '0.2em',
          animation: 'fadeInOut 1.5s ease-in-out infinite',
        }}>
          INITIALIZING...
        </div>
        <ThemeToggle variant="floating" />
        <style>{`@keyframes fadeInOut { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </div>
    );
  }

  // ── ENROLLING ─────────────────────────────────────────────────────────────
  if (authStatus === 'enrolling') {
    return (
      <>
        <EnrollmentFlow
          enrollmentStep={enrollmentStep}
          enrollmentStatus={enrollmentStatus}
          setEnrollmentStep={setEnrollmentStep}
          onStartEnrollment={() => setEnrollmentStep(1)}
          onTriggerEnroll={() => {}}
          enrollSample={enrollSample}
          finalizeEnrollment={finalizeEnrollment}
        />
        <ThemeToggle variant="floating" />
      </>
    );
  }

  // ── NOT YET AUTHENTICATED ─────────────────────────────────────────────────
  // VoiceAuth auto-scans face (autoStartFace=true). If face matches → calls
  // onFaceAuthenticated and skips the voice step entirely.
  if (authStatus !== 'authenticated') {
    return (
      <>
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
        <ThemeToggle variant="floating" />
      </>
    );
  }

  // ── AUTHENTICATED ─────────────────────────────────────────────────────────
  // Skip the second boot animation if user was authenticated silently
  // (SilentBootScreen already played a boot animation during face auth)
  return <AuthenticatedApp skipBoot={silentAuthWasSuccess} />;
};

export default App;
