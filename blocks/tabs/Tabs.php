<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Вкладки» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без вкладок: название вкладки жирным абзацем, за ним её блоки (как toText в tabs.js).
 */
final class Tabs implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        $children = Presets::elements($element);
        $bodies = array_values(array_filter($children, static fn($c) => Presets::has($c, 'ted-tabs__body')));
        $titles = [];
        foreach ($children as $bar) {
            if (!Presets::has($bar, 'ted-tabs__bar')) {
                continue;
            }
            foreach (Presets::elements($bar) as $x) {
                if (Presets::has($x, 'ted-tabs__title')) {
                    $titles[] = $x;
                }
            }
        }
        // сохранённый вид: div.ted-tabs__panel > p.ted-tabs__title + div.ted-tabs__body
        foreach ($children as $panel) {
            if (!Presets::has($panel, 'ted-tabs__panel')) {
                continue;
            }
            $titles[] = Presets::childWith($panel, 'ted-tabs__title') ?? $document->createElement('p');
            $bodies[] = Presets::childWith($panel, 'ted-tabs__body') ?? $document->createElement('div');
        }
        foreach ($titles as $i => $title) {
            if (Presets::text($title) !== '') {
                $out[] = Presets::para($document, [Presets::strong($document, Presets::text($title))]);
            }
            if (isset($bodies[$i])) {
                foreach (Presets::elements($bodies[$i]) as $c) {
                    if (Presets::text($c) !== '') {
                        $out[] = $c->cloneNode(true);
                    }
                }
            }
        }
        return $out;
    }
}
