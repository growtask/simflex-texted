<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Медиа на сервере (Blocks::getServerBlock).
 * degrade — в наборе без вида «Файл» или «Видео»: ссылки на файлы / видео абзацами (как toText в media.js);
 * изображение, галерея и аудио исчезают (block.json → degrade: drop).
 */
final class Media implements ServerBlock
{
    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $links = Presets::findAll($element, static fn($x) => strtolower($x->localName) === 'a' && $x->hasAttribute('href'));
        return array_map(
            static fn($a) => Presets::para($document, [Presets::link($document, $a->getAttribute('href'), $a->textContent !== '' ? $a->textContent : $a->getAttribute('href'))]),
            $links,
        );
    }
}
