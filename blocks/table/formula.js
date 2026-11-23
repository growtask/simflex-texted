// Формулы в таблице (этап 6.1б): свой разборщик без eval.
// Ссылки A1 … J100 (столбцы A–J, строки с 1 — первая строка таблицы, включая шапку), диапазоны B2:B5, закреплённые $A$1.
// Арифметика + − * /, скобки, унарный минус, проценты (20%). Функции: SUM, AVERAGE, MIN, MAX, COUNT, ROUND
// и русские СУММ, СРЗНАЧ, МИН, МАКС, СЧЁТ, ОКРУГЛ. Разделитель аргументов — «;» (запятая — десятичная).
// Ошибки: #ДЕЛ/0!, #ССЫЛКА!, #ЦИКЛ!, #ОШИБКА!. Числа — по-русски (1 234,5), единицы ₽ и %.

export const FORMULA_ERRORS = ['#ДЕЛ/0!', '#ССЫЛКА!', '#ЦИКЛ!', '#ОШИБКА!'];
const ERR = { div: '#ДЕЛ/0!', ref: '#ССЫЛКА!', cycle: '#ЦИКЛ!', bad: '#ОШИБКА!' };

/** Функции для списка под ячейкой: русское имя (оно вставляется), английское, подсказка. */
export const FORMULA_FUNCS = [
  { name: 'СУММ', en: 'SUM', hint: 'Сумма' },
  { name: 'СРЗНАЧ', en: 'AVERAGE', hint: 'Среднее' },
  { name: 'МИН', en: 'MIN', hint: 'Наименьшее' },
  { name: 'МАКС', en: 'MAX', hint: 'Наибольшее' },
  { name: 'СЧЁТ', en: 'COUNT', hint: 'Количество чисел' },
  { name: 'ОКРУГЛ', en: 'ROUND', hint: 'Округление' },
];
const FN = {};
for (const f of FORMULA_FUNCS) { FN[f.name] = f.en; FN[f.en] = f.en; }
FN['СЧЕТ'] = 'COUNT';

export const MAX_COL = 10;
export const MAX_ROW = 100;
export const colName = (c) => String.fromCharCode(65 + c);
export const refName = (c, r, ac = false, ar = false) => `${ac ? '$' : ''}${colName(c)}${ar ? '$' : ''}${r + 1}`;

// ---------- лексер ----------

const LETTER = /[A-Za-zА-Яа-яЁё_]/;

function formulaTokens(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    // ссылка: $?БУКВА$?ЦИФРЫ, за ней не буква, не цифра и не «(»
    const ref = /^(\$?)([A-Za-z])(\$?)(\d{1,3})(?![\dA-Za-zА-Яа-яЁё_(])/.exec(src.slice(i));
    if (ref && !(i > 0 && LETTER.test(src[i - 1]))) {
      out.push({ t: 'ref', c: ref[2].toUpperCase().charCodeAt(0) - 65, r: Number(ref[4]) - 1, ac: !!ref[1], ar: !!ref[3], s: i, e: i + ref[0].length });
      i += ref[0].length;
      continue;
    }
    const num = /^\d+(?:[.,]\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const word = /^[A-Za-zА-Яа-яЁё_]+/.exec(src.slice(i));
    if (word) { out.push({ t: 'name', v: word[0].toUpperCase() }); i += word[0].length; continue; }
    if ('+-*/()%:;,'.includes(ch)) { out.push({ t: ch }); i += 1; continue; }
    if (ch === '−' || ch === '–' || ch === '—') { out.push({ t: '-' }); i += 1; continue; }   // типограф мог заменить минус
    if (ch === '×') { out.push({ t: '*' }); i += 1; continue; }
    if (ch === '÷') { out.push({ t: '/' }); i += 1; continue; }
    if (ch === '#') {   // ссылка на удалённую ячейку после правки структуры
      const m = /^#[^\s+\-*/();,]+/.exec(src.slice(i));
      out.push({ t: 'err', v: ERR.ref });
      i += m ? m[0].length : 1;
      continue;
    }
    throw new Error('bad');
  }
  return out;
}

// ---------- разбор (рекурсивный спуск) ----------

/** Разобрать формулу «=…» в дерево. Ошибка синтаксиса — исключение. */
export function parseFormula(text) {
  const src = String(text || '').replace(/^\s*=/, '');
  const toks = formulaTokens(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => { if (!toks[p] || toks[p].t !== t) throw new Error('bad'); return toks[p++]; };
  const expr = () => {
    let left = term();
    while (peek() && (peek().t === '+' || peek().t === '-')) { const op = toks[p++].t; left = { t: 'bin', op, l: left, r: term() }; }
    return left;
  };
  const term = () => {
    let left = unary();
    while (peek() && (peek().t === '*' || peek().t === '/')) { const op = toks[p++].t; left = { t: 'bin', op, l: left, r: unary() }; }
    return left;
  };
  const unary = () => {
    if (peek() && peek().t === '-') { p += 1; return { t: 'neg', x: unary() }; }
    if (peek() && peek().t === '+') { p += 1; return unary(); }
    let x = primary();
    while (peek() && peek().t === '%') { p += 1; x = { t: 'pct', x }; }
    return x;
  };
  const primary = () => {
    const tk = peek();
    if (!tk) throw new Error('bad');
    if (tk.t === 'num') { p += 1; return { t: 'num', v: tk.v }; }
    if (tk.t === 'err') { p += 1; return { t: 'err', v: tk.v }; }
    if (tk.t === 'ref') {
      p += 1;
      if (peek() && peek().t === ':') { p += 1; const b = take('ref'); return { t: 'range', a: tk, b }; }
      return { t: 'ref', ...tk };
    }
    if (tk.t === 'name') {
      p += 1;
      const fn = FN[tk.v];
      if (!fn) throw new Error('bad');
      take('(');
      const args = [];
      if (peek() && peek().t !== ')') {
        args.push(expr());
        while (peek() && (peek().t === ';' || peek().t === ',')) { p += 1; args.push(expr()); }
      }
      take(')');
      return { t: 'fn', fn, args };
    }
    if (tk.t === '(') { p += 1; const x = expr(); take(')'); return x; }
    throw new Error('bad');
  };
  const tree = expr();
  if (p !== toks.length) throw new Error('bad');
  return tree;
}

// ---------- значения ячеек ----------

/** Текст ячейки → число с единицей ({ v, unit }), пусто ({ empty }) или текст ({ text }). «1 234,5 ₽», «15%», «−3». */
export function parseCellValue(text) {
  const s = String(text || '').replace(/[   ​]/g, ' ').trim();
  if (!s) return { empty: true };
  if (FORMULA_ERRORS.includes(s)) return { err: s };
  const m = /^([-−–+]?)\s*(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d+))?\s*(₽|руб\.?|р\.|%)?$/i.exec(s);
  if (!m) return { text: s };
  let v = Number(`${m[2].replace(/ /g, '')}.${m[3] || '0'}`);
  if (m[1] && m[1] !== '+') v = -v;
  const u = m[4] ? (m[4] === '%' ? '%' : '₽') : '';
  if (u === '%') v /= 100;
  return { v, unit: u };
}

const nf = new Map();
function fmt(v, digits) {
  if (!nf.has(digits)) nf.set(digits, new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits, useGrouping: true }));
  return nf.get(digits).format(v).replace(/ /g, ' ');
}

/** Число → текст ячейки: по-русски, с ₽ или %. */
export function formatValue(v, unit = '') {
  if (!Number.isFinite(v)) return ERR.bad;
  const clean = Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12));
  if (unit === '%') return `${fmt(clean * 100, 2)}%`;
  if (unit === '₽') return `${fmt(clean, 2)} ₽`;
  return fmt(clean, 10);
}

// ---------- вычисление ----------

class FErr extends Error { constructor(code) { super(code); this.code = code; } }

/**
 * Вычислить дерево. cell(r, c) → { v, unit } | { empty } | { text } | { err } — значение ячейки (формулы считает сама таблица).
 * Возвращает { v, unit } или { err }.
 */
export function evaluate(tree, cell, size) {
  const inside = (r, c) => r >= 0 && c >= 0 && r < size.rows && c < size.cols;
  const at = (r, c) => {
    if (!inside(r, c)) throw new FErr(ERR.ref);
    const x = cell(r, c);
    if (x.err) throw new FErr(x.err);
    return x;
  };
  const scalar = (x) => {
    if (x.empty) return { v: 0, unit: '' };
    if (x.text !== undefined) throw new FErr(ERR.bad);
    return x;
  };
  const unitOf = (a, b, op) => {
    if (op === '+' || op === '-') return a.unit && b.unit && a.unit !== b.unit ? '' : (a.unit || b.unit);
    if (op === '*') { if (a.unit === '%') return b.unit === '%' ? '' : b.unit; if (b.unit === '%') return a.unit; return a.unit && b.unit ? '' : (a.unit || b.unit); }
    if (op === '/') { if (b.unit === '%') return a.unit; return a.unit && a.unit === b.unit ? '' : a.unit; }
    return '';
  };
  const values = (node) => {   // аргумент функции: диапазон или выражение → список чисел (пустые и текст в диапазоне пропускаются)
    if (node.t === 'range') {
      const r1 = Math.min(node.a.r, node.b.r); const r2 = Math.max(node.a.r, node.b.r);
      const c1 = Math.min(node.a.c, node.b.c); const c2 = Math.max(node.a.c, node.b.c);
      const out = [];
      for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) { const x = at(r, c); if (x.v !== undefined) out.push(x); }
      return out;
    }
    if (node.t === 'ref') { const x = at(node.r, node.c); return x.v !== undefined ? [x] : []; }
    return [ev(node)];
  };
  const common = (list) => { const u = new Set(list.map((x) => x.unit).filter(Boolean)); return u.size === 1 ? [...u][0] : ''; };
  const ev = (n) => {
    switch (n.t) {
      case 'num': return { v: n.v, unit: '' };
      case 'err': throw new FErr(n.v);
      case 'ref': return scalar(at(n.r, n.c));
      case 'range': throw new FErr(ERR.bad);
      case 'neg': { const x = ev(n.x); return { v: -x.v, unit: x.unit }; }
      case 'pct': { const x = ev(n.x); return { v: x.v / 100, unit: '%' }; }
      case 'bin': {
        const a = ev(n.l); const b = ev(n.r);
        let v;
        if (n.op === '+') v = a.v + b.v;
        else if (n.op === '-') v = a.v - b.v;
        else if (n.op === '*') v = a.v * b.v;
        else { if (b.v === 0) throw new FErr(ERR.div); v = a.v / b.v; }
        return { v, unit: unitOf(a, b, n.op) };
      }
      case 'fn': {
        if (n.fn === 'ROUND') {
          if (!n.args.length || n.args.length > 2) throw new FErr(ERR.bad);
          const x = ev(n.args[0]);
          const d = n.args[1] ? Math.trunc(ev(n.args[1]).v) : 0;
          const k = 10 ** d;
          return { v: Math.round((x.v + Math.sign(x.v) * Number.EPSILON) * k) / k, unit: x.unit };
        }
        const list = n.args.flatMap(values);
        if (n.fn === 'COUNT') return { v: list.length, unit: '' };
        if (!n.args.length) throw new FErr(ERR.bad);
        const unit = common(list);
        if (n.fn === 'SUM') return { v: list.reduce((s, x) => s + x.v, 0), unit };
        if (!list.length) { if (n.fn === 'AVERAGE') throw new FErr(ERR.div); return { v: 0, unit }; }
        if (n.fn === 'AVERAGE') return { v: list.reduce((s, x) => s + x.v, 0) / list.length, unit };
        if (n.fn === 'MIN') return { v: Math.min(...list.map((x) => x.v)), unit };
        return { v: Math.max(...list.map((x) => x.v)), unit };
      }
      default: throw new FErr(ERR.bad);
    }
  };
  try {
    const x = ev(tree);
    if (!Number.isFinite(x.v)) return { err: ERR.bad };
    return x;
  } catch (e) {
    return { err: e instanceof FErr ? e.code : ERR.bad };
  }
}

/** Вычислить все формулы сетки. grid[r][c] = { formula?: '=…', text: '…' }. Возвращает Map 'r:c' → { v, unit } | { err }. */
export function computeGrid(grid) {
  const rows = grid.length;
  const cols = rows ? Math.max(...grid.map((r) => r.length)) : 0;
  const memo = new Map();
  const busy = new Set();
  const trees = new Map();
  const value = (r, c) => {
    const key = `${r}:${c}`;
    const cellData = grid[r] && grid[r][c];
    if (!cellData) return { empty: true };
    if (!cellData.formula) return parseCellValue(cellData.text);
    if (memo.has(key)) return memo.get(key);
    if (busy.has(key)) return { err: ERR.cycle };
    busy.add(key);
    let res;
    try {
      if (!trees.has(key)) trees.set(key, parseFormula(cellData.formula));
      res = evaluate(trees.get(key), value, { rows, cols });
    } catch (e) {
      res = { err: ERR.bad };
    }
    busy.delete(key);
    // ячейка в цикле: ошибка цикла у всех, кто в нём
    memo.set(key, res);
    return res;
  };
  const out = new Map();
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < (grid[r] || []).length; c += 1) if (grid[r][c] && grid[r][c].formula) out.set(`${r}:${c}`, value(r, c));
  }
  return out;
}

/** Результат → текст ячейки. */
export const resultText = (res) => (res.err ? res.err : formatValue(res.v, res.unit));

// ---------- правка ссылок ----------

/**
 * Переписать ссылки формулы. map({ c, r, ac, ar }) → { c, r } (новое место) или null (ячейка удалена → #ССЫЛКА!).
 * Остальной текст формулы не меняется.
 */
export function rewriteRefs(formula, map) {
  const src = String(formula || '');
  const body = src.replace(/^\s*=/, '');
  const offset = src.length - body.length;
  let toks;
  try { toks = formulaTokens(body); } catch (e) { return src; }
  // роль ссылки: одиночная или начало / конец диапазона (при удалении строки диапазон сужается, а не ломается)
  toks.forEach((tk, i) => {
    if (tk.t !== 'ref') return;
    if (toks[i + 1] && toks[i + 1].t === ':' && toks[i + 2] && toks[i + 2].t === 'ref') { tk.role = 'start'; tk.pair = toks[i + 2]; toks[i + 2].role = 'end'; toks[i + 2].pair = tk; }
    else if (!tk.role) tk.role = 'single';
  });
  let out = src;
  for (const tk of toks.filter((x) => x.t === 'ref').reverse()) {
    const to = map(tk);
    const text = to ? refName(to.c, to.r, tk.ac, tk.ar) : ERR.ref;
    out = out.slice(0, offset + tk.s) + text + out.slice(offset + tk.e);
  }
  return out;
}

/** Сдвиг формулы при копировании протягиванием (как в Google Таблицах): $ не сдвигается; вышедшие за таблицу — #ССЫЛКА!. */
export function shiftFormula(formula, dr, dc) {
  return rewriteRefs(formula, (tk) => {
    const r = tk.ar ? tk.r : tk.r + dr;
    const c = tk.ac ? tk.c : tk.c + dc;
    return r < 0 || c < 0 || r >= MAX_ROW || c >= MAX_COL ? null : { r, c };
  });
}

/** Ссылки формулы (для подсветки при правке): [{ r1, c1, r2, c2 }]. */
export function formulaRanges(formula) {
  let toks;
  try { toks = formulaTokens(String(formula || '').replace(/^\s*=/, '')); } catch (e) { return []; }
  const out = [];
  for (let i = 0; i < toks.length; i += 1) {
    const a = toks[i];
    if (a.t !== 'ref') continue;
    if (toks[i + 1] && toks[i + 1].t === ':' && toks[i + 2] && toks[i + 2].t === 'ref') {
      const b = toks[i + 2];
      out.push({ r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
      i += 2;
    } else out.push({ r1: a.r, c1: a.c, r2: a.r, c2: a.c });
  }
  return out;
}

/** Можно ли сохранить формулу (для очистки HTML): начинается с «=», только допустимые знаки, до 500 знаков. */
export function formulaAllowed(text) {
  return typeof text === 'string' && text.length <= 500 && /^=[0-9A-Za-zА-Яа-яЁё$:;,.+\-−–—*/×÷()%#!\s]*$/.test(text);
}

/**
 * Ссылки формул таблицы после правки структуры. axis — 'row' или 'col'; kind — 'move' (from, to), 'insert' (at), 'remove' (at).
 * Ссылка на удалённую ячейку — #ССЫЛКА!; диапазон, задевший удалённую строку, сужается.
 */
export function structureMap(kind, a, b) {
  if (kind === 'move') return (i) => (i === a ? b : a < b && i > a && i <= b ? i - 1 : b < a && i >= b && i < a ? i + 1 : i);
  if (kind === 'insert') return (i) => (i >= a ? i + 1 : i);
  return (i, tk) => {
    if (i < a) return i;
    if (i > a) return i - 1;
    if (tk.role === 'start' && tk.pair && (tk.pair.ar ? tk.pair.r : tk.pair.r) !== undefined) {
      const other = tk.pair;
      const otherIdx = tk.axis === 'row' ? other.r : other.c;
      return otherIdx > a ? a : null;
    }
    if (tk.role === 'end' && tk.pair) {
      const otherIdx = tk.axis === 'row' ? tk.pair.r : tk.pair.c;
      return otherIdx < a ? a - 1 : null;
    }
    return null;
  };
}

/** Переписать все формулы ячеек (cells — элементы с data-formula) по карте индексов строки или столбца. */
export function remapFormulas(cells, axis, map) {
  for (const cell of cells) {
    const v = cell.getAttribute('data-formula');
    const n = rewriteRefs(v, (tk) => {
      tk.axis = axis;
      const idx = axis === 'row' ? tk.r : tk.c;
      const ni = map(idx, tk);
      if (ni === null || ni < 0) return null;
      return axis === 'row' ? { r: ni, c: tk.c } : { r: tk.r, c: ni };
    });
    if (n !== v) cell.setAttribute('data-formula', n);
  }
}
