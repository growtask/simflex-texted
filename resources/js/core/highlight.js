// Подсветка синтаксиса кода — своя, без библиотек и внешних запросов.
// tokenize(text, lang) → [{ t: 'kw' | 'str' | 'num' | 'com' | 'fn' | 'tag' | 'attr' | 'prop' | 'var' | null, s }]
// В сохранённом HTML токены — <span class="ted-k"> (короткие классы); в правке — CSS Custom Highlight API (без изменения DOM).

export const CODE_LANGS = [
  { id: 'html', label: 'HTML' }, { id: 'css', label: 'CSS' }, { id: 'js', label: 'JavaScript' }, { id: 'ts', label: 'TypeScript' },
  { id: 'php', label: 'PHP' }, { id: 'json', label: 'JSON' }, { id: 'sql', label: 'SQL' }, { id: 'python', label: 'Python' }, { id: 'bash', label: 'Bash' },
];

const ALIAS = { javascript: 'js', jsx: 'js', mjs: 'js', typescript: 'ts', tsx: 'ts', htm: 'html', xml: 'html', svg: 'html', scss: 'css', less: 'css', py: 'python', sh: 'bash', shell: 'bash', zsh: 'bash' };

/** Привести введённое название языка к коду: «JavaScript» → js; неизвестные оставляем как есть (буквы любого алфавита, в том числе кириллица, цифры и + # . -). */
export function normalizeLang(v) {
  const s = String(v || '').trim().toLowerCase().replace(/[^\p{L}\p{N}+#.-]/gu, '').slice(0, 20);
  return ALIAS[s] || s;
}

export function langLabel(id) {
  const f = CODE_LANGS.find((l) => l.id === id);
  return f ? f.label : id;
}

/** Определение языка по тексту (простые признаки); пустая строка — не определился. */
export function detectCodeLang(text) {
  let t = String(text || '').trim();
  if (t.length > 20000) t = `${t.slice(0, 10000)}\n${t.slice(-2000)}`;   // большой код: смотрим начало и конец
  if (!t) return '';
  if (/^<\?php|<\?=/.test(t)) return 'php';
  if (/^<!doctype html|^<\/?[a-z][\w-]*[\s>/]/i.test(t) && />\s*$/.test(t.split('\n').pop() || '')) return 'html';
  if (/^[\[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (e) { /* не JSON */ } }
  if (/^\s*(select|insert\s+into|update|delete\s+from|create\s+table|alter\s+table|drop\s+table)\b/i.test(t)) return 'sql';
  if (/^#!.*\b(ba|z)?sh\b|^\s*(\$ |sudo |apt |npm |git |cd |ls |echo |curl |chmod |mkdir )/m.test(t)) return 'bash';
  if (/^\s*(def |class \w+.*:|import \w+|from \w+ import|print\()/m.test(t) && !/[{};]\s*$/m.test(t)) return 'python';
  if (/^[^{}\n]*\{[^}]*:\s*[^;}]+;?[^}]*\}/m.test(t) && /[.#@]?[\w-]+\s*\{/.test(t) && !/\b(function|const|let|var|=>)\b/.test(t)) return 'css';
  if (/\b(interface |type \w+ =|: (string|number|boolean)\b|enum )/.test(t)) return 'ts';
  if (/\b(function|const|let|var|=>|console\.|document\.|import .* from|export )\b/.test(t)) return 'js';
  if (/\$\w+\s*=|->\w+|\bnamespace\b|echo\s/.test(t)) return 'php';
  return '';
}

const JS_KW = 'break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|let|new|of|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|async|await|static|get|set|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly|as';
const PHP_KW = 'abstract|and|array|as|break|case|catch|class|clone|const|continue|declare|default|do|echo|else|elseif|empty|extends|final|finally|for|foreach|function|global|if|implements|include|include_once|interface|isset|list|namespace|new|or|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|use|var|while|null|true|false|self|parent';
const PY_KW = 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|None|True|False|self';
const SQL_KW = 'select|from|where|and|or|not|insert|into|values|update|set|delete|create|table|alter|drop|join|left|right|inner|outer|on|group|by|order|having|limit|offset|as|distinct|union|all|null|is|in|like|between|exists|case|when|then|else|end|primary|key|foreign|references|index|default|unique|count|sum|avg|min|max|asc|desc';
const SH_KW = 'if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|exit|export|local|echo|cd|ls|cat|grep|sed|awk|git|npm|sudo|apt|curl|chmod|mkdir|rm|cp|mv';

const kw = (list, flags = '') => new RegExp(`^(?:${list})\\b`, flags);

// Правила: [тип, регулярное выражение с ^]; первое подошедшее правило выигрывает
const RULES = {
  js: [
    ['com', /^\/\/[^\n]*|^\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /^`(?:\\[\s\S]|[^`\\])*(?:`|$)|^"(?:\\.|[^"\\\n])*(?:"|$)|^'(?:\\.|[^'\\\n])*(?:'|$)/],
    ['num', /^(?:0x[\da-f]+|\d+\.?\d*(?:e[+-]?\d+)?)\b/i],
    ['kw', kw(JS_KW)],
    ['fn', /^[A-Za-z_$][\w$]*(?=\s*\()/],
    ['var', /^[A-Z][\w$]*/],
  ],
  php: [
    ['com', /^\/\/[^\n]*|^#[^\n]*|^\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /^"(?:\\.|[^"\\])*(?:"|$)|^'(?:\\.|[^'\\])*(?:'|$)/],
    ['var', /^\$[A-Za-z_]\w*/],
    ['kw', /^<\?php|^\?>/],
    ['num', /^\d+\.?\d*\b/],
    ['kw', kw(PHP_KW, 'i')],
    ['fn', /^[A-Za-z_]\w*(?=\s*\()/],
  ],
  python: [
    ['com', /^#[^\n]*/],
    ['str', /^(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))|^"(?:\\.|[^"\\\n])*(?:"|$)|^'(?:\\.|[^'\\\n])*(?:'|$)/],
    ['num', /^\d+\.?\d*\b/],
    ['kw', kw(PY_KW)],
    ['fn', /^[A-Za-z_]\w*(?=\s*\()/],
  ],
  sql: [
    ['com', /^--[^\n]*|^\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /^'(?:''|[^'])*(?:'|$)|^"[^"]*(?:"|$)/],
    ['num', /^\d+\.?\d*\b/],
    ['kw', kw(SQL_KW, 'i')],
    ['fn', /^[A-Za-z_]\w*(?=\s*\()/],
  ],
  bash: [
    ['com', /^#[^\n]*/],
    ['str', /^"(?:\\.|[^"\\])*(?:"|$)|^'[^']*(?:'|$)/],
    ['var', /^\$\{?[A-Za-z_]\w*\}?|^\$[0-9@#?]/],
    ['attr', /^--?[A-Za-z][\w-]*/],
    ['num', /^\d+\b/],
    ['kw', kw(SH_KW)],
  ],
  json: [
    ['prop', /^"(?:\\.|[^"\\\n])*"(?=\s*:)/],
    ['str', /^"(?:\\.|[^"\\\n])*(?:"|$)/],
    ['num', /^-?\d+\.?\d*(?:e[+-]?\d+)?\b/i],
    ['kw', /^(?:true|false|null)\b/],
  ],
  css: [
    ['com', /^\/\*[\s\S]*?(?:\*\/|$)/],
    ['str', /^"(?:\\.|[^"\\\n])*(?:"|$)|^'(?:\\.|[^'\\\n])*(?:'|$)/],
    ['kw', /^@[\w-]+/],
    ['num', /^#[\da-f]{3,8}\b|^-?\d*\.?\d+(?:px|em|rem|vw|vh|%|s|ms|deg|fr)?\b/i],
    ['prop', /^[a-z-]+(?=\s*:)/i],
    ['tag', /^[.#]?[A-Za-z_][\w-]*(?=[^{};]*\{)/],
    ['fn', /^[a-z-]+(?=\()/i],
  ],
};
RULES.ts = RULES.js;

function tokenizeHtml(text) {
  const out = [];
  const push = (t, s) => { if (s) out.push({ t, s }); };
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4);
      const end = e < 0 ? text.length : e + 3;
      push('com', text.slice(i, end));
      i = end;
    } else if (text[i] === '<' && /[A-Za-z!/?]/.test(text[i + 1] || '')) {
      const e = text.indexOf('>', i);
      const end = e < 0 ? text.length : e + 1;
      const tag = text.slice(i, end);
      const m = tag.match(/^(<\/?)([A-Za-z][\w:-]*|!doctype|[!?][\w-]*)?/i) || [tag, '<', ''];
      push('tag', m[0]);
      let rest = tag.slice(m[0].length);
      const re = /^(\s+)|^([\w:@.-]+)(\s*=\s*)?|^("[^"]*"|'[^']*')|^(\/?>)|^[\s\S]/;
      while (rest) {
        const a = rest.match(re);
        const s = a[0];
        if (a[1]) push(null, s);
        else if (a[2]) { push('attr', a[2]); if (a[3]) push(null, a[3]); }
        else if (a[4]) push('str', s);
        else if (a[5]) push('tag', s);
        else push(null, s);
        rest = rest.slice(s.length);
      }
      i = end;
    } else {
      const e = text.indexOf('<', i + 1);
      const end = e < 0 ? text.length : e;
      push(null, text.slice(i, end));
      i = end;
    }
  }
  return out;
}

/** Склеить соседние токены одного типа (и пробелы между ними): в сохранённом HTML меньше <span>, в правке меньше диапазонов. */
export function compact(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const tk = tokens[i];
    const prev = out[out.length - 1];
    if (prev && prev.t === tk.t) { prev.s += tk.s; continue; }
    // пробелы между двумя одинаковыми токенами присоединяем к ним
    if (prev && prev.t && !tk.t && /^[ \t]+$/.test(tk.s) && tokens[i + 1] && tokens[i + 1].t === prev.t) {
      prev.s += tk.s + tokens[i + 1].s;
      i += 1;
      continue;
    }
    out.push({ t: tk.t, s: tk.s });
  }
  return out;
}

const SHORT = { kw: 'k', str: 's', num: 'n', com: 'c', fn: 'f', tag: 't', attr: 'a', prop: 'p', var: 'v' };

/** Разбить текст на токены. lang — код языка (см. CODE_LANGS), неизвестный язык — без подсветки. */
export function tokenize(text, lang) {
  return compact(tokenizeRaw(text, lang));
}

function tokenizeRaw(text, lang) {
  const id = ALIAS[lang] || lang;
  if (text.length > 300000) return [{ t: null, s: text }];   // слишком длинный текст не подсвечиваем
  if (id === 'html') return tokenizeHtml(text);
  const rules = RULES[id];
  if (!rules) return [{ t: null, s: text }];
  const out = [];
  let plain = '';
  const flush = () => { if (plain) { out.push({ t: null, s: plain }); plain = ''; } };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let hit = null;
    // слова целиком, чтобы ключевое слово не находилось внутри идентификатора
    if (/^[A-Za-z_$]/.test(rest) && plain && /[\w$]$/.test(plain)) { plain += rest[0]; i += 1; continue; }
    for (const [t, re] of rules) {
      const m = rest.match(re);
      if (m && m[0]) { hit = [t, m[0]]; break; }
    }
    if (hit) { flush(); out.push({ t: hit[0], s: hit[1] }); i += hit[1].length; } else { plain += rest[0]; i += 1; }
  }
  flush();
  return out;
}

/** Фрагмент с <span class="ted-k"> (k, s, n, c, f, t, a, p, v) для сохранённого HTML. */
export function highlightFragment(text, lang, doc = document) {
  const frag = doc.createDocumentFragment();
  for (const tk of tokenize(text, lang)) {
    if (!tk.t) frag.appendChild(doc.createTextNode(tk.s));
    else {
      const sp = doc.createElement('span');
      sp.className = `ted-${SHORT[tk.t] || tk.t}`;
      sp.textContent = tk.s;
      frag.appendChild(sp);
    }
  }
  return frag;
}

// ---- Подсветка в правке: CSS Custom Highlight API (DOM не меняется, курсор не сбивается) ----
const store = new Map();   // корень редактора → { тип → [Range] }

export function highlightSupported() {
  return typeof CSS !== 'undefined' && !!CSS.highlights && typeof Highlight !== 'undefined';
}

export function applyEditorHighlight(root, getLang) {
  if (!highlightSupported()) return;
  const byType = {};
  for (const code of root.querySelectorAll(':scope > pre > code')) {
    const text = code.textContent;
    const pre = code.parentNode;
    const lang = getLang ? getLang(pre, text) : pre.getAttribute('data-lang') || detectCodeLang(text);
    const cache = `${lang}\u0000${text}`;
    if (code.__tedHl && code.__tedHl.key === cache) {
      for (const [t, rs] of Object.entries(code.__tedHl.ranges)) (byType[t] = byType[t] || []).push(...rs);
      continue;
    }
    const nodes = [];
    const starts = [];
    let total = 0;
    const w = document.createTreeWalker(code, 4);
    for (let n = w.nextNode(); n; n = w.nextNode()) { nodes.push(n); starts.push(total); total += n.data.length; }
    const ranges = {};
    let pos = 0;
    // позиция в тексте → (текстовый узел, смещение); двоичный поиск, чтобы большой код не считался квадратично
    const locate = (offset) => {
      if (!nodes.length) return null;
      let lo = 0;
      let hi = nodes.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (starts[mid] < offset) lo = mid; else hi = mid - 1;
      }
      return [nodes[lo], Math.min(nodes[lo].data.length, offset - starts[lo])];
    };
    for (const tk of tokenize(text, lang)) {
      const len = tk.s.length;
      if (tk.t) {
        const a = locate(pos);
        const b = locate(pos + len);
        if (a && b) {
          const r = document.createRange();
          r.setStart(a[0], a[1]);
          r.setEnd(b[0], b[1]);
          (ranges[tk.t] = ranges[tk.t] || []).push(r);
        }
      }
      pos += len;
    }
    code.__tedHl = { key: cache, ranges };
    for (const [t, rs] of Object.entries(ranges)) (byType[t] = byType[t] || []).push(...rs);
  }
  // в редакторе без кода глобальные подсветки не трогаем (иначе при многих редакторах на странице каждая правка пересобирала бы все)
  const had = store.has(root);
  if (!Object.keys(byType).length && !had) return;
  if (Object.keys(byType).length) store.set(root, byType); else store.delete(root);
  const all = {};
  for (const [r, m] of Array.from(store)) {
    if (!r.isConnected) { store.delete(r); continue; }
    for (const [t, rs] of Object.entries(m)) (all[t] = all[t] || []).push(...rs);
  }
  for (const t of ['kw', 'str', 'num', 'com', 'fn', 'tag', 'attr', 'prop', 'var']) {
    if (all[t] && all[t].length) CSS.highlights.set(`ted-${t}`, new Highlight(...all[t]));
    else CSS.highlights.delete(`ted-${t}`);
  }
}

/** Убрать подсветку уничтоженного редактора (общие ::highlight пересобираются из остальных). */
export function releaseEditorHighlight(root) {
  if (!highlightSupported() || !store.delete(root)) return;
  const all = {};
  for (const [r, m] of Array.from(store)) {
    if (!r.isConnected) { store.delete(r); continue; }
    for (const [t, rs] of Object.entries(m)) (all[t] = all[t] || []).push(...rs);
  }
  for (const t of ['kw', 'str', 'num', 'com', 'fn', 'tag', 'attr', 'prop', 'var']) {
    if (all[t] && all[t].length) CSS.highlights.set(`ted-${t}`, new Highlight(...all[t]));
    else CSS.highlights.delete(`ted-${t}`);
  }
}
