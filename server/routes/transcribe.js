/**
 * POST /api/transcribe
 * Body: { audio: "<base64 string>", mimeType: "audio/webm" }
 * Returns: { transcript: string }
 *
 * Used by the Electron assistant for wake word detection.
 * Sends audio to Gemini for transcription since the Web Speech API
 * is not available in Electron without Google's internal API key.
 */
const router = require('express').Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY || '';

const TRANSCRIBE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

router.post('/', async (req, res) => {
  const { audio, mimeType = 'audio/webm' } = req.body;

  if (!audio) {
    return res.status(400).json({ transcript: '', error: 'No audio provided' });
  }

  if (!API_KEY) {
    return res.status(503).json({ transcript: '', error: 'No GEMINI_API_KEY configured' });
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  let lastErr;

  for (const modelName of TRANSCRIBE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          inlineData: {
            data: audio,
            mimeType: mimeType,
          },
        },
        'Transcribe exactly what is said in this short audio clip. ' +
        'Return ONLY the raw spoken words in lowercase with no punctuation, ' +
        'no explanation, no quotes. If there is silence or nothing intelligible, return exactly: [silence]',
      ]);

      let transcript = (result.response.text() || '').toLowerCase().trim();
      if (transcript === '[silence]' || transcript === 'silence') transcript = '';

      console.log('[Transcribe] →', transcript || '(empty)', modelName !== TRANSCRIBE_MODELS[0] ? `(fallback: ${modelName})` : '');
      return res.json({ transcript });

    } catch (err) {
      // Only retry on 503/overloaded — bail immediately for auth/400 errors
      if (err.message && (err.message.includes('503') || err.message.includes('overloaded') || err.message.includes('Service Unavailable'))) {
        console.warn(`[Transcribe] ${modelName} overloaded — trying next model...`);
        lastErr = err;
        continue;
      }
      // Non-retryable error
      console.error('[Transcribe] Gemini error:', err.message);
      return res.status(500).json({ transcript: '', error: err.message });
    }
  }

  console.error('[Transcribe] All models failed:', lastErr?.message);
  return res.status(503).json({ transcript: '', error: 'All transcription models overloaded' });
});

module.exports = router;
