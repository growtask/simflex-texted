<?php

declare(strict_types=1);

/**
 * Пересобрать tests/presets/vectors.json — общие примеры наборов для браузера и PHP.
 *
 *   php bin/make-preset-vectors.php
 *
 * Страница tests/presets/make-vectors.html берёт сохранённый HTML всех блоков (как его отдаёт редактор) и для каждого
 * набора записывает, что от него остаётся (браузер: restrictBlocks). PHP (src/Presets.php) обязан давать то же самое —
 * это проверяет tests/php/test-presets.php. Пересобирать, только когда меняются блоки или правила превращения в текст.
 */

namespace Simflex\Texted\Tools;

require __DIR__ . '/lib.php';

useUtf8Console();
$browser = findBrowser();
if ($browser === null) {
    echo "Не найден Chrome, Chromium или Edge (укажите путь в TED_BROWSER)\n";
    exit(2);
}
$port = getFreePort(8181);
$server = startServer($port, getRoot() . '/bin/serve.php');
try {
    $dom = dumpDom($browser, "http://127.0.0.1:$port/tests/presets/make-vectors.html", 60000);
} finally {
    stopProcess($server);
}
if (!preg_match('~<pre id="out">(.*?)</pre>~s', $dom, $m) || $m[1] === '…') {
    echo "Страница не собрала примеры\n";
    exit(1);
}
$json = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
json_decode($json, flags: JSON_THROW_ON_ERROR);   // проверка, что это JSON
$file = getRoot() . '/tests/presets/vectors.json';
file_put_contents($file, $json . "\n");
echo "Записано: $file\n";
