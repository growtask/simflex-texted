<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Встраивание» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без встраивания: ссылка «Открыть» с заголовком карточки (как toText в embed.js).
 */
final class Embed implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $a = Presets::find($element, static fn($x) => strtolower($x->localName) === 'a' && Presets::has($x, 'ted-embed__open') && $x->hasAttribute('href'));
        $t = Presets::find($element, static fn($x) => Presets::has($x, 'ted-embed__name'));
        return $a ? [Presets::para($document, [Presets::link($document, $a->getAttribute('href'), ($t ? Presets::text($t) : '') ?: $a->getAttribute('href'))])] : [];
    }
}
