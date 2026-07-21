# Keeps matrex-scan.duckdns.org pointed at this network's current public
# IP. Rogers cable doesn't guarantee a permanently static IP even though
# it's a real (non-CGNAT) address, so this checks in periodically rather
# than assuming it never changes. DuckDNS's update endpoint is idempotent
# and safe to call even when the IP hasn't changed.
#
# Token lives in data/duckdns-token.txt (gitignored, same pattern as
# admin-key.txt/ingest-key.txt) rather than hardcoded here, since this
# repo is public — a token committed in plain text would be visible to
# anyone.
$domain = "matrex-scan"
$token = (Get-Content "$PSScriptRoot\data\duckdns-token.txt" -Raw).Trim()
$logFile = "$PSScriptRoot\duckdns.log"

while ($true) {
    try {
        $result = Invoke-WebRequest -Uri "https://www.duckdns.org/update?domains=$domain&token=$token&ip=" -TimeoutSec 15 -UseBasicParsing
        # .Content comes back as a raw byte[] rather than a decoded string in
        # this PowerShell version when the response has no recognized text
        # content-type — decode explicitly or the log fills with byte codes
        # ("79 75") instead of the actual "OK"/"KO" response text.
        $text = [System.Text.Encoding]::UTF8.GetString($result.Content)
        $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $logFile -Value "$stamp - $text"
    } catch {
        $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Add-Content -Path $logFile -Value "$stamp - FAILED: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds 300
}
