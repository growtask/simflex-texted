<?php
declare(strict_types=1);

/**
 * Блок «Товар» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без товара: «Название — цена», ссылкой на товар (как toText в product.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $n = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-product__name'));
        $pr = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-product__now'));
        $a = TedPresets::find($el, static fn ($x) => strtolower($x->localName) === 'a' && TedPresets::has($x, 'ted-product__btn') && $x->hasAttribute('href'));
        $t = implode(' — ', array_filter([$n ? TedPresets::text($n) : '', $pr ? TedPresets::text($pr) : ''], static fn ($s) => $s !== ''));
        if ($t === '') return [];
        return [TedPresets::para($doc, [$a ? TedPresets::link($doc, $a->getAttribute('href'), $t) : $doc->createTextNode($t)])];
    },
];
