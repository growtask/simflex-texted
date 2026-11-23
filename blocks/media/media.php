<?php
declare(strict_types=1);

/**
 * Медиа на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без вида «Файл» или «Видео»: ссылки на файлы / видео абзацами (как toText в media.js);
 * изображение, галерея и аудио исчезают (block.json → degrade: drop).
 */
return [
    'degrade' => static fn (DOMElement $el, DOMDocument $doc): array => array_map(
        static fn ($a) => TedPresets::para($doc, [TedPresets::link($doc, $a->getAttribute('href'), $a->textContent !== '' ? $a->textContent : $a->getAttribute('href'))]),
        TedPresets::findAll($el, static fn ($x) => strtolower($x->localName) === 'a' && $x->hasAttribute('href')),
    ),
];
