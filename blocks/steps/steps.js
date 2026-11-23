// Блок «Шаги» (макет block-steps) — этап 5.10. <ol class="ted-steps"><li><strong>Заголовок</strong><br>Описание</li></ol>
// Текстовый блок: шаги, Enter, заглушки, кнопки шага, «Добавить шаг» ведёт текстовый движок ядра; здесь — меню «Списки»,
// «Стиль текста», JSON, стили.
import STEPS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { bjEsc, bjLines } from '../../src/core/blocks-json.js';

registerBlock({
  ...STEPS_BLOCK,
  match: (el) => el.tagName === 'OL' && el.classList.contains('ted-steps'),
  // Ted.fromBlocks: { "type": "steps", "items": [{ "title": "…", "text": "…" }] }
  fromJson: (b) => `<ol class="ted-steps">${(b.items || []).map((i) => `<li><strong>${bjEsc(i.title)}</strong><br>${bjLines(i.text)}</li>`).join('')}</ol>`,
});
