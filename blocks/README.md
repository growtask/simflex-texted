# Блоки texted

Каждый блок — папка `blocks/<тип>/` (этап 5 MODULAR_PLAN.md). Блок — только «внутрянка» и её поведение: разметка, данные, очистка, вид на сайте и в редакторе, правка содержимого. Всё общее — выделение, рамки, кнопки, перетаскивание, меню, панель, клавиши, история — в ядре.

| Файл | Что внутри |
|---|---|
| `block.json` | описание: вид, название, меню, Markdown, клавиша, белый список тегов и атрибутов, превращение в текст. Его читают и браузер (сборка подставляет в `ted.js`), и сервер (`src/Blocks.php`) |
| `<тип>.js` | регистрация `Ted.registerBlock({ ...block.json, match, create, clean, fromJson })` |
| `<тип>.editor.js` | правка внутри блока, если нужна |
| `<тип>.site.css` | вид на сайте (и в редакторе — тот же) |
| `<тип>.editor.css` | только отличия в редакторе |
| `<тип>.site.js` | поведение на сайте, если есть (попадает в `content.js`) |
| `README.md` | документация; таблица «Описание» собирается из `block.json` |
| `<тип>.test.js` | тесты блока (набор `blocks`) |

Новый блок: папка, файлы выше, имя в `bin/build.json` → `blocks`. Тесты набора `blocks` проверяют, что описание полное, а ядро не упоминает блок.

<!-- blocks:begin — собрано из blocks/*/block.json при сборке (bin/build.php, build.php), не правьте вручную -->
| Блок | Вид | Группа меню | Документация |
|---|---|---|---|
| Разделитель | `hr` | Макет | [hr/README.md](hr/README.md) |
| Текст | `p` | Текст | [p/README.md](p/README.md) |
| Заголовок | `heading` | — | [heading/README.md](heading/README.md) |
| Список | `list` | — | [list/README.md](list/README.md) |
| Цитата | `blockquote` | Текст | [blockquote/README.md](blockquote/README.md) |
| Выноска | `callout` | Акцент | [callout/README.md](callout/README.md) |
| Цветной фон | `background` | Акцент | [background/README.md](background/README.md) |
| Код | `pre` | Текст | [pre/README.md](pre/README.md) |
| Чек-лист | `checklist` | Списки | [checklist/README.md](checklist/README.md) |
| Шаги | `steps` | Списки | [steps/README.md](steps/README.md) |
| Ключевые цифры | `facts` | Акцент | [facts/README.md](facts/README.md) |
| Плюсы и минусы | `proscons` | Акцент | [proscons/README.md](proscons/README.md) |
| Кнопка | `button` | Действия | [button/README.md](button/README.md) |
| iFrame | `iframe` | Встраивание | [iframe/README.md](iframe/README.md) |
| Встраивание | `embed` | Встраивание | [embed/README.md](embed/README.md) |
| Товар | `product` | Действия | [product/README.md](product/README.md) |
| Медиа | `media` | — | [media/README.md](media/README.md) |
| Таблица | `table` | Файлы и таблицы | [table/README.md](table/README.md) |
| Аккордеон | `accordion` | Интерактив | [accordion/README.md](accordion/README.md) |
| Вкладки | `tabs` | Интерактив | [tabs/README.md](tabs/README.md) |
| Содержание | `toc` | Интерактив | [toc/README.md](toc/README.md) |
| Колонки | `columns` | Макет | [columns/README.md](columns/README.md) |
<!-- blocks:end -->
