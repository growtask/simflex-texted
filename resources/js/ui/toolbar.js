// Верхняя панель (макет editor-toolbar). Кнопки по центру; не помещаются —
// панель прокручивается по горизонтали. Набор зависит от выбранного:
//   default — ничего не выбрано: стиль ▾, выравнивание ▾, цвет ▾ | вставка блоков | помощь, режим
//   text    — курсор в тексте:    стиль ▾, выравнивание ▾, цвет ▾ | B I U S код ссылка якорь | удалить, ✨ | помощь, режим
//   view    — режим просмотра:    только кнопка режима
// Кнопки будущих этапов показаны как в макете, по клику — подсказка «появится на этапе N».

import { h, button, icon, formatKeys, menuItem, keepFocus } from './widgets.js';
import { t, getLang } from '../core/i18n.js';
import { exchangeItems } from './exchange.js';
import { styleTypes, blockAllowed, tcAllowed, bgAllowed, tcOfBlock, bgOfBlock } from '../core/blocks.js';
import { HOTKEYS, keysFor } from '../core/keys.js';
import { isObjectType, blockDef, registeredBlocks, defOf } from '../core/registry.js';

/** Инструкция в «Помощи» — тексты шагов из макета (editor-help-text, step-text-1…4). */
export const HELP_STEPS = [
  'Добавить блок: нажмите «/» в пустой строке или «+» слева.',
  'Все блоки с примерами: кнопка «Все блоки» на панели.',
  'Панель сверху меняется под выбранный блок. Выделите текст, чтобы его оформить.',
  'Поменять порядок: перетащите блок за ручку. Клик по ручке открывает меню с удалением.',
];

/** «Помощь» → «Статья с помощью нейросети» (решение заказчика 22.11). */
export const AI_STEPS = [
  '«Ещё» → «Скопировать промт». Вставьте промт в нейросеть (ChatGPT, YandexGPT, GigaChat…) и добавьте после него текст или тезисы статьи.',
  'Нейросеть вернёт статью в Markdown или JSON. Сохраните ответ файлом .md или .json и загрузите: «Ещё» → «Загрузить .md или .json». Статья заменится, вернуть прежнюю — «Отменить».',
  'Можно проще: скопируйте ответ нейросети и вставьте в редактор — заголовки, списки, таблицы и код станут блоками.',
  'Проверьте факты и ссылки: нейросеть может ошибаться. Картинки загрузите в блоки «Изображение» сами.',
  'Чтобы доработать статью в нейросети, «Ещё» → «Выгрузить в Markdown» и отправьте файл ей вместе с просьбой.',
];

const ALIGNS = [
  { value: 'left', label: 'Слева', icon: 'align-left' },
  { value: 'center', label: 'По центру', icon: 'align-center' },
  { value: 'right', label: 'Справа', icon: 'align-right' },
];

export class Toolbar {
  constructor(editor) {
    this.editor = editor;
    this.pop = editor.popover;
    const run = (cmd) => () => editor.exec(cmd);
    const soon = (stage) => (e) => editor.toast(`«${e.currentTarget.getAttribute('aria-label')}» появится на этапе ${stage}`);
    const b = (o) => {
      const btn = button(o);
      if (o.soon) btn.addEventListener('click', soon(o.soon));
      return btn;
    };

    // общие для default и text
    this.styleBtn = b({ name: 'style', label: 'Стиль текста', iconName: 'type', chevron: true, onClick: () => this.openStyleMenu() });
    this.alignBtn = b({ name: 'align', label: 'Выравнивание', iconName: 'align-left', chevron: true, onClick: () => this.openAlignMenu() });
    this.colorBtn = b({ name: 'color', label: 'Цвет', iconName: 'color', chevron: true, onClick: () => this.openColorMenu() });

    this.common = [this.styleBtn, this.alignBtn, this.colorBtn];

    // default: вставка блоков
    // «Все блоки»: вставка после блока с курсором (если курсора нет — в конец)
    this.allBlocksBtn = b({ name: 'all', label: 'Все блоки', iconName: 'layout-list', onClick: () => editor.blockMenu.openPicker((editor.isFocused() && editor.currentBlock()) || editor.lastBlock()) });
    // «Медиа ▾»: изображение, видео, аудио, файл — один выпадающий список (как стиль текста)
    this.mediaBtn = b({ name: 'media', label: 'Медиа', iconName: 'image', chevron: true, onClick: () => this.openMediaMenu() });
    // «Ещё ⋯ ▾»: действия с блоком и документом — список, поэтому со стрелкой, как у всех кнопок со списком (решение заказчика 19.11)
    this.moreBtn = b({ name: 'more', label: 'Ещё', iconName: 'dots-horizontal', chevron: true, onClick: () => this.openMoreMenu() });
    this.magicBtn = b({ name: 'magic', label: 'Форматировать текст', iconName: 'magic', onClick: run('format') });

    // text: форматирование
    this.marks = {
      bold: b({ name: 'bold', label: 'Жирный', iconName: 'bold', keys: keysFor('bold'), onClick: run('bold') }),
      italic: b({ name: 'italic', label: 'Курсив', iconName: 'italic', keys: keysFor('italic'), onClick: run('italic') }),
      underline: b({ name: 'underline', label: 'Подчёркнутый', iconName: 'underline', keys: keysFor('underline'), onClick: run('underline') }),
      strike: b({ name: 'strike', label: 'Зачёркнутый', iconName: 'strike', keys: keysFor('strike'), onClick: run('strike') }),
      code: b({ name: 'code', label: 'Код', iconName: 'code-inline', keys: keysFor('code'), onClick: run('code') }),
      link: b({ name: 'link', label: 'Ссылка', iconName: 'link', keys: keysFor('link'), onClick: run('link') }),
    };
    this.anchorBtn = b({ name: 'anchor', label: 'Якорь', iconName: 'anchor', onClick: run('anchor') });

    // помощь и режим
    this.helpBtn = b({ name: 'help', label: 'Помощь', iconName: 'help', keys: keysFor('help'), onClick: () => this.openHelp() });
    // кнопка режима есть только в просмотре («Редактировать»); в правке глаза нет — только «Сохранить»
    this.modeBtn = b({ name: 'mode', label: 'Редактировать', iconName: 'edit', keys: keysFor('mode'), onClick: () => editor.toggleMode() });
    this.saveBtn = b({ name: 'save', label: 'Сохранить', iconName: 'save', keys: keysFor('save'), onClick: () => editor.save() });
    // сводка в режиме просмотра: слов, время чтения, блоков, состояние сохранения
    this.stats = h('div', { class: 'ted-ui-stats', role: 'status' });
    const tail = [this.helpBtn];
    // «Сохранить» есть там, где есть просмотр (документация, полный экран): сохраняет и уводит в просмотр.
    // В админке (previewMode: false) своё сохранение на странице — в шапке ни «Сохранить», ни глаза; работает Ctrl+S.
    if (editor.options.previewMode !== false) tail.push(this.saveBtn);

    const div = () => h('div', { class: 'ted-ui-divider' });
    this.sets = {
      // стиль ▾ выравнивание ▾ цвет ▾ | медиа ▾, все блоки | ✨, ещё | помощь, сохранить
      default: [...this.common, div(), this.mediaBtn, this.allBlocksBtn, div(), this.magicBtn, this.moreBtn, div(), ...tail],
      // + | B I U S код ссылка якорь | медиа ▾, все блоки, ✨, ещё | помощь, сохранить
      // «Медиа ▾» остаётся и при наборе текста (28.11): вставка как из меню «/» — на место пустого абзаца или под блоком
      text: [...this.common, div(), ...Object.values(this.marks), this.anchorBtn, div(), this.mediaBtn, this.allBlocksBtn, this.magicBtn, this.moreBtn, div(), ...tail],
      // editor-toolbar style=line; «Цвет» — у разделителя, кнопки, товара (фон и текст, 1.0.4), у остальных скрыт
      line: [this.colorBtn, this.lineDiv = div(), this.moreBtn, div(), ...tail],
      view: [this.stats, this.modeBtn],
      viewRo: [this.stats],   // только просмотр: сводка без кнопки «Редактировать»
    };

    this.el = h('div', { class: 'ted-ui-toolbar', role: 'toolbar', 'aria-label': 'Панель редактора' });
    this.variant = null;
    // кнопки не помещаются → горизонтальная прокрутка с тонкой полосой
    this.ro = new ResizeObserver(() => this.checkScroll());
    this.ro.observe(this.el);
    // колёсико мыши прокручивает панель по горизонтали, пока она не упрётся в край (дальше — страница)
    this.el.addEventListener('wheel', (e) => {
      const max = this.el.scrollWidth - this.el.clientWidth;
      if (max <= 1 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const next = Math.max(0, Math.min(max, this.el.scrollLeft + e.deltaY));
      if (next === this.el.scrollLeft) return;
      e.preventDefault();
      this.el.scrollLeft = next;
    }, { passive: false });
  }

  destroy() {
    if (this.ro) this.ro.disconnect();
  }

  checkScroll() {
    // ширина кнопок без анимации: при смене набора кнопки плавно переезжают (FLIP) и scrollWidth на время переезда больше
    const cs = getComputedStyle(this.el);
    const kids = [...this.el.children].filter((el) => el.offsetWidth);
    const need = kids.reduce((sum, el) => sum + el.offsetWidth, 0) + Math.max(0, kids.length - 1) * (parseFloat(cs.columnGap) || 0)
      + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    this.el.classList.toggle('is-scroll', need > this.el.clientWidth + 1);
    // толщина полосы как в браузере: Chrome — 4 px (::-webkit-scrollbar), Firefox — 0 (полоса поверх) или своя; высота шапки та же
    if (this.el.classList.contains('is-scroll')) {
      const sb = this.el.offsetHeight - this.el.clientHeight - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.borderBottomWidth) || 0);
      this.el.style.setProperty('--ted-ui-sb', Math.max(0, Math.min(8, Math.round(sb))) + 'px');
    }
  }

  setVariant(name) {
    if (this.variant === name) return;
    const first = this.variant === null;
    this.variant = name;
    this.el.dataset.variant = name;
    // позиции до смены: общие кнопки не прыгают, а плавно переезжают (FLIP), новые появляются
    const before = new Map();
    if (!first) for (const el of this.el.children) before.set(el, el.getBoundingClientRect());
    const scroll = this.el.scrollLeft;
    this.el.replaceChildren(...this.sets[name]);
    this.el.scrollLeft = scroll;
    this.checkScroll();
    const calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (first || calm || !this.el.animate) return;
    const ease = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
    for (const el of this.el.children) {
      const was = before.get(el);
      if (was) {
        const dx = was.left - el.getBoundingClientRect().left;
        if (Math.abs(dx) > 0.5) el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'none' }], { duration: 220, easing: ease });
      } else {
        el.animate([{ opacity: 0, transform: 'scale(0.8)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: ease });
      }
    }
  }

  /** Сводка для режима просмотра: слов · символов · время чтения · блоков (из editor.getStats()). */
  refreshStats() {
    const s = this.editor.getStats();
    if (getLang() === 'en') {
      const en = (n, one, many) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
      this.stats.textContent = [en(s.words, 'word', 'words'), en(s.chars, 'character', 'characters'), `${s.minutes} min read`, en(s.blocks, 'block', 'blocks')].join(' · ');
      return;
    }
    const plural = (n, one, few, many) => {
      const m = n % 100, d = n % 10;
      const f = m > 10 && m < 15 ? many : d === 1 ? one : d > 1 && d < 5 ? few : many;
      return `${n.toLocaleString('ru-RU')} ${f}`;
    };
    this.stats.textContent = [
      plural(s.words, 'слово', 'слова', 'слов'),
      plural(s.chars, 'символ', 'символа', 'символов'),
      `чтение ${s.minutes} мин`,
      plural(s.blocks, 'блок', 'блока', 'блоков'),
    ].join(' · ');
  }

  update(state) {
    const { type, align, marks, mode, focused } = state;
    if (mode !== 'edit') {
      this.setVariant(this.editor.options.readOnly ? 'viewRo' : 'view');
      this.refreshStats();
    } else {
      if (!focused) this.setVariant('default');
      else this.setVariant(type === 'raw' || isObjectType(type) ? 'line' : 'text');   // блок без текста — панель «line»
    }

    // кнопка «Редактировать» видна только в просмотре; глаза в режиме правки больше нет
    const viewing = mode !== 'edit';
    if (viewing) return;

    const alignIcon = (ALIGNS.find((a) => a.value === align) || ALIGNS[0]).icon;
    if (this.alignBtn.dataset.icon !== alignIcon) {
      this.alignBtn.firstElementChild.replaceWith(icon(alignIcon));
      this.alignBtn.dataset.icon = alignIcon;
    }
    // кнопки, которые в этом месте не работают, убираем из панели
    const tb = (blockDef(type) || {}).toolbar || {};   // block.json → toolbar: что убрать из панели в этом блоке
    // «Цвет»: есть цвет текста или фон (block.json → toolbar.bg; в ответе аккордеона фона нет; фон отключён опцией blocks)
    const parts = this.colorParts();
    this.colorBtn.hidden = !parts.canTc && !parts.canBgMenu;
    if (this.lineDiv) this.lineDiv.hidden = this.colorBtn.hidden;
    this.mediaBtn.hidden = !this.mediaItems().length;
    this.alignBtn.hidden = tb.align === false;   // block.json → toolbar.align: код, чек-лист, шаги, цифры, плюсы и минусы, таблица, кнопка
    this.styleBtn.hidden = tb.style === false;
    // заголовок шага и заголовки h2–h6 и так жирные — «Жирный» в них ничего не меняет, кнопку убираем (сайт texted 27.11, 1.0.4)
    this.marks.bold.hidden = !!state.stepTitle || /^h[2-6]$/.test(type);
    for (const k of ['italic', 'underline', 'strike']) this.marks[k].hidden = false;
    if (Array.isArray(tb.marks)) for (const [k, b] of Object.entries(this.marks)) if (!tb.marks.includes(k)) b.hidden = true;
    this.anchorBtn.classList.toggle('is-active', !!state.anchor);
    for (const [k, btn] of Object.entries(this.marks)) {
      btn.classList.toggle('is-active', !!(marks && marks[k]));
      btn.setAttribute('aria-pressed', marks && marks[k] ? 'true' : 'false');
    }
    this.checkScroll();   // кнопки скрылись или вернулись — полоса прокрутки и её место под кнопками по факту, высота панели не меняется
  }

  // ---------- Выпадающие списки (editor-dropdown) ----------

  openStyleMenu() {
    if (this.pop.isOpen && this.pop.anchor === this.styleBtn) return this.pop.close();
    const ed = this.editor;
    ed.rememberSelection();
    const noCaret = !ed.saved;
    this.pop.menu(styleTypes().filter((t) => blockAllowed(ed.allowedBlocks, t.type)).map((t) => ({ value: t.type, label: t.label, icon: t.icon })), this.styleBtn, {
      cls: 'ted-ui-pop--text',
      active: ed.state.type,
      // курсора в тексте не было (меню открыли, не ставя курсор) — стиль получает новый блок в конце, а не первый блок статьи (1.0.4)
      onSelect: (type) => { if (!noCaret) return ed.exec(`block:${type}`); ed.caretToNewBlock(); ed.exec(`block:${type}`); ed.rememberSelection(); },
      onClose: () => ed.restoreRemembered(),
    });
  }

  openAlignMenu() {
    if (this.pop.isOpen && this.pop.anchor === this.alignBtn) return this.pop.close();
    const ed = this.editor;
    ed.rememberSelection();
    this.pop.menu(ALIGNS, this.alignBtn, {
      cls: 'ted-ui-pop--align',
      active: ed.state.align,
      onSelect: (a) => ed.exec(`align:${a}`),
      onClose: () => ed.restoreRemembered(),
    });
  }

  /**
   * «Цвет» (макет editor-dropdown style=color, точки — решение 28.11): «Текст» и «Фон» — по строке точек Switches/radio-color
   * (Стандартный, Акцентный, Дополнительный, Ошибка, Предупреждение, Успех), название — подсказкой; ниже «Удалить фон».
   * Разделы, которые в этом месте не работают, не показываются.
   */
  openColorMenu() {
    if (this.pop.isOpen && this.pop.anchor === this.colorBtn) return this.pop.close();
    const ed = this.editor;
    ed.rememberSelection();
    // открыли с клавиатуры (Esc → Tab, фокус на панели, курсора в тексте нет): курсор — на последнее место, чтобы меню знало
    // секцию (только для «Цвета»: «Стиль текста» без курсора по-прежнему ставит новый блок)
    if (!ed.saved && !ed.pickedObject() && ed.lastRange && ed.editable.contains(ed.lastRange.startContainer)) {
      ed.saved = ed.lastRange.cloneRange();
      ed.restoreRemembered();
      ed.updateState();
    }
    const { canTc, canBgMenu, obj } = this.colorParts();
    if (!canTc && !canBgMenu) return;
    const curTc = obj ? (tcOfBlock(obj) || 'gray') : (ed.state.tc || 'gray');
    // блок со своей серой плашкой (цифры, выноска, код…) — «Стандартный» отмечен и без класса фона (block → defaultBg)
    const dflt = (el) => { const d = el && defOf(el); const v = d && d.defaultBg; return (typeof v === 'function' ? v(el) : v) || null; };
    const curBg = obj ? (bgOfBlock(obj) || dflt(obj)) : (ed.state.bg || null);
    const COLORS = [['gray', 'Стандартный'], ['color1', 'Акцентный'], ['color2', 'Дополнительный'], ['error', 'Ошибка'], ['alert', 'Предупреждение'], ['success', 'Успех']];
    // наведение (и фокус с клавиатуры) — предпросмотр: цвет сразу примеряется на то, что поменяется (заказчик 28.11)
    const pick = (cmd) => { ed.clearPreview(); this.pop.close(); ed.exec(cmd); };
    const row = (kind, active) => {
      const r = h('div', { class: 'ted-ui-swatches', role: 'radiogroup', 'aria-label': t(kind === 'tc' ? 'Текст' : 'Фон') });
      for (const [name, label] of COLORS) {
        const on = name === active;
        // Tab попадает в ряд на выбранную точку (или первую), дальше — стрелки (радиогруппа, заказчик 28.11)
        const first = active ? on : name === COLORS[0][0];
        const b = h('button', { type: 'button', class: `ted-ui-swatch${on ? ' is-active' : ''}`, role: 'radio', 'aria-checked': String(on), tabindex: first ? '0' : '-1', 'aria-label': t(label), 'data-tip': label, 'data-value': `${kind}:${name}` }, [
          h('span', { class: `ted-ui-swatch__dot ted-ui-swatch--${kind}-${name}` }),
        ]);
        keepFocus(b);
        b.addEventListener('click', () => pick(`${kind}:${name}`));
        b.addEventListener('pointerenter', () => ed.previewColor(`${kind}:${name}`));
        b.addEventListener('focus', () => ed.previewColor(`${kind}:${name}`));
        r.appendChild(b);
      }
      // примерка снимается, когда мышь или фокус ушли с ряда, а не с точки: между точками 4 px, и цвет мигал (заказчик 28.11)
      r.addEventListener('pointerleave', () => ed.clearPreview());
      r.addEventListener('focusout', (e) => { if (!r.contains(e.relatedTarget)) ed.clearPreview(); });
      return r;
    };
    const nodes = [];
    if (canTc) nodes.push(h('div', { class: 'ted-ui-pop__label', text: t('Текст') }), row('tc', curTc));
    if (canTc && canBgMenu) nodes.push(h('div', { class: 'ted-ui-pop__line' }));
    if (canBgMenu) nodes.push(h('div', { class: 'ted-ui-pop__label', text: t('Фон') }), row('bg', curBg));
    // «Сбросить цвет» (заказчик 28.11, вместо «Удалить фон»): секция — к виду по умолчанию: цвет текста, фон, покрашенные слова
    const reset = menuItem({ value: 'color:reset', label: 'Сбросить цвет', iconName: 'no-color', onSelect: () => pick('color:reset') });
    reset.addEventListener('pointerenter', () => ed.previewColor('color:reset'));
    reset.addEventListener('pointerleave', () => ed.clearPreview());
    nodes.push(h('div', { class: 'ted-ui-pop__line' }), reset);
    // Клавиатура (заказчик 28.11): стрелки — по точкам (← →) и между рядами (↑ ↓), точка под рамкой сразу примеряется;
    // Enter или пробел — выбрать; Esc — закрыть (окно). Работает и без фокуса в меню (курсор остаётся в тексте), и с фокусом на точке
    let el = null;
    let pos = null;
    const grid = () => [...el.querySelectorAll('.ted-ui-swatches')].map((r) => [...r.children]).concat([[reset]]);
    const show = (r, c) => {
      const g = grid();
      r = (r + g.length) % g.length;
      c = Math.max(0, Math.min(c, g[r].length - 1));
      pos = [r, c];
      el.querySelectorAll('.is-focus').forEach((x) => x.classList.remove('is-focus'));
      const it = g[r][c];
      it.classList.add('is-focus');
      if (el.contains(document.activeElement) && document.activeElement !== it) it.focus({ preventScroll: true });
      ed.previewColor(it.dataset.value);
    };
    const startPos = () => {
      const g = grid();
      const fromFocus = g.findIndex((row) => row.includes(document.activeElement));
      if (fromFocus >= 0) return [fromFocus, g[fromFocus].indexOf(document.activeElement)];
      const c = g[0].findIndex((x) => x.classList.contains('is-active'));
      return [0, Math.max(0, c)];
    };
    const keyHandler = (e) => {
      const dir = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
      if (dir) {
        e.preventDefault();
        e.stopPropagation();
        if (!pos) pos = startPos();   // первое нажатие — сразу от выбранной точки (или первой) на соседнюю
        const row = grid()[pos[0]];
        if (dir[1]) return show(pos[0], (pos[1] + dir[1] + row.length) % row.length);
        return show(pos[0] + dir[0], pos[1]);
      }
      if ((e.key === 'Enter' || e.key === ' ') && pos) {
        e.preventDefault();
        e.stopPropagation();
        grid()[pos[0]][pos[1]].click();
      }
    };
    el = this.pop.open(nodes, this.colorBtn, { cls: 'ted-ui-pop--align ted-ui-pop--color', keyHandler, onClose: () => { ed.clearPreview(); ed.restoreRemembered(); } });
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', t('Цвет'));
    // фокус Tab-ом на точке: рамка и примерка идут за фокусом (стрелки дальше двигают от неё)
    el.addEventListener('focusin', (e) => { const g = grid(); const r = g.findIndex((row) => row.includes(e.target)); if (r >= 0) { pos = [r, g[r].indexOf(e.target)]; el.querySelectorAll('.is-focus').forEach((x) => x.classList.remove('is-focus')); e.target.classList.add('is-focus'); } });
  }

  /** Что умеет меню «Цвет» в этом месте: цвет текста — блок с текстом; фон — блок с фоном, набор с «Цветным фоном». */
  colorParts() {
    const ed = this.editor;
    const state = ed.state;
    const obj = ed.pickedObject && ed.pickedObject();   // выбран разделитель, кнопка, товар — меню для него
    // у блока без курсора (медиа, файл, карточка…) «Цвет» есть, только если блок сам его разрешил (canBg / canTc)
    if (obj) { const od = defOf(obj) || {}; return { canTc: !!(od.canTc && od.canTc(obj)), canBgMenu: !!(od.canBg && od.canBg(obj)) && blockAllowed(ed.allowedBlocks, 'background'), obj }; }
    const tb = (blockDef(state.type) || {}).toolbar || {};
    const canTc = !!state.canTc;
    const canBgMenu = !(tb.bg === false || !!state.inHost) && blockAllowed(ed.allowedBlocks, 'background');
    return { canTc, canBgMenu };
  }

  /** «Медиа ▾» (editor-dropdown style=media). */
  openMediaMenu() {
    if (this.pop.isOpen && this.pop.anchor === this.mediaBtn) return this.pop.close();
    const editor = this.editor;
    const items = this.mediaItems();
    const anchor = editor.currentBlock() || editor.lastBlock();
    this.pop.menu(items, this.mediaBtn, { cls: 'ted-ui-pop--align', onSelect: (type) => blockDef(type).insert(editor, anchor) });
  }

  /** Пункты «Медиа ▾»: блоки с block.json → insertMenu: 'media', только виды из набора (этап 2). */
  mediaItems() {
    const allowed = this.editor.allowedBlocks;
    return registeredBlocks().filter((d) => d.insertMenu === 'media' && d.insert && blockAllowed(allowed, d.type)).map((d) => ({ value: d.type, label: d.title, icon: d.menu.icon }));
  }

  /** «Ещё ⋯» (editor-dropdown style=more): действия с блоком и документом. */
  openMoreMenu() {
    if (this.pop.isOpen && this.pop.anchor === this.moreBtn) return this.pop.close();
    const ed = this.editor;
    const block = ed.handle.focused || (ed.isFocused() ? ed.currentBlock() : null);
    const line = () => h('div', { class: 'ted-ui-pop__line' });
    const nodes = [
      ...(block ? [menuItem({ value: 'trash', label: 'Удалить блок', iconName: 'trash', onSelect: () => { this.pop.close(); ed.handle.remove(block); } }), line()] : []),
      // перенос статьи и нейросети (22.11): выгрузка / загрузка JSON и Markdown, подменю «Нейросети»
      ...exchangeItems(ed, this.moreBtn),
      line(),
      menuItem({ value: 'clear', label: 'Очистить всё', iconName: 'eraser', onSelect: () => { this.pop.close(); ed.clearAll(); } }),
    ];
    this.pop.open(nodes, this.moreBtn, { cls: 'ted-ui-pop--block', keyHandler: (e) => this.pop.menuKeys(e) }).setAttribute('role', 'menu');
  }

  openHelp() {
    if (this.pop.isOpen && this.pop.anchor === this.helpBtn) return this.pop.close();
    const row = (l, k) => h('div', { class: 'ted-ui-help__row' }, [h('span', { text: l }), h('kbd', { text: k })]);
    const rows = HOTKEYS.filter((k) => !k.hidden).map((k) => row(k.label, formatKeys(k.keys)));
    const extra = [
      ['Меню блоков', '/'],
      ['Новая строка в блоке', 'Shift+Enter'],
      ['Пустая первая строка', 'Enter в начале документа'],
      ['Удалить выбранную секцию', 'Delete'],
      ['Вложить / вынести пункт', 'Tab / Shift+Tab'],
      ['Отметить пункт чек-листа', 'Ctrl+Enter или клик по галочке'],
      ['Выйти из кода', 'Enter на пустой строке'],
      ['Выйти из текста к панели', 'Esc, затем Tab'],
    ].map(([l, k]) => row(l, k));
    // ниже горячих клавиш — инструкция из макета (editor-help-text 7527:121550): шаг — текст и картинка интерфейса (tiles/help-N-light|dark.webp)
    const guide = HELP_STEPS.map((text, i) => h('div', { class: 'ted-ui-help__step' }, [
      h('p', { class: 'ted-ui-help__text', text }),
      h('div', { class: 'ted-ui-help__shot', 'data-step': String(i + 1), role: 'img', 'aria-hidden': 'true' }),
    ]));
    this.pop.open([
      h('div', { class: 'ted-ui-form__head' }, [h('p', { class: 'ted-ui-form__title', text: 'Горячие клавиши' })]),
      ...extra,
      h('div', { class: 'ted-ui-pop__line' }),
      ...rows,
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__head' }, [h('p', { class: 'ted-ui-form__title', text: 'Как работать с редактором' })]),
      h('div', { class: 'ted-ui-help__guide' }, guide),
      // работа с нейросетью (решение заказчика 22.11): промт, ответ файлом или вставкой, выгрузка
      h('div', { class: 'ted-ui-pop__line' }),
      h('div', { class: 'ted-ui-form__head' }, [h('p', { class: 'ted-ui-form__title', text: 'Статья с помощью нейросети' })]),
      h('div', { class: 'ted-ui-help__guide' }, AI_STEPS.map((text) => h('div', { class: 'ted-ui-help__step' }, [h('p', { class: 'ted-ui-help__text', text })]))),
    ], this.helpBtn, { cls: 'ted-ui-pop--help' });
  }
}

