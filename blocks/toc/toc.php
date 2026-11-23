<?php
declare(strict_types=1);

/**
 * Блок «Содержание» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без содержания: заголовок жирным абзацем и список ссылок на главы (как toText в toc.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $out = [];
        $t = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-toc__title'));
        if ($t && TedPresets::text($t) !== '') $out[] = TedPresets::para($doc, [TedPresets::strong($doc, TedPresets::text($t))]);
        $list = TedPresets::find($el, static fn ($x) => TedPresets::has($x, 'ted-toc__list'));
        $links = [];
        if ($list) foreach (TedPresets::findAll($list, static fn ($x) => strtolower($x->localName) === 'a' && $x->hasAttribute('href')) as $a) {
            $links[] = [TedPresets::link($doc, $a->getAttribute('href'), TedPresets::text($a))];
        }
        if ($links) $out[] = TedPresets::listOf($doc, 'ul', $links);
        return $out;
    },
];
