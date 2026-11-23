# Блоки

[← К оглавлению](README.md)

## Блоки

Блок добавляют так: набрать `/` и выбрать из списка, нажать «+» у блока, кнопка «Все блоки» в панели или Markdown-сокращение.
Разметка на выходе чистая: стандартные теги и несколько классов `ted-*`. JavaScript на сайте нужен только аудиоплееру и запуску видео.

| Блок | Как получить | HTML |
|------|--------------|------|
| Абзац, заголовки | Enter, `# `, меню «Стиль текста» (H2–H6) | `<p>`, `<h2>`…`<h6>` |
| Списки | `- `, `1. `, Ctrl+Shift+8 / 7; Tab — вложить | `<ul>`, `<ol>` |
| Чек-лист | `[] ` | `<ul class="ted-checklist"><li class="ted-checked">…</li></ul>` |
| Шаги | меню блоков | `<ol class="ted-steps"><li><strong>Заголовок</strong><br>Описание</li></ol>` |
| Выноска | меню блоков | `<blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>Текст</p></blockquote>` |
| Ключевые цифры | меню блоков (2 плитки, Enter добавляет) | `<ul class="ted-facts"><li><strong>120+</strong><br>стран</li></ul>` |
| Плюсы и минусы | меню блоков | `<ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul>…</ul></li><li class="ted-cons">…</li></ul>` |
| Цитата | `> `, Ctrl+Shift+9; кнопка «Добавить автора» | `<blockquote><p>…</p><p class="ted-author"><strong>Имя</strong><br>Должность</p></blockquote>` |
| Цветной фон | кнопка «цвет» | `<p class="ted-bg-gray">`, `ted-bg-color1`, `ted-bg-color2` |
| Код | три обратные кавычки + Enter, кнопка `<>` | `<pre data-lang="js" data-nums="1\n2"><code>…</code></pre>` |
| Разделитель | `---` + Enter | `<hr>` |
| Аккордеон | меню блоков | `<div class="ted-accordion" itemscope itemtype="https://schema.org/FAQPage"><details class="ted-accordion__item" …><summary class="ted-accordion__q">Вопрос</summary><div class="ted-accordion__a" …><div class="ted-accordion__body">блоки ответа</div></div></details></div>` |
| Вкладки | меню блоков | `<div class="ted-tabs"><div class="ted-tabs__panel"><p class="ted-tabs__title">Название</p><div class="ted-tabs__body">блоки</div></div>…</div>` (ряд вкладок строит `content.js`) |
| Содержание | меню блоков | `<nav class="ted-toc"><div class="ted-toc__progress"><div class="ted-toc__bar"></div></div><div class="ted-toc__panel"><p class="ted-toc__title">…</p><ul class="ted-toc__list"><li><a href="#якорь">Глава</a></li></ul></div></nav>` (свёртывание и прогресс — `content.js`) |
| Колонки | меню блоков | `<div class="ted-columns ted-columns--2"><div class="ted-columns__col">блоки</div>…</div>` (2–4; планшет — не больше 2 в ряд, телефон — одна под другой; без скрипта) |
| Кнопка | меню блоков | `<div class="ted-button [ted-align-center]"><a class="ted-button__btn" href="…">…</a>[<a class="ted-button__btn ted-button__btn--secondary" …>…</a>]</div>`; баннер — `ted-button--banner` с `.ted-button__text` (`__title`, `__desc`) и одной кнопкой |
| iFrame | меню блоков | `<figure class="ted-iframe"><iframe src="https://…" [height] title loading="lazy" sandbox="…" referrerpolicy allowfullscreen></iframe>[<figcaption>…</figcaption>]</figure>` (любой https-адрес, всегда в песочнице) |
| Встраивание | меню блоков | `<div class="ted-embed [ted-embed--compact]" [data-ted-article="id"]>` — шапка (аватар, `__name`, `__sub`), `__text`, `__img`, `__foot` (плашки, `a.ted-embed__open`). Данные — опции `articles` и `opengraph` (`Ted.createOpenGraph(url)` + `php/opengraph.php`) |
| Товар | меню блоков | `<div class="ted-product" [data-ted-product="id"]>` — `img.ted-product__img`, `__name`, `__price` (`__now`, `s.__old`), `a.ted-product__btn` («В корзину» с `data-ted-cart` → событие `ted:add-to-cart` в content.js; вручную — «Перейти»). Каталог — опция `products` |
| Таблица | меню блоков, вставка из Excel / Google Таблиц | `<figure class="ted-table"><div class="ted-table__wrap"><table data-cols="3"><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table></div><figcaption>…</figcaption></figure>`; без границ — `ted-table--plain` |
| Изображение, галерея, видео, аудио, файл | меню «Медиа», вставка и перетаскивание файлов | `<figure class="ted-media ted-media--image">…</figure>` |

**Как ведут себя Enter и кнопки в сложных блоках**
- *Чек-лист, шаги, цифры, плюсы и минусы:* Enter переходит к следующему пункту, в последнем создаёт новый. Пустые хвосты при сохранении отбрасываются. У пункта справа или в углу — ручка ⠿ (перетащить) и корзина.
- *Цветной фон* не работает у чек-листа, шагов и плюсов-минусов; выравнивание — у чек-листа и шагов.
- *Enter в блоке с цветным фоном* создаёт обычный абзац без фона.
- *Код:* язык определяется сам, клик по шапке — выбрать язык (в том числе своё название), справа в шапке — копировать. Ctrl+Alt+L — язык, Ctrl+Alt+C — копировать. Номера строк включены по умолчанию (меню блока → «Скрыть номера строк»).
- *Цветной фон у части текста:* выделите слово — подложка только под ним: `<mark class="ted-bg-color1">`.
- *Таблица:* в ячейках всё форматирование текста (жирный, курсив, подчёркнутый, зачёркнутый, код, ссылка). Enter — следующая ячейка; в последней: с текстом — новая строка, пустой — новый блок под таблицей. Shift+Enter — перенос строки в ячейке. Tab / Shift+Tab — соседняя ячейка. Строки и столбцы перетаскиваются за ⠿ и удаляются корзиной; под таблицей «Добавить строку» и «Добавить столбец» (до 10 столбцов и 100 строк). Шапка и границы — в меню блока. Столбцы равные и не уже 120 px, шире — прокрутка вбок. Старые таблицы без объединённых ячеек становятся редактируемыми, с объединёнными (colspan / rowspan) остаются HTML-блоком.
- *Формулы в таблице:* «=» в ячейке — список функций (СУММ, СРЗНАЧ, МИН, МАКС, СЧЁТ, ОКРУГЛ; SUM, AVERAGE … тоже), адреса ячеек — кликом или протяжкой, разделитель аргументов «;», проценты и рубли. Квадрат в углу ячейки протягивает формулу со сдвигом ссылок ($A$1 не сдвигается). В HTML: `<td data-formula="=СУММ(B2:B4)">1 250</td>` — на сайте просто число.
- *Якорь* (кнопка ⚓): ставит блоку `id` для ссылки `#имя`.

Размеры и цвета блоков заданы по макету дизайн-системы «Симфлекс АИ» (Figma); стили блока — в его папке `blocks/<тип>/`.
