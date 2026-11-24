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
    /** @return DOMElement[] строки таблицы: figure > .ted-table__wrap > table > thead|tbody > tr */
    private function getRows(DOMElement $fig): array
    {
        $rows = [];
        foreach (Presets::elements($fig) as $wrap) {
            if (!Presets::has($wrap, 'ted-table__wrap')) {
                continue;
            }
            foreach (Presets::elements($wrap) as $table) {
                if (strtolower($table->localName) !== 'table') {
                    continue;
                }
                foreach (['thead', 'tbody'] as $part) {
                    foreach (Presets::elements($table) as $sec) {
                        if (strtolower($sec->localName) !== $part) {
                            continue;
                        }
                        foreach (Presets::elements($sec) as $tr) {
                            if (strtolower($tr->localName) === 'tr') {
                                $rows[] = $tr;
                            }
                        }
                    }
                }
                return $rows;
            }
        }
        return $rows;
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
        foreach (Presets::elements($element) as $c) {
            if (strtolower($c->localName) === 'figcaption' && Presets::text($c) !== '') {
                $out[] = Presets::para($document, [$document->createTextNode(Presets::text($c))]);
                break;
            }
        }   // подпись таблицы не теряется
        return $out;
    }
}
