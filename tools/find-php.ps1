# Путь к php.exe или пустая строка. Ищет в PATH, затем в обычных местах установки на Windows (WinGet, C:\php, Program Files).
$c = Get-Command php -ErrorAction SilentlyContinue
if ($c) { $c.Source; return }
$dirs = @(
  "$env:LOCALAPPDATA\Programs\PHP",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages",
  'C:\php', 'C:\tools\php', "$env:ProgramFiles\PHP"
)
foreach ($d in $dirs) {
  if (-not (Test-Path $d)) { continue }
  $f = Get-ChildItem $d -Filter php.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($f) { $f.FullName; return }
}
