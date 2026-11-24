# Запуск автотестов без участия человека: свой сервер + headless Edge/Chrome, результат в консоль, код выхода 0 / 1.
#   pwsh -File tools/test.ps1                новые наборы по этапам (MODULAR_PLAN.md) по порядку: layer → drag → rhythm → server → presets → security (tests/run.html) → config (php/test-config.php) → presets на PHP (php/test-presets.php) → безопасность на PHP (test-sanitize, test-opengraph, test-security).
#   pwsh -File tools/test.ps1 -Full          то же + сборка на PHP и её равенство с PowerShell-сборкой и PHP-загрузка файлов на демо-сервере.
#   -Suite layer                             один набор (layer, drag, rhythm, server, presets, security; config — PHP-проверка настроек этапа 1; presets и security идут и в браузере, и на PHP)
#   -Only "слово"                            только тесты, в названии которых есть слово
# Старые наборы (tests/index.html, tests/dist.html, tests/walkthrough-all.html) отключены 19.11: их заменяют новые наборы по этапам;
# файлы оставлены, пока их проверки не перенесены в новые наборы.
# Нужен установленный Edge или Chrome (в продукте они не используются — только для проверки).

param([int]$Port = 8180, [string]$Only = '', [string]$Suite = '', [switch]$Full)

[Console]::OutputEncoding = [Text.Encoding]::UTF8   # страница отдаёт UTF-8 (кириллица в заголовке и сводке)
$OutputEncoding = [Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'Не найден Edge или Chrome' -ForegroundColor Red; exit 2 }

function Invoke-Page([string]$url, [int]$budget = 900000) {
  $temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  $prof = Join-Path $temp ('ted-tests-' + [guid]::NewGuid().ToString('N'))
  try {
    # virtual-time-budget ускоряет таймеры страницы: тесты, которые ждут анимации, идут быстро
    # --edge-skip-compat-layer-relaunch: Edge 157+ после обновления Windows перезапускает себя вторым процессом, и --dump-dom уходит в него (тесты «не завершались»)
    $out = & $browser --headless=new --disable-gpu --no-first-run --edge-skip-compat-layer-relaunch --user-data-dir="$prof" --window-size=1200,900 --virtual-time-budget=$budget --dump-dom $url 2>&1 | Out-String
    if ($env:TED_TEST_DEBUG) { Write-Host ("dom length: " + $out.Length); Write-Host ($out.Substring(0, [Math]::Min(600, $out.Length))) }
    $title = [regex]::Match($out, '<title>(.*?)</title>', 'Singleline').Groups[1].Value.Trim()
    $summary = [regex]::Match($out, '<p id="summary"[^>]*>(.*?)</p>', 'Singleline').Groups[1].Value.Trim()
    $fails = [regex]::Matches($out, '<li class="fail">(.*?)</li>', 'Singleline') | ForEach-Object { ($_.Groups[1].Value -replace '<[^>]+>', ' ' -replace '\s+', ' ').Trim() }
    if ($fails) { Write-Host 'Не прошли:' -ForegroundColor Red; $fails | ForEach-Object { Write-Host "  $_" } }
    Write-Host $summary
    if ($title -like '*Все тесты прошли*') { return $true }
    if (-not $summary -or $summary -eq 'Запуск…') { Write-Host 'Тесты не завершились (увеличьте virtual-time-budget или запустите вручную)' -ForegroundColor Yellow }
    return $false
  } finally {
    if (Test-Path -LiteralPath $prof) {
      $resolved = (Resolve-Path -LiteralPath $prof).ProviderPath
      if ([IO.Path]::GetDirectoryName($resolved) -eq $temp.TrimEnd([IO.Path]::DirectorySeparatorChar) -and
          [IO.Path]::GetFileName($resolved) -match '^ted-tests-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

# сначала сборка: тесты сайта (CSP) и демо работают на dist/ — упавшая сборка не должна пройти незаметно
& (Get-Process -Id $PID).Path -NoProfile -File (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host 'Сборка (tools/build.ps1) не прошла — тесты не запускаются' -ForegroundColor Red; exit 1 }
# порт занят (другая программа взяла его, например, для исходящего соединения) — берём свободный, иначе тесты «не завершаются»
function Test-PortFree([int]$p) { try { $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $p); $l.Start(); $l.Stop(); $true } catch { $false } }
if (-not (Test-PortFree $Port)) {
  $l = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0); $l.Start(); $free = $l.LocalEndpoint.Port; $l.Stop()
  Write-Host "Порт $Port занят — тесты на порту $free" -ForegroundColor Yellow
  $Port = $free
}
$server =Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoProfile', '-File', ('"' + (Join-Path $PSScriptRoot 'serve.ps1') + '"'), '-Port', $Port -PassThru -WindowStyle Hidden
try {
  for ($i = 0; $i -lt 20; $i++) { try { Invoke-WebRequest "http://localhost:$Port/tests/run.html" -UseBasicParsing -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }   # ждём, пока сервер поднимется
  $suites = if ($Suite) { @($Suite -split ',' | Where-Object { $_ -ne 'config' }) } else { 'layer', 'drag', 'rhythm', 'server', 'presets', 'security', 'styles', 'blocks' }   # порядок — как в tests/run.html
  $good = $true
  foreach ($name in $suites) {
    Write-Host ("Набор $name" + ':')
    $url = "http://localhost:$Port/tests/run.html?suite=$name"
    if ($Only) { $url += '&only=' + [Uri]::EscapeDataString($Only) }
    $good = (Invoke-Page $url) -and $good
  }
  # этап 1: настройки сервера и папка файлов (PHP, меньше секунды) — в каждом прогоне
  if (-not $Only -and (-not $Suite -or $Suite -match 'config')) {
    Write-Host 'Набор config (PHP: ted.config.php, папка файлов, удаление только внутри папки):'
    $phpConfig = & (Join-Path $PSScriptRoot 'find-php.ps1')
    if ($phpConfig) { & $phpConfig (Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/php/test-config.php'); if ($LASTEXITCODE -ne 0) { $good = $false } }
    else { Write-Host '  PHP не найден — пропущено' -ForegroundColor Yellow }
  }
  # этап 2: наборы и право на правку на сервере (PHP) — те же примеры, что в наборе presets
  if (-not $Only -and (-not $Suite -or $Suite -match 'presets')) {
    Write-Host 'Набор presets на PHP (очистка по набору, право на правку):'
    $phpPresets = & (Join-Path $PSScriptRoot 'find-php.ps1')
    if ($phpPresets) { & $phpPresets (Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/php/test-presets.php'); if ($LASTEXITCODE -ne 0) { $good = $false } }
    else { Write-Host '  PHP не найден — пропущено' -ForegroundColor Yellow }
  }
  # этап 5: реестр блоков на сервере (blocks/<тип>/block.json)
  if (-not $Only -and (-not $Suite -or $Suite -match 'blocks')) {
    Write-Host 'Набор blocks на PHP (реестр блоков, block.json):'
    $phpBlocks = & (Join-Path $PSScriptRoot 'find-php.ps1')
    if ($phpBlocks) { & $phpBlocks (Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/php/test-blocks.php'); if ($LASTEXITCODE -ne 0) { $good = $false } }
    else { Write-Host '  PHP не найден — пропущено' -ForegroundColor Yellow }
  }
  # этап 3: безопасность на сервере (PHP, пара секунд) — в каждом прогоне: очистка (векторы XSS, адреса, белый список
  # = браузер), карточка по ссылке (внутренние адреса, закрепление IP), загрузка и лимит частоты
  if (-not $Only -and (-not $Suite -or $Suite -match 'security')) {
    $phpSec = & (Join-Path $PSScriptRoot 'find-php.ps1')
    if ($phpSec) {
      foreach ($t in @(@('PHP: серверная очистка HTML (векторы XSS, адреса, белый список):', 'tests/php/test-sanitize.php'), @('PHP: запросы сервера наружу (внутренние адреса, закрепление IP):', 'tests/php/test-opengraph.php'), @('PHP: загрузка и лимит частоты:', 'tests/php/test-security.php'), @('PHP: файловый менеджер в демо (пакет simflex-file-manager, пути, выход из корня):', 'tools/test-fm-demo.php'))) {
        Write-Host $t[0]
        & $phpSec (Join-Path (Split-Path -Parent $PSScriptRoot) $t[1]); if ($LASTEXITCODE -ne 0) { $good = $false }
      }
    } else { Write-Host '  PHP не найден — пропущено' -ForegroundColor Yellow }
  }
  if ($Full -and -not $Only) {
    Write-Host 'Сборка на PHP и равенство с PowerShell-сборкой:'
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'check-builds.ps1'); if ($LASTEXITCODE -ne 0) { $good = $false }
    Write-Host 'PHP: загрузка файлов:'
    $php = & (Join-Path $PSScriptRoot 'find-php.ps1')
    if ($php) { & pwsh -NoProfile -File (Join-Path (Split-Path -Parent $PSScriptRoot) 'tests/upload.test.ps1') -Php $php; if ($LASTEXITCODE -ne 0) { $good = $false } }
    else { Write-Host '  PHP не найден — пропущено' -ForegroundColor Yellow }
  }
  if ($good) { exit 0 } else { exit 1 }
} finally {
  if ($server) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
