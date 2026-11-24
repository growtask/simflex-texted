<?php

declare(strict_types=1);

/**
 * Общее для инструментов bin/ (тесты, демо, снимки): браузер без окна, свой сервер php -S, расширения PHP.
 * Одинаково на Windows, Linux и macOS; браузер для тестов — Chrome, Chromium или Edge (в продукте не используется).
 */

namespace Simflex\Texted\Tools;

/** Корень пакета */
function getRoot(): string
{
    return dirname(__DIR__);
}

/** Вывод в консоль Windows — в UTF-8 (кириллица в сводках) */
function useUtf8Console(): void
{
    if (function_exists('sapi_windows_cp_set')) {
        sapi_windows_cp_set(65001);
    }
}

/**
 * Параметры командной строки: --name=value, --flag; остальное — по порядку
 *
 * @param string[] $argv
 * @return array{0: array<string, string|true>, 1: string[]}
 */
function parseArgs(array $argv): array
{
    $options = [];
    $positional = [];
    foreach (array_slice($argv, 1) as $arg) {
        if (preg_match('/\A--([a-z-]+)(?:=(.*))?\z/s', $arg, $m)) {
            $options[$m[1]] = $m[2] ?? true;
        } else {
            $positional[] = $arg;
        }
    }
    return [$options, $positional];
}

/** Путь к Chrome, Chromium или Edge: TED_BROWSER, обычные места установки, PATH; null — не найден */
function findBrowser(): ?string
{
    $fromEnv = getenv('TED_BROWSER') ?: '';
    if ($fromEnv !== '') {
        return $fromEnv;
    }
    $candidates = [];
    if (PHP_OS_FAMILY === 'Windows') {
        foreach ([getenv('ProgramFiles(x86)'), getenv('ProgramFiles'), getenv('LOCALAPPDATA')] as $base) {
            if ($base) {
                $candidates[] = $base . '\Microsoft\Edge\Application\msedge.exe';
                $candidates[] = $base . '\Google\Chrome\Application\chrome.exe';
            }
        }
    } elseif (PHP_OS_FAMILY === 'Darwin') {
        $candidates[] = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        $candidates[] = '/Applications/Chromium.app/Contents/MacOS/Chromium';
        $candidates[] = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
    }
    foreach ($candidates as $file) {
        if (is_file($file)) {
            return $file;
        }
    }
    foreach (['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge'] as $name) {
        foreach (explode(PATH_SEPARATOR, (string) getenv('PATH')) as $dir) {
            if ($dir !== '' && is_file($dir . DIRECTORY_SEPARATOR . $name) && is_executable($dir . DIRECTORY_SEPARATOR . $name)) {
                return $dir . DIRECTORY_SEPARATOR . $name;
            }
        }
    }
    return null;
}

/**
 * Параметры для дочернего PHP: расширения из папки ext рядом с php (PHP без php.ini, WinGet) и без opcache
 *
 * @param string[] $extensions Нужные расширения
 * @return string[]
 */
function getPhpArgs(array $extensions = ['gd', 'fileinfo', 'openssl', 'mbstring']): array
{
    $args = ['-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0'];
    $extDir = dirname(PHP_BINARY) . DIRECTORY_SEPARATOR . 'ext';
    // что грузит сам php (php.ini), спрашиваем у нового процесса: текущий мог получить расширения через -d
    static $loaded = null;
    if ($loaded === null) {
        $loaded = array_map('strtolower', (array) json_decode((string) shell_exec(
            escapeshellarg(PHP_BINARY) . ' -r ' . escapeshellarg('echo json_encode(get_loaded_extensions());'),
        ), true));
    }
    $missing = array_filter($extensions, static fn(string $name) => !in_array($name, $loaded, true));
    if ($missing && is_dir($extDir)) {
        $args[] = '-d';
        $args[] = 'extension_dir=' . $extDir;
        foreach ($missing as $name) {
            $file = $extDir . DIRECTORY_SEPARATOR . (PHP_OS_FAMILY === 'Windows' ? "php_$name.dll" : "$name.so");
            if (is_file($file)) {
                $args[] = '-d';
                $args[] = 'extension=' . $name;
            }
        }
    }
    return $args;
}

/** Свободный порт на 127.0.0.1: нужный, если свободен, иначе любой */
function getFreePort(int $preferred): int
{
    $server = @stream_socket_server('tcp://127.0.0.1:' . $preferred);
    if ($server === false) {
        $server = stream_socket_server('tcp://127.0.0.1:0');
    }
    $name = (string) stream_socket_get_name($server, false);
    fclose($server);
    return (int) substr($name, strrpos($name, ':') + 1);
}

/** Пустой файл для вывода, который не нужен */
function getNullDevice(): string
{
    return PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null';
}

/**
 * Запуск php -S в фоне: корень — пакет, маршрутизатор — файл; ждёт, пока сервер ответит
 *
 * @param string[] $phpArgs Дополнительные параметры php (-d …)
 * @param array<string, string> $env Переменные окружения сервера
 * @return resource Процесс (остановить — stopProcess)
 */
function startServer(int $port, string $router, array $phpArgs = [], array $env = [], ?string $log = null)
{
    $command = [PHP_BINARY, ...$phpArgs, '-S', '127.0.0.1:' . $port, '-t', getRoot(), $router];
    $output = ['file', $log ?? getNullDevice(), 'a'];
    $process = proc_open($command, [0 => ['file', getNullDevice(), 'r'], 1 => $output, 2 => $output], $pipes, getRoot(), $env + getenv());
    if (!is_resource($process)) {
        throw new \RuntimeException('Не удалось запустить php -S');
    }
    for ($i = 0; $i < 100; $i++) {
        $socket = @fsockopen('127.0.0.1', $port, $code, $message, 0.2);
        if ($socket) {
            fclose($socket);
            return $process;
        }
        usleep(100_000);
    }
    stopProcess($process);
    throw new \RuntimeException('Сервер php -S не ответил на порту ' . $port);
}

/** Остановить фоновый процесс */
function stopProcess($process): void
{
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
}

/** Временная папка с уникальным именем (профиль браузера, файлы теста) */
function makeTempDir(string $prefix): string
{
    $dir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . $prefix . bin2hex(random_bytes(16));
    mkdir($dir, 0700, true);
    return $dir;
}

/** Удалить временную папку, созданную makeTempDir (только с этим префиксом во временной папке) */
function removeTempDir(string $dir, string $prefix): void
{
    $real = realpath($dir);
    if ($real === false || dirname($real) !== realpath(sys_get_temp_dir()) || !str_starts_with(basename($real), $prefix)) {
        return;
    }
    $items = new \RecursiveIteratorIterator(
        new \RecursiveDirectoryIterator($real, \FilesystemIterator::SKIP_DOTS),
        \RecursiveIteratorIterator::CHILD_FIRST,
    );
    foreach ($items as $item) {
        $item->isDir() && !$item->isLink() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
    @rmdir($real);
}

/**
 * DOM страницы после выполнения скриптов: браузер без окна (--dump-dom), время страницы ускорено
 * (virtual-time-budget — тесты, которые ждут анимации, идут быстро)
 */
function dumpDom(string $browser, string $url, int $budget = 900000, string $windowSize = '1200,900'): string
{
    $profile = makeTempDir('ted-browser-');
    try {
        // --edge-skip-compat-layer-relaunch: Edge 157+ после обновления Windows перезапускает себя вторым процессом,
        // и --dump-dom уходит в него (тесты «не завершались»)
        $command = [$browser, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--edge-skip-compat-layer-relaunch', '--user-data-dir=' . $profile, '--window-size=' . $windowSize,
            '--virtual-time-budget=' . $budget, '--dump-dom', $url];
        if (PHP_OS_FAMILY === 'Linux' && function_exists('posix_geteuid') && posix_geteuid() === 0) {
            $command[] = '--no-sandbox';   // Chrome от root (Docker) без песочницы не запускается
        }
        $process = proc_open($command, [0 => ['file', getNullDevice(), 'r'], 1 => ['pipe', 'w'], 2 => ['file', getNullDevice(), 'a']], $pipes);
        if (!is_resource($process)) {
            throw new \RuntimeException('Не удалось запустить браузер: ' . $browser);
        }
        $dom = (string) stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        proc_close($process);
        return $dom;
    } finally {
        removeTempDir($profile, 'ted-browser-');
    }
}

/**
 * Запуск PHP-скрипта с теми же расширениями; вывод идёт через этот процесс (не прямо в STDOUT: при выводе в файл
 * дочерний процесс писал бы с начала файла поверх уже выведенного). Код выхода
 *
 * @param string[] $args
 * @param string[] $phpArgs Параметры php; по умолчанию — getPhpArgs()
 */
function runPhp(string $script, array $args = [], ?array $phpArgs = null): int
{
    $process = proc_open(
        [PHP_BINARY, ...($phpArgs ?? getPhpArgs()), $script, ...$args],
        [0 => ['file', getNullDevice(), 'r'], 1 => ['pipe', 'w'], 2 => ['redirect', 1]],
        $pipes,
        getRoot()
    );
    if (!is_resource($process)) {
        return 1;
    }
    while (($line = fgets($pipes[1])) !== false) {
        echo $line;
    }
    fclose($pipes[1]);
    return proc_close($process);
}
