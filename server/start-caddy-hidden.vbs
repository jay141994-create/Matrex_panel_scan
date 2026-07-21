Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server"
shell.Run "cmd /c ""C:\Users\patel\AppData\Local\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe run --config Caddyfile >> caddy.log 2>&1""", 0, False
