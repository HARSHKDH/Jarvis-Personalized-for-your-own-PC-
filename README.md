<div align="center">

# ⚡ J.A.R.V.I.S. v5.0

### *Just A Rather Very Intelligent System*

[![Node.js](https://img.shields.io/badge/Node.js-≥18.0-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-≥3.9-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Database-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101?style=for-the-badge&logo=socket.io)](https://socket.io)

> A **production-grade, voice-controlled AI assistant** modeled after Iron Man's J.A.R.V.I.S. —
> featuring an Iron Man HUD, 8 expert AI personas, full OS automation, and a floating Electron overlay.
> Powered by **Google Gemini** (or Anthropic Claude), persisted with **MongoDB**, and automated with **Python + Selenium**.

</div>

---

## 📸 Screenshots

> *Launch JARVIS with a double-click, speak your command, and watch the holographic HUD respond in real-time.*

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🎤 **Wake Word Detection** | Say *"Hey JARVIS"*, *"Jarvis"*, or *"Computer"* to activate |
| 🤖 **Dual AI Brain** | Google Gemini (default) or Anthropic Claude — swap with one config line |
| 🎭 **8 Expert Personas** | JARVIS, Physicist, Neurosurgeon, Coach, Lawyer, Financial Analyst, Developer, Historian |
| 🖥️ **OS Automation** | Open apps, take screenshots, control volume, lock/sleep system |
| 🌐 **Browser Control** | Google, YouTube, GitHub — navigate by voice |
| 💬 **WhatsApp Automation** | Send messages and files via WhatsApp Web |
| 🧠 **Persistent Memory** | MongoDB stores every conversation — ask about past sessions |
| 🎙️ **Voice Authentication** | Face-api biometric enrollment & verification |
| 🔴 **Iron Man HUD** | Glowing cyan holographic UI with animations, waveforms, and boot sequence |
| ⚡ **Real-time Sync** | Socket.io bidirectional communication — zero-latency responses |
| 🪟 **Electron Overlay** | Floating always-on-top mini HUD on your desktop |
| 🔐 **Secure Context** | Web Speech API via localhost HTTP server (works without keys) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     J.A.R.V.I.S. v5.0                       │
│                                                             │
│  ┌─────────────┐    WebSocket / REST    ┌─────────────────┐ │
│  │  React HUD  │◄──────────────────────►│  Express Server │ │
│  │  (Vite 5)   │                        │  (Node.js 18+)  │ │
│  └─────────────┘                        └────────┬────────┘ │
│                                                  │           │
│  ┌─────────────┐                        ┌────────▼────────┐ │
│  │  Electron   │                        │  AI Brain       │ │
│  │  Overlay    │                        │  (Gemini/Claude)│ │
│  └─────────────┘                        └────────┬────────┘ │
│                                                  │           │
│  ┌─────────────┐      spawn process     ┌────────▼────────┐ │
│  │  Python     │◄───────────────────────│    MongoDB      │ │
│  │  Executor   │                        │   (History)     │ │
│  └─────────────┘                        └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
JARVIS/
├── 📁 client/                  ← React + Vite Frontend (Port 5173)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ArcReactor.jsx       Animated arc reactor widget
│   │   │   ├── BootSequence.jsx     Startup animation
│   │   │   ├── ChatLog.jsx          Conversation history display
│   │   │   ├── CommandInput.jsx     Voice + text input bar
│   │   │   ├── EnrollmentFlow.jsx   Face/voice enrollment UI
│   │   │   ├── ExpertPanel.jsx      Persona selector panel
│   │   │   ├── GreetingBubble.jsx   JARVIS greeting overlay
│   │   │   ├── HUD.jsx              Main holographic interface
│   │   │   ├── HexGrid.jsx          Background hex grid animation
│   │   │   ├── MessageBubble.jsx    Individual message component
│   │   │   ├── MiniHUD.jsx          Compact floating HUD
│   │   │   ├── ScanLine.jsx         Visual scan effect
│   │   │   ├── SilentBootScreen.jsx Silent boot overlay
│   │   │   ├── StatusBar.jsx        System status indicators
│   │   │   ├── VoiceAuth.jsx        Voice authentication component
│   │   │   └── Waveform.jsx         Audio waveform visualizer
│   │   ├── context/            React context providers
│   │   ├── hooks/              Custom React hooks
│   │   ├── utils/              Utility functions (markdown, etc.)
│   │   ├── App.jsx             Root app component
│   │   ├── main.jsx            Entry point
│   │   └── index.css           Global Iron Man theme styles
│   ├── public/
│   │   └── favicon.png
│   ├── index.html
│   ├── vite.config.js
│   └── .env.example            ← Copy to .env
│
├── 📁 server/                  ← Node.js + Express Backend (Port 5000)
│   ├── config/
│   │   └── db.js               MongoDB connection
│   ├── controllers/
│   │   ├── authController.js   Voice authentication logic
│   │   ├── brain.js            AI conversation engine (Gemini/Claude)
│   │   ├── executor.js         Python subprocess bridge
│   │   └── history.js          Conversation history controller
│   ├── middleware/
│   │   ├── logger.js           Request logging
│   │   └── errorHandler.js     Global error handler
│   ├── models/
│   │   ├── Command.js          OS command schema
│   │   ├── Conversation.js     Chat message schema
│   │   ├── Session.js          Session schema
│   │   └── VoiceProfile.js     Biometric profile schema
│   ├── routes/
│   │   ├── auth.js             /api/auth
│   │   ├── chat.js             /api/chat
│   │   ├── commands.js         /api/commands
│   │   ├── health.js           /api/health
│   │   ├── history.js          /api/history
│   │   └── transcribe.js       /api/transcribe
│   ├── socket/
│   │   └── events.js           Socket.io event handlers
│   ├── utils/                  Server utility functions
│   ├── index.js                Server entry point
│   ├── package.json
│   └── .env.example            ← Copy to .env
│
├── 📁 electron/                ← Electron Desktop Overlay
│   ├── main.js                 Main process (window, tray, IPC)
│   ├── preload.js              Context bridge (secure IPC)
│   ├── assistant.html          Floating HUD renderer
│   └── package.json
│
├── 📁 python/                  ← OS Automation Engine
│   ├── executor.py             Main OS command executor
│   ├── enroll.py               Voice biometric enrollment
│   ├── enroll_sample.py        Sample enrollment helper
│   ├── verify.py               Voice verification
│   ├── requirements.txt        Python dependencies
│   └── requirements_auth.txt   Auth-specific dependencies
│
├── 📁 scripts/                 ← Windows Utility Scripts
│   ├── install-startup.ps1     Register JARVIS at Windows startup
│   ├── fix-and-reinstall-startup.ps1  Fix/repair startup entry
│   └── uninstall-startup.ps1   Remove JARVIS from startup
│
├── 📁 logs/                    ← Runtime Logs (git-ignored)
│
├── jarvis-start.bat            One-click launcher (recommended)
├── jarvis-autostart.vbs        Silent autostart helper
├── package.json                Root scripts (concurrently)
├── .gitignore
└── README.md
```

---

## 📋 Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | ≥ 18.0 | [nodejs.org](https://nodejs.org) |
| **npm** | ≥ 9.0 | Bundled with Node.js |
| **Python** | ≥ 3.9 | [python.org](https://python.org) |
| **pip** | Latest | Bundled with Python |
| **MongoDB** | ≥ 6.0 (local) **or** MongoDB Atlas (cloud free) | [mongodb.com](https://mongodb.com/try/download/community) |
| **Git** | Any | [git-scm.com](https://git-scm.com) |

> **Windows only** — the OS automation layer (Python executor, `.bat` launchers, startup scripts) is Windows-specific.

---

## 🔑 API Keys Setup

### 1. Google Gemini API Key *(Required — Free)*
1. Visit [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key and paste it as `GEMINI_API_KEY` in `server/.env`

### 2. Anthropic / Claude API Key *(Optional — swap-in)*
1. Visit [console.anthropic.com](https://console.anthropic.com)
2. Create an account and generate a key (starts with `sk-ant-`)
3. Add it as `ANTHROPIC_API_KEY` in `server/.env`
4. Edit `server/controllers/brain.js` and switch the provider from `gemini` to `anthropic`

### 3. MongoDB

**Option A — Local MongoDB *(Recommended for dev)***
```bash
# Install from https://mongodb.com/try/download/community
# MongoDB auto-starts as a Windows service after install
# Default URI: mongodb://localhost:27017
```

**Option B — MongoDB Atlas *(Cloud, free 512MB tier)***
1. Create a free cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Whitelist your IP
3. Copy the connection string and paste as `MONGODB_URI` in `server/.env`

---

## ⚙️ Installation

### Step 1 — Clone the Repository
```bash
git clone https://github.com/HARSHKDH/Jarvis-Personalized-for-your-own-PC-.git
cd Jarvis-Personalized-for-your-own-PC-
```

### Step 2 — Configure Environment Variables

```bash
# Copy the server template
copy server\.env.example server\.env

# Copy the client template (optional — defaults work out of the box)
copy client\.env.example client\.env
```

Edit `server/.env` and fill in your keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
MONGODB_URI=mongodb://localhost:27017/jarvis
PORT=5000
NODE_ENV=development
SESSION_SECRET=replace_with_any_long_random_string
CLIENT_URL=http://localhost:5173
```

### Step 3 — Install All Node.js Dependencies
```bash
# Install root + server + client in one command
npm run install:all
```

Or manually:
```bash
npm install               # root
cd server && npm install  # server
cd ../client && npm install # client
```

### Step 4 — Install Python Dependencies
```bash
cd python
pip install -r requirements.txt
cd ..
```

### Step 5 — Start MongoDB *(if using local)*
```bash
# Usually auto-runs as a Windows service
# Or start manually:
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath="C:\data\db"
```

---

## 🚀 Running JARVIS

### Option A — One-Click Launch *(Windows, Recommended)*
```
Double-click: jarvis-start.bat
```
This automatically starts the server, client, and Electron overlay.

### Option B — Developer Mode *(Terminal)*
```bash
# Start both server and client concurrently
npm run dev
```
- **Server**: `http://localhost:5000`
- **React HUD**: `http://localhost:5173`

### Option C — Individual Services
```bash
npm run server           # Backend only
npm run client           # Frontend only (React)
cd electron && npx electron .  # Electron overlay
```

### Option D — Windows Startup Autolaunch
```powershell
# Run as Administrator
powershell -ExecutionPolicy Bypass -File scripts\install-startup.ps1
```

---

## 🎤 Voice Commands Reference

### Wake Words
Activate JARVIS by saying any of:
- `"Jarvis"` | `"Hey Jarvis"` | `"OK Jarvis"` | `"Computer"`

---

### 🔍 Information & Search
```
"Jarvis, what is the latest news in AI?"
"Jarvis, explain quantum entanglement"
"Jarvis, what's the weather today?"
"Jarvis, search for best restaurants near me"
```

### 🌐 Browser Control
```
"Open Google Chrome"
"Search Google for Tesla stock price"
"Open YouTube and search for lofi music"
"Go to github.com"
"Open Gmail"
```

### 💻 Applications
```
"Open VS Code"
"Launch Spotify"
"Open Calculator"
"Start Notepad"
"Open Task Manager"
```

### 📁 File System
```
"Take a screenshot"
"Open my resume from Documents"
"Create a file called notes.txt with my meeting notes"
```

### 🖥️ System Control
```
"Lock the computer"
"Put the system to sleep"
"Volume up"
"Volume down"
"Mute the volume"
"Restart the computer"
```

### 💬 WhatsApp
```
"Send a WhatsApp message to John saying I'll be 10 minutes late"
"Send the screenshot to Mom on WhatsApp"
```

### 🎭 Expert Modes
```
"Jarvis, switch to developer mode"
"Jarvis, activate physicist mode"
"Jarvis, switch to financial analyst"
```

### 🧠 Memory
```
"Jarvis, what did we discuss earlier?"
"Jarvis, summarize our conversation"
"Jarvis, recall my last session"
```

---

## 🎭 Expert Personas

| Persona | Codename | Specialty |
|---------|----------|-----------|
| 🤖 | **J.A.R.V.I.S.** | General AI + OS Control — default mode |
| ⚛️ | **Dr. Feynman** | Nobel Physicist — science explainer |
| 🧠 | **Dr. Chen** | World-class Neurosurgeon |
| 🏆 | **Coach Elite** | Olympic Performance Coach |
| ⚖️ | **Counselor** | Senior Attorney (US & India) |
| 📈 | **Wolf** | 30-Year Wall Street Veteran |
| 💻 | **Dev.AI** | Principal Engineer, MERN Stack |
| 📜 | **Prof. Historia** | World Historian |

Switch by clicking a persona card in the left panel, or say:
> *"Jarvis, activate developer mode"*

---

## 📡 API Reference

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server health check + uptime |
| `POST` | `/api/chat` | REST chat (Socket.io fallback) |
| `GET` | `/api/history/:sessionId` | Load conversation history |
| `GET` | `/api/commands/:sessionId` | OS command execution log |
| `POST` | `/api/auth/enroll` | Enroll voice biometric profile |
| `POST` | `/api/auth/verify` | Verify voice identity |
| `POST` | `/api/transcribe` | Transcribe audio to text |

### Socket.io Events

**Client → Server**

| Event | Payload | Description |
|-------|---------|-------------|
| `user:command` | `{ message, sessionId, expertId }` | Send voice/text command |
| `user:expert_switch` | `{ sessionId, expertId }` | Switch AI persona |
| `user:get_history` | `{ sessionId, limit, skip }` | Load message history |

**Server → Client**

| Event | Payload | Description |
|-------|---------|-------------|
| `jarvis:thinking` | `{ sessionId }` | Processing started |
| `jarvis:searching` | `{ sessionId }` | Web search triggered |
| `jarvis:executing` | `{ action, target }` | OS action running |
| `jarvis:response` | Full response object | Final answer delivered |
| `jarvis:error` | `{ message }` | Error occurred |

---

## 🔧 Troubleshooting

<details>
<summary><b>❌ "Cannot connect to server"</b></summary>

- Ensure the server is running: `cd server && node index.js`
- Check port 5000 is free: `netstat -ano | findstr :5000`
- Verify `server/.env` has correct `PORT` and `MONGODB_URI` values
</details>

<details>
<summary><b>🎤 "Voice recognition not working"</b></summary>

- Use **Chrome** or **Edge** — Firefox/Safari have limited Web Speech API support
- Allow microphone permissions when prompted by the browser
- Check microphone: Windows Settings → Privacy & Security → Microphone
- The Electron overlay serves on `http://localhost:3456` (secure context)
</details>

<details>
<summary><b>🗄️ "MongoDB connection failed"</b></summary>

- Ensure MongoDB service is running: open `services.msc` → find MongoDB → Start
- Test connection: `mongosh mongodb://localhost:27017`
- Check MongoDB logs: `C:\Program Files\MongoDB\Server\7.0\log\`
- Alternatively, switch to MongoDB Atlas (cloud) and update `MONGODB_URI`
</details>

<details>
<summary><b>🐍 "Python executor errors"</b></summary>

- Verify Python is in PATH: `python --version`
- Install requirements: `pip install -r python/requirements.txt`
- For `pyautogui` issues on Windows: `pip install pyautogui pillow`
- Test manually: `python python/executor.py "{\"action\":\"take_screenshot\",\"target\":\"\",\"details\":{}}"`
</details>

<details>
<summary><b>🤖 "AI API errors (Gemini/Claude)"</b></summary>

- Verify API key in `server/.env`
- Gemini free tier: check quota at [aistudio.google.com](https://aistudio.google.com)
- Claude: check billing at [console.anthropic.com](https://console.anthropic.com)
- The key must have access to `gemini-1.5-flash` or `claude-sonnet-4-5`
</details>

<details>
<summary><b>💬 "WhatsApp automation not working"</b></summary>

- First run opens WhatsApp Web — scan the QR code once
- Chrome profile saved at `python/whatsapp_profile/` (git-ignored, personal data)
- Subsequent runs use the saved session (no QR scan needed)
- Ensure Chrome/Chromium is installed and `chromedriver` matches Chrome version
</details>

<details>
<summary><b>⚡ "Electron overlay not launching"</b></summary>

- Install electron: `cd electron && npm install`
- Launch: `cd electron && npx electron .`
- Check port 3456 is free (used for serving `assistant.html`)
- Global shortcut to activate: `Ctrl+Shift+Space`
</details>

---

## 🛠️ Development

```bash
# Run both server and client
npm run dev

# Server only
npm run server

# Client only (React HUD)
npm run client

# Install all dependencies
npm run install:all

# Install Python dependencies
npm run install:python

# Test Python executor directly
python python/executor.py "{\"action\":\"take_screenshot\",\"target\":\"\",\"details\":{}}"
```

---

## 🔒 Security Notes

> ⚠️ **Important before sharing or deploying:**

- **Never commit `.env` files** — they contain API keys and secrets
- The `.gitignore` already excludes all `.env` files
- `python/whatsapp_profile/` contains session cookies — **never share**
- `python/voice_profiles/` contains biometric data — **never share**
- The Python executor can run system commands — restrict network exposure
- Change `SESSION_SECRET` to a long random string before deployment
- Consider adding rate limiting and IP whitelisting for production

---

## 🧱 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + Vite 5 | Iron Man HUD interface |
| **Styling** | Vanilla CSS + CSS Variables | Holographic theme |
| **Animations** | Framer Motion | Smooth UI transitions |
| **Icons** | Lucide React | UI icons |
| **Face Auth** | face-api.js | Biometric enrollment |
| **Backend** | Node.js + Express 4 | REST + Socket API |
| **Real-time** | Socket.io 4 | Bidirectional events |
| **Database** | MongoDB + Mongoose | Conversation persistence |
| **AI Brain** | Google Gemini / Anthropic Claude | Language model |
| **OS Control** | Python 3 + PyAutoGUI | System automation |
| **Web Automation** | Selenium + WebDriver | WhatsApp, browser control |
| **Desktop App** | Electron | Floating overlay |
| **Security** | Helmet.js + CORS | HTTP hardening |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is for personal and educational use. All AI API usage must comply with respective provider terms of service.

---

<div align="center">

*"Shall I run the startup sequence, sir?"* — **J.A.R.V.I.S.**

**⭐ Star this repo if JARVIS impressed you!**

</div>
