// Один документ в двух вкладках браузера (решение заказчика 22.11): вкладки узнают друг о друге через BroadcastChannel.
// Открыли вторую — обе предупреждают; в другой вкладке сохранили — сохранение здесь сначала спрашивает подтверждение,
// чтобы не перезаписать чужие правки молча. Без BroadcastChannel (старый браузер) — ничего не делает.

// своя страница: редакторы на одной странице (и тесты) друг для друга не «другая вкладка»
const PAGE_ID = Math.random().toString(36).slice(2);

export class Presence {
  /** key — документ (то же, что ключ черновика), onEvent(type) — 'other' (есть другая вкладка), 'saved' (там сохранили). */
  constructor(key, onEvent) {
    this.id = Math.random().toString(36).slice(2);
    this.others = new Set();
    this.otherSaved = false;
    this.onEvent = onEvent;
    if (!key || typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(`ted-doc:${key}`);
    this.channel.onmessage = (e) => this.receive(e.data || {});
    this.send('hello');
  }

  send(type) {
    if (this.channel) this.channel.postMessage({ type, from: this.id, page: PAGE_ID });
  }

  receive({ type, from, page }) {
    if (!from || from === this.id || page === PAGE_ID) return;
    if (type === 'hello') this.send('here');
    if (type === 'hello' || type === 'here') {
      const first = !this.others.size;
      this.others.add(from);
      if (first) this.onEvent('other');
    }
    if (type === 'bye') this.others.delete(from);
    if (type === 'saved') { this.otherSaved = true; this.onEvent('saved'); }
  }

  /** Здесь сохранили: другим вкладкам — сигнал, у себя — чужое сохранение уже учтено. */
  saved() {
    this.otherSaved = false;
    this.send('saved');
  }

  destroy() {
    this.send('bye');
    if (this.channel) this.channel.close();
    this.channel = null;
  }
}
