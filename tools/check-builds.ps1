# Сборка на PHP (tools/build.php) и на PowerShell (tools/build.ps1) должна давать одинаковые файлы (кроме строки с датой).
#   pwsh -File tools/check-builds.ps1      код выхода 0 — одинаковы, 1 — различаются, 0 с пометкой — PHP не найден.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$php = & (Join-Path $PSScriptRoot 'find-php.ps1')
if (-not $php) { Write-Host '  PHP не найден — проверка пропущена' -ForegroundColor Yellow; exit 0 }
$dist = Join-Path $root 'dist'
$files = @('ted.js', 'ted.css', 'ted.vw.css', '..\content.js', '..\blocks\README.md')
# таблицы «Описание» в README блоков тоже собирают оба сборщика (этап 5)
$cfgBlocks = (Get-Content (Join-Path $PSScriptRoot 'build.json') -Raw -Encoding UTF8 | ConvertFrom-Json).blocks
foreach ($b in $cfgBlocks) { $files += "..\blocks\$b\README.md" }
$copyName = { param($f) 'ps-' + ($f -replace '[\\/.]+', '_') }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('ted-build-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host '  Сборка PowerShell (build.ps1) не прошла' -ForegroundColor Red; exit 1 }
  foreach ($f in $files) { Copy-Item (Join-Path $dist $f) (Join-Path $tmp (& $copyName $f)) }
  & $php (Join-Path $PSScriptRoot 'build.php') | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host '  Сборка PHP (build.php) не прошла' -ForegroundColor Red; exit 1 }
  $bad = @()
  foreach ($f in $files) {
    $a = (Get-Content (Join-Path $tmp (& $copyName $f)) -Raw -Encoding UTF8) -split "`r?`n" | Select-Object -Skip 1
    $b = (Get-Content (Join-Path $dist $f) -Raw -Encoding UTF8) -split "`r?`n" | Select-Object -Skip 1
    if (($a -join "`n").Trim() -ne ($b -join "`n").Trim()) { $bad += $f }
  }
  # оставляем в dist результат PowerShell-сборки (основной)
  & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'build.ps1') | Out-Null
  if ($bad) { Write-Host ('  Сборки различаются: ' + ($bad -join ', ')) -ForegroundColor Red; exit 1 }
  Write-Host ('  build.php и build.ps1 дают одинаковые файлы (PHP: ' + (& $php -r 'echo PHP_VERSION;') + ')')
} finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
