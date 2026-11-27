// Блок «Плюсы и минусы» (макет block-proscons) — этап 5.12.
// <ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>…</li></ul></li><li class="ted-cons">…</li></ul>
// Текстовый блок: пункты, Enter, Delete, Backspace, смена мест ведёт текстовый движок ядра; здесь — меню «Акцент»,
// новый блок, JSON, стили.
import PROSCONS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjEsc, bjLines } from '../../resources/js/core/blocks-json.js';

registerBlock({
  ...PROSCONS_BLOCK,
  // фон карточки по умолчанию — свой: плюсы зелёные, минусы красные; в меню «Цвет» отмечен «Успех» / «Ошибка» (заказчик 28.11)
  // в тёмной теме карточки серые (main/gray/dark) — там отмечен «Стандартный»
  defaultBg: (el) => (el.closest('[data-ted-theme="dark"]') ? 'gray' : el.classList.contains('ted-pros') ? 'success' : el.classList.contains('ted-cons') ? 'error' : ''),
  // цвет текста и фон — у карточки, где курсор (меню «Цвет», заказчик 28.11): плюсы и минусы красятся отдельно
  tcPart: (block, node) => { const el = node.nodeType === 1 ? node : node.parentNode; const card = el && el.closest('ul.ted-proscons > li'); return card && block.contains(card) ? card : null; },
  bgPart: (block, node) => { const el = node.nodeType === 1 ? node : node.parentNode; const card = el && el.closest('ul.ted-proscons > li'); return card && block.contains(card) ? card : null; },
  match: (el) => el.tagName === 'UL' && el.classList.contains('ted-proscons'),
  /** Макет block-proscons, state=empty: в каждой карточке заголовок и три пустых пункта; курсор — в заголовок плюсов. */
  create: (doc) => {
    const ul = doc.createElement('ul');
    ul.className = 'ted-proscons';
    let focus = null;
    for (const cls of ['ted-pros', 'ted-cons']) {
      const li = doc.createElement('li');
      li.className = cls;
      const strong = doc.createElement('strong');
      strong.appendChild(doc.createElement('br'));
      const inner = doc.createElement('ul');
      for (let i = 0; i < 3; i += 1) {
        const item = doc.createElement('li');
        item.appendChild(doc.createElement('br'));
        inner.appendChild(item);
      }
      li.append(strong, inner);
      ul.appendChild(li);
      if (!focus) focus = strong;
    }
    return { el: ul, focus };
  },
  // Ted.fromBlocks: { "type": "proscons", "pros": { "title", "items": [] }, "cons": { … } }
  fromJson: (b) => {
    const card = (c, name, title) => `<li class="ted-${name}"><strong>${bjEsc(c?.title || title)}</strong><ul>${(c?.items || []).map((t) => `<li>${bjLines(t)}</li>`).join('')}</ul></li>`;
    return `<ul class="ted-proscons">${card(b.pros, 'pros', 'Плюсы')}${card(b.cons, 'cons', 'Минусы')}</ul>`;
  },
});
