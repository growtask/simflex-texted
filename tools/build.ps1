# Сборка Ted для Windows без PHP (та же логика, что в tools/build.php).
#   pwsh -File tools/build.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Список модулей и стилей — один на оба сборщика (build.php читает тот же файл)
$cfg = Get-Content (Join-Path $PSScriptRoot 'build.json') -Raw -Encoding UTF8 | ConvertFrom-Json
# Блоки из папок (этап 5): build.json → blocks; метки в списках раскрываются в файлы блоков, которые есть в папке:
#   @blocks → blocks/<тип>/<тип>.js и <тип>.editor.js; @blocks.site → <тип>.site.css; @blocks.editor → <тип>.editor.css;
#   @blocks.content → <тип>.site.js (поведение на сайте, в content.js)
$blocks = @($cfg.blocks)
function Expand-Blocks($list) {
  $out = @()
  $kinds = @{ '@blocks' = @('.js', '.editor.js'); '@blocks.site' = @('.site.css'); '@blocks.editor' = @('.editor.css'); '@blocks.content' = @('.site.js') }
  foreach ($item in $list) {
    if (-not $kinds.ContainsKey($item)) { $out += $item; continue }   # обычный файл — как есть (нет файла — сборка упадёт при чтении)
    foreach ($b in $blocks) {
      if (-not (Test-Path -LiteralPath (Join-Path $root "blocks/$b/block.json"))) { throw "Нет blocks/$b/block.json (build.json → blocks)" }
      foreach ($suffix in $kinds[$item]) { $f = "blocks/$b/$b$suffix"; if (Test-Path -LiteralPath (Join-Path $root $f)) { $out += $f } }
    }
  }
  return $out
}
$modules = Expand-Blocks @($cfg.modules)
$styles = Expand-Blocks @($cfg.styles)
$contentModules = Expand-Blocks @($cfg.content)

$utf8 = New-Object System.Text.UTF8Encoding($false)
$read = { param($rel) [System.IO.File]::ReadAllText((Join-Path $root $rel), $utf8).TrimStart([char]0xFEFF) }

$version = '0.0.0'
$m = [regex]::Match((& $read 'resources/js/index.js'), "const VERSION = '([^']+)'")
if ($m.Success) { $version = $m.Groups[1].Value }
$banner = "/*! Ted $version — блочный редактор SimflexCMS, лицензия MIT. Собрано $(Get-Date -Format 'yyyy-MM-dd HH:mm') */`n"

# Склейка модулей в один скрипт; имена верхнего уровня не повторяются
function Join-Modules($list) {
$seen = @{}
$parts = @()
foreach ($rel in $list) {
  $code = & $read $rel
  # описание блока: import X from './block.json' with { type: 'json' }; → const X = <содержимое block.json>;
  $dir = Split-Path -Parent $rel
  $code = [regex]::Replace($code, "(?m)^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+\.json)'\s+with\s*\{\s*type:\s*'json'\s*\}\s*;\s*$", {
    param($m)
    $json = (& $read (Join-Path $dir $m.Groups[2].Value).Replace('\', '/')).Trim()
    "const $($m.Groups[1].Value) = $json;"
  })
  $code = [regex]::Replace($code, '(?m)^\s*import\s[^;]*;\s*(?://[^\n]*)?$', '')
  if ($code -match '(?m)^\s*import[\s{''"]') { throw "Не вырезан import в $rel — импорт должен быть однострочным" }
  $code = [regex]::Replace($code, '(?m)^export default [^;]*;\s*$', '')
  $code = [regex]::Replace($code, '(?m)^export\s+(const|let|function|class|async function)\b', '$1')
  foreach ($n in [regex]::Matches($code, '(?m)^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)')) {
    $name = $n.Groups[1].Value
    if ($seen.ContainsKey($name)) { throw "Повтор имени '$name' в $rel и $($seen[$name])" }
    $seen[$name] = $rel
  }
  $parts += "// ---- $rel ----`n$($code.Trim())`n"
}

return $banner + "(function () {`n'use strict';`n`n" + ($parts -join "`n") + "`n})();`n"
}
$js = Join-Modules $modules
$contentJs = (Join-Modules $contentModules).Replace('/*! Ted ', '/*! Ted content ')
# dist/ самодостаточна: шрифты, плитки и значки рядом (dist/fonts, tiles, icons) — ../fonts/ и т. п. становятся fonts/
$assetDirs = @('fonts', 'tiles', 'icons')
$distUrls = { param($text) [regex]::Replace($text, "url\(([`"']?)(?:\.\./)+(" + ($assetDirs -join '|') + ')/', 'url($1$2/') }
$css = $banner
foreach ($rel in $styles) { $css += "`n/* ---- $rel ---- */`n" + (& $distUrls (& $read $rel)) }

# ---------- Документация блоков (этап 5): таблицы в blocks/<тип>/README.md и blocks/README.md — из block.json ----------
# (та же логика в build.php; сборки сравнивает tools/check-builds.ps1)
function Get-BlockDocRows($d) {
  $code = { param($s) '`' + $s + '`' }
  $rows = @()
  $alias = ''
  if ($d.aliases -and @($d.aliases).Count) { $alias = ', другие имена: ' + ((@($d.aliases) | ForEach-Object { & $code $_ }) -join ', ') }
  $kindText = if ($d.variants) { ((@($d.variants) | ForEach-Object { & $code $_.type }) -join ', ') } else { (& $code $d.type) }
  $rows += , @('Вид', ($kindText + $alias))
  if ($d.text) { $rows += , @('Текстовый блок', 'да (правку ведёт текстовый движок ядра)') }
  if ($d.core) { $rows += , @('Правку ведёт ядро', ((@($d.core) | ForEach-Object { & $code $_ }) -join ', ')) }
  $rows += , @('Название', [string]$d.title)
  if ($d.menu) {
    $m = $d.menu
    $v = '«' + $m.group + '»'
    if ($m.after) { $v += ', после ' + (& $code $m.after) }
    if ($m.icon) { $v += ', значок ' + (& $code $m.icon) }
    $v += ', «Превратить в…»: ' + $(if ($m.convert -eq $false) { 'нет' } else { 'да' })
    $rows += , @('Меню', $v)
  }
  $rows += , @('Блок без текста', $(if ($d.object) { 'да' } else { 'нет' }))
  if ($d.markdown) { $rows += , @('Markdown', ((& $code $d.markdown) + ' + Enter')) }
  if ($d.hotkey) { $rows += , @('Горячая клавиша', (& $code $d.hotkey.keys)) }
  $html = @()
  if ($d.html) { foreach ($p in $d.html.PSObject.Properties) { $attrs = @($p.Value); $html += (& $code $p.Name) + $(if ($attrs.Count) { ' (' + ($attrs -join ', ') + ')' } else { '' }) } }
  $rows += , @('Белый список', $(if ($html.Count) { $html -join ', ' } else { '—' }))
  $rows += , @('В наборе без блока', $(if ($d.degrade -eq 'drop') { 'исчезает' } elseif ($d.degrade -eq 'children') { 'остаются вложенные абзацы' } else { 'становится текстом' }))
  if ($d.figma) { $rows += , @('Макет Figma', [string]$d.figma) }
  $out = "| Поле | Значение |`n|---|---|`n"
  foreach ($r in $rows) { $out += "| $($r[0]) | $($r[1]) |`n" }
  return $out
}
function Set-Between($file, $name, $body) {
  $text = [System.IO.File]::ReadAllText($file, $utf8)
  $re = "(<!-- $name" + ':begin[^>]*-->\n)[\s\S]*?(<!-- ' + $name + ':end -->)'
  if (-not [regex]::IsMatch($text, $re)) { throw "Нет меток ${name}:begin / ${name}:end в $file" }
  $new = ([regex]$re).Replace($text, { param($m) $m.Groups[1].Value + $body + $m.Groups[2].Value }, 1)
  if ($new -ne $text) { [System.IO.File]::WriteAllText($file, $new, $utf8) }
}
$index = "| Блок | Вид | Группа меню | Документация |`n|---|---|---|---|`n"
foreach ($b in $blocks) {
  $d = (& $read "blocks/$b/block.json") | ConvertFrom-Json
  Set-Between (Join-Path $root "blocks/$b/README.md") 'block.json' (Get-BlockDocRows $d)
  $group = if ($d.menu) { $d.menu.group } else { '—' }
  $title = if ($d.title) { $d.title } else { $b }
  $index += "| $title | ``$b`` | $group | [$b/README.md]($b/README.md) |`n"
}
Set-Between (Join-Path $root 'blocks/README.md') 'blocks' $index

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
[System.IO.File]::WriteAllText((Join-Path $dist 'ted.js'), $js, $utf8)
[System.IO.File]::WriteAllText((Join-Path $dist 'ted.css'), $css, $utf8)
# content.js для сайта (плеер аудио, вкладки, содержание и др.) собирается из тех же модулей, что и редактор
[System.IO.File]::WriteAllText((Join-Path $dist 'content.js'), $contentJs, $utf8)
[System.IO.File]::WriteAllText((Join-Path $dist 'ted.vw.css'), $banner + (& $distUrls (& $read 'resources/css/ted.vw.css')), $utf8)
# копии resources/fonts, tiles, icons; лишние файлы в dist/<папка> удаляются
foreach ($dir in $assetDirs) {
  $from = Join-Path $root "resources/$dir"
  $to = Join-Path $dist $dir
  New-Item -ItemType Directory -Force $to | Out-Null
  $names = @(Get-ChildItem -LiteralPath $from -File | ForEach-Object Name)
  Get-ChildItem -LiteralPath $to -File | Where-Object { $names -notcontains $_.Name } | Remove-Item -Force
  foreach ($name in $names) {
    $src = Join-Path $from $name; $dst = Join-Path $to $name
    if (-not (Test-Path -LiteralPath $dst) -or (Get-FileHash -LiteralPath $src).Hash -ne (Get-FileHash -LiteralPath $dst).Hash) { Copy-Item -LiteralPath $src -Destination $dst -Force }
  }
}

'{0,-16} {1,6:N1} КБ' -f 'dist/ted.js', ($js.Length / 1024)
'{0,-16} {1,6:N1} КБ' -f 'dist/ted.css', ($css.Length / 1024)
"Готово: Ted $version"
