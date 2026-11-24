// Блок «Ключевые цифры» (макет block-facts) — этап 5.11. <ul class="ted-facts"><li><strong>120+</strong><br>подпись</li></ul>
// Текстовый блок: плитки, Enter, заглушки ведёт текстовый движок ядра; здесь — меню «Акцент», новый блок, JSON, стили.
import FACTS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { emptyStepItem } from '../../resources/js/core/blocks.js';
import { bjEsc, bjLines } from '../../resources/js/core/blocks-json.js';

registerBlock({
  ...FACTS_BLOCK,
  match: (el) => el.tagName === 'UL' && el.classList.contains('ted-facts'),
  /** Новый блок — две пустые плитки (меньше двух не бывает), остальные добавляются Enter в последней подписи. */
  create: (doc) => {
    const ul = doc.createElement('ul');
    ul.className = 'ted-facts';
    for (let i = 0; i < 2; i += 1) ul.appendChild(emptyStepItem(doc));
    return { el: ul, focus: ul.firstElementChild.firstElementChild };
  },
  // Ted.fromBlocks: { "type": "facts", "items": [{ "value": "120+", "label": "…" }] }
  fromJson: (b) => `<ul class="ted-facts">${(b.items || []).map((i) => `<li><strong>${bjEsc(i.value)}</strong><br>${bjLines(i.label)}</li>`).join('')}</ul>`,
});
