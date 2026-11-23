<?php
declare(strict_types=1);

/**
 * Блок «Кнопка» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без кнопки: заголовок баннера жирным, текст, кнопки — ссылками (как toText в button.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $out = [];
        $t = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-button__title'));
        $d = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-button__desc'));
        if ($t && TedPresets::text($t) !== '') $out[] = TedPresets::para($doc, [TedPresets::strong($doc, TedPresets::text($t))]);
        if ($d && TedPresets::text($d) !== '') $out[] = TedPresets::para($doc, [$doc->createTextNode(TedPresets::text($d))]);
        foreach (TedPresets::elements($el) as $a) {
            if (strtolower($a->localName) !== 'a' || TedPresets::text($a) === '') continue;
            $out[] = TedPresets::para($doc, [$a->getAttribute('href') !== '' ? TedPresets::link($doc, $a->getAttribute('href'), TedPresets::text($a)) : $doc->createTextNode(TedPresets::text($a))]);
        }
        return $out;
    },
];
