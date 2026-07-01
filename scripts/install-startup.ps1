# ─────────────────────────────────────────────────────────────────────────────
# JARVIS Auto-Startup Installer v3
# Compatible with Windows PowerShell 5.1+ and PowerShell 7+
# Uses schtasks.exe — works on ALL Windows versions
# Run as Administrator
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Continue"

# ── Paths ────────────────────────────────────────────────────────────────────
$JarvisRoot = Split-Path -Parent $PSScriptRoot
$ServerDir  = Join-Path $JarvisRoot "server"
$ClientDir  = Join-Path $JarvisRoot "client"
$LogDir     = Join-Path $JarvisRoot "logs"

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

Write-Host ""
Write-Host "  J.A.R.V.I.S  Auto-Startup Installer v3" -ForegroundColor Cyan
Write-Host "  ==========================================" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "  JARVIS Root : $JarvisRoot" -ForegroundColor Gray
Write-Host "  Server Dir  : $ServerDir"  -ForegroundColor Gray
Write-Host "  Client Dir  : $ClientDir"  -ForegroundColor Gray
Write-Host "  Log Dir     : $LogDir"      -ForegroundColor Gray
Write-Host ""

# ── Find Node.js ─────────────────────────────────────────────────────────────
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Host "  [ERROR] node.exe not found in PATH. Install Node.js first." -ForegroundColor Red
    exit 1
}
$NodePath = $NodeCmd.Source
Write-Host "  Node.js : $NodePath" -ForegroundColor Green

# ── Create batch wrapper files ────────────────────────────────────────────────

# Batch 1: Start server (runs immediately at login)
$ServerLog    = Join-Path $LogDir "server.log"
$ServerBat    = Join-Path $LogDir "start_server.bat"
$ServerBatContent = "@echo off`r`ncd /d `"$ServerDir`"`r`nnode index.js >> `"$ServerLog`" 2>&1`r`n"
[System.IO.File]::WriteAllText($ServerBat, $ServerBatContent, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] Created: $ServerBat" -ForegroundColor DarkGreen

# Batch 2: Start Vite client (waits 8 seconds first)
$ClientLog    = Join-Path $LogDir "client.log"
$ClientBat    = Join-Path $LogDir "start_client.bat"
$ClientBatContent = "@echo off`r`ntimeout /t 8 /nobreak > nul`r`ncd /d `"$ClientDir`"`r`nnpm run dev >> `"$ClientLog`" 2>&1`r`n"
[System.IO.File]::WriteAllText($ClientBat, $ClientBatContent, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] Created: $ClientBat" -ForegroundColor DarkGreen

# Batch 3: Open Chrome minimized (waits 16 seconds first)
$ChromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
$ChromePath = $null
foreach ($p in $ChromePaths) {
    if (Test-Path $p) { $ChromePath = $p; break }
}

$BrowserBat = Join-Path $LogDir "start_browser.bat"
if ($ChromePath) {
    $BrowserBatContent = "@echo off`r`ntimeout /t 16 /nobreak > nul`r`nstart `"`" `"$ChromePath`" --new-window --start-minimized `"http://localhost:5173`"`r`n"
} else {
    # Fallback: use default browser via start command
    $BrowserBatContent = "@echo off`r`ntimeout /t 16 /nobreak > nul`r`nstart `"`" `"http://localhost:5173`"`r`n"
}
[System.IO.File]::WriteAllText($BrowserBat, $BrowserBatContent, [System.Text.Encoding]::ASCII)
Write-Host "  [OK] Created: $BrowserBat" -ForegroundColor DarkGreen
Write-Host ""

# ── Register with schtasks.exe (works on ALL Windows + PowerShell versions) ──

# Remove old tasks silently first (ignore errors if tasks don't exist yet)
$ErrorActionPreference = "SilentlyContinue"
schtasks /Delete /TN "JARVIS_Server"  /F 2>&1 | Out-Null
schtasks /Delete /TN "JARVIS_Client"  /F 2>&1 | Out-Null
schtasks /Delete /TN "JARVIS_Browser" /F 2>&1 | Out-Null
$ErrorActionPreference = "Continue"

# Task 1: Server — runs at logon, no delay (delay is in the bat)
$result = schtasks /Create /TN "JARVIS_Server" /TR "`"$ServerBat`"" /SC ONLOGON /RL LIMITED /F 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] JARVIS_Server task registered" -ForegroundColor Green
} else {
    Write-Host "  [WARN] JARVIS_Server: $result" -ForegroundColor Yellow
}

# Task 2: Client — runs at logon (8s delay built into bat file)
$result = schtasks /Create /TN "JARVIS_Client" /TR "`"$ClientBat`"" /SC ONLOGON /RL LIMITED /F 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] JARVIS_Client task registered (8s delay built-in)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] JARVIS_Client: $result" -ForegroundColor Yellow
}

# Task 3: Browser — runs at logon (16s delay built into bat file)
$result = schtasks /Create /TN "JARVIS_Browser" /TR "`"$BrowserBat`"" /SC ONLOGON /RL LIMITED /F 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  [OK] JARVIS_Browser task registered (16s delay built-in)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] JARVIS_Browser: $result" -ForegroundColor Yellow
}

# ── Verify tasks were actually created ───────────────────────────────────────
Write-Host ""
Write-Host "  Verifying registered tasks..." -ForegroundColor Gray
$tasks = @("JARVIS_Server", "JARVIS_Client", "JARVIS_Browser")
$allOk = $true
foreach ($task in $tasks) {
    $check = schtasks /Query /TN $task 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [VERIFIED] $task" -ForegroundColor Cyan
    } else {
        Write-Host "  [MISSING]  $task - registration may have failed" -ForegroundColor Red
        $allOk = $false
    }
}

Write-Host ""
Write-Host "  ========================================================" -ForegroundColor DarkCyan
if ($allOk) {
    Write-Host "  JARVIS auto-startup installed successfully!" -ForegroundColor Cyan
} else {
    Write-Host "  Some tasks failed. Try running as Administrator." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  On next login, automatically:" -ForegroundColor White
Write-Host "   1. JARVIS server starts silently (instant)"               -ForegroundColor Gray
Write-Host "   2. Vite client starts silently (8s delay)"                -ForegroundColor Gray
Write-Host "   3. Chrome opens http://localhost:5173 minimized (16s)"    -ForegroundColor Gray
Write-Host "   4. Face detection auto-authenticates you"                  -ForegroundColor Gray
Write-Host "   5. Say 'Hello JARVIS' to pop up the assistant"            -ForegroundColor Gray
Write-Host ""
Write-Host "  Logs:"                                                      -ForegroundColor White
Write-Host "   Server : $ServerLog"                                       -ForegroundColor Gray
Write-Host "   Client : $ClientLog"                                       -ForegroundColor Gray
Write-Host ""
Write-Host "  To uninstall, run: uninstall-startup.ps1"                  -ForegroundColor DarkGray
Write-Host ""
