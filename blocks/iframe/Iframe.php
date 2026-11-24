<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «iFrame» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без iFrame: ссылка на страницу, текст — подпись или адрес (как toText в iframe.js).
 */
final class Iframe implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $f = Presets::find($element, static fn($x) => strtolower($x->localName) === 'iframe' && $x->hasAttribute('src'));
        $cap = Presets::find($element, static fn($x) => strtolower($x->localName) === 'figcaption');
        return $f ? [Presets::para($document, [Presets::link($document, $f->getAttribute('src'), ($cap ? Presets::text($cap) : '') ?: $f->getAttribute('src'))])] : [];
    }
}
