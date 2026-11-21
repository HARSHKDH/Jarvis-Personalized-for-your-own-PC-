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
let primaryModel = null;

// Fallback model chain — tried in order if the primary returns 503
const MODEL_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',    // newer than 1.5 — try it first
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

if (!NO_API_KEY_MODE) {
  genAI = new GoogleGenerativeAI(API_KEY);
  primaryModel = genAI.getGenerativeModel({ model: MODEL_CHAIN[0] });
  console.log('[Brain] Gemini API connected — primary model:', MODEL_CHAIN[0]);
} else {
  console.warn('[Brain] No GEMINI_API_KEY — running in offline mode. Add key to server/.env to enable AI responses.');
}

// Wrapper that tries all models in the chain before giving up
async function generateWithFallback(contents, generationConfig) {
  let lastError;
  for (const modelName of MODEL_CHAIN) {
    try {
      const m = genAI.getGenerativeModel({ model: modelName });
      const result = await m.generateContent({ contents, generationConfig });
      if (modelName !== MODEL_CHAIN[0]) {
        console.log(`[Brain] Used fallback model: ${modelName}`);
      }
      return result;
    } catch (err) {
      // Only retry on 503 (overloaded) — propagate all other errors immediately
      if (err.message && (err.message.includes('503') || err.message.includes('Service Unavailable') || err.message.includes('overloaded'))) {
        console.warn(`[Brain] ${modelName} returned 503 — trying next model...`);
        lastError = err;
        continue;
      }
      throw err; // 429, 400, auth errors etc — don't retry
    }
  }
  throw lastError; // all models failed
}

// ═══════════════════════════════════════════════════════════
// EXPERT SYSTEM PROMPTS
// ═══════════════════════════════════════════════════════════

const EXPERT_SYSTEMS = {
  jarvis: `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI assistant. You are the most advanced AI in existence, combining the wisdom of all domains with the precision of a master engineer. You always address the user as "sir" and speak with calm, authoritative confidence. You anticipate needs, provide proactive insights, and execute tasks with flawless precision.

Your personality: Dry wit, understated sarcasm, unwavering loyalty, calm under pressure, highly efficient communication. You occasionally reference Stark Industries or past interactions to feel personal.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|open_app|close_app|running_apps|add_app|web_search|open_website|browser_action|current_url|volume_up|volume_down|set_volume|mute|unmute|toggle_mute|get_volume|whatsapp_message|whatsapp_file|add_contact|lock_screen|sleep|shutdown|shutdown_confirm|cancel_shutdown|restart|restart_confirm|logoff_confirm|logoff|get_battery|get_ram|get_cpu|get_disk|get_ip|get_system_info|brightness_up|brightness_down|set_brightness|read_clipboard|copy_text|simulate_copy|simulate_paste|simulate_cut|select_all|undo|redo|clipboard_history|paste_history|clear_clipboard|clear_history|get_time|get_date|add_reminder|list_reminders|cancel_reminder|jarvis_help|jarvis_status|stop_listening|start_listening|sleep_mode|wake_mode|what_did_i_say|repeat_response|do_again|confirm|cancel|search_web|open_file|open_folder|run_command|take_screenshot|send_whatsapp|open_youtube|play_spotify|send_email|create_file|delete_file|volume_control|system_action|record_start|record_stop|analyze_screen",
  "target": "specific target string if applicable, else empty string",
  "details": {},
  "speak": "Natural Jarvis voice response addressing user as sir. Conversational, 1-3 sentences max for voice.",
  "display": "Formatted markdown for HUD display. Can be longer with headers, bullets, code blocks.",
  "steps": [],
  "webSearchUsed": false,
  "commandType": "chat|browser|file|system|search"
}

For OS actions, set the appropriate action type. For information queries, use action: "answer". Always search the web for current events, prices, scores, or anything time-sensitive. Make the "speak" field natural and concise — it will be read aloud. Make "display" comprehensive with markdown formatting.

SCREEN RECORDING INTENTS:
- If the user says anything like "start recording", "record my screen", "begin recording", "start screen recording", "record this", "capture my screen" → action must be: record_start
- If the user says anything like "stop recording", "end recording", "save recording", "stop screen recording", "finish recording", "done recording" → action must be: record_stop

SCREEN ANALYSIS INTENTS:
- If user says "analyze this screen", "analyze the screen", "what's on my screen", "what is on the screen", "what is written on the screen", "read my screen", "describe my screen", "what do you see on screen", "tell me what's on my screen", "screen analysis", "what's on screen", "explain what's on screen", "summarize the screen", "what is written", "what does the screen say" → action: analyze_screen, target: "", details: {}
- IMPORTANT: analyze_screen takes a screenshot with Gemini Vision and describes what is visible. Set speak to something like "Analyzing your screen now, sir." as the pre-execution message.

OPEN FILE/FOLDER INTENTS:
- If user says "open file ...", "open my ... file", "find and open ...", or names a file like "resume.pdf" → action: open_file, and include details.filename with the requested filename.
- If user says "open folder ...", "open my ... folder", "open ... directory", "show me ... folder", or asks for downloads/documents/desktop/music/pictures/videos → action: open_folder, and include details.foldername with the requested folder name.
- For these actions, set speak clearly like "Opening resume.pdf" or "Opening Downloads folder".

SYSTEM / VIRTUAL FOLDER INTENTS (also action: open_folder):
- Windows system locations are opened with the SAME open_folder action. Put the location name in details.foldername verbatim — do NOT try to guess a drive path, and do NOT use open_app for these.
- "this pc", "my pc", "my computer", "file explorer" → action: open_folder, details.foldername = "this pc"
- "recycle bin", "trash", "dustbin", "deleted files" → action: open_folder, details.foldername = "recycle bin"
- "control panel" → details.foldername = "control panel"
- "settings", "windows settings" → details.foldername = "settings"
- "network", "network connections" → details.foldername = "network"
- "installed programs", "add or remove programs", "programs and features", "uninstall a program" → details.foldername = "installed programs"
- "all apps", "installed apps" → details.foldername = "all apps"
- "printers" / "fonts" / "startup folder" / "temp folder" → details.foldername = that name
- "windows folder", "system32", "program files", "program files x86" → details.foldername = that name
- "my user folder", "home folder", "public folder", "roaming", "local appdata", "recent files" → details.foldername = that name
- "C drive", "D drive", "open the E drive" → action: open_folder, details.foldername = "c drive" / "d drive" / "e drive"
- Keep speak short and natural: "Opening This PC", "Opening the Recycle Bin, sir.", "Opening Control Panel".

APP CONTROL INTENTS:
- If user says "open [app]", "launch [app]", "start [app]", or "run [app]" → action: open_app, details.appname
- If user says "close [app]", "quit [app]", "exit [app]", "kill [app]" → action: close_app, details.appname
- IMPORTANT: For "close YouTube" or "close Chrome" → action: close_app, details.appname = "chrome" (YouTube runs in Chrome, closing Chrome closes it)
- IMPORTANT: For "open YouTube", "open Netflix", "open Instagram", "open Gmail" and similar web-only services that are NOT desktop apps → action: open_app, details.appname = "[service name]". The system will automatically open them in Chrome if not installed locally.
- If user says "what apps are open", "which apps are running", "show running apps" → action: running_apps
- If user says "add app [name] at [path]" → action: add_app, details.appname and details.path

BROWSER CONTROL INTENTS:
- If user says "search [query] on google/youtube/bing/github", "google [query]", "look up [query]", "find [query] online", "search for [query]" → action: web_search, details.query and details.engine (default google)
- If user says "open youtube/github/instagram", "go to [website]", "open [website].com", "take me to [website]" → action: open_website, details.site
- If user says "open new tab" or "new tab" → action: browser_action, details.action = "new_tab"
- If user says "go back" or "previous page" → action: browser_action, details.action = "go_back"
- If user says "refresh" or "reload page" → action: browser_action, details.action = "refresh"
- If user says "zoom in" → action: browser_action, details.action = "zoom_in"
- If user says "zoom out" → action: browser_action, details.action = "zoom_out"
- If user says "close browser" or "close chrome" → action: browser_action, details.action = "close_browser"
- If user says "what page am I on", "current url", or "what site is this" → action: current_url

VOLUME CONTROL INTENTS:
- If user says "volume up", "increase volume", "louder" → action: volume_up, details.step = 10
- If user says "volume up by [number]" or "increase by [number]" → action: volume_up, details.step = [number]
- If user says "volume down", "decrease volume", "quieter", "lower" → action: volume_down, details.step = 10
- If user says "volume down by [number]" or "decrease by [number]" → action: volume_down, details.step = [number]
- If user says "set volume to [number]" or "volume [number]" → action: set_volume, details.level = [number]
- If user says "maximum volume" or "full volume" → action: set_volume, details.level = 100
- If user says "minimum volume" or "very low volume" → action: set_volume, details.level = 0
- If user says "mute" or "silence" or "quiet" → action: mute
- If user says "unmute", "sound on", "turn sound on" → action: unmute
- If user says "toggle mute" → action: toggle_mute
- If user says "what is the volume", "current volume", "volume level" → action: get_volume

WHATSAPP CONTROL INTENTS:
- If user says "send message to [contact]: [message]", "whatsapp [contact] that [message]", "message [contact] [message]", "text [contact] [message]" → action: whatsapp_message, details.contact = [contact name], details.message = [message text]
- If user says "send [filename] to [contact] on whatsapp", "whatsapp [filename] to [contact]", "send my [file] to [contact]", "share [filename] with [contact] on whatsapp" → action: whatsapp_file, details.contact = [contact name], details.filename = [filename], details.caption = [any caption mentioned, else empty]
- If user says "send last screenshot to [contact]", "whatsapp my screenshot to [contact]" → action: whatsapp_file, details.contact = [contact], details.filename = "latest_screenshot", details.caption = ""
- If user says "add contact [name] [number]", "save [name] as [number] in jarvis" → action: add_contact, details.name = [name], details.phone = [number]
- For these actions keep speak short like "Sending message to Rahul" or "Rahul added to your contacts".

SYSTEM POWER CONTROL INTENTS:
- If user says "lock screen", "lock my pc", "lock" → action: lock_screen (executes immediately, no confirmation)
- If user says "sleep", "sleep mode", "go to sleep" → action: sleep (executes immediately, no confirmation)
- If user says "shutdown", "turn off", "power off" (with NO time) → action: shutdown_confirm, details.minutes = 0 (this ASKS for confirmation first)
- If user says "shutdown in [X] minutes" → action: shutdown, details.minutes = X (scheduled, no confirm needed)
- If user says "cancel shutdown", "abort shutdown" → action: cancel_shutdown
- If user says "restart", "reboot" (with NO time) → action: restart_confirm, details.minutes = 0 (ASKS for confirmation first)
- If user says "restart in [X] minutes" → action: restart, details.minutes = X (scheduled)
- If user says "log off", "sign out" → action: logoff_confirm (ASKS for confirmation first)

SYSTEM INFO INTENTS:
- If user says "battery", "battery status", "battery level", "what's my battery" → action: get_battery
- If user says "ram", "memory", "how much ram", "free ram" → action: get_ram
- If user says "cpu", "processor", "cpu usage" → action: get_cpu
- If user says "disk space", "storage", "how much space", "disk" → action: get_disk
- If user says "ip address", "my ip", "what is my ip" → action: get_ip
- If user says "system info", "all info", "system status" → action: get_system_info

BRIGHTNESS INTENTS:
- If user says "brightness up", "increase brightness", "brighter" → action: brightness_up, details.step = 10
- If user says "brightness down", "decrease brightness", "dimmer" → action: brightness_down, details.step = 10
- If user says "set brightness to [number]" → action: set_brightness, details.level = [number]

CLIPBOARD INTENTS:
- If user says "what's on my clipboard", "read clipboard", "what did i copy", "clipboard content" → action: read_clipboard
- If user says "copy that", "ctrl c", "copy this" → action: simulate_copy
- If user says "paste that", "ctrl v", "paste this", "paste it" → action: simulate_paste
- If user says "cut that", "ctrl x" → action: simulate_cut
- If user says "select all", "ctrl a" → action: select_all
- If user says "undo", "ctrl z", "undo that" → action: undo
- If user says "redo", "ctrl y", "redo that" → action: redo
- If user says "copy this to clipboard: [text]", "copy this text: [text]" → action: copy_text, details.text = "[extracted text]"
- If user says "show clipboard history", "clipboard history" → action: clipboard_history
- If user says "paste number [N]", "paste item [N]" → action: paste_history, details.index = N
- If user says "clear clipboard" → action: clear_clipboard
- If user says "clear clipboard history" → action: clear_history

DATE & TIME INTENTS:
- If user says "what time is it", "current time", "tell me the time" → action: get_time
- If user says "what is today's date", "what's the date", "what day is it", "what day is today" → action: get_date

REMINDER INTENTS:
- If user says "remind me to [task] at [time]", "set a reminder for [task] at [time]", "reminder to [task] at [time]" → action: add_reminder, details.text = "[task]", details.time = "[time like 5 PM or 3:30 PM]"
- If user says "what are my reminders", "show my reminders", "list reminders", "my reminders" → action: list_reminders
- If user says "cancel my [time] reminder", "cancel reminder at [time]", "remove [time] reminder" → action: cancel_reminder, details.time = "[time]"

JARVIS SELF-COMMAND INTENTS:
- If user says "what can you do", "what are your features", "list your abilities", "help", "show help" → action: jarvis_help
- If user says "jarvis status", "system health", "are you online", "status report" → action: jarvis_status
- If user says "stop listening", "pause listening", "mute yourself" → action: stop_listening
- If user says "start listening", "resume listening", "wake up" → action: start_listening
- If user says "goodbye jarvis", "go to sleep", "sleep mode", "goodnight jarvis" → action: sleep_mode
- If user says "hello jarvis", "hey jarvis", "wake up jarvis", "i'm back" (as a greeting to re-activate) → action: wake_mode

CONTEXT / MEMORY INTENTS:
- If user says "what did i just say", "what did i say", "repeat my command" → action: what_did_i_say
- If user says "repeat that", "say that again", "what did you say" → action: repeat_response
- If user says "do that again", "again", "one more time" → action: do_again

CONFIRMATION INTENTS (only when a confirmation is pending):
- If user says "yes", "yes jarvis", "confirm", "do it", "sure", "go ahead" → action: confirm
- If user says "no", "cancel", "abort", "stop", "don't" → action: cancel`,

  physicist: `You are Dr. Richard P. Feynman reincarnated as an AI — a Nobel Prize-winning theoretical physicist with unmatched ability to explain the universe. You combine deep mathematical rigor with the rare gift of making complex physics accessible through brilliant analogies, thought experiments, and enthusiastic storytelling. You work at Stark Advanced Physics Lab.

Your personality: Boundless intellectual curiosity, infectious enthusiasm, love for finding simple explanations to complex things, occasional drumming references, Feynman diagrams when helpful.

You respond ONLY with valid JSON in this exact format:
{
  "action": "answer|search_web|open_app|open_file|open_folder|run_command|take_screenshot|create_file",
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
  "action": "answer|search_web|open_app|open_file|open_folder|create_file",
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
  "action": "answer|search_web|open_app|open_file|open_folder|run_command|create_file",
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
// SYSTEM / VIRTUAL FOLDERS
// ═══════════════════════════════════════════════════════════
// Spoken name → canonical foldername understood by the Python server's
// /open-folder endpoint (see _SHELL_FOLDERS in python/jarvis_server.py).
// Used by the offline keyword fallback so these work without an API key.
// Ordered longest-phrase-first so "add or remove programs" wins over "programs".
const SYSTEM_FOLDER_PHRASES = [
  ['add or remove programs', 'installed programs'],
  ['programs and features', 'installed programs'],
  ['uninstall a program', 'installed programs'],
  ['uninstall programs', 'installed programs'],
  ['installed programs', 'installed programs'],
  ['network connections', 'network connections'],
  ['program files x86', 'program files x86'],
  ['program files (x86)', 'program files x86'],
  ['program files', 'program files'],
  ['windows settings', 'settings'],
  ['control panel', 'control panel'],
  ['file explorer', 'file explorer'],
  ['recycle bin', 'recycle bin'],
  ['deleted files', 'deleted files'],
  ['local appdata', 'local appdata'],
  ['startup folder', 'startup'],
  ['windows folder', 'windows'],
  ['recent files', 'recent files'],
  ['installed apps', 'all apps'],
  ['temp folder', 'temp'],
  ['my computer', 'this pc'],
  ['this pc', 'this pc'],
  ['my pc', 'this pc'],
  ['all apps', 'all apps'],
  ['system32', 'system32'],
  ['dustbin', 'recycle bin'],
  ['printers', 'printers'],
  ['roaming', 'roaming'],
  ['network', 'network'],
  ['trash', 'recycle bin'],
  ['fonts', 'fonts'],
];

/**
 * Detect a Windows system/virtual folder in free text.
 * Returns the canonical foldername, or null when the text names none.
 */
const matchSystemFolder = (lower) => {
  for (const [phrase, canonical] of SYSTEM_FOLDER_PHRASES) {
    if (lower.includes(phrase)) return canonical;
  }
  // "C drive", "the D drive", "drive E"
  const drive = lower.match(/\b(?:drive\s+([a-z])|([a-z])\s+drive)\b/);
  if (drive) return `${(drive[1] || drive[2]).toLowerCase()} drive`;
  return null;
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
    } else if (lower.includes('start record') || lower.includes('record my screen') || lower.includes('begin record') || lower.includes('record this') || lower.includes('screen record')) {
      offlineResult = { action: 'record_start', target: '', speak: 'Starting screen recording now, sir.', display: '🔴 **Screen Recording Started**\n\nRecording your screen in the background...', commandType: 'system' };
    } else if (lower.includes('stop record') || lower.includes('end record') || lower.includes('save record') || lower.includes('finish record')) {
      offlineResult = { action: 'record_stop', target: '', speak: 'Stopping and saving the recording, sir.', display: '⏹ **Recording Stopped**\n\nSaving to JARVIS/Recordings/...', commandType: 'system' };
    } else if (lower.includes('what page am i on') || lower.includes('current url') || lower.includes('what site is this')) {
      offlineResult = { action: 'current_url', target: '', details: {}, speak: 'Checking the current page URL, sir.', display: '📋 **Checking current URL...**', commandType: 'browser' };
    } else if (lower.includes('open new tab') || lower === 'new tab') {
      offlineResult = { action: 'browser_action', target: 'new_tab', details: { action: 'new_tab' }, speak: 'New tab opened', display: '🗂 **Opening new tab**', commandType: 'browser' };
    } else if (lower.includes('go back') || lower.includes('previous page')) {
      offlineResult = { action: 'browser_action', target: 'go_back', details: { action: 'go_back' }, speak: 'Going back', display: '↩️ **Going back**', commandType: 'browser' };
    } else if (lower.includes('refresh') || lower.includes('reload page')) {
      offlineResult = { action: 'browser_action', target: 'refresh', details: { action: 'refresh' }, speak: 'Page refreshed', display: '🔄 **Refreshing page**', commandType: 'browser' };
    } else if (lower.includes('zoom in')) {
      offlineResult = { action: 'browser_action', target: 'zoom_in', details: { action: 'zoom_in' }, speak: 'Zooming in', display: '🔍 **Zooming in**', commandType: 'browser' };
    } else if (lower.includes('zoom out')) {
      offlineResult = { action: 'browser_action', target: 'zoom_out', details: { action: 'zoom_out' }, speak: 'Zooming out', display: '🔎 **Zooming out**', commandType: 'browser' };
    } else if (lower.includes('close browser') || lower.includes('close chrome')) {
      offlineResult = { action: 'browser_action', target: 'close_browser', details: { action: 'close_browser' }, speak: 'Closing Chrome', display: '🛑 **Closing browser**', commandType: 'browser' };
    } else if (lower.includes('what is the volume') || lower.includes('current volume') || lower.includes('volume level') || lower.includes("what's the volume")) {
      offlineResult = { action: 'get_volume', target: '', details: {}, speak: 'Checking current volume', display: '🔊 **Checking volume level...**', commandType: 'system' };
    } else if (lower.includes('toggle mute') || lower.includes('mute toggle')) {
      offlineResult = { action: 'toggle_mute', target: '', details: {}, speak: 'Toggling mute', display: '🔇 **Toggling mute**', commandType: 'system' };
    } else if (lower.includes('unmute') || lower.includes('sound on') || lower.includes('turn sound on')) {
      offlineResult = { action: 'unmute', target: '', details: {}, speak: 'Unmuted', display: '🔊 **Unmuted**', commandType: 'system' };
    } else if (lower.includes('mute') || lower.includes('silence') || lower.includes('quiet')) {
      offlineResult = { action: 'mute', target: '', details: {}, speak: 'Muted', display: '🔇 **Muted**', commandType: 'system' };
    } else if (lower.includes('maximum volume') || lower.includes('full volume')) {
      offlineResult = { action: 'set_volume', target: '100', details: { level: 100 }, speak: 'Volume 100', display: '🔊 **Volume set to 100%**', commandType: 'system' };
    } else if (lower.includes('minimum volume') || lower.includes('very low volume')) {
      offlineResult = { action: 'set_volume', target: '0', details: { level: 0 }, speak: 'Volume 0', display: '🔉 **Volume set to 0%**', commandType: 'system' };
    } else if (lower.includes('set volume to') || /^volume\s+\d{1,3}\b/i.test(lower)) {
      const match = lower.match(/(\d{1,3})/);
      const level = match ? Math.max(0, Math.min(100, Number(match[1]))) : 50;
      offlineResult = {
        action: 'set_volume',
        target: String(level),
        details: { level },
        speak: `Volume ${level}`,
        display: `🔊 **Volume set to ${level}%**`,
        commandType: 'system',
      };
    } else if (lower.includes('volume up') || lower.includes('increase volume') || lower.includes('louder') || lower.includes('increase by')) {
      const match = lower.match(/(?:by\s+)?(\d{1,3})/);
      const step = match ? Math.max(1, Math.min(100, Number(match[1]))) : 10;
      offlineResult = {
        action: 'volume_up',
        target: String(step),
        details: { step },
        speak: 'Volume up',
        display: `🔊 **Increasing volume by ${step}%**`,
        commandType: 'system',
      };
    } else if (lower.includes('volume down') || lower.includes('decrease volume') || lower.includes('quieter') || lower.includes('lower') || lower.includes('decrease by')) {
      const match = lower.match(/(?:by\s+)?(\d{1,3})/);
      const step = match ? Math.max(1, Math.min(100, Number(match[1]))) : 10;
      offlineResult = {
        action: 'volume_down',
        target: String(step),
        details: { step },
        speak: 'Volume down',
        display: `🔉 **Decreasing volume by ${step}%**`,
        commandType: 'system',
      };
    } else if (lower.includes('search') || lower.startsWith('google ') || lower.includes('look up') || lower.includes('find ') && lower.includes('online')) {
      const engineMatch = lower.match(/\b(google|youtube|bing|github)\b/);
      const engine = engineMatch ? engineMatch[1] : 'google';
      const query = userInput
        .replace(/search|look up|find|online|on|google|youtube|bing|github|for/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      offlineResult = {
        action: 'web_search',
        target: query || userInput,
        details: { query: query || userInput, engine },
        speak: `Searching ${engine.charAt(0).toUpperCase() + engine.slice(1)} for ${query || userInput}`,
        display: `🔍 **Searching ${engine}**\n\n${query || userInput}`,
        commandType: 'browser',
      };
    } else if (
      lower.includes('go to ') ||
      lower.includes('take me to ') ||
      /\.(com|in|org|net|io|dev)\b/.test(lower) ||
      /\b(youtube|github|instagram|gmail|linkedin|twitter|facebook|netflix|amazon|flipkart|stackoverflow|chatgpt|claude|maps|translate|drive|meet|calendar)\b/.test(lower)
    ) {
      const site = userInput
        .replace(/open|go to|take me to|website|site|on|my|the/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      offlineResult = {
        action: 'open_website',
        target: site || userInput,
        details: { site: site || userInput },
        speak: `Opening ${site || userInput}`,
        display: `🌐 **Opening website**\n\n${site || userInput}`,
        commandType: 'browser',
      };
    } else if (lower.includes('what apps are open') || lower.includes('which apps are running') || lower.includes('show running apps')) {
      offlineResult = { action: 'running_apps', target: '', details: {}, speak: 'Checking your running applications, sir.', display: '🧩 **Checking running apps...**', commandType: 'system' };
    } else if (lower.startsWith('add app ') && lower.includes(' at ')) {
      const addMatch = userInput.match(/add\s+app\s+(.+?)\s+at\s+(.+)/i);
      const appname = addMatch ? addMatch[1].trim() : '';
      const path = addMatch ? addMatch[2].trim() : '';
      offlineResult = {
        action: 'add_app',
        target: appname,
        details: { appname, path },
        speak: `${appname || 'The app'} has been added, sir.`,
        display: `➕ **Adding App**\n\nName: \`${appname}\`\nPath: \`${path}\``,
        commandType: 'system',
      };
    } else if (lower.startsWith('close ') || lower.startsWith('quit ') || lower.startsWith('exit ') || lower.startsWith('kill ')) {
      const app = userInput.replace(/^(close|quit|exit|kill)\s+/i, '').trim();
      offlineResult = {
        action: 'close_app',
        target: app,
        details: { appname: app },
        speak: `${app} has been closed, sir.`,
        display: `✅ **Closing ${app}**`,
        commandType: 'system',
      };
    } else if (/copy (this|the following)?\s*(text|to clipboard)?\s*:/i.test(userInput) || /^copy this to clipboard/i.test(userInput.trim())) {
      const m = userInput.match(/:\s*([\s\S]+)$/);
      const text = m ? m[1].trim() : '';
      offlineResult = { action: 'copy_text', target: text, details: { text }, speak: text ? 'Copied' : 'Nothing to copy', display: `📋 **Copied to clipboard**\n\n\`${text.slice(0, 80)}\``, commandType: 'system' };
    } else if (lower.includes('clear clipboard history') || (lower.includes('clear') && lower.includes('history'))) {
      offlineResult = { action: 'clear_history', target: '', details: {}, speak: 'Clipboard history cleared', display: '🗑️ **Clipboard history cleared**', commandType: 'system' };
    } else if (lower.includes('clear clipboard') || (lower.includes('clear') && lower.includes('clipboard'))) {
      offlineResult = { action: 'clear_clipboard', target: '', details: {}, speak: 'Clipboard cleared', display: '🗑️ **Clipboard cleared**', commandType: 'system' };
    } else if (lower.includes('clipboard history') || lower.includes('show clipboard') || (lower.includes('clipboard') && lower.includes('history'))) {
      offlineResult = { action: 'clipboard_history', target: '', details: {}, speak: 'Fetching clipboard history', display: '📋 **Clipboard History**', commandType: 'system' };
    } else if (/paste\s+(number|item|no\.?|#)?\s*\d+/i.test(lower)) {
      const m = lower.match(/(\d+)/);
      const index = m ? Number(m[1]) : 1;
      offlineResult = { action: 'paste_history', target: String(index), details: { index }, speak: `Pasting item ${index}`, display: `📋 **Pasting history item ${index}**`, commandType: 'system' };
    } else if (lower.includes('clipboard') || lower.includes('what did i copy')) {
      offlineResult = { action: 'read_clipboard', target: '', details: {}, speak: 'Reading your clipboard', display: '📋 **Reading clipboard...**', commandType: 'system' };
    } else if (lower === 'copy that' || lower === 'copy this' || lower === 'copy' || lower === 'ctrl c' || lower === 'control c') {
      offlineResult = { action: 'simulate_copy', target: '', details: {}, speak: 'Copied', display: '📋 **Copied**', commandType: 'system' };
    } else if (lower === 'paste that' || lower === 'paste this' || lower === 'paste it' || lower === 'paste' || lower === 'ctrl v' || lower === 'control v') {
      offlineResult = { action: 'simulate_paste', target: '', details: {}, speak: 'Pasted', display: '📋 **Pasted**', commandType: 'system' };
    } else if (lower === 'cut that' || lower === 'cut this' || lower === 'cut' || lower === 'ctrl x' || lower === 'control x') {
      offlineResult = { action: 'simulate_cut', target: '', details: {}, speak: 'Cut', display: '✂️ **Cut**', commandType: 'system' };
    } else if (lower === 'select all' || lower === 'ctrl a' || lower === 'control a') {
      offlineResult = { action: 'select_all', target: '', details: {}, speak: 'Selected all', display: '🔲 **Select all**', commandType: 'system' };
    } else if (lower === 'undo' || lower === 'undo that' || lower === 'ctrl z' || lower === 'control z') {
      offlineResult = { action: 'undo', target: '', details: {}, speak: 'Undone', display: '↩️ **Undo**', commandType: 'system' };
    } else if (lower === 'redo' || lower === 'redo that' || lower === 'ctrl y' || lower === 'control y') {
      offlineResult = { action: 'redo', target: '', details: {}, speak: 'Redone', display: '↪️ **Redo**', commandType: 'system' };
    } else if (/\bwhat(?:'s| is)? the time\b/.test(lower) || lower === 'what time is it' || lower.includes('current time') || (lower.includes('time') && lower.includes('what'))) {
      offlineResult = { action: 'get_time', target: '', details: {}, speak: 'Let me check the time', display: '🕐 **Checking time...**', commandType: 'chat' };
    } else if (lower.includes("today's date") || lower.includes('what is the date') || lower.includes("what's the date") || lower.includes('what day is') || (lower.includes('date') && lower.includes('what'))) {
      offlineResult = { action: 'get_date', target: '', details: {}, speak: 'Let me check the date', display: '📅 **Checking date...**', commandType: 'chat' };
    } else if (/\bremind me to\b/.test(lower) || /\bset a reminder\b/.test(lower) || /\breminder (for|to)\b/.test(lower)) {
      const timeMatch = userInput.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      const timeStr = timeMatch ? timeMatch[1].trim() : '';
      let text = userInput.replace(/.*remind me to\s*/i, '').replace(/.*set a reminder (for|to)\s*/i, '').replace(/.*reminder (for|to)\s*/i, '');
      text = text.replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?.*/i, '').trim();
      offlineResult = { action: 'add_reminder', target: text, details: { text: text || 'reminder', time: timeStr }, speak: timeStr ? `Reminder set for ${timeStr}` : 'When should I remind you?', display: `⏰ **Reminder**\n\n${text || 'reminder'}${timeStr ? ` at ${timeStr}` : ''}`, commandType: 'system' };
    } else if (lower.includes('my reminders') || lower.includes('list reminders') || lower.includes('show reminders') || (lower.includes('reminder') && lower.includes('what'))) {
      offlineResult = { action: 'list_reminders', target: '', details: {}, speak: 'Fetching your reminders', display: '⏰ **Your Reminders**', commandType: 'system' };
    } else if (/cancel.*reminder|remove.*reminder|reminder.*cancel/.test(lower)) {
      const timeMatch = userInput.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      const timeStr = timeMatch ? timeMatch[1].trim() : '';
      offlineResult = { action: 'cancel_reminder', target: timeStr, details: { time: timeStr }, speak: 'Cancelling reminder', display: '⏰ **Cancelling reminder**', commandType: 'system' };
    } else if (lower === 'help' || lower === 'show help' || lower.includes('what can you do') || lower.includes('your features') || lower.includes('your abilities')) {
      offlineResult = { action: 'jarvis_help', target: '', details: {}, speak: "Here's everything I can do, sir.", display: '❓ **JARVIS Help**', commandType: 'chat' };
    } else if (lower.includes('jarvis status') || lower.includes('system health') || lower.includes('status report') || lower === 'status') {
      offlineResult = { action: 'jarvis_status', target: '', details: {}, speak: 'Running a system health check', display: '📊 **JARVIS Status**', commandType: 'chat' };
    } else if (lower.includes('stop listening') || lower.includes('pause listening')) {
      offlineResult = { action: 'stop_listening', target: '', details: {}, speak: 'Pausing wake word detection', display: '🔇 **Listening paused**', commandType: 'system' };
    } else if (lower.includes('start listening') || lower.includes('resume listening')) {
      offlineResult = { action: 'start_listening', target: '', details: {}, speak: 'Listening resumed', display: '🎙️ **Listening resumed**', commandType: 'system' };
    } else if (lower.includes('goodbye jarvis') || lower.includes('go to sleep') || lower === 'sleep mode' || lower.includes('goodnight jarvis')) {
      offlineResult = { action: 'sleep_mode', target: '', details: {}, speak: 'Goodbye sir, going to sleep.', display: '😴 **JARVIS sleeping...**', commandType: 'system' };
    } else if (lower === 'what did i just say' || lower === 'what did i say' || lower.includes('repeat my command')) {
      offlineResult = { action: 'what_did_i_say', target: '', details: {}, speak: 'Recalling your last command', display: '🔁 **Last command**', commandType: 'chat' };
    } else if (lower === 'repeat that' || lower === 'say that again' || lower === 'what did you say') {
      offlineResult = { action: 'repeat_response', target: '', details: {}, speak: 'Repeating', display: '🔁 **Repeating**', commandType: 'chat' };
    } else if (lower === 'do that again' || lower === 'again' || lower === 'one more time') {
      offlineResult = { action: 'do_again', target: '', details: {}, speak: 'Doing that again', display: '🔁 **Repeating last action**', commandType: 'chat' };
    } else if (matchSystemFolder(lower)) {
      // Windows system/virtual locations (This PC, Recycle Bin, Control Panel…).
      // Must be tested before the generic "open folder"/"open <app>" branches,
      // and before the delete branch so "add or remove programs" isn't read as
      // a delete request.
      const foldername = matchSystemFolder(lower);
      const label = foldername.replace(/\b\w/g, (c) => c.toUpperCase());
      offlineResult = {
        action: 'open_folder',
        target: foldername,
        details: { foldername },
        speak: `Opening ${label}, sir.`,
        display: `🖥️ **Opening ${label}**`,
        commandType: 'file',
      };
    } else if (lower.includes('open folder') || lower.includes('open directory')) {
      const folder = userInput
        .replace(/open|my|the|folder|directory/gi, '')
        .trim();
      offlineResult = {
        action: 'open_folder',
        target: folder || 'Downloads',
        details: { foldername: folder || 'Downloads' },
        speak: `Opening ${folder || 'Downloads'} folder, sir.`,
        display: `📁 **Opening Folder**\n\n\`${folder || 'Downloads'}\``,
        commandType: 'file',
      };
    } else if (lower.includes('open file') || /\.[a-z0-9]{2,6}\b/.test(lower)) {
      const filename = userInput
        .replace(/open|my|the|file/gi, '')
        .trim();
      offlineResult = {
        action: 'open_file',
        target: filename,
        details: { filename },
        speak: `Opening ${filename}, sir.`,
        display: `📂 **Opening File**\n\n\`${filename}\``,
        commandType: 'file',
      };
    } else if (lower.includes('open ')) {
      const appMatch = lower.match(/open\s+(.+)/);
      const app = appMatch ? appMatch[1].trim() : lower;
      offlineResult = { action: 'open_app', target: app, details: { appname: app }, speak: `Opening ${app}, sir.`, display: `🚀 **Opening ${app}**`, commandType: 'system' };
    } else if (lower.includes('search') || lower.includes('google')) {
      const q = userInput.replace(/search|google|for|the/gi, '').trim();
      offlineResult = { action: 'search_web', target: q || userInput, speak: `Searching Google for ${q || userInput}, sir.`, display: `🔍 **Web Search**\n\n${q || userInput}`, commandType: 'browser' };
    } else if (lower.includes('youtube')) {
      const q = userInput.replace(/youtube|play|search/gi, '').trim();
      offlineResult = { action: 'open_youtube', target: q, speak: `Opening YouTube, sir.`, display: `▶️ **YouTube**\n\n${q}`, commandType: 'browser' };
    } else if (lower.includes('cancel shutdown') || lower.includes('abort shutdown') || lower.includes('cancel restart')) {
      offlineResult = { action: 'cancel_shutdown', target: '', details: {}, speak: 'Shutdown cancelled', display: '🚫 **Shutdown cancelled**', commandType: 'system' };
    } else if (lower.includes('shutdown') || lower.includes('shut down') || lower.includes('power off') || lower.includes('turn off')) {
      const m = lower.match(/(\d{1,4})\s*(?:min|minute)/);
      if (m) {
        const minutes = Number(m[1]);
        offlineResult = { action: 'shutdown', target: String(minutes), details: { minutes }, speak: `Shutting down in ${minutes} minutes`, display: `⚡ **Scheduled Shutdown**\n\nShutting down in ${minutes} minutes.`, commandType: 'system' };
      } else {
        offlineResult = { action: 'shutdown_confirm', target: '', details: { minutes: 0 }, speak: 'Are you sure you want to shutdown? Say yes to confirm', display: '⚠️ **Confirm Shutdown**\n\nSay "yes" to shut down, or "cancel".', commandType: 'system' };
      }
    } else if (lower.includes('restart') || lower.includes('reboot')) {
      const m = lower.match(/(\d{1,4})\s*(?:min|minute)/);
      if (m) {
        const minutes = Number(m[1]);
        offlineResult = { action: 'restart', target: String(minutes), details: { minutes }, speak: `Restarting in ${minutes} minutes`, display: `🔄 **Scheduled Restart**\n\nRestarting in ${minutes} minutes.`, commandType: 'system' };
      } else {
        offlineResult = { action: 'restart_confirm', target: '', details: { minutes: 0 }, speak: 'Are you sure you want to restart? Say yes to confirm', display: '⚠️ **Confirm Restart**\n\nSay "yes" to restart, or "cancel".', commandType: 'system' };
      }
    } else if (lower.includes('log off') || lower.includes('logoff') || lower.includes('sign out') || lower.includes('log out')) {
      offlineResult = { action: 'logoff_confirm', target: '', details: {}, speak: 'Are you sure you want to log off? Say yes to confirm', display: '⚠️ **Confirm Log Off**\n\nSay "yes" to log off, or "cancel".', commandType: 'system' };
    } else if (lower.includes('sleep')) {
      offlineResult = { action: 'sleep', target: '', details: {}, speak: 'Going to sleep. Goodnight', display: '😴 **Sleep**\n\nPutting the PC to sleep...', commandType: 'system' };
    } else if (lower.includes('lock')) {
      offlineResult = { action: 'lock_screen', target: '', details: {}, speak: 'Locking screen', display: '🔒 **Locking screen**', commandType: 'system' };
    } else if (lower.includes('battery')) {
      offlineResult = { action: 'get_battery', target: '', details: {}, speak: 'Checking battery', display: '🔋 **Checking battery...**', commandType: 'system' };
    } else if (lower.includes('ram') || lower.includes('memory')) {
      offlineResult = { action: 'get_ram', target: '', details: {}, speak: 'Checking memory', display: '💾 **Checking RAM...**', commandType: 'system' };
    } else if (lower.includes('cpu') || lower.includes('processor')) {
      offlineResult = { action: 'get_cpu', target: '', details: {}, speak: 'Checking CPU', display: '⚡ **Checking CPU...**', commandType: 'system' };
    } else if (lower.includes('disk') || lower.includes('storage') || lower.includes('space')) {
      offlineResult = { action: 'get_disk', target: '', details: {}, speak: 'Checking disk space', display: '💿 **Checking disk...**', commandType: 'system' };
    } else if (lower.includes('ip address') || lower.includes('my ip') || lower.includes("what's my ip") || lower.includes('what is my ip')) {
      offlineResult = { action: 'get_ip', target: '', details: {}, speak: 'Checking your IP address', display: '🌐 **Checking IP...**', commandType: 'system' };
    } else if (lower.includes('system info') || lower.includes('system status') || lower.includes('all info')) {
      offlineResult = { action: 'get_system_info', target: '', details: {}, speak: 'Gathering system information', display: '📊 **System Info...**', commandType: 'system' };
    } else if (lower.includes('set brightness to') || /brightness\s+\d{1,3}/.test(lower)) {
      const m = lower.match(/(\d{1,3})/);
      const level = m ? Math.max(0, Math.min(100, Number(m[1]))) : 70;
      offlineResult = { action: 'set_brightness', target: String(level), details: { level }, speak: `Brightness set to ${level}`, display: `🔆 **Brightness set to ${level}%**`, commandType: 'system' };
    } else if (lower.includes('brightness up') || lower.includes('increase brightness') || lower.includes('brighter')) {
      const m = lower.match(/(?:by\s+)?(\d{1,3})/);
      const step = m ? Math.max(1, Math.min(100, Number(m[1]))) : 10;
      offlineResult = { action: 'brightness_up', target: String(step), details: { step }, speak: 'Brightness up', display: `🔆 **Increasing brightness by ${step}%**`, commandType: 'system' };
    } else if (lower.includes('brightness down') || lower.includes('decrease brightness') || lower.includes('dimmer') || lower.includes('dim ')) {
      const m = lower.match(/(?:by\s+)?(\d{1,3})/);
      const step = m ? Math.max(1, Math.min(100, Number(m[1]))) : 10;
      offlineResult = { action: 'brightness_down', target: String(step), details: { step }, speak: 'Brightness down', display: `🔅 **Decreasing brightness by ${step}%**`, commandType: 'system' };
    } else if (lower === 'yes' || lower === 'yes jarvis' || lower === 'confirm' || lower === 'do it' || lower === 'sure' || lower === 'go ahead') {
      offlineResult = { action: 'confirm', target: '', details: {}, speak: 'Confirmed', display: '✅ **Confirmed**', commandType: 'system' };
    } else if (lower === 'no' || lower === 'cancel' || lower === 'abort' || lower === 'stop' || lower === "don't" || lower === 'dont') {
      offlineResult = { action: 'cancel', target: '', details: {}, speak: 'Cancelled', display: '🚫 **Cancelled**', commandType: 'system' };
    } else if (lower.includes('delete') || lower.includes('remove')) {
      const f = userInput.replace(/delete|remove|the|file/gi, '').trim();
      offlineResult = { action: 'delete_file', target: f, speak: `Preparing to delete ${f}, sir. Confirmation required.`, display: `🗑️ Delete: \`${f}\``, commandType: 'file' };
    } else if (lower.includes('create') || lower.includes('make') || lower.includes('new file')) {
      const f = userInput.replace(/create|make|new|file|a\s+/gi, '').trim();
      offlineResult = { action: 'create_file', target: f || 'new_file.txt', details: { content: '' }, speak: `Creating file ${f}, sir.`, display: `📄 **Creating File**\n\n\`${f}\``, commandType: 'file' };
    } else if (/\b(add|save)\s+contact\b/i.test(lower) || /\bsave\s+.+\s+as\s+[+\d]/i.test(lower)) {
      let name = '';
      let phone = '';
      let m = userInput.match(/(?:add|save)\s+contact\s+([a-z][a-z ]*?)\s+(?:as\s+)?([+\d][\d\s\-]{6,})/i);
      if (!m) m = userInput.match(/save\s+([a-z][a-z ]*?)\s+as\s+([+\d][\d\s\-]{6,})/i);
      if (m) { name = m[1].trim(); phone = m[2].replace(/\s+/g, ''); }
      offlineResult = {
        action: 'add_contact',
        target: name,
        details: { name, phone },
        speak: name ? `${name} added to your contacts, sir.` : 'Adding the contact, sir.',
        display: `➕ **Adding Contact**\n\nName: \`${name}\`\nPhone: \`${phone}\``,
        commandType: 'system',
      };
    } else if (
      (lower.includes('screenshot') || /\.[a-z0-9]{2,6}\b/.test(lower)) &&
      (lower.includes('whatsapp') || (lower.includes(' to ') && (lower.includes('send') || lower.includes('share'))))
    ) {
      const contactMatch = userInput.match(/\bto\s+([a-z][a-z ]*?)(?:\s+on\s+whatsapp|\s+via\s+whatsapp|\s+through\s+whatsapp|$)/i);
      const contact = contactMatch ? contactMatch[1].trim() : '';
      let filename = '';
      if (lower.includes('screenshot')) {
        filename = 'latest_screenshot';
      } else {
        const fileMatch = userInput.match(/([\w.\-]+\.[a-z0-9]{2,6})\b/i);
        filename = fileMatch ? fileMatch[1].trim() : '';
      }
      const shown = filename === 'latest_screenshot' ? 'your last screenshot' : filename;
      offlineResult = {
        action: 'whatsapp_file',
        target: filename,
        details: { contact, filename, caption: '' },
        speak: contact ? `Sending ${shown} to ${contact}` : `Sending ${shown} on WhatsApp`,
        display: `📎 **WhatsApp File**\n\nFile: \`${filename}\`\nTo: \`${contact || '—'}\``,
        commandType: 'system',
      };
    } else if (
      lower.includes('whatsapp') ||
      lower.startsWith('send message') || lower.startsWith('message ') ||
      lower.startsWith('text ') || lower.includes('send message to')
    ) {
      let contact = '';
      let message = '';
      let m = userInput.match(/(?:send\s+(?:a\s+)?message\s+to|whatsapp|message|text)\s+([a-z][a-z ]*?)\s*(?::|,|\bthat\b|\bsaying\b)\s*(.+)/i);
      if (!m) m = userInput.match(/(?:message|text|whatsapp)\s+([a-z]+)\s+(.+)/i);
      if (m) { contact = m[1].trim(); message = m[2].trim(); }
      offlineResult = {
        action: 'whatsapp_message',
        target: contact,
        details: { contact, message },
        speak: contact ? `Sending message to ${contact}` : 'Sending your WhatsApp message, sir.',
        display: `💬 **WhatsApp Message**\n\nTo: \`${contact || '—'}\`\n\n${message}`,
        commandType: 'system',
      };
    } else if (
      (lower.includes('analyze') && (lower.includes('screen') || lower.includes('this'))) ||
      (lower.includes("what's on") && lower.includes('screen')) ||
      lower.includes('what is on the screen') ||
      lower.includes('what is written on') ||
      lower.includes('whats on my screen') ||
      lower.includes('read my screen') ||
      lower.includes('describe my screen') ||
      lower.includes('describe the screen') ||
      lower.includes('what do you see on screen') ||
      lower.includes('screen analysis') ||
      lower.includes('summarize the screen') ||
      lower.includes('what does the screen say') ||
      lower.includes('tell me what is on the screen') ||
      lower.includes('tell me whats on the screen')
    ) {
      offlineResult = {
        action: 'analyze_screen',
        target: '',
        details: {},
        speak: 'Analyzing your screen now, sir. One moment.',
        display: '🖥️ **Screen Analysis**\n\nCapturing and analyzing your screen with Gemini Vision...',
        commandType: 'system',
      };
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
    // Race the DB fetch against a 3-second timeout so a slow connection
    // doesn't delay the whole response
    const historyPromise = Conversation.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('history timeout')), 3000)
    );
    const pastMessages = await Promise.race([historyPromise, timeoutPromise]);
    historyParts = pastMessages.reverse().map((msg) => ({
      role: msg.role === 'jarvis' ? 'model' : 'user',
      parts: [{ text: msg.message }],
    }));
  } catch (err) {
    console.warn('[Brain] Could not fetch history (skipping):', err.message);
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

    const result = await generateWithFallback(contents, {
      maxOutputTokens: 1024,
      temperature: 0.75,
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
    if (err.message && (err.message.includes('API_KEY_INVALID') || err.message.includes('INVALID_ARGUMENT') || (err.message.includes('400') && err.message.includes('key')))) {
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

  // Compatibility normalization for alternate response shapes:
  // { action, params, response } -> current pipeline expects target/details/speak/display
  if (parsed.params && typeof parsed.params === 'object') {
    parsed.details = { ...(parsed.details || {}), ...parsed.params };
    if (!parsed.target) {
      if (parsed.params.filename) parsed.target = parsed.params.filename;
      if (parsed.params.foldername) parsed.target = parsed.params.foldername;
      if (parsed.params.appname) parsed.target = parsed.params.appname;
      if (parsed.params.query) parsed.target = parsed.params.query;
      if (parsed.params.site) parsed.target = parsed.params.site;
      if (parsed.params.action) parsed.target = parsed.params.action;
      if (parsed.params.level !== undefined && parsed.params.level !== null) parsed.target = String(parsed.params.level);
      if (parsed.params.step !== undefined && parsed.params.step !== null) parsed.target = String(parsed.params.step);
      if (parsed.params.contact) parsed.target = parsed.params.contact;
      if (parsed.params.name) parsed.target = parsed.params.name;
      if (parsed.params.minutes !== undefined && parsed.params.minutes !== null) parsed.target = String(parsed.params.minutes);
      if (parsed.params.text !== undefined && parsed.params.text !== null) parsed.target = String(parsed.params.text);
      if (parsed.params.index !== undefined && parsed.params.index !== null) parsed.target = String(parsed.params.index);
      if (parsed.params.time !== undefined && parsed.params.time !== null) parsed.target = String(parsed.params.time);
    }
  }
  if (!parsed.speak && typeof parsed.response === 'string') parsed.speak = parsed.response;
  if (!parsed.display && typeof parsed.response === 'string') parsed.display = parsed.response;

  // Safety net: the model sometimes labels "open this pc" / "open recycle bin"
  // as open_app, which can never succeed — those are shell locations, not
  // executables. Re-route them to open_folder.
  if (parsed.action === 'open_app') {
    const candidate = String(parsed.details?.appname || parsed.target || '').toLowerCase();
    const systemFolder = candidate && matchSystemFolder(candidate);
    if (systemFolder) {
      parsed.action = 'open_folder';
      parsed.target = systemFolder;
      parsed.details = { ...(parsed.details || {}), foldername: systemFolder };
      delete parsed.details.appname;
    }
  }
  if (!parsed.commandType) {
    if (parsed.action === 'open_file' || parsed.action === 'open_folder') parsed.commandType = 'file';
    else if (
      parsed.action === 'open_app' ||
      parsed.action === 'close_app' ||
      parsed.action === 'running_apps' ||
      parsed.action === 'add_app' ||
      parsed.action === 'volume_up' ||
      parsed.action === 'volume_down' ||
      parsed.action === 'set_volume' ||
      parsed.action === 'mute' ||
      parsed.action === 'unmute' ||
      parsed.action === 'toggle_mute' ||
      parsed.action === 'get_volume' ||
      parsed.action === 'whatsapp_message' ||
      parsed.action === 'whatsapp_file' ||
      parsed.action === 'add_contact' ||
      parsed.action === 'lock_screen' ||
      parsed.action === 'sleep' ||
      parsed.action === 'shutdown' ||
      parsed.action === 'shutdown_confirm' ||
      parsed.action === 'cancel_shutdown' ||
      parsed.action === 'restart' ||
      parsed.action === 'restart_confirm' ||
      parsed.action === 'logoff' ||
      parsed.action === 'logoff_confirm' ||
      parsed.action === 'get_battery' ||
      parsed.action === 'get_ram' ||
      parsed.action === 'get_cpu' ||
      parsed.action === 'get_disk' ||
      parsed.action === 'get_ip' ||
      parsed.action === 'get_system_info' ||
      parsed.action === 'brightness_up' ||
      parsed.action === 'brightness_down' ||
      parsed.action === 'set_brightness' ||
      parsed.action === 'read_clipboard' ||
      parsed.action === 'copy_text' ||
      parsed.action === 'simulate_copy' ||
      parsed.action === 'simulate_paste' ||
      parsed.action === 'simulate_cut' ||
      parsed.action === 'select_all' ||
      parsed.action === 'undo' ||
      parsed.action === 'redo' ||
      parsed.action === 'clipboard_history' ||
      parsed.action === 'paste_history' ||
      parsed.action === 'clear_clipboard' ||
      parsed.action === 'clear_history' ||
      parsed.action === 'add_reminder' ||
      parsed.action === 'list_reminders' ||
      parsed.action === 'cancel_reminder' ||
      parsed.action === 'stop_listening' ||
      parsed.action === 'start_listening' ||
      parsed.action === 'sleep_mode' ||
      parsed.action === 'wake_mode' ||
      parsed.action === 'confirm' ||
      parsed.action === 'cancel'
    ) parsed.commandType = 'system';
    else if (parsed.action === 'web_search' || parsed.action === 'open_website' || parsed.action === 'browser_action' || parsed.action === 'current_url') parsed.commandType = 'browser';
    else if (parsed.action === 'analyze_screen') parsed.commandType = 'system';
    else parsed.commandType = 'chat';
  }

  parsed.webSearchUsed = webContextUsed;

  // Save conversation to MongoDB — fire-and-forget so a slow DB
  // doesn't delay the response being sent back to the client
  Promise.all([
    Conversation.create({
      sessionId,
      role: 'user',
      message: userInput,
      expertId,
      commandType: parsed.commandType || 'chat',
      webSearchUsed: false,
    }),
    Conversation.create({
      sessionId,
      role: 'jarvis',
      message: parsed.display || parsed.speak,
      expertId,
      commandType: parsed.commandType || 'chat',
      webSearchUsed: parsed.webSearchUsed,
    }),
  ]).catch(err => console.warn('[Brain] Could not save to MongoDB:', err.message));

  return parsed;
};

module.exports = { processCommand, EXPERT_SYSTEMS };
