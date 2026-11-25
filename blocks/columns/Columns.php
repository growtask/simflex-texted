<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Колонки» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без колонок: блоки колонок подряд (как toText в columns.js).
 */
final class Columns implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        foreach (Presets::elements($element) as $col) {
            if (!Presets::has($col, 'ted-columns__col')) {
                continue;
            }
            foreach (Presets::elements($col) as $b) {
                if (Presets::text($b) !== '') {
                    $out[] = $b->cloneNode(true);
                }
            }
        }
        return $out;
    }
}
