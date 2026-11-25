<?php

declare(strict_types=1);

namespace Simflex\Texted;

use DOMDocument;
use RuntimeException;
use Throwable;

/**
 * Карточка ссылки для блока «Встраивание» (этап 6.4): заголовок, описание, картинка и название сайта по разметке OpenGraph.
 * Редактор сам во внешний интернет не ходит (решение D9) — страницу читает сервер CMS:
 *
 *   require 'ted/php/opengraph.php';
 *   // после проверки авторизации CMS и CSRF:
 *   tedRespondToOpenGraph();            // читает url из тела запроса (JSON {"url": "..."}) и отвечает JSON карточки
 *
 * Защита от запросов во внутреннюю сеть (SSRF): только http / https, порты 80 / 443, адрес сайта не должен вести
 * в частные, служебные и локальные сети (проверяется каждый переход по перенаправлению, не больше трёх), время — 6 с,
 * размер — до 1 МБ, только text/html. Из ответа берутся только строки; на сайт карточка попадает через Sanitizer.
 */
final class OpenGraph
{
    private const MAX_BYTES = 1_000_000;
    private const TIMEOUT = 6;
    private const MAX_REDIRECTS = 3;
    private const TOTAL_TIME = 15;   // секунд на весь запрос с переходами

    /** Адрес можно запрашивать: http(s), стандартный порт, без логина, хост ведёт только в публичные адреса. */
    public static function isAllowedUrl(string $url): bool
    {
        return self::resolve($url) !== null;
    }

    /**
     * Проверить адрес и узнать, куда подключаться: http(s), порт 80 / 443, без логина, все адреса хоста — публичные.
     * Возвращает хост и проверенные IP; запрос потом идёт именно на проверенный IP (pinned), а не резолвится заново —
     * так подмена DNS между проверкой и запросом (DNS rebinding) не приведёт во внутреннюю сеть. null — адрес нельзя.
     * @return array{scheme: string, host: string, port: int, path: string, ips: string[]}|null
     */
    public static function resolve(string $url): ?array
    {
        $p = parse_url(trim($url));
        $scheme = strtolower((string) ($p['scheme'] ?? ''));
        if ($p === false || !in_array($scheme, ['http', 'https'], true)) {
            return null;
        }
        if (isset($p['user']) || isset($p['pass'])) {
            return null;
        }
        $port = isset($p['port']) ? (int) $p['port'] : ($scheme === 'https' ? 443 : 80);
        if (!in_array($port, [80, 443], true)) {
            return null;
        }
        $host = strtolower(trim((string) ($p['host'] ?? ''), '[]'));
        if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            return null;
        }
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : array_merge(@gethostbynamel($host) ?: [], self::ipv6($host));
        if (!$ips) {
            return null;
        }
        foreach ($ips as $ip) {
            if (!self::isPublicIp($ip)) {
                return null;
            }
        }
        $path = ($p['path'] ?? '') !== '' ? $p['path'] : '/';
        if (isset($p['query'])) {
            $path .= '?' . $p['query'];
        }
        return ['scheme' => $scheme, 'host' => $host, 'port' => $port, 'path' => $path, 'ips' => array_values(array_unique($ips))];
    }

    /** Публичный адрес: не частная сеть, не служебные диапазоны, не локальный и не IPv4 внутри IPv6. */
    public static function isPublicIp(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
        // проверка по байтам, а не по записи: [0064:ff9b:0000::7f00:1] и 64:ff9b::7f00:1 — один адрес (проверка 22.11)
        $b = @inet_pton($ip);
        if ($b === false) {
            return false;
        }
        if (strlen($b) === 4) {
            [$a, $c] = [ord($b[0]), ord($b[1])];
            if ($a === 0 || $a >= 224) {
                return false;
            }                                   // 0/8, групповые 224/4 и 240/4
            if ($a === 100 && $c >= 64 && $c <= 127) {
                return false;
            }                      // 100.64/10 (CGNAT)
            if ($a === 169 && $c === 254) {
                return false;
            }                                 // 169.254/16
            // 198.18/15 (стенды) не закрываем: прокси и VPN в режиме fake-ip отдают такие адреса на все имена — карточки по ссылке перестали бы работать
            if ($a === 192 && $c === 0 && ord($b[2]) === 0) {
                return false;
            }               // 192.0.0/24
            return true;
        }
        $hex = bin2hex($b);
        if (str_starts_with($hex, str_repeat('0', 24))) {
            return false;
        }                  // ::/96 (IPv4 внутри, ::1, ::)
        if (str_starts_with($hex, str_repeat('0', 20) . 'ffff')) {
            return false;
        }         // ::ffff:0:0/96
        if (str_starts_with($hex, '0064ff9b')) {
            return false;
        }                            // NAT64 64:ff9b::/96 и 64:ff9b:1::/48
        if (str_starts_with($hex, '2002') || str_starts_with($hex, '20010000')) {
            return false;
        }   // 6to4 и Teredo (IPv4 внутри)
        $first = hexdec(substr($hex, 0, 2));
        $second = hexdec(substr($hex, 2, 2));
        if (($first & 0xFE) === 0xFC) {
            return false;
        }                                     // fc00::/7
        if ($first === 0xFE && ($second & 0xC0) >= 0x80) {
            return false;
        }                  // fe80::/10 и fec0::/10
        if ($first === 0xFF) {
            return false;
        }                                              // групповые ff00::/8
        return true;
    }

    /**
     * Адрес для подключения к проверенному IP и заголовки: Host и имя для проверки сертификата — исходный хост.
     * @param array{scheme: string, host: string, port: int, path: string, ips: string[]} $target
     * @return array{url: string, host: string, peer: string}
     */
    public static function getPinnedTarget(array $target): array
    {
        $ip = $target['ips'][0];
        $literal = str_contains($ip, ':') ? '[' . $ip . ']' : $ip;
        $default = $target['scheme'] === 'https' ? 443 : 80;
        $port = $target['port'] === $default ? '' : ':' . $target['port'];
        return ['url' => $target['scheme'] . '://' . $literal . $port . $target['path'], 'host' => $target['host'] . $port, 'peer' => $target['host']];
    }

    private static function ipv6(string $host): array
    {
        if (!function_exists('dns_get_record')) {
            return [];
        }
        $out = [];
        foreach (@dns_get_record($host, DNS_AAAA) ?: [] as $r) {
            if (!empty($r['ipv6'])) {
                $out[] = $r['ipv6'];
            }
        }
        return $out;
    }

    /** Скачать страницу и разобрать карточку. Исключение — с понятным текстом для автора. */
    public static function fetch(string $url): array
    {
        $got = self::download($url, 'text/html', self::MAX_BYTES, static fn(string $type): bool => $type === '' || str_contains($type, 'html'), 'По ссылке не страница');
        return self::parse($got['body'], $got['url']);
    }

    /**
     * Скачать файл по внешней ссылке с защитой от запросов во внутреннюю сеть (общая для карточки и картинки по ссылке):
     * каждый переход проверяется allowedUrl, не больше трёх перенаправлений, время — 6 с, размер — до $maxBytes.
     * @return array{body: string, url: string, type: string}
     */
    public static function download(string $url, string $accept, int $maxBytes, callable $typeOk, string $wrongType): array
    {
        $current = trim($url);
        if (str_starts_with(strtolower($current), 'https:') && !in_array('https', stream_get_wrappers(), true)) {
            throw new RuntimeException('на сервере не подключено расширение PHP openssl');
        }
        $deadline = microtime(true) + self::TOTAL_TIME;   // общее время на все переходы и чтение (медленная отдача по байту не держит сервер)
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $target = self::resolve($current);
            if ($target === null) {
                throw new RuntimeException('Адрес недоступен');
            }
            $pin = self::getPinnedTarget($target);   // подключаемся к проверенному IP: DNS второй раз не спрашиваем
            $ctx = stream_context_create([
                'http' => ['method' => 'GET', 'follow_location' => 0, 'timeout' => self::TIMEOUT, 'ignore_errors' => true,
                    'header' => "Host: {$pin['host']}\r\nConnection: close\r\nAccept: {$accept}\r\nUser-Agent: Mozilla/5.0 (compatible; TedCard/1.0)\r\n"],
                'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $pin['peer'], 'SNI_enabled' => true],
            ]);
            $fh = @fopen($pin['url'], 'rb', false, $ctx);
            if (!$fh) {
                throw new RuntimeException('Адрес не открылся');
            }
            $meta = stream_get_meta_data($fh);
            $headers = $meta['wrapper_data'] ?? [];
            $status = 0;
            $location = '';
            $type = '';
            $length = -1;
            foreach ($headers as $h) {
                if (preg_match('~^HTTP/\S+\s+(\d{3})~', $h, $m)) {
                    $status = (int) $m[1];
                    $location = '';
                    $type = '';
                    $length = -1;
                } elseif (stripos($h, 'Location:') === 0) {
                    $location = trim(substr($h, 9));
                } elseif (stripos($h, 'Content-Type:') === 0) {
                    $type = strtolower(trim(substr($h, 13)));
                } elseif (stripos($h, 'Content-Length:') === 0) {
                    $length = (int) trim(substr($h, 15));
                }
            }
            if ($status >= 300 && $status < 400 && $location !== '') {
                fclose($fh);
                $current = self::absolute($location, $current);
                continue;
            }
            if ($status !== 200) {
                fclose($fh);
                throw new RuntimeException('Сайт ответил ошибкой ' . $status);
            }
            if (!$typeOk($type)) {
                fclose($fh);
                throw new RuntimeException($wrongType);
            }
            if ($length > $maxBytes) {
                fclose($fh);
                throw new RuntimeException('Файл слишком большой');
            }
            stream_set_timeout($fh, self::TIMEOUT);
            $body = '';
            while (!feof($fh) && strlen($body) <= $maxBytes) {
                if (microtime(true) > $deadline) {
                    fclose($fh);
                    throw new RuntimeException('Сайт отвечает слишком долго');
                }
                $chunk = fread($fh, 65536);
                if ($chunk === false || ($chunk === '' && stream_get_meta_data($fh)['timed_out'])) {
                    break;
                }
                $body .= $chunk;
            }
            fclose($fh);
            if (strlen($body) > $maxBytes) {
                if ($accept !== 'text/html') {
                    throw new RuntimeException('Файл слишком большой');
                }
                $body = substr($body, 0, $maxBytes);   // страницу для карточки достаточно прочитать с начала
            }
            return ['body' => $body, 'url' => $current, 'type' => $type];
        }
        throw new RuntimeException('Слишком много перенаправлений');
    }

    /** Разбор разметки: og:*, twitter:*, <title>, description. */
    public static function parse(string $html, string $url): array
    {
        if (!preg_match('/charset=["\']?utf-?8/i', substr($html, 0, 4096)) && preg_match('/charset=["\']?(windows-1251|cp1251|koi8-r)/i', substr($html, 0, 4096), $m)) {
            if (function_exists('mb_convert_encoding')) {
                $html = (string) @mb_convert_encoding($html, 'UTF-8', $m[1]);
            } elseif (function_exists('iconv')) {
                $html = (string) @iconv($m[1], 'UTF-8//IGNORE', $html);
            }
        }
        $doc = new DOMDocument();
        $prev = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($prev);
        $meta = [];
        foreach ($doc->getElementsByTagName('meta') as $m) {
            $k = strtolower($m->getAttribute('property') ?: $m->getAttribute('name'));
            if ($k !== '' && !isset($meta[$k])) {
                $meta[$k] = $m->getAttribute('content');
            }
        }
        $titleTag = $doc->getElementsByTagName('title')->item(0);
        // без mbstring: обрезка по символам UTF-8 регулярным выражением
        $cut = static fn(string $s, int $n): string => function_exists('mb_substr') ? mb_substr($s, 0, $n) : (preg_match('/\A.{0,' . $n . '}/us', $s, $mm) ? $mm[0] : '');
        $clean = static fn($s, $n) => $cut(trim((string) preg_replace('/\s+/u', ' ', html_entity_decode((string) $s, ENT_QUOTES | ENT_HTML5, 'UTF-8'))), $n);
        $image = $meta['og:image'] ?? $meta['og:image:url'] ?? $meta['twitter:image'] ?? '';
        $image = $image !== '' ? self::absolute($image, $url) : '';
        if ($image !== '' && !preg_match('~^https?://~i', $image)) {
            $image = '';
        }
        $host = (string) parse_url($url, PHP_URL_HOST);
        return [
            'url' => $clean($meta['og:url'] ?? '', 2000) !== '' && preg_match('~^https?://~i', $meta['og:url']) ? $clean($meta['og:url'], 2000) : $url,
            'title' => $clean($meta['og:title'] ?? $meta['twitter:title'] ?? ($titleTag ? $titleTag->textContent : ''), 200),
            'text' => $clean($meta['og:description'] ?? $meta['twitter:description'] ?? $meta['description'] ?? '', 500),
            'image' => $image,
            'site' => $clean($meta['og:site_name'] ?? preg_replace('/^www\./', '', $host), 80),
        ];
    }

    private static function absolute(string $ref, string $base): string
    {
        $ref = trim($ref);
        if (preg_match('~^https?://~i', $ref)) {
            return $ref;
        }
        if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $ref)) {
            return '';
        }   // javascript:, data: и прочие схемы — не ссылка
        $b = parse_url($base);
        $origin = ($b['scheme'] ?? 'https') . '://' . ($b['host'] ?? '');
        if (str_starts_with($ref, '//')) {
            return ($b['scheme'] ?? 'https') . ':' . $ref;
        }
        if (str_starts_with($ref, '/')) {
            return $origin . $ref;
        }
        $dir = preg_replace('~/[^/]*$~', '/', $b['path'] ?? '/');
        return $origin . $dir . $ref;
    }

    /**
     * Ответ на запрос редактора: тело — JSON {"url": "..."}; ответ — JSON карточки или {"error": "..."}.
     * Вызывать после проверки авторизации CMS.
     *
     * @param bool $isEnabled Настройка opengraph из ted.config.php (Config::isOpenGraphEnabled()): выключено — сервер
     *     чужие страницы не читает
     */
    public static function respondToRequest(bool $isEnabled = true): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        if (!$isEnabled) {
            http_response_code(403);
            echo json_encode(['error' => 'Карточки по ссылке выключены в настройках'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $body = json_decode((string) file_get_contents('php://input', false, null, 0, 10_000), true);
        $url = is_array($body) ? (string) ($body['url'] ?? '') : '';
        try {
            echo json_encode(self::fetch($url), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (Throwable $e) {
            http_response_code(422);
            echo json_encode(['error' => $e->getMessage()], JSON_UNESCAPED_UNICODE);
        }
    }
}
