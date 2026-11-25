# Блок «Аккордеон» (`accordion`)

Вопросы и ответы: нажатие раскрывает ответ, внутри ответа — обычные блоки. На сайте — `<details>`/`<summary>` с разметкой FAQ schema.org (работает без скрипта). Макет `block-accordion`. Блок целиком в этой папке: ядро его не упоминает (тест набора `blocks`).

<!-- block.json:begin — собрано из block.json при сборке (bin/build.php, build.php), не правьте вручную -->
| Поле | Значение |
|---|---|
| Вид | `accordion` |
| Название | Аккордеон |
| Меню | «Интерактив», значок `accordion`, «Превратить в…»: нет |
| Блок без текста | нет |
| Белый список | — |
| В наборе без блока | становится текстом |
| Макет Figma | block-accordion |
<!-- block.json:end -->

## Как ядро с ним работает

Аккордеон — контейнер (`container: true` в `block.json`): ответы — «хосты» обычных блоков; общий код контейнеров (`resources/js/core/containers.js`) узнаёт его по реестру. Остальное — через точки реестра (`accordion.js` → `registerBlock`):

| Точка | Что делает |
|---|---|
| `create` | один пункт, курсор в вопросе |
| `adopt` | одиночный `<details>` со страницы — тоже аккордеон |
| `editorUi` (`editor.accordion`) | раскрытие, «Добавить вопрос», клавиши — `accordion.editor.js`; `itemAt`, `ownsItem`, `itemRow`, `itemCaret`, `removedToast` — кнопки ⠿ 🗑 на строке вопроса, курсор после удаления |
| `clean`, `serialize`, `normalize` | `<details>` с FAQ ↔ форма правки; без пунктов — абзац |
| `unnest` | аккордеон в теле другого контейнера — вопросы жирным и ответы |
| `placeholders` | «Вопрос», «Ответ» |
| `toText` (+ `accordion.php`) | в наборе без аккордеона — вопрос жирным, за ним блоки ответа |
| `canAlign`, `canBg`, `toolbar` | без выравнивания, фона и стиля текста в вопросе |
| `inContainers: false` | не вставляется в другие контейнеры |

Общие правила, не упоминания блока: атрибуты и значения разметки FAQ (`itemscope`, `itemprop`, `itemtype` у `details`, `summary`, `div`) — в общем белом списке (`resources/js/core/allowlist.js` = `Sanitizer`), как остальная разметка HTML; ритм блоков в ответе на сайте (`.ted-accordion__body > *`) — `resources/css/content.css` для всех «хостов».

## Файлы

| Файл | Что внутри |
|---|---|
| `block.json` | описание, меню и образец плитки, правила панели, контейнер |
| `accordion.js` | разметка, FAQ, очистка, нормализация, сохранение, раскрытие, регистрация (бывш. часть `resources/js/core/containers.js`) |
| `accordion.editor.js` | правка: раскрытие, «Добавить вопрос», клавиши |
| `accordion.php` | превращение в текст на сервере |
| `accordion.site.css`, `accordion.editor.css` | вид на сайте и в редакторе; отличия в редакторе |
| `accordion.test.js` | тесты блока (набор `blocks`) |
