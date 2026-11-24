// Ted — точка входа. Подключение как у TinyMCE:
//
//   Ted.init({ selector: 'textarea.editor', unit: 'vw' });
//
// Возвращает массив редакторов. Один элемент: Ted.create(element, options).

import { Editor } from './core/editor.js';
import { sanitizeHTML, serializeBlocks } from './core/sanitize.js';
import { resolveBlocks, restrictBlocks } from './core/blocks.js';
import { HOTKEYS } from './core/keys.js';
import { PRESETS, definePreset, presetNames } from './core/presets.js';
import { createUpload, createOpenGraph } from './core/upload.js';
import { enhanceAudio } from '../../blocks/media/audio-player.js';
import { blocksToHtml, blockJsonTypes, htmlToBlocks } from './core/blocks-json.js';
import { markdownToHtml, htmlToMarkdown } from './core/markdown.js';
import { registerBlock } from './core/registry.js';
import { addLang, setLang, getLang } from './core/i18n.js';
import '../lang/en.js';
// блоки из папок (этап 5): в исходниках подключаются здесь, сборка берёт их по списку bin/build.json → blocks
import '../../blocks/hr/hr.js';
import '../../blocks/p/p.js';
import '../../blocks/heading/heading.js';
import '../../blocks/list/list.js';
import '../../blocks/blockquote/blockquote.js';
import '../../blocks/callout/callout.js';
import '../../blocks/background/background.js';
import '../../blocks/pre/pre.js';
import '../../blocks/checklist/checklist.js';
import '../../blocks/steps/steps.js';
import '../../blocks/facts/facts.js';
import '../../blocks/proscons/proscons.js';
import '../../blocks/button/button.js';
import '../../blocks/iframe/iframe.js';
import '../../blocks/embed/embed.js';
import '../../blocks/product/product.js';
import '../../blocks/media/media.js';
import '../../blocks/table/table.js';
import '../../blocks/accordion/accordion.js';
import '../../blocks/tabs/tabs.js';
import '../../blocks/toc/toc.js';
import '../../blocks/columns/columns.js';

const VERSION = '0.1.0';

const Ted = {
  version: VERSION,
  Editor,
  createUpload,
  createOpenGraph,
  /** Сайт: подключить плеер из макета к аудио в контенте (родной <audio controls> остаётся для тех, у кого скрипт не загрузился). */
  enhance(root = document) { enhanceAudio(root); },
  hotkeys: HOTKEYS,
  editors: [],

  init(options = {}) {
    const { selector, target, ...rest } = options;
    let els = [];
    if (target) els = [].concat(target);
    else if (selector) els = Array.from(document.querySelectorAll(selector));
    return els.map((el) => this.create(el, rest));
  },

  create(el, options = {}) {
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) throw new Error('Ted: элемент не найден');
    const existing = this.get(el);
    if (existing) return existing;
    const ed = new Editor(el, options);
    ed.registry = this.editors;
    el.__ted = ed;
    this.editors.push(ed);
    return ed;
  },

  get(el) {
    if (typeof el === 'string') el = document.querySelector(el);
    return (el && el.__ted) || null;
  },

  /** Сменить тему интерфейса у всех редакторов (вызывать при смене темы админки). */
  setTheme(theme) {
    for (const ed of this.editors) ed.setTheme(theme);
  },

  /** Очистить произвольный HTML так же, как это делает редактор. */
  /** Документ списком блоков (JSON) → чистый HTML редактора; { blocks } ограничивает набор, skipped получит неизвестные типы. Типы: Ted.blockJsonTypes. */
  fromBlocks(list, { blocks, skipped } = {}) {
    const html = blocksToHtml(list, skipped || []);
    return Ted.clean(html, { blocks });
  },
  get blockJsonTypes() { return blockJsonTypes(); },
  /** HTML → список блоков JSON (без потерь: что не описать простым текстом — { type: "html", html }). Обратно — Ted.fromBlocks. */
  toBlocks(html) { return htmlToBlocks(Ted.clean(html)); },
  /** Markdown → чистый HTML редактора (# → h2, ## → h3 …, списки, чек-листы, таблицы, код, выноски «> [!NOTE]»). */
  fromMarkdown(md, { blocks } = {}) { return Ted.clean(markdownToHtml(md), { blocks }); },
  /** Сохранённый HTML → Markdown (блоки без прямого аналога — понятным текстом). */
  toMarkdown(html) { return htmlToMarkdown(Ted.clean(html)); },
  /** Свой блок (этап 5): Ted.registerBlock({ type, match, create, clean, … }) — см. resources/js/core/registry.js и blocks/hr. */
  registerBlock(def) { return registerBlock(def); },
  /** Язык интерфейса (22.11): Ted.addLang('de', { 'Русская строка': 'Перевод' }), Ted.setLang('en') — для новых редакторов; у открытого — editor.setLang. */
  addLang(lang, map) { addLang(lang, map); },
  setLang(lang) { return setLang(lang); },
  get lang() { return getLang(); },

  /**
   * Набор (этап 2): Ted.definePreset('news', { blocks: ['p', 'h2', 'image'], mode: 'edit' }) — свой набор в браузере.
   * В CMS свои наборы задаются в ted.config.php → presets: сервер передаёт их в браузер сам и чистит по ним HTML.
   */
  definePreset(name, def) { return definePreset(name, def); },
  /** Базовые наборы: full, mini, text, readonly, docs — { blocks, mode }. */
  presets: PRESETS,
  presetNames() { return presetNames(); },

  /** Очистить произвольный HTML так же, как редактор; { blocks } или { preset } — ещё и привести блоки к разрешённым (запрещённые → текст). */
  clean(html, { blocks, preset } = {}) {
    const frag = sanitizeHTML(html);
    const set = resolveBlocks(preset || blocks);
    return serializeBlocks(set ? restrictBlocks(frag, set, document) : frag);
  },

  /** Уничтожить редактор по элементу, селектору или экземпляру (все три способа равнозначны). */
  destroy(el) {
    if (el && typeof el.destroy === 'function' && el.editable) { el.destroy(); return; }
    const ed = this.get(el);
    if (ed) ed.destroy();
  },
};

if (typeof window !== 'undefined') window.Ted = Ted;

export default Ted;
