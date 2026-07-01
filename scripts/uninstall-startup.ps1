# ─────────────────────────────────────────────────────────────────────────────
# JARVIS Auto-Startup Uninstaller
# Run as Administrator
# ─────────────────────────────────────────────────────────────────────────────

$tasks = @("JARVIS_Server", "JARVIS_Client", "JARVIS_Browser")

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
Write-Host "  All JARVIS startup tasks removed." -ForegroundColor Cyan
Write-Host "  JARVIS will no longer auto-start on login." -ForegroundColor Gray
Write-Host ""
