<?php

declare(strict_types=1);

use Simflex\Texted\Config;
use Simflex\Texted\Exception\AccessDenied;

// Только для php -S 127.0.0.1:<порт> -t <пакет> bin/demo/media-demo.php (запускает bin/demo.php).
if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    return true;
}
$route = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);

// настройки — как на сайте: ted.config.php рядом с папкой пакета или TED_CONFIG; классы — composer или загрузчик тестов
require_once dirname(__DIR__, 2) . '/tests/php/bootstrap.php';
$config = Config::load();

// Папка файлов лежит вне пакета (files.dir), адрес — files.url: отдаём её сами, как веб-сервер сайта.
// Аудио и видео — частями (HTTP Range), как Apache и nginx: без этого встроенный сервер PHP отдаёт файл целиком,
// браузер считает запись неперематываемой, и перемотка по волне или полосе видео не работает.
$filesUrl = $config->getFilesUrl() . '/';
if (is_string($route) && str_starts_with($route, $filesUrl)) {
    $root = realpath($config->getFilesDir());
    $file = realpath($config->getFilesDir() . DIRECTORY_SEPARATOR . rawurldecode(substr($route, strlen($filesUrl))));
    if ($root === false || $file === false || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)) {
        http_response_code(404);
        return true;
    }
    $size = filesize($file);
    $types = ['mp3' => 'audio/mpeg', 'wav' => 'audio/wav', 'mp4' => 'video/mp4', 'webm' => 'video/webm', 'ogg' => 'audio/ogg', 'ogv' => 'video/ogg', 'm4a' => 'audio/mp4', 'm4v' => 'video/mp4', 'avi' => 'video/x-msvideo',
        'webp' => 'image/webp', 'gif' => 'image/gif', 'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'pdf' => 'application/pdf', 'zip' => 'application/zip',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    header('X-Content-Type-Options: nosniff');   // как uf.htaccess: тип файла не угадывается
    header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
    header('Accept-Ranges: bytes');
    $start = 0;
    $end = $size - 1;
    if (preg_match('~^bytes=(\d*)-(\d*)$~', $_SERVER['HTTP_RANGE'] ?? '', $m) && ($m[1] !== '' || $m[2] !== '')) {
        if ($m[1] === '') {
            $start = max(0, $size - (int) $m[2]);
        } else {
            $start = (int) $m[1];
            if ($m[2] !== '') {
                $end = min($end, (int) $m[2]);
            }
        }
        if ($start > $end || $start >= $size) {
            http_response_code(416);
            header('Content-Range: bytes */' . $size);
            return true;
        }
        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
    }
    header('Content-Length: ' . ($end - $start + 1));
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
        return true;
    }
    $fh = fopen($file, 'rb');
    fseek($fh, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($fh)) {
        $chunk = fread($fh, min(1 << 16, $left));
        echo $chunk;
        $left -= strlen($chunk);
    }
    fclose($fh);
    return true;
}
// файловый менеджер SimflexCMS (пакет simflex-file-manager, если демо запущено с ним): окно, API, статика
require_once __DIR__ . '/fm-demo.php';
if (is_string($route) && ted_demo_file_manager($route, $config->getFilesDir(), $config->getFilesUrl())) {
    return true;
}
// настройки для браузера (Config::getClientJson): как CMS передаёт их в Ted.init({ server: … }) — без путей на диске
// Набор поля и право на правку (этап 2) в CMS берутся из настройки поля и прав пользователя. В демо их «выбирают»
// адресом страницы: admin.html?preset=mini&access=ro. Сервер запоминает выбор в сессии и дальше проверяет по ней
// сохранение и загрузку — так же, как CMS проверяет по своей сессии, а не по данным из браузера.
if ($route === '/ted-demo-media/config.js') {
    header('Content-Type: text/javascript; charset=utf-8');
    header('Cache-Control: no-store');
    $preset = is_string($_GET['preset'] ?? null) ? $_GET['preset'] : 'full';
    try {
        $config->getPreset($preset);
    } catch (InvalidArgumentException) {
        $preset = 'full';
    }
    $canEdit = ($_GET['access'] ?? '') !== 'ro';
    session_start();
    $_SESSION['tedField'] = ['preset' => $preset, 'canEdit' => $canEdit];
    session_write_close();
    echo 'window.TED_SERVER = ' . $config->getClientJson($preset, $canEdit) . ';';
    // демо: подключён ли файловый менеджер (кнопка «Из библиотеки» в зоне загрузки)
    $fm = getenv('TED_DEMO_FILE_MANAGER') ?: '';
    echo ' window.TED_DEMO_FILE_MANAGER = ' . ($fm !== '' && is_file($fm . '/src/FileManager/Manager.php') ? 'true' : 'false') . ';';
    return true;
}
if (!in_array($route, ['/ted-demo-media/upload', '/ted-demo-media/save', '/ted-demo-media/og'], true)) {
    return false;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || ($_SERVER['HTTP_X_TED_DEMO'] ?? '') !== 'media') {
    http_response_code(403);
    echo json_encode(['error' => 'Недоступно']);
    return true;
}

// карточка ссылки для блока «Встраивание» (OpenGraph): страницу читает сервер, не браузер
if ($route === '/ted-demo-media/og') {
    $config->respondToOpenGraph();   // вкл./выкл. из настроек и лимит частоты (этап 3)
    return true;
}

$page = '/company/';
session_start();
$field = $_SESSION['tedField'] ?? ['preset' => 'full', 'canEdit' => true];   // набор и право — с сервера (сессия), не из запроса
if ($route === '/ted-demo-media/upload') {
    ob_start();
    $config->respondToUpload($page, $field['preset'], $field['canEdit']);   // без права — 403, файл не пишется
    $json = ob_get_clean();
    $asset = json_decode($json, true);
    foreach (['url', 'poster'] as $key) {
        if (isset($asset[$key])) {
            $_SESSION['tedMedia'][$asset[$key]] = true;
        }
    }
    session_write_close();
    echo $json;
    return true;
}

$html = file_get_contents('php://input', false, null, 0, 2_000_001);
if ($html === false || strlen($html) > 2_000_000) {
    http_response_code(400);
    echo json_encode(['error' => 'Документ слишком большой']);
    return true;
}
try {
    $clean = $config->save($html, $field['preset'], $field['canEdit']);   // очистка по набору поля; без права — отказ
} catch (AccessDenied $e) {
    session_write_close();
    http_response_code(403);
    echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
    return true;
}
$_SESSION['tedDemoHTML'] = $clean;
session_write_close();
echo json_encode(['saved' => true, 'html' => $clean], JSON_UNESCAPED_UNICODE);
return true;
