// Блок «Список» и «Нумерованный список» (Text/body, type list / list-numb) — этап 5.8. Семейство: одна папка, два вида.
// Текстовый блок: пункты, Enter, Tab / Shift+Tab (вложенность), Markdown «- » и «1. » ведёт текстовый движок ядра;
// здесь — меню «Списки», «Стиль текста», Ctrl+Shift+8 / 7, белый список, JSON, стили. Чек-лист, шаги, цифры, плюсы и
// минусы — тоже ul / ol, но свои блоки (selector в block.json их исключает).
import LIST_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { bjLines } from '../../src/core/blocks-json.js';

const { variants: LIST_VARIANTS, ...LIST_BASE } = LIST_BLOCK;
for (const v of LIST_VARIANTS) {
  registerBlock({
    ...LIST_BASE,
    ...v,
    match: (el) => el.matches(v.selector),
    create: (doc) => { const l = doc.createElement(v.type); const li = doc.createElement('li'); li.appendChild(doc.createElement('br')); l.appendChild(li); return { el: l, focus: li }; },
    // Ted.fromBlocks: { "type": "ul", "items": ["…", "…"] }
    fromJson: (b) => `<${v.type}>${(b.items || []).map((t) => `<li>${bjLines(t)}</li>`).join('')}</${v.type}>`,
  });
}
