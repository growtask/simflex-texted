<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Товар» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без товара: «Название — цена», ссылкой на товар (как toText в product.js).
 */
final class Product implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $n = Presets::find($element, static fn($x) => Presets::has($x, 'ted-product__name'));
        $pr = Presets::find($element, static fn($x) => Presets::has($x, 'ted-product__now'));
        $a = Presets::find($element, static fn($x) => strtolower($x->localName) === 'a' && Presets::has($x, 'ted-product__btn') && $x->hasAttribute('href'));
        $t = implode(' — ', array_filter([$n ? Presets::text($n) : '', $pr ? Presets::text($pr) : ''], static fn($s) => $s !== ''));
        if ($t === '') {
            return [];
        }
        return [Presets::para($document, [$a ? Presets::link($document, $a->getAttribute('href'), $t) : $document->createTextNode($t)])];
    }
}
