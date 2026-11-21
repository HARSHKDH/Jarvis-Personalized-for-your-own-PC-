@echo off
title J.A.R.V.I.S. Boot Sequence
color 03
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║        J.A.R.V.I.S. v5.0  Starting          ║
echo  ║        Powered by Google Gemini AI           ║
echo  ╚══════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── [1/3] Start JARVIS Neural Server ───────────────────────────────
echo  [1/3] Starting JARVIS Server (port 5000)...
start "JARVIS-Server" /min cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 5 /nobreak > nul

:: ── [2/3] Start Electron Assistant ─────────────────────────────────
:: Use npm start instead of npx to avoid "path-to-app" resolution error
echo  [2/3] Starting JARVIS Assistant (Electron)...
start "JARVIS-Assistant" /min cmd /k "cd /d "%~dp0electron" && npm start"
timeout /t 3 /nobreak > nul

:: ── [3/3] Start Web Client ──────────────────────────────────────────
:: NOTE: Open browser manually at http://localhost:5173
:: The Vite dev server does NOT auto-open the browser (open:false in vite.config.js)
echo  [3/3] Starting JARVIS Web Client (port 5173)...
start "JARVIS-Client" /min cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║  ✅ All systems nominal.                     ║
echo  ║  Neural Server  : http://localhost:5000      ║
echo  ║  Web HUD        : http://localhost:5173      ║
echo  ║  Assistant      : Running in background      ║
echo  ║  Wake word      : "Hello JARVIS" / "Jarvis"  ║
echo  ║  Hotkey         : Ctrl+Shift+Space           ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  Web HUD is available — open Chrome and go to:
echo  http://localhost:5173
echo.
timeout /t 5 /nobreak > nul
exit
