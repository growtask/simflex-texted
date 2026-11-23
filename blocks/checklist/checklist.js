// Блок «Чек-лист» (макет block-checklist, check-box size=s) — этап 5.9. <ul class="ted-checklist"><li class="ted-checked">…</li></ul>
// Текстовый блок: пункты, Enter, отметка кликом по чек-боксу, Markdown «[] » / «[x] » ведёт текстовый движок ядра;
// здесь — меню «Списки», «Стиль текста», JSON, стили.
import CHECKLIST_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { bjLines } from '../../src/core/blocks-json.js';

registerBlock({
  ...CHECKLIST_BLOCK,
  match: (el) => el.tagName === 'UL' && el.classList.contains('ted-checklist'),
  // Ted.fromBlocks: { "type": "checklist", "items": ["…", { "text": "…", "checked": true }] }
  fromJson: (b) => `<ul class="ted-checklist">${(b.items || []).map((i) => (typeof i === 'string' ? { text: i } : i)).map((i) => `<li${i.checked ? ' class="ted-checked"' : ''}>${bjLines(i.text)}</li>`).join('')}</ul>`,
});
