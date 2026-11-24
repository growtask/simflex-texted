<?php

/**
 * Сборка Ted без Node.js.
 *
 *   php bin/build.php
 *
 * Склеивает ES-модули из resources/js/ и blocks/ в один dist/ted.js (обычный <script>, без type="module"),
 * поведение блоков на сайте — в dist/content.js, стили — в dist/ted.css. dist/ted.vw.css копируется отдельно —
 * он подключается только на vw-сайтах. Шрифты, плитки и значки копируются в dist/ — сайт и CMS публикуют только dist/.
 *
 * Правила для исходников, чтобы сборка работала:
 *   - импорты однострочные: import { a, b } from './x.js';
 *   - экспорт только перед объявлением: export const / export function / export class;
 *   - имена верхнего уровня не повторяются между файлами (сборка проверяет).
 *
 * Список модулей, стилей и блоков — bin/build.json. Тест (bin/test.php) сверяет dist/ в git со сборкой из исходников.
 */

$root = dirname(__DIR__);

// Список модулей (порядок важен: зависимости раньше зависимых), стилей и блоков
$cfg = json_decode(file_get_contents(__DIR__ . '/build.json'), true);
// Блоки из папок (этап 5): build.json → blocks; метки раскрываются в файлы блоков, которые есть в папке
$blocks = $cfg['blocks'] ?? [];
function expandBlocks(array $list, array $blocks, string $root): array
{
    $kinds = ['@blocks' => ['.js', '.editor.js'], '@blocks.site' => ['.site.css'], '@blocks.editor' => ['.editor.css'], '@blocks.content' => ['.site.js']];
    $out = [];
    foreach ($list as $item) {
        if (!isset($kinds[$item])) {
            $out[] = $item;
            continue;
        }
        foreach ($blocks as $b) {
            if (!is_file("$root/blocks/$b/block.json")) {
                fwrite(STDERR, "Нет blocks/$b/block.json (build.json → blocks)\n");
                exit(1);
            }
            foreach ($kinds[$item] as $suffix) {
                if (is_file("$root/blocks/$b/$b$suffix")) {
                    $out[] = "blocks/$b/$b$suffix";
                }
            }
        }
    }
    return $out;
}
$modules = expandBlocks($cfg['modules'], $blocks, $root);
$styles = expandBlocks($cfg['styles'], $blocks, $root);
$contentModules = expandBlocks($cfg['content'], $blocks, $root);

$version = '0.0.0';
if (preg_match("/const VERSION = '([^']+)'/", file_get_contents("$root/resources/js/index.js"), $m)) {
    $version = $m[1];
}
$banner = "/*! Ted $version — блочный редактор SimflexCMS, лицензия MIT. Собрано " . date('Y-m-d H:i') . " */\n";

// ---------- JS ----------
// Склейка модулей в один скрипт; имена верхнего уровня не повторяются
function joinModules(array $list, string $root, string $banner): string
{
    $seen = [];
    $parts = [];
    foreach ($list as $rel) {
        $code = file_get_contents("$root/$rel");
        if ($code === false) {
            fwrite(STDERR, "Нет файла: $rel\n");
            exit(1);
        }
        $code = preg_replace('/^\x{FEFF}/u', '', $code);
        // описание блока: import X from './block.json' with { type: 'json' }; → const X = <содержимое block.json>;
        $dir = dirname($rel);
        $code = preg_replace_callback("/^\s*import\s+([A-Za-z_$][\w$]*)\s+from\s+'([^']+\.json)'\s+with\s*\{\s*type:\s*'json'\s*\}\s*;\s*$/m", static function ($m) use ($root, $dir) {
            $json = trim(preg_replace('/^\x{FEFF}/u', '', (string) file_get_contents("$root/$dir/" . $m[2])));
            return "const {$m[1]} = $json;";
        }, $code);
        // убираем импорты
        $code = preg_replace('/^\s*import\s[^;]*;\s*(?:\/\/[^\n]*)?$/m', '', $code);
        if (preg_match('/^\s*import[\s{\'"]/m', $code)) {
            fwrite(STDERR, "Не вырезан import в $rel — импорт должен быть однострочным\n");
            exit(1);
        }
        // export default X; → удаляем, export const/function/class → без export
        $code = preg_replace('/^export default [^;]*;\s*$/m', '', $code);
        $code = preg_replace('/^export\s+(const|let|function|class|async function)\b/m', '$1', $code);

        if (preg_match_all('/^(?:const|let|function|class|async function)\s+([A-Za-z_$][\w$]*)/m', $code, $names)) {
            foreach ($names[1] as $name) {
                if (isset($seen[$name])) {
                    fwrite(STDERR, "Повтор имени '$name' в $rel и {$seen[$name]}\n");
                    exit(1);
                }
                $seen[$name] = $rel;
            }
        }
        $parts[] = "// ---- $rel ----\n" . trim($code) . "\n";
    }

    return $banner . "(function () {\n'use strict';\n\n" . implode("\n", $parts) . "\n})();\n";
}
$js = joinModules($modules, $root, $banner);
$contentJs = str_replace('/*! Ted ', '/*! Ted content ', joinModules($contentModules, $root, $banner));

// ---------- Документация блоков (этап 5): таблицы в blocks/<тип>/README.md и blocks/README.md — из block.json ----------
function blockDocRows(array $d): string
{
    $code = static fn($s) => '`' . $s . '`';
    $rows = [];
    $kindText = !empty($d['variants']) ? implode(', ', array_map(static fn($v) => $code($v['type']), $d['variants'])) : $code($d['type']);
    $rows[] = ['Вид', $kindText . (!empty($d['aliases']) ? ', другие имена: ' . implode(', ', array_map($code, $d['aliases'])) : '')];
    if (!empty($d['text'])) {
        $rows[] = ['Текстовый блок', 'да (правку ведёт текстовый движок ядра)'];
    }
    if (!empty($d['core'])) {
        $rows[] = ['Правку ведёт ядро', implode(', ', array_map($code, $d['core']))];
    }
    $rows[] = ['Название', $d['title'] ?? ''];
    if (!empty($d['menu'])) {
        $m = $d['menu'];
        $rows[] = ['Меню', '«' . $m['group'] . '»' . (!empty($m['after']) ? ', после ' . $code($m['after']) : '') . (!empty($m['icon']) ? ', значок ' . $code($m['icon']) : '') . ', «Превратить в…»: ' . (($m['convert'] ?? true) === false ? 'нет' : 'да')];
    }
    $rows[] = ['Блок без текста', !empty($d['object']) ? 'да' : 'нет'];
    if (!empty($d['markdown'])) {
        $rows[] = ['Markdown', $code($d['markdown']) . ' + Enter'];
    }
    if (!empty($d['hotkey'])) {
        $rows[] = ['Горячая клавиша', $code($d['hotkey']['keys'])];
    }
    $html = [];
    foreach (($d['html'] ?? []) as $tag => $attrs) {
        $html[] = $code($tag) . ($attrs ? ' (' . implode(', ', $attrs) . ')' : '');
    }
    $rows[] = ['Белый список', $html ? implode(', ', $html) : '—'];
    $rows[] = ['В наборе без блока', ($d['degrade'] ?? '') === 'drop' ? 'исчезает' : (($d['degrade'] ?? '') === 'children' ? 'остаются вложенные абзацы' : 'становится текстом')];
    if (!empty($d['figma'])) {
        $rows[] = ['Макет Figma', $d['figma']];
    }
    $out = "| Поле | Значение |\n|---|---|\n";
    foreach ($rows as [$k, $v]) {
        $out .= "| $k | $v |\n";
    }
    return $out;
}
function replaceBetween(string $file, string $name, string $body): void
{
    $text = (string) file_get_contents($file);
    $re = '/(<!-- ' . $name . ':begin[^>]*-->\n)[\s\S]*?(<!-- ' . $name . ':end -->)/';
    if (!preg_match($re, $text)) {
        fwrite(STDERR, "Нет меток $name:begin / $name:end в $file\n");
        exit(1);
    }
    $new = preg_replace_callback($re, static fn($m) => $m[1] . $body . $m[2], $text, 1);
    if ($new !== $text) {
        file_put_contents($file, $new);
    }
}
$index = "| Блок | Вид | Группа меню | Документация |\n|---|---|---|---|\n";
foreach ($blocks as $b) {
    $d = json_decode((string) file_get_contents("$root/blocks/$b/block.json"), true);
    replaceBetween("$root/blocks/$b/README.md", 'block.json', blockDocRows($d));
    $index .= '| ' . ($d['title'] ?? $b) . ' | `' . $b . '` | ' . ($d['menu']['group'] ?? '—') . " | [$b/README.md]($b/README.md) |\n";
}
replaceBetween("$root/blocks/README.md", 'blocks', $index);

// ---------- CSS ----------
// dist/ самодостаточна: шрифты, плитки и значки лежат рядом (dist/fonts, dist/tiles, dist/icons) — адреса
// ../fonts/ и т. п. из исходников (resources/css, blocks/*) становятся fonts/ (от dist/ted.css)
const ASSET_DIRS = ['fonts', 'tiles', 'icons'];
function distUrls(string $css): string
{
    return (string) preg_replace('~url\((["\']?)(?:\.\./)+(' . implode('|', ASSET_DIRS) . ')/~', 'url($1$2/', $css);
}
$css = $banner;
foreach ($styles as $rel) {
    $css .= "\n/* ---- $rel ---- */\n" . distUrls((string) file_get_contents("$root/$rel"));
}

if (!is_dir("$root/dist")) {
    mkdir("$root/dist", 0775, true);
}
file_put_contents("$root/dist/ted.js", $js);
file_put_contents("$root/dist/ted.css", $css);
file_put_contents("$root/dist/content.js", $contentJs);   // для сайта: плеер аудио, вкладки, содержание и др.
file_put_contents("$root/dist/ted.vw.css", $banner . distUrls((string) file_get_contents("$root/resources/css/ted.vw.css")));
// копии resources/fonts, tiles, icons; лишние файлы в dist/<папка> удаляются
foreach (ASSET_DIRS as $dir) {
    $from = "$root/resources/$dir";
    $to = "$root/dist/$dir";
    if (!is_dir($to)) {
        mkdir($to, 0775, true);
    }
    $names = array_map('basename', glob("$from/*") ?: []);
    foreach (glob("$to/*") ?: [] as $old) {
        if (!in_array(basename($old), $names, true)) {
            unlink($old);
        }
    }
    foreach ($names as $name) {
        if (!is_file("$to/$name") || md5_file("$to/$name") !== md5_file("$from/$name")) {
            copy("$from/$name", "$to/$name");
        }
    }
}

printf("dist/ted.js      %6.1f КБ\n", strlen($js) / 1024);
printf("dist/ted.css     %6.1f КБ\n", strlen($css) / 1024);
printf("dist/ted.vw.css  %6.1f КБ\n", filesize("$root/dist/ted.vw.css") / 1024);
echo "Готово: Ted $version\n";
