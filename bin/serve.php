<?php

declare(strict_types=1);

/**
 * Маршрутизатор php -S для тестов и снимков (bin/test.php, bin/snapshot.php): файлы пакета с верным типом и без кэша.
 * Папка файлов демо (/uf/…) — рядом с пакетом, как на сайте: ../uf/…
 *
 *   php -S 127.0.0.1:8180 -t <пакет> bin/serve.php
 */

if (PHP_SAPI !== 'cli-server' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    return true;
}

$types = [
    'html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'mjs' => 'text/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8', 'json' => 'application/json; charset=utf-8', 'svg' => 'image/svg+xml',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp', 'gif' => 'image/gif',
    'ico' => 'image/x-icon', 'mp3' => 'audio/mpeg', 'mp4' => 'video/mp4', 'webm' => 'video/webm',
    'pdf' => 'application/pdf', 'woff' => 'font/woff', 'woff2' => 'font/woff2', 'md' => 'text/plain; charset=utf-8',
    'txt' => 'text/plain; charset=utf-8',
];
$root = (string) realpath(dirname(__DIR__));
$path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if ($path === '/') {
    $path = '/examples/';
}
$base = $root;
$ufRoot = realpath(dirname($root) . '/uf');
if (str_starts_with($path, '/uf/') && $ufRoot !== false) {
    $base = $ufRoot;
    $path = substr($path, 3);
}
$file = realpath($base . $path);
if ($file !== false && is_dir($file)) {
    $file = realpath($file . '/index.html');
}
header('Cache-Control: no-store');
if ($file === false || !is_file($file) || !str_starts_with($file, $base . DIRECTORY_SEPARATOR) || str_ends_with($file, '.php')) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo '404: ' . $path;
    return true;
}
header('Content-Type: ' . ($types[strtolower(pathinfo($file, PATHINFO_EXTENSION))] ?? 'application/octet-stream'));
header('Content-Length: ' . filesize($file));
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') {
    readfile($file);
}
return true;
