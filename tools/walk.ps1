# Обход всех блоков на выбранных ширинах и темах (без полного набора):
#   pwsh -File tools/walk.ps1 -Widths 320,414 -Themes light,dark
param([int[]]$Widths = @(320, 414, 768, 860, 1000, 1366, 1920, 3840), [string[]]$Themes = @('light', 'dark'), [int]$Port = 8141)
$ErrorActionPreference = 'Stop'
$ted = Split-Path -Parent $PSScriptRoot
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
$server = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port -PassThru -WindowStyle Hidden
Start-Sleep -Milliseconds 1500
$good = $true
try {
  foreach ($theme in $Themes) {
    foreach ($w in $Widths) {
      $prof = Join-Path ([IO.Path]::GetTempPath()) ('ted-walk-' + [guid]::NewGuid().ToString('N'))
      $out = & $browser --headless=new --disable-gpu --no-first-run --edge-skip-compat-layer-relaunch --user-data-dir="$prof" --window-size=1200,900 --virtual-time-budget=400000 --dump-dom "http://localhost:$Port/tests/walkthrough-all.html?w=$w&theme=$theme" 2>&1 | Out-String
      Remove-Item -Recurse -Force $prof -ErrorAction SilentlyContinue
      $summary = [regex]::Match($out, '<p id="summary"[^>]*>(.*?)</p>', 'Singleline').Groups[1].Value.Trim()
      Write-Host "$w px, $theme : $summary"
      [regex]::Matches($out, '<li class="fail">(.*?)</li>', 'Singleline') | Select-Object -First 15 | ForEach-Object { Write-Host ('  ' + ($_.Groups[1].Value -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim()) }
      if ($summary -notlike '*Все тесты прошли*') { $good = $false }
    }
  }
} finally { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
if ($good) { exit 0 } else { exit 1 }
