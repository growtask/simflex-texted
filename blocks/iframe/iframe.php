<?php
declare(strict_types=1);

/**
 * Блок «iFrame» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без iFrame: ссылка на страницу, текст — подпись или адрес (как toText в iframe.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $f = TedPresets::find($el, static fn ($x) => strtolower($x->localName) === 'iframe' && $x->hasAttribute('src'));
        $cap = TedPresets::find($el, static fn ($x) => strtolower($x->localName) === 'figcaption');
        return $f ? [TedPresets::para($doc, [TedPresets::link($doc, $f->getAttribute('src'), ($cap ? TedPresets::text($cap) : '') ?: $f->getAttribute('src'))])] : [];
    },
];
