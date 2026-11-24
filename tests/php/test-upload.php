<?php

declare(strict_types=1);

/**
 * Загрузка файлов на демо-сервере (bin/demo/media-demo.php, php -S): PNG → WebP, видео, аудио, файлы и GIF как есть,
 * отдача частями (Range), удаление после сохранения без CMS, одинаковые названия, картинка по ссылке (не во внутреннюю
 * сеть), «двойной» GIF, конвертация в WebM (если есть ffmpeg), право на правку и набор поля решает сервер.
 * Папка файлов и настройки — во временной папке (TED_FILES_DIR, TED_CONFIG): пакет не трогается.
 *
 *   php tests/php/test-upload.php      (запускает bin/test.php --full)
 */

namespace Simflex\Texted\Tools;

use Simflex\Texted\MediaStorage;

require dirname(__DIR__, 2) . '/bin/lib.php';
require __DIR__ . '/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
useUtf8Console();

/** Ответ демо-сервера: код, заголовки строкой, тело */
final class Response
{
    public function __construct(public int $status, public string $headers, public string $body)
    {
    }

    /** @return array<string, mixed> */
    public function json(): array
    {
        $data = json_decode($this->body, true);
        return is_array($data) ? $data : [];
    }
}

/** Клиент демо-сервера с cookie сессии (как браузер одного пользователя) */
final class Client
{
    private string $cookie = '';

    public function __construct(private string $server)
    {
    }

    /**
     * @param array<string, string> $fields
     * @param array<string, array{0: string, 1: string}> $files поле → [имя файла, содержимое]
     */
    public function post(string $path, array $fields = [], array $files = [], ?string $raw = null): Response
    {
        $boundary = 'ted' . bin2hex(random_bytes(8));
        if ($raw === null) {
            $body = '';
            foreach ($fields as $name => $value) {
                $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n";
            }
            foreach ($files as $name => [$filename, $content]) {
                $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$name\"; filename=\"$filename\"\r\n"
                    . "Content-Type: application/octet-stream\r\n\r\n$content\r\n";
            }
            $body .= "--$boundary--\r\n";
            $type = "multipart/form-data; boundary=$boundary";
        } else {
            $body = $raw;
            $type = 'text/html; charset=utf-8';
        }
        return $this->send('POST', $path, ["Content-Type: $type", 'X-Ted-Demo: media'], $body);
    }

    /** @param string[] $headers */
    public function get(string $path, array $headers = []): Response
    {
        return $this->send('GET', $path, $headers);
    }

    /** @param string[] $headers */
    private function send(string $method, string $path, array $headers, ?string $body = null): Response
    {
        if ($this->cookie !== '') {
            $headers[] = 'Cookie: ' . $this->cookie;
        }
        $context = stream_context_create(['http' => [
            'method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body ?? '',
            'ignore_errors' => true, 'follow_location' => 0, 'timeout' => 120,
        ]]);
        $result = @file_get_contents($this->server . $path, false, $context);
        $responseHeaders = $http_response_header ?? [];
        $status = preg_match('~^HTTP/\S+\s+(\d{3})~', $responseHeaders[0] ?? '', $m) ? (int) $m[1] : 0;
        foreach ($responseHeaders as $header) {
            if (preg_match('/^Set-Cookie:\s*(PHPSESSID=[^;]+)/i', $header, $m)) {
                $this->cookie = $m[1];
            }
        }
        return new Response($status, implode("\n", $responseHeaders), $result === false ? '' : $result);
    }

    public function hasSession(): bool
    {
        return $this->cookie !== '';
    }
}

$failures = [];
$check = static function (bool $ok, string $name) use (&$failures): void {
    if (!$ok) {
        $failures[] = $name;
        echo "  ✗ $name\n";
    }
};
$say = static fn(string $text) => print("PHP: $text\n");

$root = makeTempDir('ted-php-upload-');
$filesDir = $root . DIRECTORY_SEPARATOR . 'uf';
$config = $root . DIRECTORY_SEPARATOR . 'ted.config.php';
file_put_contents($config, "<?php\nreturn ['files' => ['dir' => getenv('TED_FILES_DIR'), 'url' => '/uf']];\n");
$port = getFreePort(8151);
$server = "http://127.0.0.1:$port";
$phpArgs = [...getPhpArgs(), '-d', 'upload_max_filesize=5M', '-d', 'post_max_size=6M', '-d', 'session.save_path=' . $root];
$process = startServer($port, getRoot() . '/bin/demo/media-demo.php', $phpArgs, ['TED_FILES_DIR' => $filesDir, 'TED_CONFIG' => $config], $root . '/php.log');
$fileUrl = static fn(string $url): string => $root . str_replace('/', DIRECTORY_SEPARATOR, $url);

try {
    $client = new Client($server);
    $remove = static function (array $urls) use ($client): array {
        $answer = $client->post('/ted-demo-media/upload', ['action' => 'delete', 'urls' => json_encode(array_values($urls))])->json();
        clearstatcache();   // is_file() после удаления сервером — без кэша PHP
        return $answer;
    };

    // PNG → WebP по публичному пути страницы
    $png = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC');
    $asset = $client->post('/ted-demo-media/upload', ['kind' => 'image', 'pagePath' => '/ignored/'], ['file' => ['photo.png', $png]])->json();
    $check(($asset['url'] ?? '') === '/uf/images/company/photo.webp', 'PNG → /uf/images/company/photo.webp: ' . json_encode($asset, JSON_UNESCAPED_UNICODE));
    $check($client->hasSession(), 'сессия загрузки сохранена (cookie PHPSESSID)');
    $created = $fileUrl($asset['url'] ?? '/none');
    $check(is_file($created) && substr((string) file_get_contents($created), 8, 4) === 'WEBP', 'файл сохранён в WebP');

    // сохранение со ссылкой на картинку — файл остаётся; удаление без CMS — только свои файлы страницы
    $saved = $client->post('/ted-demo-media/save', raw: '<figure><img src="' . ($asset['url'] ?? '') . '"></figure>')->json();
    $check(!empty($saved['saved']) && is_file($created), 'картинка из сохранённого документа остаётся');
    $deleted = $remove(['/etc/passwd', '/uf/images/other-page/' . basename((string) ($asset['url'] ?? '')), $asset['url'] ?? '']);
    $check(($deleted['removed'] ?? 0) === 1 && !is_file($created), 'удалена только своя картинка: ' . json_encode($deleted));

    // видео и файл — как есть; MP3 со служебными данными перед звуком принимается по содержимому, мусор .mp3 — нет
    $mp4 = pack('C*', 0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, 109, 112, 52, 50, 105, 115, 111, 109, 0, 0, 0, 8, 102, 114, 101, 101);
    $pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF";
    $video = $client->post('/ted-demo-media/upload', ['kind' => 'video'], ['file' => ['clip.mp4', $mp4]])->json();
    $check(($video['url'] ?? '') === '/uf/video/company/clip.mp4' && ($video['type'] ?? '') === 'mp4' && empty($video['converted']), 'MP4 как есть: ' . json_encode($video));
    $frame = "\xFF\xFB\x90\x00" . str_repeat("\0", 413);   // MPEG-1 Layer III, 128 кбит/с, 44,1 кГц: кадр 417 байт
    $audio = $client->post('/ted-demo-media/upload', ['kind' => 'audio'], ['file' => ['lead-junk.mp3', str_repeat("\0", 700) . $frame . $frame . $frame]])->json();
    $check(($audio['url'] ?? '') === '/uf/audio/company/lead-junk.mp3', 'MP3 с данными перед звуком принят: ' . json_encode($audio));
    $junk = implode('', array_map(static fn(int $i) => chr(($i * 37) % 251), range(1, 200)));
    $bad = $client->post('/ted-demo-media/upload', ['kind' => 'audio'], ['file' => ['junk.mp3', $junk]])->json();
    $check(isset($bad['error']) && !isset($bad['url']), 'мусор с расширением .mp3 отклонён');

    // аудио и видео отдаются частями (Range) — иначе браузер не перематывает; вне папки файлов — нет
    @mkdir($filesDir . '/audio', 0775, true);
    file_put_contents($filesDir . '/audio/_range-test.mp3', implode('', array_map('chr', range(0, 199))));
    $range = $client->get('/uf/audio/_range-test.mp3', ['Range: bytes=10-19']);
    $check($range->status === 206 && str_contains($range->headers, 'Content-Range: bytes 10-19/200') && str_contains($range->headers, 'Accept-Ranges: bytes') && $range->body === implode('', array_map('chr', range(10, 19))), 'Range: 206 и нужные байты');
    $outside = $client->get('/uf/../src/MediaStorage.php.mp3');
    $check(!in_array($outside->status, [200, 206], true), 'вне папки файлов не отдаётся: ' . $outside->status);
    @unlink($filesDir . '/audio/_range-test.mp3');

    $doc = $client->post('/ted-demo-media/upload', ['kind' => 'file'], ['file' => ['doc.pdf', $pdf]])->json();
    $check(($doc['url'] ?? '') === '/uf/files/company/doc.pdf', 'PDF как есть: ' . json_encode($doc));
    $deleted = $remove([$video['url'] ?? '']);
    $check(($deleted['removed'] ?? 0) === 1 && !is_file($fileUrl($video['url'] ?? '/none')) && is_file($fileUrl($doc['url'] ?? '/none')), 'удалено видео, файл на месте');
    $deleted = $remove([$doc['url'] ?? '']);
    $check(($deleted['removed'] ?? 0) === 1 && !is_file($fileUrl($doc['url'] ?? '/none')), 'файл удалён');

    // названия: кириллица — латиницей, одинаковые получают номер
    $slugs = implode('|', array_map([MediaStorage::class, 'slugify'], ['Октябрь 2026 — ТЗ.pdf', 'ТЗ_для_Гротеска_правки_после_приёмки_05_11.pdf', 'Щука, ёж.docx', 'con.pdf', '....pdf'])) . '|';
    $check($slugs === 'oktyabr-2026-tz|tz-dlya-groteska-pravki-posle-priyomki-05-11|shchuka-yozh|file-con|file|', 'транслитерация: ' . $slugs);
    $same = array_map(static fn() => $client->post('/ted-demo-media/upload', ['kind' => 'file'], ['file' => ['doc.pdf', $pdf]])->json()['url'] ?? '', [1, 2, 3]);
    $check(str_ends_with($same[0], '/doc.pdf') && str_ends_with($same[1], '/doc-2.pdf') && str_ends_with($same[2], '/doc-3.pdf'), 'одинаковые названия: ' . implode(' ', $same));
    $check(($remove($same)['removed'] ?? 0) === 3, 'файлы с номерами удалены');

    // картинка по ссылке: во внутреннюю сеть сервер не ходит, не http(s) — отказ
    foreach (['http://127.0.0.1/a.png', 'http://169.254.169.254/latest/meta-data', "http://localhost:$port/examples/admin.html", 'file:///etc/passwd', 'javascript:alert(1)'] as $url) {
        $answer = $client->post('/ted-demo-media/upload', ['action' => 'fetch', 'url' => $url])->json();
        $check(isset($answer['error']) && !isset($answer['url']), "картинка по ссылке $url — отказ");
    }

    // GIF не конвертируется (анимация остаётся); «двойной» GIF с HTML не принимается
    $gif = pack('C*', 71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59);
    $animated = $client->post('/ted-demo-media/upload', ['kind' => 'image'], ['file' => ['anim.gif', $gif]])->json();
    $check(($animated['url'] ?? '') === '/uf/images/company/anim.gif' && ($animated['type'] ?? '') === 'gif' && empty($animated['converted']), 'GIF как есть: ' . json_encode($animated));
    $check((string) @file_get_contents($fileUrl($animated['url'] ?? '/none')) === $gif, 'GIF не изменён');
    $remove([$animated['url'] ?? '']);
    $poly = $client->post('/ted-demo-media/upload', ['kind' => 'image'], ['file' => ['poly.gif', $gif . '<script>alert(1)</script>']])->json();
    $check(isset($poly['error']) && !isset($poly['url']) && !is_file($filesDir . '/images/company/poly.gif'), '«двойной» GIF с HTML отклонён');
    $say('«двойной» GIF с HTML отклонён.');
    $say('видео, файл и GIF сохраняются как есть; аудио и видео отдаются частями (Range); удаление по запросу после сохранения (без CMS) работает, чужие пути не трогает.');

    // конвертация в WebM и постер — нужен ffmpeg (TED_FFMPEG или PATH); без него — проверка форматов без ffmpeg
    $ffmpeg = MediaStorage::findFfmpeg();
    if ($ffmpeg !== null) {
        $avi = $root . '/clip.avi';
        exec(escapeshellarg($ffmpeg) . ' -y -v error -f lavfi -i testsrc=duration=1:size=320x180:rate=25 -c:v mpeg4 ' . escapeshellarg($avi));
        $converted = $client->post('/ted-demo-media/upload', ['kind' => 'video'], ['file' => ['clip.avi', (string) file_get_contents($avi)]])->json();
        $check(str_ends_with($converted['url'] ?? '', '.webm') && !empty($converted['converted']) && str_ends_with($converted['poster'] ?? '', '.webp'), 'AVI → WebM: ' . json_encode($converted));
        $check(str_starts_with((string) @file_get_contents($fileUrl($converted['url'] ?? '/none')), "\x1A\x45\xDF\xA3"), 'WebM (EBML)');
        $check(substr((string) @file_get_contents($fileUrl($converted['poster'] ?? '/none')), 8, 4) === 'WEBP', 'постер WebP');
        $say('AVI → WebM (VP9) и постер WebP из первого кадра проверены.');
    } else {
        $aviBytes = pack('C*', 82, 73, 70, 70, 36, 0, 0, 0, 65, 86, 73, 32, 76, 73, 83, 84, 16, 0, 0, 0, 104, 100, 114, 108, 97, 118, 105, 104, 0, 0, 0, 0, 0, 0, 0, 0);
        $rawAvi = $client->post('/ted-demo-media/upload', ['kind' => 'video'], ['file' => ['raw.avi', $aviBytes]])->json();
        $check(str_ends_with($rawAvi['url'] ?? '', '/raw.avi') && empty($rawAvi['converted']), 'AVI без ffmpeg как есть: ' . json_encode($rawAvi));
        $remove([$rawAvi['url'] ?? '']);
        $mov = pack('C*', 0, 0, 0, 20, 102, 116, 121, 112, 113, 116, 32, 32, 0, 0, 0, 0, 113, 116, 32, 32, 0, 0, 0, 8, 119, 105, 100, 101);
        $movAnswer = $client->post('/ted-demo-media/upload', ['kind' => 'video'], ['file' => ['clip.mov', $mov]])->json();
        $check(isset($movAnswer['error']) && str_contains((string) $movAnswer['error'], 'ffmpeg'), 'MOV без ffmpeg отклонён с понятной ошибкой');
        $say('без ffmpeg принимаются MP4, AVI и WebM, MOV отклоняется с понятной ошибкой; конвертацию в WebM и серверный постер не проверяли (задайте TED_FFMPEG).');
    }
    $say('PNG → WebP, публичный путь страницы, сохранение и удаление после сохранения проверены.');

    // набор поля и право на правку решает сервер (в демо — сессия), а не запрос браузера
    $readonly = new Client($server);
    $readonly->get('/ted-demo-media/config.js?preset=mini&access=ro');
    $forged = '<h2>Заголовок</h2><blockquote class="ted-callout"><p>Совет</p></blockquote>';
    $check($readonly->post('/ted-demo-media/save', raw: $forged)->status === 403, 'без права правки сохранение — 403');
    $check($readonly->post('/ted-demo-media/upload', ['kind' => 'image'], ['file' => ['photo.png', $png]])->status === 403, 'без права правки загрузка — 403');
    $check(!is_file($filesDir . '/images/company/photo-2.webp') && !is_file($filesDir . '/images/company/photo.webp'), 'без права правки файл не записан');
    $mini = new Client($server);
    $browserConfig = $mini->get('/ted-demo-media/config.js?preset=mini')->body;
    $check(str_contains($browserConfig, '"preset":"mini"') && str_contains($browserConfig, '"canEdit":true'), 'настройки браузера: набор mini, правка разрешена');
    $savedMini = (string) ($mini->post('/ted-demo-media/save', raw: $forged)->json()['html'] ?? '');
    $check(str_contains($savedMini, '<h2>Заголовок</h2>') && !str_contains($savedMini, 'ted-callout') && str_contains($savedMini, 'Совет'), 'mini: выноска сохраняется текстом: ' . $savedMini);
    $say('без права правки сохранение и загрузка отклоняются (403); набор mini — подделанная выноска сохраняется текстом.');
} finally {
    stopProcess($process);
    if ($failures && is_file($root . '/php.log')) {
        echo implode("\n", array_slice(file($root . '/php.log', FILE_IGNORE_NEW_LINES) ?: [], -20)), "\n";
    }
    removeTempDir($root, 'ted-php-upload-');
}
echo 'Загрузка файлов: замечаний ' . count($failures) . "\n";
exit($failures ? 1 : 0);
