<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Аккордеон» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без аккордеона: вопрос жирным абзацем, за ним блоки ответа (как toText в accordion.js).
 */
final class Accordion implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        foreach (Presets::elements($element) as $item) {
            if (!Presets::has($item, 'ted-accordion__item')) {
                continue;
            }
            $q = Presets::childWith($item, 'ted-accordion__q');
            if ($q && Presets::text($q) !== '') {
                $out[] = Presets::para($document, [Presets::strong($document, Presets::text($q))]);
            }
            // сохранённый вид: details > summary.ted-accordion__q + div.ted-accordion__a > div.ted-accordion__body
            $answer = Presets::childWith($item, 'ted-accordion__a');
            $body = Presets::childWith($item, 'ted-accordion__body') ?? ($answer ? (Presets::childWith($answer, 'ted-accordion__body') ?? $answer) : null);
            if ($body) {
                foreach (Presets::elements($body) as $c) {
                    if (Presets::text($c) !== '') {
                        $out[] = $c->cloneNode(true);
                    }
                }
            }
        }
        return $out;
    }
}
