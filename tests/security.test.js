import { group, test, ok } from './harness.js';
import { Ted, make } from './helpers.js';

// Набор XSS-векторов (по мотивам OWASP XSS Filter Evasion Cheat Sheet и известных обходов санитайзеров).
// Каждый вектор прогоняется через Ted.clean, setHTML + getHTML и вставку из буфера; в результате не должно быть ничего исполняемого.
// Векторы лежат в security-vectors.json — их же использует серверный тест PHP (php/test-sanitize.php).
const VECTORS = await (await fetch(new URL('./security-vectors.json', import.meta.url))).json();

const UNSAFE_TAGS = /^(script|style|link|meta|base|template|noscript|object|embed|applet|frame|frameset|form|input|button|textarea|select|option|xmp|listing|plaintext|title|svg|math|foreignobject|animate|set|use)$/i;
const URL_ATTRS = ['href', 'src', 'srcset', 'data', 'action', 'formaction', 'poster', 'background', 'xlink:href', 'ping', 'codebase', 'lowsrc', 'dynsrc'];
const DANGEROUS_URL = /^(?:javascript|vbscript|livescript|mocha):/;

/** Нашёл ли разбор результата что-то, что может выполниться, если вставить этот HTML на страницу. */
function problems(html) {
  const found = [];
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  for (const el of tpl.content.querySelectorAll('*')) {
    const tag = el.localName;
    if (UNSAFE_TAGS.test(tag)) found.push(`тег <${tag}>`);
    if (tag === 'iframe') {
      const src = el.getAttribute('src') || '';
      // блок «iFrame» (решение заказчика): любой https-адрес, но всегда в песочнице без srcdoc
      const block = el.parentElement && el.parentElement.matches('figure.ted-iframe') && /^https:\/\/[^/@:\s]+\//.test(src) && /allow-scripts/.test(el.getAttribute('sandbox') || '');
      if ((!block && !/^https:\/\/(www\.youtube-nocookie\.com|rutube\.ru|vkvideo\.ru)\//.test(src)) || el.hasAttribute('srcdoc') || !el.hasAttribute('sandbox')) found.push(`<iframe src="${src.slice(0, 40)}">`);
    }
    for (const a of Array.from(el.attributes)) {
      const name = a.name.toLowerCase();
      const value = a.value.replace(/[^\x21-\x7e]/g, '').toLowerCase();
      if (name.startsWith('on')) found.push(`обработчик ${name}`);
      if (name === 'srcdoc') found.push('srcdoc');
      if (URL_ATTRS.includes(name)) {
        const parts = name === 'srcset' ? value.split(',').map((x) => x.split(/\s+/)[0]) : [value];
        for (const p of parts) {
          if (DANGEROUS_URL.test(p)) found.push(`${name}=${p.slice(0, 30)}`);
          if (/^data:/.test(p) && !/^data:image\/(png|jpe?g|gif|webp|avif|bmp)[;,]/.test(p)) found.push(`${name}=data:`);
        }
      }
      if (name === 'style' && /expression\s*\(|javascript:|url\s*\(\s*['"]?\s*(?:javascript|vbscript|data):/i.test(a.value)) found.push('style с исполняемым');
      if (name === 'target' && a.value === '_blank' && !/noopener/.test(el.getAttribute('rel') || '')) found.push('target=_blank без noopener');
    }
  }
  return found;
}

group('Безопасность: XSS-векторы через очистку HTML', () => {
  test(`Ted.clean: ${VECTORS.length} векторов — на выходе нет исполняемого`, () => {
    const bad = [];
    for (const v of VECTORS) {
      const out = Ted.clean(v);
      const p = problems(out);
      if (p.length) bad.push(`${JSON.stringify(v).slice(0, 70)} → ${p.join(', ')} :: ${out.slice(0, 80)}`);
    }
    ok(!bad.length, '\n' + bad.join('\n'));
  });

  test('setHTML → getHTML: то же, и повторная очистка ничего не меняет', () => {
    const bad = [];
    for (const v of VECTORS) {
      const ed = make('<p>а</p>');
      ed.setHTML(v, { silent: true });
      const out = ed.getHTML();
      const p = problems(out);
      if (p.length) bad.push(`${JSON.stringify(v).slice(0, 70)} → ${p.join(', ')}`);
      if (Ted.clean(out) !== Ted.clean(Ted.clean(out))) bad.push('нестабильная очистка: ' + JSON.stringify(v).slice(0, 50));
    }
    ok(!bad.length, '\n' + bad.join('\n'));
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
    }
    ok(!bad.length, '\n' + bad.join('\n'));
  });

  test('ссылки: внешние открываются с rel="noopener", javascript: и data: не сохраняются как href', () => {
    const out = Ted.clean('<p><a href="https://example.com" target="_blank">а</a> <a href="javascript:alert(1)">б</a> <a href="data:text/html,x">в</a></p>');
    ok(/rel="[^"]*noopener/.test(out), 'noopener: ' + out);
    ok(!/javascript:|data:text/i.test(out), out);
  });

  test('имена классов и id не позволяют вырваться из атрибута', () => {
    const out = Ted.clean('<p class="ted-bg-gray&quot; onmouseover=&quot;alert(1)" id="x&quot; onclick=&quot;1">а</p>');
    ok(!/onmouseover|onclick/i.test(out) || !problems(out).length, out);
    ok(problems(out).length === 0, out);
  });
});

group('Безопасность: «сырой» старый HTML', () => {
  test('таблицы, картинки, видео, аудио сохраняются; iframe — только доверенных видеохостов и с sandbox', () => {
    const out = Ted.clean('<table><tr><td>1</td></tr></table><figure><img src="/a.png" alt="а"></figure><video src="/v.mp4" controls></video><audio src="/a.mp3" controls></audio>'
      + '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560"></iframe><iframe src="https://evil.example/x"></iframe><iframe src="http://www.youtube.com/embed/x"></iframe>');
    ok(/<table/.test(out) && /<img/.test(out) && /<video/.test(out) && /<audio/.test(out), 'безопасные теги остались: ' + out);
    ok(out.includes('youtube.com/embed/dQw4w9WgXcQ') && /sandbox="/.test(out), 'YouTube остался с sandbox: ' + out);
    ok(!out.includes('evil.example') && !out.includes('http://www.youtube.com'), 'чужой и небезопасный iframe убран');
  });
  test('форма, поля, svg, object, embed убираются целиком; корневой запрещённый блок не оставляет пустую обёртку', () => {
    const out = Ted.clean('<form action="https://evil.example/steal"><input name="password"></form><svg><circle r="1"/></svg><object data="/x.swf"></object><embed src="/x.swf"><p>текст</p>');
    ok(!/<form|<input|<svg|<object|<embed|ted-ui-raw|data-ted-raw/.test(out), out);
    ok(out.includes('текст'));
  });
  test('режим rawHtml: "trusted" оставляет их (для доверенных авторов), но скрипты и обработчики всё равно вычищает', () => {
    const ed = make('<p>а</p>', { rawHtml: 'trusted' });
    const out = Ted.clean('<form action="/ok"><input name="q" onfocus="alert(1)"></form><script>alert(1)</script>');
    ok(/<form/.test(out) && !/onfocus|<script/.test(out), out);
    make('<p>б</p>');   // следующий редактор возвращает строгий режим
    ok(!/<form/.test(Ted.clean('<form></form>')), 'строгий режим по умолчанию');
    ed.destroy();
  });
});
