<?php

declare(strict_types=1);

/**
 * Снимки — страховка при перестановке и чистке CSS и отступов: до правки и после должны совпасть.
 *
 *   php bin/snapshot.php css before.txt       вычисленные стили интерфейса (tests/css-snapshot.html: блоки, состояния,
 *                                             две темы, ширины 1000 / 860 / 768 / 414 — хеш свойств каждого элемента)
 *   php bin/snapshot.php layout before.txt    расположение содержимого (tests/layout-snapshot.html, сайт и редактор)
 *       [--widths=320,414,768,1000,1920]
 *   …правка, php bin/build.php, снимок в after.txt…   затем сравнить файлы (git diff --no-index before.txt after.txt)
 *
 * Сборка dist/ — до снимка (страницы работают на ней). Нужен Chrome, Chromium или Edge (TED_BROWSER).
 */

namespace Simflex\Texted\Tools;

require __DIR__ . '/lib.php';

useUtf8Console();
[$options, $positional] = parseArgs($argv);
$kind = $positional[0] ?? '';
$outFile = $positional[1] ?? '';
if (!in_array($kind, ['css', 'layout'], true) || $outFile === '') {
    echo "Запуск: php bin/snapshot.php css|layout <файл> [--widths=320,414,768,1000,1920]\n";
    exit(2);
}
$browser = findBrowser();
if ($browser === null) {
    echo "Не найден Chrome, Chromium или Edge (укажите путь в TED_BROWSER)\n";
    exit(2);
}
$port = getFreePort((int) ($options['port'] ?? 8182));
$server = startServer($port, getRoot() . '/bin/serve.php');
try {
    if ($kind === 'css') {
        $dom = dumpDom($browser, "http://127.0.0.1:$port/tests/css-snapshot.html", 240000);
    } else {
        $widths = is_string($options['widths'] ?? null) ? $options['widths'] : '320,414,768,1000,1920';
        $dom = dumpDom($browser, "http://127.0.0.1:$port/tests/layout-snapshot.html?w=" . rawurlencode($widths), 120000, '2000,1000');
    }
} finally {
    stopProcess($server);
}
// снимок — несколько мегабайт: без регулярных выражений (у них лимит на длину)
$begin = strpos($dom, 'SNAP-BEGIN');
$end = $begin === false ? false : strpos($dom, 'SNAP-END', $begin);
if ($begin === false || $end === false) {
    echo "Снимок не получен\n";
    exit(1);
}
$body = trim(substr($dom, $begin + strlen('SNAP-BEGIN'), $end - $begin - strlen('SNAP-BEGIN')), "\r\n");
$text = html_entity_decode(str_replace("\r\n", "\n", $body), ENT_QUOTES | ENT_HTML5, 'UTF-8');
file_put_contents($outFile, $text);
echo 'Снимок: ' . count(explode("\n", $text)) . " строк → $outFile\n";
