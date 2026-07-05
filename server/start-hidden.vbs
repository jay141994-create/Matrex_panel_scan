Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server"
shell.Run "cmd /c """"C:\Program Files\nodejs\node.exe"" server.js >> server.log 2>&1""", 0, False
