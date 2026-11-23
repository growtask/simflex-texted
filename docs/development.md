# Для разработчиков

[← К оглавлению](README.md)

## Для разработчиков

**Сборка.** Список файлов — `tools/build.json`.

```
pwsh -File tools/build.ps1        # Windows, без PHP
php tools/build.php               # то же на PHP; результат идентичен
```

**Автотесты** (нужны Edge или Chrome; Node.js не нужен):

```
pwsh -File tools/test.ps1          # быстрые: логика, ширина 1000 / светлая, smoke собранных файлов — после каждой правки
pwsh -File tools/test.ps1 -Full    # полные: вся матрица ширин и тем, обход блоков в 8 окнах, сборки PHP, PHP-очистка и загрузка — по завершении этапа
pwsh -File tools/test.ps1 -Only "слово"
```

Подробности и описание наборов — `tests/README.md`. Страницы для просмотра руками: `tests/index.html` (тесты), `tests/walkthrough.html` (обход всех блоков), `examples/` (демо).

**Локальный запуск.** Готовые демо из `dist/` открываются с диска. Исходники (ES-модули) и тесты требуют HTTP: `pwsh -File tools/serve.ps1 -Port 8140`
(из папки `ted/`; из корня проекта — `ted/tools/serve.ps1`), затем `http://localhost:8140/examples/` или `/tests/index.html`.

**Структура**

```
src/core/     ядро: editor, sanitize, blocks, selection, history, keys, typo, highlight, media, upload
src/ui/       интерфейс: панель, меню, ручки блоков, предпросмотр, медиа, иконки
styles/       theme.default.css, content.css (оформление блоков для сайта), ted.vw.css, ui/ — интерфейс по компонентам (порядок — в tools/build.json)
php/          config.php (настройки ted.config.php), sanitize.php (очистка на сервере), upload.php (загрузка), opengraph.php, check.php, uf.htaccess, test-*.php
ted.config.example.php  образец настроек сервера — копируется рядом с папкой пакета
tools/        build.*, serve.ps1, test.ps1, check-builds.ps1, css-snapshot.ps1, find-php.ps1
examples/     admin.html, docs.html, site.html и другие демо
dist/         ted.js, ted.css, ted.vw.css — собранные файлы
tests/        автотесты, обход блоков, безопасность
```

**Правка CSS.** Перед перестановкой и чисткой правил снимите `tools/css-snapshot.ps1` до и после — снимки должны совпасть.

**Журнал изменений:** [CHANGELOG.md](../CHANGELOG.md). Правила для доработки — [AGENTS.md](../AGENTS.md).

## Браузеры

Автотесты (`tests/run.html`, 8 наборов, 576 тестов) проходят в Chrome, Edge и WebKit (движок Safari). Если гоняете их через Playwright в Chromium или Edge, включите полосы прокрутки (`ignoreDefaultArgs: ['--hide-scrollbars']`): по умолчанию он их прячет, и тесты полос прокрутки падают. Firefox автотестами не проверен: сборку Firefox от Playwright на машине разработки блокирует защита Windows — проверяйте вручную.
Подсветка кода в правке использует CSS Custom Highlight API (Chrome и Edge 105+, Safari 17.2+, Firefox 140+): в других браузерах код в правке без цветов, а сохранённый HTML цветной везде — цвета лежат в самой разметке.
