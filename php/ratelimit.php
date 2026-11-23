<?php
declare(strict_types=1);

/**
 * Лимит частоты запросов (этап 3 MODULAR_PLAN.md): загрузка файлов и запросы сервера наружу (карточка, картинка по ссылке).
 * Скользящее окно в одну минуту на пользователя (сессия + IP). Счётчики — во временной папке сервера (не в папке файлов
 * и не в пакете), по файлу на пользователя и вид запроса; запись под блокировкой.
 *
 *   $limit = new TedRateLimit(60);                 // 60 запросов в минуту
 *   if (!$limit->hit('upload')) { http_response_code(429); … }
 *
 * Настройка — ted.config.php → rate: ['upload' => 60, 'fetch' => 20]; 0 — без лимита.
 */
final class TedRateLimit
{
    private const WINDOW = 60;

    public function __construct(private int $perMinute, private ?string $dir = null, private ?string $who = null) {}

    /** Кто запрашивает: сессия CMS (если открыта) и IP. */
    public static function client(): string
    {
        $sid = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';
        return ($_SERVER['REMOTE_ADDR'] ?? 'cli') . '|' . $sid;
    }

    /** Засчитать запрос вида $kind; false — лимит исчерпан (запрос не засчитан). */
    public function hit(string $kind, ?float $now = null): bool
    {
        if ($this->perMinute <= 0) return true;
        $now ??= microtime(true);
        $dir = $this->dir ?? sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'ted-rate';
        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) return true;   // нет временной папки — не мешаем работе
        $file = $dir . DIRECTORY_SEPARATOR . hash('sha256', $kind . '|' . ($this->who ?? self::client())) . '.json';
        $fh = @fopen($file, 'c+');
        if (!$fh) return true;
        try {
            flock($fh, LOCK_EX);
            $times = json_decode((string) stream_get_contents($fh), true);
            $times = array_values(array_filter(is_array($times) ? $times : [], static fn ($t) => is_float($t) || is_int($t) ? $t > $now - self::WINDOW : false));
            if (count($times) >= $this->perMinute) return false;
            $times[] = $now;
            ftruncate($fh, 0);
            rewind($fh);
            fwrite($fh, json_encode($times));
            return true;
        } finally {
            flock($fh, LOCK_UN);
            fclose($fh);
        }
    }

    /** Ответ 429 в JSON (как у загрузки и карточки). */
    public static function refuse(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('Retry-After: ' . self::WINDOW);
        http_response_code(429);
        echo json_encode(['error' => 'Слишком много запросов — подождите минуту'], JSON_UNESCAPED_UNICODE);
    }
}
