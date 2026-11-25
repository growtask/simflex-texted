# Для разработчиков

[← К оглавлению](README.md)

## Для разработчиков

Все инструменты — PHP-скрипты в `bin/`, одинаково на Windows, Linux и macOS (Node.js не нужен). Нужен PHP 8.4+,
для тестов — ещё Chrome, Chromium или Edge (путь можно задать в `TED_BROWSER`).

**Сборка.** Список модулей, стилей и блоков — `bin/build.json`.

```
php bin/build.php                      # dist/: ted.js, ted.css, ted.vw.css, content.js, fonts/, tiles/, icons/
```

**Автотесты:**

```
php bin/test.php                       # сборка, все наборы tests/run.html и PHP-проверки — после каждой правки
php bin/test.php --full                # + dist/ в git = сборка из исходников, загрузка файлов на демо-сервере — по завершении этапа
php bin/test.php --suite=blocks        # один набор
php bin/test.php --only="слово"        # только тесты с этим словом в названии
```

Подробности и описание наборов — `tests/README.md`. Страницы для просмотра руками: `tests/run.html?suite=…` (тесты),
`tests/walkthrough.html` (обход всех блоков), `examples/` (демо).

**Демо и локальный запуск.** `php bin/demo.php` — демо админки с загрузкой файлов (проверка сервера, PHP-сервер,
браузер). Исходники (ES-модули) и тесты требуют HTTP: `php -S 127.0.0.1:8140 -t . bin/serve.php`, затем
`http://127.0.0.1:8140/examples/` или `/tests/run.html?suite=layer`.

**Снимки и примеры:**

```
php bin/snapshot.php css before.txt    # вычисленные стили интерфейса; после правки CSS — after.txt, файлы должны совпасть
php bin/snapshot.php layout before.txt # расположение содержимого на 320 / 414 / 768 / 1000 / 1920
php bin/make-preset-vectors.php        # пересобрать tests/presets/vectors.json (общие примеры наборов для JS и PHP)
php bin/check.php                      # проверка установки: PHP, расширения, папка файлов, ffmpeg, настройки
```

**Структура**

```
src/                   сервер, Simflex\Texted\ (PSR-4): Config, Sanitizer, Presets, Blocks, MediaStorage, OpenGraph, RateLimit
resources/js/          редактор: core/ (ядро), ui/ (интерфейс), site/ (поведение блоков на сайте), index.js
resources/css/         theme.default.css, content.css (оформление блоков для сайта), ted.vw.css, ui/ — интерфейс по компонентам
resources/lang/, fonts/, tiles/, icons/   словари, шрифты, картинки меню блоков, значки; uf.htaccess — правила папки файлов
blocks/<тип>/          блок целиком: block.json, код, стили, серверная часть (<Тип>.php), README, тесты
bin/                   build.php, test.php, demo.php, snapshot.php, make-preset-vectors.php, check.php, serve.php, demo/
ted.config.example.php образец настроек сервера — копируется вне папки пакета
examples/              admin.html, docs.html, site.html и другие демо
dist/                  сборка, самодостаточная — сайт и CMS публикуют только её
tests/                 наборы tests/run.html, PHP-проверки tests/php/
```

**Правка CSS.** Перед перестановкой и чисткой правил снимите `php bin/snapshot.php css` до и после — снимки должны совпасть.

**Журнал изменений:** [CHANGELOG.md](../CHANGELOG.md). Правила для доработки — [AGENTS.md](../AGENTS.md).

## Браузеры

Автотесты (`tests/run.html`, 8 наборов, 576 тестов) проходят в Chrome, Edge и WebKit (движок Safari). Если гоняете их через Playwright в Chromium или Edge, включите полосы прокрутки (`ignoreDefaultArgs: ['--hide-scrollbars']`): по умолчанию он их прячет, и тесты полос прокрутки падают. Firefox автотестами не проверен: сборку Firefox от Playwright на машине разработки блокирует защита Windows — проверяйте вручную.
Подсветка кода в правке использует CSS Custom Highlight API (Chrome и Edge 105+, Safari 17.2+, Firefox 140+): в других браузерах код в правке без цветов, а сохранённый HTML цветной везде — цвета лежат в самой разметке.
