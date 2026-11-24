<?php

declare(strict_types=1);

use Simflex\Texted\Config;
use Simflex\Texted\MediaStorage;
use Simflex\Texted\OpenGraph;
use Simflex\Texted\Sanitizer;

require __DIR__ . '/bootstrap.php';
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Этап 1 (MODULAR_PLAN.md): настройки сервера (ted.config.php), папка файлов вне пакета, удаление только внутри папки,
// в браузер — только безопасная часть настроек. Запуск: php php/test-config.php (код выхода 0 / 1).

$failures = [];
$checks = 0;
$ok = static function (bool $cond, string $name) use (&$failures, &$checks): void {
    $checks++;
    if (!$cond) {
        $failures[] = $name;
    }
};
$throws = static function (callable $fn, string $name) use ($ok): void {
    try {
        $fn();
        $ok(false, $name . ' — нет ошибки');
    } catch (InvalidArgumentException) {
        $ok(true, $name);
    }
};

// --- значения по умолчанию: как до этапа 1 ---
$d = Config::fromArray([]);
$ok($d->getFilesUrl() === '/uf', 'по умолчанию адрес /uf');
$ok(str_ends_with(str_replace('\\', '/', $d->getFilesDir()), '/uf'), 'по умолчанию папка …/uf');
$ok($d->getLimit('image') === 5 * 1048576 && $d->getLimit('video') === 500 * 1048576 && $d->getLimit('audio') === 50 * 1048576 && $d->getLimit('file') === 20 * 1048576, 'лимиты по умолчанию');
$ok($d->isOpenGraphEnabled() === true && $d->getIframeHosts() === null && $d->getFfmpeg() === 'auto', 'карточки вкл., iFrame любой https, ffmpeg auto');

// --- ошибки в настройках — понятное исключение, а не тихое значение по умолчанию ---
$throws(fn() => Config::fromArray(['file' => []]), 'опечатка в ключе (file вместо files)');
$throws(fn() => Config::fromArray(['files' => ['dir' => 'uf']]), 'files.dir — относительный путь');
$throws(fn() => Config::fromArray(['files' => ['url' => '//evil.example/uf']]), 'files.url — //чужой сайт');
$throws(fn() => Config::fromArray(['files' => ['url' => 'javascript:alert(1)']]), 'files.url — javascript:');
$throws(fn() => Config::fromArray(['files' => ['url' => 'uf']]), 'files.url — без /');
$throws(fn() => Config::fromArray(['files' => ['path' => '/x']]), 'files — неизвестный ключ');
$throws(fn() => Config::fromArray(['limits' => ['image' => 0]]), 'limits — ноль');
$throws(fn() => Config::fromArray(['limits' => ['photo' => 5]]), 'limits — неизвестный вид');
$throws(fn() => Config::fromArray(['opengraph' => 'yes']), 'opengraph — не true / false');
$throws(fn() => Config::fromArray(['ffmpeg' => '']), 'ffmpeg — пустая строка');
$throws(fn() => Config::fromArray(['iframe' => ['hosts' => ['https://www.youtube.com/']]]), 'iframe.hosts — с https:// и путём');
$throws(fn() => Config::fromArray(['iframe' => ['hosts' => 'www.youtube.com']]), 'iframe.hosts — строка, а не список');

// --- файл настроек ---
$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ted-config-' . bin2hex(random_bytes(6));
mkdir($tmp);
$files = $tmp . DIRECTORY_SEPARATOR . 'media';
$cfgFile = $tmp . DIRECTORY_SEPARATOR . 'ted.config.php';
file_put_contents($cfgFile, "<?php\nreturn ['files' => ['dir' => " . var_export($files, true) . ", 'url' => '/media/files/'], 'limits' => ['image' => 2.5], 'opengraph' => false, 'iframe' => ['hosts' => ['WWW.YouTube.com', 'player.vimeo.com']]];\n");
$c = Config::load($cfgFile);
$ok($c->getFilesUrl() === '/media/files' && $c->getFilesDir() === $files, 'файл: папка и адрес — два значения, косая черта в конце адреса убрана');
$ok($c->getLimit('image') === (int) round(2.5 * 1048576) && $c->getLimit('video') === 500 * 1048576, 'файл: свой лимит, остальные по умолчанию');
$ok($c->isOpenGraphEnabled() === false && $c->getIframeHosts() === ['www.youtube.com', 'player.vimeo.com'], 'файл: карточки выкл., список сайтов iFrame в нижнем регистре');
$throws(fn() => Config::load($tmp . DIRECTORY_SEPARATOR . 'nope.php'), 'указан несуществующий файл настроек');
file_put_contents($tmp . DIRECTORY_SEPARATOR . 'bad.php', "<?php\nreturn 'x';\n");
$throws(fn() => Config::load($tmp . DIRECTORY_SEPARATOR . 'bad.php'), 'файл настроек возвращает не массив');

// --- браузеру — только безопасная часть ---
$client = $c->getClient();
$json = $c->getClientJson();
$ok(array_keys($client) === ['filesUrl', 'limits', 'opengraph', 'iframeHosts', 'preset', 'presets', 'canEdit'], 'в браузер: адрес папки, лимиты, карточки, сайты iFrame, набор, право на правку');
$ok(!str_contains($json, str_replace('\\', '\\\\', $tmp)) && !str_contains($json, basename($tmp)) && !str_contains($json, 'ffmpeg'), 'в браузер не попадают путь на диске и ffmpeg');
$ok(!str_contains(Config::fromArray(['files' => ['url' => '/a</script><b>']])->getClientJson(), '</script>'), 'JSON безопасен внутри <script>');

// --- хранилище: файлы в папке из настроек, адреса — с адресом из настроек ---
$storage = $c->createStorage();
$ok(is_dir($files), 'папка файлов создаётся, если её нет');
$ok($storage->getFilesUrl() === '/media/files' && $storage->getFilesDir() === realpath($files), 'хранилище: та же папка и тот же адрес');
$cdn = new MediaStorage($files, 'https://cdn.example.com/uf/');
$ok($cdn->getFilesUrl() === 'https://cdn.example.com/uf', 'адрес папки на другом домене (CDN)');
$throws(fn() => new MediaStorage($tmp . DIRECTORY_SEPARATOR . 'no' . DIRECTORY_SEPARATOR . 'such'), 'нет родителя папки — ошибка, а не папка в случайном месте');
$throws(fn() => new MediaStorage($files, '//evil.example'), 'хранилище: адрес //чужой сайт');

// --- удаление: только внутри папки файлов, только эта страница, только наши имена ---
$page = $files . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . 'company';
@mkdir($files . DIRECTORY_SEPARATOR . 'images', 0755);
@mkdir($page, 0755);
@mkdir($files . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . 'other', 0755);
$put = static function (string $path): string {
    file_put_contents($path, 'x');
    return $path;
};
$mine = $put($page . DIRECTORY_SEPARATOR . 'photo.webp');
$mine2 = $put($page . DIRECTORY_SEPARATOR . 'photo-2.webp');
$foreignPage = $put($files . DIRECTORY_SEPARATOR . 'images' . DIRECTORY_SEPARATOR . 'other' . DIRECTORY_SEPARATOR . 'photo.webp');
$notOurs = $put($page . DIRECTORY_SEPARATOR . 'index.php');
$outside = $put($tmp . DIRECTORY_SEPARATOR . 'secret.webp');
$removed = $storage->deleteFiles('/company/', [
    '/uf/images/company/photo-2.webp',                    // адрес другой папки (старый /uf при папке /media/files)
    '/media/files/images/other/photo.webp',               // другая страница
    '/media/files/images/company/index.php',              // не наше имя файла
    '/media/files/images/company/../../../secret.webp',   // выход из папки
    '/media/files/images/company/%2e%2e/other/photo.webp',
    '/media/files/images/company/sub/photo.webp',         // вложенная папка
    'https://evil.example/media/files/images/company/photo-2.webp',
    '/media/files/images/company/photo.webp',             // свой файл — удаляется
], fn(string $url): bool => false);
$ok($removed === 1 && !is_file($mine), 'удалён только свой файл страницы');
$ok(is_file($mine2) && is_file($foreignPage) && is_file($notOurs) && is_file($outside), 'чужие адреса, другая страница, не наше имя, выход из папки — не тронуты');
$ok($storage->deleteFiles('/company/', ['/media/files/images/company/photo-2.webp'], fn(string $url): bool => true) === 0 && is_file($mine2), 'файл нужен другому документу — не удаляется');
if (function_exists('symlink') && @symlink($outside, $page . DIRECTORY_SEPARATOR . 'link.webp')) {
    $ok($storage->deleteFiles('/company/', ['/media/files/images/company/link.webp']) === 0 && is_file($outside), 'ссылка на файл вне папки — не удаляется');
}
$throws(fn() => $storage->deleteFiles('/../etc/', ['/media/files/images/x.webp']), 'путь страницы с «..»');
$throws(fn() => $storage->deleteFiles('company', []), 'путь страницы не с /');

// --- очистка: сайты блока «iFrame» из настроек ---
$frame = static fn(string $src): string => '<figure class="ted-iframe"><iframe src="' . $src . '" height="300" title="Фрейм"></iframe></figure>';
$ok(str_contains($d->clean($frame('https://maps.example.org/embed')), '<iframe'), 'iFrame по умолчанию: любой https');
$ok(str_contains($c->clean($frame('https://www.youtube.com/embed/x')), '<iframe'), 'iFrame из списка — остаётся');
$ok(!str_contains($c->clean($frame('https://maps.example.org/embed')), '<iframe'), 'iFrame не из списка — убран');
$ok(!str_contains($c->clean($frame('http://www.youtube.com/embed/x')), '<iframe'), 'iFrame из списка, но http — убран');
$ok(Sanitizer::clean($frame('https://maps.example.org/embed')) === $d->clean($frame('https://maps.example.org/embed')), 'без списка — как прежде (Sanitizer::clean)');

// --- карточки по ссылке выключены: сервер чужую страницу не читает ---
ob_start();
OpenGraph::respondToRequest(false);
$out = (string) ob_get_clean();
$ok(str_contains($out, 'выключены') && (PHP_SAPI !== 'cli' || http_response_code() === false || http_response_code() === 403), 'карточки выключены — отказ без запроса наружу');

// уборка
$rm = static function (string $dir) use (&$rm): void {
    foreach (scandir($dir) ?: [] as $n) {
        if ($n === '.' || $n === '..') {
            continue;
        }
        $p = $dir . DIRECTORY_SEPARATOR . $n;
        is_dir($p) && !is_link($p) ? $rm($p) : @unlink($p);
    }
    @rmdir($dir);
};
$rm($tmp);

echo "Настройки и папка файлов: проверок $checks, замечаний " . count($failures) . "\n";
foreach ($failures as $f) {
    echo "  ✗ $f\n";
}
exit($failures ? 1 : 0);
