// Предпросмотр «как на сайте».
// Контент рендерится в iframe нужной ширины (1920 / 1366 / 768 / 414) и
// масштабируется под панель. Внутри iframe работают настоящие медиа-запросы
// и vw — ровно как на сайте, поэтому vw-режим виден честно.

import { h, button } from './widgets.js';

export const SCREENS = [
  { w: 1920, title: 'Десктоп' },
  { w: 1366, title: 'Ноутбук' },
  { w: 768, title: 'Планшет' },
  { w: 414, title: 'Телефон' },
];

// Ширина колонки контента и поля страницы в предпросмотре (пиксели макета)
const PAGE = { desktop: { width: 1000, padY: 64, padX: 40 }, mobile: { padY: 32, padX: 16 } };

export class FramePreview {
  constructor(editor) {
    this.editor = editor;
    const matchEditor = editor.options.previewScreen === 'editor';
    this.screen = matchEditor ? null : SCREENS[0].w;
    this.contentH = 600;
    this.html = '';

    this.buttons = SCREENS.map((s) => {
      const b = button({ name: `screen-${s.w}`, label: `${s.title}, ${s.w}px`, text: String(s.w), onClick: () => this.setScreen(s.w) });
      b.dataset.w = s.w;
      return b;
    });
    this.editorView = matchEditor ? new InlineView(editor) : null;
    if (this.editorView) {
      this.editorView.hide();
      this.buttons.unshift(button({
        name: 'screen-editor', label: 'Ширина редактора', text: 'Как в редакторе',
        onClick: () => this.setScreen(null),
      }));
    }
    this.info = h('span', { class: 'ted-ui-preview__info' });
    // sandbox без allow-scripts: скрипты старого содержимого в предпросмотре не выполняются; allow-same-origin нужен только для измерения высоты
    this.iframe = h('iframe', { class: 'ted-ui-preview__frame', title: 'Предпросмотр', loading: 'lazy', sandbox: 'allow-same-origin' });
    this.viewport = h('div', { class: 'ted-ui-preview__viewport' }, [this.iframe]);
    this.stage = h('div', { class: 'ted-ui-preview__stage' }, [this.viewport]);
    this.el = h('div', { class: 'ted-ui-preview', hidden: true }, [
      h('div', { class: 'ted-ui-preview__bar' }, [...this.buttons, this.info]),
      this.stage,
    ]);
    if (this.editorView) this.el.append(this.editorView.el);

    this.iframe.addEventListener('load', () => this.onLoad());
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.stage);
  }

  cssLinks() {
    const opts = this.editor.options;
    const own = detectTedCss();
    const list = [...own];
    if (opts.unit === 'vw' && !list.some((u) => /ted\.vw\.css/.test(u))) {
      const base = own.find((u) => /\/(content|ted)\.css(\?|$)/.test(u));
      if (base) list.push(base.replace(/[^/]+\.css(\?.*)?$/, 'ted.vw.css'));
    }
    if (opts.unit !== 'vw') {
      for (let i = list.length - 1; i >= 0; i--) if (/ted\.vw\.css/.test(list[i])) list.splice(i, 1);
    }
    return [...list, ...[].concat(opts.contentCss || [])];
  }

  pageCss() {
    const vw = this.editor.options.unit === 'vw';
    const u = (px, base) => (vw ? `${+(px / base * 100).toFixed(4)}vw` : `${px}px`);
    const d = PAGE.desktop;
    const m = PAGE.mobile;
    return `
      html, body { margin: 0; background: #fff; }
      .ted-preview-page { box-sizing: border-box; width: 100%; max-width: ${vw ? u(d.width + d.padX * 2, 1920) : `${d.width + d.padX * 2}px`}; margin: 0 auto; padding: ${u(d.padY, 1920)} ${u(d.padX, 1920)}; }
      @media (width <= 1401px) { .ted-preview-page { max-width: ${vw ? u(d.width + d.padX * 2, 1366) : `${d.width + d.padX * 2}px`}; padding: ${u(d.padY, 1366)} ${u(d.padX, 1366)}; } }
      @media (width <= 811px) { .ted-preview-page { max-width: none; padding: ${u(m.padY, 768)} ${u(m.padX, 768)}; } }
      @media (width <= 481px) { .ted-preview-page { padding: ${u(m.padY, 414)} ${u(m.padX, 414)}; } }
    `;
  }

  render(innerHTML) {
    this.html = innerHTML;
    const unit = this.editor.options.unit === 'vw' ? 'vw' : 'px';
    const empty = innerHTML.trim() ? '' : '<p style="color:#919599">Пока пусто — вернитесь в редактор и добавьте текст.</p>';
    if (this.editorView) this.editorView.render(innerHTML || empty);
    const links = this.cssLinks().map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`).join('\n');
    this.iframe.srcdoc = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<base href="${escapeAttr(document.baseURI)}">
${links}
<style>${this.pageCss()}</style>
</head><body>
<div class="ted-preview-page"><div class="ted-content" data-ted-unit="${unit}">
${innerHTML}${empty}
</div></div>
</body></html>`;
    this.updateButtons();
    this.layout();
  }

  onLoad() {
    const doc = this.iframe.contentDocument;
    if (!doc || !doc.body) return;
    const measure = () => {
      this.contentH = Math.max(200, Math.ceil(doc.body.getBoundingClientRect().height));
      this.layout();
    };
    measure();
    if (doc.__tedReady) return;
    doc.__tedReady = true;
    globalThis.TedContent?.mount(doc);
    // ссылки в предпросмотре не уводят со страницы админки
    doc.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('a')) e.preventDefault();
    });
    const RO = this.iframe.contentWindow.ResizeObserver || ResizeObserver;
    this.docRo = new RO(measure);
    this.docRo.observe(doc.body);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
  }

  destroy() {
    if (this.ro) this.ro.disconnect();
    if (this.docRo) this.docRo.disconnect();
  }

  setScreen(w) {
    this.screen = w;
    this.updateButtons();
    this.layout();
  }

  updateButtons() {
    for (const b of this.buttons) {
      const active = (b.dataset.w ? Number(b.dataset.w) : null) === this.screen;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    this.stage.hidden = this.screen === null;
    if (this.editorView) this.editorView.el.hidden = this.screen !== null;
    this.info.textContent = this.screen !== null && this.editor.options.unit === 'vw' ? 'vw-режим' : 'px-режим';
  }

  layout() {
    if (this.el.hidden || this.screen === null) return;
    const avail = Math.max(1, this.stage.clientWidth - 32);
    const scale = Math.min(1, avail / this.screen);
    this.iframe.style.width = `${this.screen}px`;
    this.iframe.style.height = `${this.contentH}px`;
    this.iframe.style.transform = `scale(${scale})`;
    this.viewport.style.width = `${Math.round(this.screen * scale)}px`;
    this.viewport.style.height = `${Math.round(this.contentH * scale)}px`;
  }

  show() {
    this.el.hidden = false;
    this.layout();
  }

  hide() {
    this.el.hidden = true;
  }
}

/** Просмотр прямо на странице (режим документации «как Notion»). */
export class InlineView {
  constructor(editor) {
    this.editor = editor;
    this.content = h('div', { class: 'ted-content' });
    // та же колонка, что в редакторе (700 / 628 / 480 / 382) — текст не прыгает при смене режима
    this.el = h('div', { class: 'ted-ui-view', hidden: true }, [h('div', { class: 'ted-ui-column' }, [this.content])]);
    this.el.addEventListener('dblclick', () => {
      if (editor.options.dblclickToEdit !== false) editor.setMode('edit');
    });
  }

  render(innerHTML) {
    this.content.innerHTML = innerHTML;
    globalThis.TedContent?.mount(this.content);
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }
}

export function detectTedCss() {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map((l) => l.href)
    .filter((href) => /\/ted[^/]*\.css(\?|$)|\/ted\/(styles|dist)\/[^/]+\.css/.test(href) || /\/styles\/(fonts|theme\.default|content|ui)\.css/.test(href));
}

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
