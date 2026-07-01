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

router.post('/', async (req, res) => {
  const { audio, mimeType = 'audio/webm' } = req.body;

  if (!audio) {
    return res.status(400).json({ transcript: '', error: 'No audio provided' });
  }

  if (!API_KEY) {
    return res.status(503).json({ transcript: '', error: 'No GEMINI_API_KEY configured' });
  }

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: {
          data: audio,          // base64-encoded audio
          mimeType: mimeType,   // audio/webm, audio/wav, etc.
        },
      },
      // Prompt: just transcribe, nothing extra
      'Transcribe exactly what is said in this short audio clip. ' +
      'Return ONLY the raw spoken words in lowercase with no punctuation, ' +
      'no explanation, no quotes. If there is silence or nothing intelligible, return exactly: [silence]',
    ]);

    let transcript = (result.response.text() || '').toLowerCase().trim();

    // Ignore silence markers
    if (transcript === '[silence]' || transcript === 'silence') {
      transcript = '';
    }

    console.log('[Transcribe] →', transcript || '(empty)');
    return res.json({ transcript });

  } catch (err) {
    console.error('[Transcribe] Gemini error:', err.message);
    // Return empty transcript (not an error) — VAD will just not trigger
    return res.json({ transcript: '', error: err.message });
  }
});

module.exports = router;
