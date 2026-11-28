/*! Ted content 1.0.4 — блочный редактор SimflexCMS, лицензия MIT. Собрано 2026-11-28 14:11 */
(function () {
'use strict';

// ---- blocks/media/file-names.js ----
// Название файла в плитке: не длиннее двух строк, дальше многоточие. Для обрезки текст ссылки оборачивается в <span class="ted-media__name">
// (одно CSS-правило на самой ссылке обрезало бы текст только при авто-высоте и ломало бы центровку). В сохранённом HTML обёртки нет:
// её ставит редактор в блоке и content.js на сайте.
function wrapFileNames(root) {
  for (const link of root.querySelectorAll('.ted-media--file > a')) {
    if (link.querySelector(':scope > .ted-media__name')) continue;
    const texts = [...link.childNodes].filter((node) => node.nodeType === 3);
    if (!texts.length) continue;
    const name = link.ownerDocument.createElement('span');
    name.className = 'ted-media__name';
    texts[0].before(name);
    name.append(...texts);
  }
}

// ---- blocks/media/video-link.js ----
// Кнопка «Смотреть на YouTube» (Buttons/main secondary s) под плеером площадки: если автор запретил встраивание,
// читатель всё равно может открыть видео на самой площадке. Ставят content.js на сайте и редактор под превью; в сохранённом HTML её нет.
function videoSourceLabel(href) {
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; }
  if (/^(m\.)?youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) return 'Смотреть на YouTube';
  if (host === 'rutube.ru') return 'Смотреть на RuTube';
  if (host === 'vkvideo.ru' || host === 'vk.com') return 'Смотреть в VK Видео';
  return '';
}

function videoSourceButton(doc, href) {
  const label = videoSourceLabel(href);
  if (!label) return null;
  const link = doc.createElement('a');
  link.className = 'ted-media__source';
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

// ---- blocks/media/audio-player.js ----
// Аудиоплеер по макету Media/audio (библиотека «Симфлекс АИ»): кнопка play, волна, время, линия и название.
// Файл в HTML остаётся обычным <audio controls>; плеер строится поверх него и управляет им.
// В редакторе плеер стоит в панели блока, на сайте его собирает Ted.enhance().

const AP_PLAY = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.54.84l10-6.5a1 1 0 0 0 0-1.68l-10-6.5A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>';
const AP_PAUSE = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
const AP_BASE = 160;          // сколько значений громкости хранится; столбиков на экране столько, сколько помещается
const AP_BAR = 5;             // ширина столбика в макете
const AP_GAP = 2;             // промежуток между столбиками

const apTime = (s) => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** Условная волна, если настоящую прочитать нельзя (чужой сервер, большой файл): одна и та же для одного адреса. */
function apPseudoPeaks(seed) {
  let x = 2166136261;
  for (const ch of String(seed)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  const rand = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const out = [];
  let level = 0.5;
  for (let i = 0; i < AP_BASE; i++) {
    level = Math.max(0.08, Math.min(1, level + (rand() - 0.5) * 0.7));
    out.push(level);
  }
  return out;
}

/** Настоящая волна из файла (только свой сервер и файл до 12 МБ), иначе null. */
const AP_CACHE = new Map();   // волна одного файла считается один раз, а не при каждой перерисовке блока
async function apReadPeaks(src) {
  if (AP_CACHE.has(src)) return AP_CACHE.get(src);
  const value = await apDecode(src);
  AP_CACHE.set(src, value);
  return value;
}

async function apDecode(src) {
  try {
    const url = new URL(src, location.href);
    if (url.origin !== location.origin) return null;
    const response = await fetch(url);
    if (!response.ok || Number(response.headers.get('content-length') || 0) > 12e6) return null;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
    ctx.close();
    const data = decoded.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / AP_BASE));
    // громкость участка — среднеквадратичное, а не максимум: у плотной музыки максимум везде одинаков и волна получается сплошной
    const loud = [];
    for (let i = 0; i < AP_BASE; i++) {
      let sum = 0;
      let n = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 8) { sum += data[j] * data[j]; n++; }
      loud.push(Math.sqrt(sum / Math.max(1, n)));
    }
    const sorted = [...loud].sort((x, y) => x - y);
    const top = sorted[Math.floor(sorted.length * 0.95)] || 1;
    return loud.map((p) => Math.max(0.08, Math.min(1, p / top) ** 1.6));
  } catch { return null; }
}

/**
 * Плеер для готового элемента <audio>. name — название под волной (по макету «Название»).
 * Возвращает элемент плеера; обработчики снимаются, когда элемент уходит из документа.
 */
function buildAudioPlayer(audio, { name = '', placeholder = '', onName = null } = {}) {
  const doc = audio.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'ted-audio';
  const play = doc.createElement('button');
  play.type = 'button';
  play.className = 'ted-audio__play';
  play.setAttribute('aria-label', 'Воспроизвести');
  play.innerHTML = AP_PLAY;
  const wave = doc.createElement('div');
  wave.className = 'ted-audio__wave';
  wave.setAttribute('role', 'slider');
  wave.setAttribute('aria-label', 'Положение в записи');
  wave.tabIndex = 0;
  const now = doc.createElement('span');
  now.textContent = '0:00';
  const total = doc.createElement('span');
  total.textContent = '0:00';
  const clock = doc.createElement('div');
  clock.className = 'ted-audio__time';
  clock.append(now, total);
  const track = doc.createElement('div');
  track.className = 'ted-audio__track';
  track.append(wave, clock);
  const controls = doc.createElement('div');
  controls.className = 'ted-audio__controls';
  controls.append(play, track);
  const line = doc.createElement('div');
  line.className = 'ted-audio__line';
  const title = doc.createElement('div');
  title.className = 'ted-audio__name';
  // в редакторе без названия стоит заготовка «Название» (по макету строка есть всегда), на сайте пустая строка скрыта
  title.textContent = name || placeholder;
  title.classList.toggle('is-empty', !name && !!placeholder);
  title.hidden = !name && !placeholder;
  line.hidden = title.hidden;
  if (onName) { title.addEventListener('click', onName); title.style.cursor = 'text'; }
  const body = doc.createElement('div');
  body.className = 'ted-audio__body';
  body.append(controls, line, title);
  el.append(body);

  let peaks = apPseudoPeaks(audio.getAttribute('src') || '');
  let bars = [];
  let layoutHeight = 0;
  let layoutWidth = 0;
  const paint = () => {
    const fraction = audio.duration ? audio.currentTime / audio.duration : 0;
    const played = Math.round(fraction * bars.length);
    bars.forEach((bar, i) => bar.classList.toggle('is-played', i < played));
    now.textContent = apTime(audio.currentTime);
    total.textContent = apTime(audio.duration);
    wave.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  };
  const layout = () => {
    if (wave.clientWidth === layoutWidth && wave.clientHeight === layoutHeight && bars.length) return;
    layoutWidth = wave.clientWidth;
    layoutHeight = wave.clientHeight;
    // ширина столбика и промежуток зависят от размера страницы (vw-режим), поэтому измеряем их, а не считаем в px
    const probe = doc.createElement('i');
    wave.replaceChildren(probe);
    const barWidth = probe.getBoundingClientRect().width || AP_BAR;
    const gap = parseFloat(getComputedStyle(wave).columnGap) || AP_GAP;
    const count = Math.max(12, Math.floor((wave.clientWidth + gap) / (barWidth + gap)));
    wave.replaceChildren();
    bars = Array.from({ length: count }, (_, i) => {
      const bar = doc.createElement('i');
      const value = peaks[Math.min(AP_BASE - 1, Math.floor((i / count) * AP_BASE))];
      bar.style.height = `${4 + Math.round((value * (Math.max(wave.clientHeight, 16) - 4)) / 4) * 4}px`;
      wave.appendChild(bar);
      return bar;
    });
    paint();
  };

  const toggle = () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
  const sync = () => {
    const paused = audio.paused;
    play.innerHTML = paused ? AP_PLAY : AP_PAUSE;
    play.setAttribute('aria-label', paused ? 'Воспроизвести' : 'Пауза');
    el.classList.toggle('is-playing', !paused);
  };
  const seek = (event) => {
    if (!audio.duration) return;
    const box = wave.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * audio.duration;
    paint();
  };
  play.addEventListener('click', toggle);
  wave.addEventListener('pointerdown', (event) => {
    seek(event);
    wave.setPointerCapture?.(event.pointerId);
    const move = (e) => seek(e);
    const up = () => { wave.removeEventListener('pointermove', move); wave.removeEventListener('pointerup', up); };
    wave.addEventListener('pointermove', move);
    wave.addEventListener('pointerup', up);
  });
  wave.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, Home: -Infinity, End: Infinity }[event.key];
    if (step === undefined || !audio.duration) return;
    event.preventDefault();
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + step));
    paint();
  });
  const listeners = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked', 'ended'];
  for (const name of listeners) audio.addEventListener(name, paint);
  for (const name of ['play', 'pause', 'ended']) audio.addEventListener(name, sync);
  // блок удалили (или заменили содержимое), а звук продолжает играть из памяти — останавливаем
  const stray = () => { if (!audio.isConnected && !audio.paused) audio.pause(); };
  audio.addEventListener('timeupdate', stray);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layout);
  observer?.observe(wave);
  Promise.resolve().then(layout);   // уже после вставки в документ; без requestAnimationFrame, он не срабатывает в фоновых вкладках
  setTimeout(layout, 60);
  if (audio.readyState >= 1) paint();
  const src = audio.getAttribute('src');
  if (src) apReadPeaks(src).then((real) => { if (real && el.isConnected !== false) { peaks = real; bars = []; layout(); } });
  el.addEventListener('ted-audio-destroy', () => {
    observer?.disconnect();
    for (const name of listeners) audio.removeEventListener(name, paint);
    for (const name of ['play', 'pause', 'ended']) audio.removeEventListener(name, sync);
    audio.removeEventListener('timeupdate', stray);
  });
  return el;
}

/** Сайт: заменить родные элементы управления аудио плеером из макета. Для тех, у кого не подключился скрипт, остаётся <audio controls>. */
function enhanceAudio(root = document) {
  for (const figure of root.querySelectorAll('figure.ted-media--audio:not([data-ted-player])')) {
    const audio = figure.querySelector(':scope > audio');
    if (!audio) continue;
    figure.setAttribute('data-ted-player', '');
    audio.removeAttribute('controls');
    figure.insertBefore(buildAudioPlayer(audio, { name: audio.getAttribute('title') || '' }), audio);
  }
}

// ---- resources/js/site/blocks.js ----
// Поведение блоков на сайте (этап 5): blocks/<тип>/<тип>.site.js регистрирует функцию siteBlock(fn), content.js вызывает
// её для каждого корня с содержимым (TedContent.mount). Сборка кладёт этот файл перед файлами блоков (build.json → content).
const SITE_BLOCKS = [];
function siteBlock(fn) { SITE_BLOCKS.push(fn); }

/** Подпись на языке страницы: английская, если у содержимого или у страницы lang="en…", иначе русская (1.0.2) */
function siteText(node, ru, en) {
  const el = node.nodeType === 9 ? node.documentElement : (node.closest && node.closest('[lang]')) || node.ownerDocument.documentElement;
  return /^en/i.test((el && el.getAttribute('lang')) || '') ? en : ru;
}

/**
 * Тост на сайте — тот же Feedback/toast, что в редакторе (.ted-ui-toast из ted.css): внизу по центру, 3,5 с; на тёмной
 * странице — светлый (как редактор в тёмной теме), ошибка — красный (1.0.4)
 */
function siteToast(node, text, status = '') {
  const doc = node.ownerDocument || node;
  let stack = doc.querySelector('body > .ted-ui-toasts[data-ted-site]');
  if (!stack) {
    stack = doc.createElement('div');
    stack.className = 'ted-ui-toasts';
    stack.setAttribute('data-ted-site', '');
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    doc.body.appendChild(stack);
  }
  const dark = !!(node.closest && node.closest('[data-ted-theme="dark"]')) || doc.documentElement.getAttribute('data-ted-theme') === 'dark';
  const toast = doc.createElement('div');
  toast.className = 'ted-ui-toast' + (status ? ' ted-ui-toast--' + status : dark ? ' ted-ui-toast--on-dark' : '');
  const p = doc.createElement('p');
  p.className = 'ted-ui-toast__text';
  p.textContent = text;
  const timer = doc.createElement('span');
  timer.className = 'ted-ui-toast__timer';
  timer.style.animationDuration = '3500ms';
  toast.append(p, timer);
  while (stack.children.length >= 3) stack.firstElementChild.remove();
  stack.appendChild(toast);
  setTimeout(() => { toast.classList.add('is-closing'); setTimeout(() => toast.remove(), 160); }, 3500);
  return toast;
}

// ---- blocks/pre/pre.site.js ----
// Блок «Код» на сайте: в шапке справа кнопка «Копировать код» (как в редакторе). Собирается в content.js
// (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

const SITE_COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const SITE_CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Копирование в буфер. Без https (и не на localhost) браузер не даёт Clipboard API — сразу запасной способ, пока ещё
 * идёт нажатие (после await браузер его уже не разрешает). На https — Clipboard API, при отказе — запасной (1.0.4)
 */
function siteCopyText(doc, text) {
  const legacy = () => {
    try {
      const field = doc.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      const active = doc.activeElement;
      doc.body.appendChild(field);
      field.select();
      const ok = doc.execCommand('copy');
      field.remove();
      if (active && active.focus) active.focus({ preventScroll: true });
      return ok;
    } catch { return false; }
  };
  const win = doc.defaultView || window;
  const api = win.isSecureContext && win.navigator.clipboard && win.navigator.clipboard.writeText;
  if (!api) return Promise.resolve(legacy());
  return win.navigator.clipboard.writeText(text).then(() => true, () => legacy());
}

function siteCodeCopy(root) {
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector(':scope > code');
    if (!code || pre.querySelector(':scope > .ted-code-copy')) continue;
    const doc = pre.ownerDocument;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ted-code-copy';
    button.setAttribute('aria-label', siteText(pre, 'Копировать код', 'Copy code'));
    button.title = siteText(pre, 'Копировать код', 'Copy code');
    button.innerHTML = SITE_COPY_ICON;
    let timer = 0;
    button.addEventListener('click', async () => {
      const ok = await siteCopyText(doc, code.textContent);
      clearTimeout(timer);
      button.classList.toggle('is-copied', ok);
      button.classList.toggle('is-failed', !ok);
      button.innerHTML = ok ? SITE_CHECK_ICON : SITE_COPY_ICON;
      button.setAttribute('aria-label', ok ? siteText(pre, 'Код скопирован', 'Code copied') : siteText(pre, 'Не удалось скопировать код', 'Could not copy the code'));
      // как в редакторе: тост «Код скопирован» / «Не удалось скопировать код»
      siteToast(pre, ok ? siteText(pre, 'Код скопирован', 'Code copied') : siteText(pre, 'Не удалось скопировать код', 'Could not copy the code'), ok ? '' : 'error');
      timer = setTimeout(() => { button.classList.remove('is-copied', 'is-failed'); button.innerHTML = SITE_COPY_ICON; button.setAttribute('aria-label', siteText(pre, 'Копировать код', 'Copy code')); }, 1600);
    });
    pre.prepend(button);
  }
}

siteBlock(siteCodeCopy);

// ---- blocks/iframe/iframe.site.js ----
// Блок «iFrame» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Высота фрейма блока «iFrame» из атрибута height, если браузер не умеет attr() в CSS: сброс сайта (iframe{height:auto}) сильнее атрибута. */
function siteFrameHeight(root) {
  if (window.CSS && CSS.supports && CSS.supports('height', 'attr(height px)')) return;
  for (const frame of root.querySelectorAll('.ted-iframe > iframe[height]')) {
    const h = parseInt(frame.getAttribute('height'), 10);
    if (h > 0 && h < 100000) frame.style.height = h + 'px';
  }
}

siteBlock(siteFrameHeight);

// ---- blocks/product/product.site.js ----
// Блок «Товар» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Товар: «В корзину» шлёт событие ted:add-to-cart { id, button }; CMS кладёт товар в корзину и вызывает preventDefault() —
 * тогда переход по ссылке отменяется. Без обработчика (или без скрипта) кнопка просто ведёт на страницу товара. */
function siteCart(root) {
  if (root.__tedCart) return;
  root.__tedCart = true;
  root.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.ted-product__btn[data-ted-cart]');
    if (!a) return;
    const ev = new CustomEvent('ted:add-to-cart', { bubbles: true, cancelable: true, detail: { id: a.getAttribute('data-ted-cart'), button: a } });
    if (!a.dispatchEvent(ev)) e.preventDefault();
  });
}

siteBlock(siteCart);

// ---- blocks/media/media.site.js ----
// Медиа на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.
// Плеер (audio-player.js), имена файлов (file-names.js) и кнопка «Смотреть на …» (video-link.js) — те же, что в редакторе.

const SITE_VIDEO_HOSTS = ['www.youtube-nocookie.com', 'rutube.ru', 'vkvideo.ru'];

// Ссылка на видео площадки становится её плеером (с её постером) сразу; браузер сам грузит его, когда он приближается к экрану (loading=lazy)
function siteEmbed(link) {
  let url;
  try { url = new URL(link.dataset.tedVideo); } catch { return; }
  if (url.protocol !== 'https:' || !SITE_VIDEO_HOSTS.includes(url.hostname) || url.username || url.password || url.port) return;
  const frame = link.ownerDocument.createElement('iframe');
  frame.title = link.textContent.trim() || siteText(link, 'Видеоплеер', 'Video player');
  frame.src = url.href;
  frame.loading = 'lazy';
  frame.allowFullscreen = true;
  frame.setAttribute('allow', 'fullscreen; picture-in-picture');
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const source = videoSourceButton(link.ownerDocument, link.href);
  link.replaceWith(...(source ? [frame, source] : [frame]));
}

siteBlock((root, { embed = true } = {}) => {
  enhanceAudio(root);
  wrapFileNames(root);
  if (!embed) return;
  for (const link of root.querySelectorAll('.ted-media--video > a[data-ted-video]')) siteEmbed(link);
});

// ---- blocks/table/table.site.js ----
// Блок «Таблица» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Таблица шире колонки — data-ted-scroll: 12 до полосы прокрутки, как в редакторе. */
function siteTableScroll(root) {
  const wraps = Array.from(root.querySelectorAll('.ted-table__wrap'));
  if (!wraps.length) return;
  const check = () => { for (const w of wraps) w.toggleAttribute('data-ted-scroll', w.scrollWidth > w.clientWidth + 1); };
  check();
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(check); wraps.forEach((w) => ro.observe(w)); }
  else window.addEventListener('resize', check);
}

siteBlock(siteTableScroll);

// ---- blocks/tabs/tabs.site.js ----
// Блок «Вкладки» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

let tabsUid = 0;
let tabsSpring = '';
/** Пружина с лёгким перелётом (~5 %, как glide в UI-ките rpm) в виде linear(); без поддержки — ease-out. */
function tabsSpringEasing() {
  if (tabsSpring) return tabsSpring;
  const zeta = 0.68, omega = 6.9 / zeta, wd = omega * Math.sqrt(1 - zeta * zeta), pts = [];
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    pts.push(i === 48 ? 1 : +(1 - Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + (zeta * omega / wd) * Math.sin(wd * u))).toFixed(4));
  }
  const value = 'linear(' + pts.join(', ') + ')';
  tabsSpring = window.CSS && CSS.supports && CSS.supports('transition-timing-function', value) ? value : 'cubic-bezier(0.2, 0, 0, 1)';
  return tabsSpring;
}
/** Вкладки: из названий панелей — ряд вкладок (role=tablist), видна одна панель; стрелки ← → переключают. Без скрипта — разделы подряд. */
function siteTabs(root) {
  for (const tabs of root.querySelectorAll('.ted-tabs:not([data-ted-tabs])')) {
    const panels = [...tabs.querySelectorAll(':scope > .ted-tabs__panel')];
    if (!panels.length) continue;
    const uid = 'ted-tabs-' + (++tabsUid);
    const bar = document.createElement('div');
    bar.className = 'ted-tabs__bar';
    bar.setAttribute('role', 'tablist');
    const buttons = panels.map((panel, i) => {
      const title = panel.querySelector(':scope > .ted-tabs__title');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ted-tabs__tab';
      b.id = uid + '-t' + i;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', uid + '-p' + i);
      b.textContent = (title && title.textContent.trim()) || siteText(panel, 'Вкладка ', 'Tab ') + (i + 1);
      panel.id = panel.id || uid + '-p' + i;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', b.id);
      bar.appendChild(b);
      return b;
    });
    // скользящее подчёркивание: полоса переезжает к выбранной вкладке (первая установка и смена ширины — без движения)
    const ink = document.createElement('span');
    ink.className = 'ted-tabs__ink';
    ink.setAttribute('aria-hidden', 'true');
    bar.appendChild(ink);
    bar.style.setProperty('--ted-ease-spring', tabsSpringEasing());
    let current = 0;
    const place = (glide) => {
      const b = buttons[current];
      bar.toggleAttribute('data-ted-glide', !!glide);
      ink.style.setProperty('--ted-ink-x', b.offsetLeft + 'px');
      ink.style.setProperty('--ted-ink-w', String(b.offsetWidth));
    };
    if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(bar);
    const select = (k, focus) => {
      const glide = bar.isConnected && k !== current && tabs.hasAttribute('data-ted-tabs');
      current = k;
      buttons.forEach((b, i) => { b.setAttribute('aria-selected', String(i === k)); b.tabIndex = i === k ? 0 : -1; });
      place(glide);
      panels.forEach((p, i) => { p.hidden = i !== k; });
      if (focus) buttons[k].focus();
      buttons[k].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(i, false));
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        select((i + step + buttons.length) % buttons.length, true);
      });
    });
    tabs.insertBefore(bar, tabs.firstChild);
    tabs.setAttribute('data-ted-tabs', '');
    select(0, false);
  }
}

siteBlock(siteTabs);

// ---- blocks/toc/toc.site.js ----
// Блок «Содержание» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Содержание: список свёрнут («Показать» / «Скрыть»); полоса прогресса чтения идёт за читателем — прилипает к верху области статьи (окна или прокручиваемой колонки) с отступом 8 px, пока статья не дочитана. */
function siteToc(root) {
  for (const toc of root.querySelectorAll('.ted-toc:not([data-ted-toc])')) {
    toc.setAttribute('data-ted-toc', '');
    const panel = toc.querySelector('.ted-toc__panel');
    const list = toc.querySelector('.ted-toc__list');
    if (panel && list && list.children.length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ted-toc__toggle';
      const set = (open) => { toc.toggleAttribute('data-ted-collapsed', !open); btn.textContent = open ? siteText(toc, 'Скрыть', 'Hide') : siteText(toc, 'Показать', 'Show'); btn.setAttribute('aria-expanded', String(open)); };
      // плавно — только по нажатию (data-ted-anim): при загрузке свёрнутый список не «схлопывается» на глазах
      btn.addEventListener('click', () => { toc.setAttribute('data-ted-anim', ''); set(toc.hasAttribute('data-ted-collapsed')); });
      panel.appendChild(btn);
      set(false);
    }
    const progress = toc.querySelector('.ted-toc__progress');
    const bar = toc.querySelector('.ted-toc__bar');
    if (!progress || !bar) continue;
    const article = toc.closest('.ted-content') || document.body;
    // область, где прокручивается статья: окно или ближайший прокручиваемый родитель (предпросмотр «Как выглядит на сайте», колонка CMS)
    let scroller = null;
    for (let n = article.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) { scroller = n; break; }
    }
    const GAP = 8;   // полоса — вверху области статьи, с отступом 8 px от её края (и ниже липкой шапки сайта: --ted-sticky-top)
    const sticky = () => parseFloat(getComputedStyle(article).getPropertyValue('--ted-sticky-top')) || 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      const a = article.getBoundingClientRect();
      const top = a.top - view.top;
      const total = a.height - view.height;
      const p = total > 0 ? Math.min(1, Math.max(0, -top / total)) : (a.bottom <= view.top + view.height ? 1 : 0);
      bar.style.width = (p * 100).toFixed(2) + '%';
      const t = toc.getBoundingClientRect();
      const edge = view.top + sticky() + GAP;
      const stuck = t.top < edge && a.bottom > edge;
      if (stuck) { progress.style.top = (Math.max(0, view.top) + sticky() + GAP) + 'px'; progress.style.left = t.left + 'px'; progress.style.width = t.width + 'px'; }
      else { progress.style.top = ''; progress.style.left = ''; progress.style.width = ''; }
      toc.toggleAttribute('data-ted-stuck', stuck);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    (scroller || window).addEventListener('scroll', schedule, { passive: true });
    if (scroller) window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  }
}

siteBlock(siteToc);

// ---- resources/js/site/content.js ----
// Публичное поведение блоков на сайте: каждый блок подключает своё (blocks/<тип>/<тип>.site.js → siteBlock),
// здесь — запуск. Без зависимостей, подключается с defer.

/**
 * Корни для автоматического запуска: статьи .ted-content страницы, но не редактор (.ted-ui) — у правки свои кнопки и плеер,
 * иначе в редакторе появлялся второй аудиоплеер сайта (проверка 22.11). Статья без обёртки .ted-content — вся страница.
 */
function siteRoots() {
  const all = Array.from(document.querySelectorAll('.ted-content'));
  if (!all.length) return [document];
  return all.filter((el) => !el.closest('.ted-ui') && !(el.parentElement && el.parentElement.closest('.ted-content')));
}

/** embed: false — видео площадок остаются ссылками (просмотр в редакторе). */
function siteMount(root = null, { embed = true } = {}) {
  for (const r of root ? [root] : siteRoots()) {
    for (const fn of SITE_BLOCKS) fn(r, { embed });   // поведение блоков из папок (blocks/<тип>/<тип>.site.js)
  }
}

window.TedContent = { mount: siteMount };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => siteMount(), { once: true });
else siteMount();

})();
