@echo off
title J.A.R.V.I.S. Launcher
color 03

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║        J.A.R.V.I.S. v5.0  Starting          ║
echo  ╚══════════════════════════════════════════════╝
echo.

:: Set the JARVIS root to wherever this .bat file lives
cd /d "%~dp0"
set JARVIS_ROOT=%~dp0

:: Electron binary — installed locally inside /electron/node_modules
set ELECTRON_EXE=%JARVIS_ROOT%electron\node_modules\electron\dist\electron.exe

:: App folder passed explicitly so Electron never misreads the path
set ELECTRON_APP=%JARVIS_ROOT%electron

echo  Checking Electron binary...
if not exist "%ELECTRON_EXE%" (
    echo  [ERROR] Electron not found at: %ELECTRON_EXE%
    echo  Run: cd electron ^&^& npm install
    echo.
    pause
    exit /b 1
)

echo  [OK] Electron binary found.
echo  [OK] App folder: %ELECTRON_APP%
echo.
echo  Launching JARVIS... (Server + Client start automatically inside Electron)
echo.

:: Launch Electron — it auto-starts the server and client internally
start "JARVIS" "%ELECTRON_EXE%" "%ELECTRON_APP%" --no-sandbox

echo  ╔══════════════════════════════════════════════╗
echo  ║  ✅ JARVIS launched!                         ║
echo  ║  The server and client start automatically.  ║
echo  ║  Check system tray for the JARVIS icon.      ║
echo  ║                                              ║
echo  ║  Hotkey : Ctrl+Shift+Space                   ║
echo  ║  HUD    : http://localhost:5173              ║
echo  ╚══════════════════════════════════════════════╝
echo.
timeout /t 5 /nobreak > nul
exit
