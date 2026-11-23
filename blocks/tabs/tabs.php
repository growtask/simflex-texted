<?php
declare(strict_types=1);

/**
 * Блок «Вкладки» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без вкладок: название вкладки жирным абзацем, за ним её блоки (как toText в tabs.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $out = [];
        $children = TedPresets::elements($el);
        $bodies = array_values(array_filter($children, static fn ($c) => TedPresets::has($c, 'ted-tabs__body')));
        $titles = [];
        foreach ($children as $bar) {
            if (!TedPresets::has($bar, 'ted-tabs__bar')) continue;
            foreach (TedPresets::elements($bar) as $x) if (TedPresets::has($x, 'ted-tabs__title')) $titles[] = $x;
        }
        // сохранённый вид: div.ted-tabs__panel > p.ted-tabs__title + div.ted-tabs__body
        foreach ($children as $panel) {
            if (!TedPresets::has($panel, 'ted-tabs__panel')) continue;
            $titles[] = TedPresets::childWith($panel, 'ted-tabs__title') ?? $doc->createElement('p');
            $bodies[] = TedPresets::childWith($panel, 'ted-tabs__body') ?? $doc->createElement('div');
        }
        foreach ($titles as $i => $title) {
            if (TedPresets::text($title) !== '') $out[] = TedPresets::para($doc, [TedPresets::strong($doc, TedPresets::text($title))]);
            if (isset($bodies[$i])) foreach (TedPresets::elements($bodies[$i]) as $c) if (TedPresets::text($c) !== '') $out[] = $c->cloneNode(true);
        }
        return $out;
    },
];
