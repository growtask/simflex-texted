<?php

declare(strict_types=1);

namespace Simflex\Texted\Blocks;

use DOMDocument;
use DOMElement;
use Simflex\Texted\Presets;
use Simflex\Texted\ServerBlock;

/**
 * Блок «Таблица» на сервере (Blocks::getServerBlock).
 * degrade — в наборе без таблицы: строка — абзац, ячейки через « · », подпись — абзацем (как toText в table.js).
 */
final class Table implements ServerBlock
{
    /**
     * Сама таблица: блок редактора — figure > .ted-table__wrap > table; таблица из старой статьи или вставки — голая
     * <table> (или figure > table) — тоже читается, иначе в наборе без таблиц пропадала вместе с текстом (28.11).
     */
    private function getTable(DOMElement $el): ?DOMElement
    {
        if (strtolower($el->localName) === 'table') {
            return $el;
        }
        foreach (Presets::elements($el) as $c) {
            if (strtolower($c->localName) === 'table') {
                return $c;
            }
            if (Presets::has($c, 'ted-table__wrap')) {
                foreach (Presets::elements($c) as $t) {
                    if (strtolower($t->localName) === 'table') {
                        return $t;
                    }
                }
            }
        }
        return null;
    }

    /** @return DOMElement[] строки таблицы по порядку: шапка, тело (и строки прямо в table), итог */
    private function getRows(DOMElement $el): array
    {
        $table = $this->getTable($el);
        if (!$table) {
            return [];
        }
        $head = $body = $foot = [];
        foreach (Presets::elements($table) as $sec) {
            $name = strtolower($sec->localName);
            if ($name === 'tr') {
                $body[] = $sec;
                continue;
            }
            if (!in_array($name, ['thead', 'tbody', 'tfoot'], true)) {
                continue;
            }
            foreach (Presets::elements($sec) as $tr) {
                if (strtolower($tr->localName) !== 'tr') {
                    continue;
                }
                if ($name === 'thead') {
                    $head[] = $tr;
                } elseif ($name === 'tfoot') {
                    $foot[] = $tr;
                } else {
                    $body[] = $tr;
                }
            }
        }
        return [...$head, ...$body, ...$foot];
    }

    public function degrade(DOMElement $element, DOMDocument $document): array
    {
        $out = [];
        foreach ($this->getRows($element) as $tr) {
            $nodes = [];
            foreach (Presets::elements($tr) as $cell) {
                if (!in_array(strtolower($cell->localName), ['td', 'th'], true) || !Presets::hasContent($cell)) {
                    continue;
                }
                if ($nodes) {
                    $nodes[] = $document->createTextNode(' · ');
                }
                array_push($nodes, ...Presets::childNodes($cell));
            }
            $p = Presets::para($document, $nodes);
            if (Presets::text($p) !== '') {
                $out[] = $p;
            }
        }
        $table = $this->getTable($element);
        $captions = [...Presets::elements($element), ...($table && $table !== $element ? Presets::elements($table) : [])];
        foreach ($captions as $c) {
            if (in_array(strtolower($c->localName), ['figcaption', 'caption'], true) && Presets::text($c) !== '') {
                $out[] = Presets::para($document, [$document->createTextNode(Presets::text($c))]);
                break;
            }
        }   // подпись таблицы не теряется
        return $out;
    }
}
