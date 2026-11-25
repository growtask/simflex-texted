// Своя история изменений (Ctrl+Z / Ctrl+Y).
// Браузерный undo ломается, как только DOM меняется скриптом, поэтому
// храним снимки содержимого вместе с позицией курсора.
// Набор текста группируется: снимок делается после паузы.

import { saveSelection, restoreSelection } from './selection.js';
import { wrapSelector } from './registry.js';

// Служебные атрибуты интерфейса не должны попадать в историю
const UI_ATTRS = / data-tedui-[a-z-]+="[^"]*"/g;

export class History {
  constructor(root, { limit = 300, delay = 500, onRestore = null } = {}) {
    this.root = root;
    this.limit = limit;
    this.delay = delay;
    this.onRestore = onRestore;
    this.stack = [];
    this.index = -1;
    this.timer = null;
  }

  snapshot() {
    // обёртки правки (медиа) — без их панелей; служебные поля блоков (data-tedui-m: адрес, подпись) — тоже: их собирает интерфейс
    // заново, а восстановленные из снимка остались бы без обработчиков и лишний раз отличали бы снимки (22.11)
    const root = this.root.querySelector(wrapSelector() + ', [data-tedui-m]') ? this.root.cloneNode(true) : this.root;
    if (root !== this.root) root.querySelectorAll('[data-tedui-media-panel], [data-tedui-m]').forEach(node => node.remove());
    return {
      html: root.innerHTML.replace(UI_ATTRS, ''),
      sel: saveSelection(this.root),
    };
  }

  reset() {
    clearTimeout(this.timer);
    this.stack = [this.snapshot()];
    this.index = 0;
  }

  /** Зафиксировать текущее состояние (если оно изменилось). */
  commit() {
    clearTimeout(this.timer);
    this.timer = null;
    const snap = this.snapshot();
    const cur = this.stack[this.index];
    if (cur && cur.html === snap.html) {
      cur.sel = snap.sel || cur.sel;
      return false;
    }
    this.stack.splice(this.index + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
    return true;
  }

  /** Отложенный снимок — для набора текста. */
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.commit(), this.delay);
  }

  canUndo() {
    return this.index > 0 || this.timer !== null;
  }

  canRedo() {
    return this.index < this.stack.length - 1;
  }

  undo() {
    this.commit();
    if (this.index <= 0) return false;
    this.index -= 1;
    this.apply(this.stack[this.index]);
    return true;
  }

  redo() {
    if (this.timer) this.commit();
    if (this.index >= this.stack.length - 1) return false;
    this.index += 1;
    this.apply(this.stack[this.index]);
    return true;
  }

  apply(snap) {
    this.root.innerHTML = snap.html;
    restoreSelection(this.root, snap.sel);
    if (this.onRestore) this.onRestore();
  }
}
