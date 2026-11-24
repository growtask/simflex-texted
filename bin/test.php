<?php

declare(strict_types=1);

/**
 * Автотесты без участия человека: сборка, свой сервер php -S, браузер без окна (Chrome, Chromium или Edge), PHP-проверки.
 * Результат — в консоль, код выхода 0 (всё прошло) или 1.
 *
 *   php bin/test.php                  сборка, наборы tests/run.html по порядку (layer → drag → rhythm → server → presets →
 *                                     security → styles → blocks) и PHP-проверки (tests/php/)
 *   php bin/test.php --full           то же + dist/ в git = сборка из исходников, загрузка файлов на демо-сервере
 *   php bin/test.php --suite=layer    один набор (несколько — через запятую; config — только PHP-проверка настроек)
 *   php bin/test.php --only="слово"   только тесты, в названии которых есть слово (без PHP-проверок)
 *   php bin/test.php --port=8180      порт сервера (занят — берётся свободный)
 *
 * Браузер: TED_BROWSER или установленный Chrome / Chromium / Edge (Windows, Linux, macOS).
 */

namespace Simflex\Texted\Tools;

require __DIR__ . '/lib.php';

const SUITES = ['layer', 'drag', 'rhythm', 'server', 'presets', 'security', 'styles', 'blocks'];   // как в tests/run.html

/**
 * PHP-проверки по наборам: набор → [[подпись, файл], …]
 *
 * @return array<string, array<int, array{0: string, 1: string}>>
 */
function getPhpChecks(): array
{
    return [
        'config' => [['Набор config (PHP: ted.config.php, папка файлов, удаление только внутри папки):', 'tests/php/test-config.php']],
        'presets' => [['Набор presets на PHP (очистка по набору, право на правку):', 'tests/php/test-presets.php']],
        'blocks' => [['Набор blocks на PHP (реестр блоков, block.json):', 'tests/php/test-blocks.php']],
        'security' => [
            ['PHP: серверная очистка HTML (векторы XSS, адреса, белый список):', 'tests/php/test-sanitize.php'],
            ['PHP: запросы сервера наружу (внутренние адреса, закрепление IP):', 'tests/php/test-opengraph.php'],
            ['PHP: загрузка и лимит частоты:', 'tests/php/test-security.php'],
            ['PHP: файловый менеджер в демо (пакет simflex-file-manager, пути, выход из корня):', 'tests/php/test-fm-demo.php'],
        ],
    ];
}

/** Итог набора со страницы tests/run.html: заголовок, сводка, упавшие тесты */
function reportSuite(string $dom): bool
{
    $title = preg_match('~<title>(.*?)</title>~s', $dom, $m) ? trim(html_entity_decode($m[1])) : '';
    $summary = preg_match('~<p id="summary"[^>]*>(.*?)</p>~s', $dom, $m) ? trim(html_entity_decode(strip_tags($m[1]))) : '';
    preg_match_all('~<li class="fail">(.*?)</li>~s', $dom, $fails);
    if ($fails[1]) {
        echo "Не прошли:\n";
        foreach ($fails[1] as $fail) {
            echo '  ' . trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($fail)))) . "\n";
        }
    }
    echo $summary, "\n";
    if (str_contains($title, 'Все тесты прошли')) {
        return true;
    }
    if ($summary === '' || $summary === 'Запуск…') {
        echo "Тесты не завершились (страница не дождалась конца — запустите набор ещё раз или откройте tests/run.html)\n";
    }
    return false;
}

/**
 * dist/ в git = сборка из закоммиченных исходников (кроме строки с датой сборки). Пока исходники не закоммичены,
 * сравнивать не с чем — проверка пропускается с пометкой.
 */
function checkDistInGit(): bool
{
    $root = getRoot();
    $git = static function (array $args) use ($root): array {
        $process = proc_open(['git', '-C', $root, ...$args], [1 => ['pipe', 'w'], 2 => ['file', getNullDevice(), 'a']], $pipes);
        if (!is_resource($process)) {
            return [1, ''];
        }
        $output = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        return [proc_close($process), $output];
    };
    [$code, $changed] = $git(['status', '--porcelain', '--', 'resources', 'blocks', 'bin/build.json', 'bin/build.php']);
    if ($code !== 0) {
        echo "  git недоступен — проверка пропущена\n";
        return true;
    }
    if (trim($changed) !== '') {
        echo "  исходники изменены и не закоммичены — сравнивать dist/ не с чем, проверка пропущена\n";
        return true;
    }
    [, $tracked] = $git(['ls-files', '--', 'dist']);
    $bad = [];
    $files = array_filter(explode("\n", trim($tracked)));
    foreach ($files as $file) {
        [, $committed] = $git(['show', 'HEAD:' . $file]);
        $built = (string) @file_get_contents($root . '/' . $file);
        $skipBanner = static fn(string $text) => preg_replace('/\A[^\n]*Собрано[^\n]*\n/u', '', str_replace("\r\n", "\n", $text));
        if ($skipBanner($committed) !== $skipBanner($built)) {
            $bad[] = $file;
        }
    }
    $builtFiles = [];
    foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root . '/dist', \FilesystemIterator::SKIP_DOTS)) as $item) {
        $builtFiles[] = 'dist/' . str_replace('\\', '/', substr($item->getPathname(), strlen($root . '/dist/')));
    }
    $bad = array_merge($bad, array_diff($builtFiles, $files));
    if ($bad) {
        echo '  dist/ в git не совпадает со сборкой: ' . implode(', ', $bad) . " — закоммитьте собранную dist/\n";
        return false;
    }
    echo '  dist/ в git = сборка из исходников (' . count($files) . " файлов)\n";
    return true;
}

useUtf8Console();
[$options] = parseArgs($argv);
$only = is_string($options['only'] ?? null) ? $options['only'] : '';
$suiteOption = is_string($options['suite'] ?? null) ? $options['suite'] : '';
$isFull = isset($options['full']);
$selected = $suiteOption !== '' ? array_map('trim', explode(',', $suiteOption)) : [...SUITES, 'config'];
$root = getRoot();

// сначала сборка: тесты сайта (CSP) и демо работают на dist/ — упавшая сборка не должна пройти незаметно
$build = proc_open([PHP_BINARY, $root . '/bin/build.php'], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $root);
$buildOutput = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
if (proc_close($build) !== 0) {
    echo "Сборка (bin/build.php) не прошла — тесты не запускаются\n", $buildOutput;
    exit(1);
}

$good = true;
$browserSuites = array_values(array_intersect($selected, SUITES));
if ($browserSuites) {
    $browser = findBrowser();
    if ($browser === null) {
        echo "Не найден Chrome, Chromium или Edge (укажите путь в TED_BROWSER)\n";
        exit(2);
    }
    $preferred = (int) ($options['port'] ?? 8180);
    $port = getFreePort($preferred);
    if ($port !== $preferred) {
        echo "Порт $preferred занят — тесты на порту $port\n";
    }
    $server = startServer($port, $root . '/bin/serve.php');
    try {
        foreach ($browserSuites as $name) {
            echo "Набор $name:\n";
            $url = "http://127.0.0.1:$port/tests/run.html?suite=" . rawurlencode($name) . ($only !== '' ? '&only=' . rawurlencode($only) : '');
            $good = reportSuite(dumpDom($browser, $url)) && $good;
        }
    } finally {
        stopProcess($server);
    }
}

if ($only === '') {
    foreach (getPhpChecks() as $suite => $checks) {
        if (!in_array($suite, $selected, true)) {
            continue;
        }
        foreach ($checks as [$caption, $file]) {
            echo $caption, "\n";
            $good = runPhp($root . '/' . $file) === 0 && $good;
        }
    }
    if ($isFull) {
        echo "dist/ в git и сборка из исходников:\n";
        $good = checkDistInGit() && $good;
        echo "PHP: загрузка файлов на демо-сервере:\n";
        $good = runPhp($root . '/tests/php/test-upload.php') === 0 && $good;
    }
}
exit($good ? 0 : 1);
