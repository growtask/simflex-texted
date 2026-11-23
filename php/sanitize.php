<?php
declare(strict_types=1);

/**
 * Серверная очистка HTML texted. ОБЯЗАТЕЛЬНА перед сохранением и перед выводом на сайт.
 *
 * Клиентский редактор чистит HTML у честного автора, но злоумышленник с доступом в админку (или перехвативший сессию)
 * может отправить на сервер любой HTML мимо редактора. Единственная защита сайта — очистка на сервере по белому списку.
 *
 *   require 'ted/php/sanitize.php';
 *   $clean = TedSanitizer::clean($_POST['content']);     // сохранять и выводить только $clean
 *
 * Правила: теги и атрибуты — по белому списку; ссылки только http, https, mailto, tel и относительные; картинки —
 * http, https, относительные и data:image растровые; iframe — только https с доверенных видеохостов и с sandbox
 * (в блоке «iFrame» — figure.ted-iframe — любой https-адрес без логина и порта, тоже с sandbox);
 * style, on*, srcdoc, script, форма и её поля, object, embed, svg, math, link, meta, base — удаляются.
 * Классы — только ted-* (оформление блоков); id — латиница, цифры, дефис.
 * Результат идемпотентен: clean(clean(x)) === clean(x).
 */
require_once __DIR__ . '/blocks.php';

final class TedSanitizer
{
    /** Теги белого списка: ядро + блоки из blocks/<тип>/block.json (этап 5). @return string[] */
    private static function allowedTags(): array
    {
        static $tags = null;
        return $tags ??= array_values(array_unique(array_merge(self::ALLOWED, TedBlocks::tags())));
    }

    /** Атрибуты тега: ядро + блоки. @return string[] */
    private static function allowedAttrs(string $tag): array
    {
        return array_values(array_unique(array_merge(self::ATTRS[$tag] ?? [], TedBlocks::attrs($tag))));
    }

    /** Теги, оставляемые как есть (с очисткой атрибутов). */
    private const ALLOWED = [
        'div', 'ul', 'ol', 'li', 'code', 'br',
        'strong', 'em', 'u', 's', 'sub', 'sup', 'mark', 'a', 'span',
        'figure', 'figcaption', 'img', 'picture', 'source', 'video', 'audio',
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
        'dl', 'dt', 'dd', 'details', 'summary', 'address', 'iframe', 'nav',
    ];
    /** Теги, которые удаляются вместе с содержимым. */
    private const DROP_WITH_CONTENT = [
        'script', 'style', 'link', 'meta', 'base', 'template', 'noscript', 'object', 'embed', 'applet', 'frame', 'frameset',
        'form', 'input', 'button', 'select', 'option', 'textarea', 'svg', 'math', 'xmp', 'listing', 'plaintext', 'title', 'head',
        'canvas', 'audio-worklet', 'bgsound', 'marquee', 'noframes', 'noembed',
    ];
    /** Атрибуты по тегам; class и id разрешены везде отдельной проверкой. */
    private const ATTRS = [
        'a' => ['href', 'target', 'rel', 'download', 'data-ted-video'],
        'img' => ['src', 'alt', 'width', 'height', 'loading', 'srcset', 'sizes'],
        'source' => ['src', 'srcset', 'type', 'media', 'sizes'],
        'video' => ['src', 'controls', 'preload', 'playsinline', 'poster', 'width', 'height', 'loop', 'muted'],
        'audio' => ['src', 'controls', 'preload', 'loop', 'muted', 'title'],
        'iframe' => ['src', 'width', 'height', 'allowfullscreen', 'title', 'loading', 'referrerpolicy'],
        'td' => ['colspan', 'rowspan', 'data-formula'], 'th' => ['colspan', 'rowspan', 'scope', 'data-formula'],   // data-formula — формула ячейки (этап 6.1б)
        'table' => ['data-cols'],   // блок «Таблица»: число столбцов 1–10 (ширина таблицы в CSS)
        'col' => ['span'], 'colgroup' => ['span'],
        'ol' => ['start', 'reversed', 'type'], 'li' => ['value'],
        'details' => ['open', 'itemscope', 'itemprop', 'itemtype'],   // аккордеон: разметка FAQ (schema.org)
        'summary' => ['itemprop'],
        'div' => ['data-words', 'data-chars', 'data-minutes', 'data-blocks', 'itemscope', 'itemprop', 'itemtype'],
    ];
    private const URL_ATTRS = ['href', 'src', 'poster'];
    /** Песочница фрейма блока «iFrame» (как IFRAME_SANDBOX в src/core/iframe.js). */
    private const BLOCK_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
    private const IFRAME_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com', 'rutube.ru', 'vkvideo.ru', 'vk.com'];

    /** Сайты блока «iFrame» на время очистки: null — любой https (ted.config.php → iframe.hosts). */
    private static ?array $frameHosts = null;

    /**
     * Очистить HTML. $allowHosts — свои хосты для iframe (https), если нужны сверх списка видеохостов.
     * $frameHosts — сайты для блока «iFrame»: null — любой https (по умолчанию), список — только эти (TedConfig::clean).
     */
    public static function clean(string $html, array $allowHosts = [], ?array $frameHosts = null): string
    {
        $previousHosts = self::$frameHosts;
        self::$frameHosts = $frameHosts === null ? null : array_map('strtolower', $frameHosts);
        try {
            return self::cleanDocument($html, $allowHosts);
        } finally {
            self::$frameHosts = $previousHosts;
        }
    }

    /** Вырезать всё от $open до $close включительно (незакрытое — до конца строки). */
    private static function cutBetween(string $html, string $open, string $close): string
    {
        $out = '';
        $pos = 0;
        while (($start = strpos($html, $open, $pos)) !== false) {
            $out .= substr($html, $pos, $start - $pos);
            $end = strpos($html, $close, $start + strlen($open));
            if ($end === false) return $out;
            $pos = $end + strlen($close);
        }
        return $out . substr($html, $pos);
    }

    private static function cleanDocument(string $html, array $allowHosts): string
    {
        $html = str_replace("\0", '', $html);
        if (trim($html) === '') return '';
        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        // кодировка задаётся явно, иначе libxml читает кириллицу как Latin-1; комментарии и CDATA вырезаем до разбора
        // без регулярных выражений: на очень длинном тексте preg_replace упирался в лимит и молча возвращал пустую статью (проверка 22.11);
        // незакрытый комментарий, как в браузере, забирает всё до конца
        $html = self::cutBetween($html, '<!--', '-->');
        $html = self::cutBetween($html, '<![CDATA[', ']]>');
        // <meta charset> посреди текста libxml принимает за смену кодировки и портит или стирает всё после него — тег выключаем до разбора
        $html = str_ireplace('<meta', '<ted-dropped', $html);
        $doc->loadHTML('<?xml encoding="UTF-8"><body>' . $html . '</body>', LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $body = $doc->getElementsByTagName('body')->item(0);
        if (!$body) return '';
        $hosts = array_merge(self::IFRAME_HOSTS, array_map('strtolower', $allowHosts));
        self::walk($body, $hosts);
        $out = '';
        foreach (iterator_to_array($body->childNodes) as $node) $out .= $doc->saveHTML($node);
        return trim($out);
    }

    private static function walk(DOMNode $parent, array $hosts): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof DOMComment || $node instanceof DOMProcessingInstruction || $node instanceof DOMDocumentType) {
                $parent->removeChild($node);
                continue;
            }
            if (!($node instanceof DOMElement)) continue;
            $tag = strtolower($node->localName);
            if (in_array($tag, self::DROP_WITH_CONTENT, true)) {
                $parent->removeChild($node);
                continue;
            }
            if (!in_array($tag, self::allowedTags(), true)) {
                // неизвестный тег: оставляем содержимое без обёртки
                self::walk($node, $hosts);
                while ($node->firstChild) $parent->insertBefore($node->firstChild, $node);
                $parent->removeChild($node);
                continue;
            }
            // фрейм блока (block.json → frames: true, блок «iFrame»): по умолчанию любой https-адрес (решение заказчика), в настройках — список сайтов; песочница ставится всегда
            $blockFrame = $tag === 'iframe' && self::frameBlock($parent);
            $frameOk = $tag !== 'iframe' || ($blockFrame
                ? self::httpsFrame($node->getAttribute('src')) && (self::$frameHosts === null || self::trustedIframe($node->getAttribute('src'), self::$frameHosts))
                : self::trustedIframe($node->getAttribute('src'), $hosts));
            if (!$frameOk) {
                $parent->removeChild($node);
                continue;
            }
            self::cleanAttributes($node, $tag);
            self::walk($node, $hosts);
        }
    }

    private static function cleanAttributes(DOMElement $el, string $tag): void
    {
        $allowed = self::allowedAttrs($tag);
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name = strtolower($attr->name);
            $value = $attr->value;
            $keep = false;
            if ($name === 'class') {
                $classes = array_filter(preg_split('/\s+/', trim($value)) ?: [], static fn ($c) => preg_match('/\Ated-[a-z0-9_-]{1,40}\z/', $c) === 1);
                if ($classes) $el->setAttribute('class', implode(' ', array_unique($classes)));
                else $el->removeAttribute($attr->name);
                continue;
            }
            if ($name === 'id') {
                if (preg_match('/\A[A-Za-z][A-Za-z0-9_-]{0,63}\z/', $value) !== 1) $el->removeAttribute($attr->name);
                continue;
            }
            if (in_array($name, $allowed, true)) $keep = true;
            if (!$keep) { $el->removeAttribute($attr->name); continue; }
            if (in_array($name, self::URL_ATTRS, true) && !self::urlOk($value, self::urlKind($tag, $name, $el))) { $el->removeAttribute($attr->name); continue; }
            if ($name === 'srcset') {
                foreach (explode(',', $value) as $part) {
                    $url = preg_split('/\s+/', trim($part))[0] ?? '';
                    if ($url === '' || !self::urlOk($url, 'image')) { $el->removeAttribute($attr->name); break; }
                }
            }
            if ($name === 'target' && !in_array($value, ['_blank', '_self'], true)) $el->removeAttribute($attr->name);
            // block.json → ids (id статьи, товара CMS): латиница, цифры, _ и -, как idAttr в JS
            if (in_array($name, TedBlocks::ids(), true) && preg_match('/\A[\w-]{1,64}\z/', $value) !== 1) $el->removeAttribute($attr->name);
            if ($name === 'data-cols' && preg_match('/\A(?:[1-9]|10)\z/', $value) !== 1) $el->removeAttribute($attr->name);
            // разметка FAQ аккордеона (schema.org microdata): только известные значения, как serializeAccordion в JS
            if ($name === 'itemscope' && $value !== '' && $value !== 'itemscope') $el->setAttribute('itemscope', '');
            if ($name === 'itemprop' && !in_array($value, ['mainEntity', 'name', 'acceptedAnswer', 'text'], true)) $el->removeAttribute($attr->name);
            if ($name === 'itemtype' && !in_array($value, ['https://schema.org/FAQPage', 'https://schema.org/Question', 'https://schema.org/Answer'], true)) $el->removeAttribute($attr->name);
            // формула ячейки: «=» и только знаки формул, не длиннее 500 — как formulaAllowed в JS
            if ($name === 'data-formula' && preg_match('/\A=[0-9A-Za-zА-Яа-яЁё$:;,.+\-−–—*\/×÷()%#!\s]{0,499}\z/u', $value) !== 1) $el->removeAttribute($attr->name);
            if (in_array($name, ['width', 'height', 'colspan', 'rowspan', 'span', 'start', 'value'], true) && preg_match('/\A\d{1,5}%?\z/', $value) !== 1) $el->removeAttribute($attr->name);
        }
        if ($tag === 'a') {
            if ($el->getAttribute('target') === '_blank') $el->setAttribute('rel', 'noopener noreferrer');
            elseif ($el->hasAttribute('rel')) $el->removeAttribute('rel');
            $video = $el->getAttribute('data-ted-video');
            if ($video !== '' && !self::trustedIframe($video, self::IFRAME_HOSTS)) $el->removeAttribute('data-ted-video');
        }
        if ($tag === 'iframe') {
            $inBlock = self::frameBlock($el->parentNode);
            // порядок атрибутов постоянный и как у редактора (serializeIframe): очистка идемпотентна, сохранённое редактором не меняется
            $full = $el->hasAttribute('allowfullscreen');
            foreach (['loading', 'sandbox', 'referrerpolicy', 'allowfullscreen'] as $fixed) $el->removeAttribute($fixed);
            $el->setAttribute('loading', 'lazy');
            $el->setAttribute('sandbox', $inBlock ? self::BLOCK_SANDBOX : 'allow-scripts allow-same-origin allow-presentation allow-popups');
            $el->setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            if ($full) $el->setAttribute('allowfullscreen', '');
        }
    }

    /* urls:begin — то же правило, что src/core/urls.js (urlOk); общие примеры tests/security/url-vectors.json */
    private const IMAGE_DATA = '~\Adata:image/(?:png|jpe?g|gif|webp|avif|bmp)[;,]~';
    private const DANGER = '~\A(?:javascript|vbscript|livescript|mocha|data|file|blob|about|filesystem|jar|view-source|ms-[a-z-]+):~';
    private const HIDDEN = '/[\x{0000}-\x{0020}\x{007F}-\x{00A0}\x{00AD}\x{1680}\x{180E}\x{2000}-\x{200F}\x{2028}-\x{202F}\x{205F}-\x{2064}\x{3000}\x{FEFF}\x{FFFD}]/u';

    /**
     * Адрес допустим? $kind: 'link' — href (ещё mailto:, tel:); 'media' — src видео, аудио, фрейма, постер;
     * 'image' — src картинки (ещё растровая data:image — картинки старых статей, решение 21.11).
     * Без схемы — можно: «/путь», «#якорь», «?запрос», «страница.html», «//сайт» (решение 21.11). Схемы — только http(s),
     * в ссылках ещё mailto: и tel:. Схема — как её видит браузер: без пробелов, переводов строк и невидимых знаков, любой регистр;
     * опасная схема ищется и после раскодирования %XX.
     */
    public static function urlOk(string $value, string $kind = 'link'): bool
    {
        $v = self::bareUrl($value);
        if ($v === '') return false;
        $decoded = self::bareUrl(rawurldecode($v));
        if ($decoded === '') $decoded = $v;
        if ($kind === 'image' && preg_match(self::IMAGE_DATA, $v) === 1) return true;
        if (preg_match(self::DANGER, $v) === 1 || preg_match(self::DANGER, $decoded) === 1) return false;
        if (preg_match('~\A([a-z][a-z0-9+.-]*):~', $v, $m) !== 1) return true;   // без схемы
        if ($m[1] === 'http' || $m[1] === 'https') return true;
        return $kind === 'link' && ($m[1] === 'mailto' || $m[1] === 'tel');
    }

    /** srcset: каждый адрес — по правилу картинки. */
    public static function srcsetOk(string $value): bool
    {
        foreach (explode(',', $value) as $part) {
            $url = preg_split('/\s+/', trim($part))[0] ?? '';
            if ($url === '' || !self::urlOk($url, 'image')) return false;
        }
        return true;
    }

    private static function bareUrl(string $s): string
    {
        $out = preg_replace(self::HIDDEN, '', $s);
        if ($out === null) $out = (string) preg_replace('/[\x00-\x20\x7F]/', '', $s);   // не UTF-8: убрать хотя бы управляющие знаки
        return strtolower($out);
    }
    /* urls:end */

    /** Вид адреса по тегу и атрибуту: картинка (img, source в picture) — 'image', ссылка — 'link', остальное — 'media'. */
    private static function urlKind(string $tag, string $attr, DOMElement $el): string
    {
        if ($attr === 'href') return 'link';
        if ($attr === 'src' && ($tag === 'img' || ($tag === 'source' && $el->parentNode instanceof DOMElement && strtolower($el->parentNode->localName) === 'picture'))) return 'image';
        return 'media';
    }

    /** Адрес фрейма блока «iFrame»: https, без логина, пароля и порта. */
    /** Элемент блока с фреймом (block.json → frames: true, блок «iFrame»), как isFrameBlock в src/core/allowlist.js. */
    private static function frameBlock(mixed $el): bool
    {
        if (!$el instanceof DOMElement) return false;
        $def = TedBlocks::of($el);
        return $def !== null && !empty($def['frames']);
    }

    private static function httpsFrame(string $value): bool
    {
        $v = trim($value);
        if ($v === '' || preg_match('/[\s<>"\'`]/', $v)) return false;
        $parts = parse_url($v);
        return $parts !== false && ($parts['scheme'] ?? '') === 'https' && ($parts['host'] ?? '') !== '' && !isset($parts['user']) && !isset($parts['pass']) && !isset($parts['port']);
    }

    private static function trustedIframe(string $value, array $hosts): bool
    {
        $parts = parse_url(trim($value));
        if ($parts === false || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) return false;
        return in_array(strtolower($parts['host'] ?? ''), $hosts, true);
    }
}
