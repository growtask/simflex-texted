// Блок «Текст» (абзац, макет block-body / Text/body) — этап 5.2. Текстовый блок: ввод, Enter, Backspace, Markdown и
// превращение ведёт текстовый движок ядра; здесь — описание (меню, «Стиль текста», Ctrl+Shift+0, подсказка), JSON и стили.
import P_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjCls, bjBg, bjAlign, bjLines } from '../../resources/js/core/blocks-json.js';

registerBlock({
  ...P_BLOCK,
  match: (el) => el.tagName === 'P',
  create: (doc) => { const p = doc.createElement('p'); p.appendChild(doc.createElement('br')); return p; },
  // Ted.fromBlocks: { "type": "p", "text": "…", "align": "center", "bg": "gray" }
  fromJson: (b) => `<p${bjCls(bjBg(b), bjAlign(b))}>${bjLines(b.text)}</p>`,
});
