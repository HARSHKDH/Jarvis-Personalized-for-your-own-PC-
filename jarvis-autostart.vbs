' ═══════════════════════════════════════════════════════════════════════════
'  J.A.R.V.I.S. — Silent Auto-Start (single, race-free launcher)
' ═══════════════════════════════════════════════════════════════════════════
'  Launch order:
'    [1] Python Flask OS server  (port 5001)  — OS ops, recording, WhatsApp
'    [2] Electron overlay        — which itself starts, with proper port
'                                   checks + wait-for-port:
'                                     • Node server  (port 5000)
'                                     • Vite client  (port 5173  — full HUD)
'
'  IMPORTANT: Do NOT also start the Node server / Vite client here.
'  Electron's startBackendServices() already starts them and waits for the
'  ports to come up. Starting them twice causes EADDRINUSE port conflicts
'  and a flaky boot. One launcher = one source of truth.
' ═══════════════════════════════════════════════════════════════════════════

Set objShell = CreateObject("WScript.Shell")
Set objFSO   = CreateObject("Scripting.FileSystemObject")

Dim rootDir, q
rootDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
q = Chr(34)   ' double-quote character

' ── Paths ──────────────────────────────────────────────────────────────────────
Dim electronExe, electronApp, pythonScript
electronExe  = rootDir & "\electron\node_modules\electron\dist\electron.exe"
electronApp  = rootDir & "\electron"
pythonScript = rootDir & "\python\jarvis_server.py"

' ── Verify electron binary exists ─────────────────────────────────────────────
If Not objFSO.FileExists(electronExe) Then
    MsgBox "JARVIS Error: Electron binary not found at:" & vbCrLf & electronExe & _
           vbCrLf & vbCrLf & "Run: cd electron && npm install", vbCritical, "JARVIS"
    WScript.Quit 1
End If

' ── [1/2] Start Python Flask OS server (port 5001) — hidden, correct quoting ──
'  Produces:  cmd /c python "C:\...\jarvis_server.py"
Dim pyCmd
pyCmd = "cmd /c python " & q & pythonScript & q
objShell.Run pyCmd, 0, False

' Give Flask a moment to bind port 5001 before Electron probes it.
WScript.Sleep 2000

' ── [2/2] Start Electron overlay — it starts Node server + Vite client itself ──
'  Electron auto-starts the Node server (5000) and Vite client (5173), each
'  guarded by a port check + waitForPort, so there is no double-start race.
Dim electronCmd
electronCmd = q & electronExe & q & " " & q & electronApp & q & " --no-sandbox"
objShell.Run electronCmd, 0, False

WScript.Quit 0

