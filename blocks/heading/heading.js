// Блок «Заголовок» h2–h6 (макет block-heading / Text/heading) — этап 5.3. Семейство: одна папка, пять видов (variants).
// Текстовый блок: правку ведёт текстовый движок ядра; здесь — меню (h2–h4), «Стиль текста», Ctrl+Shift+2…6, подсказка, JSON, стили.
import HEADING_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjCls, bjBg, bjAlign, bjLines } from '../../resources/js/core/blocks-json.js';

const { variants: HEADING_VARIANTS, ...HEADING_BASE } = HEADING_BLOCK;
for (const v of HEADING_VARIANTS) {
  const tag = v.type.toUpperCase();
  registerBlock({
    ...HEADING_BASE,
    ...v,
    match: (el) => el.tagName === tag,
    create: (doc) => { const h = doc.createElement(v.type); h.appendChild(doc.createElement('br')); return h; },
    // Ted.fromBlocks: { "type": "h2", "text": "…", "anchor": "razdel", "align", "bg" }
    fromJson: (b) => {
      const id = b.anchor && /^[\w-]{1,64}$/.test(b.anchor) ? ` id="${b.anchor}"` : '';
      return `<${v.type}${id}${bjCls(bjBg(b), bjAlign(b))}>${bjLines(b.text)}</${v.type}>`;
    },
  });
}
