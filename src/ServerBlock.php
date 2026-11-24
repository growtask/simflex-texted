<?php

declare(strict_types=1);

namespace Simflex\Texted;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Серверная часть блока: класс Simflex\Texted\Blocks\<Тип> в папке блока (blocks/<тип>/<Тип>.php).
 *
 * Реестр (Blocks::getServerBlock) находит класс по папке блока; без класса блок на сервере описывает только block.json.
 */
interface ServerBlock
{
    /**
     * Блок в наборе без него → обычный текст (абзацы, списки), как toText блока в браузере
     *
     * @param DOMElement $element Элемент блока
     * @param DOMDocument $document Документ, в котором создаются новые узлы
     * @return DOMNode[]
     */
    public function degrade(DOMElement $element, DOMDocument $document): array;
}
