// ══════════════════════════════════════════════════════════════════════
// brain.js  — AI engine for J.A.R.V.I.S.
//
// ACTIVE:  Google Gemini  (GEMINI_API_KEY in server/.env)
// STANDBY: Anthropic Claude (swap back: see "HOW TO SWITCH" comment below)
//
// HOW TO SWITCH BACK TO ANTHROPIC:
//   1. npm install @anthropic-ai/sdk   (in server/)
//   2. Replace this file with the Anthropic version (brain.anthropic.js)
//   3. Set ANTHROPIC_API_KEY in server/.env
// ══════════════════════════════════════════════════════════════════════

const { GoogleGenerativeAI } = require('@google/generative-ai');
const Conversation = require('../models/Conversation');

// Node 18+ has native fetch; add node-fetch fallback for older versions
let fetchFn;
try {
  fetchFn = fetch; // native
} catch {
  fetchFn = require('node-fetch');
}

const API_KEY = process.env.GEMINI_API_KEY || '';
const NO_API_KEY_MODE = !API_KEY || API_KEY.trim() === '';

let genAI = null;
let model = null;

if (!NO_API_KEY_MODE) {
  genAI = new GoogleGenerativeAI(API_KEY);
  // gemini-2.5-flash: has active free-tier quota on this key (2.0-flash has limit:0)
  model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('[Brain] Gemini API connected (gemini-2.5-flash)');
} else {
  console.warn('[Brain] No GEMINI_API_KEY — running in offline mode. Add key to server/.env to enable AI responses.');
}

// ═══════════════════════════════════════════════════════════
// EXPERT SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════

const EXPERT_SYSTEMS = {
  jarvis: `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. You are the most advanced AI in existence, combining the wisdom of all domains with the precision of a master engineer. You always address the user as "sir" and speak with calm, authoritative confidence. You anticipate needs, provide proactive insights, and execute tasks with flawless precision.

Your personality: Dry wit, understated sarcasm, unwavering loyalty, calm under pressure, highly efficient communication. You occasionally reference Stark Industries or past interactions to feel personal.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|open_app|search_web|open_file|run_command|take_screenshot|send_whatsapp|open_youtube|play_spotify|send_email|create_file|delete_file|volume_control|system_action",
  "target": "specific target string if applicable, else empty string",
  "details": {},
  "speak": "Natural Jarvis voice response addressing user as sir. Conversational, 1-3 sentences max for voice.",
  "display": "Formatted markdown for HUD display. Can be longer with headers, bullets, code blocks.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|browser|file|system|search"
}

For OS actions, set the appropriate action type. For information queries, use action: "answer". Always search the web for current events, prices, scores, or anything time-sensitive. Make the "speak" field natural and concise — it will be read aloud. Make "display" comprehensive with markdown formatting.`,

  physicist: `You are Dr. Richard P. Feynman reincarnated as an AI — a Nobel Prize-winning theoretical physicist with unmatched ability to explain the universe. You combine deep mathematical rigor with the rare gift of making complex physics accessible through brilliant analogies, thought experiments, and enthusiastic storytelling. You work at Stark Advanced Physics Lab.

Your personality: Boundless intellectual curiosity, infectious enthusiasm, love for finding simple explanations to complex things, occasional drumming references, Feynman diagrams when helpful.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|open_file|run_command|take_screenshot|create_file",
  "target": "",
  "details": {},
  "speak": "Enthusiastic, analogy-rich physics explanation. Address user as 'my friend'. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with equations (LaTeX-style), diagrams described in text, references to experiments and papers.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

Always search web for cutting-edge physics news, recent papers, or current research when relevant. Explain everything from first principles. Use analogies like Feynman did — drums, locks, magnets.`,

  neurosurgeon: `You are Dr. Sarah Chen, Chief of Neurosurgery at Johns Hopkins Hospital and a world-renowned expert in neuroscience, brain surgery, neurological disorders, and cognitive science. You have 25 years of experience and have performed over 3,000 brain surgeries. You consult at Stark Medical Research Division.

Your personality: Clinical precision, deep empathy for patients, evidence-based, methodical thinking, always emphasizes proper medical consultation, uses precise medical terminology but explains it clearly.

IMPORTANT: Always include a disclaimer that you are an AI and users should consult a real physician for medical decisions.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|open_file|create_file",
  "target": "",
  "details": {},
  "speak": "Clinical yet compassionate explanation. Address user by 'patient' or name. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with medical terminology explained, treatment options, research citations, proper disclaimers.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

Always search web for latest medical research, clinical trials, and treatment guidelines. Always include AI disclaimer for medical advice.`,

  coach: `You are Coach Elite — an Olympic-level multi-sport performance coach who has trained 47 Olympic gold medalists across track & field, swimming, combat sports, team sports, and strength athletics. You combine sports science, psychology, biomechanics, and nutrition into a holistic performance system. You serve as Stark Industries' head performance advisor.

Your personality: Intense motivator, data-driven, no-nonsense but supportive, pushes people to their limits, celebrates small wins, uses sports metaphors.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|create_file",
  "target": "",
  "details": {},
  "speak": "Motivating, energetic coaching advice. Address user as 'athlete' or 'champion'. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with workout plans, nutrition tables, recovery protocols, performance metrics, scientific backing.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

Search web for latest sports science research, competition results, training innovations. Provide specific, actionable protocols.`,

  lawyer: `You are Counselor Arjun Sharma — a Senior Partner at the world's most prestigious law firm with 30 years of experience across corporate law, criminal defense, constitutional law, intellectual property, and civil rights. You are equally versed in both US Federal law and Indian legal system (IPC, CrPC, Indian Constitution, Companies Act). You serve as Stark Industries' Chief Legal Counsel.

Your personality: Sharp analytical mind, strategic thinking, speaks with authority, always considers multiple angles, cautious with definitive legal advice (always recommends consulting a licensed attorney for actual cases).

IMPORTANT: Always include disclaimer that this is general legal information, not legal advice. Recommend consulting a licensed attorney for actual legal matters.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|create_file",
  "target": "",
  "details": {},
  "speak": "Authoritative legal explanation with appropriate disclaimers. Address user as 'counselor' or by name. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with relevant statutes, case law references, legal analysis, jurisdiction notes, disclaimers.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

Search web for current legislation, recent court decisions, and legal precedents. Cover both Indian and international law when relevant.`,

  financial: `You are Wolf — a 30-year Wall Street veteran who has managed $50B+ in assets, survived the 2008 crash, predicted the 2020 crash, and built an unparalleled track record across equities, derivatives, crypto, real estate, and alternative investments. You now advise Stark Industries' investment division.

Your personality: Sharp, direct, numbers-focused, occasionally gruff, deep market intuition, not afraid to give strong opinions, uses Wall Street jargon naturally.

IMPORTANT: Always include disclaimer that this is financial education, not financial advice. Recommend consulting a licensed financial advisor for investment decisions.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|create_file",
  "target": "",
  "details": {},
  "speak": "Sharp, direct market insight. Address user as 'kid' or 'partner'. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with market data, analysis, risk assessment, disclaimers. Use tables for comparisons.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

ALWAYS search web for current market prices, recent news, and latest financial data. Markets move — never rely on training data for prices.`,

  developer: `You are Dev.AI — a Principal Engineer with 20 years of experience who has built systems at Google, Meta, Amazon, and led 3 successful tech startups. You are a master of MERN stack, system design, DSA, DevOps, AI/ML, and emerging technologies. You serve as Stark Industries' Chief Technology Architect.

Your personality: Precise, pragmatic, loves elegant solutions, obsessed with performance and scalability, mentors with patience, uses technical jargon naturally but explains when needed.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|open_file|run_command|create_file",
  "target": "",
  "details": {},
  "speak": "Technical explanation with engineering precision. Address user as 'dev' or 'engineer'. 1-3 sentences for voice.",
  "display": "Comprehensive markdown with code examples (properly fenced), architecture diagrams described in text, complexity analysis, best practices.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search|system"
}

Search web for latest framework versions, security vulnerabilities, and best practices. Always provide working code examples. Include time/space complexity for algorithms.`,

  historian: `You are Professor Historia — a world-renowned historian and storyteller with expertise spanning ancient civilizations, medieval kingdoms, modern nation-states, wars, revolutions, cultural movements, and the hidden forces that shaped humanity. You hold chairs at Oxford and Harvard. You advise Stark Industries on geopolitical risk.

Your personality: Captivating storyteller, loves connecting historical patterns to present events, passionate about overlooked histories, uses vivid narrative descriptions, draws parallels between eras.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|create_file",
  "target": "",
  "details": {},
  "speak": "Engaging historical narrative. Address user as 'student of history'. 1-3 sentences for voice.",
  "display": "Rich markdown narrative with timelines, key figures, cause-effect chains, parallels to modern times, fascinating lesser-known facts.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|search"
}

Search web for recent historical discoveries, updated scholarly interpretations, and current events with historical context. Make history come alive through storytelling.`,
};

// ═══════════════════════════════════════════════════════════
// REAL-TIME WEB SEARCH  (no API key needed — uses DuckDuckGo + fallbacks)
// ═══════════════════════════════════════════════════════════

// Keywords that indicate the query needs current/real-time information
const REALTIME_KEYWORDS = [
  'richest', 'wealthiest', 'billionaire', 'net worth',
  'current', 'latest', 'today', 'now', 'right now', 'currently',
  'recent', 'this week', 'this month', 'this year', '2024', '2025', '2026',
  'price', 'stock', 'crypto', 'bitcoin', 'dollar', 'rate', 'exchange',
  'score', 'match', 'news', 'happened', 'update',
  'president', 'prime minister', 'ceo', 'founder', 'leader',
  'weather', 'temperature', 'forecast',
  'who is the', 'what is the', 'how much is', 'what happened',
];

const needsRealTimeInfo = (text) => {
  const lower = text.toLowerCase();
  return REALTIME_KEYWORDS.some(kw => lower.includes(kw));
};

// Fetch real-time context from DuckDuckGo Instant Answer API
const fetchWebContext = async (query) => {
  try {
    const year = new Date().getFullYear();
    // Build a targeted search query (strip filler words, add current year)
    const cleanQuery = query
      .replace(/\b(jarvis|please|can you|tell me|what is|who is|i want to know|currently|right now)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim();
    const searchQuery = `${cleanQuery} ${year}`;
    const encoded = encodeURIComponent(searchQuery);
    const today = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

    let results = [];

    // 1. DuckDuckGo Instant Answer API (free, no key)
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetchFn(ddgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 JARVIS/5.0' },
        signal: AbortSignal.timeout(6000),
      });
      const data = await res.json();

      if (data.Answer) results.push(`Direct Answer: ${data.Answer}`);
      if (data.AbstractText) results.push(`Summary: ${data.AbstractText.slice(0, 500)}`);
      if (data.Definition) results.push(`Definition: ${data.Definition}`);
      if (data.Infobox?.content?.length) {
        data.Infobox.content.slice(0, 5).forEach(item => {
          if (item.label && item.value) results.push(`${item.label}: ${item.value}`);
        });
      }
      if (data.RelatedTopics?.length) {
        data.RelatedTopics.slice(0, 3).forEach(t => {
          if (t.Text) results.push(t.Text.slice(0, 200));
        });
      }
    } catch (e) { /* DDG failed, try next */ }

    // 2. Wikipedia API (good for factual current-state queries)
    try {
      const wikiRes = await fetchFn(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srlimit=3&format=json&utf8=1`,
        { signal: AbortSignal.timeout(5000) }
      );
      const wikiData = await wikiRes.json();
      const hits = wikiData?.query?.search || [];
      hits.forEach(h => {
        const snippet = h.snippet.replace(/<[^>]+>/g, '').slice(0, 250);
        results.push(`${h.title}: ${snippet}`);
      });
    } catch (e) { /* wiki failed */ }

    // 3. Wikipedia summary for the top result (get the intro paragraph)
    if (results.length > 0) {
      try {
        const firstTitle = results.find(r => r.includes(':'))?.split(':')[0].trim();
        if (firstTitle) {
          const summaryRes = await fetchFn(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstTitle)}`,
            { signal: AbortSignal.timeout(4000) }
          );
          if (summaryRes.ok) {
            const summaryData = await summaryRes.json();
            if (summaryData.extract) {
              results.unshift(`Wikipedia (${firstTitle}): ${summaryData.extract.slice(0, 500)}`);
            }
          }
        }
      } catch (e) { /* summary failed */ }
    }

    if (results.length > 0) {
      return `[REAL-TIME WEB DATA — fetched on ${today}]\nSearch query: "${searchQuery}"\n\n${results.join('\n\n')}`;
    }

    return null;
  } catch (err) {
    console.warn('[Brain] Web search failed:', err.message);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════
// PROCESS COMMAND
// ═══════════════════════════════════════════════════════════

const processCommand = async (userInput, sessionId, expertId = 'jarvis', onSearching = null) => {
  const systemPrompt = EXPERT_SYSTEMS[expertId] || EXPERT_SYSTEMS.jarvis;

  // ── OFFLINE MODE — no API key ────────────────────────────────────────────
  if (NO_API_KEY_MODE) {
    const lower = userInput.toLowerCase();

    // Pattern-match OS actions without AI
    let offlineResult = null;

    if (lower.includes('screenshot') || lower.includes('screen shot')) {
      offlineResult = { action: 'take_screenshot', target: '', speak: 'Taking a screenshot now, sir.', display: '📸 **Taking Screenshot**\n\nCapturing your current screen...', commandType: 'system' };
    } else if (lower.includes('open ')) {
      const appMatch = lower.match(/open\s+(.+)/);
      const app = appMatch ? appMatch[1].trim() : lower;
      offlineResult = { action: 'open_app', target: app, speak: `Opening ${app} for you, sir.`, display: `🚀 **Opening ${app}**`, commandType: 'system' };
    } else if (lower.includes('volume up') || lower.includes('increase volume')) {
      offlineResult = { action: 'volume_control', target: 'up', details: { steps: 5 }, speak: 'Increasing volume, sir.', display: '🔊 **Volume Up**', commandType: 'system' };
    } else if (lower.includes('volume down') || lower.includes('decrease volume')) {
      offlineResult = { action: 'volume_control', target: 'down', details: { steps: 5 }, speak: 'Decreasing volume, sir.', display: '🔉 **Volume Down**', commandType: 'system' };
    } else if (lower.includes('mute')) {
      offlineResult = { action: 'volume_control', target: 'mute', speak: 'Muting, sir.', display: '🔇 **Muted**', commandType: 'system' };
    } else if (lower.includes('search') || lower.includes('google')) {
      const q = userInput.replace(/search|google|for|the/gi, '').trim();
      offlineResult = { action: 'search_web', target: q || userInput, speak: `Searching Google for ${q || userInput}, sir.`, display: `🔍 **Web Search**\n\n${q || userInput}`, commandType: 'browser' };
    } else if (lower.includes('youtube')) {
      const q = userInput.replace(/youtube|play|search/gi, '').trim();
      offlineResult = { action: 'open_youtube', target: q, speak: `Opening YouTube, sir.`, display: `▶️ **YouTube**\n\n${q}`, commandType: 'browser' };
    } else if (lower.includes('shutdown') || lower.includes('shut down')) {
      offlineResult = { action: 'system_action', target: 'shutdown', speak: 'Initiating shutdown sequence, sir.', display: '⚡ **System Shutdown** — 30 second countdown initiated.', commandType: 'system' };
    } else if (lower.includes('lock')) {
      offlineResult = { action: 'system_action', target: 'lock', speak: 'Locking workstation, sir.', display: '🔒 **Workstation Locked**', commandType: 'system' };
    } else if (lower.includes('delete') || lower.includes('remove')) {
      const f = userInput.replace(/delete|remove|the|file/gi, '').trim();
      offlineResult = { action: 'delete_file', target: f, speak: `Preparing to delete ${f}, sir. Confirmation required.`, display: `🗑️ Delete: \`${f}\``, commandType: 'file' };
    } else if (lower.includes('create') || lower.includes('make') || lower.includes('new file')) {
      const f = userInput.replace(/create|make|new|file|a\s+/gi, '').trim();
      offlineResult = { action: 'create_file', target: f || 'new_file.txt', details: { content: '' }, speak: `Creating file ${f}, sir.`, display: `📄 **Creating File**\n\n\`${f}\``, commandType: 'file' };
    } else if (lower.includes('whatsapp') || lower.includes('send message') || lower.includes('send to')) {
      offlineResult = { action: 'send_whatsapp', target: userInput, speak: 'Opening WhatsApp to send your message, sir.', display: '💬 **WhatsApp Message**\n\nOpening WhatsApp Web...', commandType: 'browser' };
    }

    if (offlineResult) {
      const result = {
        action: offlineResult.action,
        target: offlineResult.target || '',
        details: offlineResult.details || {},
        speak: offlineResult.speak,
        display: offlineResult.display,
        steps: [],
        webSearchUsed: false,
        commandType: offlineResult.commandType || 'chat',
      };
      // Still save to DB
      try {
        await Conversation.create({ sessionId, role: 'user', message: userInput, expertId, commandType: result.commandType, webSearchUsed: false });
        await Conversation.create({ sessionId, role: 'jarvis', message: result.display, expertId, commandType: result.commandType, webSearchUsed: false });
      } catch (e) { /* ignore */ }
      return result;
    }

    // Default offline chat response
    const offlineChat = {
      action: 'answer',
      target: '',
      details: {},
      speak: `I'm running in offline mode, sir. To enable full AI capabilities, please add your Gemini API key to server/.env as GEMINI_API_KEY. I can still control your system — try saying "take a screenshot", "open Chrome", "volume up", or "search Google".`,
      display: `## 🔌 Offline Mode\n\nJ.A.R.V.I.S. is running without an AI brain, sir.\n\n**To enable full capabilities:**\n1. Get your key at [aistudio.google.com](https://aistudio.google.com)\n2. Add to \`server/.env\`:\n\`\`\`\nGEMINI_API_KEY=AIza...\n\`\`\`\n3. Restart the server\n\n**Available offline commands:**\n- 📸 Take a screenshot\n- 🚀 Open [app name]\n- 🔊 Volume up / down / mute\n- 🔍 Search Google for [query]\n- ▶️ YouTube [query]\n- 🗑️ Delete [file] *(with confirmation)*\n- 🔒 Lock workstation\n- 💬 Send WhatsApp to [contact]`,
      steps: [],
      webSearchUsed: false,
      commandType: 'chat',
    };
    try {
      await Conversation.create({ sessionId, role: 'user', message: userInput, expertId, commandType: 'chat', webSearchUsed: false });
      await Conversation.create({ sessionId, role: 'jarvis', message: offlineChat.display, expertId, commandType: 'chat', webSearchUsed: false });
    } catch (e) { /* ignore */ }
    return offlineChat;
  }
  // ── END OFFLINE MODE ─────────────────────────────────────────────────────

  // Fetch last 10 messages for context (keep token usage low)
  let historyParts = [];
  try {
    const pastMessages = await Conversation.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
    historyParts = pastMessages.reverse().map((msg) => ({
      role: msg.role === 'jarvis' ? 'model' : 'user',
      parts: [{ text: msg.message }],
    }));
  } catch (err) {
    console.warn('[Brain] Could not fetch history:', err.message);
  }

  let fullResponseText = '';
  let webContextUsed = false;

  // ── Fetch real-time web data if query needs current info ────────────────
  let webContext = null;
  if (needsRealTimeInfo(userInput)) {
    if (onSearching) onSearching();
    console.log('[Brain] Fetching real-time web data for:', userInput.slice(0, 60));
    webContext = await fetchWebContext(userInput);
    if (webContext) {
      webContextUsed = true;
      console.log('[Brain] Got web context, injecting into prompt');
    }
  }

  try {
    // Build the full contents array: system + history + web context + current message
    // Using generateContent directly avoids startChat compatibility issues

    // Build the user message — inject web context if we fetched it
    const userMessageText = webContext
      ? `${webContext}\n\nUser question: ${userInput}\n\nIMPORTANT: Use the real-time web data above to answer accurately. The data was just fetched right now, so it is current. Your training knowledge may be outdated — always prefer the web data for facts, prices, names, rankings, etc.`
      : userInput;

    const contents = [
      // Inject system prompt as first user turn + empty model ack
      { role: 'user',  parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready.' }] },
      // Conversation history
      ...historyParts,
      // Current user message (with web context injected if available)
      { role: 'user',  parts: [{ text: userMessageText }] },
    ];

    const result = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: 1024,   // keep low to save free-tier quota
        temperature: 0.75,
      },
    });

    fullResponseText = result.response.text();
    console.log('[Brain] Gemini responded OK');
  } catch (err) {
    console.error('[Brain] Gemini API error:', err.message.substring(0, 200));

    // ── Rate limit / quota ──────────────────────────────────────────────────
    if (err.message && (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED'))) {
      // Extract retryDelay from JSON field specifically, e.g. "retryDelay":"26s"
      const retryMatch = err.message.match(/"retryDelay"\s*:\s*"(\d+)s"/);
      const waitSec    = retryMatch ? parseInt(retryMatch[1]) : 60;

      // "limit: 0" on the PER-DAY quota = permanent zero project quota (needs new key)
      // "limit: 0" on the PER-MINUTE quota = temporary throttle (just wait 60s)
      const hasDailyZero = err.message.includes('PerDay') && err.message.includes('limit: 0');
      const hasPerMinuteZero = err.message.includes('PerMinute') && err.message.includes('limit: 0');

      // Only treat as permanent if the per-day quota is zero AND per-minute is also zero
      // (meaning the Google Cloud project itself has zero free-tier allocation)
      const isPermanentZero = hasDailyZero && hasPerMinuteZero;
      // Per-day exhaustion (used their daily limit, reset at midnight)
      const isDaily = hasDailyZero && !hasPerMinuteZero;

      let speak, display;
      if (isPermanentZero) {
        // This project has zero free-tier quota allocated — switch model or new key
        speak   = `Sir, the AI is temporarily rate-limited. Please wait ${waitSec} seconds then try again, or this project may need a quota increase.`;
        display = `## ⏳ Rate Limited — Wait ${waitSec}s\n\nThe Gemini free tier is momentarily throttled.\n\n**Wait ${waitSec} seconds then speak your command again.**\n\nIf this keeps happening:\n1. Try a different command in a minute\n2. Or get a fresh key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)`;
      } else if (isDaily) {
        speak   = 'The daily free-tier quota is exhausted, sir. Please wait until midnight Pacific Time or create a new API key.';
        display = `## 🔴 Daily Quota Exhausted\n\nThe **daily free-tier limit** for Gemini has been reached.\n\n**Options:**\n1. Wait until **midnight Pacific Time** for quota to reset\n2. Create a new key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)\n3. Upgrade your plan at [aistudio.google.com](https://aistudio.google.com)`;
      } else {
        speak   = `My neural cores are momentarily overloaded, sir. Please allow ${waitSec} seconds before the next request.`;
        display = `## ⏳ Rate Limit — Wait ${waitSec}s\n\nThe Gemini free tier allows **15 requests per minute**.\n\n**Wait ${waitSec} seconds then speak again.**`;
      }

      const rateLimitResponse = {
        action: 'answer', target: '', details: {},
        speak, display,
        steps: [], webSearchUsed: false, commandType: 'chat',
      };
      try {
        await Conversation.create({ sessionId, role: 'user', message: userInput, expertId, commandType: 'chat', webSearchUsed: false });
        await Conversation.create({ sessionId, role: 'jarvis', message: rateLimitResponse.display, expertId, commandType: 'chat', webSearchUsed: false });
      } catch (e) { /* ignore */ }
      return rateLimitResponse;
    }

    // ── Invalid API key ─────────────────────────────────────────────────────
    if (err.message && (err.message.includes('400') || err.message.includes('API_KEY_INVALID') || err.message.includes('invalid'))) {
      return {
        action: 'answer', target: '', details: {},
        speak: 'My API key appears to be invalid, sir. Please update GEMINI_API_KEY in the server .env file with a key from aistudio.google.com.',
        display: `## ❌ Invalid API Key\n\nThe \`GEMINI_API_KEY\` in \`server/.env\` is not valid.\n\n**Steps to fix:**\n1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)\n2. Create a new API key\n3. Replace the value in \`server/.env\`:\n\`\`\`\nGEMINI_API_KEY=AIzaSy...\n\`\`\`\n4. Restart the server`,
        steps: [], webSearchUsed: false, commandType: 'chat',
      };
    }

    throw err;
  }

  // Parse JSON response from Gemini
  let parsed = null;
  try {
    // Strip markdown code fences if Gemini wraps JSON in ```json ... ```
    const cleaned = fullResponseText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('[Brain] JSON parse failed, using fallback');
  }

  // Fallback if JSON parsing fails
  if (!parsed) {
    parsed = {
      action: 'answer',
      target: '',
      details: {},
      speak: fullResponseText.substring(0, 300) || 'I processed your request, sir.',
      display: fullResponseText || 'Processing complete.',
      steps: [],
      webSearchUsed: false,
      commandType: 'chat',
    };
  }

  parsed.webSearchUsed = webContextUsed;

  // Save conversation to MongoDB
  try {
    await Conversation.create({
      sessionId,
      role: 'user',
      message: userInput,
      expertId,
      commandType: parsed.commandType || 'chat',
      webSearchUsed: false,
    });

    await Conversation.create({
      sessionId,
      role: 'jarvis',
      message: parsed.display || parsed.speak,
      expertId,
      commandType: parsed.commandType || 'chat',
      webSearchUsed: parsed.webSearchUsed,
    });
  } catch (err) {
    console.warn('[Brain] Could not save to MongoDB:', err.message);
  }

  return parsed;
};

module.exports = { processCommand, EXPERT_SYSTEMS };
