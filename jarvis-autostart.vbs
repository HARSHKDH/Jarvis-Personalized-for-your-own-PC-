Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

Dim scriptDir
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

' ── Kill stale processes on ports 5000 and 5173 ──────────────────────────────
objShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":5000"" ^| findstr ""LISTENING""') do taskkill /PID %a /F", 0, True
objShell.Run "cmd /c for /f ""tokens=5"" %a in ('netstat -aon ^| findstr "":5173"" ^| findstr ""LISTENING""') do taskkill /PID %a /F", 0, True

' ── Clear stale Vite cache (prevents ERR_CACHE_READ_FAILURE on boot) ─────────
Dim viteCache
viteCache = scriptDir & "\client\node_modules\.vite"
If objFSO.FolderExists(viteCache) Then
    objShell.Run "cmd /c rd /s /q """ & viteCache & """", 0, True
End If

' ── Start server silently ─────────────────────────────────────────────────────
Dim serverCmd
serverCmd = "cmd /c """ & "cd /d " & Chr(34) & scriptDir & "\server" & Chr(34) & " && node index.js"""
objShell.Run serverCmd, 0, False

WScript.Sleep 4000

' ── Start Vite client silently ────────────────────────────────────────────────
Dim clientCmd
clientCmd = "cmd /c """ & "cd /d " & Chr(34) & scriptDir & "\client" & Chr(34) & " && npm run dev"""
objShell.Run clientCmd, 0, False

WScript.Sleep 6000

' ── Launch Electron with local binary ────────────────────────────────────────
Dim electronExe
electronExe = scriptDir & "\electron\node_modules\electron\dist\electron.exe"

Dim launchCmd
If objFSO.FileExists(electronExe) Then
    ' Pass the app folder as argument — this fixes the "path-to-app" error
    launchCmd = Chr(34) & electronExe & Chr(34) & " " & Chr(34) & scriptDir & "\electron" & Chr(34) & " --no-sandbox"
Else
    launchCmd = "cmd /c """ & "cd /d " & Chr(34) & scriptDir & "\electron" & Chr(34) & " && npx electron . --no-sandbox"""
End If

objShell.Run launchCmd, 0, False
