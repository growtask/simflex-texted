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
export function buildAudioPlayer(audio, { name = '', placeholder = '', onName = null } = {}) {
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
export function enhanceAudio(root = document) {
  for (const figure of root.querySelectorAll('figure.ted-media--audio:not([data-ted-player])')) {
    const audio = figure.querySelector(':scope > audio');
    if (!audio) continue;
    figure.setAttribute('data-ted-player', '');
    audio.removeAttribute('controls');
    figure.insertBefore(buildAudioPlayer(audio, { name: audio.getAttribute('title') || '' }), audio);
  }
}
