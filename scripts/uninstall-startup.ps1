# ─────────────────────────────────────────────────────────────────────────────
# JARVIS Auto-Startup Uninstaller
# Run as Administrator
# ─────────────────────────────────────────────────────────────────────────────

$tasks = @("JARVIS_Server", "JARVIS_Client", "JARVIS_Electron", "JARVIS_Browser")
$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$startupEntries = @("JARVIS_Server", "JARVIS_Client", "JARVIS_Electron", "JARVIS_Browser")

Write-Host ""
Write-Host "  J.A.R.V.I.S  Startup Uninstaller" -ForegroundColor Cyan
Write-Host "  ===================================" -ForegroundColor DarkCyan
Write-Host ""

foreach ($task in $tasks) {
    $result = schtasks /Delete /TN $task /F 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  [REMOVED] $task" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP]    $task - not found or already removed" -ForegroundColor Gray
    }
}

Write-Host ""
foreach ($entry in $startupEntries) {
    if (Get-ItemProperty -Path $regPath -Name $entry -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -Path $regPath -Name $entry -ErrorAction SilentlyContinue
        Write-Host "  [REMOVED] HKCU Run: $entry" -ForegroundColor Green
    } else {
        Write-Host "  [SKIP]    HKCU Run: $entry - not found" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "  All JARVIS startup entries removed." -ForegroundColor Cyan
Write-Host "  JARVIS will no longer auto-start on login." -ForegroundColor Gray
Write-Host ""
