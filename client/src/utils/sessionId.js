/**
 * sessionId.js
 * Generate and persist a unique session ID in localStorage
 */
import { v4 as uuidv4 } from 'uuid';

const SESSION_KEY = 'jarvis_session_id';

export const getSessionId = () => {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
};

export const resetSessionId = () => {
  const id = uuidv4();
  localStorage.setItem(SESSION_KEY, id);
  return id;
};
