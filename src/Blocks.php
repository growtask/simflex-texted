<?php

declare(strict_types=1);

namespace Simflex\Texted;

use DOMElement;
use RuntimeException;

/**
 * Реестр блоков на сервере (этап 5 MODULAR_PLAN.md): описания blocks/<тип>/block.json — те же, что собираются в ted.js.
 * Из них сервер берёт белый список очистки (теги и атрибуты, html), виды и другие имена для наборов (type, aliases),
 * как превращать блок в текст (degrade) и какой элемент — блок (selector). Пока блоки переносятся по одному,
 * остальное по-прежнему в Sanitizer и Presets.
 */
final class Blocks
{
    /** @var array<string, array>|null */
    private static ?array $all = null;

    /** Все описания: тип → block.json. Папка — в корне пакета: <пакет>/blocks/<тип>/block.json. */
    public static function all(): array
    {
        if (self::$all !== null) {
            return self::$all;
        }
        $out = [];
        foreach (glob(dirname(__DIR__) . '/blocks/*/block.json') ?: [] as $file) {
            $def = json_decode((string) file_get_contents($file), true);
            $type = is_array($def) ? ($def['type'] ?? null) : null;
            if (!is_string($type) || preg_match('/\A[a-z][a-z0-9-]{0,31}\z/', $type) !== 1 || basename(dirname($file)) !== $type) {
                throw new RuntimeException('Неверное описание блока: ' . $file . ' (type должен совпадать с именем папки)');
            }
            // семейство (заголовки h2–h6, списки ul/ol): одна папка, несколько видов — variants дополняют общее описание
            $variants = $def['variants'] ?? null;
            unset($def['variants']);
            foreach (is_array($variants) ? $variants : [[]] as $v) {
                $one = array_merge($def, $v);
                $one['aliases'] ??= [];
                $one['html'] ??= [];
                $one['_dir'] = dirname($file);
                $out[$one['type']] = $one;
            }
        }
        ksort($out);
        return self::$all = $out;
    }

    /** Namespace серверных частей блоков: класс Simflex\Texted\Blocks\<Тип> в blocks/<тип>/<Тип>.php (classmap) */
    public const SERVER_BLOCK_NAMESPACE = 'Simflex\\Texted\\Blocks\\';

    /** @var array<string, ServerBlock|null> серверные части блоков по папке */
    private static array $serverBlocks = [];

    /**
     * Серверная часть блока (ServerBlock) — класс по папке блока: blocks/iframe → Simflex\Texted\Blocks\Iframe.
     * null — у блока её нет (всё нужное серверу — в block.json).
     */
    public static function getServerBlock(string $type): ?ServerBlock
    {
        $def = self::get($type);
        if (!$def) {
            return null;
        }
        $dir = $def['_dir'];
        if (!array_key_exists($dir, self::$serverBlocks)) {
            $class = self::getServerBlockClass(basename($dir));
            self::$serverBlocks[$dir] = class_exists($class) && is_subclass_of($class, ServerBlock::class) ? new $class() : null;
        }
        return self::$serverBlocks[$dir];
    }

    /** Имя класса серверной части блока по имени папки: «iframe» → Simflex\Texted\Blocks\Iframe */
    public static function getServerBlockClass(string $folder): string
    {
        return self::SERVER_BLOCK_NAMESPACE . str_replace(' ', '', ucwords(str_replace('-', ' ', $folder)));
    }

    /** Теги белого списка из всех блоков. @return string[] */
    public static function tags(): array
    {
        $tags = [];
        foreach (self::all() as $def) {
            foreach (array_keys($def['html']) as $tag) {
                $tags[$tag] = true;
            }
        }
        return array_keys($tags);
    }

    /** Атрибуты тега из всех блоков. @return string[] */
    public static function attrs(string $tag): array
    {
        $out = [];
        foreach (self::all() as $def) {
            foreach ($def['html'][$tag] ?? [] as $a) {
                $out[$a] = true;
            }
        }
        return array_keys($out);
    }

    /** Атрибуты-идентификаторы CMS из всех блоков (block.json → ids). @return string[] */
    public static function ids(): array
    {
        $out = [];
        foreach (self::all() as $def) {
            foreach ($def['ids'] ?? [] as $a) {
                $out[$a] = true;
            }
        }
        return array_keys($out);
    }

    /** Блок по виду или другому имени. */
    public static function get(string $type): ?array
    {
        $all = self::all();
        if (isset($all[$type])) {
            return $all[$type];
        }
        foreach ($all as $def) {
            if (in_array($type, $def['aliases'], true)) {
                return $def;
            }
        }
        return null;
    }

    /** Блок, которому принадлежит элемент (по selector: «тег», «тег.класс», «.класс» — любой тег). */
    public static function of(DOMElement $el): ?array
    {
        foreach (self::all() as $def) {
            $sel = (string) ($def['selector'] ?? '');
            // «тег», «тег.класс», «тег:not(.класс)» (цитата — не выноска), «.класс» (содержание: nav на сайте, div в правке)
            if ($sel === '' || preg_match('/\A([a-z0-9]*)((?:\.[a-z0-9_-]+)*)((?::not\(\.[a-z0-9_-]+\))*)\z/', $sel, $m) !== 1) {
                continue;
            }
            if ($m[1] === '' && $m[2] === '') {
                continue;
            }
            if ($m[1] !== '' && strtolower($el->localName) !== $m[1]) {
                continue;
            }
            $classes = preg_split('/\s+/', trim($el->getAttribute('class'))) ?: [];
            foreach (array_filter(explode('.', $m[2])) as $cls) {
                if (!in_array($cls, $classes, true)) {
                    continue 2;
                }
            }
            if (preg_match_all('/:not\(\.([a-z0-9_-]+)\)/', $m[3], $nots)) {
                foreach ($nots[1] as $cls) {
                    if (in_array($cls, $classes, true)) {
                        continue 2;
                    }
                }
            }
            return $def;
        }
        return null;
    }
}
