// Мини-раннер автотестов Ted (чистый JS, без зависимостей). Запускается в браузере: tests/index.html.
// Тест: test('название', () => { eq(a, b); ok(x); }) — может быть async. group('имя', () => {...}) — группа.

const tests = [];
const after = [];

/** Уборка после каждого теста (помощники закрывают свои редакторы — иначе к середине набора на странице сотни живых редакторов и WebKit тормозит). */
export function afterEach(fn) { after.push(fn); }
let prefix = '';

export function group(name, fn) {
  const old = prefix;
  prefix = old ? `${old} › ${name}` : name;
  fn();
  prefix = old;
}

export function test(name, fn) {
  tests.push({ name: prefix ? `${prefix} › ${name}` : name, fn });
}

const show = (v) => (typeof v === 'string' ? JSON.stringify(v).replace(/\\u00a0/g, '·') : JSON.stringify(v));

export function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg ? `${msg}: ` : ''}ожидалось ${show(expected)}, получено ${show(actual)}`);
}

export function deepEq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg ? `${msg}: ` : ''}ожидалось ${b}, получено ${a}`);
}

export function ok(value, msg = 'условие не выполнено') {
  if (!value) throw new Error(msg);
}

export const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Нбсп → «·», чтобы в сообщениях и ожиданиях было видно неразрывные пробелы. */
export const vis = (s) => String(s).replace(/ /g, '·');

// Быстрый режим: проверки раскладки по матрице «ширина × тема» идут только для 1000 px, light.
// Остальные 7 сочетаний (860, 768, 414 и тёмная тема) — в полном прогоне (tools/test.ps1 -Full).
export const MATRIX_SKIP = /(?:860|768|414) px, (?:light|dark)|1000 px, dark/;

export async function run(report, only = null, { fast = false } = {}) {
  const results = [];
  for (const t of tests) {
    if (only && !t.name.toLowerCase().includes(only.toLowerCase())) continue;
    if (fast && MATRIX_SKIP.test(t.name)) continue;
    const started = performance.now();
    try {
      await t.fn();
      results.push({ name: t.name, ok: true, ms: performance.now() - started });
    } catch (e) {
      results.push({ name: t.name, ok: false, error: e && e.message ? e.message : String(e), ms: performance.now() - started });
    }
    for (const fn of after) { try { await fn(); } catch (e) { /* уборка не должна ронять прогон */ } }
    if (report) report(results[results.length - 1], results.length, tests.length);
  }
  return results;
}
