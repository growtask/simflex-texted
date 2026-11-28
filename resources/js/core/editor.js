// Ted — главный класс редактора.

import { sanitizeHTML, sanitizeNodes, serializeBlocks, ensureCode, setNumsAttrs, withoutTokens, setRawPolicy } from './sanitize.js';
import { applyEditorHighlight, detectCodeLang, releaseEditorHighlight } from './highlight.js';
import { markdownToHtml, looksLikeMarkdown } from './markdown.js';
import { Presence } from './presence.js';
import { t, tf, setLang, getLang, relabel } from './i18n.js';
import { getRange, topBlockOf, selectedBlocks, isAtStart, isAtEnd, placeCaret } from './selection.js';
import { History } from './history.js';
import { chooseMedia, mediaPagePath } from './upload.js';
import {
  bgAllowed, alignAllowed, blockCanConvert, resolveBlocks, blockAllowed, restrictBlocks, ZWSP, emptyStepItem, convertBlocks, setAlign, alignOfBlock, setBg, bgOfBlock, setTc, tcOfBlock, tcAllowed, TC_NAMES, BG_NAMES, blockType, kindOf, normalizeRoot, emptyBlock, isEmptyBlock,
  withMarkers, placeholderOf,
} from './blocks.js';
import { serverOptions } from './server.js';
import { presetOf, presetNames } from './presets.js';
import { blockDef, defOf, registeredBlocks, isObjectBlock, isObjectType, objectSelector, markdownBlock, isWrap, wrapSelector } from './registry.js';
import { findHotkey } from './keys.js';
import { typografBlocks, protectRegExp, diffRanges, TYPO_CATEGORIES } from './typo.js';
import { registerYo } from './yo.js';
import { h, button, icon, smallButton, Tooltip, Popover, Toaster, adminModalOpen } from '../ui/widgets.js';

const smallButtonEl = (name, label, iconName, onClick) => smallButton({ name, label, iconName, onClick });
import { Toolbar } from '../ui/toolbar.js';
import { BlockHandle, slugify, uniqueId } from '../ui/handle.js';
import { BlockMenu } from '../ui/blockmenu.js';
import { FramePreview, InlineView } from '../ui/preview.js';
import { rootBlockOf, isHost } from './containers.js';

const DEFAULTS = {
  value: null,            // начальный HTML (по умолчанию — из textarea/элемента)
  unit: 'px',             // 'px' | 'vw' — как считать размеры в предпросмотре
  theme: 'light',         // 'light' | 'dark' | 'auto' — тема интерфейса; 'auto' следует за data-theme на <html> (тема админки Simflex), без него — за темой системы
  mode: 'edit',           // 'edit' | 'view' — режим при открытии
  preview: 'frame',       // 'frame' — iframe с экранами; 'inline' — просмотр на странице (документация)
  previewScreen: null,    // 'editor' — начать с колонки редактора
  contentCss: [],         // доп. CSS сайта для предпросмотра (переменные, шрифты)
  wrap: true,             // оборачивать результат в <div class="ted-content">
  placeholder: null,      // текст подсказки в пустом абзаце
  startWithHeading: false,// пустой документ начинается с заголовка (как в макете)
  autofocus: false,
  dblclickToEdit: true,   // двойной клик в режиме просмотра → редактирование
  readOnly: false,        // только просмотр: правки нет (нет кнопки «Редактировать», двойной клик и Ctrl+Shift+P не работают) — для доступов без редактирования; меняется на лету: editor.setReadOnly(true|false)
  onChange: null,         // (html, editor) => {}
  onSave: null,           // (html, editor) => {} — при выходе из редактирования
  onModeChange: null,     // (mode, editor) => {}
  pageUrl: null,          // адрес публичной страницы для «Копировать ссылку»: строка или (block) => строка; по умолчанию адрес текущей страницы
  mediaPageUrl: null,     // публичный адрес документа для загрузки медиа
  mediaSource: 'direct', // 'direct' | 'manager'
  upload: null,           // (file, { kind, pagePath, signal, onProgress }) => Promise<{ url, name }>
  pickFile: null,         // ({ kind, multiple, pagePath, editor }) => Promise<asset | asset[] | null>
  products: null,         // каталог CMS для «Товара»: { search: async (q) => [{ id, name, sku, price, oldPrice, image, url }], get: async (id) => {...} }
  articles: null,         // статьи CMS для «Встраивания»: { search: async (q) => [{ id, title, url, text, image, site, date, views, likes }], get: async (id) => {...} }
  server: null,           // настройки с сервера (ted.config.php → Config::getClientJson()): { filesUrl, limits, opengraph, iframeHosts } — см. core/server.js
  opengraph: null,        // карточка по ссылке для «Встраивания»: async (url) => { url, title, text, image, site } — читает сервер CMS (Ted.createOpenGraph('/…'))
  toasts: true,           // показывать тостеры («Ссылка скопирована», «Блок удалён»…)
  previewMode: true,      // false — режима просмотра нет (админка): вместо кнопки режима в панели «Сохранить»
  linkBlank: true,        // новые и вставленные ссылки по умолчанию открываются в новой вкладке (переключатель в окне «Ссылка»)
  markdown: true,         // Markdown-сокращения в начале абзаца: «# », «- », «1. », «> », «---» + Enter, «```» + Enter
  typograf: {},           // ✨ «Форматировать текст»: { off: ['yo'] — выключенные категории, protect: ['iPhone'] — слова-исключения, terms: [['вайфай','Wi-Fi']] — свои термины, yo: ['щётка'] — слова для ё, review: false — без панели проверки }
  stats: true,            // писать в обёртку .ted-content data-words / data-chars / data-minutes / data-blocks (для SEO и «время чтения» на сайте)
  lang: null,             // язык интерфейса: 'ru' | 'en'; null — выбор пользователя («Ещё» → English / Русский) или русский (22.11)
  presence: true,         // один документ в двух вкладках: предупреждение и подтверждение перед сохранением поверх чужого (22.11)
  autosave: false,        // true или строка-ключ: черновик в localStorage, восстанавливается после перезагрузки, пока не сохранён
  autosaveDelay: 800,     // мс после последнего изменения
  saveAfterUpload: true,  // после загрузки файлов сразу сохранять страницу (onSave): файл привязан к сохранённому тексту и не остаётся на сервере «сиротой»
  blocks: 'all',          // какие блоки доступны: 'all' | имя набора ('mini', 'text'…) | 'basic' | массив типов ['p','h2','ul'…]; запрещённые из меню, панели и Markdown убираются, а при загрузке, вставке и сохранении превращаются в текст
  preset: null,           // набор (этап 2): 'full' | 'mini' | 'text' | 'readonly' | 'docs' | свой (Ted.definePreset) — блоки и режим открытия; в CMS набор задаёт сервер (server.preset)
};

const EXEC_MARKS = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough' };

export class Editor {
  constructor(target, options = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.server = serverOptions(this.options.server);   // этап 1: папка файлов, лимиты, карточки, сайты iFrame — с сервера
    if (!this.server.opengraph) this.options.opengraph = null;   // карточки по ссылке выключены на сервере
    this.applyPreset(options);   // этап 2: набор поля и право на правку
    this.allowedBlocks = resolveBlocks(this.options.blocks, this.server.presets);   // Set типов или null (всё разрешено)
    // язык интерфейса — до того, как рисуются панель и окна
    let savedLang = null;
    try { savedLang = localStorage.getItem('ted-lang'); } catch (e) { /* без запоминания */ }
    setLang(this.options.lang || savedLang || 'ru');
    setRawPolicy(this.options.rawHtml);   // 'trusted' — старый «сырой» HTML без вычистки тегов (только для доверенных авторов); по умолчанию строго
    this.target = target;
    this.isTextarea = target.tagName === 'TEXTAREA';
    this.mode = 'edit';
    this.state = { type: 'p', align: 'left', marks: {}, hasSelection: false, mode: 'edit', canEdit: true, focused: false };
    this.saved = null;
    this.lastHTML = null;
    this.savedHTML = null;
    this.changeTimer = null;
    this.composing = false;
    this.disposers = [];
    this.toaster = null;

    const initial = this.options.value !== null && this.options.value !== undefined
      ? this.options.value
      : (this.isTextarea ? target.value : target.innerHTML);

    this.buildDOM();
    this.mediaUploaded = new Set();   // адреса, загруженные в этой сессии: после сохранения лишние удаляются с сервера (cleanupMedia)
    this.history = new History(this.editable, { onRestore: () => this.afterChange({ record: false }) });
    this.setHTML(initial, { silent: true });
    this.savedHTML = this.lastHTML;
    this.baseHTML = this.lastHTML;   // текст, с которым открыли редактор (для проверки черновика)
    this.bindEvents();
    this.setTheme(this.options.theme);
    // тот же документ в другой вкладке (22.11): ключ — как у черновика (или адрес страницы + поле)
    if (this.options.presence !== false) {
      const key = this.draftKey() || `${location.pathname}#${this.target.id || this.target.getAttribute('name') || ''}`;
      this.presence = new Presence(key, (type) => {
        if (type === 'other') this.toast('Этот документ открыт ещё в одной вкладке. Правьте в одной — иначе сохранение одной перезапишет другую', { timeout: 8000 });
        if (type === 'saved') this.toast('В другой вкладке документ сохранён. Сохранение здесь перезапишет те правки', { status: 'error', timeout: 8000 });
      });
    }
    // открытие: панель и блоки появляются по очереди сверху вниз (motion.css → .is-appearing), без сдвигов раскладки
    if (this.options.appear !== false) {
      this.ui.classList.add('is-appearing');
      setTimeout(() => this.ui.classList.remove('is-appearing'), 1000);
    }
    this.updateState();
    if (this.options.autosave) this.restoreDraft();
    if (this.options.mode === 'view' || this.options.readOnly) this.setMode('view', { silent: true });
    if (this.options.autofocus) this.focus();
  }

  // -------------------------------------------------------------------------
  // DOM
  // -------------------------------------------------------------------------

  buildDOM() {
    const o = this.options;
    this.ui = h('div', { class: 'ted-ui', 'data-mode': 'edit', lang: getLang() });
    if (o.preview === 'inline') this.ui.classList.add('is-inline-view');

    this.editable = h('div', {
      class: 'ted-content ted-ui-editable',
      contenteditable: 'true',
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Текст',
      spellcheck: 'true',
      'data-ted-unit': 'px',
    });
    // строка «Добавить блок» под последним блоком (editor-add-block)
    this.addBlock = h('button', { type: 'button', class: 'ted-ui-addblock', 'aria-label': 'Добавить блок' }, [
      h('span', { class: 'ted-ui-addblock__btn' }, [icon('plus-small')]),
    ]);
    this.addBlock.addEventListener('mousedown', (e) => e.preventDefault());
    this.addBlock.addEventListener('click', () => this.blockMenu.openPicker(this.lastBlock()));
    this.column = h('div', { class: 'ted-ui-column' }, [this.editable, this.addBlock]);
    this.canvas = h('div', { class: 'ted-ui-canvas' }, [this.column]);
    this.popover = new Popover(this.ui);
    this.subPopover = new Popover(this.ui);
    this.popover.afterKeyboardClose = (r) => this.returnCaret(r);   // Esc в окне — курсор обратно в текст
    this.subPopover.afterKeyboardClose = (r) => this.returnCaret(r);
    this.popover.child = this.subPopover;
    this.subPopover.parent = this.popover;
    this.blockMenu = new BlockMenu(this);
    this.toolbar = new Toolbar(this);
    this.preview = o.preview === 'inline' ? new InlineView(this) : new FramePreview(this);
    this.body = h('div', { class: 'ted-ui-body' }, [this.canvas, this.preview.el]);
    this.ui.append(this.toolbar.el, this.body);
    this.tooltip = new Tooltip(this.ui);

    if (this.isTextarea) {
      this.target.style.display = 'none';
      this.target.insertAdjacentElement('afterend', this.ui);
    } else {
      this.target.innerHTML = '';
      this.target.appendChild(this.ui);
    }
    this.ui.__ted = this;
    this.syncStickyTop();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.syncStickyTop());
      ro.observe(this.toolbar.el);
      this.disposers.push(() => ro.disconnect());
    }
    this.handle = new BlockHandle(this);
    // правка блоков из реестра (blocks/<тип>/<тип>.editor.js → editorUi): клавиши, sync, рамка, destroy; у семейства — одна
    const uis = new Map();
    for (const d of registeredBlocks()) {
      if (!d.editorUi || uis.has(d.editorUi)) continue;
      const ui = d.editorUi(this);
      uis.set(d.editorUi, ui);
      if (d.editorUiName) this[d.editorUiName] = ui;
    }
    this.blockUis = [...uis.values()];
    this.refreshBlockUis();   // текст загружен раньше — блоки дорисовывают свои панели (медиа)
    // встроенные ручки правки таблиц и размеров (Firefox) не нужны — у таблицы свои кнопки
    try { document.execCommand('enableObjectResizing', false, false); document.execCommand('enableInlineTableEditing', false, false); } catch { /* не поддерживается */ }
  }

  listen(el, type, fn, opts) {
    el.addEventListener(type, fn, opts);
    this.disposers.push(() => el.removeEventListener(type, fn, opts));
  }

  bindEvents() {
    const ed = this.editable;
    this.listen(ed, 'keydown', (e) => this.onKeyDown(e));
    this.listen(ed, 'beforeinput', (e) => this.onBeforeInput(e));
    this.listen(ed, 'input', (e) => this.onInput(e));
    this.listen(ed, 'paste', (e) => this.onPaste(e));
    this.listen(ed, 'mousedown', (e) => this.onChecklistDown(e));
    this.listen(ed, 'mousedown', (e) => this.onCodeHeadDown(e));
    this.listen(ed, 'mousemove', (e) => this.onChecklistMove(e));
    this.listen(ed, 'mouseleave', () => { ed.style.cursor = ''; });
    this.listen(ed, 'compositionstart', () => { this.composing = true; });
    this.listen(ed, 'compositionend', () => { this.composing = false; this.onInput(); });
    this.listen(ed, 'focus', () => {
      document.execCommand('defaultParagraphSeparator', false, 'p');
      document.execCommand('styleWithCSS', false, false);
      this.scheduleState();
    });
    this.listen(ed, 'blur', () => setTimeout(() => { this.scheduleState(); this.handle.syncItem(); }, 0));
    this.listen(ed, 'click', (e) => {
      // клик по линии или HTML-блоку — ставим курсор после него
      const t = e.target;
      if (t !== ed && (isObjectBlock(t) || t.closest('.ted-ui-raw') ||
          (t.closest(wrapSelector()) && !t.closest('button, input, select, textarea')))) {
        // ссылки в медиа в правке не открываются; кнопка «Смотреть на YouTube» — как превью: первый щелчок выбирает блок, второй открывает видео
        // линия / HTML-блок: выделяем целиком — у блока появляются ⠿ 🗑, панель «line»
        const block = topBlockOf(ed, t);
        if (block) this.selectObject(block);
      }
    });
    this.listen(document, 'selectionchange', () => {
      if (this.mode === 'edit' && document.activeElement === ed) this.scheduleState();
    });
    // клик по пустому месту под текстом — курсор в конец
    this.listen(this.canvas, 'mousedown', (e) => {
      if (e.target !== this.canvas && e.target !== this.column) return;
      e.preventDefault();
      const last = ed.lastElementChild;
      if (last) placeCaret(last.tagName === 'UL' || last.tagName === 'OL' ? last.lastElementChild : last, true);
      ed.focus();
    });
    if (this.isTextarea && this.target.form) {
      this.listen(this.target.form, 'submit', () => this.flush());   // черновик не стираем: если сервер откажет, текст не потеряется; устаревший черновик отсекает проверка base
    }
    // в режиме просмотра Ctrl+Shift+P тоже работает
    this.listen(this.ui, 'keydown', (e) => {
      if (this.mode !== 'view' || e.defaultPrevented) return;
      const hk = findHotkey(e);
      if (hk && hk.cmd === 'mode') {
        e.preventDefault();
        this.setMode('edit');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Содержимое
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Черновик (автосохранение)
  // -------------------------------------------------------------------------

  draftKey() {
    const a = this.options.autosave;
    if (!a) return null;
    if (typeof a === 'string') return a;
    const id = this.target.id || this.target.getAttribute('name') || '';
    if (!id && !this._draftWarned) {
      this._draftWarned = true;
      if (typeof console !== 'undefined') console.warn('Ted: у поля нет id/name, черновик общий для страницы. Передайте autosave: "ключ" с идентификаторами документа и поля.');
    }
    return `ted-draft:${location.pathname}#${id}`;
  }

  /** Черновик действителен, пока текст на сервере не изменился (base) — иначе он устарел. */
  readDraft() {
    const key = this.draftKey();
    if (!key) return null;
    try {
      const d = JSON.parse(localStorage.getItem(key) || 'null');
      return d && typeof d.html === 'string' && d.base === this.baseHTML ? d : null;
    } catch (e) { return null; }
  }

  writeDraft(html) {
    const key = this.draftKey();
    if (!key) return;
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      try {
        if (html === this.baseHTML || html === this.savedHTML) localStorage.removeItem(key);
        else {
          localStorage.setItem(key, JSON.stringify({ html, base: this.baseHTML, t: Date.now() }));
          // один раз за сессию — спокойное подтверждение, что текст не потеряется
          if (!this._draftToast) { this._draftToast = true; this.toast('Черновик сохранён'); }
        }
      } catch (e) { /* localStorage недоступен или переполнен — черновик не критичен */ }
    }, this.options.autosaveDelay);
  }

  clearDraft() {
    const key = this.draftKey();
    clearTimeout(this.draftTimer);
    if (key) { try { localStorage.removeItem(key); } catch (e) { /* ничего */ } }
  }

  restoreDraft() {
    const d = this.readDraft();
    if (!d || d.html === this.baseHTML) return;
    this.setHTML(d.html, { silent: true });
    this.savedHTML = this.baseHTML;          // на сервере — прежний текст
    if (this.isTextarea) this.target.value = d.html;
    this.updateState();
    setTimeout(() => this.toast('Черновик восстановлен', {
      action: 'Сбросить',
      onAction: () => { this.setHTML(this.baseHTML, { silent: true }); this.clearDraft(); },
    }), 0);
  }

  setHTML(html, { silent = false, undoable = false } = {}) {
    // undoable: замена записывается в историю — Ctrl+Z и «Отменить» в уведомлении вернут прежний текст (сброс демо, 1.0.4)
    if (undoable) this.history.commit();
    const frag = this.restrict(withoutTokens(() => sanitizeHTML(html || '')));
    this.editable.replaceChildren(frag);
    if (!this.editable.firstChild) {
      if (this.options.startWithHeading) this.editable.appendChild(emptyBlock(document, 'h2'));
      this.editable.appendChild(emptyBlock(document, 'p'));
    }
    normalizeRoot(this.editable);
    this.seenBlocks = new WeakSet(this.editable.children);   // загруженные блоки — не «новые» для revealCaret
    if (!undoable) this.history.reset();
    this.refreshBlockUis();
    this.updatePlaceholders();
    if (silent) {
      this.lastHTML = this.getHTML();
      this.savedHTML = this.lastHTML;   // загруженное снаружи — уже сохранено
    } else {
      this.emitChange();
    }
    if (this.mode === 'view') {
      this.preview.render(this.getInnerHTML());
      if (this.toolbar) this.toolbar.update(this.state);   // сводка в панели просмотра
    }
  }

  /** Сводка по тексту: слов, символов (с пробелами), минут чтения (200 слов/мин), блоков. */
  getStats() {
    // блоки склеиваем пробелом, иначе последнее слово блока слипается с первым словом следующего
    const st = (b) => { for (const u of this.blockUis || []) { const s = u.statsOf && u.statsOf(b); if (s) return s; } return null; };   // блок с обёрткой (медиа) — сводка от него
    const text = Array.from(this.editable.children).map((b) => (st(b) ? st(b).text : b.textContent)).join(' ').replace(/​/g, '').trim();
    const words = (text.match(/\S+/g) || []).length;
    const blocks = [...this.editable.children].filter((b) => (st(b) ? st(b).filled : !isEmptyBlock(b))).length;
    return { words, chars: text.length, minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0, blocks };
  }

  /** Привести блоки фрагмента к разрешённым (опция blocks): запрещённые становятся обычным текстом. */
  restrict(frag, doc = document) { return this.allowedBlocks ? restrictBlocks(frag, this.allowedBlocks, doc) : frag; }

  /** Чистый HTML блоков без обёртки. */
  getInnerHTML() {
    // копия правки — в отдельном рабочем документе: в Safari каждое изменение документа пересчитывает все «живые» диапазоны
    // подсветки кода (тысячи у длинного кода), и сборка HTML кода на 2000 строк шла 17 с (проверка 22.11)
    if (!this.workDoc) this.workDoc = document.implementation.createHTMLDocument('');
    const doc = this.workDoc;
    const clone = doc.importNode(this.editable, true);
    clone.querySelectorAll('[data-tedui-m]').forEach((m) => m.remove());
    // ячейка, в которой правится формула: сохраняется результат, а не текст формулы
    clone.querySelectorAll('[data-tedui-fedit]').forEach((c) => { c.textContent = c.getAttribute('data-tedui-fval') || ''; });
    for (const el of clone.querySelectorAll('*')) {
      for (const a of Array.from(el.attributes)) if (a.name.startsWith('data-tedui-')) el.removeAttribute(a.name);
    }
    return serializeBlocks(this.restrict(sanitizeNodes(clone.childNodes, doc), doc));
  }

  /** Итоговый HTML для сохранения. */
  getHTML() {
    const inner = this.getInnerHTML();
    if (!inner) return '';
    if (!this.options.wrap) return inner;
    let attrs = '';
    if (this.options.stats) {
      const s = this.getStats();
      attrs = ` data-words="${s.words}" data-chars="${s.chars}" data-minutes="${s.minutes}" data-blocks="${s.blocks}"`;
    }
    return `<div class="ted-content"${attrs}>\n${inner}\n</div>`;
  }

  /** Текст без разметки (например, для подсчёта символов). */
  getText() {
    return this.editable.innerText.trim();
  }

  flush() {
    clearTimeout(this.changeTimer);
    this.history.commit();
    this.emitChange();
  }

  emitChange() {
    clearTimeout(this.changeTimer);
    const html = this.getHTML();
    if (html === this.lastHTML) return;
    this.lastHTML = html;
    if (this.isTextarea) {
      this.target.value = html;
      this.target.dispatchEvent(new Event('input', { bubbles: true }));
      this.target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (this.options.onChange) this.options.onChange(html, this);
    this.writeDraft(html);
    this.ui.dispatchEvent(new CustomEvent('ted:change', { bubbles: true, detail: { html, editor: this } }));
  }

  /** Правка блоков из реестра дорисовывает свои части (панель медиа у нового блока). */
  refreshBlockUis() {
    for (const u of this.blockUis || []) if (u.refresh) u.refresh();
  }

  afterChange({ immediate = false, record = true, focus = null, typing = false } = {}) {
    this.refreshBlockUis();
    if (focus && focus.isConnected) {
      const target = focus.tagName === 'UL' || focus.tagName === 'OL' ? focus.firstElementChild : focus;
      placeCaret(target);
    }
    if (record) {
      if (immediate) this.history.commit();
      else this.history.schedule();
    }
    this.updatePlaceholders();
    // обычный ввод текста: шапка и кнопки блока — один раз после паузы, а не на каждую букву (каждое чтение состояния
    // заставляло браузер пересчитывать стили: на статье из 300 блоков ввод символа занимал ~80 мс, проверка 22.11)
    if (typing) {
      clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => { if (!this.destroyed) { this.updateState(); this.handle.refresh(); } }, 60);
    } else {
      clearTimeout(this.typingTimer);
      this.updateState();
      this.handle.refresh();
    }
    clearTimeout(this.changeTimer);
    this.changeTimer = setTimeout(() => this.emitChange(), immediate ? 0 : 250);
    // правка или новый блок за краем окна — экран идёт за ним (сайт texted 27.11, 1.0.4)
    if (!this.destroyed) requestAnimationFrame(() => this.revealCaret());
  }

  /**
   * Место правки (курсор или выделенный блок) ушло за край окна — плавно подводим к нему с запасом: снизу 72 (над нижними
   * панелями сайта), сверху — под панелью редактора. Высокий блок (больше окна) — показываем его начало.
   */
  revealCaret() {
    // новые блоки верхнего уровня (вставка из меню, дублирование, медиа) — показываем блок целиком, а не только строку
    // курсора: у вставленной таблицы, выноски, фото курсор в первой строке, а сам блок оставался за нижним краем
    // (заказчик 27.11). Первый вызов только запоминает блоки.
    const kids = Array.from(this.editable.children);
    const seen = this.seenBlocks;
    this.seenBlocks = new WeakSet(kids);
    let fresh = seen ? kids.filter((c) => !seen.has(c)) : [];
    if (fresh.length === kids.length) fresh = [];   // заменено всё (отмена, повтор, загрузка) — ведём только за курсором
    if (this.destroyed || this.mode !== 'edit' || !this.isFocused()) return;
    const top = this.toolbar.el.getBoundingClientRect().bottom + 16;
    const bottom = window.innerHeight - 72;
    let rect = null;
    if (fresh.length) {
      const a = fresh[0].getBoundingClientRect();
      const b = fresh[fresh.length - 1].getBoundingClientRect();
      if (b.bottom - a.top <= bottom - top) rect = { top: a.top, bottom: b.bottom, height: b.bottom - a.top };
    }
    const r = getRange(this.editable);
    if (!rect && !r) return;
    if (!rect) rect = r.getBoundingClientRect();
    if (!rect.height) {
      // пустая строка: у свёрнутого курсора нет размеров — берём элемент, где он стоит (абзац, ячейку), а не весь блок
      const el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      if (!el || el === this.editable) return;
      rect = el.getBoundingClientRect();
    }
    let dy = 0;
    if (rect.height > bottom - top) {
      if (rect.bottom < top || rect.top > bottom) dy = rect.top - top;   // высокий — только если целиком за краем, к его началу
    } else if (rect.top < top) dy = rect.top - top;
    else if (rect.bottom > bottom) dy = rect.bottom - bottom;
    if (Math.abs(dy) < 1) return;
    this.scrollFollow(dy);
  }

  /**
   * Плавно сдвигает страницу на dy. Одна анимация с общей целью: при наборе каждая клавиша лишь сдвигает цель, а не
   * запускает новую плавную прокрутку (браузерная smooth на каждое нажатие сбивала предыдущую — экран дёргался, строка
   * оставалась у края; заказчик 27.11). Колесо или касание пользователя останавливают анимацию. «Уменьшить движение» —
   * сразу, без анимации.
   */
  scrollFollow(dy) {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = Math.min(max, Math.max(0, window.scrollY + dy));   // dy посчитан от текущего положения
    if (calm) { this.stopFollow(); window.scrollTo(0, target); return; }
    if (this.follow) { this.follow.target = target; return; }
    const stop = () => this.stopFollow();
    const f = this.follow = { target, raf: 0, stop };
    window.addEventListener('wheel', stop, { passive: true, once: true });
    window.addEventListener('touchstart', stop, { passive: true, once: true });
    const step = () => {
      if (this.follow !== f || this.destroyed) return;
      const left = f.target - window.scrollY;
      if (Math.abs(left) < 1) { window.scrollTo(0, f.target); this.stopFollow(); return; }
      // мягкое замедление к цели: за кадр — пятая часть остатка (≈ 250 мс), не меньше 1 px
      const move = Math.sign(left) * Math.max(1, Math.abs(left) * 0.2);
      const before = window.scrollY;
      window.scrollTo(0, before + move);
      if (window.scrollY === before) { this.stopFollow(); return; }   // дальше некуда (край страницы)
      f.raf = requestAnimationFrame(step);
    };
    f.raf = requestAnimationFrame(step);
  }

  stopFollow() {
    const f = this.follow;
    if (!f) return;
    this.follow = null;
    cancelAnimationFrame(f.raf);
    window.removeEventListener('wheel', f.stop);
    window.removeEventListener('touchstart', f.stop);
  }

  // -------------------------------------------------------------------------
  // Режимы и тема
  // -------------------------------------------------------------------------

  setMode(mode, { silent = false } = {}) {
    if (this.options.readOnly) mode = 'view';   // только просмотр: в правку не пускаем
    else if (mode !== 'view' || this.options.previewMode === false) mode = 'edit';
    if (mode === this.mode) return;
    this.popover.close();
    this.blockMenu.closePicker();
    this.tooltip.hide();

    if (mode === 'view') {
      this.flush();
      this.handle.hideGutter();
      this.handle.setFocused(null);
      this.handle.syncItem();
      this.handle.select(null);
      this.preview.render(this.getInnerHTML());
      this.canvas.hidden = true;
      this.preview.show();
      if (!silent && this.options.onSave && this.lastHTML !== this.savedHTML) {
        this.persist(this.lastHTML).then(() => this.toast('Сохранено'), () => this.toast('Не удалось сохранить'));
      }
    } else {
      this.preview.hide();
      this.canvas.hidden = false;
      if (!silent) this.focus();
    }
    this.mode = mode;
    this.handle.syncItem();
    this.ui.dataset.mode = mode;
    this.state.mode = mode;
    this.toolbar.update(this.state);
    if (!silent && this.options.onModeChange) this.options.onModeChange(mode, this);
    this.ui.dispatchEvent(new CustomEvent('ted:mode', { bubbles: true, detail: { mode, editor: this } }));
  }

  /** «Очистить всё»: документ становится одним пустым абзацем; отмена — в тосте или Ctrl+Z. */
  clearAll() {
    if (this.mode !== 'edit') return;
    const was = !!(this.editable.textContent.trim() || this.editable.querySelector(['pre, table, img', objectSelector()].filter(Boolean).join(', ')));
    this.popover.close();
    this.history.commit();
    this.handle.setFocused(null);
    this.handle.syncItem();
    this.handle.select(null);
    this.handle.hideGutter();
    this.editable.replaceChildren(emptyBlock(document, 'p'));
    normalizeRoot(this.editable);
    this.focus();
    placeCaret(this.editable.firstElementChild);
    this.afterChange({ immediate: true });
    if (was) this.toast('Всё очищено', { undo: true });
  }

  /**
   * Единая отправка в onSave. Снимок html фиксируется в момент вызова, запросы идут по очереди,
   * «сохранённым» версия становится только после успеха (при отказе повторный выход в просмотр отправит снова).
   * Если пока шёл запрос текст изменился, черновик с более свежим текстом не стирается.
   */
  persist(html) {
    if (!this.options.onSave) return Promise.resolve(false);
    if (this.inflightHTML === html && this.saveQueue) return this.saveQueue;   // тот же текст уже отправляется
    const run = () => {
      let res;
      try { res = Promise.resolve(this.options.onSave(html, this)); } catch (e) { res = Promise.reject(e); }
      return res.then(() => {
        this.cleanupMedia(this.savedHTML, html);
        this.history.reset();   // после сохранения Ctrl+Z не возвращает то, что уже убрано с сервера (удалённые файлы)
        this.savedHTML = html;
        this.baseHTML = html;
        this.presence?.saved();   // другим вкладкам с этим документом — «здесь сохранили»
        if (this.lastHTML === html) this.clearDraft(); else this.writeDraft(this.lastHTML);
        return true;
      });
    };
    this.inflightHTML = html;
    // первый запрос уходит сразу, следующие — после завершения предыдущего
    const queue = this.saving ? this.saveQueue.catch(() => {}).then(run) : run();
    this.saving = (this.saving || 0) + 1;
    const clear = () => { this.saving -= 1; if (this.saveQueue === queue) this.inflightHTML = null; };
    this.saveQueue = queue;
    queue.then(clear, clear);
    return queue;
  }

  /**
   * Файлы, которых после сохранения в документе больше нет, удаляются с сервера (upload.remove, тот же маршрут, что и загрузка).
   * До сохранения ничего не удаляется, поэтому Ctrl+Z возвращает файл. Файл, который нужен текущему тексту (загружен или возвращён, пока шло сохранение), не трогаем.
   */
  cleanupMedia(previousHTML, savedHTML) {
    const remove = this.options.upload && this.options.upload.remove;
    if (this.options.mediaSource === 'manager' || typeof remove !== 'function') { this.mediaUploaded.clear(); return; }
    const base = this.server.filesUrl;   // свои файлы — по адресу папки файлов из настроек сервера
    const live = filesOf(this.getInnerHTML(), base);
    const saved = filesOf(savedHTML, base);
    const candidates = new Set([...filesOf(previousHTML, base), ...[...this.mediaUploaded].filter((url) => url.startsWith(base + '/'))]);
    const gone = [...candidates].filter((url) => !saved.has(url) && !live.has(url));
    this.mediaUploaded = new Set([...this.mediaUploaded].filter((url) => live.has(url) && !saved.has(url)));
    if (!gone.length) return;
    Promise.resolve(remove(gone, { pagePath: mediaPagePath(this) })).catch(() => {});   // сбой удаления не мешает сохранению
  }

  /** Для обычной и AJAX-формы: CMS сама сообщает, что сервер принял данные. */
  markSaved() {
    this.flush();
    this.cleanupMedia(this.savedHTML, this.lastHTML);
    this.history.reset();
    this.savedHTML = this.lastHTML;
    this.baseHTML = this.lastHTML;
    this.clearDraft();
    this.toast('Сохранено');
    this.toolbar.update(this.state);
  }

  /** Сохранить: onSave(html) — результат по Promise; без него — отправка формы textarea (успех сообщает CMS через markSaved). */
  save({ force = false } = {}) {
    // в другой вкладке уже сохранили — сначала спрашиваем (22.11)
    if (!force && this.presence && this.presence.otherSaved) {
      this.toast('Документ сохранён в другой вкладке позже. Сохранить здесь и перезаписать те правки?', { action: 'Сохранить', onAction: () => this.save({ force: true }), timeout: 10000 });
      return;
    }
    if (this.options.previewMode !== false && this.mode === 'edit') return this.setMode('view');   // уход в просмотр сохраняет сам (onSave)
    this.flush();
    const html = this.getHTML();
    if (this.options.onSave) {
      this.persist(html).then(() => { this.toast('Сохранено'); this.toolbar.update(this.state); }, () => this.toast('Не удалось сохранить'));
    } else if (this.isTextarea && this.target.form) {
      // значение поля уже записано flush(); форму отправляет браузер, проверку полей делает он же, «Сохранено» не показываем
      this.presence?.saved();
      this.target.form.requestSubmit();
    } else {
      this.toast('Не задан onSave — сохранять некуда');
    }
  }

  toggleMode() {
    this.setMode(this.mode === 'edit' ? 'view' : 'edit');
  }

  /**
   * Только просмотр (доступ без права редактирования): true — уйти в просмотр и закрыть правку
   * (кнопки «Редактировать» нет, двойной клик и Ctrl+Shift+P не работают); false — вернуть правку.
   */
  setReadOnly(on) {
    if (!on && this.lockedReadOnly) return;   // нет права правки (сервер: canEdit false) или набор readonly — правку не возвращаем
    this.options.readOnly = !!on;
    if (on && this.mode === 'edit') this.setMode('view');
    this.toolbar.variant = null;   // набор кнопок просмотра зависит от readOnly
    this.toolbar.update(this.state);
  }

  /**
   * Набор (этап 2): сервер задаёт набор поля (server.preset) и право на правку (server.canEdit) — они главнее опций браузера.
   * Без сервера — опция preset. Набор задаёт блоки (blocks) и как открыться: 'edit', 'view' (просмотр на странице,
   * «Редактировать» включает правку) или 'readonly' (правки нет). Явная опция blocks / mode / preview в браузере
   * уточняет набор, только если набор задан в браузере, а не сервером.
   */
  applyPreset(given) {
    const o = this.options;
    const fromServer = !!this.server.preset;
    const name = this.server.preset || (typeof o.preset === 'string' ? o.preset : null);
    this.preset = null;
    if (name) {
      const def = presetOf(name, this.server.presets);
      if (!def) {
        console.warn(`Ted: нет набора «${name}», доступны: ${presetNames(this.server.presets).join(', ')}`);
      } else {
        this.preset = { name, ...def };
        if (fromServer || given.blocks === undefined) o.blocks = def.blocks === 'all' ? 'all' : def.blocks.slice();
        if (def.mode === 'readonly') o.readOnly = true;
        if (def.mode === 'view') {
          if (fromServer || given.mode === undefined) o.mode = 'view';
          if (given.preview === undefined) o.preview = 'inline';
        }
      }
    }
    this.lockedReadOnly = this.server.canEdit === false || (this.preset && this.preset.mode === 'readonly');
    if (this.lockedReadOnly) o.readOnly = true;
  }

  /**
   * Тема интерфейса: 'light' | 'dark' | 'auto'. 'auto' следует за темой админки — атрибутом data-theme на <html>
   * (Simflex: Admin\Page::getTheme(), этап 4); если атрибута нет — за темой системы (prefers-color-scheme).
   */
  setTheme(theme) {
    this.options.theme = theme;
    // смена темы — цвета перетекают (motion.css → .is-theming); первая установка — без анимации
    if (this._themed) {
      this.ui.classList.add('is-theming');
      clearTimeout(this._themingTimer);
      this._themingTimer = setTimeout(() => this.ui.classList.remove('is-theming'), 320);
    }
    this._themed = true;
    if (this._themeMq) {
      this._themeMq.removeEventListener('change', this._themeFn);
      this._themeMq = null;
    }
    if (this._themeMo) { this._themeMo.disconnect(); this._themeMo = null; }
    const root = document.documentElement;
    if (theme === 'auto' && root.hasAttribute('data-theme')) {
      const sync = () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        if (this.ui.dataset.tedTheme && this.ui.dataset.tedTheme !== next) {   // тема админки сменилась — тоже плавно
          this.ui.classList.add('is-theming');
          clearTimeout(this._themingTimer);
          this._themingTimer = setTimeout(() => this.ui.classList.remove('is-theming'), 320);
        }
        this.ui.dataset.tedTheme = next;
      };
      this._themeMo = new MutationObserver(sync);
      this._themeMo.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
      sync();
    } else if (theme === 'auto' && window.matchMedia) {
      this._themeMq = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeFn = () => { this.ui.dataset.tedTheme = this._themeMq.matches ? 'dark' : 'light'; };
      this._themeMq.addEventListener('change', this._themeFn);
      this._themeFn();
    } else {
      this.ui.dataset.tedTheme = theme === 'dark' ? 'dark' : 'light';
    }
  }

  focus() {
    if (this.mode !== 'edit') return;
    this.editable.focus();
    if (!getRange(this.editable)) {
      const first = this.editable.firstElementChild;
      if (first) placeCaret(first.tagName === 'UL' || first.tagName === 'OL' ? first.firstElementChild : first, false);
    }
  }

  /**
   * Уничтожить редактор: сохраняет изменения в textarea, снимает все слушатели и наблюдатели,
   * закрывает меню и окна, убирает подсветку кода и снимает редактор с реестра Ted. Повторный вызов безопасен.
   */
  /**
   * Верх области текста под липкими панелями (1.0.1): шапка сайта (--ted-sticky-top снаружи редактора) + липкая панель
   * редактора. Ставится на .ted-ui как --ted-sticky-top — его учитывают полоса прогресса «Содержания» (правка и просмотр)
   * и переход по якорям: полоса больше не прячется под панелью редактора.
   */
  syncStickyTop() {
    const outer = this.ui.parentElement ? parseFloat(getComputedStyle(this.ui.parentElement).getPropertyValue('--ted-sticky-top')) || 0 : 0;
    const bar = this.toolbar && this.toolbar.el.isConnected ? this.toolbar.el.offsetHeight : 0;
    this.ui.style.setProperty('--ted-sticky-top', `${outer + bar}px`);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopFollow();
    this.presence?.destroy();
    this.flush();
    this.popover.close();
    if (this.blockMenu) { this.blockMenu.close(); if (this.blockMenu.picker) this.blockMenu.closePicker(); }
    for (const d of this.disposers) d();
    this.disposers = [];
    if (this.handle) this.handle.destroy();
    for (const u of this.blockUis || []) if (u.destroy) u.destroy();
    if (this.toolbar) this.toolbar.destroy();
    if (this.preview && this.preview.destroy) this.preview.destroy();
    clearTimeout(this.changeTimer);
    clearTimeout(this.draftTimer);
    releaseEditorHighlight(this.editable);
    if (this._themeMq) this._themeMq.removeEventListener('change', this._themeFn);
    if (this._themeMo) this._themeMo.disconnect();
    if (this.toaster) this.toaster.destroy();
    this.ui.remove();
    if (this.isTextarea) this.target.style.display = '';
    if (this.target && this.target.__ted === this) delete this.target.__ted;
    if (this.registry) { const i = this.registry.indexOf(this); if (i >= 0) this.registry.splice(i, 1); }
  }

  // -------------------------------------------------------------------------
  // Выделение
  // -------------------------------------------------------------------------

  rememberSelection() {
    const r = getRange(this.editable);
    this.saved = r ? r.cloneRange() : null;
  }

  /**
   * Курсор обратно в текст после Esc в окне или меню (проверка 22.11): туда, где он был до окна; если того места уже нет
   * (блок заменён) — в начало строки под выбранным блоком. Если окно само поставило курсор (в заголовок баннера…) — не трогаем.
   */
  returnCaret(r) {
    setTimeout(() => {
      if (this.mode !== 'edit' || this.popover.isOpen || this.blockMenu?.picker) return;
      const active = document.activeElement;
      if (active === this.ui) return;   // успели нажать Esc ещё раз — пользователь выходит из текста к панели
      if (active && this.editable.contains(active) && active !== this.editable) return;   // поле в блоке
      if (active === this.editable && getRange(this.editable)) return;
      if (r && r.startContainer.isConnected && this.editable.contains(r.startContainer)) {
        this.editable.focus({ preventScroll: true });
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        const block = this.handle?.focused;
        const next = block && block.isConnected ? block.nextElementSibling : null;
        this.editable.focus({ preventScroll: true });
        if (next && !isObjectBlock(next)) placeCaret(next);
        else if (block && block.isConnected && isObjectBlock(block)) this.selectObject(block);
      }
      this.updateState();
    }, 0);
  }

  restoreRemembered() {
    if (this.mode !== 'edit') return;
    this.editable.focus({ preventScroll: true });
    if (this.saved && this.editable.contains(this.saved.startContainer)) {
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(this.saved);
    }
  }

  ensureRange() {
    let r = getRange(this.editable);
    if (!r) {
      this.restoreRemembered();
      r = getRange(this.editable);
    }
    if (!r) {
      this.focus();
      r = getRange(this.editable);
    }
    return r;
  }

  currentBlock() {
    return this.blockFromRange(this.fieldRange() || getRange(this.editable));
  }

  /** Фокус в поле внутри блока (поле товара): Firefox не переносит туда выделение документа — блок берём по полю. */
  fieldRange() {
    const a = document.activeElement;
    if (!a || a === this.editable || !this.editable.contains(a) || !a.matches('input, textarea, select')) return null;
    const r = document.createRange();
    r.selectNode(a);
    r.collapse(true);
    return r;
  }

  /**
   * Курсор в новый пустой абзац в конце статьи (сайт texted 27.11, 1.0.4): выбор в панели без курсора создаёт блок, а не меняет
   * первый. Пустой последний абзац (и единственный пустой в пустой статье) берётся сам — второй пустой не добавляем.
   */
  caretToNewBlock() {
    const last = this.editable.lastElementChild;
    let p = last && last.tagName === 'P' && !last.className && isEmptyBlock(last) ? last : null;
    if (!p) {
      p = emptyBlock(document);
      this.editable.appendChild(p);
    }
    this.editable.focus({ preventScroll: true });
    placeCaret(p);
    p.scrollIntoView({ block: 'nearest' });
    return p;
  }

  scheduleState() {
    if (this._stateFrame) return;
    this._stateFrame = requestAnimationFrame(() => {
      this._stateFrame = null;
      this.updateState();
      this.updatePlaceholders();
    });
  }

  updateState() {
    const r = getRange(this.editable);
    if (r) this.lastRange = r.cloneRange();   // последнее место курсора: меню, открытое с клавиатуры (Esc → Tab), знает, что красить
    const block = this.blockFromRange(this.fieldRange() || r);
    const type = blockType(block) || 'p';
    const inNode = (sel) => {
      if (!r) return false;
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      const found = n && n.closest(sel);
      return !!(found && this.editable.contains(found));
    };
    let marks = {};
    if (r) {
      try {
        marks = {
          // заголовки и так жирные — кнопку «Жирный» в них не подсвечиваем
          bold: /^h[2-6]$/.test(type) ? inNode('b, strong') : document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          // у ссылок тоже есть подчёркивание — проверяем сами теги
          underline: inNode('u'),
          strike: inNode('s, strike, del'),
        };
      } catch (e) { /* старые браузеры */ }
      marks.code = inNode('code');
      marks.link = inNode('a');
    }
    const startMenu = this.blockMenu.isOpen && this.blockMenu.mode === 'slash' && this.editable.textContent.trim() === '/';
    Object.assign(this.state, {
      type: kindOf(block) || type,
      align: alignOfBlock(block),
      // фон и цвет части (карточка плюсов или минусов), если блок их так разделяет (bgPart / tcPart → элемент)
      bg: (() => {
        const d = block && defOf(block);
        const part = r && d && d.bgPart ? d.bgPart(block, r.startContainer) : null;
        const own = bgOfBlock(part) || bgOfBlock(block);   // фон части, иначе всего блока
        if (own || !d) return own;
        const v = d.defaultBg;   // своя плашка блока или части (цифры, выноска, карточка плюсов…) — отмечена в меню (28.11)
        return (typeof v === 'function' ? v(part || block) : v) || '';
      })(),
      // цвет текста под курсором: выделение в mark ted-tc-* или класс блока (меню «Цвет» → «Текст»)
      tc: (() => { const el = r && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode); const m = el && el.closest && el.closest('mark[class*="ted-tc-"]'); const c = m && this.editable.contains(m) && (m.className.match(/ted-tc-([a-z0-9]+)/) || [])[1]; if (c) return c; const d = block && defOf(block); const part = r && r.collapsed && d && d.tcPart ? d.tcPart(block, r.startContainer) : null; return (part && part.nodeType === 1 ? tcOfBlock(part) : '') || tcOfBlock(block) || 'gray'; })(),
      canTc: tcAllowed(block),
      anchor: !!(block && block.id),
      marks,
      hasSelection: !!(r && !r.collapsed && r.toString().trim()),
      canEdit: type !== 'raw' && !isObjectType(type),
      mode: this.mode,
      focused: this.isFocused() && !startMenu,
      // курсор в заголовке шага, карточки плюсов-минусов, названии вкладки или заголовке выноски: «Жирный» там не действует
      // (заголовок уже жирный по виду блока; решение 22.11 — у вкладок и выноски выбора «жирный / нет» нет)
      stepTitle: !!(r && this.boldLocked(r.startContainer)),
      // блок внутри тела контейнера (ответ аккордеона): цветного фона там нет
      inHost: !!(block && block.parentNode && block.parentNode.nodeType === 1 && block.parentNode.classList.contains('ted-ui-host')),
    });
    // кнопки блока (⠿ 🗑) у блока с курсором
    // у пустого блока ручек нет — перетаскивать и удалять нечего
    // правка блока, которой нужно раньше кнопок блока (таблица: когда курсор уходит из таблицы, под ней убирается место под
    // «Добавить …», блоки ниже сдвигаются, и кнопки блока считаются уже по новому положению)
    for (const u of this.blockUis) if (u.syncFirst) u.syncFirst();
    // кнопки блока — у блока с курсором; в теле контейнера (ответ аккордеона, вкладка, колонка) — у внутреннего блока,
    // как у обычного (решение 22.11); курсор в части самого контейнера (вопрос, название вкладки) — у контейнера
    const topBlock = block && this.editable.contains(block) ? block : null;
    // кнопка, которую правят в окне «Настройки кнопки», — курсора в ней нет, но кнопки блока (⠿ 🗑) у неё, как в макете
    const btnBlock = this.blockUis.map((u) => (u.focusBlock ? u.focusBlock() : null)).find(Boolean) || null;
    if (this.mode === 'edit') this.handle.setFocused(btnBlock || (this.state.focused && topBlock ? topBlock : null));
    this.handle.syncItem();
    for (const u of this.blockUis) if (u.sync && !u.syncFirst) u.sync();
    for (const u of this.blockUis) if (u.afterSync) u.afterSync();   // ширина кнопок блока могла измениться (якорь) — кнопки столбца таблицы не наезжают на них
    this.toolbar.update(this.state);
  }

  /** Курсор в редакторе или фокус в его поповере (поиск блоков, поле ссылки). */
  isFocused() {
    const a = document.activeElement;
    if (a === this.editable) return !!getRange(this.editable);
    return !!(a && this.popover.el && this.popover.el.contains(a) && this.saved);
  }

  /** Язык интерфейса ('ru' | 'en'): переводит уже показанную панель и окна, запоминает выбор (22.11). */
  setLang(lang) {
    const now = setLang(lang);
    try { localStorage.setItem('ted-lang', now); } catch (e) { /* без запоминания */ }
    this.popover.close();
    relabel(this.ui);
    this.ui.setAttribute('lang', now);
    this.updatePlaceholders();
    this.updateState();
    return now;
  }

  get lang() { return getLang(); }

  /** Короткое сообщение (тостер из дизайн-системы). opts: { undo, action, onAction, timeout } */
  toast(text, opts = {}) {
    if (this.options.toasts === false) return null;
    if (!this.toaster) this.toaster = new Toaster();
    let { action = null, onAction = null } = opts;
    if (opts.undo) {
      // «Отменить» работает, пока после действия не было других правок
      const mark = this.history.index;
      action = 'Отменить';
      onAction = () => { if (this.history.index === mark) this.history.undo(); };
    }
    // по центру видимой части редактора, а не окна: в админке с боковым меню уведомление не уезжает на меню (проверка 22.11)
    const r = this.ui.getBoundingClientRect();
    const l = Math.max(r.left, 0);
    const rt = Math.min(r.right, window.innerWidth);
    this.toaster.stack.style.left = rt > l ? `${Math.round((l + rt) / 2)}px` : '';
    return this.toaster.show(t(text), { action: t(action), onAction, timeout: opts.timeout, status: opts.status, dark: this.ui.dataset.tedTheme === 'dark' });
  }

  lastBlock() {
    return this.editable.lastElementChild;
  }

  chooseMedia(kind, options) {
    return chooseMedia(this, kind, options);
  }

  /** Выделить блок без текста (линия, HTML-блок) целиком. */
  selectObject(block) {
    this.editable.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNode(block);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    this.scheduleState();
  }

  /** Блок, который сейчас в правке (с курсором или выделенный целиком). */
  blockFromRange(r) {
    if (!r) return null;
    if (r.startContainer === this.editable) {
      return this.editable.childNodes[r.startOffset] || this.editable.lastElementChild;
    }
    // курсор между блоками тела контейнера (ответ аккордеона)
    if (r.startContainer.nodeType === 1 && r.startContainer.classList.contains('ted-ui-host')) {
      return r.startContainer.childNodes[r.startOffset] || r.startContainer.lastElementChild;
    }
    return topBlockOf(this.editable, r.startContainer);
  }

  updatePlaceholders() {
    const ed = this.editable;
    for (const el of ed.querySelectorAll('[data-tedui-ph]')) el.removeAttribute('data-tedui-ph');
    for (const el of ed.querySelectorAll('[data-tedui-phline]')) el.removeAttribute('data-tedui-phline');
    const r = getRange(ed);
    let current = null;
    if (r) {
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      // блок внутри тела контейнера (аккордеон, вкладки, колонки) — сам, а не весь контейнер
      let inHost = n;
      while (inHost && inHost !== ed && !(inHost.parentNode && isHost(inHost.parentNode) && ed.contains(inHost.parentNode))) inHost = inHost.parentNode;
      if (inHost === ed) inHost = null;
      current = (n.closest && n.closest('li, blockquote > p')) || inHost || topBlockOf(ed, r.startContainer);
      if (current && !ed.contains(current)) current = null;
    }
    // До ввода показываем подсказку в единственном абзаце пустого документа.
    // Если курсор уже в абзаце, подсказка следует за ним.
    const paragraphs = ed.querySelectorAll(':scope > p');
    const only = !current && paragraphs.length === 1 && !ed.textContent.trim() ? paragraphs[0] : null;
    // блок кода: заглушки «Выберите язык» (шапка) и «// Вставьте или напишите код» (тело) рисует CSS по признаку data-tedui-empty
    for (const pre of ed.querySelectorAll(':scope > pre')) pre.toggleAttribute('data-tedui-empty', isEmptyBlock(pre));
    for (const el of ed.children) {
      const t = blockType(el);
      if (t === 'pre') continue;
      if (!isEmptyBlock(el)) continue;
      // у списка и цитаты подсказка ставится на пункт / абзац внутри, а не на весь блок
      if (t === 'ul' || t === 'ol' || t === 'blockquote') continue;
      if (/^h[2-6]$/.test(t) || el === current || el === only) {
        const bgText = /ted-bg-/.test(el.className) ? 'Текст на цветном фоне' : null;
        const text = bgText || (t === 'p' && this.options.placeholder ? this.options.placeholder : (placeholderOf(t) || placeholderOf('p')));
        el.setAttribute('data-tedui-ph', text);
      }
    }
    // шаги: заглушки «Шаг» / «Описание шага», пока заголовок или описание пусты
    for (const li of ed.querySelectorAll('ol.ted-steps > li, ul.ted-facts > li, blockquote > p.ted-author')) {
      const title = li.firstElementChild;
      const noTitle = !(title && title.textContent.replace(/​/g, '').trim());
      li.removeAttribute('data-tedui-ph');
      li.toggleAttribute('data-tedui-notitle', noTitle);
      li.toggleAttribute('data-tedui-nodesc', !this.stepDescription(li).trim() && !li.querySelector('br:nth-of-type(2)'));
    }
    // плюсы и минусы: заглушки в пустых заголовках и пунктах
    for (const card of ed.querySelectorAll('ul.ted-proscons > li')) {
      const title = card.firstElementChild;
      card.toggleAttribute('data-tedui-notitle', !(title && title.textContent.replace(/​/g, '').trim()));
      // заглушка «Пункт» — пока в карточке нет ни одного заполненного пункта или курсор стоит в этом пункте;
      // пустые «хвосты» после заполненных пунктов не светятся серым (при сохранении они отбрасываются)
      const items = Array.from(card.querySelectorAll(':scope > ul > li'));
      const filled = items.some((i) => i.textContent.replace(/​/g, '').trim());
      for (const item of items) {
        item.removeAttribute('data-tedui-ph');
        const isEmpty = !item.textContent.replace(/​/g, '').trim();
        item.toggleAttribute('data-tedui-empty', isEmpty && (!filled || item === current));
        item.toggleAttribute('data-tedui-tail', isEmpty && filled && item !== current);
      }
    }
    // заглушки пустых частей блоков из реестра (block.js → placeholders(editor, root))
    for (const d of registeredBlocks()) if (d.placeholders) d.placeholders(this, ed);
    this.refreshCode();
    // «Добавить блок» — только если последний блок уже заполнен
    const last = ed.lastElementChild;
    // строка скрывается плавно (высота и прозрачность), а не пропадает рывком
    // под пустой строкой (абзац, заголовок) «+» не нужен — в ней и так пишут; под пустыми вкладками, аккордеоном, колонками,
    // медиа — нужен: иначе после них блок не добавить (сайт texted 27.11, 1.0.4)
    const hideAdd = !last || (isEmptyBlock(last) && /^(P|H[2-6])$/.test(last.tagName));
    this.addBlock.classList.toggle('is-hidden', hideAdd);
    this.addBlock.setAttribute('aria-hidden', hideAdd ? 'true' : 'false');
    this.addBlock.tabIndex = hideAdd ? -1 : 0;
    // новая пустая строка внутри блока, где стоит курсор, — тоже с заглушкой (решение 22.11): блок внутри контейнера — как
    // абзац документа (там работает «/»); абзац выноски — block.json → linePlaceholder; пункт — «Пункт»
    if (current && current.parentNode !== ed && isEmptyBlock(current) && !current.hasAttribute('data-tedui-ph')) {   // topBlockOf видит блок в теле контейнера блоком
      const host = current.parentNode && isHost(current.parentNode);
      const top = rootBlockOf(ed, current);
      const def = top ? defOf(top) : null;
      const skip = !host && current.closest(['ol.ted-steps, ul.ted-facts, ul.ted-proscons, p.ted-author', ...registeredBlocks().filter((d) => d.placeholders && !d.container && !d.linePlaceholder).map((d) => d.selector)].join(', '));
      if (!skip) {
        const t = blockType(current);
        const text = current.tagName === 'LI' ? (current.closest('ul.ted-checklist') ? 'Пункт' : placeholderOf('li'))
          : host ? (t === 'p' && this.options.placeholder ? this.options.placeholder : (placeholderOf(t) || placeholderOf('p')))
          : (def && def.linePlaceholder) || placeholderOf('blockquote');
        current.setAttribute('data-tedui-ph', text);
      }
    }
    // заглушки блоков записаны по-русски — показываем на языке редактора (1.0.2)
    if (getLang() !== 'ru') for (const el of ed.querySelectorAll('[data-tedui-ph]')) el.setAttribute('data-tedui-ph', t(el.getAttribute('data-tedui-ph')));
    this.lineHolder(r, current);
  }

  /**
   * Пустая строка внутри непустого абзаца (Enter в цветном фоне — перенос строки) или кода, где стоит курсор:
   * заглушка этого блока лежит в начале строки (data-tedui-phline, место — --ted-ph-x / --ted-ph-y от курсора).
   */
  lineHolder(r, current) {
    if (!r || !r.collapsed || this.mode !== 'edit') return;
    const n = r.startContainer;
    const el = (n.nodeType === 1 ? n : n.parentNode).closest('pre > code, p');   // у пункта ::before занят (чек-лист), заголовки — одна строка
    if (!el || !this.editable.contains(el) || isEmptyBlock(el) || el.hasAttribute('data-tedui-ph')) return;
    const isPre = el.tagName === 'CODE';
    // строка пуста: слева от курсора — начало или перенос, справа — конец или перенос
    const before = document.createRange();
    before.setStart(el, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const after = document.createRange();
    after.setStart(r.startContainer, r.startOffset);
    after.setEnd(el, el.childNodes.length);
    const lineOf = (range, end) => {
      const frag = range.cloneContents();
      for (const br of frag.querySelectorAll('br')) br.replaceWith('\n');
      const text = frag.textContent.replace(/​/g, '');
      const parts = text.split('\n');
      return end ? parts[parts.length - 1] : parts[0];
    };
    const beforeText = before.cloneContents();
    const hasBreakBefore = beforeText.querySelector('br') || beforeText.textContent.includes('\n');
    if (!hasBreakBefore || lineOf(before, true) !== '' || lineOf(after, false) !== '') return;
    const top = topBlockOf(this.editable, el);
    const def = top ? defOf(top) : null;
    const text = isPre ? (placeholderOf('pre') || 'Код')
      : /ted-bg-/.test(el.className) ? 'Текст на цветном фоне'
      : (def && def.linePlaceholder) || placeholderOf(blockType(el)) || placeholderOf('p');
    let rect = r.getBoundingClientRect();
    if (!rect.height) {
      const next = r.startContainer.childNodes ? r.startContainer.childNodes[r.startOffset] : null;
      if (next && next.nodeType === 1) rect = next.getBoundingClientRect();
    }
    const box = el.getBoundingClientRect();
    if (isPre) {
      // код не переносит строки: строка = число переносов до курсора, слева — начало текста
      const cs = getComputedStyle(el);
      const lh = parseFloat(cs.lineHeight) || 20;
      const line = (beforeText.textContent.match(/\n/g) || []).length;
      rect = { left: box.left + (parseFloat(cs.paddingLeft) || 0), top: box.top + (parseFloat(cs.paddingTop) || 0) + line * lh, height: lh };
    }
    if (!rect.height) return;
    // место — переменными на поле правки (наследуются), чтобы не писать style в содержимое
    this.editable.style.setProperty('--ted-ph-x', `${Math.round(rect.left - box.left)}px`);
    this.editable.style.setProperty('--ted-ph-y', `${Math.round(rect.top - box.top)}px`);
    el.setAttribute('data-tedui-phline', t(text));
  }

  // -------------------------------------------------------------------------
  // Команды
  // -------------------------------------------------------------------------

  exec(cmd) {
    if (cmd === 'save') return this.save();
    if (cmd === 'blockmenu' || cmd === 'moveup' || cmd === 'movedown') {   // блок с курсором — без мыши (доступность, 22.11)
      const block = this.handle.focused || this.currentBlock();
      if (!block) return;
      if (cmd === 'blockmenu') { this.handle.openMenu(block, this.handle.ctrlGrip); this.popover.el?.querySelector('.ted-ui-item')?.classList.add('is-focus'); return; }
      this.handle.moveBy(block, cmd === 'moveup' ? -1 : 1);
      return;
    }
    if (cmd === 'mode') return this.toggleMode();
    if (this.mode !== 'edit') return;
    if (cmd === 'undo') { this.history.undo(); return; }
    if (cmd === 'redo') { this.history.redo(); return; }
    if (cmd === 'help') return this.toolbar.openHelp();
    if (cmd === 'link') return this.openLink();
    if (cmd === 'anchor') return this.openAnchor();
    if (cmd === 'format') return this.formatText();

    const r = this.ensureRange();
    if (!r) return;
    const type = blockType(topBlockOf(this.editable, r.startContainer));

    if (EXEC_MARKS[cmd]) {
      if (type === 'pre') return;
      // заголовок шага — это <strong>: «Жирный» снимал бы сам заголовок, поэтому в нём команда не действует (и в названии вкладки, заголовке выноски)
      if (cmd === 'bold' && (this.boldLocked(r.startContainer) || /^h[2-6]$/.test(type))) return;   // и в заголовке h2–h6 — он уже жирный (1.0.4)
      this.history.commit();
      document.execCommand(EXEC_MARKS[cmd], false, null);
      this.afterChange({ immediate: true });
      return;
    }
    if (cmd === 'code') return this.toggleInlineCode();
    if (cmd.startsWith('insert:')) return this.insertBlock(cmd.slice(7));   // горячая клавиша блока из реестра (block.json → hotkey)

    if (cmd.startsWith('block:')) {
      if (!blockAllowed(this.allowedBlocks, cmd.slice(6))) return;   // блок отключён опцией blocks
      // блок без «Превратить в…» (товар, цифры, плюсы-минусы: block.json → menu.convert: false) стилем текста не меняется (проверка 22.11)
      const list = selectedBlocks(this.editable).filter(blockCanConvert);
      if (!list.length) return;
      this.history.commit();
      convertBlocks(this.editable, list, cmd.slice(6));
      normalizeRoot(this.editable);
      this.afterChange({ immediate: true });
      return;
    }
    if (cmd === 'color:reset') return this.resetColor();
    if (cmd.startsWith('tc:')) return this.applyTc(cmd.slice(3));
    if (cmd.startsWith('bg:')) return blockAllowed(this.allowedBlocks, 'background') ? this.applyBg(cmd.slice(3)) : undefined;
    if (cmd.startsWith('align:')) {
      this.history.commit();
      setAlign(selectedBlocks(this.editable), cmd.slice(6));
      this.afterChange({ immediate: true });
    }
  }

  /**
   * Цветной фон. Выделен фрагмент внутри одного блока — подложка только под ним (<mark class="ted-bg-…">, как у кода);
   * курсор, весь блок или несколько блоков — подложка у блока. name '' — убрать фон.
   */
  /**
   * Цвет текста (1.0.4): часть текста в одном блоке — <mark class="ted-tc-…">, иначе — класс ted-tc-… у блоков.
   * 'gray' (Стандартный) снимает цвет; внутри цветного блока выделенная часть становится стандартной (mark ted-tc-gray).
   */
  applyTc(name) {
    // выбран блок без курсора (баннер, товар): красится он
    const obj = this.pickedObject();
    if (obj) {
      if (!tcAllowed(obj)) return;
      this.history.commit();
      setTc([obj], name === 'gray' ? '' : name);
      this.afterChange({ immediate: true });
      return;
    }
    const r = this.ensureRange();
    if (!r) return;
    const ed = this.editable;
    // выделение через несколько блоков (и «Выделить всё»): красятся те, где цвет текста есть; код, медиа, карточки пропускаются
    const block = topBlockOf(ed, r.startContainer === ed ? ed.childNodes[r.startOffset] || ed.firstChild : r.startContainer);
    const targets = selectedBlocks(ed).filter((b) => tcAllowed(b));
    if (!targets.length && !(block && tcAllowed(block))) return;
    const SEL = 'mark[class*="ted-tc-"]';
    const unwrap = (marks) => { if (marks.length) withMarkers(ed, () => marks.forEach((m) => m.replaceWith(...m.childNodes))); };
    const marksIn = (root) => Array.from(root.querySelectorAll(SEL));
    // курсор без выделения в части блока, которая красится отдельно (вопрос, название вкладки, заголовок или описание шага):
    // блок отдаёт её диапазон (block.json → tcPart, 1.0.4)
    const bd = block && defOf(block);
    const part = r.collapsed && block && tcAllowed(block) && bd && bd.tcPart ? bd.tcPart(block, r.startContainer) : null;
    if (part && part.nodeType === 1) {   // часть-элемент (карточка плюсов или минусов): класс на ней
      this.history.commit();
      for (const n of TC_NAMES) part.classList.remove(`ted-tc-${n}`);
      if (name && name !== 'gray') part.classList.add(`ted-tc-${name}`);
      this.afterChange({ immediate: true });
      return;
    }
    const rr = part || r;
    const sameBlock = block === topBlockOf(ed, r.endContainer);
    const text = rr.toString();
    const partial = !!part || (!!block && tcAllowed(block) && !r.collapsed && sameBlock && !!text.trim() && text.trim() !== block.textContent.trim());
    const startEl = rr.startContainer.nodeType === 1 ? rr.startContainer : rr.startContainer.parentNode;
    const inMark = part ? null : startEl.closest(SEL);
    const plain = name === 'gray' || !name;
    this.history.commit();
    if (partial) {
      if (part) unwrap(marksIn(block).filter((m) => rr.intersectsNode(m)));
      if (plain && !tcOfBlock(block)) {
        unwrap(marksIn(block).filter((m) => rr.intersectsNode(m)));
      } else if (inMark && ed.contains(inMark) && inMark.contains(r.endContainer)) {
        inMark.className = `ted-tc-${plain ? 'gray' : name}`;
      } else {
        const frag = rr.extractContents();
        frag.querySelectorAll(SEL).forEach((m) => m.replaceWith(...m.childNodes));
        const mark = document.createElement('mark');
        mark.className = `ted-tc-${plain ? 'gray' : name}`;
        mark.appendChild(frag);
        rr.insertNode(mark);
        block.normalize();
        const sel = document.getSelection();
        const nr = document.createRange();
        nr.selectNodeContents(mark);
        sel.removeAllRanges();
        sel.addRange(nr);
      }
    } else {
      const blocks = targets.length ? targets : [block];
      setTc(blocks, plain ? '' : name);
      blocks.forEach((b) => unwrap(marksIn(b)));   // весь блок одного цвета — прежние цвета частей снимаются
    }
    this.afterChange({ immediate: true });
  }

  /**
   * Предпросмотр цвета (меню «Цвет», наведение на точку — заказчик 28.11): то, что поменяется, сразу примеряет цвет —
   * блок или часть (карточка) — временным классом, кусок текста (выделение, заголовок шага, вопрос) — подсветкой
   * CSS Highlight. В HTML и историю ничего не попадает; clearPreview() возвращает как было.
   */
  /** Плавная смена цвета (CSS .is-recoloring) на время примерки и применения. */
  smoothRecolor() {
    this.editable.classList.add('is-recoloring');
    clearTimeout(this.recolorTimer);
    this.recolorTimer = setTimeout(() => this.editable.classList.remove('is-recoloring'), 400);
  }

  previewColor(cmd) {
    this.smoothRecolor();
    this.clearPreview();
    if (cmd === 'color:reset') {   // примерка «Сбросить цвет»: классы цвета снимаются, покрашенные слова — без цвета (data-tedui-pv)
      const els = this.colorSection();
      const saved = els.map((el) => [el, el.getAttribute('class')]);
      for (const el of els) for (const c of Array.from(el.classList)) if (/^ted-(tc|bg)-/.test(c)) el.classList.remove(c);
      const marks = els.flatMap((el) => Array.from(el.querySelectorAll('mark[class*="ted-tc-"], mark[class*="ted-bg-"]')));
      marks.forEach((m) => m.setAttribute('data-tedui-pv', ''));
      this.colorPreview = { saved, hl: null, marks };
      return;
    }
    const [kind, name] = String(cmd).split(':');
    const isTc = kind === 'tc';
    const NAMES = isTc ? TC_NAMES : BG_NAMES;
    const prefix = isTc ? 'ted-tc-' : 'ted-bg-';
    const can = (b) => (isTc ? tcAllowed(b) : bgAllowed(b));
    const els = [];
    let range = null;
    const obj = this.pickedObject();
    if (obj) {
      const od = defOf(obj) || {};
      if (isTc ? od.canTc && od.canTc(obj) : od.canBg && od.canBg(obj)) els.push(obj);
    } else {
      const r = getRange(this.editable);
      if (!r) return;
      const ed = this.editable;
      const block = topBlockOf(ed, r.startContainer === ed ? ed.childNodes[r.startOffset] || ed.firstChild : r.startContainer);
      const d = block && defOf(block);
      let part = null;
      if (r.collapsed && block && d) {
        if (isTc && d.tcPart && tcAllowed(block)) part = d.tcPart(block, r.startContainer);
        if (!isTc && d.bgPart) part = d.bgPart(block, r.startContainer);
      }
      const sameBlock = !!block && block === topBlockOf(ed, r.endContainer);
      const text = r.toString().trim();
      if (part && part.nodeType === 1) els.push(part);
      else if (part) range = part;
      else if (!r.collapsed && sameBlock && text && text !== block.textContent.trim() && can(block)) range = r.cloneRange();
      else els.push(...selectedBlocks(ed).filter(can));
      if (!els.length && !range && block && can(block)) els.push(block);
    }
    const saved = els.map((el) => [el, el.getAttribute('class')]);
    for (const el of els) {
      for (const n of NAMES) el.classList.remove(prefix + n);
      if (NAMES.includes(name) && !(isTc && name === 'gray')) el.classList.add(prefix + name);
    }
    let hl = null;
    if (range && typeof Highlight !== 'undefined' && window.CSS && CSS.highlights) {
      hl = `ted-pv-${kind}-${name}`;
      CSS.highlights.set(hl, new Highlight(range));
    }
    this.colorPreview = { saved, hl };
  }

  clearPreview() {
    const p = this.colorPreview;
    if (!p) return;
    this.smoothRecolor();
    this.colorPreview = null;
    for (const [el, cls] of p.saved) {
      if (cls == null) el.removeAttribute('class');
      else el.setAttribute('class', cls);
    }
    if (p.hl && window.CSS && CSS.highlights) CSS.highlights.delete(p.hl);
    if (p.marks) p.marks.forEach((m) => m.removeAttribute('data-tedui-pv'));
  }

  /**
   * Секция для «Сбросить цвет» (заказчик 28.11): выбранный блок без курсора, карточка (часть, bgPart) вместе с её блоком,
   * иначе блоки под выделением или блок с курсором.
   */
  colorSection() {
    const obj = this.pickedObject();
    if (obj) return [obj];
    const r = getRange(this.editable);
    if (!r) return [];
    const ed = this.editable;
    const block = topBlockOf(ed, r.startContainer === ed ? ed.childNodes[r.startOffset] || ed.firstChild : r.startContainer);
    const d = block && defOf(block);
    const part = r.collapsed && d && d.bgPart ? d.bgPart(block, r.startContainer) : null;
    if (part) return [part, block];
    const list = selectedBlocks(ed);
    return list.length ? list : (block ? [block] : []);
  }

  /** «Сбросить цвет»: у секции снимаются цвет текста и фон — и у блока, и у покрашенных слов внутри (Ctrl+Z вернёт). */
  resetColor() {
    const els = this.colorSection();
    if (!els.length) return;
    this.history.commit();
    const ed = this.editable;
    const marks = els.flatMap((el) => Array.from(el.querySelectorAll('mark[class*="ted-tc-"], mark[class*="ted-bg-"]')));
    if (marks.length) withMarkers(ed, () => marks.forEach((m) => { if (m.isConnected) m.replaceWith(...m.childNodes); }));
    for (const el of els) {
      for (const c of Array.from(el.classList)) if (/^ted-(tc|bg)-/.test(c)) el.classList.remove(c);
      if (!el.className) el.removeAttribute('class');
    }
    this.afterChange({ immediate: true });
  }

  /** Выбранный ручкой блок без курсора внутри (разделитель, кнопка, товар, медиа) — его красит меню «Цвет», 1.0.4. */
  pickedObject() {
    const b = this.handle && this.handle.focused;
    if (!b || !this.editable.contains(b)) return null;
    const r = getRange(this.editable);
    if (r && b.contains(r.startContainer) && b.isContentEditable !== false && b.getAttribute('contenteditable') !== 'false' && !isObjectBlock(b)) return null;
    return isObjectBlock(b) || b.getAttribute('contenteditable') === 'false' ? b : null;
  }

  applyBg(name) {
    const obj = this.pickedObject();
    if (obj) {
      const od = defOf(obj) || {};
      if (!(od.canBg && od.canBg(obj)) || !bgAllowed(obj)) return;   // фон у блока без курсора — только если он его разрешил
      this.history.commit();
      setBg([obj], name);
      this.afterChange({ immediate: true });
      return;
    }
    const r = this.ensureRange();
    if (!r) return;
    const ed = this.editable;
    const block = topBlockOf(ed, r.startContainer);
    if (!block || !bgAllowed(block)) return;
    const bpd = defOf(block);
    const bpart = r.collapsed && bpd && bpd.bgPart ? bpd.bgPart(block, r.startContainer) : null;
    if (bpart) {   // фон части блока (карточка плюсов или минусов), 1.0.4
      this.history.commit();
      for (const n of BG_NAMES) bpart.classList.remove(`ted-bg-${n}`);
      if (BG_NAMES.includes(name)) bpart.classList.add(`ted-bg-${name}`);
      this.afterChange({ immediate: true });
      return;
    }
    // блок без строчного оформления (block.json → toolbar.marks: []) красится только целиком
    const wholeOnly = Array.isArray(((defOf(block) || {}).toolbar || {}).marks) && !defOf(block).toolbar.marks.length;
    const unwrap = (marks) => { if (marks.length) withMarkers(ed, () => marks.forEach((m) => m.replaceWith(...m.childNodes))); };
    const marksIn = (root) => Array.from(root.querySelectorAll('mark[class*="ted-bg-"]'));
    const sameBlock = block === topBlockOf(ed, r.endContainer);
    const text = r.toString();
    const partial = !wholeOnly && !r.collapsed && sameBlock && !!text.trim() && text.trim() !== block.textContent.trim();
    const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const inMark = startEl.closest('mark[class*="ted-bg-"]');

    this.history.commit();
    if (partial) {
      if (!name) {
        unwrap(marksIn(block).filter((m) => r.intersectsNode(m)));
      } else if (inMark && ed.contains(inMark) && inMark.contains(r.endContainer)) {
        inMark.className = `ted-bg-${name}`;
      } else {
        const frag = r.extractContents();
        frag.querySelectorAll('mark[class*="ted-bg-"]').forEach((m) => m.replaceWith(...m.childNodes));
        const mark = document.createElement('mark');
        mark.className = `ted-bg-${name}`;
        mark.appendChild(frag);
        r.insertNode(mark);
        block.normalize();
        const sel = document.getSelection();
        const nr = document.createRange();
        nr.selectNodeContents(mark);
        sel.removeAllRanges();
        sel.addRange(nr);
      }
    } else {
      const blocks = selectedBlocks(ed);
      setBg(blocks, name);
      if (!name || !sameBlock) blocks.forEach((b) => unwrap(marksIn(b)));
      else if (inMark && !r.collapsed) unwrap([inMark]);
    }
    this.afterChange({ immediate: true });
  }

  /**
   * ✨ «Форматировать текст»: типографика (кавычки, тире, пробелы, неразрывные пробелы) для русского и английского.
   * Есть выделение / курсор в тексте — только выбранные блоки, иначе весь документ. Отменяется Ctrl+Z.
   */
  formatText() {
    const ed = this.editable;
    const r = this.isFocused() ? getRange(ed) : null;
    const all = Array.from(ed.children);
    // выделен текст — только эти блоки; просто курсор (ничего не выделено) — вся статья: раньше курсор в одном блоке ограничивал
    // проверку им, и ✨ отвечал «Текст уже в порядке», хотя править было что (сайт texted 27.11, 1.0.4)
    const idx = (r && !r.collapsed ? selectedBlocks(ed) : all).map((b) => all.indexOf(b)).filter((i) => i >= 0);
    const cfg = this.options.typograf || {};
    registerYo(cfg.yo);
    const protect = protectRegExp(cfg.protect);
    const known = new Set(TYPO_CATEGORIES.map((c) => c.id));
    let stored = [];
    try { stored = JSON.parse(localStorage.getItem('ted-typograf-off') || '[]'); } catch (e) { stored = []; }
    const off = new Set([...(cfg.off || []), ...stored].filter((id) => known.has(id)));

    let edits = [];
    const revert = () => { for (const e of edits) e.node.data = e.before; edits = []; };
    const run = () => {
      revert();
      const blocks = idx.map((i) => ed.children[i]).filter(Boolean);
      const res = typografBlocks(blocks, { off, protect, terms: cfg.terms });
      edits = res.edits;
      return res;
    };
    const mark = () => {
      if (typeof Highlight === 'undefined' || !window.CSS || !CSS.highlights) return;
      const ranges = [];
      for (const e of edits) {
        const len = e.node.data.length;
        for (const d of diffRanges(e.before, e.node.data)) {
          const rg = document.createRange();
          let { start, end } = d;
          if (end <= start) { end = Math.min(len, start + 1); start = Math.max(0, end - 1); }
          if (end > start) { rg.setStart(e.node, start); rg.setEnd(e.node, end); ranges.push(rg); }
        }
      }
      CSS.highlights.set('ted-fix', new Highlight(...ranges));
    };
    const unmark = () => { if (window.CSS && CSS.highlights) CSS.highlights.delete('ted-fix'); };

    this.history.commit();
    // первый прогон со всеми правилами — по нему считаем, что вообще нашлось
    const full = (() => { off.clear(); const keepOff = [...(cfg.off || []), ...stored].filter((id) => known.has(id)); const res = run(); keepOff.forEach((id) => off.add(id)); return res; })();
    if (!full.changed) { revert(); return this.toast('Текст уже в порядке'); }
    const counts = full.stats;
    let res = off.size ? run() : full;
    const finishToast = () => this.toast(r ? 'Текст отформатирован' : 'Весь текст отформатирован', { undo: true });

    // без панели (typograf.review: false) — как раньше: сразу и с «Отменить» в тосте
    if (cfg.review === false) {
      this.afterChange({ immediate: true });
      return finishToast();
    }

    let saved = false;   // применяем правки только кнопкой «Сохранить»; крестик, Esc и клик мимо окна — откат
    const total = h('span', { class: 'ted-ui-field__hint' });
    const rows = TYPO_CATEGORIES.filter((c) => counts[c.id]).map((c) => {
      const input = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
      input.checked = !off.has(c.id);
      const count = h('span', { class: 'ted-ui-fix__count', text: String(counts[c.id]) });
      input.addEventListener('change', () => {
        if (input.checked) off.delete(c.id); else off.add(c.id);
        try { localStorage.setItem('ted-typograf-off', JSON.stringify([...off])); } catch (e) { /* без запоминания */ }
        res = run();
        mark();
        refresh();
      });
      return h('label', { class: 'ted-ui-toggle ted-ui-fix__row' }, [
        input,
        h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
        h('span', { class: 'ted-ui-toggle__text', text: c.label }),
        count,
      ]);
    });
    const refresh = () => {
      const n = res.changed ? Object.values(res.stats).reduce((a, b) => a + b, 0) : 0;
      total.textContent = n ? tf('Изменено мест: {n}. Выключите то, что не нужно.', { n }) : t('Все правила выключены — текст не изменён.');
    };
    refresh();
    mark();

    const done = () => { saved = true; this.popover.close(); };
    const cancel = () => this.popover.close();
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Форматирование' }),
        smallButtonEl('close', 'Закрыть', 'close-small', cancel),
      ]),
      total,
      ...rows,
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: done }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отменить', onclick: cancel }),
      ]),
    ];
    const anchor = this.toolbar.magicBtn.isConnected ? this.toolbar.magicBtn : this.toolbar.el;
    this.popover.open(nodes, anchor, {
      cls: 'ted-ui-pop--format',
      onClose: () => {
        unmark();
        if (!saved) { revert(); this.afterChange({ record: false }); return; }
        this.afterChange({ immediate: true });
        finishToast();
      },
    });
  }

  toggleInlineCode() {
    const r = getRange(this.editable);
    if (!r) return;
    const ed = this.editable;
    // выделен блок целиком (или курсор в блоке кода): «Код» превращает его в блок кода и обратно
    const blk = topBlockOf(ed, r.startContainer);
    const btype = blockType(blk);
    const whole = !r.collapsed && blk === topBlockOf(ed, r.endContainer) && !!r.toString().trim() && r.toString().trim() === blk.textContent.trim();
    if (btype === 'pre' || (whole && /^(p|h[2-6])$/.test(btype))) {
      this.history.commit();
      convertBlocks(ed, [blk], btype === 'pre' ? 'p' : 'pre');
      normalizeRoot(ed);
      this.afterChange({ immediate: true });
      return;
    }
    const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const code = startEl.closest('code');
    if (code && ed.contains(code) && !code.closest('pre')) {
      this.history.commit();
      withMarkers(ed, () => code.replaceWith(...code.childNodes));
      this.afterChange({ immediate: true });
      return;
    }
    if (r.collapsed) return;
    if (topBlockOf(ed, r.startContainer) !== topBlockOf(ed, r.endContainer)) return;
    // в таблице код ставится только внутри одной ячейки: выделение, захватившее соседнюю ячейку
    // (тройной клик, протяжка), обрезается по своей ячейке — иначе удаление текста режет таблицу
    const cellOf = (n) => (n.nodeType === 1 ? n : n.parentNode).closest('td, th, figcaption');
    const cell = cellOf(r.startContainer);
    if (cell && ed.contains(cell) && !cell.contains(r.endContainer)) {
      r.setEnd(cell, cell.childNodes.length);
      if (cell.lastChild && cell.lastChild.nodeName === 'BR') r.setEndBefore(cell.lastChild);
      if (!r.toString().trim()) return;
    } else if (!cell && cellOf(r.endContainer)) return;
    this.history.commit();
    const el = document.createElement('code');
    el.textContent = r.toString();
    r.deleteContents();
    r.insertNode(el);
    const sel = document.getSelection();
    const nr = document.createRange();
    nr.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(nr);
    this.afterChange({ immediate: true });
  }

  /**
   * Вставить блок из реестра (горячая клавиша, Markdown): пустой абзац под курсором заменяется блоком, иначе блок встаёт
   * после текущего; за блоком без текста всегда есть абзац для курсора. Блок, отключённый набором, не вставляется.
   */
  insertBlock(type) {
    const def = blockDef(type);
    const block = this.currentBlock();
    if (!def || !block || !blockAllowed(this.allowedBlocks, def.type)) return;   // и текстовые блоки (шаги, чек-лист) — как из меню
    // та же вставка, что из меню «/» и «Все блоки» (22.11): курсор — в сам блок (или окно его настроек), не в строку под ним
    const menu = this.blockMenu;
    menu.mode = 'insert';
    menu.slash = null;
    menu.target = block;
    menu.choose({ type: def.type });
  }

  /** Поповер ссылки (макет editor-popover kind=link). */
  /** Вставленным ссылкам без явного target ставим «в новой вкладке» (опция linkBlank). */
  blankLinks(html) {
    if (!this.options.linkBlank || !html) return html;
    const box = document.createElement('div');
    box.innerHTML = html;
    for (const a of box.querySelectorAll('a[href]')) {
      if (a.hasAttribute('target')) continue;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
    }
    return box.innerHTML;
  }

  /** Подсветка выделения, пока фокус в окне «Ссылка» (иначе выделение пропадает). */
  holdSelection(range) {
    this.releaseSelection();
    if (!range || range.collapsed || typeof Highlight === 'undefined' || !window.CSS || !CSS.highlights) return;
    CSS.highlights.set('ted-held', new Highlight(range.cloneRange()));
  }

  releaseSelection() {
    if (window.CSS && CSS.highlights) CSS.highlights.delete('ted-held');
  }

  /** Якорь блока (макет editor-popover kind=anchor): id блока для навигации #имя. */
  openAnchor(target) {
    const r = target ? null : this.ensureRange();
    if (!target && !r) return;
    const block = target || topBlockOf(this.editable, r.startContainer);
    if (!block) return;
    this.rememberSelection();
    const rect = block.getBoundingClientRect();
    const own = block.id || '';
    const free = (id) => { const f = this.editable.querySelector(`#${CSS.escape(id)}`); return !f || f === block; };
    const clean = (v) => String(v || '').trim().replace(/^#/, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    let suggestion = own;
    if (!suggestion) {
      const base = slugify(block.textContent) || 'block';
      suggestion = uniqueId(this.editable, /^[a-z]/.test(base) ? base : `s-${base}`);
    }

    const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Название якоря', placeholder: 'glava-1', value: suggestion });
    const copy = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray ted-ui-action--icon', 'aria-label': 'Копировать ссылку', 'data-tip': 'Копировать ссылку' }, [icon('copy')]);
    const field = h('div', { class: 'ted-ui-field' }, [
      h('span', { class: 'ted-ui-field__label', text: 'Название якоря' }),
      h('div', { class: 'ted-ui-field__row' }, [input, copy]),
      h('span', { class: 'ted-ui-field__hint', text: 'Латиницей, без #.' }),
    ]);

    const save = () => {
      const id = clean(input.value);
      if (id && !/^[A-Za-z]/.test(id)) { input.value = `a-${id}`; return this.toast('Имя якоря начинается с буквы'); }
      if (id && !free(id)) return this.toast('Такой якорь уже есть на странице');
      this.popover.close();
      this.history.commit();
      if (id) block.id = id; else block.removeAttribute('id');
      this.toast(id ? 'Якорь сохранён' : 'Якорь удалён');
      this.afterChange({ immediate: true });
      this.handle.placeControls();
    };
    const cancel = () => this.popover.close();
    copy.addEventListener('click', () => {
      const id = clean(input.value);
      if (!id) return this.toast('Сначала введите название якоря');
      this.handle.copyText(this.handle.urlFor(block, id));
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Якорь' }),
        smallButtonEl('close', 'Закрыть', 'close-small', cancel),
      ]),
      field,
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    // подсвечиваем блок, к которому привязывается якорь
    this.handle.select(block);
    this.popover.open(nodes, rect, {
      cls: 'ted-ui-pop--link',
      focus: '.ted-ui-input',
      anchorX: rect.left + Math.min(28, rect.width / 2 || 28),
      onClose: () => { if (this.handle.selected === block) this.handle.select(null); this.restoreRemembered(); },
    });
  }

  openLink() {
    const r = this.ensureRange();
    if (!r) return;
    const startEl = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const link = startEl.closest('a');
    const existing = link && this.editable.contains(link) ? link : null;
    this.rememberSelection();
    const selectedText = existing ? existing.textContent : r.toString();

    let rect = r.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      const b = topBlockOf(this.editable, r.startContainer);
      if (b) rect = b.getBoundingClientRect();
    }

    const field = (label, hint, attrs) => {
      const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', ...attrs });
      return { input, el: h('label', { class: 'ted-ui-field' }, [
        label ? h('span', { class: 'ted-ui-field__label', text: label }) : null,
        input,
        h('span', { class: 'ted-ui-field__hint', text: hint }),
      ]) };
    };
    const url = field(null, 'Полный адрес или путь на сайте.', {
      inputmode: 'url', 'aria-label': 'Ссылка', placeholder: 'https://example.com', value: existing ? existing.getAttribute('href') : '',
    });
    const text = field('Текст ссылки', 'Подставится выделенный текст.', { placeholder: 'Каталог', value: selectedText });

    // Switches/toggle size s: «Открывать в новой вкладке» (подпись text/t3)
    const blankInput = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
    blankInput.checked = existing ? existing.getAttribute('target') === '_blank' : this.options.linkBlank !== false;
    const blankRow = h('label', { class: 'ted-ui-toggle' }, [
      blankInput,
      h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
      h('span', { class: 'ted-ui-toggle__text', text: 'Открывать в новой вкладке' }),
    ]);
    const applyTarget = (a) => {
      if (blankInput.checked) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); }
      else { a.setAttribute('target', '_self'); a.removeAttribute('rel'); }
    };

    const save = () => {
      const href = normalizeUrl(url.input.value);
      const label = text.input.value.trim();
      this.popover.close();
      this.history.commit();
      if (!href) {
        if (existing) withMarkers(this.editable, () => existing.replaceWith(...existing.childNodes));
        if (existing) this.toast('Ссылка удалена');
      } else if (existing) {
        existing.setAttribute('href', href);
        applyTarget(existing);
        if (label && label !== existing.textContent) existing.textContent = label;
        this.toast('Ссылка обновлена');
      } else {
        const cur = getRange(this.editable);
        // текст не менялся (сравниваем без краевых пробелов, чтобы не потерять пробел выделения)
        if (cur && !cur.collapsed && (!label || label === selectedText.trim())) {
          const before = new Set(this.editable.querySelectorAll('a'));
          document.execCommand('createLink', false, href);
          for (const a of this.editable.querySelectorAll('a')) if (!before.has(a)) applyTarget(a);
        } else if (cur) {
          const a = document.createElement('a');
          a.setAttribute('href', href);
          applyTarget(a);
          a.textContent = label || url.input.value.trim();
          cur.deleteContents();
          cur.insertNode(a);
          placeCaret(a, true);
        }
      }
      if (href && !existing) this.toast('Ссылка добавлена');
      this.afterChange({ immediate: true });
    };
    const cancel = () => this.popover.close();
    for (const inp of [url.input, text.input]) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
      });
    }
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: 'Ссылка' }),
        smallButtonEl('close', 'Закрыть', 'close-small', cancel),
      ]),
      url.el,
      text.el,
      blankRow,
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    const held = existing ? (() => { const x = document.createRange(); x.selectNodeContents(existing); return x; })() : r;
    this.holdSelection(held);
    // курсор без выделения и ссылки нет — подсвечиваем строку, как в «Превратить в…»: видно, где появится ссылка
    const lineBlock = !existing && r.collapsed ? topBlockOf(this.editable, r.startContainer) : null;
    if (lineBlock) this.handle.select(lineBlock);
    this.popover.open(nodes, rect, {
      cls: 'ted-ui-pop--link',
      focus: '.ted-ui-input',
      anchorX: rect.left + Math.min(28, rect.width / 2 || 28),
      onClose: () => { this.releaseSelection(); if (lineBlock && this.handle.selected === lineBlock) this.handle.select(null); this.restoreRemembered(); },
    });
  }

  // -------------------------------------------------------------------------
  // Клавиатура и ввод
  // -------------------------------------------------------------------------

  /** Событие пришло из поля формы внутри поля правки (input, textarea): редактор его не обрабатывает. */
  fromField(e) {
    const t = e && e.target;
    return !!(t && t !== this.editable && t.nodeType === 1 && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'));
  }

  onBeforeInput(e) {
    if (this.fromField(e)) return;
    // отмена/повтор из контекстного меню браузера
    if (e.inputType === 'historyUndo') { e.preventDefault(); this.history.undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); this.history.redo(); }
  }

  onInput(e) {
    if (this.fromField(e)) return;   // поле правки внутри блока (подпись, поля карточки товара) — не текст документа
    if (this.composing) return;
    normalizeRoot(this.editable);
    if (e && e.inputType === 'insertText' && e.data === ' ' && this.blockMenu.mode !== 'slash' && this.maybeMarkdown('space')) return;
    if (this.blockMenu.mode === 'slash') this.blockMenu.syncWithEditor();
    else if (e && e.inputType === 'insertText' && e.data === '/') this.maybeOpenSlash();
    // буквы и удаление символов — «ввод»: шапка и кнопки обновятся после паузы; остальное (вставка, перенос строки) — сразу
    const typing = !!(e && /^(insertText|insertCompositionText|deleteContentBackward|deleteContentForward)$/.test(e.inputType) && this.blockMenu.mode !== 'slash');
    this.afterChange({ typing });
  }

  /**
   * Markdown-сокращения (как в Notion), только в начале обычного абзаца:
   *   «# » → заголовок 2, «## » → 3, «### » → 4, «#### » → 5, «##### » → 6;
   *   «- », «* », «+ » → список; «1. », «1) » → нумерованный; «> » → цитата.
   * По Enter: «---» → разделитель, «```» → блок кода. Ctrl+Z возвращает набранные знаки.
   * Возвращает true, если сокращение сработало.
   */
  maybeMarkdown(trigger) {
    if (this.options.markdown === false) return false;
    const ed = this.editable;
    const r = getRange(ed);
    if (!r || !r.collapsed) return false;
    const block = topBlockOf(ed, r.startContainer);
    if (!block || block.tagName !== 'P') return false;
    const text = block.textContent.replace(/[ ​]/g, ' ');
    let type = null;
    if (trigger === 'space') {
      const m = /^(#{1,5}|[-*+]|1[.)]|>|\[[ xX]?\]) $/.exec(text);
      if (!m) return false;
      const k = m[1];
      if (k[0] === '[') type = 'checklist';   // «[] », «[ ] », «[x] » → чек-лист (пустой пункт не бывает отмеченным)
      else type = k[0] === '#' ? `h${k.length + 1}` : (/^[-*+]$/.test(k) ? 'ul' : (k === '>' ? 'blockquote' : 'ol'));
    } else if (trigger === 'enter') {
      const md = markdownBlock(text);   // блок из реестра: block.json → markdown («---» — линия)
      if (md) type = md.type;
      else return false;
    }
    if (!type) return false;
    if (!blockAllowed(this.allowedBlocks, type)) return false;   // блок отключён опцией blocks: «- », «# » остаются обычным текстом
    this.history.commit();
    const idx = Array.from(ed.children).indexOf(block);
    block.replaceChildren(document.createElement('br'));
    // блок без текста из реестра («---» — линия) вставляется; текстовый (заголовок, список, код) — превращает абзац
    if (blockDef(type) && !blockDef(type).text && blockDef(type).create) { this.insertBlock(type); return true; }
    convertBlocks(ed, [block], type);
    normalizeRoot(ed);
    const made = ed.children[idx];
    if (made) placeCaret(made.querySelector('li, p') || made);
    this.afterChange({ immediate: true });
    return true;
  }

  /** Пункт чек-листа под курсором (или null). */
  checklistItem(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentNode);
    const li = el && el.closest ? el.closest('ul.ted-checklist > li') : null;
    return li && this.editable.contains(li) ? li : null;
  }

  toggleChecklistItem(li) {
    if (!li || !li.textContent.replace(/[​\s]/g, '')) return false;   // пустой пункт не отмечается
    this.history.commit();
    li.classList.toggle('ted-checked');
    this.afterChange({ immediate: true });
    return true;
  }

  /** Попадание в чек-бокс пункта: рамка 24 (значок 20) у левого края пункта. */
  inCheckZone(li, e) {
    const x = e.clientX - li.getBoundingClientRect().left;
    return x >= 0 && x <= 28;
  }

  /** Клик по чек-боксу переключает отметку, курсор остаётся где был; нажатие и наведение подсвечиваются как у check-box. */
  onChecklistDown(e) {
    if (this.mode !== 'edit' || e.button !== 0) return;
    const li = this.checklistItem(e.target);
    if (!li || !this.inCheckZone(li, e)) return;
    e.preventDefault();
    li.setAttribute('data-tedui-cb', 'press');
    const up = () => {
      document.removeEventListener('mouseup', up, true);
      if (li.isConnected) li.setAttribute('data-tedui-cb', 'hover');
    };
    document.addEventListener('mouseup', up, true);
    this.toggleChecklistItem(li);
  }

  /** Наведение на чек-бокс: рука вместо текстового курсора и состояние hover. */
  onChecklistMove(e) {
    if (this.mode !== 'edit') return;
    const li = this.checklistItem(e.target);
    const on = li && this.inCheckZone(li, e) ? li : null;
    for (const x of this.editable.querySelectorAll('[data-tedui-cb]')) if (x !== on && x.getAttribute('data-tedui-cb') !== 'press') x.removeAttribute('data-tedui-cb');
    if (on && !on.hasAttribute('data-tedui-cb')) on.setAttribute('data-tedui-cb', 'hover');
    this.editable.style.cursor = on ? 'pointer' : '';
  }

  /** Enter в конце пункта чек-листа: есть пункт ниже — переходим в него, новый не создаём. */
  onChecklistEnter(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return false;
    const li = this.checklistItem(r.startContainer);
    const next = li && li.nextElementSibling;
    if (!next) return false;
    const rest = document.createRange();
    rest.setStart(r.startContainer, r.startOffset);
    rest.setEnd(li, li.childNodes.length);
    if (rest.cloneContents().textContent.replace(/​/g, '').trim()) return false;
    e.preventDefault();
    placeCaret(next, true);
    this.updateState();
    return true;
  }

  /** «/» в начале блока или после пробела — меню блоков (как в Notion). */
  maybeOpenSlash() {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return;
    const n = r.startContainer;
    const i = r.startOffset;
    if (n.nodeType !== 3 || i < 1 || n.data[i - 1] !== '/') return;
    const before = n.data[i - 2];
    if (before !== undefined && !/[\s ]/.test(before)) return;
    const block = topBlockOf(this.editable, n);
    if (!block || blockType(block) === 'pre') return;
    this.blockMenu.openAtSlash(n, i - 1);
  }

  onKeyDown(e) {
    if (e.isComposing || this.composing) return;
    // таблица: Enter (перенос / двойной — выход), Tab, ↑ ↓ между строками, края ячеек
    if (!e.ctrlKey && !e.metaKey && !e.altKey && ['Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowRight', 'Backspace', 'Delete'].includes(e.key) && this.blockUis.some((u) => u.onKeyFirst && u.onKeyFirst(e))) return;   // ячейки таблицы
    if (['Enter', 'Backspace', 'Delete'].includes(e.key) && this.blockUis.some((u) => u.onKey && u.onKey(e))) return;
    // Ctrl+Enter в пункте чек-листа — поставить / снять галочку
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      const rr = getRange(this.editable);
      const li = rr && this.checklistItem(rr.startContainer);
      if (li) { e.preventDefault(); this.toggleChecklistItem(li); return; }
    }
    // шаги: Enter из заголовка → в описание, из описания → новый шаг; Backspace у границ
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && this.onChecklistEnter(e)) return;
    // Ctrl+A — весь документ, включая медиа и таблицу в конце (браузер обрывает выделение перед ними, и Delete их не удалял)
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyA') {
      const rr = getRange(this.editable);
      const inField = rr && (rr.startContainer.nodeType === 1 ? rr.startContainer : rr.startContainer.parentNode).closest('pre');
      if (!inField) {
        e.preventDefault();
        const all = document.createRange();
        all.selectNodeContents(this.editable);
        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(all);
        return;
      }
    }
    // выделено всё и Delete / Backspace — страница очищается до одного пустого абзаца, вместе с медиа и таблицами (их браузер сам не удаляет)
    if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey && !e.altKey && this.clearIfAllSelected(e)) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'Enter' || e.key === 'Backspace')) {
      if (this.onStepsKey(e) || this.onProsconsKey(e) || this.onAuthorKey(e)) return;
      // клавиши внутри блока из реестра (block.js → onKey(editor, e) → true, если обработано)
      if (registeredBlocks().some((d) => d.onKey && d.onKey(this, e))) return;
    }
    if (e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && this.onDeleteGuard(e)) return;
    // блок кода: Ctrl+Alt+L — язык, Ctrl+Alt+C — копировать код
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && (e.code === 'KeyL' || e.code === 'KeyC') && this.handle.codePre) {
      e.preventDefault();
      const pre = this.handle.codePre;
      if (e.code === 'KeyL') this.handle.openLangMenu(pre);
      else this.handle.copyText(pre.textContent, 'Код скопирован', 'Не удалось скопировать код');
      return;
    }
    const hk = findHotkey(e);
    // стиль блока и выравнивание сейчас не действуют (ячейка и подпись таблицы; форматирование текста — да)
    if (hk && /^(block:|align:)/.test(hk.cmd) && this.blockUis.some((u) => u.lockStyle && u.lockStyle())) { e.preventDefault(); return; }
    if (hk) {
      e.preventDefault();
      this.exec(hk.cmd);
      return;
    }
    // Esc — завершить правку блока (макет: «Esc или клик мимо завершает»)
    if (e.key === 'Escape' && !this.popover.isOpen && !adminModalOpen()) {
      e.preventDefault();
      this.editable.blur();
      document.getSelection().removeAllRanges();
      // фокус — на редактор целиком: следующий Tab ведёт к панели, а не в начало страницы (клавиатура, 22.11)
      if (!this.ui.hasAttribute('tabindex')) this.ui.setAttribute('tabindex', '-1');
      this.ui.focus({ preventScroll: true });
      this.scheduleState();
      return;
    }
    const range = getRange(this.editable);
    const wholeBlock = range?.startContainer === this.editable && range.endContainer === this.editable &&
      range.endOffset === range.startOffset + 1 ? this.editable.childNodes[range.startOffset] : null;
    const objectType = blockType(wholeBlock);
    const isObject = objectType === 'raw' || isObjectBlock(wholeBlock);
    if (wholeBlock && (e.key === 'Delete' || (isObject && e.key === 'Backspace'))) {
      e.preventDefault();
      this.handle.remove(wholeBlock);
      return;
    }
    if (isObject && (e.key === 'Enter' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))) {
      if (e.key === 'Enter') e.preventDefault();
      let next = wholeBlock.nextElementSibling;
      if (next?.tagName !== 'P' || !isEmptyBlock(next)) {
        this.history.commit();
        next = emptyBlock(document);
        wholeBlock.after(next);
      }
      placeCaret(next);
      if (e.key === 'Enter') this.afterChange({ immediate: true });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) this.onEnter(e);
    else if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) this.onBackspace(e);
    else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) this.onTab(e);
  }

  // -------------------------------------------------------------------------
  // Шаги: <ol class="ted-steps"><li><strong>заголовок</strong><br>описание</li></ol>
  // -------------------------------------------------------------------------

  /** Пункт шагов или чек-листа, в котором стоит курсор (или null): у него рамка при перетаскивании и кнопки справа. */
  listItem(node) {
    const n = node && (node.nodeType === 1 ? node : node.parentNode);
    const li = n && n.closest && n.closest('ol.ted-steps > li, ul.ted-checklist > li, ul.ted-facts > li, ul.ted-proscons > li > ul > li, ul.ted-proscons > li')
      || this.blockUis.map((u) => (u.itemAt ? u.itemAt(n) : null)).find(Boolean);   // пункт блока из реестра (вкладка)
    return li && this.editable.contains(li) ? li : null;
  }

  /** Место, где «Жирный» не действует: заголовок шага, карточки плюсов-минусов и части блоков из block.json → noBold. */
  boldLocked(node) {
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !this.editable.contains(el)) return false;
    const step = this.stepItem(node);
    if (step && step.firstElementChild && step.firstElementChild.contains(node)) return true;
    // block.json → noBold: части блока, где выбора «жирный / нет» нет (название вкладки, заголовок выноски — решение 22.11)
    const sel = ['ul.ted-proscons > li > strong', ...registeredBlocks().filter((d) => d.noBold).map((d) => d.noBold)].join(', ');
    return !!el.closest(sel);
  }

  /** Пункт-шаг, в котором стоит курсор (или null). */
  stepItem(node) {
    const n = node && (node.nodeType === 1 ? node : node.parentNode);
    const li = n && n.closest && n.closest('ol.ted-steps > li, ul.ted-facts > li');
    return li && this.editable.contains(li) ? li : null;
  }

  /** Описание шага: текст после заголовка без служебного нулевого пробела. */
  stepDescription(li) {
    const sep = li.firstElementChild && li.firstElementChild.nextSibling;
    let t = '';
    for (let n = sep && sep.nextSibling; n; n = n.nextSibling) if (!(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))) t += n.textContent;
    return t.replace(/​/g, '');
  }

  /** Курсор в начало описания шага (после нулевого пробела, если он там есть). */
  caretToStepDescription(li) {
    const sep = li.firstElementChild.nextSibling;
    const d = sep && sep.nextSibling;
    const r = document.createRange();
    if (d && d.nodeType === 3) r.setStart(d, d.data.startsWith(ZWSP) ? 1 : 0);
    else r.setStartAfter(sep);
    r.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  caretToStepTitleEnd(li) {
    const title = li.firstElementChild;
    const r = document.createRange();
    const text = title.lastChild && title.lastChild.nodeType === 3 ? title.lastChild : null;
    if (text) r.setStart(text, text.data.length);
    else r.setStart(title, 0);
    r.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  /** Плюсы и минусы: Enter в заголовке → в первый пункт; в конце пункта → следующий (в последнем — новый); Backspace в пустом пункте удаляет его. */
  onProsconsKey(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const card = n.closest && n.closest('ul.ted-proscons > li');
    if (!card || !this.editable.contains(card)) return false;
    const doc = document;
    const title = card.firstElementChild && card.firstElementChild.tagName === 'STRONG' ? card.firstElementChild : null;
    const list = card.querySelector(':scope > ul');
    if (!title || !list) return false;
    const empty = (el) => !el.textContent.replace(/​/g, '').trim();
    const caretEnd = (li) => placeCaret(li, true);
    if (title.contains(r.startContainer)) {
      if (e.key === 'Enter') {
        e.preventDefault();
        caretEnd(list.firstElementChild);
        this.updateState();
        return true;
      }
      if (e.key === 'Backspace') {
        const t = doc.createRange();
        t.setStart(title, 0);
        t.setEnd(r.startContainer, r.startOffset);
        if (!t.cloneContents().textContent.replace(/​/g, '')) { e.preventDefault(); return true; }   // у начала заголовка Backspace ничего не склеивает
      }
      return false;
    }
    const li = n.closest('li');
    if (!li || li.parentNode !== list) return false;
    if (e.key === 'Enter') {
      const rest = doc.createRange();
      rest.setStart(r.startContainer, r.startOffset);
      rest.setEnd(li, li.childNodes.length);
      if (!empty({ textContent: rest.cloneContents().textContent })) return false;   // в середине текста — обычное разбиение
      e.preventDefault();
      const next = li.nextElementSibling;
      if (next) { caretEnd(next); this.updateState(); return true; }
      this.history.commit();
      if (empty(li)) {
        // пустой последний пункт: уходим из карточки — в следующую или из блока. Пункт не удаляем: пустые при сохранении отбрасываются
        const prevItem = li.previousElementSibling;
        if (prevItem && !empty(prevItem)) li.remove();   // лишний пустой хвост после заполненных пунктов убираем; пустые заглушки нетронуты
        const nextCard = card.nextElementSibling;
        if (nextCard) this.caretToTitleEnd(nextCard.firstElementChild);   // как везде: из последнего пункта — в заголовок следующей карточки
        else {
          const block = card.parentNode;
          let p = block.nextElementSibling;
          if (!p || p.tagName !== 'P' || !isEmptyBlock(p)) {
            p = emptyBlock(doc);
            block.after(p);
          }
          normalizeRoot(this.editable);
          placeCaret(p);
        }
      } else {
        const item = doc.createElement('li');
        item.appendChild(doc.createElement('br'));
        li.after(item);
        caretEnd(item);
      }
      this.afterChange({ immediate: true });
      return true;
    }
    // Backspace у самого начала первого пункта не втягивает его текст в заголовок карточки
    if (e.key === 'Backspace' && li === list.firstElementChild && !empty(li)) {
      const t = doc.createRange();
      t.setStart(li, 0);
      t.setEnd(r.startContainer, r.startOffset);
      if (!t.cloneContents().textContent.replace(/​/g, '')) { e.preventDefault(); return true; }
    }
    // Backspace в пустом пункте
    if (e.key === 'Backspace' && empty(li)) {
      e.preventDefault();
      if (list.children.length > 1) {
        this.history.commit();
        const prev = li.previousElementSibling;
        li.remove();
        if (prev) caretEnd(prev);
        else this.caretToTitleEnd(title);
        this.afterChange({ immediate: true });
      }
      return true;
    }
    return false;
  }

  /**
   * Delete у конца текста шага, плитки цифр, заголовка или последнего пункта плюсов-минусов:
   * браузер склеил бы соседний элемент (заголовок следующей карточки оказывался внутри пункта).
   */
  /** Выделение охватывает весь документ: до и после него нет ни текста, ни блоков-объектов. */
  clearIfAllSelected(e) {
    const r = getRange(this.editable);
    if (!r || r.collapsed || !this.editable.firstChild) return false;
    const OBJ = ['img, figure, table, pre, .ted-ui-raw, iframe, video, audio', wrapSelector(), objectSelector()].filter(Boolean).join(', ');
    const emptyPart = (from, to) => {
      const t = document.createRange();
      if (from) t.setStart(from[0], from[1]); else t.setStart(this.editable, 0);
      if (to) t.setEnd(to[0], to[1]); else t.setEnd(this.editable, this.editable.childNodes.length);
      const frag = t.cloneContents();
      return !frag.textContent.replace(/​/g, '').trim() && !frag.querySelector(OBJ);
    };
    if (!emptyPart(null, [r.startContainer, r.startOffset]) || !emptyPart([r.endContainer, r.endOffset], null)) return false;
    // объекты вне выделения (медиа в конце, которое браузер не включил) тоже уходят: выделено всё, что редактируется
    e.preventDefault();
    this.history.commit();
    const p = emptyBlock(document);
    this.editable.replaceChildren(p);
    normalizeRoot(this.editable);
    this.afterChange({ immediate: true, focus: this.editable.firstElementChild });
    return true;
  }

  onDeleteGuard(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return false;
    const after = (el) => {
      const t = document.createRange();
      t.setStart(r.startContainer, r.startOffset);
      t.setEnd(el, el.childNodes.length);
      return !t.cloneContents().textContent.replace(/​/g, '');
    };
    // Delete в конце абзаца перед составным блоком (плюсы и минусы, шаги, цифры, выноска, таблица) не втягивает его текст в абзац
    const top = topBlockOf(this.editable, r.startContainer);
    const nextBlock = top && top.nextElementSibling;
    if (top && nextBlock && !top.matches('ul, ol, blockquote, figure, pre') && nextBlock.matches(['ul.ted-proscons, ol.ted-steps, ul.ted-facts, ul.ted-checklist', ...registeredBlocks().filter((d) => d.compound).map((d) => d.selector)].join(', ')) && after(top)) {
      e.preventDefault();
      return true;
    }
    const li = this.stepItem(r.startContainer);
    if (li) {
      const title = li.firstElementChild;
      const hasNested = li.querySelector(':scope > ul, :scope > ol');
      if (title && title.contains(r.startContainer) ? after(title) : (!hasNested && after(li))) { e.preventDefault(); return true; }
      return false;
    }
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const card = n.closest && n.closest('ul.ted-proscons > li');
    if (!card || !this.editable.contains(card)) return false;
    const title = card.firstElementChild;
    const list = card.querySelector(':scope > ul');
    if (title && title.contains(r.startContainer)) { if (after(title)) { e.preventDefault(); return true; } return false; }
    const item = n.closest('li');
    if (list && item && item.parentNode === list && item === list.lastElementChild && after(item)) { e.preventDefault(); return true; }
    return false;
  }

  caretToTitleEnd(title) {
    const r = document.createRange();
    const t = title.lastChild && title.lastChild.nodeType === 3 ? title.lastChild : null;
    if (t) r.setStart(t, t.data.length);
    else r.setStart(title, 0);
    r.collapse(true);
    const sel = document.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  // -------------------------------------------------------------------------
  // Автор цитаты: <p class="ted-author"><strong>Имя</strong><br>Должность</p>
  // -------------------------------------------------------------------------

  /** Цитата (не выноска), у которой можно добавить автора. */
  quoteBlock(node) {
    const n = node && (node.nodeType === 1 ? node : node.parentNode);
    let q = n && n.closest && n.closest('blockquote');
    if (q && defOf(q) && defOf(q).type !== 'blockquote') q = null;   // автор — только у цитаты (не у выноски и других блоков на blockquote)
    return q && this.editable.contains(q) && q.parentNode === this.editable ? q : null;
  }

  /**
   * Добавить автора в цитату. data — { name, role, id } (например, из CMS), без data — пустые поля с курсором в имени.
   * Список авторов сайта: опция authors — массив [{ id, name, role }] или функция (запрос) => массив / Promise.
   */
  addAuthor(quote, data = {}) {
    if (!quote || quote.querySelector(':scope > p.ted-author')) return null;
    this.history.commit();
    const p = document.createElement('p');
    p.className = 'ted-author';
    const strong = document.createElement('strong');
    if (data.name) strong.textContent = data.name; else strong.appendChild(document.createElement('br'));
    p.appendChild(strong);
    p.appendChild(document.createElement('br'));
    if (data.role) p.appendChild(document.createTextNode(data.role));
    if (data.id) p.setAttribute('data-author-id', String(data.id));
    quote.appendChild(p);
    normalizeRoot(this.editable);
    if (data.name && data.role) placeCaret(quote.lastElementChild, true);
    else if (data.name) this.caretToStepDescription(p);
    else this.caretToTitleEnd(strong);
    this.afterChange({ immediate: true });
    return p;
  }

  removeAuthor(quote) {
    const a = quote && quote.querySelector(':scope > p.ted-author');
    if (!a) return;
    this.history.commit();
    a.remove();
    this.afterChange({ immediate: true, focus: quote.lastElementChild });
  }

  /** Авторы сайта: массив или функция → Promise<массив>. */
  loadAuthors(query = '') {
    const src = this.options.authors;
    if (!src) return Promise.resolve(null);
    try { return Promise.resolve(typeof src === 'function' ? src(query) : src).then((l) => (Array.isArray(l) ? l : [])); } catch (e) { return Promise.resolve([]); }
  }

  /** Enter в имени → в должность; Enter в должности → ниже цитаты; Backspace в пустых полях убирает автора. */
  onAuthorKey(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const p = n.closest && n.closest('blockquote > p.ted-author');
    if (!p || !this.editable.contains(p)) return false;
    const title = p.firstElementChild && p.firstElementChild.tagName === 'STRONG' ? p.firstElementChild : null;
    if (!title) return false;
    const inName = title.contains(r.startContainer);
    const nameEmpty = !title.textContent.trim();
    const roleEmpty = !this.stepDescription(p).trim();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) return true;
      if (inName) { this.caretToStepDescription(p); this.updateState(); return true; }
      this.history.commit();
      const q = p.parentNode;
      let next = q.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) {
        next = emptyBlock(document);
        q.after(next);
      }
      normalizeRoot(this.editable);
      placeCaret(next);
      this.afterChange({ immediate: true });
      return true;
    }
    // Backspace
    if (inName && nameEmpty && r.startOffset === 0) {
      e.preventDefault();
      if (roleEmpty) this.removeAuthor(p.parentNode);
      return true;
    }
    if (!inName && roleEmpty) {
      const sep = title.nextSibling;
      const d = sep && sep.nextSibling;
      if (d && d.nodeType === 3 && r.startContainer === d && r.startOffset <= (d.data.startsWith(ZWSP) ? 1 : 0)) {
        e.preventDefault();
        this.caretToTitleEnd(title);
        return true;
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Блок кода: язык по тексту, подсветка в правке, шапка (язык, «Копировать»)
  // -------------------------------------------------------------------------

  /** Язык в шапке для «авто»-блоков определяется по тексту, подсветка в правке рисуется поверх текста. */
  refreshCode() {
    for (const pre of this.editable.querySelectorAll(':scope > pre')) {
      if (!pre.hasAttribute('data-tedui-auto')) continue;
      const text = pre.textContent;
      const d = detectCodeLang(text);
      if (d !== (pre.getAttribute('data-lang') || '')) {
        if (d) pre.setAttribute('data-lang', d); else pre.removeAttribute('data-lang');
      }
    }
    applyEditorHighlight(this.editable, (pre, text) => pre.getAttribute('data-lang') || detectCodeLang(text));
  }

  /** Клик по шапке блока кода: справа — копировать, слева — выбрать язык. */
  onCodeHeadDown(e) {
    if (this.mode !== 'edit' || e.button !== 0 || !e.target || e.target.tagName !== 'PRE' || e.target.parentNode !== this.editable) return;
    const pre = e.target;
    const rect = pre.getBoundingClientRect();
    const head = parseFloat(getComputedStyle(pre, '::before').height) || 36;
    if (e.clientY - rect.top > head) return;
    e.preventDefault();
    if (rect.right - e.clientX <= 52) this.handle.copyText(pre.textContent, 'Код скопирован', 'Не удалось скопировать код');
    else this.handle.openLangMenu(pre);
  }

  onStepsKey(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return false;
    const li = this.stepItem(r.startContainer);
    if (!li) return false;
    const doc = document;
    const title = li.firstElementChild && li.firstElementChild.tagName === 'STRONG' ? li.firstElementChild : null;
    if (!title) return false;
    const inTitle = title.contains(r.startContainer);
    const titleEmpty = !title.textContent.replace(/​/g, '').trim();
    const descEmpty = !this.stepDescription(li).trim();

    if (e.key === 'Enter') {
      e.preventDefault();
      this.history.commit();
      if (inTitle) {
        if (e.shiftKey) return true;   // заголовок — одна строка
        // ключевые цифры: число не разрезается — Enter просто переводит курсор в подпись
        if (li.parentNode.classList.contains('ted-facts')) {
          this.caretToStepDescription(li);
          this.updateState();
          return true;
        }
        // как в текстовом редакторе — всё после курсора уходит в новый шаг (сайт texted 27.11, 1.0.4; раньше хвост заголовка
        // приклеивался к описанию: «блокТекст…»):
        // курсор в конце заголовка — в описание; в начале непустого — пустой шаг перед этим; в середине — новый шаг после:
        // заголовок — хвост, описание переезжает с ним, у этого шага остаётся начало заголовка и пустое описание
        const tail = doc.createRange();
        tail.setStart(r.startContainer, r.startOffset);
        tail.setEnd(title, title.childNodes.length);
        const tailText = tail.cloneContents().textContent.replace(/​/g, '');
        if (!tailText.trim()) {
          this.caretToStepDescription(li);
          this.updateState();
          return true;
        }
        const head = doc.createRange();
        head.setStart(title, 0);
        head.setEnd(r.startContainer, r.startOffset);
        if (!head.cloneContents().textContent.replace(/​/g, '').trim()) {
          li.before(emptyStepItem(doc));
          normalizeRoot(this.editable);
          const rr = doc.createRange(); rr.setStart(title, 0); rr.collapse(true);
          const s0 = doc.getSelection(); s0.removeAllRanges(); s0.addRange(rr);
          this.afterChange({ immediate: true });
          return true;
        }
        const next = emptyStepItem(doc);
        const frag = tail.extractContents();
        next.firstElementChild.replaceChildren(frag);
        // описание (всё после <br>, кроме вложенного списка) — в новый шаг
        const sep = title.nextSibling;
        const nested = li.querySelector(':scope > ul, :scope > ol');
        if (sep && sep.nodeType === 1 && sep.tagName === 'BR') {
          const moveDesc = doc.createRange();
          moveDesc.setStartAfter(sep);
          if (nested) moveDesc.setEndBefore(nested); else moveDesc.setEnd(li, li.childNodes.length);
          const desc = moveDesc.extractContents();
          if (desc.textContent.replace(/​/g, '').trim()) {
            const zw = next.firstElementChild.nextSibling.nextSibling;
            next.insertBefore(desc, zw);
            if (zw && zw.nodeType === 3 && zw.data === ZWSP) zw.remove();
          }
        }
        li.after(next);
        normalizeRoot(this.editable);
        const rr = doc.createRange(); rr.setStart(next.firstElementChild, 0); rr.collapse(true);
        const s1 = doc.getSelection(); s1.removeAllRanges(); s1.addRange(rr);
        this.afterChange({ immediate: true });
        return true;
      }
      if (e.shiftKey) {
        // перенос строки внутри описания
        doc.execCommand('insertLineBreak');
        return true;
      }
      if (li.parentNode.classList.contains('ted-facts')) {
        // плитки цифр: текст подписи никогда не переезжает в заголовок другой плитки
        const list = li.parentNode;
        if (titleEmpty && descEmpty) {
          // пустая последняя плитка + Enter — выход из блока, как у списков; меньше двух плиток не бывает — тогда плитка остаётся
          if (li === list.lastElementChild) {
            if (list.children.length > 2) li.remove();
            let p = list.nextElementSibling;
            if (!p || p.tagName !== 'P' || !isEmptyBlock(p)) { p = emptyBlock(doc); list.after(p); }
            normalizeRoot(this.editable);
            placeCaret(p);
            this.afterChange({ immediate: true });
          }
          return true;
        }
        const nextCard = li.nextElementSibling;
        if (nextCard && !descEmpty) {
          this.caretToStepTitleEnd(nextCard);
          this.updateState();
          return true;
        }
        // подпись пуста (двойной Enter) или это последняя плитка: новая плитка после текущей
        const fresh = emptyStepItem(doc);
        li.after(fresh);
        normalizeRoot(this.editable);
        this.caretToStepTitleEnd(fresh);
        this.afterChange({ immediate: true });
        return true;
      }
      // курсор в конце описания и ниже есть шаг: просто переходим в его заголовок, новый шаг не создаём
      const nextLi = li.nextElementSibling;
      if (nextLi) {
        const rest = doc.createRange();
        rest.setStart(r.startContainer, r.startOffset);
        rest.setEnd(li, li.childNodes.length);
        if (!rest.cloneContents().textContent.replace(/​/g, '').trim()) {
          this.caretToStepTitleEnd(nextLi);
          this.updateState();
          return true;
        }
      }
      const ol = li.parentNode;
      const isFacts = ol.classList.contains('ted-facts');
      // пустой последний шаг: Enter выходит из блока в новый абзац
      if (titleEmpty && descEmpty && li === ol.lastElementChild && ol.children.length > (isFacts ? 2 : 1)) {
        li.remove();
        const p = emptyBlock(doc);
        ol.after(p);
        normalizeRoot(this.editable);
        placeCaret(p);
        this.afterChange({ immediate: true });
        return true;
      }
      const next = emptyStepItem(doc);
      const tail = doc.createRange();
      tail.setStart(r.startContainer, r.startOffset);
      tail.setEnd(li, li.childNodes.length);
      const hasNested = li.querySelector(':scope > ul, :scope > ol');
      if (hasNested) tail.setEndBefore(hasNested);
      // текст описания после курсора переходит в ОПИСАНИЕ нового шага (с оформлением), курсор — в его пустой заголовок.
      // Раньше хвост становился жирным заголовком, а у пустого описания не оставалось строки — шаги наезжали (сайт 27.11, 1.0.4)
      const frag = tail.extractContents();
      if (frag.textContent.replace(/​/g, '').trim()) {
        const descStart = next.firstElementChild.nextSibling.nextSibling;   // нулевой пробел пустого описания
        next.insertBefore(frag, descStart);
        if (descStart && descStart.nodeType === 3 && descStart.data === ZWSP) descStart.remove();
      }
      li.after(next);
      normalizeRoot(this.editable);
      this.caretToStepTitleEnd(next);
      this.afterChange({ immediate: true });
      return true;
    }

    // Backspace
    if (inTitle) {
      const atStart = r.startOffset === 0 && (r.startContainer === title || r.startContainer === title.firstChild);
      if (!atStart) return false;
      e.preventDefault();
      if (!(titleEmpty && descEmpty)) return true;   // непустой шаг не склеиваем с предыдущим
      if (li.parentNode.classList.contains('ted-facts') && li.parentNode.children.length <= 2) return true;   // меньше двух плиток не бывает
      this.history.commit();
      const ol = li.parentNode;
      const prev = li.previousElementSibling;
      if (!prev) {
        if (ol.children.length > 1) {
          const nextLi = li.nextElementSibling;
          li.remove();
          this.caretToStepTitleEnd(nextLi);
        } else {
          const p = emptyBlock(doc);
          ol.replaceWith(p);
          normalizeRoot(this.editable);
          placeCaret(p);
        }
      } else {
        li.remove();
        this.caretToStepTitleEnd(prev);
        const sep = prev.firstElementChild.nextSibling;
        if (sep && sep.nextSibling && sep.nextSibling.nodeType === 3 && this.stepDescription(prev)) {
          const d = sep.nextSibling;
          const rr = doc.createRange();
          rr.setStart(d, d.data.length);
          rr.collapse(true);
          const sel = document.getSelection();
          sel.removeAllRanges();
          sel.addRange(rr);
        }
      }
      this.afterChange({ immediate: true });
      return true;
    }
    // в описании: у самого начала возвращаемся в заголовок
    const sep = title.nextSibling;
    const d = sep && sep.nextSibling;
    const atDescStart = d && d.nodeType === 3 && r.startContainer === d && r.startOffset <= (d.data.startsWith(ZWSP) ? 1 : 0);
    if (!atDescStart) return false;
    e.preventDefault();
    this.caretToStepTitleEnd(li);
    return true;
  }

  onEnter(e) {
    if (this.maybeMarkdown('enter')) { e.preventDefault(); return; }
    const r = getRange(this.editable);
    if (!r) return;
    const ed = this.editable;
    const block = topBlockOf(ed, r.startContainer);
    const type = blockType(block);

    if (block === ed.firstElementChild && /^(p|h[2-6])$/.test(type) && isAtStart(block, r)) {
      e.preventDefault();
      this.history.commit();
      const blank = emptyBlock(document);
      if (isEmptyBlock(block)) {
        block.replaceWith(blank);
        if (!blank.nextElementSibling) blank.after(emptyBlock(document));
        this.afterChange({ immediate: true, focus: blank.nextElementSibling });
      } else {
        block.before(blank);
        this.afterChange({ immediate: true, focus: block });
      }
      return;
    }

    // блок с цветным фоном: Enter — новая строка внутри плашки (браузер при разбиении абзаца клонировал бы класс фона и размножал плашки);
    // Enter на пустой последней строке — строка убирается и ниже встаёт новый пустой чистый абзац
    if (/^(p|h[2-6])$/.test(type) && /(^|\s)ted-bg-/.test(block.className) && r.collapsed) {
      e.preventDefault();
      this.history.commit();
      if (isEmptyBlock(block)) {
        // пустая плашка + Enter — плашка снимается, остаётся обычный абзац
        for (const c of Array.from(block.classList)) if (/^ted-bg-/.test(c)) block.classList.remove(c);
        if (!block.className) block.removeAttribute('class');
        this.afterChange({ immediate: true, focus: block });
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(block);
      before.setEnd(r.startContainer, r.startOffset);
      const tail = document.createRange();
      tail.selectNodeContents(block);
      tail.setStart(r.startContainer, r.startOffset);
      let lastBefore = before.cloneContents().lastChild;
      while (lastBefore && lastBefore.nodeType === 3 && !lastBefore.data) lastBefore = lastBefore.previousSibling;
      const tailFrag = tail.cloneContents();
      const tailEmpty = !tailFrag.textContent.replace(/\u200b/g, '') && !tailFrag.querySelector('img') && Array.from(tailFrag.querySelectorAll('*')).every((n) => n.nodeName === 'BR');
      if (lastBefore && lastBefore.nodeName === 'BR' && tailEmpty) {
        // курсор на пустой последней строке плашки: убираем её перенос и заглушку и выходим в новый чистый абзац
        const lineBreaks = Array.from(block.querySelectorAll(':scope > br'));
        const beforeBreaks = lineBreaks.filter((b) => r.comparePoint(b, 0) < 0);
        const afterBreaks = lineBreaks.filter((b) => !beforeBreaks.includes(b));
        beforeBreaks[beforeBreaks.length - 1]?.remove();
        afterBreaks.forEach((b) => b.remove());
        if (!block.textContent && !block.querySelector('br, img')) block.appendChild(document.createElement('br'));
        const next = emptyBlock(document);
        block.after(next);
        this.afterChange({ immediate: true, focus: next });
        return;
      }
      document.execCommand('insertLineBreak');
      this.afterChange({ immediate: true });
      return;
    }

    if (type === 'pre') {
      e.preventDefault();
      this.history.commit();
      const before = document.createRange();
      before.selectNodeContents(block);
      before.setEnd(r.startContainer, r.startOffset);
      const after = document.createRange();
      after.selectNodeContents(block);
      after.setStart(r.endContainer, r.endOffset);
      const textBefore = before.toString();
      const textAfter = after.toString();
      if (r.collapsed && /^\n?$/.test(textAfter) && (textBefore.endsWith('\n') || !textBefore)) {
        // Enter на пустой последней строке — выходим из блока кода
        const codeEl = ensureCode(block, document);
        codeEl.textContent = textBefore.replace(/\n$/, '');
        if (!codeEl.textContent) codeEl.appendChild(document.createElement("br"));
        let next = block.nextElementSibling;
        if (!next || !isEmptyBlock(next) || blockType(next) !== 'p') {
          next = emptyBlock(document);
          block.after(next);
        }
        this.afterChange({ immediate: true, focus: next });
        return;
      }
      r.deleteContents();
      const nl = document.createTextNode('\n');
      r.insertNode(nl);
      // в конце блока браузеру нужен ещё один перенос, чтобы показать новую строку
      if (!textAfter) nl.after(document.createTextNode('\n'));
      block.querySelectorAll('br').forEach((br) => br.remove());
      // номера строк — сразу (раньше обновлялись только после ввода символа, проверка 22.11); перенос для показа в конце блока не считается
      if (block.hasAttribute('data-nums')) setNumsAttrs(block, (block.textContent.match(/\n/g) || []).length + (textAfter ? 1 : 0));
      const nr = document.createRange();
      nr.setStartAfter(nl);
      nr.collapse(true);
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(nr);
      this.afterChange({ immediate: true });
      return;
    }

    if (/^h[2-6]$/.test(type) && r.collapsed) {
      if (isAtEnd(block, r)) {
        e.preventDefault();
        this.history.commit();
        const p = emptyBlock(document);
        block.after(p);
        this.afterChange({ immediate: true, focus: p });
        return;
      }
      if (isAtStart(block, r) && !isEmptyBlock(block)) {
        e.preventDefault();
        this.history.commit();
        block.before(emptyBlock(document));
        this.afterChange({ immediate: true });
        return;
      }
    }

    if (type === 'blockquote' && r.collapsed) {
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      const p = n.closest('blockquote > p');
      if (p && isEmptyBlock(p)) {
        e.preventDefault();
        this.history.commit();
        p.remove();
        const np = emptyBlock(document);
        block.after(np);
        if (!block.textContent.trim()) block.remove();
        this.afterChange({ immediate: true, focus: np });
        return;
      }
    }

    // Абзац: новая строка — всегда чистый абзац слева (заказчик 23.11): браузер копировал выравнивание, якорь и класс абзаца
    // и продолжал «Код», цвет, жирный из конца строки. Хвост за курсором переносится со своим оформлением — это его текст.
    if (type === 'p' && r.collapsed && block.parentNode) {
      e.preventDefault();
      this.history.commit();
      const p = emptyBlock(document);
      if (isAtStart(block, r) && !isEmptyBlock(block)) {
        block.before(p);
        this.afterChange({ immediate: true });
        return;
      }
      if (!isAtEnd(block, r)) {
        const tail = document.createRange();
        tail.selectNodeContents(block);
        tail.setStart(r.startContainer, r.startOffset);
        const frag = tail.extractContents();
        // пустые обёртки на стыке (<code></code>, <b></b>) не переносим и не оставляем
        const dropEmpty = (root) => root.querySelectorAll('*').forEach((n) => { if (!n.textContent && !n.querySelector('br, img') && !/^(BR|IMG)$/.test(n.nodeName)) n.remove(); });
        dropEmpty(frag);
        dropEmpty(block);
        if (frag.textContent || frag.querySelector('img')) p.replaceChildren(frag);
        if (!block.textContent && !block.querySelector('br, img')) block.appendChild(document.createElement('br'));
        // хвост — тот же текст: цвет текста абзаца уходит с ним (1.0.4); новая пустая строка в конце — чистая (решение 23.11)
        const tc = tcOfBlock(block);
        if (tc && p.textContent) p.classList.add(`ted-tc-${tc}`);
        // курсор в начале абзаца: цвет остаётся у текста, пустая строка выше — чистая (ветка выше)
      }
      block.after(p);
      this.afterChange({ immediate: true, focus: p });
      return;
    }

    // остальное — штатный Enter браузера; фиксируем точку отмены
    this.history.commit();
  }

  onBackspace(e) {
    const r = getRange(this.editable);
    if (!r || !r.collapsed) return;
    const ed = this.editable;
    const block = topBlockOf(ed, r.startContainer);
    if (!block) return;
    const type = blockType(block);

    if (!isAtStart(block, r)) return;

    // заголовок / код / цитата в начале → обычный текст (как в Notion)
    if (/^h[2-6]$/.test(type) || type === 'pre' || type === 'blockquote') {
      e.preventDefault();
      this.history.commit();
      convertBlocks(ed, [block], 'p');
      normalizeRoot(ed);
      this.afterChange({ immediate: true });
      return;
    }

    // перед блоком блок без текста (картинка, линия, HTML-блок): Backspace выделяет его, а не удаляет (проверка 22.11, как в Notion);
    // пустая строка при этом убирается. Второй Backspace удаляет выделенный блок с «Блок удалён · Отменить»
    const prev = block.previousElementSibling;
    const pt = blockType(prev);
    if (pt === 'raw' || isObjectBlock(prev)) {
      e.preventDefault();
      if (isEmptyBlock(block) && block.parentNode === ed) {
        this.history.commit();
        block.remove();
        this.afterChange({ immediate: true });
      }
      this.selectObject(prev);
      return;
    }

    // первый пункт списка в начале → выносим из списка
    if ((type === 'ul' || type === 'ol')) {
      const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
      const li = n.closest('li');
      if (li && li.parentNode === block && li === block.firstElementChild && isAtStart(li, r)) {
        e.preventDefault();
        this.history.commit();
        this.outdent(li);
        this.afterChange({ immediate: true });
      }
    }
  }

  onTab(e) {
    const r = getRange(this.editable);
    if (!r) return;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const block = topBlockOf(this.editable, r.startContainer);
    if (blockType(block) === 'pre') {
      e.preventDefault();
      this.history.commit();
      // табуляция — текстом в месте курсора, курсор после неё (insertText ставил её после курсора: «a», Tab, «b» → «ab⇥», проверка 22.11)
      r.deleteContents();
      const tab = document.createTextNode('\t');
      r.insertNode(tab);
      const after = document.createRange();
      after.setStartAfter(tab);
      after.collapse(true);
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(after);
      this.editable.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '\t' }));
      return;
    }
    const li = n.closest('li');
    // в обычном тексте (абзац, заголовок, цитата, выноска, автор) Tab ничего не делает: курсор не уходит из текста на строку «+»
    if (!li || !this.editable.contains(li)) { e.preventDefault(); return; }
    // плюсы и минусы, шаги, ключевые цифры: вложенности нет — Tab не делает вложенный список и не выносит пункт из карточки
    if (li.closest('ul.ted-proscons, ol.ted-steps, ul.ted-facts')) { e.preventDefault(); return; }
    e.preventDefault();
    this.history.commit();
    if (e.shiftKey) this.outdent(li);
    else this.indent(li);
    this.afterChange({ immediate: true });
  }

  indent(li) {
    const prev = li.previousElementSibling;
    if (!prev) return;
    const list = li.parentNode;
    withMarkers(this.editable, () => {
      let nested = prev.lastElementChild;
      if (!nested || nested.tagName !== list.tagName) {
        nested = document.createElement(list.tagName.toLowerCase());
        prev.appendChild(nested);
      }
      nested.appendChild(li);
    });
  }

  outdent(li) {
    const list = li.parentNode;
    const parentLi = list.parentNode;
    withMarkers(this.editable, () => {
      // пункты после текущего становятся его вложенными
      const rest = [];
      for (let s = li.nextElementSibling; s; s = s.nextElementSibling) rest.push(s);

      if (parentLi && parentLi.tagName === 'LI') {
        if (rest.length) {
          const sub = document.createElement(list.tagName.toLowerCase());
          rest.forEach((x) => sub.appendChild(x));
          li.appendChild(sub);
        }
        parentLi.after(li);
        if (!list.children.length) list.remove();
        return;
      }

      // верхний уровень: пункт превращается в абзац, список делится на два
      const p = document.createElement('p');
      for (const c of Array.from(li.childNodes)) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) continue;
        p.appendChild(c);
      }
      if (!p.firstChild) p.appendChild(document.createElement('br'));
      const nestedLists = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL');
      const tail = document.createElement(list.tagName.toLowerCase());
      for (const nl of nestedLists) for (const x of Array.from(nl.children)) tail.appendChild(x);
      rest.forEach((x) => tail.appendChild(x));
      list.after(p);
      if (tail.children.length) p.after(tail);
      li.remove();
      if (!list.children.length) list.remove();
    });
  }

  onPaste(e) {
    const cd = e.clipboardData;
    if (!cd) return;
    e.preventDefault();
    const r = getRange(this.editable);
    if (!r) return;
    const html = cd.getData('text/html');
    // вставка из Word / Google Docs — сообщаем, что лишнее форматирование очищено
    if (/mso-|class="?Mso|<o:p/i.test(html)) this.toast('Форматирование Word очищено');
    else if (/docs-internal-guid/i.test(html)) this.toast('Форматирование Google Docs очищено');
    const text = cd.getData('text/plain');
    const block = topBlockOf(this.editable, r.startContainer);
    if (blockType(block) !== 'pre' && !text.trim() && this.blockUis.some((u) => u.pasteFiles && u.pasteFiles(e, block))) return;   // файлы — блоку, который их берёт (медиа)
    // таблица из Excel / Google Таблиц: в пустой абзац — новая таблица, в ячейку — заполнение
    if (blockType(block) !== 'pre' && this.blockUis.some((u) => u.onPaste && u.onPaste(cd, block, r))) return;
    // вставили одну ссылку (заказчик 17.11): она сразу становится ссылкой, а под абзацем — выбор «как показать»
    // (видео, изображение, карточка встраивания). Закрыли выбор — остаётся простая ссылка.
    const url = text.trim();
    const htmlText = html ? (() => { const t = document.createElement('template'); t.innerHTML = html; return t.content.textContent.trim(); })() : '';
    if (blockType(block) !== 'pre' && r.collapsed && /^https?:\/\/\S+$/i.test(url) && (!html || htmlText === url)) {
      this.history.commit();
      const link = h('a', { href: url, text: url, target: this.options.linkBlank ? '_blank' : null, rel: this.options.linkBlank ? 'noopener' : null });
      const range = r.cloneRange();
      range.insertNode(link);
      range.setStartAfter(link);
      range.collapse(true);
      this.editable.focus({ preventScroll: true });
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      normalizeRoot(this.editable);
      this.afterChange({ immediate: true });
      if (link.isConnected) this.blockUis.some((u) => u.pasteLink && u.pasteLink(url, link, topBlockOf(this.editable, link)));   // «как показать ссылку» (медиа)
      return;
    }
    this.history.commit();

    if (blockType(block) === 'pre') {
      // код вставляем одним текстовым узлом: insertText с переводами строк разбил бы его на отдельные блоки
      const plain = text.replace(/\r\n?/g, '\n');
      const code = ensureCode(block, document);
      if (!code.contains(r.startContainer) || !code.contains(r.endContainer)) { r.selectNodeContents(code); r.collapse(false); }
      r.deleteContents();
      if (!code.textContent) { code.replaceChildren(); r.selectNodeContents(code); r.collapse(true); }
      const node = document.createTextNode(plain);
      r.insertNode(node);
      const nr = document.createRange();
      nr.setStartAfter(node);
      nr.collapse(true);
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(nr);
      code.normalize();
      normalizeRoot(this.editable);
      this.afterChange({ immediate: true });
      return;
    }

    // вставили ссылку поверх выделенного текста — делаем ссылку
    if (!html && /^(https?:\/\/|mailto:)\S+$/i.test(text.trim()) && !r.collapsed) {
      document.execCommand('createLink', false, text.trim());
      this.afterChange({ immediate: true });
      return;
    }

    let clean;
    try {
    if (html) {
      clean = this.blankLinks(serializeBlocks(this.restrict(imagesFromRaw(withoutTokens(() => sanitizeHTML(html))))));
    } else if (this.options.markdown !== false && looksLikeMarkdown(text)) {
      // вставили Markdown обычным текстом (из нейросети, заметок, .md): заголовки, списки, таблицы, код — блоками (22.11)
      clean = this.blankLinks(serializeBlocks(this.restrict(imagesFromRaw(withoutTokens(() => sanitizeHTML(markdownToHtml(text)))))));
    } else {
      clean = text
        .replace(/\r\n?/g, '\n')
        .split(/\n{2,}/)
        .map((para) => `<p>${escapeHTML(para).replace(/\n/g, '<br>')}</p>`)
        .join('');
    }
    if (!clean) return;

    // один абзац — вставляем как строку, без разрыва блока
    const tpl = document.createElement('template');
    tpl.innerHTML = clean;
    const kids = tpl.content.children;
    if (kids.length === 1 && kids[0].tagName === 'P') clean = kids[0].innerHTML;

    const mediaBefore = new Set(this.editable.querySelectorAll(`${wrapSelector()}, .ted-ui-raw`));
    if (!document.execCommand('insertHTML', false, clean)) throw new Error('insertHTML');
    // вставленные изображения, галереи и прочие медиа — обычные блоки медиа (раньше становились нередактируемым HTML)
    for (const raw of this.editable.querySelectorAll(':scope > .ted-ui-raw, .ted-ui-host > .ted-ui-raw')) {
      const rd = raw.firstElementChild ? defOf(raw.firstElementChild) : null;   // блок с обёрткой правки (медиа) — обычным блоком
      if (mediaBefore.has(raw) || !rd || !rd.wrap) continue;
      raw.replaceWith(sanitizeNodes([raw.firstElementChild]));
    }
    normalizeRoot(this.editable);
    this.afterChange({ immediate: true });
    this.refreshBlockUis();
    for (const u of this.blockUis) if (u.afterPaste) u.afterPaste(mediaBefore);   // картинки с чужих сайтов — на свой сервер, сжатыми (заказчик 17.11)
    } catch (err) {
      // вставка не удалась (битый буфер, запрет браузера) — не молчим
      this.toast('Не удалось вставить');
    }
  }
}

/**
 * Вставка: одиночная картинка со страницы (<img>, <picture>, чужой <figure> с подписью) — блок «Изображение», а не «сырой» HTML
 * (раньше вставала как есть: без стилей, шире колонки — заказчик 17.11). Дальше её скачивает и сжимает сервер (fetchExternal).
 */
function imagesFromRaw(frag) {
  for (const raw of frag.querySelectorAll('.ted-ui-raw')) {
    const el = raw.firstElementChild;
    if (!el || raw.children.length !== 1) continue;
    for (const d of registeredBlocks()) {
      const made = d.fromRaw ? d.fromRaw(el, document) : null;   // блок забирает элемент себе (blocks/<тип>/<тип>.js → fromRaw)
      if (made) { raw.replaceWith(made); break; }
    }
  }
  return frag;
}

/** Адреса своих файлов в HTML — от блоков, у которых они есть (медиа: blocks/media → filesOf). */
function filesOf(html, base) {
  const out = new Set();
  for (const fn of new Set(registeredBlocks().map((d) => d.filesOf).filter(Boolean))) for (const url of fn(html, base)) out.add(url);
  return out;
}

function normalizeUrl(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:|\/|#|\.)/i.test(s)) return s;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return `mailto:${s}`;
  if (/^\+?[\d\s()-]{7,}$/.test(s)) return `tel:${s.replace(/[\s()-]/g, '')}`;
  if (/^[^\s/]+\.[^\s]+/.test(s)) return `https://${s}`;
  return s;
}

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
