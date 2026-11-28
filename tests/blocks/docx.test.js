// Word (.docx) — загрузка и выгрузка без библиотек (1.0.5): resources/js/core/docx.js, меню «Ещё».
import { group, test, eq, ok, wait } from '../harness.js';
import { make } from '../helpers.js';
import { docxToHtml, htmlToDocx, unzip } from '../../resources/js/core/docx.js';
import { wordToHtml, replaceWithWord } from '../../resources/js/ui/exchange.js';

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
// красная точка 1×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

/** Zip со сжатием (как у Word): проверяем распаковку deflate. */
async function deflateZip(entries) {
  const enc = new TextEncoder();
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (u8) => { let c = 0xffffffff; for (const b of u8) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const parts = []; const central = []; let off = 0;
  for (const e of entries) {
    const raw = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    const comp = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const name = enc.encode(e.name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 8, true); lh.setUint32(14, crc(raw), true);
    lh.setUint32(18, comp.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, comp);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(10, 8, true); cd.setUint32(16, crc(raw), true); cd.setUint32(20, comp.length, true);
    cd.setUint32(24, raw.length, true); cd.setUint16(28, name.length, true); cd.setUint32(42, off, true);
    central.push(new Uint8Array(cd.buffer), name);
    off += 30 + name.length + comp.length;
  }
  const size = central.reduce((s, b) => s + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]).arrayBuffer();
}

/** Документ «как из Word»: свои id стилей (русский Word — «1», «2»), нумерация, ссылка, картинка, таблица с шапкой. */
async function wordLikeDocx() {
  const p = (inner, ppr = '') => `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${inner}</w:p>`;
  const r = (t, rpr = '') => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
  const li = (t, num, lvl = 0) => p(r(t), `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${num}"/></w:numPr>`);
  const body = [
    p(r('Заголовок раздела'), '<w:pStyle w:val="1"/>'),
    p(r('Подраздел'), '<w:pStyle w:val="2"/>'),
    p(r('Обычный ') + r('жирный', '<w:b/>') + r(' и ') + r('курсив', '<w:i/>') + r(' и ') + r('выкл', '<w:b w:val="0"/>') + ' ' + '<w:hyperlink r:id="rId5">' + r('ссылка') + '</w:hyperlink>' + r(' м') + r('2', '<w:vertAlign w:val="superscript"/>')),
    li('один', 1), li('вложенный', 1, 1), li('два', 1),
    li('первый', 2), li('второй', 2),
    p(r('Мудрая мысль'), '<w:pStyle w:val="Quote"/>'),
    p('<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="Рисунок 1" descr="Точка"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><a:blip r:embed="rId6"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>'),
    '<w:tbl><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc>' + p(r('Имя')) + '</w:tc><w:tc>' + p(r('Цена')) + '</w:tc></w:tr><w:tr><w:tc>' + p(r('Коврик')) + '</w:tc><w:tc>' + p(r('990')) + '</w:tc></w:tr></w:tbl>',
    p(''),
  ].join('');
  return deflateZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: 'word/document.xml', data: `<?xml version="1.0" encoding="UTF-8"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>` },
    { name: 'word/styles.xml', data: `<?xml version="1.0"?><w:styles ${W_NS}><w:style w:type="paragraph" w:styleId="1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="2"><w:name w:val="heading 2"/></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style></w:styles>` },
    { name: 'word/numbering.xml', data: `<?xml version="1.0"?><w:numbering ${W_NS}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>` },
    { name: 'word/_rels/document.xml.rels', data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="hyperlink" Target="https://example.com/a" TargetMode="External"/><Relationship Id="rId6" Type="image" Target="media/image1.png"/></Relationships>' },
    { name: 'word/media/image1.png', data: PNG },
  ]);
}

group('Word (.docx): загрузка и выгрузка (1.0.5)', () => {
  test('загрузка документа Word: заголовки по стилям, оформление, ссылка, списки с вложенностью, цитата, картинка, таблица с шапкой', async () => {
    const { html, images, skippedImages } = await docxToHtml(await wordLikeDocx());
    ok(html.includes('<h2>Заголовок раздела</h2>') && html.includes('<h3>Подраздел</h3>'), 'заголовок 1 → h2, 2 → h3: ' + html.slice(0, 120));
    ok(html.includes('<strong>жирный</strong>') && html.includes('<em>курсив</em>') && !html.includes('<strong>выкл'), 'жирный, курсив; b val=0 — не жирный');
    ok(html.includes('<a href="https://example.com/a">ссылка</a>') && html.includes('<sup>2</sup>'), 'ссылка и верхний индекс');
    ok(html.includes('<ul><li>один<ul><li>вложенный</li></ul></li><li>два</li></ul>'), 'маркированный список с вложенным: ' + html);
    ok(html.includes('<ol><li>первый</li><li>второй</li></ol>'), 'нумерованный список');
    ok(html.includes('<blockquote><p>Мудрая мысль</p></blockquote>'), 'цитата');
    ok(html.includes('<p>[[texted-word-image-1]]</p>') && images.length === 1 && images[0].type === 'image/png' && skippedImages === 0, 'картинка — файлом, в HTML метка, data: нет');
    ok(!html.includes('data:'), 'в HTML нет data:');
    ok(html.includes('<table><thead><tr><th>Имя</th><th>Цена</th></tr></thead><tr><td>Коврик</td><td>990</td></tr></table>'), 'таблица: ' + html.slice(-200));
  });

  test('в редакторе: блоки texted (заголовки, списки, цитата, таблица); без загрузки картинка не встаёт, метки не остаётся; «Отменить» — прежняя статья', async () => {
    const ed = make('<p>старая</p>', {}, { width: 1000 });
    ed.toast = () => {};
    eq(replaceWithWord(ed, await wordToHtml('статья.docx', await wordLikeDocx())), 1, 'картинка не загружена — одна');
    const out = ed.getInnerHTML();
    ok(/<h2[^>]*>Заголовок раздела<\/h2>/.test(out) && /<ul>/.test(out) && /<ol>/.test(out), out.slice(0, 200));
    ok(/ted-table/.test(out) && /<blockquote/.test(out) && !out.includes('texted-word-image'), 'таблица, цитата, без метки: ' + out.slice(-400));
    ed.history.undo();
    eq(ed.getInnerHTML(), '<p>старая</p>');
    ed.destroy();
  });

  test('картинки из Word с загрузкой на сервер: блок «Изображение» на месте картинки, файл уходит на сервер, в статье — адрес файла', async () => {
    const sent = [];
    const ed = make('<p>x</p>', { upload: async (file) => { sent.push(file); return { url: '/uf/images/word-1.webp' }; } }, { width: 1000 });
    ed.toast = () => {};
    eq(replaceWithWord(ed, await wordToHtml('a.docx', await wordLikeDocx())), 0, 'все картинки встали');
    for (let i = 0; i < 40 && !ed.getInnerHTML().includes('/uf/images/word-1.webp'); i++) await wait(25);
    eq(sent.length, 1, 'один файл');
    ok(sent[0] instanceof File && sent[0].type === 'image/png', 'PNG из документа');
    const out = ed.getInnerHTML();
    ok(/<blockquote>[\s\S]*<\/blockquote>\s*<figure class="ted-media ted-media--image"><img src="\/uf\/images\/word-1\.webp"/.test(out), 'изображение на месте картинки (после цитаты): ' + out.slice(-400));
    ed.destroy();
  });

  test('не Word и старый .doc — понятное сообщение', async () => {
    eq((await wordToHtml('a.docx', new TextEncoder().encode('просто текст').buffer)).error, 'Файл не похож на документ Word (.docx)');
    eq((await wordToHtml('a.doc', new ArrayBuffer(10))).error, 'Старый формат .doc не поддерживается — сохраните файл в Word как .docx');
  });

  test('настоящий файл из Word (русский Word: стили «1», «2», «a7», сжатие deflate, тема, шрифты)', async () => {
    const buf = await (await fetch(new URL('./word-ru.docx', import.meta.url), { cache: 'no-store' })).arrayBuffer();
    const { html, images, skippedImages } = await docxToHtml(buf);
    eq(html, '<h2>Отчёт из Word</h2>\n<p>Обычный абзац, <strong>жирный</strong> и <em>курсив</em>. <a href="https://example.org/">Ссылка</a></p>\n<h3>Подраздел</h3>\n'
      + '<ul><li>Пункт один</li><li>Вложенный</li><li>Пункт два</li></ul><ol><li>Первый</li><li>Второй</li></ol>\n<p>[[texted-word-image-1]]</p>\n'
      + '<table><thead><tr><th>Имя</th><th>Цена</th></tr></thead><tr><td>Коврик</td><td>990</td></tr></table>');
    eq(images.length, 1);
    eq(images[0].type, 'image/png');
    eq(skippedImages, 0);
  });

  test('выгрузка: правильный .docx (стили «Заголовок 1/2», списки, таблица, ссылка, код, картинка), и он же загружается обратно', async () => {
    const src = '<h2>Раздел</h2><p>Текст <strong>жирный</strong>, <em>курсив</em>, <a href="https://example.com/">ссылка</a>, <code>код</code>.</p>'
      + '<ul><li>один<ul><li>вложенный</li></ul></li><li>два</li></ul><ol><li>первый</li><li>второй</li></ol>'
      + '<h3>Подраздел</h3><blockquote><p>Цитата</p></blockquote><pre data-lang="js"><code>const a = 1;\nconst b = 2;</code></pre><hr>'
      + '<figure class="ted-table"><table><thead><tr><th>Имя</th><th>Цена</th></tr></thead><tbody><tr><td>Коврик</td><td>990</td></tr></tbody></table></figure>'
      + `<figure class="ted-media ted-media--image"><img src="data:image/png;base64,${btoa(String.fromCharCode(...PNG))}" alt="Точка"><figcaption>Подпись</figcaption></figure>`;
    const { blob, missedImages } = await htmlToDocx(src, { title: 'Статья' });
    eq(blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    eq(missedImages, 0);
    const files = unzip(await blob.arrayBuffer());
    for (const f of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', 'word/media/image1.png']) ok(files.has(f), f);
    const xml = new TextDecoder().decode(await files.get('word/document.xml')());
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    ok(!parsed.querySelector('parsererror'), 'XML документа правильный');
    for (const name of ['word/styles.xml', 'word/numbering.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml']) {
      ok(!new DOMParser().parseFromString(new TextDecoder().decode(await files.get(name)()), 'application/xml').querySelector('parsererror'), name + ' — правильный XML');
    }
    ok(xml.includes('w:val="Heading1"') && xml.includes('w:val="Heading2"') && xml.includes('w:val="Code"') && xml.includes('<w:tbl>') && xml.includes('<w:drawing>'), 'стили, таблица, картинка');
    const back = await docxToHtml(await blob.arrayBuffer());
    ok(back.html.includes('<h2>Раздел</h2>') && back.html.includes('<h3>Подраздел</h3>'), back.html.slice(0, 100));
    ok(back.html.includes('<strong>жирный</strong>') && back.html.includes('<a href="https://example.com/">ссылка</a>'), 'оформление и ссылка обратно');
    ok(back.html.includes('<ul><li>один<ul><li>вложенный</li></ul></li><li>два</li></ul>') && back.html.includes('<ol><li>первый</li><li>второй</li></ol>'), 'списки обратно: ' + back.html);
    ok(back.html.includes('<th>Имя</th>') && back.html.includes('<td>990</td>') && back.images.length === 1, 'таблица и картинка обратно: ' + back.html.slice(-300));
  });

  test('«Ещё»: «Загрузить из Word» и «Выгрузить в Word» рядом с Markdown и JSON', () => {
    const ed = make('<p>x</p>', {}, { width: 1000 });
    ed.toolbar.openMoreMenu();
    const values = [...ed.popover.el.querySelectorAll('.ted-ui-item')].map((i) => i.dataset.value);
    eq(values.filter((v) => /^(import|out-)/.test(v)).join(','), 'import,import-word,out-md,out-json,out-word');
    ed.popover.close();
    ed.destroy();
  });
});
