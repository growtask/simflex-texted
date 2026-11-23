<?php
declare(strict_types=1);

// Демо: файловый менеджер SimflexCMS (пакет simflex-file-manager) в демо-админке texted — без ядра Simflex.
// Подключает tools/media-demo.php (только php -S на 127.0.0.1), папка пакета — переменная TED_DEMO_FILE_MANAGER
// (её задаёт tools/demo.ps1). Корень менеджера — папка файлов демо (ted.config.php → files.dir), как /uf на сайте.
//   /ted-demo-fm/window   — разметка окон (tpl/index.tpl) и CSRF-токен сессии (в CMS их выводит шаблон админки)
//   /ted-demo-fm/api      — API менеджера (Manager::handleRequest), изменяющие запросы — POST с токеном
//   /ted-demo-fm/assets/… — статика пакета (js, css, иконки)
// В CMS всё это делает ядро (Kernel::executeFileManager, Admin/theme/tpl/body.tpl) за авторизацией админки.

namespace Simflex\Core\Http\Api {
    // В ядре — свои классы (src/Http/Api); здесь их минимальные копии, только то, что вызывает Manager
    if (!class_exists(ApiException::class, false)) {
        class ApiException extends \RuntimeException
        {
            public function __construct(string $message, protected int $httpStatus = 400, int $code = 0, ?\Throwable $previous = null)
            {
                parent::__construct($message, $code ?: $httpStatus, $previous);
            }
            public function getHttpStatus(): int { return $this->httpStatus; }
            public static function badRequest(string $message = 'Неверный запрос'): static { return new static($message, 400); }
            public static function unauthorized(string $message = 'Нужна авторизация'): static { return new static($message, 401); }
            public static function forbidden(string $message = 'Доступ запрещён'): static { return new static($message, 403); }
            public static function notFound(string $message = 'Не найдено'): static { return new static($message, 404); }
            public static function unprocessable(string $message = 'Неверные данные'): static { return new static($message, 422); }
        }
    }
    if (!class_exists(JsonEnvelopeResponse::class, false)) {
        /** Ответ {"error": {"code", "message"}, ...данные}: список — в items (как у ядра) */
        class JsonEnvelopeResponse
        {
            private int $status = 200;
            private array $error = ['code' => 0, 'message' => ''];
            private array $fields = [];
            public function setData(mixed $data): static
            {
                $this->fields = is_array($data) ? ($data && array_is_list($data) ? ['items' => $data] : $data) : ['result' => $data];
                return $this;
            }
            public function setError(\Throwable $ex): static
            {
                $api = $ex instanceof ApiException;
                $this->status = $api ? $ex->getHttpStatus() : 500;
                $this->error = ['code' => $api ? $ex->getCode() : 500, 'message' => $api ? $ex->getMessage() : 'Ошибка сервера'];
                return $this;
            }
            public function send(): void
            {
                http_response_code($this->status);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(['error' => $this->error] + $this->fields, JSON_UNESCAPED_UNICODE);
            }
        }
    }
}

namespace {
    /**
     * @param string $route Путь запроса
     * @param string $filesDir Папка файлов демо (корень менеджера)
     * @param string $filesUrl Её адрес на сайте (/uf)
     * @return bool true — запрос обработан
     */
    function ted_demo_file_manager(string $route, string $filesDir, string $filesUrl): bool
    {
        if (!str_starts_with($route, '/ted-demo-fm/')) return false;
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
            if ($file === false || !str_starts_with($file, $assets . DIRECTORY_SEPARATOR) || !isset($types[$ext])) { http_response_code(404); return true; }
            header('Content-Type: ' . $types[$ext] . '; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            readfile($file);
            return true;
        }

        session_start();
        if (!is_string($_SESSION['tedDemoFmCsrf'] ?? null)) $_SESSION['tedDemoFmCsrf'] = bin2hex(random_bytes(32));
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
            echo '<meta name="csrf-token" content="' . htmlspecialchars($token, ENT_QUOTES) . '">';
            (static function () use ($src, $fileManagerApi, $fileManagerRoot, $fileManagerAssets, $theme): void {
                include $src . '/tpl/index.tpl';
            })();
            return true;
        }

        if ($route === '/ted-demo-fm/api') {
            require_once $src . '/FileManager/Manager.php';
            if (!is_dir($filesDir)) @mkdir($filesDir, 0775, true);
            // доступ — демо на 127.0.0.1 (в CMS — права админки); токен — из сессии, как Csrf::isValid ядра
            $csrf = static fn(): bool => hash_equals($token, (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
            $manager = DIRECTORY_SEPARATOR === '\\' ? ted_demo_windows_manager($filesDir, $csrf) : new \Simflex\FileManager\Manager($filesDir, static fn(): bool => true, $csrf);
            $manager->handleRequest();
            return true;
        }

        http_response_code(404);
        return true;
    }

    /**
     * Менеджер на Windows: realpath() отдаёт путь с «\», а Manager сравнивает его с «корень + /» — вложенные папки
     * получали «Неверный путь». Демо приводит пути к «/»; проверки те же (сегменты, ссылки, выход из корня).
     */
    function ted_demo_windows_manager(string $filesDir, callable $csrf): \Simflex\FileManager\Manager
    {
        return new class($filesDir, static fn(): bool => true, $csrf) extends \Simflex\FileManager\Manager {
            public function __construct(string $root, $authFn, $csrfFn = null)
            {
                parent::__construct($root, $authFn, $csrfFn);
                $this->realRoot = str_replace('\\', '/', $this->realRoot);
            }

            protected function resolvePath(bool $allowRoot = true, bool $mustExist = true, ?string $relative = null): string
            {
                if ($this->realRoot === '' || !is_dir($this->realRoot)) throw new \Simflex\Core\Http\Api\ApiException('Каталог файлов не найден', 500);
                $relative ??= (string) ($_REQUEST['path'] ?? '');   // третий параметр — с версии менеджера 23.11 (перемещение)
                if ($relative !== '' && $relative[0] !== '/') throw \Simflex\Core\Http\Api\ApiException::badRequest('Неверный путь');
                $segments = array_values(array_filter(explode('/', $relative), fn(string $part) => $part !== ''));
                foreach ($segments as $segment) {
                    if ($segment === '.' || $segment === '..' || strpbrk($segment, "\\\0:") !== false) throw \Simflex\Core\Http\Api\ApiException::badRequest('Неверный путь');
                }
                if (!$segments && !$allowRoot) throw \Simflex\Core\Http\Api\ApiException::badRequest('Неверный путь');
                $path = $this->realRoot;
                foreach ($segments as $segment) {
                    $path .= '/' . $segment;
                    if (is_link($path)) throw \Simflex\Core\Http\Api\ApiException::badRequest('Неверный путь');
                }
                if (!file_exists($path)) {
                    if ($mustExist) throw \Simflex\Core\Http\Api\ApiException::notFound('Файл или папка не найдены');
                    return $path;
                }
                $real = str_replace('\\', '/', (string) realpath($path));
                if ($real === '' || (strcasecmp($real, $this->realRoot) !== 0 && stripos($real, $this->realRoot . '/') !== 0)) {
                    throw \Simflex\Core\Http\Api\ApiException::badRequest('Неверный путь');
                }
                return $path;
            }
        };
    }
}
