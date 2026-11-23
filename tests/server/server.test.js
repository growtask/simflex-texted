// Этап 1 (MODULAR_PLAN.md): настройки сервера в редакторе — Ted.init({ server: TedConfig::clientJson() }).
// Сервер (ted.config.php, PHP) проверяет php/test-config.php; здесь — что браузер берёт из настроек и чего не делает.
import { group, test, eq, ok, wait } from '../harness.js';
import { make } from '../helpers.js';
import { serverOptions, formatLimit } from '../../src/core/server.js';
import { iframeSrcOk } from '../../blocks/iframe/iframe.js';
import { mediaUrlsOf } from '../../blocks/media/media.js';
import { insertBlock } from '../interaction/samples.js';

group('Настройки сервера: что получает браузер', () => {
  test('без настроек — как до этапа 1: папка /uf, лимитов нет, карточки включены, iFrame — любой https', () => {
    eq(JSON.stringify(serverOptions(undefined)), JSON.stringify({ filesUrl: '/uf', limits: {}, opengraph: true, iframeHosts: null, preset: null, presets: {}, canEdit: true }));
  });

  test('неверные значения не ломают редактор: заменяются значениями по умолчанию', () => {
    const s = serverOptions({ filesUrl: 'javascript:alert(1)', limits: { image: -1, video: 'много', photo: 5 }, opengraph: 'нет', iframeHosts: ['https://evil/', 'WWW.YouTube.com', 5] });
    eq(s.filesUrl, '/uf', 'адрес папки — только /… или https://…');
    eq(JSON.stringify(s.limits), '{}', 'лимиты — только положительные числа известных видов');
    eq(s.opengraph, true, 'карточки выключает только false');
    eq(JSON.stringify(s.iframeHosts), '["www.youtube.com"]', 'сайты iFrame — только адреса сайтов, в нижнем регистре');
    eq(serverOptions({ filesUrl: '//evil.example/uf' }).filesUrl, '/uf', '//чужой сайт');
    eq(serverOptions({ filesUrl: 'https://cdn.example.com/uf/' }).filesUrl, 'https://cdn.example.com/uf', 'CDN, косая черта в конце убирается');
  });

  test('редактор берёт настройки из Ted.init({ server }); в редакторе нет путей на диске', () => {
    const ed = make('<p>Текст</p>', { server: { filesUrl: '/media/files', limits: { image: 1048576 }, opengraph: true, iframeHosts: null, dir: 'C:\\secret' } });
    eq(ed.server.filesUrl, '/media/files');
    eq(ed.server.limits.image, 1048576);
    ok(!('dir' in ed.server), 'лишние ключи отброшены');
    ed.destroy();
  });

  test('карточки по ссылке выключены на сервере — редактор не предлагает карточку, даже если opengraph подключён', () => {
    const og = async () => ({ url: 'https://a.example', title: 'A' });
    const on = make('<p>x</p>', { opengraph: og });
    eq(typeof on.options.opengraph, 'function', 'по умолчанию — как подключила CMS');
    on.destroy();
    const off = make('<p>x</p>', { opengraph: og, server: { opengraph: false } });
    eq(off.options.opengraph, null, 'выключено в ted.config.php');
    off.destroy();
  });
});

group('Настройки сервера: папка файлов', () => {
  test('свои файлы — по адресу папки из настроек (по умолчанию /uf): чужие адреса и адреса другой папки не считаются своими', () => {
    const html = '<figure class="ted-media ted-media--image"><img src="/media/files/images/a.webp"></figure>'
      + '<figure class="ted-media ted-media--image"><img src="/uf/images/b.webp"></figure>'
      + '<figure class="ted-media ted-media--file"><a href="https://cdn.example.com/uf/files/c.pdf">c</a></figure>';
    eq([...mediaUrlsOf(html)].join(' '), '/uf/images/b.webp', 'по умолчанию /uf');
    eq([...mediaUrlsOf(html, '/media/files')].join(' '), '/media/files/images/a.webp', 'папка /media/files');
    eq([...mediaUrlsOf(html, 'https://cdn.example.com/uf')].join(' '), 'https://cdn.example.com/uf/files/c.pdf', 'папка на CDN');
    eq([...mediaUrlsOf('<figure class="ted-media ted-media--image"><img src="/media/filesX/a.webp"></figure>', '/media/files')].length, 0, 'похожий адрес — не наш');
  });

  test('после сохранения на удаление уходят только свои файлы, которых больше нет в статье', async () => {
    const removed = [];
    const upload = async () => ({ url: '/x' });
    upload.remove = async (urls) => { removed.push(...urls); return { removed: urls.length }; };
    const own = '<figure class="ted-media ted-media--image"><img src="/media/files/images/company/a.webp" alt=""></figure>';
    const old = '<figure class="ted-media ted-media--image"><img src="/uf/images/company/b.webp" alt=""></figure>';
    const ed = make(own + old + '<p>Текст</p>', { upload, server: { filesUrl: '/media/files' } });
    const before = ed.getInnerHTML();
    for (const f of [...ed.editable.querySelectorAll('.ted-ui-media')]) f.remove();
    ed.afterChange({ immediate: true });
    ed.cleanupMedia(before, ed.getInnerHTML());
    await wait(10);
    eq(removed.join(' '), '/media/files/images/company/a.webp', 'только файл своей папки');
    ed.destroy();
  });

  test('файл больше лимита из настроек не отправляется на сервер: понятное сообщение', async () => {
    let sent = 0;
    const upload = async () => { sent++; return { url: '/uf/images/a.webp', name: 'a.webp' }; };
    upload.remove = async () => ({ removed: 0 });
    const ed = make('<p>Текст</p>', { upload, server: { limits: { image: 1024 } } });
    const block = ed.media.create('image', ed.editable.firstElementChild);
    const job = { file: new File([new Uint8Array(4096)], 'big.png', { type: 'image/png' }) };
    await ed.media.send(block, 'image', job);
    eq(sent, 0, 'на сервер не отправлен');
    eq(job.status, 'error');
    eq(job.error, `Файл больше ${formatLimit(1024)} — так настроено на сайте`);
    const small = { file: new File([new Uint8Array(512)], 'small.png', { type: 'image/png' }) };
    await ed.media.send(block, 'image', small);
    eq(sent, 1, 'файл в пределах лимита — отправлен');
    ed.destroy();
  });
});

group('Настройки сервера: сайты для блока «iFrame»', () => {
  test('null — любой https; список — только эти сайты; http, логин, порт — нельзя всегда', () => {
    ok(iframeSrcOk('https://maps.example.org/embed'), 'по умолчанию любой https');
    ok(iframeSrcOk('https://www.youtube.com/embed/x', ['www.youtube.com']), 'сайт из списка');
    ok(!iframeSrcOk('https://maps.example.org/embed', ['www.youtube.com']), 'сайт не из списка');
    ok(!iframeSrcOk('https://youtube.com.evil.example/embed', ['youtube.com']), 'похожий адрес');
    ok(!iframeSrcOk('http://www.youtube.com/embed/x', ['www.youtube.com']), 'http');
    ok(!iframeSrcOk('https://user@www.youtube.com/embed/x', ['www.youtube.com']), 'логин в адресе');
  });

  test('окно «iFrame»: сайт не из настроек — блок не встаёт, сообщение со списком разрешённых', async () => {
    const ed = make('<p>Текст</p>', { server: { iframeHosts: ['www.youtube.com'] } });
    const toasts = [];
    const toast = ed.toast.bind(ed);
    ed.toast = (text, o) => { toasts.push(text); return toast(text, o); };
    const fig = insertBlock(ed, 'iframe');
    await wait(10);
    const input = fig && fig.querySelector('.ted-ui-media__url');
    ok(input, 'пустой блок «iFrame» с полем адреса');
    const enter = (value) => { input.value = value; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); };
    enter('https://maps.example.org/embed');
    ok(fig.hasAttribute('data-tedui-empty') && !fig.querySelector('iframe'), 'сайт не из списка — блок остался пустым');
    ok(toasts.some((t) => /разрешены www.youtube.com/.test(t)), 'сообщение: ' + toasts.join(' | '));
    enter('https://www.youtube.com/embed/x');
    await wait(10);
    ok(ed.editable.querySelector('figure.ted-iframe iframe[src="https://www.youtube.com/embed/x"]'), 'сайт из списка — фрейм встал');
    ed.destroy();
  });
});
