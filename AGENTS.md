# texted — для нейросетей и разработчиков

Правила для тех, кто ставит texted на сайт или дорабатывает его. Документация для людей — [README.md](README.md)
и [docs/](docs/README.md). Название продукта в документации — **texted**; в коде имена `Ted`, `ted-*`, `ted.js` не меняем.

## 1. Что это и чем не является

texted — блочный редактор статей: `textarea` → блоки → чистый HTML со стандартными тегами (`p`, `h2`, `ul`, `figure`…)
и классами `ted-*`. Не конструктор страниц и не WYSIWYG «по пикселям»: вид на сайте задают стили блоков и переменные
сайта, а не автор.

## 2. Перед работой

- **Общие правила Simflex** — `AGENTS.md` репозитория `simflex-agents` (репозитории, связь ядра и шаблона, коммиты),
  правила PHP-кода — `docs/dev/conventions.md` репозитория `simflex-docs`. Локальные пути — `.agents/local.md` (не в git).
- **Принципы по правкам заказчика** — [docs/dev/PRINCIPLES.md](docs/dev/PRINCIPLES.md) (выделение, фокус,
  существующие компоненты, плавность, кнопки, клавиатура, проверка): прочитать и сверить с ним результат.
- **Перед изменением интерфейса** — [docs/dev/LAYOUT.md](docs/dev/LAYOUT.md) (сверка с Figma) и актуальный раздел плана.
- **Планы и журналы** — `simflex-agents/plans/texted/`: `planmin.md` (мелкие шаги), `BACKLOG.md` (идеи — в работу после
  согласования), `STAGE_5_LOG.md` (медиа и файлы: пополнять после каждого изменения — решения, файлы, узлы Figma,
  результат проверок, следующий шаг), `CHANGES.md` (журнал правок для заказчика), `MODULAR_PLAN.md` (этапы и наборы тестов).
  План перестройки пакета — `simflex-agents/plans/texted-structure.md`.
- Открытые вопросы по поведению, разметке и интеграции — согласовать с заказчиком до реализации.

## 3. Карта папок

| Папка | Что внутри |
|---|---|
| `resources/js/core/` | ядро: редактор, очистка, история, реестр блоков, Markdown, наборы, язык интерфейса |
| `resources/js/ui/` | общие элементы интерфейса: панель, меню, окна, кнопки, слой взаимодействия (ручки, перетаскивание) |
| `resources/js/site/` | запуск поведения блоков на сайте (`content.js`) |
| `blocks/<тип>/` | блок целиком: `block.json` (описание, общее для браузера и сервера), код, стили сайта и правки, серверная часть (`<Тип>.php`), README, тесты |
| `resources/css/` | токены интерфейса (`ui/tokens.css`), тема блоков (`theme.default.css`), общие стили |
| `resources/lang/` | словари интерфейса (`en.js`) |
| `resources/fonts/`, `tiles/`, `icons/` | шрифты, картинки меню блоков, значки медиа (сборка копирует их в `dist/`) |
| `resources/uf.htaccess` | правила папки файлов (Apache) |
| `src/` | сервер, namespace `Simflex\Texted\` (PSR-4, composer): `Config`, `Sanitizer`, `Presets`, `Blocks`, `MediaStorage`, `OpenGraph`, `RateLimit`, `ServerBlock`, `Exception\AccessDenied` |
| `bin/` | инструменты на PHP: сборка, тесты, демо (`demo/`), снимки, проверка установки (`check.php`) |
| `tests/` | автотесты по наборам: `tests/run.html`; PHP — `tests/php/` (классы — `tests/php/bootstrap.php`: composer или та же раскладка без него) |
| `docs/` | документация; `docs/dev/` — принципы и сверка с Figma для разработки |
| `examples/` | демо: `admin.html` (админка), `site.html` (сайт), `docs.html` и др. |
| `dist/` | сборка, самодостаточная: `ted.js`, `ted.css`, `ted.vw.css`, `content.js`, `fonts/`, `tiles/`, `icons/` — сайт и CMS публикуют только её; хранится в git |

## 4. Команды

Инструменты — PHP-скрипты в `bin/`, одинаково на Windows, Linux и macOS; для тестов нужен Chrome, Chromium или Edge
(`TED_BROWSER` — свой путь).

```bash
php bin/build.php                 # сборка dist/
php bin/test.php                  # сборка + все наборы автотестов (браузер без окна) + PHP-проверки
php bin/test.php --full           # + dist/ в git = сборка из исходников, загрузка файлов на демо-сервере
php bin/test.php --suite=blocks   # один набор; --only="слово" — только тесты с этим словом
php bin/demo.php                  # демо с PHP-сервером: examples/admin.html
php bin/snapshot.php css a.txt    # снимок стилей до/после правки CSS (layout — расположение содержимого)
php bin/make-preset-vectors.php   # общие примеры наборов для JS и PHP (после правки блоков или правил наборов)
php bin/check.php                 # проверка установки: PHP, расширения, папка файлов, ffmpeg, настройки
```

Стиль PHP и статический анализ — в Docker шаблона (`simflex-template`, клон texted подключён томом
`/var/www/simflex-texted`):

```bash
docker compose exec -T app ./vendor/bin/php-cs-fixer fix --config=.php-cs-fixer.php --path-mode=override \
  /var/www/simflex-texted/src /var/www/simflex-texted/blocks /var/www/simflex-texted/bin /var/www/simflex-texted/tests/php
docker compose exec -T app ./vendor/bin/phpstan analyse --memory-limit=1G --level=0 \
  /var/www/simflex-texted/src /var/www/simflex-texted/blocks /var/www/simflex-texted/bin /var/www/simflex-texted/tests/php
```

## 5. Как добавить блок

1. Папка `blocks/<тип>/`, `block.json`: `type`, `title`, `menu`, `selector`, `html` (теги и атрибуты для белого списка),
   `degrade` (во что превращается в наборе без него), `jsonExample`.
2. `<тип>.js`: `registerBlock({ match, create, clean, serialize, fromJson, toMarkdown, … })` — поля описаны
   в `resources/js/core/registry.js`. Импорт в исходниках — однострочный; если сборка не смогла его вырезать, она
   останавливается с ошибкой.
3. Стили: `<тип>.site.css` (вид на сайте — только внутри `.ted-content`, только переменные), `<тип>.editor.css` (правка).
4. Поведение на сайте — `<тип>.site.js` через `siteBlock(fn)`; на сервере, если нужно, — класс
   `Simflex\Texted\Blocks\<Тип>` (`ServerBlock`) в `blocks/<тип>/<Тип>.php`.
5. Тест `<тип>.test.js`; блок — в `bin/build.json → blocks`; README блока собирается сборкой.
6. Каждый новый тег, атрибут, схема адреса — вектор в `tests/security-vectors.json`.
7. Ядро не упоминает блок: всё, что ему нужно, — в `block.json` и `<тип>.js` (тест набора `blocks`). Исключения
   перечислены явно: `text: true` — ввод ведёт текстовый движок ядра; `core: [файлы]` — модули ядра, которые ещё ведут
   блок (тест сверяет список). Новое место в ядре для такого блока — только вместе с записью в `core`.
8. Правила превращения блоков в текст (наборы) есть в JS (`resources/js/core/blocks.js`) и PHP (`src/Presets.php`) —
   меняются вместе; после правки — `php bin/make-preset-vectors.php`.

## 6. Figma 1 в 1

- **Только токены дизайн-системы «Симфлекс АИ».** В Figma цвета — стили цвета библиотеки (`main/*`, `text-icon/*`,
  `states/*`), тексты — текстовые стили (`text/t1–t5`, `ui/xs–l`, `heading/*`), кнопки — экземпляры Buttons/main,
  маленькие кнопки редактора — `editor-icon-small` (значок 16 из `editor-icon`). Ручных цветов, шрифтов и самодельных
  кнопок не заводим; прозрачность — слоем со стилем. В коде те же значения; тест «Цвета только из дизайн-системы» ловит
  лишние цвета в `dist/ted.css`.
- Прямые цвета — только в `resources/css/ui/tokens.css` (интерфейс, `--ui-*` = переменные админки)
  и `resources/css/theme.default.css` (блоки, переменные сайта); в остальных файлах — только переменные (тест набора
  `styles`). Имена переменных — как в Simflex (`--color-main-…`, `--color-text-icon-…`). `@layer` не используем.
  При перестановке CSS снимки `php bin/snapshot.php css` до и после должны совпасть.
- Для каждого блока сверять состояния и варианты ширины в обеих темах. Размеры, токены, тексты и параметры
  компонентов — из `get_design_context`, переменных и описаний в Figma; скриншоты — для визуальной сверки.
- Нет в Figma нужного экрана, компонента, состояния, ширины, темы или параметра — отметить пробел в
  `docs/dev/LAYOUT.md` и записать открытый вопрос в план (`simflex-agents/plans/texted/planmin.md`): какой компонент
  и что согласовать. Вёрстку этого варианта — после согласования макета; согласованные части можно делать параллельно.
- После реализации — проверка в браузере на 1000, 860, 768 и 414 px в светлой и тёмной темах (для публичного вывода —
  ещё размеры из `docs/dev/LAYOUT.md`). В плане отмечать только проверенные пункты.

## 7. Безопасность

- Код из содержимого статьи никогда не выполняется. Клиентской очистке не доверяем: HTML перед сохранением и выводом
  всегда очищает сервер (`Sanitizer::clean`, через `Config::clean` / `Config::save`). Правила клиента и сервера
  одинаковы; общий набор XSS-векторов — `tests/security-vectors.json`.
- Белые списки — только из `block.json`; JS (`resources/js/core/allowlist.js`) и PHP (`Sanitizer`) одинаковы, тест
  сверяет. Новый тег, атрибут или схема ссылки — в оба белых списка одновременно и вектор в `security-vectors.json`.
- Адреса — только через `urlOk` (`resources/js/core/urls.js` = `Sanitizer::urlOk`, общие примеры
  `tests/security/url-vectors.json`); своих проверок адресов в блоках не заводим.
- Загрузка файлов — только за авторизацией и CSRF CMS; папка файлов (`ted.config.php` → `files.dir`) — вне пакета и
  только данные (`resources/uf.htaccess`). Удаление — только внутри этой папки (тест `tests/php/test-config.php`).

## 8. Консистентность и самопроверка

- Прежде чем делать окно, кнопку, поле, выпадающий список или значок, найди готовый элемент в коде и в
  `docs/dev/LAYOUT.md` и повтори его: окна — как «Якорь» и «Ссылка» (`ted-ui-pop--link`, шапка с крестиком,
  `ted-ui-input`, `ted-ui-field__hint`, `ted-ui-action--primary/--gray`), маленькие кнопки — `smallButton`
  (Buttons/icon-small, значок 16), отмена загрузки — крестик. Рамки, ручки, кнопки блоков — только слой взаимодействия
  (`resources/js/ui/handle.js`), общие элементы — `resources/js/ui/widgets.js`. Новый вид согласуем отдельно.
- Окна открываются у кнопки, которая их вызвала, и не вылезают за редактор (`align: 'end'` раскрывает окно влево).
- Строки интерфейса — по-русски в коде, переводы — в `resources/lang/*.js`.
- Перед тем как делать «новое», прочитай все файлы пакета по теме, не только `resources/js/`: сайт (`content.js`),
  `examples/`, `src/`, `bin/`. Фича готова, когда работает в редакторе, на сайте (`examples/site.html`) и в режиме
  просмотра.
- Не пропускай пункты задачи. Если проверить что-то нельзя без скачивания или установки — спроси разрешение.
- Для каждой правки интерфейса — тест на поведение, которое заказчик нашёл вручную.
- Не добавляй от себя то, о чём не просили (форматы файлов, конвертацию, лишние кнопки); расширение задачи согласуй.

## 9. Подключение к CMS

CMS даёт редактору: поле `textarea`, адрес загрузки за своей авторизацией и CSRF (`Config::respondToUpload`), при
желании — файловый менеджер (`pickFile`), каталог товаров (`products`), статьи для встраивания (`articles`), карточки
по ссылке (`opengraph`). Требования — [docs/install.md](docs/install.md). Редактор отдаёт: HTML в поле формы, события
`ted:change`, `ted:mode` на `.ted-ui`. Сервер сохраняет `$ted->save($html, $preset, $canEdit)` и выводит
`$ted->clean($html)`. В Simflex CMS это делает ядро (`Simflex\Core\Admin\Plugins\Editor`).

## 10. API кратко

`Ted.init`, `Ted.get`, `Ted.clean`, `Ted.fromBlocks` / `Ted.toBlocks`, `Ted.fromMarkdown` / `Ted.toMarkdown`,
`Ted.createUpload`, `Ted.registerBlock`, `Ted.definePreset`, `Ted.addLang`; у редактора — `getHTML`, `setHTML`, `save`,
`setMode`, `setTheme`, `setLang`, `setReadOnly`. Сервер — `Simflex\Texted\Config` (`load`, `fromArray`, `clean`,
`save`, `getClient`, `getClientJson`, `respondToUpload`, `respondToOpenGraph`). Подробно — [docs/api.md](docs/api.md).
Несовместимые изменения API (JS `Ted.*`, PHP-классы, разметка `ted-*`) — в `CHANGELOG.md` с разделом «Переход».

## 11. Готово, когда

Сборка; `php bin/test.php` после каждой правки и `php bin/test.php --full` по завершении этапа — без замечаний;
php-cs-fixer и phpstan (раздел 4) — без ошибок; проверка в браузере на 1000 / 860 / 768 / 414 px (публичный вывод —
ещё 320 и 3840) в светлой и тёмной теме — в редакторе, на сайте (`examples/site.html`) и в режиме просмотра;
сценарии: загрузка, дублирование, Enter, Undo, перетаскивание.

## 12. Git

- Работа — в ветке `andrey/dev`, в `master` — через pull request. Коммит, push и pull request — только с разрешения.
- В сообщениях коммитов — без `Co-Authored-By` и других упоминаний Claude.
- `dist/` хранится в git: после правки исходников — `php bin/build.php` и коммит вместе с ними (`--full` сверяет).

## 13. Чего не делать

- Не добавлять зависимости, Node.js-сборку и внешние сервисы.
- Не править файлы пакета под конкретный сайт — для этого настройки (`ted.config.php`) и переопределения стилей сайта.
- Не заводить свои варианты кнопок, окон, полей и цветов.
- Не ослаблять очистку и белые списки ради удобства.
