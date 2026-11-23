<?php
declare(strict_types=1);

/**
 * Блок «Колонки» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без колонок: блоки колонок подряд (как toText в columns.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $out = [];
        foreach (TedPresets::elements($el) as $col) {
            if (!TedPresets::has($col, 'ted-columns__col')) continue;
            foreach (TedPresets::elements($col) as $b) if (TedPresets::text($b) !== '') $out[] = $b->cloneNode(true);
        }
        return $out;
    },
];
