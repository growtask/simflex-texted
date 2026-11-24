<?php

declare(strict_types=1);

use Simflex\Texted\Config;
use Simflex\Texted\Exception\AccessDenied;
use Simflex\Texted\Presets;

require __DIR__ . '/bootstrap.php';
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Наборы на сервере (этап 2 MODULAR_PLAN.md): php ted/php/test-presets.php — код выхода 0, если всё в порядке.
//   — базовые наборы и виды блоков совпадают с браузером (src/core/presets.js);
//   — запрещённые блоки превращаются в текст так же, как в браузере (общие примеры tests/presets/vectors.json);
//   — подделанный запрос не сохранит запрещённый блок; без права правки сохранение и загрузка отклоняются;
//   — свои наборы в ted.config.php проверяются и уходят в браузер.

$fails = [];
$count = 0;
$ok = static function (bool $cond, string $name, string $detail = '') use (&$fails, &$count): void {
    $count++;
    if (!$cond) {
        $fails[] = $name . ($detail !== '' ? "\n      " . $detail : '');
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

// --- одно описание с браузером ---
$js = (string) file_get_contents(dirname(__DIR__, 2) . '/src/core/presets.js');
$between = static function (string $src, string $tag): string {
    return preg_match('~/\* ' . $tag . ':begin.*?\*/(.*?)/\* ' . $tag . ':end \*/~s', $src, $m) ? $m[1] : '';
};
$jsPresets = json_decode((string) preg_replace('~\A\s*export const PRESETS = |;\s*\z~', '', $between($js, 'presets')), true);
$jsTypes = json_decode((string) preg_replace('~\A\s*export const PRESET_TYPES = |;\s*\z~', '', $between($js, 'types')), true);
$ok(is_array($jsPresets) && $jsPresets === Presets::BASE, 'базовые наборы в PHP и браузере одинаковые', json_encode($jsPresets, JSON_UNESCAPED_UNICODE));
$ok(array_keys(Presets::BASE) === ['full', 'mini', 'text', 'readonly', 'docs'], 'базовые наборы: full, mini, text, readonly, docs');
$ok(is_array($jsTypes) && $jsTypes === Presets::TYPES, 'виды блоков в PHP и браузере одинаковые');
$ok(!in_array('h2', Presets::BASE['text']['blocks'], true), 'text — без заголовков');

// --- примеры превращения в текст: то же, что в браузере ---
$c = Config::fromArray(['presets' => ['custom' => ['blocks' => json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tests/presets/vectors.json'), true)['custom']]]]);
$data = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tests/presets/vectors.json'), true);
$norm = static fn(string $s): string => trim((string) preg_replace(['/ rel="[^"]*"/', '/\s+(controls|playsinline|allowfullscreen|download|itemscope|reversed|open|loop|muted)=""/', '/>\s+</'], ['', ' $1', '><'], $s));
$diff = 0;
foreach ($data['vectors'] as $i => $v) {
    foreach ($v['expect'] as $preset => $expect) {
        $got = $c->clean($v['html'], $preset);
        if ($norm($got) !== $norm($expect)) {
            $diff++;
            if ($diff <= 6) {
                $ok(false, "пример {$i}, набор {$preset}: как в браузере", 'ждали: ' . $norm($expect) . "\n      есть:  " . $norm($got));
            }
        }
    }
}
$ok($diff === 0, 'все примеры (' . count($data['vectors']) . ' блоков × ' . count($data['vectors'][0]['expect']) . ' набора) совпадают с браузером', "расхождений: {$diff}");
// повторная очистка ничего не меняет
$same = true;
foreach ($data['vectors'] as $v) {
    foreach (array_keys($v['expect']) as $preset) {
        $once = $c->clean($v['html'], $preset);
        if ($c->clean($once, $preset) !== $once) {
            $same = false;
        }
    }
}
$ok($same, 'очистка по набору идемпотентна');

// --- подделанный запрос не сохранит запрещённый блок ---
$forged = '<h2>Заголовок</h2><blockquote class="ted-callout"><p>Совет</p></blockquote><figure class="ted-iframe"><iframe src="https://example.com/"></iframe></figure><p class="ted-bg-gray">Фон</p><figure class="ted-media ted-media--video"><video src="/uf/video/a.mp4"></video></figure>';
$mini = $c->save($forged, 'mini', true);
$ok(str_contains($mini, '<h2>Заголовок</h2>') && !str_contains($mini, 'ted-callout') && !str_contains($mini, '<iframe') && !str_contains($mini, 'ted-bg-') && !str_contains($mini, '<video'), 'mini: выноска, iFrame, фон и видео не сохраняются', $mini);
$ok(str_contains($mini, 'Совет') && str_contains($mini, 'Фон'), 'mini: текст запрещённых блоков не теряется', $mini);
$text = $c->save($forged, 'text', true);
$ok(!str_contains($text, '<h2') && str_contains($text, '<p>Заголовок</p>'), 'text: заголовок становится абзацем', $text);
$ok(str_contains($c->save($forged, 'full', true), 'ted-callout'), 'full: всё разрешено');
$ok($c->clean('<p onclick="x()">a</p><script>x()</script>', 'full') === '<p>a</p>', 'набор не отменяет обычную очистку');
// вложенные блоки (проверка 22.11): подделанный запрос не сохраняет запрещённый блок внутри разрешённого
foreach ([
    '<p>x<figure class="ted-iframe"><iframe src="https://evil.example/"></iframe></figure></p>',
    '<div><figure class="ted-iframe"><iframe src="https://evil.example/"></iframe></figure></div>',
    '<ul><li>a<figure class="ted-table"><table><tbody><tr><td>b</td></tr></tbody></table></figure></li></ul>',
    '<p>a<video src="/uf/video/a.mp4" controls></video></p>',
    '<ul><li>a<details class="ted-accordion__item"><summary class="ted-accordion__q">q</summary><div class="ted-accordion__body"><p>b</p></div></details></li></ul>',
    '<ul><li>a<ul><li>b<p>c<iframe src="https://evil.example/"></iframe></p></li></ul></li></ul>',
    '<p class="ted-bg-gray">a<strong class="ted-bg-gray">b</strong></p>',
] as $forgedInner) {
    $got = $c->clean($forgedInner, 'text');
    $ok(!preg_match('/<(iframe|table|video|details|figure)\b|ted-bg-/', $got), 'text: вложенный запрещённый блок не сохраняется: ' . $forgedInner, $got);
    $ok($c->clean($got, 'text') === $got, 'text: повторная очистка вложенного — то же', $got);
}
$keep = '<figure class="ted-iframe"><iframe src="https://example.com/"></iframe></figure>';
$ok(str_contains($c->clean($keep, 'full'), '<iframe'), 'full: iFrame остаётся');
$ok(str_contains(Config::fromArray(['presets' => ['acc' => ['blocks' => ['accordion']]]])->clean('<div class="ted-accordion"><details class="ted-accordion__item"><summary class="ted-accordion__q">q</summary><div class="ted-accordion__body"><p>a</p></div></details></div>', 'acc'), '<details'), 'набор с аккордеоном: свой details остаётся');

// --- право на правку ---
$denied = static function (callable $fn): bool { try { $fn(); } catch (AccessDenied) { return true; } return false; };
$ok($denied(fn() => $c->save('<p>a</p>', 'full', false)), 'без права правки сохранение отклонено');
$ok($denied(fn() => $c->save('<p>a</p>', 'docs', false)), 'docs без права — сохранение отклонено');
$ok($denied(fn() => $c->save('<p>a</p>', 'readonly', true)), 'readonly — сохранение отклонено и с правом');
$ok($c->save('<p>a</p>', 'docs', true) === '<p>a</p>', 'docs с правом — сохраняется');
$ok($c->isEditable('mini', true) && !$c->isEditable('mini', false) && !$c->isEditable('readonly', true), 'editable: право и набор');
ob_start();
$_SERVER['REQUEST_METHOD'] = 'POST';
$c->respondToUpload('/company/', 'mini', false);
$answer = (string) ob_get_clean();
$ok(str_contains($answer, 'Нет права на правку'), 'без права загрузка отклонена (403), файл не принимается', $answer);
$ok($throws(fn() => $c->save('<p>a</p>', 'nope', true), 'Нет набора texted «nope»'), 'неизвестный набор поля — исключение, а не «всё разрешено»');

// --- свои наборы в ted.config.php ---
$cfg = Config::fromArray(['presets' => ['news' => ['blocks' => ['h2', 'quote', 'image'], 'mode' => 'edit'], 'faq' => ['blocks' => ['accordion'], 'mode' => 'view']]]);
$ok($cfg->getPreset('news') === ['blocks' => ['h2', 'blockquote', 'image'], 'mode' => 'edit'], 'свой набор: другие имена блоков приводятся (quote → blockquote)');
$ok(str_contains($cfg->save('<blockquote><p>Ц</p></blockquote><pre><code>x</code></pre>', 'news', true), '<blockquote>') && !str_contains($cfg->save('<pre><code>x</code></pre>', 'news', true), '<pre'), 'свой набор: цитата остаётся, код — текстом');
$ok($throws(fn() => Config::fromArray(['presets' => ['mini' => ['blocks' => ['p']]]]), 'базовый набор'), 'базовый набор переопределить нельзя');
$ok($throws(fn() => Config::fromArray(['presets' => ['x' => ['blocks' => ['spoiler']]]]), 'неизвестный блок «spoiler»'), 'неизвестный блок — понятная ошибка');
$ok($throws(fn() => Config::fromArray(['presets' => ['x' => ['mode' => 'write']]]), 'mode'), 'неверный mode — понятная ошибка');
$ok($throws(fn() => Config::fromArray(['presets' => ['x' => ['blocks' => ['p'], 'colors' => true]]]), 'неизвестный ключ «colors»'), 'лишний ключ — понятная ошибка');
$ok($throws(fn() => Config::fromArray(['presets' => ['Новости' => ['blocks' => ['p']]]]), 'латиница'), 'имя набора — латиница');
$ok($throws(fn() => Config::fromArray(['presets' => [['blocks' => ['p']]]]), 'presets: нужен массив'), 'presets — массив по именам');

// --- в браузер ---
$client = $cfg->getClient('news', false);
$ok($client['preset'] === 'news' && $client['canEdit'] === false, 'в браузер: набор поля и право на правку');
$json = $cfg->getClientJson('news', false);
$ok(str_contains($json, '"presets":{"news":{"blocks":["h2","blockquote","image"],"mode":"edit"},"faq":{"blocks":["accordion"],"mode":"view"}}'), 'в браузер: свои наборы тем же описанием', $json);
$ok(str_contains(Config::fromArray([])->getClientJson(), '"presets":{}'), 'без своих наборов — пустой объект');
$ok($throws(fn() => $cfg->getClientJson('nope'), 'Нет набора'), 'неизвестный набор в clientJson — исключение');

echo 'Наборы и право на правку: проверок ' . $count . ', замечаний ' . count($fails) . PHP_EOL;
foreach ($fails as $f) {
    echo '  ✗ ' . $f . PHP_EOL;
}
exit($fails ? 1 : 0);
