<?php

declare(strict_types=1);

/**
 * Демо с рабочей загрузкой файлов: проверка сервера, PHP-сервер на 127.0.0.1 и админка в браузере.
 *
 *   php bin/demo.php [--port=8150] [--no-open] [--file-manager=<папка simflex-file-manager>]
 *
 * Нужен PHP 8.4+ с gd и fileinfo (PHP без php.ini — расширения подключаются из папки ext). Папка файлов и настройки —
 * ted.config.php рядом с папкой пакета или TED_CONFIG. Файловый менеджер SimflexCMS в админке («Из библиотеки») —
 * если найден пакет simflex-file-manager (по умолчанию — Документы/GitHub/simflex-file-manager).
 */

namespace Simflex\Texted\Tools;

require __DIR__ . '/lib.php';

useUtf8Console();
[$options] = parseArgs($argv);
$root = getRoot();
$port = getFreePort((int) ($options['port'] ?? 8150));
$phpArgs = [...getPhpArgs(), '-d', 'upload_max_filesize=500M', '-d', 'post_max_size=512M'];

// файловый менеджер: папка пакета передаётся серверу демо переменной окружения (bin/demo/fm-demo.php)
$home = (string) (getenv('USERPROFILE') ?: getenv('HOME'));
$fileManager = is_string($options['file-manager'] ?? null) ? $options['file-manager'] : '';
if ($fileManager === '') {
    foreach ([$home . '/OneDrive/Документы/GitHub', $home . '/Documents/GitHub', $home . '/growtask'] as $dir) {
        if (is_file($dir . '/simflex-file-manager/src/FileManager/Manager.php')) {
            $fileManager = $dir . '/simflex-file-manager';
            break;
        }
    }
}
$fileManager = $fileManager !== '' && is_file($fileManager . '/src/FileManager/Manager.php') ? (string) realpath($fileManager) : '';
echo $fileManager !== ''
    ? "Файловый менеджер: $fileManager\n\n"
    : "Файловый менеджер не найден (--file-manager=<папка simflex-file-manager>) — «Из библиотеки» в демо нет\n\n";

echo "Проверка сервера:\n\n";
runPhp($root . '/bin/check.php', [], $phpArgs);

$url = "http://127.0.0.1:$port/examples/admin.html?media=direct";
echo "\nДемо: $url   (Ctrl+C — остановить; проверка в браузере: http://127.0.0.1:$port/bin/check.php)\n";
$server = startServer($port, $root . '/bin/demo/media-demo.php', $phpArgs, ['TED_DEMO_FILE_MANAGER' => $fileManager], null);
if (!isset($options['no-open'])) {
    $open = match (PHP_OS_FAMILY) {
        'Windows' => ['cmd', '/c', 'start', '', $url],
        'Darwin' => ['open', $url],
        default => ['xdg-open', $url],
    };
    $opener = proc_open($open, [], $pipes);
    if (is_resource($opener)) {
        proc_close($opener);
    }
}
// сервер работает, пока не закрыть окно или Ctrl+C
$status = proc_get_status($server);
while ($status['running']) {
    sleep(1);
    $status = proc_get_status($server);
}
