@echo off
title J.A.R.V.I.S. System Startup
color 03

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║      J.A.R.V.I.S. INITIALIZING...       ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: ── Kill stale processes ──────────────────────────────────────────────────────
echo  [0/4] Cleaning up stale processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do taskkill /PID %%a /F >nul 2>&1

:: ── Clear stale Vite cache ────────────────────────────────────────────────────
echo  [1/4] Clearing Vite cache...
if exist "%~dp0client\node_modules\.vite" rd /s /q "%~dp0client\node_modules\.vite" >nul 2>&1

:: ── Start JARVIS Server (stays running in its own window) ────────────────────
echo  [2/4] Starting JARVIS server (port 5000)...
start "JARVIS-Server" cmd /k "cd /d "%~dp0server" && node index.js"
timeout /t 5 /nobreak >nul

:: ── Start Vite Client (stays running in its own window) ───────────────────────
echo  [3/4] Starting JARVIS client (port 5173)...
start "JARVIS-Client" cmd /k "cd /d "%~dp0client" && npm run dev"
timeout /t 8 /nobreak >nul

:: ── Open browser ──────────────────────────────────────────────────────────────
echo  [4/4] Opening browser...
start "" "http://localhost:5173"

:: ── Launch Electron HUD (optional floating pill) ──────────────────────────────
set "ELECTRON_EXE=%~dp0electron\node_modules\electron\dist\electron.exe"
set "APP_DIR=%~dp0electron"
if exist "%ELECTRON_EXE%" (
    start "JARVIS-Electron" "%ELECTRON_EXE%" "%APP_DIR%" --no-sandbox
)

echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   JARVIS is online. DO NOT CLOSE the    ║
echo  ║   JARVIS-Server and JARVIS-Client       ║
echo  ║   windows or JARVIS will stop working.  ║
echo  ╠══════════════════════════════════════════╣
echo  ║  Server  : http://localhost:5000         ║
echo  ║  Client  : http://localhost:5173         ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
