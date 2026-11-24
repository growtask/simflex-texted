# Снимок вычисленных стилей интерфейса Ted — страховка при перестановке и чистке CSS.
#   pwsh -File tools/css-snapshot.ps1 -OutFile before.txt     # до правки CSS (после сборки dist)
#   ...правка resources/css/..., сборка...
#   pwsh -File tools/css-snapshot.ps1 -OutFile after.txt
#   fc.exe before.txt after.txt                                # пусто = внешний вид не изменился
# Страница tests/css-snapshot.html перебирает блоки, состояния (курсор в каждом блоке, перетаскивание, окна, меню, режим просмотра),
# две темы и ширины 1000 / 860 / 768 / 414 и пишет хеш всех вычисленных свойств каждого элемента и его ::before/::after.
# Нужен Edge или Chrome. Свой сервер поднимается и останавливается сам.

param([Parameter(Mandatory = $true)][string]$OutFile, [int]$Port = 8182)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'Не найден Edge или Chrome' -ForegroundColor Red; exit 2 }

$server = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port -PassThru -WindowStyle Hidden
$prof = Join-Path ([IO.Path]::GetTempPath()) ('ted-snap-' + [guid]::NewGuid().ToString('N'))
try {
  for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest "http://localhost:$Port/tests/css-snapshot.html" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }
  $out = & $browser --headless=new --disable-gpu --no-first-run --edge-skip-compat-layer-relaunch --user-data-dir="$prof" --window-size=1200,900 --virtual-time-budget=240000 --dump-dom "http://localhost:$Port/tests/css-snapshot.html" 2>&1 | Out-String
  $m = [regex]::Match($out, 'SNAP-BEGIN\r?\n(.*?)\r?\nSNAP-END', 'Singleline')
  if (-not $m.Success) { Write-Host 'Снимок не получен'; exit 1 }
  $text = [System.Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
  [IO.File]::WriteAllText((Join-Path (Get-Location) $OutFile), $text, (New-Object Text.UTF8Encoding($false)))
  Write-Host ('Снимок: ' + (($text -split "`n").Count) + ' строк → ' + $OutFile)
} finally {
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
  if (Test-Path $prof) { Remove-Item $prof -Recurse -Force -ErrorAction SilentlyContinue }
}
