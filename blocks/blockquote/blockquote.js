// Блок «Цитата» (макет block-quote / Text/quote) — этап 5.4. Текстовый блок: абзацы внутри, ввод и превращение ведёт
// текстовый движок ядра (там же автор цитаты — p.ted-author: имя, должность, инициалы). Здесь — описание, JSON, стили.
import QUOTE_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { bjEsc, bjLines } from '../../resources/js/core/blocks-json.js';

registerBlock({
  ...QUOTE_BLOCK,
  // выноска — тоже <blockquote>, но свой блок (class ted-callout)
  match: (el) => el.tagName === 'BLOCKQUOTE' && !el.classList.contains('ted-callout'),
  // Ted.fromBlocks: { "type": "quote", "text": "…", "author": { "name", "role" } }
  fromJson: (b) => `<blockquote><p>${bjLines(b.text)}</p>${b.author?.name ? `<p class="ted-author"><strong>${bjEsc(b.author.name)}</strong>${b.author.role ? `<br>${bjEsc(b.author.role)}` : ''}</p>` : ''}</blockquote>`,
});
