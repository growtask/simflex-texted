// Блок «Плюсы и минусы» (макет block-proscons) — этап 5.12.
// <ul class="ted-proscons"><li class="ted-pros"><strong>Плюсы</strong><ul><li>…</li></ul></li><li class="ted-cons">…</li></ul>
// Текстовый блок: пункты, Enter, Delete, Backspace, смена мест ведёт текстовый движок ядра; здесь — меню «Акцент»,
// новый блок, JSON, стили.
import PROSCONS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { bjEsc, bjLines } from '../../src/core/blocks-json.js';

registerBlock({
  ...PROSCONS_BLOCK,
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
