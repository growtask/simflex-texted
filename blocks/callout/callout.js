// Блок «Выноска» (макет block-callout) — этап 5.5. <blockquote class="ted-callout"><p><strong>Заголовок</strong></p><p>Текст</p></blockquote>
// Внутри — абзацы (их ведёт текстовый движок ядра); своё — вставка, Enter в заголовке и в пустом последнем абзаце,
// заглушки, JSON. В наборе без выноски — её абзацы (block.json → degrade: children; так же на сервере).
import CALLOUT_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';
import { emptyBlock, isEmptyBlock, normalizeRoot } from '../../resources/js/core/blocks.js';
import { getRange, placeCaret } from '../../resources/js/core/selection.js';
import { bjEsc, bjLines } from '../../resources/js/core/blocks-json.js';

const CALLOUT_ZW = new RegExp(String.fromCharCode(0x200b), 'g');

registerBlock({
  // Markdown (22.11): выноска — «> [!NOTE] Заголовок» и строки «> текст»; обратно — fromMarkdownAlert
  toMarkdown: (el, md) => { const [title, ...rest] = [...el.children]; return [`> [!NOTE] ${title ? title.textContent.trim() : ''}`, ...rest.map((p) => '> ' + md.inline(p).trim())].join('\n'); },
  fromMarkdownAlert: (title, html) => `<blockquote class="ted-callout"><p><strong>${title}</strong></p>${html}</blockquote>`,
  ...CALLOUT_BLOCK,
  match: (el) => el.tagName === 'BLOCKQUOTE' && el.classList.contains('ted-callout'),

  /** Новая выноска (макет state=empty): пустой заголовок жирным и пустой текст; курсор — в заголовок. */
  create: (doc) => {
    const q = doc.createElement('blockquote');
    q.className = 'ted-callout';
    const title = doc.createElement('p');
    const strong = doc.createElement('strong');
    strong.appendChild(doc.createElement('br'));
    title.appendChild(strong);
    const text = doc.createElement('p');
    text.appendChild(doc.createElement('br'));
    q.append(title, text);
    return { el: q, focus: strong };
  },

  /** Заглушки «Заголовок выноски» и «Текст выноски» (макет block-callout, empty): текст — одна, пока весь текст пуст. */
  placeholders: (editor, root) => {
    for (const q of root.querySelectorAll('blockquote.ted-callout')) {
      const ps = Array.from(q.children).filter((c) => c.tagName === 'P');
      const textEmpty = ps.slice(1).every((p) => isEmptyBlock(p));
      ps.forEach((p, i) => {
        const show = isEmptyBlock(p) && (i === 0 || (i === 1 && textEmpty));
        if (show) p.setAttribute('data-tedui-ph', i === 0 ? 'Заголовок выноски' : 'Текст выноски');
        else p.removeAttribute('data-tedui-ph');
      });
    }
  },

  /** Enter в заголовке → в текст; Enter в пустом последнем абзаце выходит из выноски. */
  onKey: (editor, e) => {
    if (e.key !== 'Enter' || e.shiftKey) return false;
    const r = getRange(editor.editable);
    if (!r || !r.collapsed) return false;
    const n = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    const p = n.closest && n.closest('blockquote.ted-callout > p');
    const q = p && p.parentNode;
    if (!q || !editor.editable.contains(q)) return false;
    const empty = (el) => !el.textContent.replace(CALLOUT_ZW, '').trim();
    const kids = Array.from(q.children).filter((c) => c.tagName === 'P');
    if (p === kids[0]) {
      e.preventDefault();
      editor.history.commit();
      let next = kids[1];
      if (!next) {
        next = emptyBlock(document, 'p');
        q.appendChild(next);
      }
      placeCaret(next);
      editor.afterChange({ immediate: true });
      return true;
    }
    if (p === kids[kids.length - 1] && empty(p) && kids.length > 1) {
      e.preventDefault();
      editor.history.commit();
      p.remove();
      const after = emptyBlock(document, 'p');
      q.after(after);
      normalizeRoot(editor.editable);
      placeCaret(after);
      editor.afterChange({ immediate: true });
      return true;
    }
    return false;
  },

  // Ted.fromBlocks: { "type": "callout", "title": "…", "text": "…" }
  fromJson: (b) => `<blockquote class="ted-callout"><p><strong>${bjEsc(b.title)}</strong></p><p>${bjLines(b.text)}</p></blockquote>`,
});
