# Версия texted для публикации на GitHub (решение заказчика 22.11): собирает dist/ и копирует пакет в ../../publish/github/.
#   pwsh -File ted/tools/publish.ps1           — сборка + копия (папка publish/github собирается заново, руками её не править)
#   pwsh -File ted/tools/publish.ps1 -Test     — сначала автотесты (tools/test.ps1 -Full), публикация только если они прошли
# В копию не попадают рабочие документы (они в _work/), настройки и файлы демо (ted.config.php, uf/), временные файлы.
param([switch]$Test)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot                       # ted/
$out = Join-Path (Split-Path -Parent $root) 'publish/github'   # TextEd/publish/github

if ($Test) {
  & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'test.ps1') -Full
  if ($LASTEXITCODE -ne 0) { Write-Host 'Тесты не прошли — публикация отменена' -ForegroundColor Red; exit 1 }
} else {
  & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'build.ps1')
  if ($LASTEXITCODE -ne 0) { Write-Host 'Сборка не прошла — публикация отменена' -ForegroundColor Red; exit 1 }
}

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null

# что не публикуем: временные и личные файлы
$skip = '\.(bak|cur|tmp|log)$|(^|[\\/])(node_modules|\.git|\.claude)([\\/]|$)|(^|[\\/])ted\.config\.php$'
Get-ChildItem $root -Recurse -File | ForEach-Object {
  $rel = $_.FullName.Substring($root.Length + 1)
  if ($rel -match $skip) { return }
  $dest = Join-Path $out $rel
  New-Item -ItemType Directory -Force (Split-Path -Parent $dest) | Out-Null
  Copy-Item $_.FullName $dest
}

$version = ([regex]::Match((Get-Content (Join-Path $root 'src/index.js') -Raw), "const VERSION = '([^']+)'")).Groups[1].Value
$count = (Get-ChildItem $out -Recurse -File).Count
Write-Host "Опубликовано: texted $version, файлов: $count → $out" -ForegroundColor Green
if (-not (Test-Path (Join-Path $root 'LICENSE'))) { Write-Host 'Нет файла LICENSE — выберите лицензию до публикации' -ForegroundColor Yellow }
