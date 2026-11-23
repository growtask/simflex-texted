<?php
declare(strict_types=1);

/**
 * Блок «Таблица» на сервере (подключает TedBlocks::hook). Только функции, файл сам ничего не делает.
 * degrade — в наборе без таблицы: строка — абзац, ячейки через « · », подпись — абзацем (как toText в table.js).
 */
/** @return DOMElement[] строки таблицы: figure > .ted-table__wrap > table > thead|tbody > tr */
$rows = static function (DOMElement $fig): array
{
    $rows = [];
    foreach (TedPresets::elements($fig) as $wrap) {
        if (!TedPresets::has($wrap, 'ted-table__wrap')) continue;
        foreach (TedPresets::elements($wrap) as $table) {
            if (strtolower($table->localName) !== 'table') continue;
            foreach (['thead', 'tbody'] as $part) {
                foreach (TedPresets::elements($table) as $sec) {
                    if (strtolower($sec->localName) !== $part) continue;
                    foreach (TedPresets::elements($sec) as $tr) if (strtolower($tr->localName) === 'tr') $rows[] = $tr;
                }
            }
            return $rows;
        }
    }
    return $rows;
};

return [
    'degrade' => static function (DOMElement $el, DOMDocument $doc) use ($rows): array {
        $out = [];
        foreach ($rows($el) as $tr) {
            $nodes = [];
            foreach (TedPresets::elements($tr) as $cell) {
                if (!in_array(strtolower($cell->localName), ['td', 'th'], true) || !TedPresets::hasContent($cell)) continue;
                if ($nodes) $nodes[] = $doc->createTextNode(' · ');
                array_push($nodes, ...TedPresets::childNodes($cell));
            }
            $p = TedPresets::para($doc, $nodes);
            if (TedPresets::text($p) !== '') $out[] = $p;
        }
        foreach (TedPresets::elements($el) as $c) if (strtolower($c->localName) === 'figcaption' && TedPresets::text($c) !== '') { $out[] = TedPresets::para($doc, [$doc->createTextNode(TedPresets::text($c))]); break; }   // подпись таблицы не теряется
        return $out;
    },
];
