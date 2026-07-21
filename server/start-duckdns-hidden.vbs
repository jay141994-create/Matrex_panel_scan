Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server"
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server\duckdns-updater.ps1""", 0, False
