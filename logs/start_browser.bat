@echo off
timeout /t 30 /nobreak > nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --new-window --start-minimized "http://localhost:5173"
