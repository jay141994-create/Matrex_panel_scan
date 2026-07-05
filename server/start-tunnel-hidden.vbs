Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server"
shell.Run "cmd /c """"c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server\bin\cloudflared.exe"" tunnel --url http://localhost:8765 >> tunnel.log 2>&1""", 0, False
