# Блок «iFrame» (`iframe`)

Страница другого сайта во фрейме (форма, калькулятор, карта) по макету `block-iframe` (Embed/iframe). Блок целиком в этой папке: ядро его не упоминает (тест набора `blocks`).

<!-- block.json:begin — собрано из block.json при сборке (tools/build.ps1, build.php), не правьте вручную -->
| Поле | Значение |
|---|---|
| Вид | `iframe` |
| Название | iFrame |
| Меню | «Встраивание», значок `iframe`, «Превратить в…»: нет |
| Блок без текста | нет |
| Белый список | `figure` (data-ratio) |
| В наборе без блока | становится текстом |
| Макет Figma | block-iframe (Embed/iframe) |
<!-- block.json:end -->

## Разметка

`<figure class="ted-iframe"><iframe src="https://…" [height="480"] title="…" loading="lazy" sandbox="…" referrerpolicy="…" allowfullscreen></iframe>[<figcaption>Подпись</figcaption>]</figure>`

Поле принимает адрес `https://` или код `<iframe …>` целиком (из кода берутся адрес и высота).

## Безопасность

Только https без логина, пароля и порта; песочница ставится всегда — и в браузере, и на сервере. Правило «фрейм внутри блока — любой https-адрес (или список `iframe.hosts` в настройках), вне блока — только площадки видео» живёт в общем белом списке (`src/core/allowlist.js` и `php/sanitize.php`, одинаково); блок включает его полем `frames: true` в `block.json`.

## Как ядро с ним работает

Только через реестр (`iframe.js` → `registerBlock`):

| Точка | Что делает |
|---|---|
| `create`, `afterInsert` | пустой блок с полем «Адрес страницы», курсор — в поле |
| `editorUi` (`editor.iframes`) | поле адреса, окно «Настройки iFrame» — `iframe.editor.js` |
| `clean`, `serialize`, `normalize` | очистка, сохранение, порядок формы правки |
| `toText` (+ `iframe.php` → `degrade`) | в наборе без iFrame — ссылка на страницу (подпись или адрес) |
| `canAlign`, `canBg` | выравнивания и цветного фона нет |
| `neverEmpty`, `caretBelow`, `frames` (block.json) | не пустая строка; под ним строка для курсора; правило фреймов |

## Файлы

| Файл | Что внутри |
|---|---|
| `block.json` | описание, меню, правило фреймов |
| `iframe.js` | разбор адреса и кода, разметка, очистка, сохранение, регистрация |
| `iframe.editor.js` | поле адреса и окно «Настройки iFrame» |
| `iframe.php` | превращение в текст на сервере |
| `iframe.site.css`, `iframe.editor.css` | вид на сайте; отличия в редакторе |
| `iframe.site.js` | высота фрейма на сайте в браузерах без `attr()` в CSS |
| `iframe.test.js` | тесты блока (набор `blocks`) |
