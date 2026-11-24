<?php

declare(strict_types=1);

namespace Simflex\Texted;

use InvalidArgumentException;
use Simflex\Texted\Exception\AccessDenied;
use Throwable;

/**
 * Настройки texted на сервере — один файл `ted.config.php` (этап 1 MODULAR_PLAN.md).
 *
 * Файл лежит ВНЕ папки пакета (обновление пакета его не затирает). Где ищется, по порядку:
 *   1. путь, переданный в Config::load('/путь/ted.config.php');
 *   2. переменная окружения TED_CONFIG;
 *   3. рядом с папкой пакета: <папка, где лежит пакет>/ted.config.php.
 * Нет файла — действуют значения по умолчанию (папка uf/ в корне сайта, адрес /uf).
 * Образец со всеми ключами — ted.config.example.php пакета.
 *
 *   $ted = \Simflex\Texted\Config::load();
 *   $ted->respondToUpload($pagePath, 'full', $canEdit);   // загрузка — после проверки входа и CSRF в CMS
 *   $clean = $ted->clean($_POST['content']);              // очистка с правилами iFrame из настроек
 *   // в шаблоне админки: Ted.init({ server: <?= $ted->getClientJson() ?>, selector: '#content' })
 *
 * В браузер уходит только getClient(): адрес папки файлов, лимиты, вкл./выкл. карточек, сайты iFrame.
 * Путь на диске, путь к ffmpeg и любые ключи в браузер не попадают.
 */
final class Config
{
    private const KINDS = ['image', 'video', 'audio', 'file'];
    /** Лимиты по умолчанию, МБ (как в MediaStorage до этапа 1). */
    private const LIMITS = ['image' => 5, 'video' => 500, 'audio' => 50, 'file' => 20];
    private const KEYS = ['files', 'limits', 'ffmpeg', 'opengraph', 'iframe', 'presets', 'rate'];
    /** Лимит частоты по умолчанию, запросов в минуту на пользователя: загрузка файлов и запросы сервера наружу. */
    private const RATE = ['upload' => 60, 'fetch' => 20];

    /** @param array<string, mixed> $values */
    private function __construct(private array $values)
    {
    }

    /** Прочитать настройки: файл из аргумента, TED_CONFIG или рядом с папкой пакета; нет файла — значения по умолчанию. */
    public static function load(?string $file = null): self
    {
        $file ??= (getenv('TED_CONFIG') ?: null) ?? dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'ted.config.php';
        if (!is_file($file)) {
            if (func_num_args() > 0 || getenv('TED_CONFIG')) {
                throw new InvalidArgumentException('Нет файла настроек texted: ' . $file);
            }
            return self::fromArray([]);
        }
        $values = (static fn(string $path) => require $path)($file);
        if (!is_array($values)) {
            throw new InvalidArgumentException('ted.config.php должен возвращать массив (return [ … ];)');
        }
        return self::fromArray($values);
    }

    /** Настройки из массива (тот же формат, что в ted.config.php). Ошибка в ключе или значении — исключение с понятным текстом. */
    public static function fromArray(array $values): self
    {
        foreach (array_keys($values) as $key) {
            if (!in_array($key, self::KEYS, true)) {
                throw new InvalidArgumentException("Неизвестная настройка texted: «{$key}». Допустимы: " . implode(', ', self::KEYS));
            }
        }
        $files = $values['files'] ?? [];
        if (!is_array($files) || array_diff(array_keys($files), ['dir', 'url'])) {
            throw new InvalidArgumentException('files: нужен массив [\'dir\' => путь на диске, \'url\' => адрес для браузера]');
        }
        $root = ($_SERVER['DOCUMENT_ROOT'] ?? '') !== '' ? (string) $_SERVER['DOCUMENT_ROOT'] : dirname(__DIR__, 2);
        $dir = $files['dir'] ?? rtrim($root, '/\\') . DIRECTORY_SEPARATOR . 'uf';
        if (!is_string($dir) || !self::absolute($dir)) {
            throw new InvalidArgumentException('files.dir: нужен полный путь к папке файлов на диске');
        }
        $url = $files['url'] ?? '/uf';
        if (!is_string($url) || !preg_match('~\A(?:/(?!/)[^\s?#]*|https?://[^\s/?#@]+(?:/[^\s?#]*)?)\z~i', $url)) {
            throw new InvalidArgumentException('files.url: нужен адрес папки для браузера — «/uf» или «https://cdn.example.com/uf»');
        }
        $limits = $values['limits'] ?? [];
        if (!is_array($limits)) {
            throw new InvalidArgumentException('limits: нужен массив размеров в МБ');
        }
        foreach ($limits as $kind => $mb) {
            if (!in_array($kind, self::KINDS, true)) {
                throw new InvalidArgumentException("limits: неизвестный вид файла «{$kind}». Допустимы: " . implode(', ', self::KINDS));
            }
            if (!(is_int($mb) || is_float($mb)) || $mb <= 0 || $mb > 10240) {
                throw new InvalidArgumentException("limits.{$kind}: размер в МБ, больше 0");
            }
        }
        $ffmpeg = $values['ffmpeg'] ?? 'auto';
        if ($ffmpeg !== false && (!is_string($ffmpeg) || $ffmpeg === '')) {
            throw new InvalidArgumentException('ffmpeg: «auto» (найти), false (не использовать) или путь к программе');
        }
        $og = $values['opengraph'] ?? true;
        if (!is_bool($og)) {
            throw new InvalidArgumentException('opengraph: true или false');
        }
        $iframe = $values['iframe'] ?? [];
        if (!is_array($iframe) || array_diff(array_keys($iframe), ['hosts'])) {
            throw new InvalidArgumentException('iframe: нужен массив [\'hosts\' => null или список сайтов]');
        }
        $hosts = $iframe['hosts'] ?? null;
        if ($hosts !== null) {
            if (!is_array($hosts) || !array_is_list($hosts)) {
                throw new InvalidArgumentException('iframe.hosts: null (любой https) или список сайтов');
            }
            foreach ($hosts as $h) {
                if (!is_string($h) || !preg_match('/\A(?=.{1,253}\z)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\z/i', $h)) {
                    throw new InvalidArgumentException('iframe.hosts: «' . (is_string($h) ? $h : gettype($h)) . '» — нужен адрес сайта без https:// и пути, например www.youtube.com');
                }
            }
            $hosts = array_values(array_unique(array_map('strtolower', $hosts)));
        }
        // свои наборы (этап 2): ['news' => ['blocks' => ['p', 'h2', 'image'], 'mode' => 'edit']] — те же правила, что Ted.definePreset
        $presets = $values['presets'] ?? [];
        if (!is_array($presets) || ($presets && array_is_list($presets))) {
            throw new InvalidArgumentException("presets: нужен массив ['имя' => ['blocks' => […], 'mode' => 'edit']]");
        }
        foreach ($presets as $name => $def) {
            $presets[$name] = Presets::check((string) $name, $def);
        }
        // лимит частоты запросов в минуту на пользователя (этап 3): загрузка файлов и запросы сервера наружу; 0 — без лимита
        $rate = $values['rate'] ?? [];
        if (!is_array($rate) || array_diff(array_keys($rate), ['upload', 'fetch'])) {
            throw new InvalidArgumentException("rate: нужен массив ['upload' => 60, 'fetch' => 20] — запросов в минуту");
        }
        foreach ($rate as $kind => $n) {
            if (!is_int($n) || $n < 0 || $n > 100000) {
                throw new InvalidArgumentException("rate.{$kind}: целое число запросов в минуту, 0 — без лимита");
            }
        }
        return new self([
            'dir' => rtrim($dir, '/\\'),
            'url' => rtrim($url, '/'),
            'limits' => array_map(static fn($mb): int => (int) round($mb * 1048576), $limits + self::LIMITS),
            'ffmpeg' => $ffmpeg,
            'opengraph' => $og,
            'hosts' => $hosts,
            'presets' => $presets,
            'rate' => $rate + self::RATE,
        ]);
    }

    private static function absolute(string $path): bool
    {
        return $path !== '' && !str_contains($path, "\0") && (str_starts_with($path, '/') || preg_match('~\A[a-z]:[\\\\/]~i', $path) === 1 || str_starts_with($path, '\\\\'));
    }

    /** Папка файлов на диске (без косой черты в конце). */
    public function getFilesDir(): string
    {
        return $this->values['dir'];
    }

    /** Адрес папки файлов для браузера (без косой черты в конце): «/uf» или «https://cdn…/uf». */
    public function getFilesUrl(): string
    {
        return $this->values['url'];
    }

    /** Лимит размера файла вида image / video / audio / file, байт. */
    public function getLimit(string $kind): int
    {
        if (!isset($this->values['limits'][$kind])) {
            throw new InvalidArgumentException('Неизвестный вид файла');
        }
        return $this->values['limits'][$kind];
    }

    /** @return array<string, int> */
    public function getLimits(): array
    {
        return $this->values['limits'];
    }

    /** «auto», false или путь к ffmpeg. */
    public function getFfmpeg(): string|false
    {
        return $this->values['ffmpeg'];
    }

    /** Карточки по ссылке (OpenGraph) и картинка по ссылке: сервер читает чужие страницы. */
    public function isOpenGraphEnabled(): bool
    {
        return $this->values['opengraph'];
    }

    /** Сайты для блока «iFrame»: null — любой https, иначе только эти. @return string[]|null */
    public function getIframeHosts(): ?array
    {
        return $this->values['hosts'];
    }

    /** Хранилище файлов по этим настройкам. Папка создаётся при первой загрузке. */
    public function createStorage(): MediaStorage
    {
        return new MediaStorage($this->getFilesDir(), $this->getFilesUrl(), $this->getLimits(), $this->getFfmpeg());
    }

    /** Свои наборы из ted.config.php → presets. @return array<string, array{blocks: string|string[], mode: string}> */
    public function getPresets(): array
    {
        return $this->values['presets'];
    }

    /**
     * Описание набора: базовый (full, mini, text, readonly, docs) или свой из настроек.
     * Неизвестное имя — исключение: набор поля задаёт CMS, опечатка не должна молча открыть все блоки.
     * @return array{blocks: string|string[], mode: string}
     */
    public function getPreset(string $name): array
    {
        if (isset(Presets::BASE[$name])) {
            return Presets::BASE[$name];
        }
        if (isset($this->values['presets'][$name])) {
            return $this->values['presets'][$name];
        }
        throw new InvalidArgumentException("Нет набора texted «{$name}». Есть: " . implode(', ', array_merge(array_keys(Presets::BASE), array_keys($this->values['presets']))));
    }

    /**
     * Серверная очистка HTML с правилами iFrame из настроек; с набором — ещё и блоки по набору (запрещённые → текст).
     * Вызывать перед сохранением и перед выводом. Набор — из настройки поля в CMS, не из запроса браузера.
     */
    public function clean(string $html, ?string $preset = null): string
    {
        $clean = Sanitizer::clean($html, [], $this->getIframeHosts());
        if ($preset === null) {
            return $clean;
        }
        $allowed = Presets::allowed($this->getPreset($preset));
        return $allowed === null ? $clean : Sanitizer::clean(Presets::restrict($clean, $allowed), [], $this->getIframeHosts());
    }

    /**
     * Сохранение поля: без права правки или в наборе «только просмотр» — AccessDenied (ответьте 403),
     * иначе — HTML, очищенный по набору поля. Скрытая в браузере кнопка — не защита, проверяет сервер.
     */
    public function save(string $html, string $preset, bool $canEdit): string
    {
        if (!$this->isEditable($preset, $canEdit)) {
            throw new AccessDenied('Нет права на правку');
        }
        return $this->clean($html, $preset);
    }

    /** Можно ли править поле: есть право и набор не «только просмотр». */
    public function isEditable(string $preset, bool $canEdit): bool
    {
        return $canEdit && $this->getPreset($preset)['mode'] !== 'readonly';
    }

    /**
     * Загрузка и удаление файлов поля (MediaStorage::respondToUpload) с проверкой права: без права — 403 и ничего не пишется на диск.
     * Вход и CSRF по-прежнему проверяет CMS до вызова.
     */
    public function respondToUpload(string $pagePath, string $preset, bool $canEdit, ?callable $isReferenced = null): void
    {
        if (!$this->isEditable($preset, $canEdit)) {
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
            http_response_code(403);
            echo json_encode(['error' => 'Нет права на правку'], JSON_UNESCAPED_UNICODE);
            return;
        }
        // лимит частоты (этап 3): загрузка файла и картинка по ссылке; удаление после сохранения не ограничиваем
        $action = $_POST['action'] ?? '';
        if ($action !== 'delete' && !$this->createRateLimit($action === 'fetch' ? 'fetch' : 'upload')->hit($action === 'fetch' ? 'fetch' : 'upload')) {
            RateLimit::refuse();
            return;
        }
        // ошибка настройки (нет папки файлов…) — в журнал сервера; посетителю — без путей на диске (проверка 22.11)
        try {
            $storage = $this->createStorage();
        } catch (Throwable $e) {
            error_log('texted: ' . $e->getMessage());
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(['error' => 'Загрузка файлов не настроена на сервере'], JSON_UNESCAPED_UNICODE);
            return;
        }
        $storage->respondToUpload($pagePath, $isReferenced);
    }

    /**
     * Карточка по ссылке (OpenGraph) — с настройкой вкл./выкл. и лимитом частоты. Вход и CSRF проверяет CMS до вызова.
     */
    public function respondToOpenGraph(): void
    {
        if ($this->isOpenGraphEnabled() && !$this->createRateLimit('fetch')->hit('fetch')) {
            RateLimit::refuse();
            return;
        }
        OpenGraph::respondToRequest($this->isOpenGraphEnabled());
    }

    /** Лимит частоты запросов вида upload / fetch (ted.config.php → rate), в минуту на пользователя. */
    public function createRateLimit(string $kind): RateLimit
    {
        return new RateLimit($this->values['rate'][$kind] ?? 0);
    }

    /** @return array{upload: int, fetch: int} */
    public function getRates(): array
    {
        return $this->values['rate'];
    }

    /**
     * Настройки для браузера — в Ted.init. Только то, что браузеру нужно знать; путь на диске и ffmpeg не входят.
     * $preset — набор поля (из настройки поля в CMS), $canEdit — право пользователя на правку (этап 2).
     * @return array{filesUrl: string, limits: array<string, int>, opengraph: bool, iframeHosts: string[]|null, preset: string|null, presets: array, canEdit: bool}
     */
    public function getClient(?string $preset = null, bool $canEdit = true): array
    {
        if ($preset !== null) {
            $this->getPreset($preset);
        }   // неизвестный набор — исключение
        return [
            'filesUrl' => $this->getFilesUrl(), 'limits' => $this->getLimits(), 'opengraph' => $this->isOpenGraphEnabled(), 'iframeHosts' => $this->getIframeHosts(),
            'preset' => $preset, 'presets' => (object) $this->getPresets(), 'canEdit' => $canEdit,
        ];
    }

    /** client() в JSON, безопасном для вставки в <script>: Ted.init({ server: <?= $ted->getClientJson('mini', $canEdit) ?> }). */
    public function getClientJson(?string $preset = null, bool $canEdit = true): string
    {
        return json_encode($this->getClient($preset, $canEdit), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    }
}
