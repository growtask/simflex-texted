<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Кнопка» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без кнопки: заголовок баннера жирным, текст, кнопки — ссылками (как toText в button.js).
 */
final class Button implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        $t = Presets::find($element, static fn($x) => Presets::has($x, 'ted-button__title'));
        $d = Presets::find($element, static fn($x) => Presets::has($x, 'ted-button__desc'));
        if ($t && Presets::text($t) !== '') {
            $out[] = Presets::para($document, [Presets::strong($document, Presets::text($t))]);
        }
        if ($d && Presets::text($d) !== '') {
            $out[] = Presets::para($document, [$document->createTextNode(Presets::text($d))]);
        }
        foreach (Presets::elements($element) as $a) {
            if (strtolower($a->localName) !== 'a' || Presets::text($a) === '') {
                continue;
            }
            $out[] = Presets::para($document, [$a->getAttribute('href') !== '' ? Presets::link($document, $a->getAttribute('href'), Presets::text($a)) : $document->createTextNode(Presets::text($a))]);
        }
        return $out;
    }
}
