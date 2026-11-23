# Снимок расположения содержимого (сайт и редактор) в окнах 320 / 414 / 768 / 1000 / 1920 — страховка при переносе отступов.
#   pwsh -File tools/layout-snapshot.ps1 -OutFile before.txt   →   правка, сборка   →   -OutFile after.txt   →   fc.exe before.txt after.txt
# Страница tests/layout-snapshot.html записывает, где стоит каждая строка текста, картинка, таблица, линия (относительно начала содержимого).
# Нужен Edge или Chrome. Свой сервер поднимается и останавливается сам.

param([Parameter(Mandatory = $true)][string]$OutFile, [int]$Port = 8181, [int[]]$Widths = @(320, 414, 768, 1000, 1920))

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'Не найден Edge или Chrome' -ForegroundColor Red; exit 2 }

$server = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port -PassThru -WindowStyle Hidden
$prof = Join-Path ([IO.Path]::GetTempPath()) ('ted-layout-' + [guid]::NewGuid().ToString('N'))
try {
  for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest "http://localhost:$Port/tests/layout-snapshot.html" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }
  $w = ($Widths -join ",")
  $out = & $browser --headless=new --disable-gpu --no-first-run --edge-skip-compat-layer-relaunch --user-data-dir="$prof" --window-size=2000,1000 --virtual-time-budget=120000 --dump-dom "http://localhost:$Port/tests/layout-snapshot.html?w=$w" 2>&1 | Out-String
  $m = [regex]::Match($out, 'SNAP-BEGIN?
(.*?)?
SNAP-END', 'Singleline')
  if (-not $m.Success) { Write-Host "Снимок не получен"; exit 1 }
  $text = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
  [IO.File]::WriteAllText((Join-Path (Get-Location) $OutFile), $text, (New-Object Text.UTF8Encoding($false)))
  Write-Host ('Снимок: ' + (($text -split "`n").Count) + ' строк → ' + $OutFile)
} finally {
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path $prof) { Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue }
}
