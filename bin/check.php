<?php

declare(strict_types=1);

/**
 * Проверка сервера для texted: версия PHP, расширения, настройки (ted.config.php), лимиты загрузки, права на папку файлов.
 * В консоли:  php vendor/simflex/texted/bin/check.php [путь к ted.config.php]
 * В браузере — только с localhost (на боевом сервере файл не открывать).
 */

use Simflex\Texted\Config;
use Simflex\Texted\MediaStorage;
use Simflex\Texted\Sanitizer;

// автозагрузка composer: пакет в vendor/ сайта или клон пакета с vendor/; без неё — загрузчик тестов (клон без composer)
foreach ([dirname(__DIR__, 3) . '/autoload.php', dirname(__DIR__) . '/vendor/autoload.php', dirname(__DIR__) . '/tests/php/bootstrap.php'] as $autoload) {
    if (is_file($autoload)) {
        require_once $autoload;
        break;
    }
}
$cli = PHP_SAPI === 'cli';
// только с этого компьютера; за обратным прокси (nginx → PHP на localhost) любой посетитель тоже «с 127.0.0.1» —
// поэтому запрос с заголовками прокси не принимаем (проверка 22.11). На боевом сервере check.php лучше не держать
$proxied = isset($_SERVER['HTTP_X_FORWARDED_FOR']) || isset($_SERVER['HTTP_FORWARDED']) || isset($_SERVER['HTTP_X_REAL_IP']);
if (!$cli && ($proxied || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true))) {
    http_response_code(404);
    exit;
}

$toBytes = static function (string $v): int {
    $n = (int) $v;
    $u = strtolower(substr(trim($v), -1));
    return $u === 'g' ? $n << 30 : ($u === 'm' ? $n << 20 : ($u === 'k' ? $n << 10 : $n));
};
$gd = extension_loaded('gd') ? gd_info() : [];
$checks = [];
$add = static function (string $name, string $level, string $value, string $hint = '') use (&$checks) { $checks[] = [$name, $level, $value, $hint]; };

// настройки: ted.config.php рядом с папкой пакета, TED_CONFIG или путь из аргумента
$configFile = $cli && isset($argv[1]) && str_ends_with(strtolower($argv[1]), '.php') ? $argv[1] : ((getenv('TED_CONFIG') ?: null) ?? dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ted.config.php');
try {
    $config = is_file($configFile) ? Config::load($configFile) : Config::load();
    $add('Настройки', is_file($configFile) ? 'ok' : 'warn', is_file($configFile) ? $configFile : 'файла нет — значения по умолчанию', 'Скопируйте ted.config.example.php пакета в ' . $configFile);
} catch (Throwable $e) {
    $config = Config::fromArray([]);
    $add('Настройки', 'fail', $e->getMessage(), $configFile);
}
$uf = $config->getFilesDir();

$add('Версия PHP', version_compare(PHP_VERSION, '8.4.0', '>=') ? 'ok' : 'fail', PHP_VERSION, 'Нужна 8.4 или новее');
$add('Расширение fileinfo', extension_loaded('fileinfo') ? 'ok' : 'fail', extension_loaded('fileinfo') ? 'включено' : 'нет', 'Определяет тип загружаемого файла: extension=fileinfo');
$add('Расширение gd', extension_loaded('gd') ? 'ok' : 'fail', extension_loaded('gd') ? 'включено' : 'нет', 'Нужно для картинок: extension=gd');
$add('GD: WebP', !empty($gd['WebP Support']) ? 'ok' : 'fail', !empty($gd['WebP Support']) ? 'есть' : 'нет', 'Изображения сохраняются в WebP');
$add('GD: JPEG и PNG', (!empty($gd['JPEG Support']) && !empty($gd['PNG Support'])) ? 'ok' : 'fail', (!empty($gd['JPEG Support']) && !empty($gd['PNG Support'])) ? 'есть' : 'нет');
$ffmpeg = $config->getFfmpeg() === false ? null : MediaStorage::findFfmpeg($config->getFfmpeg() === 'auto' ? null : $config->getFfmpeg());
$add('ffmpeg (видео)', $ffmpeg ? 'ok' : 'warn', $ffmpeg ? 'найден' : 'не найден', $ffmpeg ? 'Видео любых форматов станет WebM, постер делается на сервере' : 'Нужен для MOV, MKV и других форматов, конвертации в WebM и постера на сервере. Без него принимаются только MP4, AVI и WebM');
$add('Расширение dom', extension_loaded('dom') ? 'ok' : 'fail', extension_loaded('dom') ? 'включено' : 'нет', 'Нужно серверной очистке HTML (Sanitizer)');
$up = $toBytes((string) ini_get('upload_max_filesize'));
$post = $toBytes((string) ini_get('post_max_size'));
$maxLimit = max($config->getLimits());
$add('upload_max_filesize', $up >= $maxLimit ? 'ok' : 'warn', (string) ini_get('upload_max_filesize'), 'Не меньше самого большого лимита из настроек: ' . (int) ceil($maxLimit / 1048576) . 'M');
$add('post_max_size', $post >= $up ? 'ok' : 'warn', (string) ini_get('post_max_size'), 'Не меньше upload_max_filesize');
$add('file_uploads', ini_get('file_uploads') ? 'ok' : 'fail', ini_get('file_uploads') ? 'включено' : 'выключено');
$add(
    'Папка файлов',
    is_dir($uf) ? (is_writable($uf) ? 'ok' : 'fail') : (is_writable(dirname($uf)) ? 'warn' : 'fail'),
    $uf . ' → ' . $config->getFilesUrl() . (is_dir($uf) ? (is_writable($uf) ? ' (запись разрешена)' : ' (нет прав на запись)') : ' (будет создана при первой загрузке)'),
    'files.dir в ted.config.php'
);
$add(
    'Папка файлов внутри пакета',
    str_starts_with(realpath($uf) ?: $uf, (realpath(dirname(__DIR__)) ?: dirname(__DIR__)) . DIRECTORY_SEPARATOR) ? 'warn' : 'ok',
    str_starts_with(realpath($uf) ?: $uf, (realpath(dirname(__DIR__)) ?: dirname(__DIR__)) . DIRECTORY_SEPARATOR) ? 'да' : 'нет',
    'Обновление пакета затрёт файлы — вынесите папку из пакета'
);
$add('.htaccess в папке файлов', is_file($uf . DIRECTORY_SEPARATOR . '.htaccess') ? 'ok' : 'warn', is_file($uf . DIRECTORY_SEPARATOR . '.htaccess') ? 'есть' : 'нет', 'Скопируйте resources/uf.htaccess пакета в папку файлов как .htaccess (Apache); nginx — правило в README');
$add('Карточки по ссылке', 'ok', $config->isOpenGraphEnabled() ? 'включены' : 'выключены');
$add('Сайты для iFrame', 'ok', $config->getIframeHosts() === null ? 'любой https' : implode(', ', $config->getIframeHosts()));
$add('Лимит частоты', 'ok', 'загрузка ' . ($config->getRates()['upload'] ?: 'без лимита') . ', запросы наружу ' . ($config->getRates()['fetch'] ?: 'без лимита') . ' в минуту');
$add('Наборы', 'ok', 'full, mini, text, readonly, docs' . ($config->getPresets() ? '; свои: ' . implode(', ', array_keys($config->getPresets())) : ''));
$add('Серверная очистка', class_exists(Sanitizer::class) ? 'ok' : 'fail', class_exists(Sanitizer::class) ? 'Sanitizer подключён' : 'нет класса', 'composer require simflex/texted; Config::clean($html) перед сохранением');

$fail = count(array_filter($checks, static fn($c) => $c[1] === 'fail'));
$warn = count(array_filter($checks, static fn($c) => $c[1] === 'warn'));
$mark = ['ok' => 'OK  ', 'warn' => 'ВНИМ', 'fail' => 'ОШИБ'];
$verdict = $fail ? "Загрузка файлов не заработает: проблем $fail" : ($warn ? "Работает, есть замечания: $warn" : 'Всё готово к работе');

if ($cli) {
    foreach ($checks as [$n, $l, $v, $h]) {
        printf("[%s] %-24s %s%s\n", $mark[$l], $n, $v, $l !== 'ok' && $h ? "  ← $h" : '');
    }
    echo "\n$verdict\n";
    exit($fail ? 1 : 0);
}
header('Content-Type: text/html; charset=utf-8');
$color = ['ok' => '#1a7f37', 'warn' => '#b26a00', 'fail' => '#c62828'];
echo '<!doctype html><meta charset="utf-8"><title>texted: проверка сервера</title><body style="font:16px/1.5 system-ui;max-width:760px;margin:32px auto;padding:0 16px">';
echo '<h1>texted: проверка сервера</h1><p><strong style="color:' . ($fail ? $color['fail'] : ($warn ? $color['warn'] : $color['ok'])) . '">' . htmlspecialchars($verdict) . '</strong></p><table cellpadding="6" style="border-collapse:collapse;width:100%">';
foreach ($checks as [$n, $l, $v, $h]) {
    echo '<tr style="border-top:1px solid #ddd"><td style="color:' . $color[$l] . ';font-weight:600">' . $mark[$l] . '</td><td>' . htmlspecialchars($n) . '</td><td>' . htmlspecialchars($v) . ($l !== 'ok' && $h ? '<br><small>' . htmlspecialchars($h) . '</small>' : '') . '</td></tr>';
}
echo '</table>';
