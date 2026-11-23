import { group, test, eq, ok, wait } from './harness.js';
import { make } from './helpers.js';

// content.js — публичный скрипт сайта (плеер аудио и запуск видео по клику). Собирается из тех же модулей, что и редактор.
// число столбиков волны зависит от ширины, поэтому в сравнении их нет
const signature = (root) => [root, ...root.querySelectorAll('*:not(.ted-audio__wave > i)')].map((n) => `${n.localName}.${n.getAttribute('class') || ''}`).join('|');
const audioFigure = '<figure class="ted-media ted-media--audio"><audio src="/uf/audio/a.mp3" title="Выпуск 2" controls></audio><figcaption>Описание</figcaption></figure>';

group('Сайт: content.js', () => {
  test('TedContent подключён и собирает плеер из макета Media/audio, старого плеера с кнопкой «Воспроизвести» нет', async () => {
    ok(globalThis.TedContent?.mount, 'content.js загружен');
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '700px';
    box.innerHTML = audioFigure;
    document.body.appendChild(box);
    try {
      TedContent.mount(box);
      await wait(60);
      const player = box.querySelector('figure[data-ted-player] > .ted-audio');
      ok(player, 'плеер Media/audio');
      ok(!box.querySelector('.ted-audio-player, input[type="range"]') && !/Воспроизвести$/.test(player.textContent), 'старого плеера нет');
      eq(player.querySelector('.ted-audio__name').textContent, 'Выпуск 2');
      const cs = getComputedStyle(player);
      eq([cs.borderRadius, cs.backgroundColor, Math.round(player.getBoundingClientRect().height)].join(' '), '16px rgb(237, 243, 250) 132');
      const play = getComputedStyle(player.querySelector('.ted-audio__play'));
      eq([play.width, play.height, play.backgroundColor, play.color].join(' '), '48px 48px rgb(13, 13, 13) rgb(255, 255, 255)');
      ok(player.querySelectorAll('.ted-audio__wave > i').length > 20, 'волна');
      eq(getComputedStyle(box.querySelector('audio')).display, 'none');
      const cap = getComputedStyle(box.querySelector('figcaption'));
      eq([cap.fontSize, cap.lineHeight, cap.color, cap.marginTop].join(' '), '13px 19.5px rgb(145, 149, 153) 12px', 'подпись t3');
      TedContent.mount(box);
      eq(box.querySelectorAll('.ted-audio').length, 1, 'повторный mount не дублирует');
    } finally { box.remove(); }
  });

  test('плеер на сайте и в редакторе одинаковый по разметке', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = audioFigure;
    document.body.appendChild(box);
    const ed = make(audioFigure, { mediaSource: 'manager', pickFile: () => [] });
    try {
      TedContent.mount(box);
      await wait(60);
      eq(signature(box.querySelector('.ted-audio')), signature(ed.editable.querySelector('.ted-audio')));
    } finally { box.remove(); ed.destroy(); }
  });

  test('на сайте 768 и уже плеер 40 и карточка 120', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '480px';
    box.innerHTML = audioFigure;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:480px;height:400px;border:0';
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument;
      doc.head.innerHTML = '<link rel="stylesheet" href="../dist/ted.css">';
      doc.body.appendChild(doc.adoptNode(box));
      await wait(200);
      const mount = globalThis.TedContent.mount;
      mount(box);
      await wait(100);
      const player = box.querySelector('.ted-audio');
      eq(Math.round(player.querySelector('.ted-audio__play').getBoundingClientRect().width), 40);
      eq(Math.round(player.getBoundingClientRect().height), 120);
    } finally { frame.remove(); }
  });

  test('видео с площадки встраивается сразу, с плеером площадки; чужой адрес остаётся ссылкой', () => {
    // отдельный документ без окна: iframe в нём не начинает загрузку, тест не ходит в сеть
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<figure class="ted-media ted-media--video"><a href="https://youtu.be/dQw4w9WgXcQ" data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Смотреть видео</a></figure>'
      + '<figure class="ted-media ted-media--video"><a href="https://evil.example/v" data-ted-video="https://evil.example/embed/x">Чужое</a></figure>';
    TedContent.mount(doc.body);
    const frames = doc.body.querySelectorAll('iframe');
    eq(frames.length, 1, 'встроено одно видео');
    ok(frames[0].getAttribute('src').startsWith('https://www.youtube-nocookie.com/embed/') && frames[0].loading === 'lazy', 'плеер площадки, ленивая загрузка');
    ok(doc.body.querySelector('a[data-ted-video]')?.textContent === 'Чужое', 'чужой адрес остался ссылкой');
    TedContent.mount(doc.body);
    eq(doc.body.querySelectorAll('iframe').length, 1, 'повторный mount не дублирует');
    eq(doc.body.querySelectorAll('.ted-media__source').length, 1, 'кнопка под плеером одна и после повторного mount');
  });

  test('под плеером площадки кнопка secondary «Смотреть на …» со ссылкой на видео (если встраивание запрещено)', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<figure class="ted-media ted-media--video"><a href="https://youtu.be/dQw4w9WgXcQ" data-ted-video="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ">Смотреть видео</a><figcaption>Подпись</figcaption></figure>'
      + '<figure class="ted-media ted-media--video"><a href="https://rutube.ru/video/0123456789abcdef0123456789abcdef/" data-ted-video="https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef">Видео</a></figure>'
      + '<figure class="ted-media ted-media--video"><a href="https://vkvideo.ru/video-1_456239017" data-ted-video="https://vkvideo.ru/video_ext.php?oid=-1&amp;id=456239017">Видео</a></figure>';
    TedContent.mount(doc.body);
    const links = [...doc.body.querySelectorAll('.ted-media__source')];
    eq(links.map((a) => a.textContent).join(' | '), 'Смотреть на YouTube | Смотреть на RuTube | Смотреть в VK Видео');
    eq(links[0].getAttribute('href'), 'https://youtu.be/dQw4w9WgXcQ', 'ссылка на страницу видео, а не на плеер');
    eq([links[0].target, links[0].rel].join(' '), '_blank noopener noreferrer');
    eq([...links[0].parentNode.children].map((n) => n.tagName).join(','), 'IFRAME,A,FIGCAPTION', 'кнопка между плеером и подписью');
  });

  test('кнопка «Смотреть на …» по Buttons/main secondary s: 40, r12, поля 16, 14/600; светлая и тёмная', async () => {
    const box = document.createElement('div');
    box.innerHTML = '<div class="ted-content"><figure class="ted-media ted-media--video"><a class="ted-media__source" href="https://youtu.be/x">Смотреть на YouTube</a></figure></div>';
    document.body.appendChild(box);
    try {
      const a = box.querySelector('.ted-media__source');
      const cs = getComputedStyle(a);
      eq([cs.display, cs.height, cs.borderTopLeftRadius, cs.paddingLeft, cs.paddingRight, cs.fontSize, cs.fontWeight].join(' '), 'inline-flex 40px 12px 16px 16px 14px 600');
      ok(/^"?Ted Inter/.test(cs.fontFamily), 'начертание: Inter дизайн-системы (Ted Inter), а не системный шрифт: ' + cs.fontFamily);
      eq([cs.backgroundColor, cs.color].join(' '), 'rgb(237, 243, 250) rgb(38, 38, 38)');
      box.setAttribute('data-ted-theme', 'dark');
      a.style.transition = 'none';   // фон меняется плавно (0,15 с), в фоновой вкладке теста переход не идёт
      const dk = getComputedStyle(a);
      eq([dk.backgroundColor, dk.color].join(' '), 'rgb(77, 77, 77) rgb(255, 255, 255)');
    } finally { box.remove(); }
  });

  test('vw-режим: все размеры плеера и подписи считаются от --ted-u (при 0,5 px вдвое меньше)', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.setProperty('--ted-u', '0.5px');
    box.style.width = '350px';
    box.innerHTML = audioFigure.replace('<figcaption>Описание</figcaption>', '<figcaption>Описание</figcaption>');
    document.body.appendChild(box);
    try {
      TedContent.mount(box);
      await wait(100);
      const player = box.querySelector('.ted-audio');
      eq(Math.round(player.getBoundingClientRect().height), 66, 'карточка 132 × 0,5');
      eq(Math.round(player.querySelector('.ted-audio__play').getBoundingClientRect().width), 24, 'play 48 × 0,5');
      eq(parseFloat(getComputedStyle(player).borderTopLeftRadius), 8, 'радиус 16 × 0,5');
      const cap = getComputedStyle(box.querySelector('figcaption'));
      eq([cap.fontSize, cap.marginTop].join(' '), '6.5px 6px', 'подпись 13 и отступ 12 × 0,5');
      const bars = player.querySelectorAll('.ted-audio__wave > i');
      eq(Math.round(bars[0].getBoundingClientRect().width * 10) / 10, 2.5, 'столбик 5 × 0,5');
      ok(bars.length > 40, 'столбиков больше, чем при 1 px: волна заполняет ширину (' + bars.length + ')');
    } finally { box.remove(); }
  });
});

group('Название файла в две строки (раунд 22)', () => {
  const tile = (name) => '<figure class="ted-media ted-media--file"><a href="/uf/files/company/a.pdf" download>' + name + '</a></figure>';
  const LONG = 'RoadMap Школа барберинга Давида Амирханяна для всех желающих научиться стричь быстро и красиво.pdf';
  const check = (root) => {
    const [long, short] = root.querySelectorAll('a');
    const name = long.querySelector('.ted-media__name');
    ok(name, 'название обёрнуто для обрезки');
    eq(getComputedStyle(name).webkitLineClamp, '2');
    ok(name.getBoundingClientRect().height <= 2 * parseFloat(getComputedStyle(name).lineHeight) + 1, 'не выше двух строк: ' + name.getBoundingClientRect().height);
    ok(long.getBoundingClientRect().height <= 72 + 1, 'плитка не выше 72: ' + long.getBoundingClientRect().height);
    const sh = short.querySelector('.ted-media__name');
    const tb = sh.getBoundingClientRect(); const ab = short.getBoundingClientRect();
    ok(Math.abs((tb.top + tb.height / 2) - (ab.top + ab.height / 2)) < 2, 'в одну строку — по центру плитки');
    eq(Math.round(ab.height), 72, 'короткая плитка 72, как в макете');
  };
  test('сайт (content.js): длинное название — две строки с многоточием, короткое — по центру', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.width = '340px';
    box.innerHTML = tile(LONG) + tile('Прайс.pdf');
    document.body.appendChild(box);
    try { TedContent.mount(box); check(box); eq(Ted.clean(box.innerHTML).includes('ted-media__name'), false, 'в сохранённом HTML обёртки нет'); } finally { box.remove(); }
  });
  test('редактор: то же самое в блоке файлов, обёртки нет в HTML', () => {
    const ed = make(tile(LONG) + tile('Прайс.pdf'), { mediaSource: 'manager', pickFile: () => [] }, { width: 380 });
    try { check(ed.editable); ok(!ed.getInnerHTML().includes('ted-media__name'), ed.getInnerHTML()); } finally { ed.destroy(); }
  });
});

group('Сайт: копирование кода (раунд 22)', () => {
  const CODE = 'echo "Initial: ".memory_get_usage()." bytes";\n/* All script */';
  test('на сайте у блока кода есть кнопка «Копировать код»: клик кладёт код в буфер и показывает галочку', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = '<pre data-lang="bash"><code></code></pre>';
    box.querySelector('code').textContent = CODE;
    document.body.appendChild(box);
    const real = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let copied = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (text) => { copied = text; return Promise.resolve(); } } });
    try {
      TedContent.mount(box);
      TedContent.mount(box);
      const buttons = box.querySelectorAll('.ted-code-copy');
      eq(buttons.length, 1, 'одна кнопка, повторный mount не дублирует');
      const cs = getComputedStyle(buttons[0]);
      eq([cs.position, cs.width, cs.height].join(' '), 'absolute 24px 24px');
      buttons[0].click();
      await wait(20);
      eq(copied, CODE, 'в буфер попал именно код');
      ok(buttons[0].classList.contains('is-copied') && buttons[0].getAttribute('aria-label') === 'Код скопирован');
      eq(box.querySelector('code').textContent, CODE, 'сам код не изменился');
    } finally {
      if (real) Object.defineProperty(navigator, 'clipboard', real); else delete navigator.clipboard;
      box.remove();
    }
  });

  test('без доступа к буферу (http, старый браузер) работает запасной способ; при неудаче кнопка говорит об ошибке', async () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.innerHTML = '<pre data-lang="js"><code>let a = 1;</code></pre>';
    document.body.appendChild(box);
    const real = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('нет доступа')) } });
    const exec = document.execCommand;
    let selected = null;
    document.execCommand = (name) => { selected = document.querySelector('textarea[readonly]')?.value; return name === 'copy'; };
    try {
      TedContent.mount(box);
      box.querySelector('.ted-code-copy').click();
      await wait(20);
      eq(selected, 'let a = 1;', 'запасной способ скопировал код');
      ok(box.querySelector('.ted-code-copy').classList.contains('is-copied'));
      document.execCommand = () => false;
      box.querySelector('.ted-code-copy').click();
      await wait(20);
      ok(box.querySelector('.ted-code-copy').classList.contains('is-failed'), 'при неудаче — состояние ошибки');
    } finally {
      document.execCommand = exec;
      if (real) Object.defineProperty(navigator, 'clipboard', real); else delete navigator.clipboard;
      box.remove();
    }
  });
});

group('Цвета только из дизайн-системы «Симфлекс АИ» (16.11.2026)', () => {
  // Стили цвета библиотеки (main/*, text-icon/*, states/*). Палитра подсветки синтаксиса кода — отдельная, в Figma её нет.
  const DS = ['4D4D4D', '919599', 'DADFE5', '0D0D0D', 'FFFFFF', '262626', 'EDF3FA', '1975F7', '1461CC', '63A1F7', '104FA6', 'D2E2F7', '6161F2', '4D4DBF', '9191F2', '38388C', 'E5E5FF', '0E8C0E', 'C3E5C3', '98D998', 'CC2929', 'FFCCCC', 'FFA6A6', '737300', 'F2F2AA', 'D9D998', 'FFF', '000'];
  const SYNTAX = ['0550AE', '0A3069', '116329', '6E7781', '8250DF', '953800', 'CF222E', '79C0FF', '7EE787', '8B949E', 'A5D6FF', 'D2A8FF', 'FF7B72', 'FFA657'];
  test('в dist/ted.css нет цветов вне стилей дизайн-системы (кроме подсветки кода)', async () => {
    const css = await (await fetch('../dist/ted.css', { cache: 'no-store' })).text();
    const found = [...new Set((css.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || []).map((h) => h.slice(1).toUpperCase()))];
    const extra = found.filter((h) => !DS.includes(h) && !SYNTAX.includes(h));
    eq(extra.join(', '), '', 'цвета вне дизайн-системы');
  });
});

group('Загрузка страницы: заготовка редактора до запуска (16.11.2026)', () => {
  test('textarea.ted-editor до запуска выглядит как пустой редактор: высота 320, текст скрыт, полоса панели; в тёмной теме тёмная', () => {
    const t = document.createElement('textarea');
    t.className = 'ted-editor';
    t.value = '<p>секрет</p>';
    document.body.appendChild(t);
    try {
      const cs = getComputedStyle(t);
      eq([Math.round(t.getBoundingClientRect().height), cs.color, cs.borderTopWidth, cs.resize].join(' '), '320 rgba(0, 0, 0, 0) 0px none');
      ok(/rgb\(255, 255, 255\).*rgb\(237, 243, 250\)/.test(cs.backgroundImage), 'светлая: панель белая, линия main/gray/lighter');
      t.dataset.tedTheme = 'dark';
      ok(/rgb\(38, 38, 38\).*rgb\(77, 77, 77\).*rgb\(13, 13, 13\)/.test(getComputedStyle(t).backgroundImage), 'тёмная: панель gray/darker, линия gray/dark, поле gray/black');
    } finally { t.remove(); }
  });

  test('после запуска заготовки нет: textarea скрыта, на её месте редактор', () => {
    const t = document.createElement('textarea');
    t.className = 'ted-editor';
    t.id = 'ted-skeleton-test';
    document.body.appendChild(t);
    const [ed] = Ted.init({ selector: '#ted-skeleton-test' });
    try {
      eq(getComputedStyle(t).display, 'none');
      ok(t.nextElementSibling?.classList.contains('ted-ui'));
    } finally { ed.destroy(); t.remove(); }
  });
});

group('Сверка с Figma, этапы 1–4 (16.11.2026)', () => {
  test('меню всех блоков: поля как в editor-block-picker (desktop 20 / 24)', async () => {
    const t = document.createElement('textarea'); t.id = 'ted-picker-test'; t.style.width = '760px';
    const wrap = document.createElement('div'); wrap.style.width = '760px'; wrap.appendChild(t); document.body.appendChild(wrap);
    const [ed] = Ted.init({ selector: '#ted-picker-test' });
    try {
      ed.blockMenu.openPicker(ed.lastBlock());
      await wait(50);
      const p = getComputedStyle(document.querySelector('.ted-ui-picker'));
      eq([p.paddingTop, p.paddingRight, p.paddingBottom, p.paddingLeft].join(' '), '20px 24px 20px 24px');
    } finally { ed.destroy(); wrap.remove(); }
  });

  test('поле в окнах редактора — Inputs/main outline xs, высота 32 (как кнопки xs)', () => {
    const ui = document.createElement('div'); ui.className = 'ted-ui'; ui.style.cssText = 'display:block;min-height:0';
    ui.innerHTML = '<input class="ted-ui-input" value="glava-1"><button class="ted-ui-action ted-ui-action--primary">Сохранить</button>';
    document.body.appendChild(ui);
    try {
      eq(Math.round(ui.querySelector('input').getBoundingClientRect().height), 32);
      eq(Math.round(ui.querySelector('button').getBoundingClientRect().height), 32);
    } finally { ui.remove(); }
  });
});

group('Аудио: перемотка по волне (16.11.2026)', () => {
  test('клик по волне переводит на нужную секунду, протягивание и стрелки тоже; сыгранная часть подсвечивается', () => {
    const box = document.createElement('div');
    box.className = 'ted-content';
    box.style.cssText = 'width:700px;--ted-u:1px';
    box.innerHTML = '<figure class="ted-media ted-media--audio"><audio title="Тест" controls></audio></figure>';
    document.body.appendChild(box);
    const audio = box.querySelector('audio');
    let t = 0;
    Object.defineProperty(audio, 'duration', { configurable: true, get: () => 200 });
    Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => t, set: (v) => { t = v; } });
    try {
      TedContent.mount(box);
      const wave = box.querySelector('.ted-audio__wave');
      const r = wave.getBoundingClientRect();
      const ev = (type, f) => wave.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + r.width * f, clientY: r.top + r.height / 2, pointerId: 1 }));
      ev('pointerdown', 0.5);
      eq(Math.round(t), 100, 'клик посередине — середина записи');
      ev('pointermove', 0.25); ev('pointerup', 0.25);
      eq(Math.round(t), 50, 'протягивание — четверть');
      wave.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      eq(Math.round(t), 55, 'стрелка вправо — +5 с');
      eq(wave.getAttribute('role'), 'slider');
      eq(getComputedStyle(wave).cursor, 'pointer');
    } finally { box.remove(); }
  });
});
