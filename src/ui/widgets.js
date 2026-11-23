// Элементы интерфейса по библиотеке «Симфлекс АИ»: кнопка панели (Tabs/main soft),
// маленькая кнопка (Buttons/icon-small), подсказка (Tooltip/main),
// выпадающая панель (Dropdown/main) с уголком.

import { ICONS } from './icons.js';
import { t, i18nMark, I18N_ATTRS } from '../core/i18n.js';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  // подписи интерфейса — на языке редактора (src/core/i18n.js); русские запоминаются для смены языка на лету
  let ruText;
  let ruAttrs = null;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') { ruText = String(v); el.textContent = t(ruText); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (I18N_ATTRS.includes(k) && typeof v === 'string') { (ruAttrs = ruAttrs || {})[k] = v; el.setAttribute(k, t(v)); }
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    if (typeof c === 'string') { const span = c; el.appendChild(document.createTextNode(t(span))); if (attrs.text === undefined && [].concat(children).length === 1) ruText = span; continue; }
    el.appendChild(c);
  }
  i18nMark(el, ruText, ruAttrs);
  return el;
}

/**
 * Открыто окно админки поверх редактора (файловый менеджер CMS и др.: у <html> класс modal-open) — клавиши (Esc, стрелки)
 * принадлежат ему: обработчики редактора на document их не трогают (иначе Esc закрывал меню редактора, а не менеджер; 22.11).
 */
export function adminModalOpen() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('modal-open');
}

export function icon(name) {
  const tpl = document.createElement('template');
  tpl.innerHTML = ICONS[name] || ICONS.help;
  return tpl.content.firstElementChild;
}

/** Mod+Shift+2 → Ctrl+Shift+2 / ⌘⇧2 */
export function formatKeys(keys) {
  if (!keys) return '';
  if (IS_MAC) return keys.replace(/Mod\+/g, '⌘').replace(/Shift\+/g, '⇧').replace(/Alt\+/g, '⌥');
  return keys.replace(/Mod/g, 'Ctrl');
}

export const keepFocus = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());

/** Кнопка панели: иконка 24 (+ шеврон 24 у выпадающих), p 8, r 12. */
export function button({ name, label, keys, iconName, text, chevron = false, cls = '', soon = 0, onClick }) {
  const btn = h('button', {
    type: 'button',
    class: `ted-ui-btn${soon ? ' is-soon' : ''} ${cls}`.trim(),
    'data-act': name,
    'aria-label': label,
    'data-tip': soon ? `${label} — этап ${soon}` : label,
    'data-keys': keys || null,
  });
  if (iconName) btn.appendChild(icon(iconName));
  if (text) btn.appendChild(h('span', { text }));
  if (chevron) {
    // стрелка списка: открыт список — плавно поворачивается вверх (aria-expanded ставит Popover)
    const arrow = icon('chevron-down');
    arrow.classList.add('ted-ui-btn__chevron');
    btn.appendChild(arrow);
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }
  keepFocus(btn);
  if (onClick && !soon) btn.addEventListener('click', onClick);
  return btn;
}

/** Buttons/icon-small: 24 × 24, r 8. */
export function smallButton({ name, label, iconName, flat = false, onClick }) {
  const btn = h('button', {
    type: 'button',
    class: `ted-ui-small${flat ? ' ted-ui-small--flat' : ''}`,
    'data-act': name,
    'aria-label': label,
    'data-tip': label,
  }, [icon(iconName)]);
  keepFocus(btn);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/** Пункт меню (Dropdown/main item). */
export function menuItem({ value, label, iconName, iconColor = null, active = false, soon = 0, danger = false, submenu = false, onSelect }) {
  const item = h('button', {
    type: 'button',
    class: `ted-ui-item${active ? ' is-active' : ''}${soon ? ' is-soon' : ''}${danger ? ' ted-ui-item--danger' : ''}`,
    'data-value': value,
    role: 'menuitem',
    'aria-disabled': soon ? 'true' : null,
    'data-tip': soon ? `Появится на этапе ${soon}` : null,
  }, [
    iconName ? (() => { const i = icon(iconName); if (iconColor) i.style.color = iconColor; return i; })() : null,
    h('span', { class: 'ted-ui-item__label', text: label }),
    submenu ? icon('chevron-right') : null,
  ]);
  keepFocus(item);
  if (onSelect && !soon) item.addEventListener('click', () => onSelect(value, item));
  return item;
}

// ---------------------------------------------------------------------------
// Подсказки без задержки, под элементом, уголок по центру.
// ---------------------------------------------------------------------------

export class Tooltip {
  constructor(host) {
    this.host = host;
    this.corner = h('div', { class: 'ted-ui-tip__corner' });
    this.body = h('div', { class: 'ted-ui-tip__body' });
    this.el = h('div', { class: 'ted-ui-tip', role: 'tooltip' }, [this.corner, this.body]);
    host.appendChild(this.el);
    this.current = null;
    this.flash = null;
    host.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-tip]');
      if (target === this.current) return;
      this.hide();
      if (!target || !host.contains(target) || target.getAttribute('aria-expanded') === 'true') return;
      this.current = target;
      this.show(target);
    });
    host.addEventListener('mouseleave', () => this.hide());
    host.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.is-soon')) this.hide();
    });
  }

  show(target, text) {
    // открыто меню — подсказки элементов под ним не нужны
    if (!text && this.host.querySelector('.ted-ui-pop:not(.is-closing)') && !target.closest('.ted-ui-pop')) return;
    const keys = target.getAttribute('data-keys');
    this.body.textContent = text || target.getAttribute('data-tip');
    if (keys && !text) this.body.appendChild(h('kbd', { text: formatKeys(keys) }));
    const r = target.getBoundingClientRect();
    this.el.style.left = '0px';
    this.el.style.top = '0px';
    this.el.style.setProperty('--corner-x', '0px');
    const w = this.el.offsetWidth;
    const center = r.left + r.width / 2;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, center - w / 2));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${r.bottom + 4}px`;
    // уголок указывает на элемент, даже если подсказку прижало к краю окна
    this.el.style.setProperty('--corner-x', `${Math.round((center - left - w / 2) * 2)}px`);
    this.el.classList.add('is-visible');
  }

  /** Короткое сообщение у элемента (например, «появится на этапе 5»). */
  notify(target, text) {
    this.current = target;
    this.show(target, text);
    clearTimeout(this.flash);
    this.flash = setTimeout(() => this.hide(), 1600);
  }

  hide() {
    clearTimeout(this.flash);
    this.current = null;
    this.el.classList.remove('is-visible');
  }
}

// ---------------------------------------------------------------------------
// Выпадающая панель с уголком 8×4 (в 24 px от левого края)
// ---------------------------------------------------------------------------

export class Popover {
  constructor(host) {
    this.host = host;
    this.el = null;
    this.anchor = null;
    this.onClose = null;
    this.keyHandler = null;
    this._outside = (e) => {
      if (!this.el) return;
      if (this.el.contains(e.target)) return;
      if (this.child && this.child.el && this.child.el.contains(e.target)) return;
      if (this.parent && this.parent.el && this.parent.el.contains(e.target)) return;
      if (this.anchor && this.anchor.contains && this.anchor.contains(e.target)) return;
      this.close();
    };
    this._key = (e) => {
      if (!this.el || adminModalOpen()) return;
      if (this.child?.isOpen && e.key !== 'Delete') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        return;
      }
      if (this.keyHandler) this.keyHandler(e);
      else if (this.el.querySelector('.ted-ui-item')) this.menuKeys(e);
    };
    this._reflow = () => this.place();
    this.resizeObserver = new ResizeObserver(this._reflow);
  }

  get isOpen() { return !!this.el; }

  /**
   * anchor — элемент или DOMRect. Уголок встаёт над точкой anchorX
   * (по умолчанию — центр иконки кнопки: left + 20).
   */
  open(content, anchor, { cls = '', onClose = null, focus = null, anchorX = null, keyHandler = null, side = null, align = 'start' } = {}) {
    this.close();
    this.side = side;
    this.align = align;   // 'end': окно раскрывается влево от кнопки (уголок у правого края), чтобы не уходить за край
    this.anchor = anchor;
    this.onClose = onClose;
    this.keyHandler = keyHandler;
    this.anchorX = anchorX;
    this.rel = null;
    this.anchorDX = undefined;
    // место курсора до окна — Esc возвращает туда (afterKeyboardClose ставит редактор, проверка 22.11)
    const sel = typeof document !== 'undefined' ? document.getSelection() : null;
    this.returnRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    this.box = h('div', { class: 'ted-ui-pop__box' }, content);
    this.el = h('div', { class: `ted-ui-pop ${cls} is-opening`.trim() }, [h('div', { class: 'ted-ui-pop__corner' }), this.box]);
    const opening = this.el;
    setTimeout(() => opening.classList.remove('is-opening'), 480);   // каскад пунктов — только при открытии, не при фильтре
    this.host.appendChild(this.el);
    this.resizeObserver.observe(this.el);
    if (anchor && anchor.setAttribute) anchor.setAttribute('aria-expanded', 'true');
    this.place();
    // панель целиком в окне — докручиваем страницу плавно, когда редактор уже вытянулся под панель (без рывка)
    const panel = this.el;
    setTimeout(() => {
      if (this.el !== panel) return;
      const bottom = this.host.getBoundingClientRect().top + panel.offsetTop + panel.offsetHeight;
      const overflow = bottom - document.documentElement.clientHeight;
      if (overflow > 0) window.scrollBy({ top: overflow + 8, behavior: 'smooth' });
    }, 120);
    document.addEventListener('mousedown', this._outside, true);
    document.addEventListener('keydown', this._key, true);
    window.addEventListener('resize', this._reflow);
    window.addEventListener('scroll', this._reflow, true);
    if (focus) {
      const f = this.el.querySelector(focus);
      if (f) setTimeout(() => f.focus({ preventScroll: true }), 0);
    }
    return this.el;
  }

  /**
   * Окно настроек блока (решение 22.11): под блоком, левым краем по левому краю блока; уголок касается подложки
   * выбранного блока (8 px вокруг). Якорь живой — окно идёт за блоком, когда он меняет высоту.
   * Не помещается до конца редактора — редактор растёт вниз (grow), окно не переворачивается.
   */
  openUnder(nodes, el, opts = {}) {
    const anchor = {
      getBoundingClientRect: () => {
        // как меню блока (проверка 22.11): подложка выделения 8 вокруг блока, окно — по её левому краю, уголок на 8 ниже неё
        const r = el.getBoundingClientRect();
        const left = r.left - 8;
        return { left, right: left + 56, top: r.bottom + 12, bottom: r.bottom + 12, width: 56, height: 0 };
      },
    };
    return this.open(nodes, anchor, { cls: 'ted-ui-pop--link', focus: '.ted-ui-input', anchorX: (r) => r.left + 28, ...opts });
  }

  /**
   * Панель стоит внутри редактора (position: absolute) и прокручивается вместе с ним,
   * поэтому не отрывается от строки. Не помещается — редактор удлиняется снизу.
   */
  place() {
    if (!this.el || !this.anchor) return;
    const host = this.host.getBoundingClientRect();
    let r;
    if (this.anchor.getBoundingClientRect) {
      r = this.anchor.getBoundingClientRect();
    } else {
      // неподвижная точка (строка с «/», выделение) — пересчитываем от редактора
      if (!this.rel) this.rel = { left: this.anchor.left - host.left, right: this.anchor.right - host.left, top: this.anchor.top - host.top, bottom: this.anchor.bottom - host.top, width: this.anchor.width || 0 };
      r = { left: this.rel.left + host.left, right: this.rel.right + host.left, top: this.rel.top + host.top, bottom: this.rel.bottom + host.top, width: this.rel.width };
    }
    if (this.anchorX !== null && this.anchorX !== undefined && this.anchorDX === undefined) {
      const ax = typeof this.anchorX === 'function' ? this.anchorX(r) : this.anchorX;
      this.anchorDX = ax - r.left;
    }
    const x = this.anchorDX !== undefined ? r.left + this.anchorDX : r.left + Math.min(20, r.width / 2);
    const w = this.el.offsetWidth;
    const viewportWidth = document.documentElement.clientWidth;
    const minL = Math.max(8, 8 - host.left);
    const maxL = Math.min(this.host.clientWidth, viewportWidth - host.left) - w - 8;
    let preferredLeft;
    let top;
    if (this.side === 'right') {
      const parent = this.parent?.el;
      const right = parent ? parent.offsetLeft + parent.offsetWidth + 8 : r.right + 8 - host.left;
      const left = parent ? parent.offsetLeft - w - 8 : r.left - w - 8 - host.left;
      preferredLeft = right <= maxL ? right : left;
      // подменю открылось слева — стрелка пункта смотрит влево (заказчик 22.11: «стрелка не в ту сторону»)
      if (this.anchor && this.anchor.classList) this.anchor.classList.toggle('is-sub-left', right > maxL);
      top = r.top - 12 - host.top;
      if (right > maxL && left < minL && parent) {
        preferredLeft = parent.offsetLeft;
        top = parent.offsetTop + parent.offsetHeight + 8;
      }
    } else {
      // уголок 8 px шириной стоит в 24 px от края → центр уголка = left + 28
      preferredLeft = this.align === 'end' ? x + 28 - w - host.left : x - 28 - host.left;
      top = r.bottom + 4 - host.top;
    }
    const left = Math.max(minL, Math.min(maxL, preferredLeft));
    this.el.style.setProperty('--corner-x', `${Math.max(16, Math.min(w - 24, x - host.left - left - 4))}px`);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${Math.max(0, top)}px`;
    if (this.child?.isOpen) this.child.place();
    else (this.parent || this).grow();
  }

  /** Основное меню и подменю делят один запас высоты редактора. */
  grow() {
    const panels = this.host.querySelectorAll(':scope > .ted-ui-pop, :scope > .ted-ui-picker');
    const bottom = Math.max(0, ...Array.from(panels, (panel) => panel.offsetTop + panel.offsetHeight + 16));
    if (bottom) this.host.style.setProperty('--ted-pop-min-height', `${bottom}px`);
    else this.host.style.removeProperty('--ted-pop-min-height');
  }
  close(byKeyboard = false) {
    if (!this.el) return;
    if (this.child) this.child.close();
    const el = this.el;
    this.resizeObserver.unobserve(el);
    const cb = this.onClose;
    if (this.anchor && this.anchor.setAttribute) this.anchor.setAttribute('aria-expanded', 'false');
    this.owner = null;
    this.el = null;
    this.anchor = null;
    this.onClose = null;
    this.keyHandler = null;
    document.removeEventListener('mousedown', this._outside, true);
    document.removeEventListener('keydown', this._key, true);
    window.removeEventListener('resize', this._reflow);
    window.removeEventListener('scroll', this._reflow, true);
    el.classList.add('is-closing');
    setTimeout(() => {
      el.remove();
      (this.parent || this).grow();
    }, 100);
    if (cb) cb(byKeyboard);
    if (byKeyboard && this.afterKeyboardClose) this.afterKeyboardClose(this.returnRange);
  }

  /** Простое меню из пунктов. items: [{value,label,icon,soon}] или '-' (линия). */
  menu(items, anchor, { cls = '', active = null, onSelect, onClose } = {}) {
    const nodes = items.map((it) => (it === '-'
      ? h('div', { class: 'ted-ui-pop__line' })
      : menuItem({
        value: it.value,
        label: it.label,
        iconName: it.icon,
        iconColor: it.iconColor,
        active: it.value === active,
        soon: it.soon,
        danger: it.danger,
        submenu: it.submenu,
        onSelect: (v, item) => {
          if (it.submenu) return it.onOpen && it.onOpen(item);
          this.close();
          onSelect(v);
        },
      })));
    const el = this.open(nodes, anchor, { cls, onClose });
    el.setAttribute('role', 'menu');
    return el;
  }

  menuKeys(e) {
    const items = Array.from(this.el.querySelectorAll('.ted-ui-item:not(.is-soon)'));
    if (!items.length) return;
    let i = items.findIndex((x) => x.classList.contains('is-focus'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (i < 0) i = items.findIndex((x) => x.classList.contains('is-active'));
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
      items.forEach((x) => x.classList.remove('is-focus'));
      items[i].classList.add('is-focus');
      items[i].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter' && i >= 0) {
      e.preventDefault();
      e.stopPropagation();
      items[i].click();
    }
  }
}

// ---------------------------------------------------------------------------
// Тостеры (Feedback/toast из дизайн-системы): чёрная плашка внизу по центру,
// текст 13, действие #63A1F7 (без значка, решение 22.11), таймер 2 px. Не больше трёх одновременно.
// Контейнер лежит в body (fixed), поэтому не обрезается контейнерами с overflow.
// ---------------------------------------------------------------------------

export class Toaster {
  constructor() {
    this.stack = h('div', { class: 'ted-ui-toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(this.stack);
  }

  show(text, { action = null, onAction = null, timeout = 3500, dark = false, status = '' } = {}) {
    // не больше трёх: лишние старые закрываем (считаем только те, что ещё не закрываются —
    // закрывающийся тост удаляется по таймеру, и ждать его в цикле нельзя)
    const open = Array.from(this.stack.children).filter((t) => !t.classList.contains('is-closing'));
    while (open.length >= 3) this.close(open.shift());
    const timer = h('span', { class: 'ted-ui-toast__timer' });
    timer.style.animationDuration = `${timeout}ms`;
    // dark — страница тёмная: тостер светлый (иначе чёрный сливается с фоном). Только в редакторе, в дизайн-системе такого варианта нет
    const variant = status === 'success' || status === 'error' ? ` ted-ui-toast--${status}` : dark ? ' ted-ui-toast--on-dark' : '';
    const toast = h('div', { class: `ted-ui-toast${variant}` }, [
      h('p', { class: 'ted-ui-toast__text', text }),
      action ? h('button', { type: 'button', class: 'ted-ui-toast__action' }, [h('span', { text: action })]) : null,
      timer,
    ]);
    if (action) {
      toast.querySelector('button').addEventListener('click', () => {
        if (onAction) onAction();
        this.close(toast);
      });
    }
    // пока курсор над тостом — таймер стоит
    let left = timeout;
    let started = Date.now();
    let id = setTimeout(() => this.close(toast), left);
    toast.addEventListener('mouseenter', () => { clearTimeout(id); left -= Date.now() - started; timer.style.animationPlayState = 'paused'; });
    toast.addEventListener('mouseleave', () => { started = Date.now(); id = setTimeout(() => this.close(toast), Math.max(300, left)); timer.style.animationPlayState = 'running'; });
    toast.addEventListener('mouseenter', () => this.layout(true));
    toast.addEventListener('mouseleave', () => setTimeout(() => { if (!this.stack.matches(':hover')) this.layout(false); }, 30));
    this.stack.appendChild(toast);
    this.layout(false);
    return toast;
  }

  /** Колода: новое уведомление спереди, старые за ним — чуть меньше и выглядывают сверху; expanded — списком (наведение). */
  layout(expanded) {
    const list = Array.from(this.stack.children).filter((t) => !t.classList.contains('is-closing')).reverse();   // новое — первое
    let y = 0;
    list.forEach((t, k) => {
      if (expanded) {
        t.style.setProperty('--toast-y', `${-y}px`);
        t.style.setProperty('--toast-scale', '1');
        y += t.offsetHeight + 8;
      } else {
        t.style.setProperty('--toast-y', `${-k * 8}px`);
        t.style.setProperty('--toast-scale', String(1 - k * 0.05));
      }
      t.toggleAttribute('data-back', !expanded && k > 0);
      t.style.zIndex = String(10 - k);
    });
  }

  close(toast) {
    if (!toast || toast.classList.contains('is-closing')) return;
    toast.classList.add('is-closing');
    this.layout(this.stack.matches(':hover'));
    setTimeout(() => toast.remove(), 160);
  }

  destroy() {
    this.stack.remove();
  }
}
