# =============================================================================
# JARVIS Startup Fix - FINAL VERSION
# Uses HKCU Registry Run keys (no admin needed) + VBScript for silent launch
# Fixes: ERR_CACHE_READ_FAILURE (Vite cache) + Electron path-to-app error
# =============================================================================

$ErrorActionPreference = "Continue"

$JarvisRoot  = "C:\Users\hkhan\OneDrive\Desktop\JARVIS"
$ServerDir   = Join-Path $JarvisRoot "server"
$ClientDir   = Join-Path $JarvisRoot "client"
$ElectronDir = Join-Path $JarvisRoot "electron"
$LogDir      = Join-Path $JarvisRoot "logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Write-Host ""
Write-Host "  JARVIS Startup Fix (No Admin Required)" -ForegroundColor Cyan
Write-Host "  ========================================" -ForegroundColor DarkCyan
Write-Host ""

# Step 1: Remove broken .bat.txt file
$BrokenTxt = Join-Path $JarvisRoot "start_jarvis.bat.txt"
if (Test-Path $BrokenTxt) {
    Remove-Item $BrokenTxt -Force
    Write-Host "  [FIXED] Deleted start_jarvis.bat.txt (was opening in Notepad)" -ForegroundColor Green
}

# Step 2: Create the batch files
$ServerLog  = Join-Path $LogDir "server.log"
$ClientLog  = Join-Path $LogDir "client.log"

# Server batch — just runs node
$ServerBat = Join-Path $LogDir "start_server.bat"
Set-Content -Path $ServerBat -Encoding ASCII -Value "@echo off
cd /d `"$ServerDir`"
node index.js >> `"$ServerLog`" 2>&1"

# Client batch — clears Vite cache FIRST, then starts Vite dev server
# The cache clear prevents ERR_CACHE_READ_FAILURE after PC cold boot / OneDrive sync
$ClientBat = Join-Path $LogDir "start_client.bat"
Set-Content -Path $ClientBat -Encoding ASCII -Value "@echo off
:: Wait for the server to come up first
timeout /t 12 /nobreak > nul
:: Clear stale Vite dep-cache (prevents ERR_CACHE_READ_FAILURE on startup)
if exist `"$ClientDir\node_modules\.vite`" rd /s /q `"$ClientDir\node_modules\.vite`"
cd /d `"$ClientDir`"
npm run dev >> `"$ClientLog`" 2>&1"

# Electron batch — passes the real app directory, not the literal string 'path-to-app'
$ElectronExe = Join-Path $ElectronDir "node_modules\electron\dist\electron.exe"
$ElectronBat = Join-Path $LogDir "start_electron.bat"
Set-Content -Path $ElectronBat -Encoding ASCII -Value "@echo off
:: Wait for Vite client to be ready
timeout /t 20 /nobreak > nul
`"$ElectronExe`" `"$ElectronDir`" --no-sandbox"

$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $ChromePath)) {
    $ChromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}

$BrowserBat = Join-Path $LogDir "start_browser.bat"
if (Test-Path $ChromePath) {
    Set-Content -Path $BrowserBat -Encoding ASCII -Value "@echo off
timeout /t 30 /nobreak > nul
start `"`" `"$ChromePath`" --new-window --start-minimized `"http://localhost:5173`""
} else {
    Set-Content -Path $BrowserBat -Encoding ASCII -Value "@echo off
timeout /t 30 /nobreak > nul
start `"`" `"http://localhost:5173`""
}

Write-Host "  [OK] Batch files created" -ForegroundColor DarkGreen

# Step 3: Create VBScript wrappers (completely hidden - no black CMD window)
$ServerVbs   = Join-Path $LogDir "run_server.vbs"
$ClientVbs   = Join-Path $LogDir "run_client.vbs"
$ElectronVbs = Join-Path $LogDir "run_electron.vbs"
$BrowserVbs  = Join-Path $LogDir "run_browser.vbs"

Set-Content -Path $ServerVbs -Encoding ASCII -Value "Set WshShell = CreateObject(""WScript.Shell"")
WshShell.Run ""cmd /c """"$ServerBat"""""", 0, False"

Set-Content -Path $ClientVbs -Encoding ASCII -Value "Set WshShell = CreateObject(""WScript.Shell"")
WshShell.Run ""cmd /c """"$ClientBat"""""", 0, False"

Set-Content -Path $ElectronVbs -Encoding ASCII -Value "Set WshShell = CreateObject(""WScript.Shell"")
WshShell.Run ""cmd /c """"$ElectronBat"""""", 0, False"

Set-Content -Path $BrowserVbs -Encoding ASCII -Value "Set WshShell = CreateObject(""WScript.Shell"")
WshShell.Run ""cmd /c """"$BrowserBat"""""", 0, False"

Write-Host "  [OK] VBScript silent launchers created" -ForegroundColor DarkGreen

# Step 4: Register in HKCU\Run (no admin, always runs on battery/AC, at login)
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Set-ItemProperty -Path $RegPath -Name "JARVIS_Server"   -Value "wscript.exe /nologo `"$ServerVbs`""
Set-ItemProperty -Path $RegPath -Name "JARVIS_Client"   -Value "wscript.exe /nologo `"$ClientVbs`""
Set-ItemProperty -Path $RegPath -Name "JARVIS_Electron" -Value "wscript.exe /nologo `"$ElectronVbs`""
Set-ItemProperty -Path $RegPath -Name "JARVIS_Browser"  -Value "wscript.exe /nologo `"$BrowserVbs`""

# Remove any old JARVIS_Browser entry that had shorter delay
$ErrorActionPreference = "SilentlyContinue"
Remove-ItemProperty -Path $RegPath -Name "JARVIS_Browser_old" -ErrorAction SilentlyContinue
$ErrorActionPreference = "Continue"

Write-Host "  [OK] JARVIS_Server   added to startup registry" -ForegroundColor Green
Write-Host "  [OK] JARVIS_Client   added to startup registry" -ForegroundColor Green
Write-Host "  [OK] JARVIS_Electron added to startup registry" -ForegroundColor Green
Write-Host "  [OK] JARVIS_Browser  added to startup registry" -ForegroundColor Green

# Step 5: Delete old broken schtasks
$ErrorActionPreference = "SilentlyContinue"
schtasks /Delete /TN "JARVIS_Server"  /F 2>&1 | Out-Null
schtasks /Delete /TN "JARVIS_Client"  /F 2>&1 | Out-Null
schtasks /Delete /TN "JARVIS_Browser" /F 2>&1 | Out-Null
$ErrorActionPreference = "Continue"
Write-Host "  [OK] Removed old broken scheduled tasks" -ForegroundColor DarkGreen

# Step 6: Verify registry entries
Write-Host ""
Write-Host "  Verifying startup registry entries..." -ForegroundColor Gray
$reg = Get-ItemProperty $RegPath
$ok = $true
foreach ($name in @("JARVIS_Server","JARVIS_Client","JARVIS_Electron","JARVIS_Browser")) {
    if ($reg.$name) {
        Write-Host "  [VERIFIED] $name -> $($reg.$name)" -ForegroundColor Cyan
    } else {
        Write-Host "  [MISSING]  $name" -ForegroundColor Red
        $ok = $false
    }
}

Write-Host ""
Write-Host "  ========================================================" -ForegroundColor DarkCyan
if ($ok) {
    Write-Host "  SUCCESS! JARVIS will now auto-start on every login." -ForegroundColor Green
    Write-Host ""
    Write-Host "  On next login (no windows will flash/appear):" -ForegroundColor White
    Write-Host "   Instant : JARVIS server starts silently in background"  -ForegroundColor Gray
    Write-Host "   +12s    : React UI (Vite) starts - cache cleared first" -ForegroundColor Gray
    Write-Host "   +20s    : Electron floating HUD launches (tray icon)"   -ForegroundColor Gray
    Write-Host "   +30s    : Chrome opens MINIMISED at localhost:5173"      -ForegroundColor Gray
    Write-Host "   No more ERR_CACHE_READ_FAILURE errors!"                  -ForegroundColor Green
    Write-Host "   Works on BATTERY and AC power!"                          -ForegroundColor Cyan
} else {
    Write-Host "  Some entries failed. Try running as Administrator." -ForegroundColor Yellow
}
Write-Host ""
pause
