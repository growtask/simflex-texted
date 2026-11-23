# Пересобрать tests/presets/vectors.json — общие примеры наборов для браузера и PHP (этап 2 MODULAR_PLAN.md).
#   pwsh -File tools/make-preset-vectors.ps1
# Страница tests/presets/make-vectors.html берёт сохранённый HTML всех блоков (как его отдаёт редактор) и для каждого
# набора записывает, что от него остаётся (браузер: restrictBlocks). PHP (php/presets.php) обязан давать то же самое —
# это проверяет php/test-presets.php. Пересобирать, только когда меняются блоки или правила превращения в текст.

param([int]$Port = 8181)

[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'Не найден Edge или Chrome' -ForegroundColor Red; exit 2 }

$server = Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port -PassThru -WindowStyle Hidden
$prof = Join-Path ([IO.Path]::GetTempPath()) ('ted-tests-' + [guid]::NewGuid().ToString('N'))
try {
  for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest "http://localhost:$Port/tests/run.html" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }
  $out = & $browser --headless=new --disable-gpu --no-first-run --edge-skip-compat-layer-relaunch --user-data-dir="$prof" --window-size=1200,900 --virtual-time-budget=60000 --dump-dom "http://localhost:$Port/tests/presets/make-vectors.html" 2>&1 | Out-String
  $m = [regex]::Match($out, '<pre id="out">(.*?)</pre>', 'Singleline')
  if (-not $m.Success -or $m.Groups[1].Value -eq '…') { Write-Host 'Страница не собрала примеры' -ForegroundColor Red; exit 1 }
  $json = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value)
  $null = $json | ConvertFrom-Json   # проверка, что это JSON
  $file = Join-Path $root 'tests/presets/vectors.json'
  [IO.File]::WriteAllText($file, $json + "`n", [Text.UTF8Encoding]::new($false))
  Write-Host "Записано: $file"
} finally {
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $prof -Recurse -Force -ErrorAction SilentlyContinue
}
