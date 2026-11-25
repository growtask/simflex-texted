<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Содержание» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без содержания: заголовок жирным абзацем и список ссылок на главы (как toText в toc.js).
 */
final class Toc implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        $t = Presets::find($element, static fn($x) => Presets::has($x, 'ted-toc__title'));
        if ($t && Presets::text($t) !== '') {
            $out[] = Presets::para($document, [Presets::strong($document, Presets::text($t))]);
        }
        $list = Presets::find($element, static fn($x) => Presets::has($x, 'ted-toc__list'));
        $links = [];
        if ($list) {
            foreach (Presets::findAll($list, static fn($x) => strtolower($x->localName) === 'a' && $x->hasAttribute('href')) as $a) {
                $links[] = [Presets::link($document, $a->getAttribute('href'), Presets::text($a))];
            }
        }
        if ($links) {
            $out[] = Presets::listOf($document, 'ul', $links);
        }
        return $out;
    }
}
