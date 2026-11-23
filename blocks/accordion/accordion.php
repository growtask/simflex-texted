<?php
declare(strict_types=1);

/**
 * Блок «Аккордеон» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без аккордеона: вопрос жирным абзацем, за ним блоки ответа (как toText в accordion.js).
 */
return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc): array {
        $out = [];
        foreach (TedPresets::elements($el) as $item) {
            if (!TedPresets::has($item, 'ted-accordion__item')) continue;
            $q = TedPresets::childWith($item, 'ted-accordion__q');
            if ($q && TedPresets::text($q) !== '') $out[] = TedPresets::para($doc, [TedPresets::strong($doc, TedPresets::text($q))]);
            // сохранённый вид: details > summary.ted-accordion__q + div.ted-accordion__a > div.ted-accordion__body
            $answer = TedPresets::childWith($item, 'ted-accordion__a');
            $body = TedPresets::childWith($item, 'ted-accordion__body') ?? ($answer ? (TedPresets::childWith($answer, 'ted-accordion__body') ?? $answer) : null);
            if ($body) foreach (TedPresets::elements($body) as $c) if (TedPresets::text($c) !== '') $out[] = $c->cloneNode(true);
        }
        return $out;
    },
];
