<?php

declare(strict_types=1);

use Simflex\Texted\Sanitizer;

require __DIR__ . '/bootstrap.php';
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

/**
 * Тест серверной очистки: php ted/php/test-sanitize.php  (код выхода 0 — всё хорошо).
 * Векторы общие с браузерным тестом (tests/security-vectors.json).
 */

$vectors = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tests/security-vectors.json'), true, 512, JSON_THROW_ON_ERROR);
$unsafeTags = ['script', 'style', 'link', 'meta', 'base', 'template', 'noscript', 'object', 'embed', 'applet', 'frame', 'frameset', 'form', 'input', 'button', 'textarea', 'select', 'option', 'xmp', 'listing', 'plaintext', 'title', 'svg', 'math', 'foreignobject', 'animate', 'set', 'use'];
$urlAttrs = ['href', 'src', 'srcset', 'data', 'action', 'formaction', 'poster', 'background', 'xlink:href', 'ping', 'codebase', 'lowsrc', 'dynsrc'];
$failures = [];

/** Находит в HTML то, что может выполниться на странице. */
function problems(string $html, array $unsafeTags, array $urlAttrs): array
{
    $found = [];
    $doc = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><body>' . $html . '</body>');
    libxml_clear_errors();
    foreach ((new DOMXPath($doc))->query('//*') as $el) {
        $tag = strtolower($el->localName);
        if (in_array($tag, $unsafeTags, true)) {
            $found[] = "тег <$tag>";
        }
        if ($tag === 'iframe') {
            $src = $el->getAttribute('src');
            // блок «iFrame» (решение заказчика): любой https-адрес, но всегда в песочнице без srcdoc
            $parent = $el->parentNode;
            $block = $parent instanceof DOMElement && strtolower($parent->localName) === 'figure' && str_contains(' ' . $parent->getAttribute('class') . ' ', ' ted-iframe ')
                && preg_match('~\Ahttps://[^/@:\s]+/~', $src) && str_contains($el->getAttribute('sandbox'), 'allow-scripts');
            if ((!$block && !preg_match('~\Ahttps://(www\.youtube-nocookie\.com|www\.youtube\.com|youtube\.com|player\.vimeo\.com|rutube\.ru|vkvideo\.ru|vk\.com)/~', $src)) || $el->hasAttribute('srcdoc') || !$el->hasAttribute('sandbox')) {
                $found[] = "<iframe src=\"$src\">";
            }
        }
        foreach ($el->attributes as $a) {
            $name = strtolower($a->name);
            $value = strtolower((string) preg_replace('/[^\x21-\x7e]/', '', $a->value));
            if (str_starts_with($name, 'on')) {
                $found[] = "обработчик $name";
            }
            if ($name === 'srcdoc' || $name === 'style') {
                $found[] = $name;
            }
            if (in_array($name, $urlAttrs, true)) {
                $parts = $name === 'srcset' ? array_map(static fn($p) => preg_split('/\s+/', trim($p))[0] ?? '', explode(',', $value)) : [$value];
                foreach ($parts as $p) {
                    // этап 3: любая схема, кроме разрешённых (file:, blob:, ms-…), — тоже находка; правило адресов проверено отдельно на url-vectors
                    $kind = $name === 'href' ? 'link' : (in_array($tag, ['img', 'source'], true) ? 'image' : 'media');
                    if (!Sanitizer::urlOk($a->value, $kind) && $name !== 'srcset') {
                        $found[] = "$name=" . substr($p, 0, 30) . ' (схема)';
                    }
                    if (preg_match('/\A(?:javascript|vbscript|livescript|mocha):/', $p)) {
                        $found[] = "$name=" . substr($p, 0, 30);
                    }
                    if (str_starts_with($p, 'data:') && !preg_match('~\Adata:image/(png|jpe?g|gif|webp|avif|bmp)[;,]~', $p)) {
                        $found[] = "$name=data:";
                    }
                }
            }
            if ($name === 'class' && preg_match('/[^a-z0-9_ -]/i', $a->value)) {
                $found[] = 'класс с лишними знаками';
            }
            if ($name === 'target' && $a->value === '_blank' && !str_contains($el->getAttribute('rel'), 'noopener')) {
                $found[] = 'target=_blank без noopener';
            }
        }
    }
    return $found;
}

foreach ($vectors as $i => $v) {
    $out = Sanitizer::clean($v);
    $p = problems($out, $unsafeTags, $urlAttrs);
    if ($p) {
        $failures[] = "вектор #$i " . json_encode($v, JSON_UNESCAPED_UNICODE) . ' → ' . implode(', ', $p) . " :: $out";
    }
    if (Sanitizer::clean($out) !== $out) {
        $failures[] = "вектор #$i: очистка неидемпотентна";
    }
}

// безопасная разметка редактора проходит без потерь
$good = [
    '<h2 id="intro">Заголовок</h2>',
    '<p class="ted-align-center">Текст с <strong>жирным</strong>, <em>курсивом</em>, <a href="/catalog" target="_blank" rel="noopener noreferrer">ссылкой</a> и <code>кодом</code>.</p>',
    '<ul class="ted-checklist"><li class="ted-checked">Раз</li><li>Два</li></ul>',
    '<ol class="ted-steps"><li><strong>Шаг</strong><br>Описание</li></ol>',
    '<blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>Текст</p></blockquote>',
    '<ul class="ted-facts"><li><strong>120+</strong><br>стран</li></ul>',
    '<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>Раз</li></ul></li><li class="ted-cons"><strong>Минусы</strong><ul><li>Два</li></ul></li></ul>',
    '<p class="ted-bg-color1">Плашка</p>',
    '<blockquote><p>Цитата</p><p class="ted-author" data-initials="АП" data-author-id="a1"><strong>Анна</strong><br>Редактор</p></blockquote>',
    '<pre data-lang="js" data-nums="1' . "\n" . '2"><code><span class="ted-k">const</span> a = 1;' . "\n" . 'b</code></pre>',
    '<figure class="ted-media ted-media--image"><img src="/uf/images/a.webp" alt="Фото" loading="lazy"></figure>',
    '<figure class="ted-media ted-media--video"><a href="https://www.youtube-nocookie.com/watch?v=x" data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Смотреть видео</a></figure>',
    '<figure class="ted-media ted-media--file"><a href="/uf/files/a.pdf" download="">Скачать файл</a></figure>',
    '<table><tr><td colspan="2">Ячейка</td></tr></table>',
];
foreach ($good as $i => $html) {
    $out = Sanitizer::clean($html);
    if ($out !== $html) {
        $failures[] = "хорошая разметка #$i изменилась:\n  было  $html\n  стало $out";
    }
}

// этап 3: одно правило адресов с браузером (resources/js/core/urls.js) — общие примеры tests/security/url-vectors.json
$urls = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tests/security/url-vectors.json'), true, 512, JSON_THROW_ON_ERROR);
foreach ($urls as [$url, $kind, $expect]) {
    if (Sanitizer::urlOk($url, $kind) !== $expect) {
        $failures[] = 'адрес ' . json_encode($url, JSON_UNESCAPED_UNICODE) . " ($kind): ждали " . ($expect ? 'можно' : 'нельзя');
    }
}
// белый список разметки — один в браузере (resources/js/core/allowlist.js) и на сервере
$js = (string) file_get_contents(dirname(__DIR__, 2) . '/resources/js/core/allowlist.js');
preg_match('~/\* allowlist:begin.*?\*/(.*?)/\* allowlist:end \*/~s', $js, $block);
$jsLists = [];
preg_match_all('~export const (\w+) = (.*?);\s*(?=export const|\z)~s', $block[1] ?? '', $mm, PREG_SET_ORDER);
foreach ($mm as $m) {
    $jsLists[$m[1]] = json_decode($m[2], true);
}
$ref = new ReflectionClass(Sanitizer::class);
foreach (['ALLOWED_TAGS' => 'ALLOWED', 'DROP_WITH_CONTENT' => 'DROP_WITH_CONTENT', 'ALLOWED_ATTRS' => 'ATTRS', 'VIDEO_HOSTS' => 'IFRAME_HOSTS'] as $jsName => $phpName) {
    if (($jsLists[$jsName] ?? null) !== $ref->getConstant($phpName)) {
        $failures[] = "белый список: {$jsName} в браузере ≠ Sanitizer::{$phpName}";
    }
}
// всё, что сохраняет редактор (все блоки — tests/presets/vectors.json), сервер оставляет без изменений:
// белые списки браузера и сервера не расходятся. Браузер пишет rel="noopener", сервер — "noopener noreferrer"; пустые
// булевы атрибуты браузер пишет как controls="", PHP — controls; переводы строк между тегами расставляет редактор.
$norm = static fn(string $s): string => trim((string) preg_replace(['/ rel="[^"]*"/', '/\s+(controls|playsinline|allowfullscreen|download|itemscope|reversed|open|loop|muted)=""/', '/>\s+</'], ['', ' $1', '><'], $s));
$blocks = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tests/presets/vectors.json'), true, 512, JSON_THROW_ON_ERROR)['vectors'];
foreach ($blocks as $i => $b) {
    if ($norm(Sanitizer::clean($b['html'])) !== $norm($b['html'])) {
        $failures[] = "блок редактора #$i сервер изменил:\n  было  " . $norm($b['html']) . "\n  стало " . $norm(Sanitizer::clean($b['html']));
    }
}
// и в разметке: ссылка с уловкой вырезается, текст остаётся
foreach ($urls as [$url, $kind, $expect]) {
    if ($expect || $kind !== 'link') {
        continue;
    }
    $out = Sanitizer::clean('<p><a href="' . htmlspecialchars($url, ENT_QUOTES) . '">т</a></p>');
    if (str_contains($out, 'href')) {
        $failures[] = 'ссылка ' . json_encode($url, JSON_UNESCAPED_UNICODE) . " осталась: $out";
    }
}

// атрибуты-идентификаторы CMS приходят из block.json → ids (встраивание, товар): верный id остаётся, остальное удаляется — как в JS
$ids = Sanitizer::clean('<p><a href="/x" data-ted-cart="sku-1_A">a</a> <a href="/y" data-ted-cart="x y">b</a></p>');
if (!str_contains($ids, 'data-ted-cart="sku-1_A"') || substr_count($ids, 'data-ted-cart') !== 1) {
    $failures[] = "ids (block.json): $ids";
}

// проверка 22.11: <meta charset> не портит текст, длинный незакрытый комментарий не стирает статью
$meta = Sanitizer::clean('<p>Привет</p><meta charset="windows-1252"><p>Мир</p><meta charset="UTF-7"><p>Ещё</p>');
if ($meta !== '<p>Привет</p><p>Мир</p><p>Ещё</p>') {
    $failures[] = "meta charset: $meta";
}
$long = Sanitizer::clean('<p>до</p><!--' . str_repeat('x', 1200000));
if ($long !== '<p>до</p>') {
    $failures[] = 'длинный незакрытый комментарий: ' . substr($long, 0, 80);
}
$cmt = Sanitizer::clean('<p>a<!-- c --->b</p><p><![CDATA[x]]>y</p>');
if ($cmt !== '<p>ab</p><p>y</p>') {
    $failures[] = "комментарии и CDATA: $cmt";
}

printf("Векторов: %d, адресов: %d, образцов разметки: %d, блоков редактора: %d, замечаний: %d\n", count($vectors), count($urls), count($good), count($blocks), count($failures));
foreach ($failures as $f) {
    fwrite(STDERR, "  ✗ $f\n");
}
exit($failures ? 1 : 0);
