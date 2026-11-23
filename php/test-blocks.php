<?php
declare(strict_types=1);
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

// Реестр блоков на сервере (этап 5 MODULAR_PLAN.md): php ted/php/test-blocks.php — код выхода 0, если всё в порядке.
// Сервер читает те же blocks/<тип>/block.json, что сборка подставляет в ted.js.

require __DIR__ . '/config.php';
require_once __DIR__ . '/blocks.php';
require_once __DIR__ . '/sanitize.php';
require_once __DIR__ . '/presets.php';

$fails = [];
$count = 0;
$ok = static function (bool $cond, string $name) use (&$fails, &$count): void { $count++; if (!$cond) $fails[] = $name; };

$build = json_decode((string) file_get_contents(dirname(__DIR__) . '/tools/build.json'), true);
$all = TedBlocks::all();
$names = $build['blocks'];
sort($names);
$folders = array_map(static fn ($f) => basename(dirname($f)), glob(dirname(__DIR__) . '/blocks/*/block.json') ?: []);
sort($folders);
$ok($folders === $names, 'папки blocks/ = список tools/build.json → blocks: ' . implode(', ', $folders));
foreach ($all as $type => $def) {
    $ok(is_array($def['html']), "$type: html — белый список");
    $ok(!isset($def['degrade']) || in_array($def['degrade'], ['drop', 'children'], true), "$type: degrade — drop, children или нет");
}

// линия (5.1)
$ok(in_array('hr', TedBlocks::tags(), true), 'тег hr — из blocks/hr/block.json');
$ok(TedSanitizer::clean('<hr class="x" style="color:red" onclick="alert(1)">') === '<hr>', 'сервер: у линии нет лишних атрибутов');
$ok(TedPresets::alias('separator') === 'hr', 'другое имя separator → hr');
$ok(in_array('hr', TedPresets::types(), true), 'вид hr в наборах');
$c = TedConfig::fromArray(['presets' => ['lines' => ['blocks' => ['separator']]]]);
$ok($c->preset('lines')['blocks'] === ['hr'], 'свой набор с другим именем блока');
$ok($c->clean('<p>а</p><hr><p>б</p>', 'text') === "<p>а</p><p>б</p>", 'в наборе без линии она исчезает (degrade: drop): ' . $c->clean('<p>а</p><hr><p>б</p>', 'text'));
$ok(str_contains($c->clean('<p>а</p><hr>', 'lines'), '<hr>'), 'в наборе с линией — остаётся');
$doc = new DOMDocument();
$ok((TedBlocks::of($doc->createElement('hr'))['type'] ?? '') === 'hr' && TedBlocks::of($doc->createElement('div')) === null, 'TedBlocks::of: элемент блока по selector');
// «.класс» — любой тег: содержание на сайте <nav class="ted-toc">, в правке <div class="ted-toc">
$toc = static function (string $tag) use ($doc) { $e = $doc->createElement($tag); $e->setAttribute('class', 'ted-toc'); return TedBlocks::of($e)['type'] ?? ''; };
$ok($toc('nav') === 'toc' && $toc('div') === 'toc', 'TedBlocks::of: селектор «.класс» без тега (nav и div содержания)');
// функции блока на сервере: blocks/<тип>/<тип>.php (кнопка — превращение в текст); у линии своих нет
$ok(is_callable(TedBlocks::hook('button', 'degrade')) && TedBlocks::hook('hr', 'degrade') === null && TedBlocks::hook('нет', 'degrade') === null, 'TedBlocks::hook: функции блока из blocks/<тип>/<тип>.php');

echo 'Реестр блоков на сервере: проверок ' . $count . ', замечаний ' . count($fails) . PHP_EOL;
foreach ($fails as $f) echo '  ✗ ' . $f . PHP_EOL;
exit($fails ? 1 : 0);
