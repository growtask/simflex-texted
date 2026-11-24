<?php

declare(strict_types=1);

use Simflex\Texted\Blocks;
use Simflex\Texted\Config;
use Simflex\Texted\Presets;
use Simflex\Texted\Sanitizer;

require __DIR__ . '/bootstrap.php';
// только из консоли (проверка 22.11): из браузера тест не запускается — не создаёт папок и не показывает пути на сайте
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// Реестр блоков на сервере (этап 5 MODULAR_PLAN.md): php ted/php/test-blocks.php — код выхода 0, если всё в порядке.
// Сервер читает те же blocks/<тип>/block.json, что сборка подставляет в ted.js.

$fails = [];
$count = 0;
$ok = static function (bool $cond, string $name) use (&$fails, &$count): void {
    $count++;
    if (!$cond) {
        $fails[] = $name;
    }
};

$build = json_decode((string) file_get_contents(dirname(__DIR__, 2) . '/tools/build.json'), true);
$all = Blocks::all();
$names = $build['blocks'];
sort($names);
$folders = array_map(static fn($f) => basename(dirname($f)), glob(dirname(__DIR__, 2) . '/blocks/*/block.json') ?: []);
sort($folders);
$ok($folders === $names, 'папки blocks/ = список tools/build.json → blocks: ' . implode(', ', $folders));
foreach ($all as $type => $def) {
    $ok(is_array($def['html']), "$type: html — белый список");
    $ok(!isset($def['degrade']) || in_array($def['degrade'], ['drop', 'children'], true), "$type: degrade — drop, children или нет");
}

// линия (5.1)
$ok(in_array('hr', Blocks::tags(), true), 'тег hr — из blocks/hr/block.json');
$ok(Sanitizer::clean('<hr class="x" style="color:red" onclick="alert(1)">') === '<hr>', 'сервер: у линии нет лишних атрибутов');
$ok(Presets::alias('separator') === 'hr', 'другое имя separator → hr');
$ok(in_array('hr', Presets::types(), true), 'вид hr в наборах');
$c = Config::fromArray(['presets' => ['lines' => ['blocks' => ['separator']]]]);
$ok($c->getPreset('lines')['blocks'] === ['hr'], 'свой набор с другим именем блока');
$ok($c->clean('<p>а</p><hr><p>б</p>', 'text') === '<p>а</p><p>б</p>', 'в наборе без линии она исчезает (degrade: drop): ' . $c->clean('<p>а</p><hr><p>б</p>', 'text'));
$ok(str_contains($c->clean('<p>а</p><hr>', 'lines'), '<hr>'), 'в наборе с линией — остаётся');
$doc = new DOMDocument();
$ok((Blocks::of($doc->createElement('hr'))['type'] ?? '') === 'hr' && Blocks::of($doc->createElement('div')) === null, 'Blocks::of: элемент блока по selector');
// «.класс» — любой тег: содержание на сайте <nav class="ted-toc">, в правке <div class="ted-toc">
$toc = static function (string $tag) use ($doc) {
    $e = $doc->createElement($tag);
    $e->setAttribute('class', 'ted-toc');
    return Blocks::of($e)['type'] ?? '';
};
$ok($toc('nav') === 'toc' && $toc('div') === 'toc', 'Blocks::of: селектор «.класс» без тега (nav и div содержания)');
// серверная часть блока: класс blocks/<тип>/<Тип>.php (кнопка — превращение в текст); у линии её нет
$ok(Blocks::getServerBlock('button') instanceof Simflex\Texted\Blocks\Button && Blocks::getServerBlock('hr') === null && Blocks::getServerBlock('нет') === null, 'Blocks::getServerBlock: класс блока из blocks/<тип>/<Тип>.php');
// у каждого PHP-файла в папке блока — класс Simflex\Texted\Blocks\<Тип> с ServerBlock, имя файла = имя класса
foreach (glob(dirname(__DIR__, 2) . '/blocks/*/*.php') ?: [] as $file) {
    $class = Blocks::getServerBlockClass(basename(dirname($file)));
    $ok(basename($file) === substr($class, strrpos($class, '\\') + 1) . '.php' && is_subclass_of($class, Simflex\Texted\ServerBlock::class), 'серверная часть блока ' . basename(dirname($file)) . ' — класс ServerBlock: ' . $class);
}

echo 'Реестр блоков на сервере: проверок ' . $count . ', замечаний ' . count($fails) . PHP_EOL;
foreach ($fails as $f) {
    echo '  ✗ ' . $f . PHP_EOL;
}
exit($fails ? 1 : 0);
