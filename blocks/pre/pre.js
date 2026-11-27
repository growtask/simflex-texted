// Блок «Код» (макет block-code) — этап 5.7. <pre data-lang data-nums><code>…</code></pre>.
// Текстовый блок: ввод, Enter, вставку, подсветку и шапку (язык, копирование) ведёт текстовый движок ядра; здесь — меню,
// «Стиль текста», Markdown ```, другое имя code, белый список атрибутов, JSON, стили; на сайте — pre.site.js.
import PRE_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjEsc } from '../../resources/js/core/blocks-json.js';

registerBlock({
  defaultBg: 'gray',   // своя серая плашка — в меню «Цвет» → «Фон» по умолчанию отмечен «Стандартный» (заказчик 28.11)
  canBg: () => true,   // у кода меняется только фон (меню «Цвет», 1.0.4)
  ...PRE_BLOCK,
  match: (el) => el.tagName === 'PRE',
  create: (doc) => { const pre = doc.createElement('pre'); pre.appendChild(doc.createElement('code')); return pre; },
  // Ted.fromBlocks: { "type": "code", "lang": "js", "code": "…" }
  fromJson: (b) => `<pre${b.lang ? ` data-lang="${bjEsc(b.lang)}"` : ''}><code>${bjEsc(b.code)}</code></pre>`,
});
