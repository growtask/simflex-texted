// Этап 4 (MODULAR_PLAN.md): стили по слоям. Интерфейс берёт токены админки (--ui-* → переменные Simflex), блоки — токены сайта
// (переменные Simflex на .ted-content); стили texted не задевают страницу вокруг, а сброс стилей сайта и админки — texted.
// Решение 21.11: без @layer (сброс Simflex написан без слоёв и перебил бы слои texted).
import { group, test, eq, ok, wait } from '../harness.js';
import { make } from '../helpers.js';

// Имена переменных дизайн-системы Simflex (core/src/Layout/assetsGlobal/styles/abstract/_colors.scss, _radius.scss, _shadows.scss, base/_root.scss)
const FAMILIES = { gray: ['black', 'darker', 'dark', 'medium', 'light', 'lighter', 'white'], color1: ['darker', 'dark', 'main', 'light', 'lighter'], color2: ['darker', 'dark', 'main', 'light', 'lighter'] };
const SIMFLEX = new Set([
  ...['main', 'text-icon'].flatMap((k) => Object.entries(FAMILIES).flatMap(([f, list]) => list.map((s) => `--color-${k}-${f}-${s}`))),
  ...['error', 'alert', 'success', 'disabled'].flatMap((s) => ['dark', 'medium', 'light'].map((t) => `--color-states-${s}-${t}`)),
  ...['xsmall', 'small', 'medium', 'large', 'xlarge'].map((r) => `--radius-ui-${r}`), '--radius-blocks',
  ...['gray', 'primary'].flatMap((t) => ['xl', 'l', 'm', 's', 'xs'].map((s) => `--shadow-${t}-${s}`)),
  '--font-family-body', '--font-family-heading', '--font-mono',
]);
// Цвета дизайн-системы (для rgba — «цвет + прозрачность слоем») и отдельная палитра подсветки кода (в Figma её нет)
const DS = ['0D0D0D', '262626', '4D4D4D', '919599', 'DADFE5', 'EDF3FA', 'FFFFFF', '104FA6', '1461CC', '1975F7', '63A1F7', 'D2E2F7', '38388C', '4D4DBF', '6161F2', '9191F2', 'E5E5FF',
  'CC2929', 'FFA6A6', 'FFCCCC', '737300', 'D9D998', 'F2F2AA', '0E8C0E', '98D998', 'C3E5C3', '616466', 'C1C7CC', 'DFE4EB', 'FFF'];
const SYNTAX = ['0550AE', '0A3069', '116329', '6E7781', '8250DF', '953800', 'CF222E', '79C0FF', '7EE787', '8B949E', 'A5D6FF', 'D2A8FF', 'FF7B72', 'FFA657'];
const hexOf = (r, g, b) => [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();

const STYLE_FILES = ['theme.default.css', 'content.css', ...['tokens', 'shell', 'tabs', 'toolbar', 'tooltip', 'dropdown', 'input', 'popover', 'button', 'toggle', 'slash-menu', 'block-picker', 'interaction', 'preview', 'toasts', 'editing', 'blocks', 'motion'].map((n) => `ui/${n}.css`)];   // медиа — в blocks/media (этап 5)
// файла нет — ошибка, а не чужая страница 404 (демо-сервер PHP отдаёт её со своими цветами)
const source = async (f) => { const r = await fetch(new URL(`../../resources/css/${f}`, import.meta.url), { cache: 'no-store' }); if (!r.ok) throw new Error(`нет файла resources/css/${f}`); return r.text(); };
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Страница вокруг редактора (host.html) в невидимом фрейме → подписи вычисленных стилей. */
async function host(params) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:1000px;height:900px;position:absolute;left:-3000px;top:0;border:0';
  frame.src = new URL('./host.html?' + params, import.meta.url).href;
  document.body.append(frame);
  let ready = null;
  for (let i = 0; i < 200 && !ready; i++) { await wait(50); ready = frame.contentWindow && frame.contentWindow.__tedHostReady; }
  const res = ready ? await ready : null;
  frame.remove();
  return res;
}
const diff = (a, b) => Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);

group('Стили: только переменные', () => {
  test('интерфейс: цвета, скругления шкалы и тени — только токены (--ui-*), прямые цвета — только в tokens.css', async () => {
    const bad = [];
    for (const f of STYLE_FILES.filter((f) => f.startsWith('ui/') && f !== 'ui/tokens.css')) {
      const css = noComments(await source(f));
      for (const m of css.matchAll(/(--?[a-z][a-z0-9-]*)\s*:\s*([^;{}]*#[0-9a-f]{3,8}\b[^;{}]*)/gi)) {
        if (/^--ted-tok-/.test(m[1])) continue;   // палитра подсветки кода (в Figma её нет)
        if (/^(-webkit-)?mask/.test(m[1])) continue;   // маска: важна только прозрачность, цвет не виден
        bad.push(`${f}: ${m[1]}: ${m[2].trim().slice(0, 60)}`);
      }
      for (const m of css.matchAll(/var\(--color-[a-z0-9-]+/g)) bad.push(`${f}: ${m[0]} — в интерфейсе только --ui-* (токен админки)`);
    }
    eq(bad.length, 0, '\n' + bad.join('\n'));
  });

  test('блоки: прямые цвета только в токенах подсветки кода (--ted-tok-*), остальное — переменные Simflex', async () => {
    const bad = [];
    for (const f of ['theme.default.css', 'content.css']) {
      const css = noComments(await source(f));
      for (const m of css.matchAll(/(--?[a-z][a-z0-9-]*)\s*:\s*([^;{}]*)/gi)) {
        const [, prop, value] = m;
        if (/^--ted-tok-/.test(prop)) continue;
        const bare = value.replace(/var\(--[a-z0-9-]+,\s*#[0-9a-f]{3,8}\)/gi, '');
        if (/#[0-9a-f]{3,8}\b/i.test(bare)) bad.push(`${f}: ${prop}: ${value.trim().slice(0, 60)}`);
      }
    }
    eq(bad.length, 0, '\n' + bad.join('\n'));
  });

  test('все переменные дизайн-системы, на которые ссылается texted, есть в Simflex (имена без опечаток)', async () => {
    const bad = new Set();
    for (const f of STYLE_FILES) {
      const css = noComments(await source(f));
      for (const m of css.matchAll(/var\((--(?:color|radius|shadow|font)-[a-z0-9-]+)/g)) if (!SIMFLEX.has(m[1])) bad.add(`${f}: ${m[1]}`);
    }
    eq([...bad].join('\n'), '');
  });

  test('прежних имён переменных сайта (до 18.11: --gray-*, --color1-*, --text-icon-*) больше нет', async () => {
    const bad = [];
    for (const f of STYLE_FILES) {
      const css = noComments(await source(f));
      for (const m of css.matchAll(/var\(--(?:gray|color1|color2|text-icon)-[a-z0-9-]+/g)) bad.push(`${f}: ${m[0]}`);
    }
    eq(bad.join('\n'), '');
  });

  test('в dist/ted.css цвета только дизайн-системы (rgba — цвет дизайн-системы с прозрачностью), кроме подсветки кода', async () => {
    const css = noComments(await (await fetch(new URL('../../dist/ted.css', import.meta.url), { cache: 'no-store' })).text());
    const hex = [...new Set((css.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map((h) => h.slice(1).toUpperCase()))].filter((h) => !DS.includes(h) && !SYNTAX.includes(h) && h !== '000');   // #000 — только в масках (виден не цвет, а прозрачность)
    const rgba = [...new Set([...css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)].map((m) => hexOf(m[1], m[2], m[3])))]
      .filter((h) => !DS.includes(h) && !SYNTAX.includes(h) && h !== '000000' && !['144B99', '343434', 'DFE4EB'].includes(h));
    eq(hex.join(', '), '', 'HEX вне дизайн-системы');
    eq(rgba.join(', '), '', 'rgba вне дизайн-системы');
  });
});

group('Стили: токены админки и сайта — разные наборы', () => {
  test('интерфейс берёт токены админки (:root), палитра сайта на .ted-content интерфейс не меняет, а блоки — меняет', async () => {
    const ed = make('<p>Текст <a href="/x">ссылка</a></p>', { previewMode: false });
    const link = ed.editable.querySelector('a');
    const save = ed.toolbar.saveBtn;
    ed.toolbar.update({ ...ed.state, mode: 'edit' });
    const before = { link: getComputedStyle(link).color, save: getComputedStyle(save).backgroundColor, bar: getComputedStyle(ed.toolbar.el).backgroundColor };
    try {
      // админка: свой синий и белый
      document.documentElement.style.setProperty('--color-main-gray-white', 'rgb(250, 250, 240)');
      await wait(0);
      document.getAnimations().forEach((a) => a.finish());   // фон панели меняется плавно
      ok(getComputedStyle(ed.toolbar.el).backgroundColor === 'rgb(250, 250, 240)', 'панель — из токена админки: ' + getComputedStyle(ed.toolbar.el).backgroundColor);
      document.documentElement.style.removeProperty('--color-main-gray-white');
      // сайт: акцент на .ted-content
      ed.editable.style.setProperty('--color-text-icon-color1-main', 'rgb(200, 0, 0)');
      ed.editable.style.setProperty('--color-main-gray-white', 'rgb(1, 2, 3)');
      await wait(0);
      document.getAnimations().forEach((a) => a.finish());
      eq(getComputedStyle(link).color, 'rgb(200, 0, 0)', 'ссылка в блоке — цвет сайта');
      eq(getComputedStyle(ed.toolbar.el).backgroundColor, before.bar, 'панель интерфейса не изменилась');
      const ui = ed.editable.querySelector('[class*="ted-ui-"]');
      if (ui) eq(getComputedStyle(ui).backgroundColor === 'rgb(1, 2, 3)', false, 'элементы интерфейса внутри блоков — по-прежнему токены админки');
    } finally {
      document.documentElement.style.removeProperty('--color-main-gray-white');
      ed.destroy();
    }
    ok(before.link && before.bar, 'значения сняты');
  });

  test("тема 'auto' следует за темой админки: data-theme на <html>", async () => {
    const root = document.documentElement;
    const had = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    const ed = make('<p>а</p>', { theme: 'auto' });
    try {
      eq(ed.ui.dataset.tedTheme, 'dark', 'admin dark');
      root.setAttribute('data-theme', 'light');
      await wait(0);
      eq(ed.ui.dataset.tedTheme, 'light', 'переключили админку — переключился редактор');
      root.setAttribute('data-theme', 'dark');
      await wait(0);
      eq(ed.ui.dataset.tedTheme, 'dark');
    } finally {
      ed.destroy();
      if (had === null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', had);
    }
  });
});

group('Стили: страница вокруг и сброс стилей сайта', () => {
  test('ted.css не меняет страницу вокруг: заголовки, абзацы, списки, ссылки, таблица, кнопка и поле — как без него', async () => {
    const without = await host('ted=0');
    const withTed = await host('ted=1');
    ok(without && withTed, 'страница не открылась');
    const d = diff(without.outside, withTed.outside);
    eq(d.length, 0, 'изменились: ' + d.slice(0, 8).join(', '));
  });

  test('сброс стилей сайта и админки (как в Simflex) не меняет интерфейс редактора и блоки — светлая тема', async () => {
    const plain = await host('ted=1');
    const reset = await host('ted=1&reset=1');
    ok(plain && reset && Object.keys(plain.ed).length > 200, 'редактор не собрался');
    const d1 = diff(plain.ed, reset.ed);
    const d2 = diff(plain.site, reset.site);
    eq(d1.length, 0, `интерфейс и блоки в редакторе (${d1.length}): ` + d1.slice(0, 6).join('\n'));
    eq(d2.length, 0, `блоки на сайте (${d2.length}): ` + d2.slice(0, 6).join('\n'));
  });

  test('то же в тёмной теме интерфейса', async () => {
    const plain = await host('ted=1&theme=dark');
    const reset = await host('ted=1&theme=dark&reset=1');
    const d = diff(plain.ed, reset.ed);
    eq(d.length, 0, `(${d.length}): ` + d.slice(0, 6).join('\n'));
  });
});
