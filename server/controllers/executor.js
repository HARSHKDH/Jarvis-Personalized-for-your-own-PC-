const { spawn } = require('child_process');
const path = require('path');
const Command = require('../models/Command');

const EXECUTOR_PATH = path.join(__dirname, '../../python/executor.py');
const TIMEOUT_MS = 10000;

// Windows may have 'python', 'python3', or 'py' — try in order
const PYTHON_CANDIDATES = ['python', 'python3', 'py'];

/**
 * Try spawning a python process with fallback binary names.
 * Returns { child, pythonBin } or throws if none found.
 */
function spawnPython(args) {
  let lastError = null;
  for (const bin of PYTHON_CANDIDATES) {
    try {
      const child = spawn(bin, args, { windowsHide: false, shell: false });
      // If spawn didn't immediately throw, use this binary
      return { child, pythonBin: bin };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('No python interpreter found');
}

const executeOsCommand = async (action, target, details = {}, sessionId = '', rawCommand = '') => {
  const startTime = Date.now();

  const payload = JSON.stringify({ action, target, details });

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;

    try {
      ({ child } = spawnPython([EXECUTOR_PATH, payload]));
    } catch (spawnErr) {
      console.error('[Executor] Could not spawn Python:', spawnErr.message);
      resolve({
        success: false,
        message: `Python not found. Install Python and ensure it is in PATH. Error: ${spawnErr.message}`,
        executionTimeMs: Date.now() - startTime,
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      console.warn('[Executor] Command timed out after 10s');
    }, TIMEOUT_MS);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      if (stderr.trim()) console.warn('[Executor] Python stderr:', data.toString().trim());
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;

      let result = { success: false, message: 'Unknown error', output: '' };

      if (timedOut) {
        result = { success: false, message: 'Command timed out after 10 seconds', output: '' };
      } else {
        try {
          const jsonMatch = stdout.trim().match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            result = JSON.parse(jsonMatch[0]);
          } else if (code === 0) {
            result = { success: true, message: stdout.trim() || 'Command executed', output: stdout.trim() };
          } else {
            result = { success: false, message: stderr.trim() || `Exit code ${code}`, output: '' };
          }
        } catch (e) {
          result = {
            success: code === 0,
            message: stdout.trim() || stderr.trim() || 'Command completed',
            output: stdout.trim(),
          };
        }
      }

      // Log to Command collection
      try {
        await Command.create({
          sessionId,
          rawCommand,
          parsedAction: action,
          target,
          success: result.success,
          errorMessage: result.success ? null : result.message,
          executionTimeMs,
        });
      } catch (err) {
        console.warn('[Executor] Could not log command:', err.message);
      }

      resolve({ ...result, executionTimeMs });
    });

    child.on('error', async (err) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;
      console.error('[Executor] Spawn error:', err.message);

      try {
        await Command.create({
          sessionId,
          rawCommand,
          parsedAction: action,
          target,
          success: false,
          errorMessage: err.message,
          executionTimeMs,
        });
      } catch (e) {
        console.warn('[Executor] Could not log error:', e.message);
      }

      resolve({ success: false, message: `Failed to start executor: ${err.message}`, executionTimeMs });
    });
  });
};

module.exports = { executeOsCommand };

