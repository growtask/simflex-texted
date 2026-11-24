<?php

declare(strict_types=1);

namespace Simflex\Texted;

use InvalidArgumentException;
use Normalizer;
use RuntimeException;
use Throwable;
use finfo;

/**
 * Хранилище файлов для загрузки из CMS (после проверки входа и CSRF). Путь страницы берётся из записи CMS.
 * Папка на диске и её адрес для браузера задаются отдельно (ted.config.php → files.dir / files.url, этап 1):
 *   new MediaStorage('/var/www/site/uf', '/uf');                 // или Config::load()->createStorage()
 * Файлы: <папка>/<images|video|audio|files>/<путь страницы>/<имя>; адрес: <адрес папки>/<вид>/<путь страницы>/<имя>.
 * Удаление — только внутри папки и только файлов страницы с нашими именами.
 */
final class MediaStorage
{
    private const TYPES = [
        'image' => ['image/jpeg' => 'webp', 'image/png' => 'webp', 'image/webp' => 'webp', 'image/gif' => 'gif'],   // GIF не конвертируем: сохраняется как есть, анимация остаётся
        // mp4 и webm играют во всех браузерах и сохраняются как есть; остальное конвертируется в webm через ffmpeg
        'video' => ['video/mp4' => 'mp4', 'video/x-m4v' => 'mp4', 'video/webm' => 'webm',
            'video/quicktime' => 'convert', 'video/x-msvideo' => 'convert', 'video/avi' => 'convert', 'video/msvideo' => 'convert',
            'video/x-matroska' => 'convert', 'video/x-ms-asf' => 'convert', 'video/x-ms-wmv' => 'convert', 'video/x-flv' => 'convert',
            'video/mpeg' => 'convert', 'video/3gpp' => 'convert', 'application/vnd.rn-realmedia' => 'convert'],
        // у MP3 и WAV несколько названий типа; MP3 со служебными данными перед звуком finfo называет application/octet-stream — его проверяем по содержимому (isMp3)
        'audio' => ['audio/mpeg' => 'mp3', 'audio/mp3' => 'mp3', 'audio/x-mpeg' => 'mp3', 'audio/x-mp3' => 'mp3', 'audio/mpeg3' => 'mp3', 'audio/x-mpeg-3' => 'mp3',
            'audio/wav' => 'wav', 'audio/x-wav' => 'wav', 'audio/wave' => 'wav', 'audio/vnd.wave' => 'wav'],
        'file' => ['application/pdf' => 'pdf', 'application/zip' => 'zip',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx'],
    ];
    private const FOLDERS = ['image' => 'images', 'video' => 'video', 'audio' => 'audio', 'file' => 'files'];
    private const LIMITS = ['image' => 5 * 1048576, 'video' => 500 * 1048576, 'audio' => 50 * 1048576, 'file' => 20 * 1048576];

    private const IMAGE_MAX_SIDE = 2560;
    private ?int $maxSide = null;
    // имя файла на сервере: латиница, цифры и дефис (из названия загруженного файла) и расширение; прежние 32-символьные имена тоже подходят
    private const WEB_FILE = '/\A[a-z0-9][a-z0-9-]{0,79}\.(?:webp|gif|mp4|webm|avi|mp3|wav|pdf|zip|docx|xlsx)\z/';
    private const TRANSLIT = ['а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd', 'е' => 'e', 'ё' => 'yo', 'ж' => 'zh', 'з' => 'z', 'и' => 'i', 'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n', 'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't', 'у' => 'u', 'ф' => 'f', 'х' => 'kh', 'ц' => 'ts', 'ч' => 'ch', 'ш' => 'sh', 'щ' => 'shch', 'ъ' => '', 'ы' => 'y', 'ь' => '', 'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
        'і' => 'i', 'ї' => 'yi', 'є' => 'ye', 'ґ' => 'g', 'ў' => 'u'];
    private const TRANSLIT_UP = ['А' => 'a', 'Б' => 'b', 'В' => 'v', 'Г' => 'g', 'Д' => 'd', 'Е' => 'e', 'Ё' => 'yo', 'Ж' => 'zh', 'З' => 'z', 'И' => 'i', 'Й' => 'y', 'К' => 'k', 'Л' => 'l', 'М' => 'm', 'Н' => 'n', 'О' => 'o', 'П' => 'p', 'Р' => 'r', 'С' => 's', 'Т' => 't', 'У' => 'u', 'Ф' => 'f', 'Х' => 'kh', 'Ц' => 'ts', 'Ч' => 'ch', 'Ш' => 'sh', 'Щ' => 'shch', 'Ъ' => '', 'Ы' => 'y', 'Ь' => '', 'Э' => 'e', 'Ю' => 'yu', 'Я' => 'ya', 'І' => 'i', 'Ї' => 'yi', 'Є' => 'ye', 'Ґ' => 'g', 'Ў' => 'u'];

    private string $dir;
    /** @var string[] сегменты адреса папки (без схемы и хоста) */
    private array $urlPath;
    private string $urlOrigin;
    /** @var array<string, int> */
    private array $limits;
    private ?string $ffmpeg = null;

    /**
     * @param string $filesDir папка файлов на диске (создаётся, если её нет, — родитель должен существовать)
     * @param string $filesUrl адрес этой папки для браузера: «/uf» или «https://cdn.example.com/uf»
     * @param array<string, int> $limits лимиты в байтах по видам (image, video, audio, file); не указанные — по умолчанию
     * @param string|false $ffmpeg «auto» — найти (TED_FFMPEG или ffmpeg в PATH), false — не использовать, иначе путь к программе
     */
    public function __construct(string $filesDir, string $filesUrl = '/uf', array $limits = [], string|false $ffmpeg = 'auto', private ?int $maxBytes = null)
    {
        $dir = rtrim($filesDir, '/\\');
        if ($dir !== '' && !is_dir($dir) && is_dir(dirname($dir))) {
            @mkdir($dir, 0755);
        }
        $real = $dir === '' ? false : realpath($dir);
        if ($real === false || !is_dir($real) || is_link($dir) || ($maxBytes !== null && $maxBytes < 1)) {
            throw new InvalidArgumentException('Некорректная настройка хранилища texted: нет папки файлов ' . $filesDir);
        }
        $url = rtrim($filesUrl, '/');
        if (str_starts_with($filesUrl, '//') || !preg_match('~\A(https?://[^\s/?#@]+)?((?:/[^\s?#/]+)*)\z~i', $url, $m) || ($m[1] === '' && !str_starts_with($filesUrl, '/'))) {
            throw new InvalidArgumentException('Некорректный адрес папки файлов: ' . $filesUrl);
        }
        foreach ($limits as $kind => $bytes) {
            if (!isset(self::LIMITS[$kind]) || !is_int($bytes) || $bytes < 1) {
                throw new InvalidArgumentException('Некорректный лимит размера: ' . $kind);
            }
        }
        $this->dir = rtrim($real, '/\\');
        $this->urlOrigin = $m[1];
        $this->urlPath = array_values(array_filter(array_map('rawurldecode', explode('/', $m[2])), 'strlen'));
        $this->limits = $limits + self::LIMITS;
        $this->ffmpeg = $ffmpeg === false ? null : self::findFfmpeg($ffmpeg === 'auto' ? null : $ffmpeg);
    }

    /** Папка файлов на диске. */
    public function getFilesDir(): string
    {
        return $this->dir;
    }

    /** Адрес папки файлов для браузера. */
    public function getFilesUrl(): string
    {
        return $this->url([]);
    }

    /**
     * Название файла → безопасное имя латиницей: «Октябрь 2026 — ТЗ.pdf» → «oktyabr-2026-tz». Кириллица транслитерируется, остальное, кроме букв и цифр, становится дефисом.
     * Пустое имя даёт «file». Зарезервированные имена Windows (con, nul…) получают приставку.
     */
    public static function slugify(string $original): string
    {
        $base = pathinfo(str_replace('\\', '/', $original), PATHINFO_FILENAME);
        if (class_exists('Normalizer')) {
            $base = (string) (Normalizer::normalize($base) ?: $base);
        }
        $base = strtr($base, self::TRANSLIT + self::TRANSLIT_UP);   // кириллица в обоих регистрах, без зависимости от mbstring
        $base = function_exists('mb_strtolower') ? mb_strtolower($base, 'UTF-8') : strtolower($base);
        if (function_exists('transliterator_transliterate')) {
            $base = (string) transliterator_transliterate('Any-Latin; Latin-ASCII; Lower()', $base);
        }
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', $base), '-');
        $slug = rtrim(substr($slug, 0, 60), '-');
        if ($slug === '') {
            $slug = 'file';
        }
        if (preg_match('/\A(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\z/', $slug)) {
            $slug = 'file-' . $slug;
        }
        return $slug;
    }

    /** Занять свободное имя в каталоге: slug.ext, при совпадении slug-2.ext, slug-3.ext… Занятие атомарное (fopen 'x'), два одновременных файла не получат одно имя. */
    private function reserve(string $directory, string $slug, string $ext): array
    {
        for ($n = 1; $n < 10000; $n++) {
            $filename = ($n === 1 ? $slug : $slug . '-' . $n) . '.' . $ext;
            $path = $directory . DIRECTORY_SEPARATOR . $filename;
            $handle = @fopen($path, 'xb');
            if ($handle !== false) {
                fclose($handle);
                return [$filename, $path];
            }
        }
        throw new RuntimeException('Не удалось подобрать имя файла');
    }

    /** MP3 по содержимому: метка ID3 в начале или подряд два заголовка кадра MPEG Audio Layer III в первых 64 КБ. */
    private static function isMp3(string $path): bool
    {
        $head = (string) file_get_contents($path, false, null, 0, 65536);
        if (str_starts_with($head, 'ID3')) {
            return true;
        }
        $len = strlen($head);
        for ($i = 0; $i + 4 <= $len; $i++) {
            if ($head[$i] !== "\xFF" || (ord($head[$i + 1]) & 0xE6) !== 0xE2) {
                continue;
            }   // синхрослово, Layer III
            $b2 = ord($head[$i + 2]);
            $rate = $b2 >> 4;
            if ($rate === 0 || $rate === 15 || (($b2 >> 2) & 3) === 3) {
                continue;
            }
            $v = (ord($head[$i + 1]) >> 3) & 3;   // 3 — MPEG-1, 2 — MPEG-2, 0 — MPEG-2.5
            $rates = $v === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
            $srs = $v === 3 ? [44100, 48000, 32000] : ($v === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]);
            $size = intdiv(($v === 3 ? 144000 : 72000) * $rates[$rate], $srs[($b2 >> 2) & 3]) + (($b2 >> 1) & 1);
            $j = $i + $size;
            if ($size > 0 && $j + 1 < $len && $head[$j] === "\xFF" && (ord($head[$j + 1]) & 0xE6) === 0xE2) {
                return true;
            }
        }
        return false;
    }

    /** ffmpeg нужен только для конвертации видео в webm и для постеров; без него mp4 и webm работают как есть. */
    public function hasFfmpeg(): bool
    {
        return $this->ffmpeg !== null;
    }

    /** Есть ли в файле HTML, скрипт или PHP (признак «двойного» файла: картинка и страница одновременно). */
    public static function hasCode(string $path): bool
    {
        $fh = @fopen($path, 'rb');
        if (!$fh) {
            return true;
        }
        $tail = '';
        try {
            while (!feof($fh)) {
                $chunk = $tail . (string) fread($fh, 1 << 20);
                // только длинные признаки: короткие («<a », «<?=») случайно встречаются в сжатых данных большой картинки
                // расширено 22.11: формы, details (ontoggle), медиа, обработчики on…= — то, что выполнится, если файл отдать как страницу
                if (preg_match('~<(?:script|html|body|iframe|frame|frameset|svg|math|object|embed|applet|meta|link|base|style|img|details|form|input|button|select|textarea|template|video|audio|marquee)[\s/>]|[\s/"\']on[a-z]{4,}\s*=|<\?php|<!doctype|javascript:~i', $chunk) === 1) {
                    return true;
                }
                $tail = substr($chunk, -64);   // признак на стыке кусков
            }
        } finally {
            fclose($fh);
        }
        return false;
    }

    /** Путь к ffmpeg: свой путь или TED_FFMPEG / ffmpeg в PATH; null — не найден (нужен ещё bin/check.php) */
    public static function findFfmpeg(?string $path = null): ?string
    {
        if (!function_exists('exec')) {
            return null;
        }
        foreach ($path !== null ? [$path] : array_filter([getenv('TED_FFMPEG') ?: null, 'ffmpeg']) as $bin) {
            $out = [];
            $code = 1;
            @exec(escapeshellarg($bin) . ' -version 2>&1', $out, $code);
            if ($code === 0) {
                return $bin;
            }
        }
        return null;
    }

    /** @return array<string, mixed> url, name, type, size, originalSize, converted[, width, height, poster] */
    /** $maxSide — уменьшить картинку до этой стороны (160…2560; товар — 480, решение 22.11); null — до IMAGE_MAX_SIDE. */
    public function store(array $file, string $kind, string $pagePath, ?int $maxSide = null): array
    {
        $this->maxSide = $maxSide === null ? null : max(160, min(self::IMAGE_MAX_SIDE, $maxSide));
        if (!isset(self::TYPES[$kind])) {
            throw new InvalidArgumentException('Неизвестный тип файла');
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('Не удалось принять файл');
        }
        $tmp = $file['tmp_name'] ?? '';
        if (!is_string($tmp) || !is_uploaded_file($tmp)) {
            throw new InvalidArgumentException('Файл не получен через HTTP-загрузку');
        }
        return $this->storeFile($tmp, (string) ($file['name'] ?? ''), $kind, $pagePath, true);
    }

    /**
     * Картинка по внешней ссылке: сервер скачивает её (защита от запросов во внутреннюю сеть — OpenGraph::download,
     * только картинки, до 5 МБ) и обрабатывает так же, как загруженную: JPG / PNG / WEBP → WebP до 2560 px, GIF — как есть.
     */
    public function storeFromUrl(string $url, string $pagePath): array
    {
        $limit = $this->maxBytes ?? $this->limits['image'];
        try {
            $got = OpenGraph::download($url, 'image/*', $limit, static fn(string $type): bool => $type === '' || str_starts_with($type, 'image/') || str_starts_with($type, 'application/octet-stream'), 'по ссылке не картинка');
        } catch (RuntimeException $error) {
            throw new InvalidArgumentException('Картинка не скачалась: ' . $error->getMessage());
        }
        $tmp = tempnam(sys_get_temp_dir(), 'ted-url-');
        if ($tmp === false || file_put_contents($tmp, $got['body']) === false) {
            throw new RuntimeException('Не удалось подготовить файл');
        }
        $name = rawurldecode(basename((string) parse_url($got['url'], PHP_URL_PATH)));
        try {
            return $this->storeFile($tmp, $name !== '' ? $name : 'image', 'image', $pagePath, false) + ['source' => $url];
        } finally {
            if (is_file($tmp)) {
                @unlink($tmp);
            }
        }
    }

    /** Общая обработка файла: размер и тип по содержимому, сжатие, сохранение в папку файлов. $uploaded — файл из HTTP-загрузки. */
    private function storeFile(string $tmp, string $originalName, string $kind, string $pagePath, bool $uploaded): array
    {
        $file = ['name' => $originalName];
        $bytes = filesize($tmp);
        if ($bytes === false || $bytes < 1 || $bytes > ($this->maxBytes ?? $this->limits[$kind])) {
            throw new InvalidArgumentException('Недопустимый размер файла');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
        $ext = self::TYPES[$kind][$mime] ?? null;
        if (!$ext && $kind === 'audio' && self::isMp3($tmp) && !self::hasCode($tmp)) {
            $ext = 'mp3';
        }   // «MP3» по метке ID3, а внутри страница — не принимаем (проверка 22.11)
        if (!$ext) {
            throw new InvalidArgumentException('Формат файла не поддерживается');
        }
        $convert = $ext === 'convert';
        if ($convert) {
            if ($this->ffmpeg !== null) {
                $ext = 'webm';   // есть ffmpeg: любой формат становится WebM
            } elseif (in_array($mime, ['video/x-msvideo', 'video/avi', 'video/msvideo'], true)) {
                $ext = 'avi';    // без ffmpeg AVI сохраняется как есть (браузеры его обычно не проигрывают)
                $convert = false;
            } else {
                throw new InvalidArgumentException('Без ffmpeg на сервере принимаются только видео MP4, AVI и WebM. Установите ffmpeg — тогда подойдут и другие форматы, а всё, что не играет в браузере, станет WebM');
            }
        }

        $segments = $this->segments($kind, $pagePath);
        $directory = $this->directory($segments, true);
        [$filename, $destination] = $this->reserve($directory, self::slugify((string) ($file['name'] ?? '')), $ext);
        $staged = tempnam($directory, '.ted-');
        if ($staged === false) {
            throw new RuntimeException('Не удалось подготовить хранилище');
        }
        try {
            if ($kind === 'image' && $mime !== 'image/gif') {
                $info = $this->writeWebp($tmp, $mime, $staged);
            } elseif ($kind === 'image') {
                $size = @getimagesize($tmp);
                if (!$size || $size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > 24_000_000) {
                    throw new InvalidArgumentException('Недопустимые размеры изображения');
                }
                // GIF не пересобирается (анимация остаётся, решение 17.11) — поэтому проверяем, что это только картинка:
                // «двойной» файл (GIF + HTML / скрипт / PHP) не принимаем (этап 3)
                if (self::hasCode($tmp)) {
                    throw new InvalidArgumentException('В картинке есть посторонний код — сохраните её заново в графическом редакторе');
                }
                $info = ['width' => $size[0], 'height' => $size[1]];
                if (!$this->moveFile($tmp, $staged, $uploaded)) {
                    throw new RuntimeException('Не удалось записать файл');
                }
            } elseif ($convert) {
                $this->convertToWebm($tmp, $staged);
            } elseif (!$this->moveFile($tmp, $staged, $uploaded)) {
                throw new RuntimeException('Не удалось записать файл');
            }
            if (DIRECTORY_SEPARATOR === '/' && !chmod($staged, 0644)) {
                throw new RuntimeException('Не удалось открыть файл для чтения на сайте');
            }
            if (DIRECTORY_SEPARATOR === '\\') {
                @unlink($destination);
            }   // в Windows rename не заменяет существующий файл-заглушку
            if (!rename($staged, $destination)) {
                throw new RuntimeException('Не удалось сохранить файл');
            }
        } finally {
            if (is_file($staged)) {
                unlink($staged);
            }
            if (is_file($destination) && filesize($destination) === 0) {
                unlink($destination);
            }   // заглушка без файла (ошибка выше)
        }
        $name = basename(str_replace('\\', '/', (string) ($file['name'] ?? '')));
        $result = ['url' => $this->url([...$segments, $filename]), 'name' => $name ?: $filename,
            'file' => $filename, 'type' => $ext, 'size' => (int) filesize($destination), 'originalSize' => $bytes,
            'converted' => $kind === 'image' ? !in_array($mime, ['image/webp', 'image/gif'], true) : $convert];
        if (isset($info)) {
            $result += $info;
        }
        if ($kind === 'video' && $this->ffmpeg !== null) {
            $poster = $this->makePoster($destination, $pagePath, self::slugify((string) ($file['name'] ?? '')));
            if ($poster !== null) {
                $result['poster'] = $poster;
            }
        }
        return $result;
    }

    private function moveFile(string $from, string $to, bool $uploaded): bool
    {
        if ($uploaded) {
            return move_uploaded_file($from, $to);
        }
        if (DIRECTORY_SEPARATOR === '\\') {
            @unlink($to);
        }
        return rename($from, $to) || (copy($from, $to) && @unlink($from));
    }

    /**
     * Удалить файлы страницы по адресам: только из <папка файлов>/<вид>/<путь страницы>/ и только с нашими именами.
     * Адрес чужой папки, другой страницы, вложенной папки, «..», ссылки на файл вне папки — пропускаются.
     * $isReferenced — необязательная проверка CMS («файл нужен другому документу?»). Возвращает, сколько файлов удалено.
     * @param string[] $urls
     */
    public function deleteFiles(string $pagePath, array $urls, ?callable $isReferenced = null): int
    {
        $removed = 0;
        foreach (array_keys(self::FOLDERS) as $kind) {
            $segments = $this->segments($kind, $pagePath);
            $prefix = $this->url($segments) . '/';
            foreach (array_unique($urls) as $url) {
                if (!is_string($url) || !str_starts_with($url, $prefix)) {
                    continue;
                }
                $filename = substr($url, strlen($prefix));
                if (!preg_match(self::WEB_FILE, $filename) || ($isReferenced && $isReferenced($url))) {
                    continue;
                }
                $directory = $this->directory($segments, false);
                if ($directory === null) {
                    continue;
                }
                $file = $directory . DIRECTORY_SEPARATOR . $filename;
                $real = realpath($file);
                if (is_file($file) && !is_link($file) && $real !== false && str_starts_with($real, $directory . DIRECTORY_SEPARATOR)) {
                    if (!unlink($file)) {
                        throw new RuntimeException('Не удалось удалить файл');
                    }
                    $removed++;
                }
            }
        }
        return $removed;
    }

    /** Для CMS, которая сама сравнивает адреса документа до и после сохранения. */
    public function removeUnused(string $pagePath, array $before, array $after, ?callable $isReferenced = null): int
    {
        return $this->deleteFiles($pagePath, array_values(array_diff($before, $after)), $isReferenced);
    }

    private function segments(string $kind, string $pagePath): array
    {
        $parts = parse_url($pagePath);
        if ($parts === false || !str_starts_with($parts['path'] ?? '/', '/')) {
            throw new InvalidArgumentException('Нужен публичный путь страницы');
        }
        $path = trim($parts['path'] ?? '/', '/');
        if (strlen($path) > 1024) {
            throw new InvalidArgumentException('Слишком длинный адрес страницы');
        }
        $segments = [self::FOLDERS[$kind]];   // относительно папки файлов
        foreach ($path === '' ? [] : explode('/', $path) as $raw) {
            $part = rawurldecode($raw);
            if (strlen($part) > 120 || !preg_match('/\A[\p{L}\p{N}_-][\p{L}\p{N}_.-]*\z/u', $part)
                || str_ends_with($part, '.') || preg_match('/\A(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i', $part)) {
                throw new InvalidArgumentException('Недопустимый сегмент адреса страницы');
            }
            $segments[] = $part;
        }
        return $segments;
    }

    /** Адрес для браузера: адрес папки файлов + сегменты (каждый в rawurlencode). */
    private function url(array $segments): string
    {
        return $this->urlOrigin . '/' . implode('/', array_map('rawurlencode', [...$this->urlPath, ...$segments]));
    }

    private function directory(array $segments, bool $create): ?string
    {
        $path = $this->dir;
        foreach ($segments as $segment) {
            $next = $path . DIRECTORY_SEPARATOR . $segment;
            if (!is_dir($next)) {
                if (!$create) {
                    return null;
                }
                if (!@mkdir($next, 0755) && !is_dir($next)) {
                    throw new RuntimeException('Не удалось создать каталог');
                }
            }
            $resolved = realpath($next);
            if ($resolved === false || is_link($next) || $resolved !== $next) {
                throw new RuntimeException('Недопустимый каталог хранилища');
            }
            $path = $resolved;
        }
        return $path;
    }

    /** @return array{width: int, height: int} */
    private function writeWebp(string $source, string $mime, string $destination): array
    {
        if (!function_exists('imagewebp') || !(imagetypes() & IMG_WEBP)) {
            throw new RuntimeException('Для изображений нужен PHP GD с поддержкой WebP');
        }
        $size = @getimagesize($source);
        if (!$size || $size[0] < 1 || $size[1] < 1 || $size[0] * $size[1] > 24_000_000) {
            throw new InvalidArgumentException('Недопустимые размеры изображения');
        }
        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($source),
            'image/png' => @imagecreatefrompng($source),
            'image/webp' => @imagecreatefromwebp($source),
        };
        if (!$image) {
            throw new InvalidArgumentException('Изображение повреждено');
        }
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }
        imagealphablending($image, false);
        imagesavealpha($image, true);
        $width = imagesx($image);
        $height = imagesy($image);
        $side = $this->maxSide ?? self::IMAGE_MAX_SIDE;
        if (max($width, $height) > $side) {
            $k = $side / max($width, $height);
            $scaled = imagescale($image, max(1, (int) round($width * $k)), max(1, (int) round($height * $k)));
            if ($scaled) {
                $image = $scaled;
                imagealphablending($image, false);
                imagesavealpha($image, true);
                $width = imagesx($image);
                $height = imagesy($image);
            }
        }
        if (!@imagewebp($image, $destination, 82) || !filesize($destination)) {
            throw new RuntimeException('Не удалось преобразовать изображение в WebP');
        }
        return ['width' => $width, 'height' => $height];
    }

    private function convertToWebm(string $source, string $destination): void
    {
        $cmd = escapeshellarg($this->ffmpeg) . ' -y -v error -i ' . escapeshellarg($source)
            . ' -c:v libvpx-vp9 -crf 33 -b:v 0 -row-mt 1 -deadline good -cpu-used 4 -c:a libopus -f webm ' . escapeshellarg($destination) . ' 2>&1';
        set_time_limit(0);
        $out = [];
        $code = 1;
        exec($cmd, $out, $code);
        if ($code !== 0 || !is_file($destination) || filesize($destination) < 1) {
            error_log('ffmpeg: ' . implode(' ', array_slice($out, -3)));
            throw new InvalidArgumentException('Не удалось преобразовать видео в WebM');
        }
    }

    /** Первый кадр видео → WebP рядом с картинками страницы; null, если не получилось. */
    private function makePoster(string $videoFile, string $pagePath, string $slug = 'poster'): ?string
    {
        try {
            $segments = $this->segments('image', $pagePath);
            $directory = $this->directory($segments, true);
            [$filename, $destination] = $this->reserve($directory, $slug . '-poster', 'webp');
            $out = [];
            $code = 1;
            exec(escapeshellarg($this->ffmpeg) . ' -y -v error -ss 0.1 -i ' . escapeshellarg($videoFile)
                . ' -frames:v 1 -vf ' . escapeshellarg('scale=min(1280\\,iw):-2') . ' -c:v libwebp -quality 82 ' . escapeshellarg($destination) . ' 2>&1', $out, $code);
            if ($code !== 0 || !is_file($destination) || filesize($destination) < 1) {
                if (is_file($destination)) {
                    unlink($destination);
                }
                return null;
            }
            return $this->url([...$segments, $filename]);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Ответ на запрос редактора — после проверки входа и CSRF в CMS и определения документа (страницы).
     * Обрабатывает и загрузку (kind + file), и удаление после сохранения (action=delete, urls=JSON) — отдельный маршрут не нужен.
     */
    public function respondToUpload(string $pagePath, ?callable $isReferenced = null): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            header('Allow: POST');
            http_response_code(405);
            echo json_encode(['error' => 'Используйте POST'], JSON_UNESCAPED_UNICODE);
            return;
        }
        try {
            if (!$_FILES && !$_POST && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
                throw new InvalidArgumentException('Файл больше лимита сервера (upload_max_filesize ' . ini_get('upload_max_filesize') . ', post_max_size ' . ini_get('post_max_size') . ')');
            }
            if (($_POST['action'] ?? '') === 'delete') {
                $urls = json_decode((string) ($_POST['urls'] ?? '[]'), true);
                if (!is_array($urls) || count($urls) > 500) {
                    throw new InvalidArgumentException('Некорректный список файлов');
                }
                echo json_encode(['removed' => $this->deleteFiles($pagePath, array_values(array_filter($urls, 'is_string')), $isReferenced)]);
                return;
            }
            if (($_POST['action'] ?? '') === 'fetch') {
                // картинка по ссылке: сервер скачивает и сжимает её сам (решение заказчика 17.11)
                $url = $_POST['url'] ?? '';
                if (!is_string($url) || strlen($url) > 2000 || !preg_match('~\Ahttps?://~i', $url)) {
                    throw new InvalidArgumentException('Нужна ссылка https://…');
                }
                $result = $this->storeFromUrl($url, $pagePath);
                http_response_code(201);
                echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
                return;
            }
            $kind = $_POST['kind'] ?? '';
            if (!is_string($kind)) {
                throw new InvalidArgumentException('Неизвестный тип файла');
            }
            $max = $_POST['maxSide'] ?? null;
            $result = $this->store($_FILES['file'] ?? [], $kind, $pagePath, is_string($max) && ctype_digit($max) ? (int) $max : null);
            http_response_code(201);
        } catch (InvalidArgumentException $error) {
            http_response_code(400);
            $result = ['error' => $error->getMessage()];
        } catch (Throwable $error) {
            error_log($error->getMessage());
            http_response_code(500);
            $result = ['error' => 'Не удалось сохранить файл'];
        }
        echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    }
}
