<?php
declare(strict_types=1);
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

/**
 * Тест карточки ссылки (php/opengraph.php) без сети: разбор разметки OpenGraph и защита от запросов во внутреннюю сеть.
 * Запуск: php ted/php/test-opengraph.php
 */
require __DIR__ . '/opengraph.php';

$fail = [];
$check = static function (bool $ok, string $what) use (&$fail): void { if (!$ok) $fail[] = $what; };

$html = '<html><head><meta charset="utf-8"><title>Запасной заголовок</title>'
    . '<meta property="og:title" content="Весенняя &amp; коллекция">'
    . '<meta property="og:description" content="  Посмотрите   первые десять вещей. ">'
    . '<meta property="og:image" content="/img/a.jpg">'
    . '<meta property="og:site_name" content="Simflex Shop">'
    . '</head><body><script>alert(1)</script></body></html>';
$card = TedOpenGraph::parse($html, 'https://blog.example.com/spring/');
$check($card['title'] === 'Весенняя & коллекция', 'og:title с сущностью: ' . $card['title']);
$check($card['text'] === 'Посмотрите первые десять вещей.', 'пробелы в описании: ' . $card['text']);
$check($card['image'] === 'https://blog.example.com/img/a.jpg', 'картинка — абсолютный адрес: ' . $card['image']);
$check($card['site'] === 'Simflex Shop', 'og:site_name');
$check($card['url'] === 'https://blog.example.com/spring/', 'адрес страницы');

$plain = TedOpenGraph::parse('<title>Только заголовок</title><meta name="description" content="Описание">', 'https://www.site.example/x');
$check($plain['title'] === 'Только заголовок' && $plain['text'] === 'Описание' && $plain['site'] === 'site.example', 'без og: — title, description, домен');

$bad = TedOpenGraph::parse('<meta property="og:image" content="javascript:alert(1)"><meta property="og:url" content="javascript:alert(1)">', 'https://a.example/');
$check($bad['image'] === '' && $bad['url'] === 'https://a.example/', 'javascript: в og:image и og:url отброшен');

foreach (['http://127.0.0.1/', 'http://localhost/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'file:///etc/passwd', 'ftp://example.com/', 'https://user:pass@example.com/', 'https://example.com:8080/', 'http://0.0.0.0/', 'http://100.64.0.1/', 'gopher://example.com/', 'http://[0064:ff9b:0000::7f00:1]/', 'http://[::7f00:1]/', 'http://[fec0::1]/', 'http://224.0.0.1/', 'http://192.0.0.8/', 'http://[2001:0::1]/'] as $u) {
    $check(!TedOpenGraph::allowedUrl($u), "запрещён адрес $u");
}
$check(TedOpenGraph::allowedUrl('https://93.184.215.14/'), 'публичный IP разрешён');

// этап 3: закрепление проверенного адреса (против подмены DNS между проверкой и запросом)
foreach (['http://[::ffff:127.0.0.1]/', 'http://[::ffff:7f00:1]/', 'http://[64:ff9b::7f00:1]/', 'http://[2002:7f00:1::]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://127.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'https://a.localhost/', 'https://printer.local/', 'https://db.internal/', 'https://example.com:444/'] as $u) {
    $check(!TedOpenGraph::allowedUrl($u), "запрещён адрес $u");
}
$t = TedOpenGraph::resolve('https://93.184.215.14/a/b?c=1&d=2');
$check($t !== null && $t['ips'] === ['93.184.215.14'] && $t['path'] === '/a/b?c=1&d=2' && $t['port'] === 443, 'resolve: адрес, путь с запросом, порт');
$pin = TedOpenGraph::pinned(['scheme' => 'https', 'host' => 'example.com', 'port' => 443, 'path' => '/x?y=1', 'ips' => ['93.184.215.14', '1.1.1.1']]);
$check($pin === ['url' => 'https://93.184.215.14/x?y=1', 'host' => 'example.com', 'peer' => 'example.com'], 'запрос идёт на проверенный IP, Host и сертификат — исходного сайта: ' . json_encode($pin));
$pin6 = TedOpenGraph::pinned(['scheme' => 'http', 'host' => 'example.com', 'port' => 80, 'path' => '/', 'ips' => ['2606:2800:220:1::1']]);
$check($pin6['url'] === 'http://[2606:2800:220:1::1]/', 'IPv6 в квадратных скобках: ' . $pin6['url']);
$src = (string) file_get_contents(__DIR__ . '/opengraph.php');
$check(str_contains($src, "fopen(\$pin['url']") && !str_contains($src, 'fopen($current'), 'download подключается к закреплённому адресу, а не к имени сайта');

printf("Карточка ссылки: проверок %d, замечаний %d\n", 43, count($fail));
foreach ($fail as $f) echo "  ✗ $f\n";
exit($fail ? 1 : 0);
