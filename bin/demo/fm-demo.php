<?php

declare(strict_types=1);

// Демо: файловый менеджер SimflexCMS (пакет simflex-file-manager) в демо-админке texted — без ядра Simflex.
// Подключает bin/demo/media-demo.php (только php -S на 127.0.0.1), папка пакета — переменная TED_DEMO_FILE_MANAGER
// (её задаёт bin/demo.php). Корень менеджера — папка файлов демо (ted.config.php → files.dir), как /uf на сайте.
//   /ted-demo-fm/window   — разметка окон (tpl/index.tpl) и CSRF-токен сессии (в CMS их выводит шаблон админки)
//   /ted-demo-fm/api      — API менеджера (Manager::handleRequest), изменяющие запросы — POST с токеном
//   /ted-demo-fm/assets/… — статика пакета (js, css, иконки)
// В CMS всё это делает ядро (Kernel::executeFileManager, Admin/theme/tpl/body.tpl) за авторизацией админки.
// Менеджер — самостоятельный пакет (свои Request, ApiException, пути на Windows): демо подключает его классы
// загрузчиком из src/FileManager пакета, без composer и ядра.

/**
 * @param string $route Путь запроса
 * @param string $filesDir Папка файлов демо (корень менеджера)
 * @param string $filesUrl Её адрес на сайте (/uf)
 * @return bool true — запрос обработан
 */
function ted_demo_file_manager(string $route, string $filesDir, string $filesUrl): bool
{
    if (!str_starts_with($route, '/ted-demo-fm/')) {
        return false;
    }
    $package = getenv('TED_DEMO_FILE_MANAGER') ?: '';
    $src = $package !== '' ? realpath($package . '/src') : false;
    if ($src === false || !is_file($src . '/FileManager/Manager.php')) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Файловый менеджер не подключён: запустите демо с -FileManager <папка simflex-file-manager>';
        return true;
    }

    // статика пакета: только внутри src/assets
    if (str_starts_with($route, '/ted-demo-fm/assets/')) {
        $assets = realpath($src . '/assets');
        $file = realpath($src . '/assets/' . rawurldecode(substr($route, strlen('/ted-demo-fm/assets/'))));
        $types = ['js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml'];
        $ext = strtolower(pathinfo((string) $file, PATHINFO_EXTENSION));
        if ($file === false || !str_starts_with($file, $assets . DIRECTORY_SEPARATOR) || !isset($types[$ext])) {
            http_response_code(404);
            return true;
        }
        header('Content-Type: ' . $types[$ext] . '; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        readfile($file);
        return true;
    }

    session_start();
    if (!is_string($_SESSION['tedDemoFmCsrf'] ?? null)) {
        $_SESSION['tedDemoFmCsrf'] = bin2hex(random_bytes(32));
    }
    $token = $_SESSION['tedDemoFmCsrf'];
    session_write_close();

    if ($route === '/ted-demo-fm/window') {
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        // переменные шаблона — как у ядра (README пакета, «Подключение»)
        $fileManagerApi = '/ted-demo-fm/api';
        $fileManagerRoot = rtrim($filesUrl, '/');
        $fileManagerAssets = '/ted-demo-fm/assets';
        $theme = ($_GET['theme'] ?? '') === 'dark' ? 'dark' : 'light';
        $fileManagerCsrfToken = $token;
        $fileManagerProtectedDirs = [];
        echo '<meta name="csrf-token" content="' . htmlspecialchars($token, ENT_QUOTES) . '">';
        (static function () use (
            $src,
            $fileManagerApi,
            $fileManagerRoot,
            $fileManagerAssets,
            $theme,
            $fileManagerCsrfToken,
            $fileManagerProtectedDirs,
        ): void {
            include $src . '/tpl/index.tpl';
        })();
        return true;
    }

    if ($route === '/ted-demo-fm/api') {
        ted_demo_load_file_manager($src);
        if (!is_dir($filesDir)) {
            @mkdir($filesDir, 0775, true);
        }
        // доступ — демо на 127.0.0.1 (в CMS — права админки); токен — из сессии, как Csrf::isValid ядра
        $csrf = static fn(): bool => hash_equals($token, (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
        (new \Simflex\FileManager\Manager($filesDir, static fn(): bool => true, $csrf))->handleRequest();
        return true;
    }

    http_response_code(404);
    return true;
}

/**
 * Загрузчик классов пакета (Simflex\FileManager\* → src/FileManager/*.php): демо работает без composer
 *
 * @param string $src Каталог src пакета simflex-file-manager
 */
function ted_demo_load_file_manager(string $src): void
{
    static $isRegistered = false;
    if ($isRegistered) {
        return;
    }
    $isRegistered = true;
    spl_autoload_register(static function (string $class) use ($src): void {
        $prefix = 'Simflex\\FileManager\\';
        if (str_starts_with($class, $prefix)) {
            $file = $src . '/FileManager/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
            if (is_file($file)) {
                require $file;
            }
        }
    });
}
