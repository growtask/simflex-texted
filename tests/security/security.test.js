// Этап 3 (MODULAR_PLAN.md): безопасность в браузере. Принцип — в редакторе и на сайте не выполняется ничей код из содержимого.
// Сервер проверяют tests/php/test-sanitize.php (те же векторы и адреса), tests/php/test-security.php, tests/php/test-opengraph.php.
import { group, test, eq, ok, wait } from '../harness.js';
import { make, Ted } from '../helpers.js';
import { urlOk } from '../../src/core/urls.js';
import { menuGroups } from '../../src/core/blocks.js';
import { ALLOWED_TAGS } from '../../src/core/allowlist.js';

const VECTORS = await (await fetch(new URL('../security-vectors.json', import.meta.url))).json();
const URLS = await (await fetch(new URL('./url-vectors.json', import.meta.url))).json();
const BAD_LINKS = URLS.filter(([, kind, good]) => kind === 'link' && !good).map(([u]) => u);

const UNSAFE_TAGS = /^(script|style|link|meta|base|template|noscript|object|embed|applet|frame|frameset|form|input|button|textarea|select|option|xmp|listing|plaintext|title|svg|math|foreignobject|animate|set|use)$/i;
const URL_ATTRS = { href: 'link', src: 'media', srcset: 'image', data: 'media', action: 'media', formaction: 'media', poster: 'media', background: 'media', 'xlink:href': 'link', ping: 'media', codebase: 'media', lowsrc: 'media', dynsrc: 'media' };

/** Что в HTML может выполниться, если вставить его на страницу. */
function problems(html) {
  const found = [];
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of tpl.content.querySelectorAll('*')) {
    const tag = el.localName;
    if (UNSAFE_TAGS.test(tag)) found.push(`тег <${tag}>`);
    if (tag === 'iframe') {
      const src = el.getAttribute('src') || '';
      if (!/^https:\/\//.test(src) || el.hasAttribute('srcdoc') || !el.getAttribute('sandbox') || el.getAttribute('referrerpolicy') !== 'strict-origin-when-cross-origin') found.push(`<iframe src="${src.slice(0, 40)}">`);
    }
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      if (name.startsWith('on')) found.push(`обработчик ${name}`);
      if (name === 'srcdoc' || name === 'style' || name === 'formaction' || name === 'xlink:href') found.push(name);
      if (URL_ATTRS[name]) {
        const kind = name === 'src' && (tag === 'img' || tag === 'source') ? 'image' : URL_ATTRS[name];
        const parts = name === 'srcset' ? a.value.split(',').map((x) => x.trim().split(/\s+/)[0]) : [a.value];
        for (const p of parts) if (!urlOk(p, kind)) found.push(`${name}=${p.slice(0, 30)}`);
      }
      if (name === 'class' && a.value.split(/\s+/).some((c) => c && !/^ted-[a-z0-9_-]+$/.test(c))) found.push('чужой класс ' + a.value);
      if (name === 'id' && !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(a.value)) found.push('id ' + a.value);
      if (name === 'target' && a.value === '_blank' && !/noopener/.test(el.getAttribute('rel') || '')) found.push('target=_blank без noopener');
    }
  }
  return found;
}

group('Безопасность: ссылки и адреса', () => {
  test(`одно правило адресов: ${URLS.length} примеров (те же проверяет сервер)`, () => {
    const bad = URLS.filter(([u, kind, good]) => urlOk(u, kind) !== good).map(([u, kind, good]) => `${JSON.stringify(u)} (${kind}): ждали ${good ? 'можно' : 'нельзя'}`);
    eq(bad.length, 0, bad.join('\n'));
  });

  test('ссылка с уловкой (javascript:, data:, file:, blob:, %6A…, невидимые знаки, регистр) не сохраняется, текст остаётся', () => {
    const bad = [];
    for (const u of BAD_LINKS) {
      const tpl = document.createElement('template');
      const a = document.createElement('a');
      a.setAttribute('href', u);
      a.textContent = 'текст';
      const p = document.createElement('p');
      p.append(a);
      tpl.content.append(p);
      const out = Ted.clean(tpl.innerHTML);
      if (/href=/.test(out) || !out.includes('текст')) bad.push(`${JSON.stringify(u)} → ${out}`);
    }
    eq(bad.length, 0, bad.join('\n'));
  });

  test('относительные ссылки и «//сайт» остаются (решение 21.11)', () => {
    for (const u of ['page.html', '?page=2', '../docs/', '//cdn.example.com/a.pdf', '/catalog', '#razdel', 'mailto:a@example.com', 'tel:+70000000000']) {
      ok(Ted.clean(`<p><a href="${u}">т</a></p>`).includes(`href="${u}"`), u);
    }
  });

  test('адреса во всех блоках: кнопка, карточка, товар, фрейм, медиа, картинка — опасная схема не сохраняется', () => {
    const js = 'javascript:alert(1)';
    const html = [
      `<div class="ted-button"><a class="ted-button__btn" href="${js}">Купить</a></div>`,
      `<div class="ted-embed"><div class="ted-embed__foot"><a class="ted-embed__open" href="${js}">Открыть</a></div></div>`,
      `<div class="ted-product"><p class="ted-product__name">Товар</p><a class="ted-product__btn" href="${js}">Перейти</a></div>`,
      `<figure class="ted-iframe"><iframe src="${js}"></iframe></figure>`,
      `<figure class="ted-iframe"><iframe src="data:text/html,<script>alert(1)</script>"></iframe></figure>`,
      `<figure class="ted-media ted-media--image"><img src="${js}" alt=""></figure>`,
      `<figure class="ted-media ted-media--image"><img src="data:image/svg+xml,<svg onload=alert(1)>" alt=""></figure>`,
      `<figure class="ted-media ted-media--video"><video src="${js}"></video></figure>`,
      `<figure class="ted-media ted-media--video"><a href="${js}" data-ted-video="${js}">Видео</a></figure>`,
      `<figure class="ted-media ted-media--audio"><audio src="blob:https://example.com/x"></audio></figure>`,
      `<figure class="ted-media ted-media--file"><a href="file:///etc/passwd" download="">Файл</a></figure>`,
    ].join('');
    const out = Ted.clean(html);
    eq(problems(out).join(', '), '', out);
    ok(!/javascript:|blob:|file:|data:text|svg\+xml/i.test(out), out);
  });

  test('растровая картинка data:image остаётся (картинки старых статей, решение 21.11), SVG — нет', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const out = Ted.clean(`<figure><img src="${png}" alt="а"></figure><div class="old"><img src="${png}"></div>`);
    ok((out.match(/data:image\/png/g) || []).length === 2, out);
    ok(!Ted.clean('<figure><img src="data:image/svg+xml;base64,PHN2Zz4=" alt="а"></figure>').includes('svg+xml'));
    ok(!Ted.clean(`<p><a href="${png}">ссылка</a></p>`).includes('data:'), 'в ссылке data: нельзя');
  });
});

group('Безопасность: XSS-векторы', () => {
  test(`Ted.clean: ${VECTORS.length} векторов — на выходе нет исполняемого`, () => {
    const bad = [];
    for (const v of VECTORS) {
      const out = Ted.clean(v);
      const p = problems(out);
      if (p.length) bad.push(`${JSON.stringify(v).slice(0, 70)} → ${p.join(', ')} :: ${out.slice(0, 80)}`);
      if (Ted.clean(out) !== out) bad.push('повторная очистка меняет результат: ' + JSON.stringify(v).slice(0, 60));
    }
    eq(bad.length, 0, '\n' + bad.join('\n'));
  });

  test('загрузка в редактор (setHTML → getHTML): то же', () => {
    const bad = [];
    const ed = make('<p>а</p>');
    for (const v of VECTORS) {
      ed.setHTML(v, { silent: true });
      const p = problems(ed.getHTML());
      if (p.length) bad.push(`${JSON.stringify(v).slice(0, 70)} → ${p.join(', ')}`);
      const live = problems(ed.editable.innerHTML).filter((x) => !/чужой класс|contenteditable/.test(x));
      if (live.some((x) => /обработчик|тег <script|srcdoc|javascript/.test(x))) bad.push(`в редакторе: ${JSON.stringify(v).slice(0, 60)} → ${live.join(', ')}`);
    }
    ed.destroy();
    eq(bad.length, 0, '\n' + bad.join('\n'));
  });

  test('вставка из буфера (text/html): векторы не доходят до документа', () => {
    const bad = [];
    for (const v of VECTORS) {
      const ed = make('<p>а</p>');
      ed.focus();
      const r = document.createRange();
      r.selectNodeContents(ed.editable.firstChild);
      r.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      const dt = new DataTransfer();
      dt.setData('text/html', v);
      dt.setData('text/plain', 'x');
      ed.editable.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      const p = problems(ed.getHTML());
      if (p.length) bad.push(`${JSON.stringify(v).slice(0, 70)} → ${p.join(', ')}`);
      ed.destroy();
    }
    eq(bad.length, 0, '\n' + bad.join('\n'));
  });

  test('импорт JSON (Ted.fromBlocks): опасные адреса и разметка в полях не проходят', () => {
    const out = Ted.fromBlocks([
      { type: 'p', text: '<img src=x onerror=alert(1)>' },
      { type: 'h2', text: 'Заголовок', anchor: 'x" onclick="alert(1)' },
      { type: 'image', url: 'javascript:alert(1)', alt: '"><script>alert(1)</script>' },
      { type: 'video', url: 'javascript:alert(1)', embed: 'https://evil.example/' },
      { type: 'audio', url: 'data:text/html,<script>alert(1)</script>' },
      { type: 'file', url: 'file:///etc/passwd', name: 'Файл' },
      { type: 'code', lang: 'js" onmouseover="alert(1)', code: '<script>alert(1)</script>' },
    ]);
    eq(problems(out).join(', '), '', out);
    const tpl = document.createElement('template');
    tpl.innerHTML = out;
    ok(!tpl.content.querySelector('script, img[onerror], [onclick], [onmouseover]'), 'текст полей не стал разметкой: ' + out);
    ok(![...tpl.content.querySelectorAll('[href], [src], [data-ted-video]')].some((el) => /javascript:|file:|data:text|evil\.example/i.test(el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data-ted-video'))), out);
    ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'), 'разметка в тексте — просто текст');
  });
});

group('Безопасность: старый HTML и белый список', () => {
  test('старый HTML чистится тем же белым списком, что на сервере: без style, чужих классов, форм и SVG', () => {
    const out = Ted.clean('<table style="width:100%" class="mce-item-table ted-x"><tr><td style="color:red" onclick="x()" data-x="1">1</td></tr></table>'
      + '<div class="wrapper"><form action="https://evil.example/"><input name="password"></form><svg><circle r="1"/></svg><font color="red">старый текст</font></div>');
    eq(problems(out).join(', '), '', out);
    ok(!/style=|mce-item|data-x|<form|<input|<svg|<font/.test(out), out);
    ok(out.includes('старый текст') && out.includes('<td>1</td>'), 'текст остаётся: ' + out);
  });

  test('iframe в старом HTML — только видеоплощадки и всегда с песочницей; в блоке «iFrame» — любой https с песочницей', () => {
    const out = Ted.clean('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" sandbox="allow-top-navigation"></iframe><iframe src="https://evil.example/x"></iframe><iframe src="http://www.youtube.com/embed/x"></iframe>');
    ok(out.includes('youtube.com/embed/dQw4w9WgXcQ') && !out.includes('allow-top-navigation') && !out.includes('evil.example') && !out.includes('http://www'), out);
    const block = Ted.clean('<figure class="ted-iframe"><iframe src="https://forms.example.com/f" srcdoc="<script>alert(1)</script>"></iframe></figure>');
    ok(/sandbox="allow-scripts[^"]*"/.test(block) && /referrerpolicy="strict-origin-when-cross-origin"/.test(block) && !/srcdoc/.test(block), block);
  });

  test('блок «сырой HTML» создать в редакторе нельзя: его нет в меню', () => {
    const types = menuGroups().flatMap((g) => g.items.map((i) => i.type));
    ok(!types.some((t) => /raw|html/i.test(t)), types.join(','));
  });

  test('белый список: SVG, MathML, формы, style и script в него не входят', () => {
    for (const t of ['svg', 'math', 'form', 'input', 'button', 'style', 'script', 'object', 'embed', 'iframe-srcdoc']) ok(!ALLOWED_TAGS.includes(t), t);
  });

  test('id и классы — только по шаблону: из атрибута не вырваться', () => {
    const out = Ted.clean('<h2 id="x&quot; onclick=&quot;1">а</h2><p class="ted-bg-gray&quot; onmouseover=&quot;alert(1)">б</p><h3 id="' + 'a'.repeat(70) + '">в</h3>');
    eq(problems(out).join(', '), '', out);
  });

  test('режим rawHtml: "trusted" (доверенные авторы) оставляет форму, но скрипты, обработчики и опасные адреса вычищает', () => {
    const ed = make('<p>а</p>', { rawHtml: 'trusted' });
    const out = Ted.clean('<form action="/ok"><input name="q" onfocus="alert(1)"></form><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    ok(/<form/.test(out) && !/onfocus|<script|javascript:/.test(out), out);
    ed.destroy();
    make('<p>б</p>').destroy();   // следующий редактор возвращает строгий режим
    ok(!/<form/.test(Ted.clean('<form></form>')), 'строгий режим по умолчанию');
  });
});

group('Безопасность: сайт со строгой CSP', () => {
  test('демо сайта выводит содержимое очищенным (как сервер перед выводом): образец с onclick и style — без них', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:800px;position:absolute;left:-2000px;top:0';
    frame.src = new URL('../../examples/site.html', import.meta.url).href;
    document.body.append(frame);
    let content = null;
    for (let i = 0; i < 100 && !(content && content.firstElementChild); i++) { await wait(50); content = frame.contentDocument && frame.contentDocument.getElementById('content'); }
    ok(content && content.firstElementChild, 'страница сайта не открылась');
    const html = content.innerHTML;
    frame.remove();
    ok(/^<div class="ted-content"/.test(html), 'обёртка ted-content');
    ok(!/\son\w+=|\sstyle=|<script/i.test(html), 'нет обработчиков, style и скриптов: ' + html.slice(0, 200));
  });

  test("все блоки на странице с CSP script-src 'self' (без встроенных скриптов): нарушений нет, content.js работает", async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:1000px;height:800px;position:absolute;left:-2000px;top:0';
    frame.src = new URL('./csp-site.html', import.meta.url).href;
    document.body.append(frame);
    let result = null;
    for (let i = 0; i < 100 && !result; i++) { await wait(50); result = frame.contentWindow && frame.contentWindow.__tedCsp; }
    frame.remove();
    ok(result, 'страница с CSP не загрузилась');
    eq(result.violations.join('\n'), '', 'нарушения CSP');
    ok(result.blocks >= 40, 'блоков на странице: ' + result.blocks);
    ok(result.audioPlayers > 0, 'аудиоплеер content.js подключился');
    ok(result.copyButtons > 0, 'кнопка «Копировать код» content.js подключилась');
    eq(result.inlineHandlers, 0, 'в выводе нет встроенных обработчиков');
  });
});
