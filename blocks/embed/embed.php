<?php
declare(strict_types=1);

/**
 * Блок «Встраивание» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без встраивания: ссылка «Открыть» с заголовком карточки (как toText в embed.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $a = TedPresets::find($el, static fn ($x) => strtolower($x->localName) === 'a' && TedPresets::has($x, 'ted-embed__open') && $x->hasAttribute('href'));
        $t = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-embed__name'));
        return $a ? [TedPresets::para($doc, [TedPresets::link($doc, $a->getAttribute('href'), ($t ? TedPresets::text($t) : '') ?: $a->getAttribute('href'))])] : [];
    },
];
