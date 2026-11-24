# texted — для нейросетей и разработчиков

Правила для тех, кто ставит texted на сайт или дорабатывает его. Документация для людей — [README.md](README.md) и [docs/](docs/README.md).

## 1. Что это и чем не является

texted — блочный редактор статей: `textarea` → блоки → чистый HTML со стандартными тегами (`p`, `h2`, `ul`, `figure`…) и классами `ted-*`.
Не конструктор страниц и не WYSIWYG «по пикселям»: вид на сайте задают стили блоков и переменные сайта, а не автор.

## 2. Карта папок

| Папка | Что внутри |
|---|---|
| `resources/js/core/` | ядро: редактор, очистка, история, реестр блоков, Markdown, наборы, язык интерфейса |
| `resources/js/ui/` | общие элементы интерфейса: панель, меню, окна, кнопки, слой взаимодействия (ручки, перетаскивание) |
| `resources/js/site/` | запуск поведения блоков на сайте (`content.js`) |
| `blocks/<тип>/` | блок целиком: `block.json` (описание, общее для браузера и сервера), код, стили сайта и правки, README, тесты |
| `resources/css/` | токены интерфейса (`ui/tokens.css`), тема блоков (`theme.default.css`), общие стили |
| `resources/lang/` | словари интерфейса (`en.js`) |
| `resources/fonts/`, `tiles/`, `icons/` | шрифты, картинки меню блоков, значки медиа (сборка копирует их в `dist/`) |
| `resources/uf.htaccess` | правила папки файлов (Apache) |
| `src/` | сервер, namespace `Simflex\Texted\` (PSR-4, composer): `Config`, `Sanitizer`, `Presets`, `Blocks`, `MediaStorage`, `OpenGraph`, `RateLimit`, `ServerBlock`, `Exception\AccessDenied` |
| `bin/` | `check.php` — проверка установки |
| `tools/` | сборка (PowerShell и PHP дают одинаковый результат), тесты, демо |
| `tests/` | автотесты по наборам: `tests/run.html`; PHP — `tests/php/` (классы — `tests/php/bootstrap.php`: composer или та же раскладка без него) |
| `docs/` | документация |
| `dist/` | сборка, самодостаточная: `ted.js`, `ted.css`, `ted.vw.css`, `content.js`, `fonts/`, `tiles/`, `icons/` — сайт и CMS публикуют только её; хранится в git |

## 3. Команды

```powershell
pwsh -File tools/build.ps1          # сборка dist/ (или: php tools/build.php)
pwsh -File tools/test.ps1           # сборка + все наборы автотестов + PHP-проверки
pwsh -File tools/test.ps1 -Full     # + равенство сборок, серверная очистка, загрузка
pwsh -File tools/demo.ps1           # демо с PHP-сервером: examples/admin.html
php bin/check.php                   # проверка установки: PHP, расширения, папка файлов, ffmpeg, настройки
```

## 4. Как добавить блок

1. Папка `blocks/<тип>/`, `block.json`: `type`, `title`, `menu`, `selector`, `html` (теги и атрибуты для белого списка), `degrade` (во что превращается в наборе без него), `jsonExample`.
2. `<тип>.js`: `registerBlock({ match, create, clean, serialize, fromJson, toMarkdown, … })` — поля описаны в `resources/js/core/registry.js`.
3. Стили: `<тип>.site.css` (вид на сайте — только внутри `.ted-content`, только переменные), `<тип>.editor.css` (правка).
4. Поведение на сайте — `<тип>.site.js` через `siteBlock(fn)`; на сервере, если нужно, — класс `Simflex\Texted\Blocks\<Тип>` (`ServerBlock`) в `blocks/<тип>/<Тип>.php`.
5. Тест `<тип>.test.js`; блок — в `tools/build.json → blocks`; README блока собирается сборкой.
6. Каждый новый тег, атрибут, схема адреса — вектор в `tests/security-vectors.json`.

## 5. Неизменные правила

- Код из содержимого статьи никогда не выполняется. Клиентской очистке не доверяем: HTML перед сохранением и выводом всегда очищает сервер (`Sanitizer::clean`).
- Белые списки — только из `block.json`; JS (`resources/js/core/allowlist.js`) и PHP одинаковы, тесты это сверяют. Адреса — только через `urlOk` (`resources/js/core/urls.js` = `Sanitizer::urlOk`).
- Ядро не упоминает конкретные блоки (тест следит): всё, что нужно блоку, — в его папке и `block.json`.
- Рамки, ручки, кнопки блоков — только слой взаимодействия (`resources/js/ui/handle.js`); свои кнопки и окна не заводить — общие элементы из `resources/js/ui/widgets.js`.
- Стили сайта — только внутри блоков и только переменные; прямые цвета — только в `resources/css/ui/tokens.css` и `resources/css/theme.default.css`. Цвета и шрифты — токены дизайн-системы.
- Строки интерфейса — по-русски в коде, переводы — в `resources/lang/*.js`.

## 6. Подключение к CMS

CMS даёт редактору: поле `textarea`, адрес загрузки за своей авторизацией и CSRF (`$ted->respondToUpload`), при желании — файловый менеджер (`pickFile`), каталог товаров (`products`), статьи для встраивания (`articles`), карточки по ссылке (`opengraph`). Требования — [docs/install.md](docs/install.md).
Редактор отдаёт: HTML в поле формы, события `ted:change`, `ted:mode` на `.ted-ui`. Сервер сохраняет `$ted->save($html, $preset, $canEdit)` и выводит `$ted->clean($html)`.

## 7. API кратко

`Ted.init`, `Ted.get`, `Ted.clean`, `Ted.fromBlocks` / `Ted.toBlocks`, `Ted.fromMarkdown` / `Ted.toMarkdown`, `Ted.createUpload`, `Ted.registerBlock`, `Ted.definePreset`, `Ted.addLang`; у редактора — `getHTML`, `setHTML`, `save`, `setMode`, `setTheme`, `setLang`, `setReadOnly`. Подробно — [docs/api.md](docs/api.md).

## 8. Готово, когда

Сборка; `tools/test.ps1` и `tools/test.ps1 -Full` без замечаний; проверка в браузере на 320 / 414 / 768 / 1000 / 3840 px в светлой и тёмной теме — в редакторе, на сайте (`examples/site.html`) и в режиме просмотра.

## 9. Чего не делать

- Не добавлять зависимости, Node.js-сборку и внешние сервисы.
- Не править файлы пакета под конкретный сайт — для этого настройки (`ted.config.php`) и переопределения стилей сайта.
- Не заводить свои варианты кнопок, окон, полей и цветов.
- Не ослаблять очистку и белые списки ради удобства.
