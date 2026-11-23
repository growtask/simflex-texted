# API и горячие клавиши

[← К оглавлению](README.md)

## API

```js
const [ed] = Ted.init({ selector: '#content' });
ed.getHTML();            // HTML для сохранения
ed.setHTML(html);        // загрузить HTML (в том числе старый от TinyMCE)
ed.setMode('view');      // 'edit' | 'view'
ed.setTheme('dark');     // тема интерфейса
ed.setReadOnly(true);    // доступ без редактирования (false — вернуть)
ed.focus(); ed.destroy();
ed.save();               // как кнопка «Сохранить»
ed.markSaved();          // форма с fetch: сервер принял данные
ed.getStats();           // { words, chars, minutes, blocks }
ed.clearAll();           // очистить документ (в тосте «Отменить», Ctrl+Z тоже работает)
ed.formatText();         // ✨ «Форматировать текст»
ed.toast('Текст');       // уведомление
ed.readDraft(); ed.clearDraft();
ed.setLang('en');        // язык интерфейса ('ru' | 'en'), запоминается

Ted.get('#content');             // редактор элемента
Ted.destroy('#content');         // элемент, селектор или экземпляр
Ted.setTheme('dark');            // всем редакторам (при смене темы админки)
Ted.clean(html, { blocks });     // очистить любой HTML так же, как редактор (blocks — необязательно)
Ted.createUpload(url, { headers });   // upload.fromUrl(url) — картинка по ссылке: сервер скачивает и сжимает (action=fetch)
Ted.registerBlock({ ...описание, match, create, clean, fromJson, toMarkdown });   // блок из папки blocks/<тип>/ (см. blocks/README.md)
Ted.fromMarkdown(md, { blocks });   // Markdown → чистый HTML
Ted.toMarkdown(html);            // HTML → Markdown
Ted.fromBlocks(list, { blocks }); // JSON-блоки → HTML; Ted.toBlocks(html) — обратно
Ted.addLang('de', { 'Строка': 'Übersetzung' }); Ted.setLang('en');   // языки интерфейса
```

**Блоки — папки `blocks/<тип>/`** (этап 5): `block.json` (описание — общее для браузера и сервера: меню, Markdown, клавиша, белый список тегов и атрибутов, превращение в текст), код регистрации, стили сайта и правки, README и тесты. Список блоков сборки — `tools/build.json` → `blocks`; ядро не знает конкретных блоков. Перенос идёт по одному блоку; первым перенесён «Разделитель» (`blocks/hr`). Как устроена папка и как добавить блок — `blocks/README.md`.

События на `.ted-ui`: `ted:change`, `ted:mode` (`event.detail.html`, `event.detail.mode`).

## Наполнение редактора скриптом или агентом

Документ можно описать списком блоков (JSON) — классы `ted-*` знать не нужно, текст экранируется, результат проходит ту же очистку, что и в редакторе:

```js
const html = Ted.fromBlocks([
  { type: 'h2', text: 'Как мы работаем' },
  { type: 'p', text: 'Короткое вступление.' },
  { type: 'facts', items: [{ value: '120+', label: 'стран' }, { value: '4,8', label: 'оценка' }] },
  { type: 'callout', title: 'Совет', text: 'Начните с малого.' },
  { type: 'image', url: '/uf/images/a.webp', alt: 'Фото', caption: 'Подпись' },
], { blocks: 'basic' });   // blocks — необязательно; skipped: [] соберёт неизвестные типы
editor.setHTML(html);
```

Типы: `p h2–h6 ul ol checklist steps callout facts proscons quote code hr image gallery video audio file` (список — `Ted.blockJsonTypes`).
Для готового HTML — `Ted.clean(html, { blocks })` или на сервере `TedSanitizer::clean`.

## Горячие клавиши

Без мыши: **Ctrl+.** — меню блока (стрелки, Enter), **Ctrl+Shift+↑ / ↓** — перенести блок, **Esc**, затем **Tab** — из текста к панели. Полный список — «Помощь» в редакторе.


`Ctrl` на Windows и Linux, `⌘` на macOS. Работают в любой раскладке. Полный список — кнопка «?» или Ctrl+/.

| Действие | Клавиши |
|----------|---------|
| Жирный / курсив / подчёркнутый / зачёркнутый | Ctrl+B / I / U, Ctrl+Shift+S |
| Код в строке, ссылка | Ctrl+E, Ctrl+K |
| Обычный текст, заголовки 2–6 | Ctrl+Shift+0, Ctrl+Shift+2 … 6 |
| Нумерованный / маркированный список, цитата | Ctrl+Shift+7 / 8 / 9 |
| Выравнивание: слева / центр / справа | Ctrl+Shift+L / E / R |
| Отменить / повторить | Ctrl+Z / Ctrl+Shift+Z |
| Просмотр ↔ редактирование, сохранить | Ctrl+Shift+P, Ctrl+S |
| Вложить / вынести пункт списка | Tab / Shift+Tab |
| Новая строка внутри блока | Shift+Enter |
| Отметить пункт чек-листа | Ctrl+Enter или клик по галочке |
| Выйти из блока кода | Enter на пустой последней строке |
| Язык / копировать код | Ctrl+Alt+L / Ctrl+Alt+C |

## Форматирование ✨

Кнопка ✨ приводит текст к типографским нормам: кавычки «ёлочки», тире, неразрывные пробелы, числа и валюта, телефоны, символы, буква ё.
Есть выделение — обрабатывается оно, нет — весь документ. Код, адреса и почта не трогаются, регистр не меняется.
Найденные правки подсвечиваются, рядом открывается окно с категориями; текст меняется **только по кнопке «Сохранить»**.

```js
Ted.init({
  selector: '#content',
  typograf: {
    off: ['yo'],                        // выключенные по умолчанию категории
    protect: ['iPhone', 'eBay'],        // слова-исключения
    terms: [['вайфай', 'Wi-Fi']],       // свои термины: [что, как]
    review: false,                      // без панели проверки: сразу, «Отменить» в тосте
  },
});
```

Категории: `quotes`, `dashes`, `punct`, `spaces`, `nbsp`, `numbers`, `phones`, `symbols`, `terms`, `yo`.
