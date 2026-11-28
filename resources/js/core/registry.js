// Реестр блоков (этап 5 MODULAR_PLAN.md). Блок — папка blocks/<тип>/: описание block.json и код <тип>.js, который
// регистрирует себя: Ted.registerBlock({ ...описание, ...функции }). Ядро не знает конкретных блоков — спрашивает реестр.
// Перенос идёт по одному блоку (решение 18.11); пока не перенесённые блоки живут в ядре по-старому.
//
// Описание (block.json — общее для браузера и сервера src/Blocks.php):
//   type        — вид блока ('hr'); aliases — другие имена в наборах и опции blocks ('separator')
//   title       — название; menu — { group, icon, words, convert, after } — плитка в меню «/» и «Все блоки»
//   object      — true: блок без текста (линия, медиа): выделяется целиком, панель «line», нет «Превратить в…»
//   outline     — true: рамка выделения рисуется обводкой вокруг элемента, а не подложкой (::after)
//   handleAt    — 'middle': ручка ⠿ по центру всей высоты блока (линия), иначе — по первой строке текста
//   markdown    — строка, после которой Enter вставляет блок ('---')
//   hotkey      — { code, keys, label, after, convert } — горячая клавиша: вставка блока (cmd 'insert:<тип>') или,
//                 с convert: true, превращение текущего блока (cmd 'block:<тип>'); after — место в справке
//   text        — true: текстовый блок (абзац, заголовок, цитата, код, список) — его правку ведёт текстовый движок ядра
//                 (ввод, Enter, Backspace, Markdown, превращение); в папке блока — описание, меню, стили, тесты
//   style       — { label, icon, keys, order } — пункт списка «Стиль текста»; placeholder — подсказка пустого блока
//   jsonType    — имя вида в Ted.fromBlocks, если не type (цитата — «quote»)
//   menu.picker — своя группа в «Все блоки», если там группы мельче, чем в «/» (файл — «Файлы», таблица — «Таблицы»)
//   menu.order  — место в группе меню (у блоков ядра — номер × 10 по порядку в SLASH_GROUPS)
//   html        — { тег: [атрибуты] } — белый список очистки (JS и PHP)
//   degrade     — как превращается в текст в наборе без этого блока: 'drop' — исчезает; 'children' — остаются вложенные
//                 блоки с текстом (выноска → её абзацы); иначе — код ядра (блоки, ещё не перенесённые)
//   compound    — составной блок: Delete в конце абзаца перед ним не втягивает его текст
//   classes     — классы, которые очистка сохраняет у элемента блока (выноска: ted-callout на blockquote)
//   container   — true: блок-контейнер (внутри — обычные блоки в «хостах» .ted-ui-host): не пустая строка, под ним строка текста,
//                 нормализация (normalize(el, doc, normalizeBody)) и очистка тел — общим кодом контейнеров (containers.js)
//   jsonExample — пример блока для промта нейросети (Ted.fromBlocks), строкой JSON (меню «Ещё» → «Скопировать промт», 22.11)
//   toMarkdown(el, md) — блок → Markdown (Ted.toMarkdown, выгрузка .md); md = { inline, blocks, list, table }
//   fromMarkdownAlert(title, html) — «> [!NOTE] Заголовок» в Markdown → HTML блока (выноска)
//   narrow      — true: тела контейнера узкие (колонки): туда не вставляются блоки с inNarrow: false (решение 22.11)
//   inNarrow    — false: блок слишком широкий для узкого тела контейнера (товар, таблица) — в колонки не вставляется и не переносится
//   wrap        — класс обёртки правки (медиа: ted-ui-media): в редакторе блок живёт внутри <div class="…" contenteditable="false">
//                 со своей панелью; ядро узнаёт обёртку через isWrap / wrapSelector, вид — у блока внутри
//   insertMenu  — 'media': пункт меню кнопки «Медиа ▾» панели (title, menu.icon), вставка — insert
//   ids         — атрибуты из html, значение которых — идентификатор CMS (латиница, цифры, _ и -, до 64): иначе удаляется
//                 (JS allowlist.js и PHP Sanitizer одинаково)
//   create      — может вернуть { el, focus } — куда поставить курсор после вставки
//   placeholders(editor, root), onKey(editor, e) — заглушки пустых частей и клавиши внутри блока
//   noBold      — CSS-селектор частей блока, где «Жирный» не действует (название вкладки, заголовок выноски)
//   linePlaceholder — заглушка новой пустой строки (абзаца) внутри блока, где стоит курсор (выноска: «Текст выноски»)
//   toolbar     — { bg, align, style: false; marks: [разрешённые] } — что убрать из панели, когда курсор в блоке
//   neverEmpty  — true: блок не считается пустой строкой (кнопка, карточка) — Backspace и вставка его не заменяют
//   caretBelow  — true: после вставки из меню курсор встаёт в строку текста под блоком
//   lineAfter   — true: последним в тексте под блоком всегда есть строка текста (у caretBelow — тоже), курсор после вставки — по create
//   frames      — true: <iframe> прямо в элементе блока — фрейм блока: любой https-адрес (или iframe.hosts настроек) и песочница
//                 блока; вне такого блока — только площадки видео (JS allowlist.js и PHP Sanitizer одинаково)
// Функции (только в браузере):
//   match(el)         — это элемент блока (сохранённый HTML и правка)
//   create(doc)       — новый пустой блок
//   clean(node, doc)  — очистка входящего элемента → элемент блока (вставка, загрузка)
//   fromJson(b)       — HTML из описания блока в JSON (Ted.fromBlocks)
//   clean(node, doc, idOk) — третий аргумент: проверка якоря (id)
//   serialize(el)     — HTML блока для сохранения (из формы правки), пустая строка — блок не сохраняется
//   normalize(el, doc) — привести форму правки к порядку (true — что-то поменялось)
//   toText(el, h)     — блок в наборе без него → массив узлов текста; h = { doc, p, list, text, esc } (то же — <Тип>.php → degrade)
//   canAlign(el), canBg(el) — можно ли выравнивать / красить фоном этот блок (баннер — нет)
//   canTc(el) — можно ли менять цвет текста (меню «Цвет» → «Текст»; карточки — нет); или block.json → toolbar.tc: false
//   tcPart(block, node) — часть блока, которую красит «Цвет» → «Текст» при курсоре в ней (вопрос, вкладка, заголовок шага) → Range
//   defaultBg — фон блока без класса ted-bg-* (своя серая плашка): 'gray' или (el) => имя; меню «Цвет» отмечает его
//   editorUi(editor)  — правка блока в редакторе (<тип>.editor.js): объект с onKey(e), sync(), focusBlock(), destroy();
//                       editorUiName — имя свойства редактора (editor.buttons)
//   afterInsert(editor, el) — после вставки из меню (открыть окно настроек)
//   insert(editor, block)   — блок вставляет себя сам (медиа: пустой блок с выбором файла) — меню «/», «Все блоки», «Медиа ▾»
//   blank(doc)        — пустая форма правки без окон (колонки ставят пустое изображение)
//   adopt(node)       — очистка: чужой элемент, который блок забирает себе (аккордеон — одиночный <details>)
//   unnest(el, doc)   — блок внутри тела контейнера не живёт: чем его заменить (вкладки → заголовки жирным и содержимое)
//   fromRaw(el, doc)  — вставили чужой HTML: блок забирает элемент себе (одиночная картинка → «Изображение»), иначе null
//   filesOf(html, base) — адреса своих файлов блока в HTML (после сохранения лишние удаляются с сервера)
//   clean(node, doc, idOk, wrap), serialize(el, wrap) — у блока с обёрткой: el — блок внутри, wrap — обёртка правки;
//                       clean → false: «не мой» — элемент очищается как обычно (сложная таблица — «сырой» HTML)
//   blockMenu(editor, block, done) — свои пункты меню блока (⠿): таблица — «Шапка», «Границы»
//   editorUi может ещё: refresh() — после каждой правки; statsOf(el) → { text, filled } — для сводки; pasteFiles(e, block),
//                       pasteLink(url, link, block), afterPaste(before) — вставка файлов, одной ссылки, HTML;
//                       selectedItem() — пункт, выбранный нажатием (кнопки ⠿ 🗑 у него); ownsItem(li) — пункт блока: тогда
//                       itemInside (кнопки пункта — внутри строки) и afterItemRemove() (блок остаётся и без пунктов);
//                       itemAt(node) — пункт блока под курсором (вкладка); itemAbove — кнопки пункта над ним; itemRemoved(li, parent) —
//                       пункт удалён (вкладка — вместе со своим содержимым); blockOfItems(parent) — что заменить абзацем после
//                       последнего пункта; removedToast — сообщение «… удалена»; itemRow(li) — строка, у которой кнопки пункта
//                       (вопрос аккордеона); itemCaret(li) — куда курсор после удаления соседнего пункта; itemAbove — кнопки над
//                       пунктом ('above' — вкладка, 'card' — колонка); canRemove(li) — можно ли удалить (колонок не меньше двух);
//                       syncFirst() — раньше кнопок блока (таблица: место под «Добавить …»), afterSync() — после них;
//                       onKeyFirst(e) — Enter, Tab, стрелки, Backspace, Delete раньше всех (ячейки таблицы); onPaste(cd, block, r) —
//                       вставка (таблица из Excel); lockStyle() — стиль блока и выравнивание сейчас не действуют (курсор в ячейке)
//   fromLink(editor, block, url), canFromLink(editor) — вставили ссылку отдельным абзацем: блок предлагает показать её
//                       собой (карточка встраивания) — «Встроить карточкой» в окне ссылки (media.js); canFromLink — доступно ли сейчас
// В block.json ещё: selector (CSS-селектор элемента), menu.sample (образец на плитке «Все блоки»), figma (компонент макета).

import { HOTKEYS } from './keys.js';

const REGISTRY = new Map();
const REG_TYPE = /^[a-z][a-z0-9-]{0,31}$/;

/** Зарегистрировать блок. Повторная регистрация того же вида — ошибка (два блока с одним именем). */
export function registerBlock(def) {
  if (!def || typeof def !== 'object' || !REG_TYPE.test(def.type || '')) throw new Error('Ted.registerBlock: нужен вид блока type (латиница, цифры, «-»)');
  if (REGISTRY.has(def.type)) throw new Error(`Ted.registerBlock: блок «${def.type}» уже зарегистрирован`);
  if (typeof def.match !== 'function') throw new Error(`Ted.registerBlock: у блока «${def.type}» нет match(el)`);
  REGISTRY.set(def.type, Object.freeze({ aliases: [], html: {}, ...def }));
  // горячая клавиша вставки — в общий список (справка «Горячие клавиши» показывает её на месте after)
  if (def.hotkey) {
    const k = { cmd: `${def.hotkey.convert ? 'block' : 'insert'}:${def.type}`, code: def.hotkey.code, keys: def.hotkey.keys, label: def.hotkey.label };
    let at = -1;
    for (let i = 0; i < HOTKEYS.length; i++) if (HOTKEYS[i].cmd === def.hotkey.after) at = i;
    HOTKEYS.splice(at < 0 ? HOTKEYS.length : at + 1, 0, k);
  }
  return REGISTRY.get(def.type);
}

/** Описание блока по виду (или другому имени). */
export function blockDef(type) {
  if (REGISTRY.has(type)) return REGISTRY.get(type);
  for (const d of REGISTRY.values()) if (d.aliases.includes(type)) return d;
  return null;
}

/** Элемент лежит в узком теле контейнера (block.json контейнера → narrow: true, например колонки). */
export function inNarrowHost(host) {
  for (let a = host; a && a.nodeType === 1; a = a.parentElement) {
    const d = defOf(a);
    if (d && d.container) return !!d.narrow;
  }
  return false;
}

/** Все зарегистрированные блоки в порядке регистрации. */
export function registeredBlocks() { return [...REGISTRY.values()]; }

/** Блок, которому принадлежит элемент (верхнего уровня), или null. */
export function defOf(el) {
  if (!el || el.nodeType !== 1) return null;
  for (const d of REGISTRY.values()) if (d.match(el)) return d;
  return null;
}

/** Элемент — блок без текста (линия, медиа…): выделяется целиком. */
export function isObjectBlock(el) { const d = defOf(el); return !!(d && d.object); }

/** Вид — блок без текста. */
export function isObjectType(type) { const d = blockDef(type); return !!(d && d.object); }

/** CSS-селектор элементов блоков без текста (для проверок «пусто ли», «куда поставить курсор»). */
export function objectSelector() {
  return registeredBlocks().filter((d) => d.object && d.selector).map((d) => d.selector).join(', ');
}

/** Обёртка правки блока (block.json → wrap, медиа): элемент — обёртка. */
export function isWrap(el) {
  return !!el && el.nodeType === 1 && registeredBlocks().some((d) => d.wrap && el.classList.contains(d.wrap));
}

/** CSS-селектор обёрток правки; если их нет — селектор, который ничего не выбирает. */
export function wrapSelector() {
  const list = [...new Set(registeredBlocks().filter((d) => d.wrap).map((d) => `.${d.wrap}`))];
  return list.length ? list.join(', ') : ':not(*)';
}

/** Блок, который вставляется Markdown-строкой (например «---»). */
export function markdownBlock(text) {
  for (const d of REGISTRY.values()) if (d.markdown && d.markdown === text) return d;
  return null;
}
