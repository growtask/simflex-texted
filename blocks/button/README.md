# Блок «Кнопка» (`button`)

Кнопка, две кнопки или баннер (заголовок, текст, кнопка) по макету `block-button` (Action/button). Блок целиком в этой папке: ядро его не упоминает (тест набора `blocks`).

<!-- block.json:begin — собрано из block.json при сборке (tools/build.ps1, build.php), не правьте вручную -->
| Поле | Значение |
|---|---|
| Вид | `button` |
| Название | Кнопка |
| Меню | «Действия», значок `button`, «Превратить в…»: нет |
| Блок без текста | нет |
| Белый список | — |
| В наборе без блока | становится текстом |
| Макет Figma | block-button (Action/button) |
<!-- block.json:end -->

## Разметка

- `<div class="ted-button [ted-align-center|right]"><a class="ted-button__btn" href="…">Текст</a>[<a class="ted-button__btn ted-button__btn--secondary" href="…">…</a>]</div>`
- баннер: `<div class="ted-button ted-button--banner"><div class="ted-button__text"><p class="ted-button__title">…</p><p class="ted-button__desc">…</p></div><a class="ted-button__btn" href="…">…</a></div>`

Без скрипта — обычные ссылки-кнопки. Не больше двух кнопок; у баннера одна.

## Как ядро с ней работает

Только через реестр (`button.js` → `registerBlock`):

| Точка | Что делает |
|---|---|
| `create`, `afterInsert` | новая кнопка «Текст кнопки», сразу окно «Настройки кнопки» |
| `editorUi` (`editor.buttons`) | окно настроек, выбор кнопки, Enter в строках баннера — `button.editor.js` |
| `clean`, `serialize`, `normalize` | очистка входящего HTML, сохранение, порядок формы правки |
| `toText` (+ `button.php` → `degrade`) | в наборе без кнопки: заголовок жирным, текст, кнопки ссылками — одинаково в браузере и на сервере |
| `placeholders` | «Текст кнопки», «Заголовок», «Текст» |
| `canAlign` | баннер не выравнивается |
| `toolbar` (block.json) | в панели нет фона, выравнивания, стиля текста и форматирования |
| `neverEmpty`, `caretBelow` (block.json) | блок не пустая строка; под ним всегда строка для курсора |

## Файлы

| Файл | Что внутри |
|---|---|
| `block.json` | описание, меню, правила панели |
| `button.js` | разметка, очистка, сохранение, регистрация |
| `button.editor.js` | окно «Настройки кнопки», клавиши баннера |
| `button.php` | превращение в текст на сервере |
| `button.site.css` | вид на сайте и в редакторе |
| `button.editor.css` | отличия в редакторе (заглушки, выбранная кнопка) |
| `button.test.js` | тесты блока (набор `blocks`) |
