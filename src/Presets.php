<?php

declare(strict_types=1);

namespace Simflex\Texted;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;
use InvalidArgumentException;

/**
 * Наборы (пресеты) texted на сервере — этап 2 MODULAR_PLAN.md.
 *
 * Набор = какие блоки доступны + как открывается редактор (mode: edit, view, readonly).
 * Набор поля задаёт СЕРВЕР (по настройке поля в CMS), а не браузер: перед сохранением HTML очищается по набору,
 * запрещённые блоки превращаются в обычный текст (абзацы и списки) — подделанный запрос не сохранит запрещённый блок.
 * Правила превращения — те же, что в браузере (resources/js/core/blocks.js → restrictBlocks); общий набор примеров —
 * tests/presets/vectors.json, его проверяют оба теста (php/test-presets.php и набор presets в tests/run.html).
 *
 *   $ted = Config::load();
 *   $clean = $ted->save($_POST['content'], 'mini', $user->canEdit());   // очистка + набор; без права — AccessDenied
 */
final class Presets
{
    /* presets:begin — тот же список в resources/js/core/presets.js (PRESETS) */
    public const BASE = [
        'full' => ['blocks' => 'all', 'mode' => 'edit'],
        'mini' => ['blocks' => ['p', 'h2', 'h3', 'h4', 'ul', 'ol', 'blockquote', 'image'], 'mode' => 'edit'],
        'text' => ['blocks' => ['p', 'ul', 'ol'], 'mode' => 'edit'],
        'readonly' => ['blocks' => 'all', 'mode' => 'readonly'],
        'docs' => ['blocks' => 'all', 'mode' => 'view'],
    ];
    /* presets:end */

    /* types:begin — виды блоков, тот же список в resources/js/core/presets.js (PRESET_TYPES) */
    public const TYPES = [];
    /* types:end */
    // Список пуст: все виды — из реестра блоков (blocks/<тип>/block.json), этап 5.

    public const ALIASES = [];

    /** Все виды блоков наборов: ядро + блоки из blocks/<тип>/block.json (этап 5). @return string[] */
    public static function types(): array
    {
        return array_merge(self::TYPES, array_keys(Blocks::all()));
    }

    /** Вид по другому имени: quote → blockquote, separator → hr (block.json → aliases). */
    public static function alias(string $t): string
    {
        if (isset(self::ALIASES[$t])) {
            return self::ALIASES[$t];
        }
        $def = Blocks::get($t);
        return $def ? $def['type'] : $t;
    }
    private const MODES = ['edit', 'view', 'readonly'];
    private const BG_NAMES = ['gray', 'color1', 'color2'];

    /**
     * Проверить описание своего набора; вернуть ['blocks' => 'all' | [виды], 'mode' => …].
     * Те же правила, что у Ted.definePreset в браузере.
     */
    public static function check(string $name, mixed $def): array
    {
        if (preg_match('/\A[a-z][a-z0-9_-]{0,31}\z/', $name) !== 1) {
            throw new InvalidArgumentException("presets: имя набора «{$name}» — латиница, цифры, «-» и «_», начинается с буквы");
        }
        if (isset(self::BASE[$name])) {
            throw new InvalidArgumentException("presets: «{$name}» — базовый набор, его нельзя переопределить; дайте своему набору другое имя");
        }
        if (!is_array($def) || array_is_list($def) && $def !== []) {
            throw new InvalidArgumentException("presets.{$name}: нужен массив ['blocks' => …, 'mode' => …]");
        }
        foreach (array_keys($def) as $key) {
            if (!in_array($key, ['blocks', 'mode'], true)) {
                throw new InvalidArgumentException("presets.{$name}: неизвестный ключ «{$key}». Допустимы: blocks, mode");
            }
        }
        $mode = $def['mode'] ?? 'edit';
        if (!in_array($mode, self::MODES, true)) {
            throw new InvalidArgumentException("presets.{$name}.mode: " . implode(', ', self::MODES));
        }
        $blocks = $def['blocks'] ?? 'all';
        if ($blocks !== 'all') {
            if (!is_array($blocks) || !$blocks || !array_is_list($blocks)) {
                throw new InvalidArgumentException("presets.{$name}.blocks: 'all' или список видов блоков");
            }
            $out = [];
            foreach ($blocks as $t) {
                $type = is_string($t) ? self::alias($t) : $t;
                if (!is_string($type) || !in_array($type, self::types(), true)) {
                    throw new InvalidArgumentException("presets.{$name}.blocks: неизвестный блок «" . (is_string($t) ? $t : gettype($t)) . '». Допустимы: ' . implode(', ', self::types()));
                }
                if (!in_array($type, $out, true)) {
                    $out[] = $type;
                }
            }
            $blocks = $out;
        }
        return ['blocks' => $blocks, 'mode' => $mode];
    }

    /** Разрешённые виды набора (с абзацем) или null — разрешено всё. */
    public static function allowed(array $def): ?array
    {
        if ($def['blocks'] === 'all') {
            return null;
        }
        $set = $def['blocks'];
        if (!in_array('p', $set, true)) {
            $set[] = 'p';
        }
        return $set;
    }

    /**
     * Привести блоки верхнего уровня к набору: запрещённые → обычный текст, цветной фон снимается, если не разрешён.
     * $html — уже очищенный Sanitizer::clean (вызывает Config::clean). $allowed = null — ничего не меняется.
     */
    public static function restrict(string $html, ?array $allowed): string
    {
        if ($allowed === null || trim($html) === '') {
            return $html;
        }
        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><body>' . $html . '</body>', LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $body = $doc->getElementsByTagName('body')->item(0);
        if (!$body) {
            return '';
        }
        foreach (self::elements($body) as $el) {
            $replacement = self::walk($el, 0, $allowed, $doc);
            if (count($replacement) === 1 && $replacement[0] === $el) {
                continue;
            }
            foreach ($replacement as $node) {
                $body->insertBefore($node, $el);
            }
            $body->removeChild($el);
        }
        // вложенные блоки (решение 22.11): запрещённый блок внутри разрешённого тоже превращается в текст,
        // «сырые» фрейм, видео, таблица, картинка — только внутри своего блока (как restrictBlocks в resources/js/core/blocks.js)
        foreach (self::elements($body) as $el) {
            self::inner($el, 0, $allowed, $doc);
        }
        $out = '';
        foreach (iterator_to_array($body->childNodes) as $node) {
            $out .= $doc->saveHTML($node);
        }
        return trim($out);
    }

    /** @return DOMNode[] */
    private static function walk(DOMElement $el, int $depth, array $allowed, DOMDocument $doc): array
    {
        $kind = self::kind($el);
        if (in_array($kind, $allowed, true)) {
            self::stripBg($el, $allowed);
            return [$el];
        }
        if ($depth > 4) {
            $t = self::text($el);
            return $t === '' ? [] : [$doc->createElement('p', htmlspecialchars($t, ENT_QUOTES | ENT_HTML5, 'UTF-8'))];
        }
        $out = [];
        foreach (self::degrade($el, $kind, $doc) as $node) {
            if ($node instanceof DOMElement) {
                array_push($out, ...self::walk($node, $depth + 1, $allowed, $doc));
            } else {
                $out[] = $node;
            }
        }
        return $out;
    }

    private const INNER_FREE = ['p', 'ul', 'ol'];
    private const INLINE_PARENT = '/\A(p|h[1-6]|summary|a|strong|b|em|i|u|s|span|code|sub|sup|mark|small)\z/';

    private static function stripBg(DOMElement $el, array $allowed): void
    {
        if (in_array('background', $allowed, true) || !$el->hasAttribute('class')) {
            return;
        }
        $classes = array_values(array_filter(preg_split('/\s+/', trim($el->getAttribute('class'))) ?: [], static fn($c) => !in_array($c, array_map(static fn($n) => "ted-bg-{$n}", self::BG_NAMES), true)));
        if ($classes) {
            $el->setAttribute('class', implode(' ', $classes));
        } else {
            $el->removeAttribute('class');
        }
    }

    private static function inner(DOMElement $el, int $depth, array $allowed, DOMDocument $doc): void
    {
        foreach (self::elements($el) as $c) {
            self::checkInner($c, $depth + 1, $allowed, $doc);
        }
    }

    /** Вложенный элемент: блок проверяется по набору, «сырой» тег — по владельцу (как check в restrictBlocks, resources/js/core/blocks.js). */
    private static function checkInner(DOMElement $c, int $depth, array $allowed, DOMDocument $doc): void
    {
        $def = Blocks::of($c);
        $parent = $c->parentNode;
        if ($def) {
            $type = (string) $def['type'];
            if (in_array($type, self::INNER_FREE, true) || in_array($type, $allowed, true)) {
                self::stripBg($c, $allowed);
                self::inner($c, $depth, $allowed, $doc);
                return;
            }
            $out = $depth > 8 ? [] : self::degrade($c, $type, $doc);
            if ($parent instanceof DOMElement && preg_match(self::INLINE_PARENT, strtolower($parent->localName)) === 1) {
                $t = implode(' ', array_filter(array_map(static fn($n) => self::text($n), $out), static fn($x) => $x !== ''));
                if ($t !== '') {
                    $parent->insertBefore($doc->createTextNode($t), $c);
                }
                $parent->removeChild($c);
                return;
            }
            foreach ($out as $n) {
                $parent->insertBefore($n, $c);
            }
            $parent->removeChild($c);
            foreach ($out as $n) {
                if ($n instanceof DOMElement) {
                    self::checkInner($n, $depth + 1, $allowed, $doc);
                }
            }
            return;
        }
        if (!self::ownedNested($c)) {   // чужой «сырой» тег — разворачивается в свой текст
            $kids = iterator_to_array($c->childNodes);
            foreach ($kids as $k) {
                $parent->insertBefore($k, $c);
            }
            $parent->removeChild($c);
            foreach ($kids as $k) {
                if ($k instanceof DOMElement) {
                    self::checkInner($k, $depth + 1, $allowed, $doc);
                }
            }
            return;
        }
        self::stripBg($c, $allowed);
        self::inner($c, $depth, $allowed, $doc);
    }

    private const PHRASING = ['a', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'sub', 'sup', 'mark', 'small', 'span', 'br', 'wbr', 'abbr', 'q'];
    /** @var array<string, string[]> */
    private static array $ownTags = [];

    /** Своя разметка блока: теги из block.json → html и образца меню (как ownTags в resources/js/core/blocks.js). */
    private static function ownTags(array $def): array
    {
        $type = (string) $def['type'];
        if (isset(self::$ownTags[$type])) {
            return self::$ownTags[$type];
        }
        $tags = array_keys($def['html'] ?? []);
        $sample = (string) ($def['menu']['sample'] ?? '');
        if ($sample !== '') {
            $d = new DOMDocument('1.0', 'UTF-8');
            $prev = libxml_use_internal_errors(true);
            $d->loadHTML('<?xml encoding="UTF-8"><body>' . $sample . '</body>', LIBXML_NONET | LIBXML_COMPACT);
            libxml_clear_errors();
            libxml_use_internal_errors($prev);
            $body = $d->getElementsByTagName('body')->item(0);
            if ($body) {
                foreach ($body->getElementsByTagName('*') as $e) {
                    $tags[] = strtolower($e->localName);
                }
            }
        }
        return self::$ownTags[$type] = array_values(array_unique($tags));
    }

    /** Элемент без своего вида на своём месте (как ownedNested в resources/js/core/blocks.js). */
    private static function ownedNested(DOMElement $c): bool
    {
        $tag = strtolower($c->localName);
        for ($a = $c->parentNode; $a instanceof DOMElement; $a = $a->parentNode) {
            $def = Blocks::of($a);
            if (!$def) {
                continue;
            }
            if (empty($def['text']) && ($def['degrade'] ?? '') !== 'children' && empty($def['container'])) {
                return true;
            }
            return in_array($tag, self::PHRASING, true) || in_array($tag, self::ownTags($def), true);
        }
        return in_array($tag, self::PHRASING, true);
    }

    /** Вид блока сохранённого HTML — как restrictKind / kindOf в resources/js/core/blocks.js. */
    private static function kind(DOMElement $el): string
    {
        $def = Blocks::of($el);   // блок из реестра (этап 5)
        if ($def) {
            return $def['type'];
        }
        $tag = strtolower($el->localName);
        return $tag;
    }

    /** Блок запрещённого вида → обычный текст (абзацы / списки), как degradeBlock в resources/js/core/blocks.js. @return DOMNode[] */
    private static function degrade(DOMElement $el, string $kind, DOMDocument $doc): array
    {
        $def = Blocks::get($kind);   // блок из реестра: как превращать в текст — block.json → degrade (то же в браузере)
        if ($def && ($def['degrade'] ?? '') === 'drop') {
            return [];
        }
        // children: вложенные блоки с текстом — как есть (и сами проверяются по набору), как в браузере
        if ($def && ($def['degrade'] ?? '') === 'children') {
            return array_values(array_map(static fn($c) => $c->cloneNode(true), array_filter(self::elements($el), static fn($c) => self::text($c) !== '')));
        }
        $serverBlock = Blocks::getServerBlock($kind);   // блок сам превращается в текст (blocks/<тип>/<Тип>.php, ServerBlock)
        if ($serverBlock) {
            return $serverBlock->degrade($el, $doc);
        }
        $children = self::elements($el);
        switch ($kind) {
            case 'checklist':
                return [self::listOf($doc, 'ul', array_map(static fn($li) => self::childNodes($li), $children))];
            case 'steps':
                return [self::listOf($doc, 'ol', array_map(static function ($li) use ($doc) {
                    $t = self::text(self::firstElement($li));
                    $d = self::text(self::tailText($li));
                    return [$doc->createTextNode($t . ($d !== '' ? ' — ' . $d : ''))];
                }, $children))];
            case 'facts':
                return array_values(array_filter(array_map(static function ($li) use ($doc) {
                    $t = self::text(self::firstElement($li));
                    $d = self::text(self::tailText($li));
                    return self::para($doc, [$doc->createTextNode($t . ($d !== '' ? ' — ' . $d : ''))]);
                }, $children), static fn($p) => self::text($p) !== ''));
            case 'proscons':
                $out = [];
                foreach ($children as $card) {
                    $t = self::text(self::firstElement($card));
                    if ($t !== '') {
                        $out[] = self::para($doc, [self::strong($doc, $t)]);
                    }
                    foreach (self::elements($card) as $ul) {
                        if (strtolower($ul->localName) !== 'ul') {
                            continue;
                        }
                        $items = array_values(array_filter(self::elements($ul), static fn($li) => self::hasContent($li)));
                        $out[] = self::listOf($doc, 'ul', array_map(static fn($li) => self::childNodes($li), $items));
                        break;
                    }
                }
                return $out;
            case 'blockquote':
                return array_values(array_map(static fn($c) => self::para($doc, self::childNodes($c)), array_filter($children, static fn($c) => strtolower($c->localName) === 'p' && !self::has($c, 'ted-author'))));
            case 'pre':
                $nodes = [];
                foreach (explode("\n", $el->textContent) as $i => $line) {
                    if ($i) {
                        $nodes[] = $doc->createElement('br');
                    }
                    if ($line !== '') {
                        $nodes[] = $doc->createTextNode($line);
                    }
                }
                return [self::para($doc, $nodes)];
            case 'raw':
                return [];
            case 'ul': case 'ol':
                return array_map(static fn($li) => self::para($doc, self::childNodes($li)), $children);
            default:
                return [self::para($doc, self::childNodes($el))];
        }
    }

    // --- помощники DOM ---

    /** Первый дочерний элемент с классом (как :scope > .класс). */
    public static function childWith(DOMElement $el, string $cls): ?DOMElement
    {
        foreach (self::elements($el) as $c) {
            if (self::has($c, $cls)) {
                return $c;
            }
        }
        return null;
    }

    public static function has(DOMElement $el, string $cls): bool
    {
        return in_array($cls, preg_split('/\s+/', trim($el->getAttribute('class'))) ?: [], true);
    }

    /** @return DOMElement[] */
    public static function elements(DOMNode $el): array
    {
        $out = [];
        foreach ($el->childNodes as $c) {
            if ($c instanceof DOMElement) {
                $out[] = $c;
            }
        }
        return $out;
    }

    private static function firstElement(DOMElement $el): ?DOMElement
    {
        foreach ($el->childNodes as $c) {
            if ($c instanceof DOMElement) {
                return $c;
            }
        }
        return null;
    }

    /** Текст узлов после второго (описание шага и цифры), как Array.from(li.childNodes).slice(2) в браузере. */
    private static function tailText(DOMElement $li): string
    {
        $s = '';
        $i = 0;
        foreach ($li->childNodes as $c) {
            if ($i++ >= 2) {
                $s .= $c->textContent;
            }
        }
        return $s;
    }

    /** Копии дочерних узлов (как innerHTML). @return DOMNode[] */
    public static function childNodes(DOMElement $el): array
    {
        $out = [];
        foreach ($el->childNodes as $c) {
            $out[] = $c->cloneNode(true);
        }
        return $out;
    }

    /** textContent без невидимого пробела и пробелов по краям (как trim() в JS). */
    public static function text(mixed $node): string
    {
        $s = is_string($node) ? $node : ($node instanceof DOMNode ? $node->textContent : '');
        $s = str_replace("\u{200B}", '', $s);
        return (string) preg_replace('/\A[\s\x{00A0}\x{FEFF}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}]+|[\s\x{00A0}\x{FEFF}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}]+\z/u', '', $s);
    }

    /** Есть ли в ячейке / пункте что-то кроме <br> и пробелов (как innerHTML.replace(/<br>/g, '').trim() в JS). */
    public static function hasContent(DOMElement $el): bool
    {
        foreach ($el->childNodes as $c) {
            if ($c instanceof DOMElement) {
                if (strtolower($c->localName) !== 'br') {
                    return true;
                } continue;
            }
            if ($c instanceof DOMText && preg_match('/[^ \t\n\r\f\v]/', $c->data) === 1) {
                return true;
            }
        }
        return false;
    }

    public static function find(DOMElement $root, callable $test): ?DOMElement
    {
        foreach ($root->getElementsByTagName('*') as $x) {
            if ($test($x)) {
                return $x;
            }
        }
        return null;
    }

    /** @return DOMElement[] */
    public static function findAll(DOMElement $root, callable $test): array
    {
        $out = [];
        foreach ($root->getElementsByTagName('*') as $x) {
            if ($test($x)) {
                $out[] = $x;
            }
        }
        return $out;
    }

    /** @param DOMNode[] $nodes */
    public static function para(DOMDocument $doc, array $nodes): DOMElement
    {
        $p = $doc->createElement('p');
        foreach ($nodes as $n) {
            $p->appendChild($n);
        }
        return $p;
    }

    /** @param DOMNode[][] $items */
    public static function listOf(DOMDocument $doc, string $tag, array $items): DOMElement
    {
        $list = $doc->createElement($tag);
        foreach ($items as $nodes) {
            $li = $doc->createElement('li');
            foreach ($nodes as $n) {
                $li->appendChild($n);
            }
            $list->appendChild($li);
        }
        return $list;
    }

    public static function strong(DOMDocument $doc, string $text): DOMElement
    {
        $s = $doc->createElement('strong');
        $s->appendChild($doc->createTextNode($text));
        return $s;
    }

    public static function link(DOMDocument $doc, string $href, string $text): DOMElement
    {
        $a = $doc->createElement('a');
        $a->setAttribute('href', $href);
        $a->appendChild($doc->createTextNode($text));
        return $a;
    }
}
