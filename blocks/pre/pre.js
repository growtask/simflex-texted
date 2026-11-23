// Блок «Код» (макет block-code) — этап 5.7. <pre data-lang data-nums><code>…</code></pre>.
// Текстовый блок: ввод, Enter, вставку, подсветку и шапку (язык, копирование) ведёт текстовый движок ядра; здесь — меню,
// «Стиль текста», Markdown ```, другое имя code, белый список атрибутов, JSON, стили; на сайте — pre.site.js.
import PRE_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../src/core/registry.js';
import { bjEsc } from '../../src/core/blocks-json.js';

registerBlock({
  ...PRE_BLOCK,
  match: (el) => el.tagName === 'PRE',
  create: (doc) => { const pre = doc.createElement('pre'); pre.appendChild(doc.createElement('code')); return pre; },
  // Ted.fromBlocks: { "type": "code", "lang": "js", "code": "…" }
  fromJson: (b) => `<pre${b.lang ? ` data-lang="${bjEsc(b.lang)}"` : ''}><code>${bjEsc(b.code)}</code></pre>`,
});
