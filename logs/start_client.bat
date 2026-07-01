@echo off
:: Wait for the server to come up first
timeout /t 12 /nobreak > nul
:: Clear stale Vite dep-cache (prevents ERR_CACHE_READ_FAILURE on startup)
if exist "C:\Users\hkhan\OneDrive\Desktop\JARVIS\client\node_modules\.vite" rd /s /q "C:\Users\hkhan\OneDrive\Desktop\JARVIS\client\node_modules\.vite"
cd /d "C:\Users\hkhan\OneDrive\Desktop\JARVIS\client"
npm run dev >> "C:\Users\hkhan\OneDrive\Desktop\JARVIS\logs\client.log" 2>&1
