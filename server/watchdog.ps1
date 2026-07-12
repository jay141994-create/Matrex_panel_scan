# Matrex tunnel watchdog — the free Cloudflare quick tunnel has been
# observed dying (silent "control stream failure", stops proxying but
# the process stays alive) roughly every 1-2 hours. This checks the
# tunnel's own health endpoint every 2 minutes and restarts it if it's
# not actually working, so outages self-heal instead of sitting broken
# until someone notices.
$serverDir = "c:\Users\patel\OneDrive\Desktop\ClaudeProject\Matrex_panel_scan_git\server"
$tunnelLog = "$serverDir\tunnel.log"
$currentUrlFile = "$serverDir\current-tunnel-url.txt"

function Get-LatestTunnelUrl {
    if (-not (Test-Path $tunnelLog)) { return $null }
    $match = Select-String -Path $tunnelLog -Pattern "https://[a-zA-Z0-9-]*\.trycloudflare\.com" -AllMatches | Select-Object -Last 1
    if ($match) { return $match.Matches[0].Value }
    return $null
}

function Test-TunnelHealthy($url) {
    if (-not $url) { return $false }
    try {
        $r = Invoke-WebRequest -Uri "$url/health" -TimeoutSec 8 -UseBasicParsing
        return $r.StatusCode -eq 200
    } catch {
        return $false
    }
}

while ($true) {
    $url = Get-LatestTunnelUrl
    $healthy = Test-TunnelHealthy $url

    if ($healthy) {
        Set-Content -Path $currentUrlFile -Value $url -Encoding ascii -NoNewline
    } else {
        # Kill whatever cloudflared is running (dead or not) and start fresh.
        Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
        Remove-Item $tunnelLog -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        wscript.exe "$serverDir\start-tunnel-hidden.vbs"
        Start-Sleep -Seconds 8
        $newUrl = Get-LatestTunnelUrl
        if ($newUrl) { Set-Content -Path $currentUrlFile -Value $newUrl -Encoding ascii -NoNewline }
    }

    Start-Sleep -Seconds 120
}
