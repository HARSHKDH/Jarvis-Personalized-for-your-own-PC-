# Resolve the project root from this script's location (scripts/..) so the
# installer works from any clone, not just one machine.
$projectRoot = Split-Path -Parent $PSScriptRoot
$startupFolder = [System.Environment]::GetFolderPath('Startup')
$vbsPath = Join-Path $projectRoot 'jarvis-autostart.vbs'
$shortcutPath = Join-Path $startupFolder 'JARVIS-Autostart.lnk'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = 'wscript.exe'
$shortcut.Arguments = '"' + $vbsPath + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = 'JARVIS AI Assistant Auto-Start'
$shortcut.Save()

Write-Host "✅ JARVIS Autostart installed successfully!"
Write-Host "   Shortcut: $shortcutPath"
Write-Host "   Targets : $vbsPath"
Write-Host ""
Write-Host "JARVIS will now launch automatically every time you log into Windows."
