// Блок «Шаги» (макет block-steps) — этап 5.10. <ol class="ted-steps"><li><strong>Заголовок</strong><br>Описание</li></ol>
// Текстовый блок: шаги, Enter, заглушки, кнопки шага, «Добавить шаг» ведёт текстовый движок ядра; здесь — меню «Списки»,
// «Стиль текста», JSON, стили.
import STEPS_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjEsc, bjLines } from '../../resources/js/core/blocks-json.js';

registerBlock({
  /** Цвет текста одной части (меню «Цвет», 1.0.4): курсор в заголовке шага — заголовок, в описании — описание. */
  tcPart: (block, node) => {
    const el = node.nodeType === 1 ? node : node.parentNode;
    const li = el && el.closest('ol.ted-steps > li');
    if (!li || !block.contains(li)) return null;
    const title = li.querySelector(':scope > strong:first-child');
    const r = document.createRange();
    // курсор в заголовке или в самом начале пункта (перед заголовком) — заголовок
    if (title && (title.contains(el) || node === li)) { r.selectNodeContents(title); return r; }
    const br = [...li.childNodes].find((n) => n.nodeName === 'BR');
    if (!br || !br.nextSibling) return null;
    r.setStartAfter(br);
    r.setEnd(li, li.childNodes.length);
    return r;
  },
  ...STEPS_BLOCK,
  match: (el) => el.tagName === 'OL' && el.classList.contains('ted-steps'),
  // Ted.fromBlocks: { "type": "steps", "items": [{ "title": "…", "text": "…" }] }
  fromJson: (b) => `<ol class="ted-steps">${(b.items || []).map((i) => `<li><strong>${bjEsc(i.title)}</strong><br>${bjLines(i.text)}</li>`).join('')}</ol>`,
});
