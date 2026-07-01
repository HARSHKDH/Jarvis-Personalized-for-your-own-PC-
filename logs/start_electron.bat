@echo off
:: Wait for Vite client to be ready
timeout /t 20 /nobreak > nul
"C:\Users\hkhan\OneDrive\Desktop\JARVIS\electron\node_modules\electron\dist\electron.exe" "C:\Users\hkhan\OneDrive\Desktop\JARVIS\electron" --no-sandbox
