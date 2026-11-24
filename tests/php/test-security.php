<?php

declare(strict_types=1);

use Simflex\Texted\Config;
use Simflex\Texted\MediaStorage;
use Simflex\Texted\RateLimit;

require __DIR__ . '/bootstrap.php';
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Безопасность на сервере (этап 3 MODULAR_PLAN.md): php ted/php/test-security.php — код выхода 0, если всё в порядке.
// Ссылки и белый список — php/test-sanitize.php; внешние запросы — php/test-opengraph.php; здесь — загрузка и лимит частоты.

$fails = [];
$count = 0;
$ok = static function (bool $cond, string $name) use (&$fails, &$count): void {
    $count++;
    if (!$cond) {
        $fails[] = $name;
    }
};
$throws = static function (callable $fn, string $needle): bool {
    try {
        $fn();
    } catch (InvalidArgumentException $e) {
        return str_contains($e->getMessage(), $needle);
    }
    return false;
};
$tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ted-security-' . bin2hex(random_bytes(6));
mkdir($tmp);

try {
    // --- лимит частоты ---
    $limit = new RateLimit(3, $tmp, 'tester');
    $t = 1_000_000.0;
    $ok($limit->hit('upload', $t) && $limit->hit('upload', $t + 1) && $limit->hit('upload', $t + 2), 'лимит: три запроса в минуту проходят');
    $ok(!$limit->hit('upload', $t + 3), 'лимит: четвёртый в ту же минуту — отказ');
    $ok($limit->hit('fetch', $t + 3), 'лимит считается отдельно по видам запросов');
    $ok(!(new RateLimit(3, $tmp, 'tester'))->hit('upload', $t + 30), 'счётчик общий для запросов одного пользователя');
    $ok((new RateLimit(3, $tmp, 'другой'))->hit('upload', $t + 30), 'у другого пользователя свой счётчик');
    $ok($limit->hit('upload', $t + 61), 'через минуту снова можно');
    $ok((new RateLimit(0, $tmp, 'tester'))->hit('upload', $t + 61), '0 — без лимита');
    $files = glob($tmp . DIRECTORY_SEPARATOR . '*.json') ?: [];
    $ok($files && !array_filter($files, static fn($f) => str_contains($f, 'tester') || str_contains($f, 'upload')), 'имена файлов счётчиков не раскрывают, кто и что');

    // --- настройка rate ---
    $c = Config::fromArray([]);
    $ok($c->getRates() === ['upload' => 60, 'fetch' => 20], 'по умолчанию: 60 загрузок и 20 запросов наружу в минуту');
    $ok(Config::fromArray(['rate' => ['fetch' => 5]])->getRates() === ['fetch' => 5, 'upload' => 60], 'rate: можно задать один вид');
    $ok($throws(fn() => Config::fromArray(['rate' => ['uploads' => 5]]), 'rate: нужен массив'), 'rate: опечатка в ключе — ошибка');
    $ok($throws(fn() => Config::fromArray(['rate' => ['upload' => -1]]), 'rate.upload'), 'rate: отрицательное число — ошибка');
    $ok($throws(fn() => Config::fromArray(['rate' => ['upload' => '60']]), 'rate.upload'), 'rate: строка вместо числа — ошибка');

    // --- лимит в обработчиках: загрузка и карточка ---
    $_SERVER['REMOTE_ADDR'] = '203.0.113.' . random_int(1, 254) . '-' . bin2hex(random_bytes(4));   // свой счётчик на каждый прогон
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $one = Config::fromArray(['files' => ['dir' => $tmp . DIRECTORY_SEPARATOR . 'uf'], 'rate' => ['upload' => 1, 'fetch' => 1]]);
    ob_start();
    $one->respondToUpload('/page/', 'full', true);
    $first = (string) ob_get_clean();
    ob_start();
    $one->respondToUpload('/page/', 'full', true);
    $second = (string) ob_get_clean();
    $ok(!str_contains($first, 'Слишком много') && str_contains($second, 'Слишком много запросов'), 'загрузка: сверх лимита — отказ 429');
    $_POST = ['action' => 'delete', 'urls' => '[]'];
    ob_start();
    $one->respondToUpload('/page/', 'full', true);
    $del = (string) ob_get_clean();
    $ok(!str_contains($del, 'Слишком много'), 'удаление после сохранения лимитом не ограничено');
    $_POST = [];
    $_GET = ['url' => 'http://127.0.0.1/'];
    ob_start();
    $one->respondToOpenGraph();
    $og1 = (string) ob_get_clean();
    ob_start();
    $one->respondToOpenGraph();
    $og2 = (string) ob_get_clean();
    $ok(!str_contains($og1, 'Слишком много') && str_contains($og2, 'Слишком много запросов'), 'карточка по ссылке: сверх лимита — отказ 429');

    // --- «двойные» GIF: картинка + страница ---
    $gif = "GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;";
    $write = static function (string $name, string $bytes) use ($tmp): string {
        $p = $tmp . DIRECTORY_SEPARATOR . $name;
        file_put_contents($p, $bytes);
        return $p;
    };
    $ok(!MediaStorage::hasCode($write('clean.gif', $gif)), 'обычный GIF принимается');
    foreach (['<script>alert(1)</script>', '<html><body>', '<?php system($_GET[1]); ?>', '<!DOCTYPE html>', '<SVG onload=alert(1)>', '<iframe src=x>', 'javascript:alert(1)', '<img src=x onerror=alert(1)>', '<details open ontoggle=alert(1)>', '<form action=x>', '<x onclick=alert(1)>'] as $code) {
        $ok(MediaStorage::hasCode($write('poly.gif', $gif . $code)), 'GIF с кодом отклоняется: ' . $code);
        $ok(MediaStorage::hasCode($write('poly2.gif', substr($gif, 0, 13) . $code . substr($gif, 13))), 'GIF с кодом внутри отклоняется: ' . $code);
    }
    // большие двоичные данные не дают ложного отказа
    mt_srand(7);
    $noise = '';
    for ($i = 0; $i < 4_000_000; $i++) {
        $noise .= chr(mt_rand(0, 255));
    }
    $ok(!MediaStorage::hasCode($write('noise.gif', $gif . $noise)), 'GIF 4 МБ случайных данных — без ложного отказа');
    $ok(MediaStorage::hasCode($write('edge.gif', str_repeat('A', (1 << 20) - 3) . '<script>')), 'признак на стыке кусков чтения находится');

    // --- типы файлов ---
    $types = (new ReflectionClass(MediaStorage::class))->getConstant('TYPES');
    $all = array_merge(...array_values(array_map('array_keys', $types)));
    $ok(!array_filter($all, static fn($m) => preg_match('~svg|html|javascript|ecmascript|^text/|/xml$|\+xml$~', $m) === 1), 'SVG, HTML, XML и скрипты не принимаются');
    $ok(str_contains((string) file_get_contents(dirname(__DIR__, 2) . '/resources/uf.htaccess'), 'nosniff') && str_contains((string) file_get_contents(dirname(__DIR__, 2) . '/resources/uf.htaccess'), 'sandbox'), 'uf.htaccess: nosniff и CSP sandbox в папке файлов');
} finally {
    foreach (glob($tmp . DIRECTORY_SEPARATOR . '{,*/,*/*/,*/*/*/}*', GLOB_BRACE) ?: [] as $f) {
        if (is_file($f)) {
            @unlink($f);
        }
    }
    foreach (array_reverse(glob($tmp . DIRECTORY_SEPARATOR . '{*,*/*,*/*/*}', GLOB_BRACE | GLOB_ONLYDIR) ?: []) as $d) {
        @rmdir($d);
    }
    @rmdir($tmp);
}

echo 'Безопасность сервера (загрузка, лимит частоты): проверок ' . $count . ', замечаний ' . count($fails) . PHP_EOL;
foreach ($fails as $f) {
    echo '  ✗ ' . $f . PHP_EOL;
}
exit($fails ? 1 : 0);
