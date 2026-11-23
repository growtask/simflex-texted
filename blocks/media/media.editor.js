import { MEDIA_KINDS, makeMediaFigure, mediaEditorBlock, mediaKind, readMediaFigure, safeMediaUrl, videoEmbedUrl } from './media.js';
import { formatLimit } from '../../src/core/server.js';
import { canPickLibrary, mediaPagePath, videoPoster } from '../../src/core/upload.js';
import { emptyBlock, isEmptyBlock, blockAllowed } from '../../src/core/blocks.js';
import { registeredBlocks } from '../../src/core/registry.js';
import { placeCaret, topBlockOf } from '../../src/core/selection.js';
import { buildAudioPlayer } from './audio-player.js';
import { wrapFileNames } from './file-names.js';
import { videoSourceButton } from './video-link.js';
import { h, icon, smallButton } from '../../src/ui/widgets.js';

const MEDIA_LABELS = { image: 'Изображение', gallery: 'Галерея', video: 'Видео', audio: 'Аудио', file: 'Файл' };
const MEDIA_HINTS = { image: 'JPG, PNG, WEBP до 5 МБ (сохраним как WebP), GIF до 5 МБ (как есть)', gallery: 'JPG, PNG, WEBP до 5 МБ (сохраним как WebP), GIF до 5 МБ (как есть), несколько файлов', video: 'MP4, WebM, MOV, AVI, MKV и другие до 500 МБ. Постер из первого кадра, видео грузится по нажатию на плей', audio: 'MP3, WAV, до 50 МБ', file: 'PDF, DOCX, XLSX, ZIP, до 20 МБ' };
const MEDIA_PICK = { image: 'Выбрать изображение', gallery: 'Выбрать изображения для галереи', video: 'Выбрать видео', audio: 'Выбрать аудио', file: 'Выбрать файлы' };
const MEDIA_LIBRARY = new Set(['image', 'gallery', 'video', 'audio', 'file']);   // ссылка «Из библиотеки» в зоне загрузки (заказчик 23.11: изображения, видео, аудио, файлы)
const mediaAcceptsMany = (kind) => kind === 'gallery' || kind === 'file';
const mediaFileKind = (kind) => kind === 'gallery' ? 'image' : kind;

const mediaStateKind = (state) => state.kind;

export class MediaBlocks {
  constructor(editor) {
    this.editor = editor;
    this.jobs = new Map();
    this.rendered = new WeakSet();   // блоки, у которых панель собрана именно здесь (копия блока приходит с мёртвой панелью и пересобирается)
    this.info = new WeakMap();   // что сделал сервер с файлом: «WebP · 1200×630 · 410 КБ (было 3,2 МБ)»
    const root = editor.editable;
    editor.listen(root, 'dragover', (event) => this.dragOver(event));
    editor.listen(root, 'dragleave', (event) => this.dragLeave(event));
    editor.listen(root, 'drop', (event) => this.drop(event));
    // ссылки в медиа в правке не открываются; кнопка «Смотреть на YouTube» — как превью: первый щелчок выбирает блок, второй открывает видео
    editor.listen(root, 'click', (e) => {
      const t = e.target;
      if (!t || !t.closest || !t.closest('.ted-ui-media a') || t.closest('button, input, select, textarea')) return;
      const block = topBlockOf(root, t);
      const r = document.getSelection().rangeCount ? document.getSelection().getRangeAt(0) : null;
      const wasSelected = !!(block && r && r.startContainer === block.parentNode && r.startContainer.childNodes[r.startOffset] === block && r.endOffset === r.startOffset + 1);
      if (!(t.closest('.ted-media__source') && wasSelected)) e.preventDefault();
    });
  }

  /** Alt+Enter на выделенном целиком медиаблоке — окно настроек. */
  onKey(e) {
    if (e.key !== 'Enter' || !e.altKey) return false;
    const root = this.editor.editable;
    const r = document.getSelection().rangeCount ? document.getSelection().getRangeAt(0) : null;
    const whole = r && r.startContainer === root && r.endContainer === root && r.endOffset === r.startOffset + 1 ? root.childNodes[r.startOffset] : null;
    if (!whole || whole.nodeType !== 1 || !whole.classList.contains('ted-ui-media')) return false;
    e.preventDefault();
    this.settings(whole, 0, whole);
    return true;
  }

  /** Сводка редактора: у медиаблока считается подпись, блок — если есть файл. */
  statsOf(block) {
    if (!block.classList || !block.classList.contains('ted-ui-media')) return null;
    const s = this.state(block);
    return { text: s.caption, filled: s.items.length > 0 };
  }

  pasteLink(url, link, block) { return this.linkChoice(url, link, block); }

  afterPaste(before) { this.fetchExternal(before); }

  create(kind, after, { select = true, items = [] } = {}) {
    if (!MEDIA_KINDS.has(kind)) return null;
    const { editor } = this;
    const block = mediaEditorBlock(makeMediaFigure(document, kind, items));
    editor.history.commit();
    if (after?.tagName === 'P' && isEmptyBlock(after)) after.replaceWith(block);
    else if (after?.parentNode === editor.editable || after?.parentNode?.classList?.contains('ted-ui-host')) after.after(block);   // и в ответе аккордеона
    else editor.editable.appendChild(block);
    this.render(block);
    if (select) editor.selectObject(block);
    editor.afterChange({ immediate: true });
    return block;
  }

  refresh() {
    const { editable } = this.editor;
    for (const [block, jobs] of this.jobs) {
      if (editable.contains(block)) continue;
      for (const job of jobs) job.abort?.abort();
      this.jobs.delete(block);
    }
    for (const block of editable.querySelectorAll(':scope > .ted-ui-media, .ted-ui-host > .ted-ui-media')) {
      if (!this.rendered.has(block)) this.render(block);
    }
  }

  destroy() {
    for (const jobs of this.jobs.values()) for (const job of jobs) job.abort?.abort();
    this.jobs.clear();
  }

  state(block) {
    const figure = block.firstElementChild;
    const kind = mediaKind(figure);
    return { kind, figure, ...readMediaFigure(figure, kind) };
  }

  update(block, kind, items, caption, alignment = null) {
    const { editor } = this;
    editor.history.commit();
    const figure = makeMediaFigure(document, kind, items, caption);
    if (alignment === null) {
      for (const cls of block.firstElementChild.classList) if (cls.startsWith('ted-align-')) figure.classList.add(cls);
    } else if (alignment) figure.classList.add(alignment);
    block.firstElementChild.replaceWith(figure);
    this.render(block);
    editor.afterChange({ immediate: true });
  }

  /** from: 'manager' — ссылка «Из библиотеки» в зоне загрузки (при прямой загрузке). */
  async choose(block, index = null, from = null) {
    const { editor } = this;
    const { kind } = this.state(block);
    try {
      const { source, assets } = await editor.chooseMedia(mediaFileKind(kind), { multiple: index === null && mediaAcceptsMany(kind), source: from });
      if (!editor.editable.contains(block) || !assets.length) return;
      if (source === 'manager') return this.applyAssets(block, assets, index, { library: true });
      this.receive(block, assets, index);
    } catch (error) { editor.toast(error.message || 'Не удалось выбрать файл'); }
  }

  async receive(block, files, index = null) {
    const { editor } = this;
    const { kind } = this.state(block);
    if (editor.options.mediaSource !== 'direct' || typeof editor.options.upload !== 'function') return;
    const selected = mediaAcceptsMany(kind) && index === null ? files : files.slice(0, 1);
    // Последовательность в пакете совпадает с порядком выбора, даже если сервер ответит в другом порядке.
    const batch = selected.map(file => ({ file, index, fraction: null, status: 'loading', multi: selected.length > 1 }));
    this.jobs.set(block, [...(this.jobs.get(block) || []), ...batch]);
    this.render(block);
    await Promise.all(batch.map(job => this.send(block, kind, job)));
    if (!editor.editable.contains(block)) return;
    const completed = batch.filter(job => job.status === 'done');
    // все загружены: зелёные области убираются, файлы встают в блок
    for (const job of completed) this.removeJob(block, job);
    if (completed.length) { this.applyAssets(block, completed.map(job => job.asset), index); this.saveAfterUpload(); }
    else this.render(block);
  }

  /** Файл загружен — страница сохраняется вместе с ним (onSave), иначе при закрытии без сохранения файл остался бы на сервере без ссылки. */
  saveAfterUpload() {
    const { editor } = this;
    if (editor.options.mediaSource !== 'direct' || !editor.options.onSave || editor.options.saveAfterUpload === false) return;
    editor.flush();
    editor.persist(editor.getHTML()).then(() => editor.toast('Страница сохранена вместе с файлом'), () => editor.toast('Файл загружен, но страницу сохранить не удалось', { status: 'error' }));
  }

  async send(block, kind, job) {
    const { editor } = this;
    const abort = new AbortController();
    job.abort = abort;
    job.status = 'loading';
    job.fraction = null;
    this.render(block);
    try {
      // лимит размера из настроек сервера: слишком большой файл не отправляем — сервер его всё равно не примет
      const limit = job.file && editor.server.limits[mediaFileKind(kind)];
      if (limit && job.file.size > limit) throw new Error(`Файл больше ${formatLimit(limit)} — так настроено на сайте`);
      const asset = job.url ? await editor.options.upload.fromUrl(job.url, { pagePath: mediaPagePath(editor), signal: abort.signal }) : await editor.options.upload(job.file, {
        kind: mediaFileKind(kind), pagePath: mediaPagePath(editor), signal: abort.signal,
        onProgress: (fraction) => {
          if (abort.signal.aborted || !editor.editable.contains(block)) return;
          job.fraction = typeof fraction === 'number' && Number.isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : null;
          this.progress(block, job);
        },
      });
      if (abort.signal.aborted) return;
      if (!safeMediaUrl(asset?.url)) throw new Error('Сервер не вернул адрес файла');
      job.asset = { ...asset, name: asset.name || jobName(job) };
      editor.mediaUploaded.add(job.asset.url);
      if (mediaFileKind(kind) === 'video' && !job.asset.poster) {
        // сервер не вернул постер (нет ffmpeg) — берём первый кадр в браузере и отправляем как обычное изображение
        job.stage = 'poster'; this.progress(block, job);
        const blob = await videoPoster(job.file);
        if (blob && !abort.signal.aborted) {
          try {
            const poster = await editor.options.upload(new File([blob], `${job.file.name.replace(/\.[^.]*$/, '') || 'video'}-poster.webp`, { type: 'image/webp' }), { kind: 'image', pagePath: mediaPagePath(editor), signal: abort.signal });
            if (safeMediaUrl(poster?.url)) { job.asset.poster = poster.url; editor.mediaUploaded.add(poster.url); }
          } catch { /* без постера видео всё равно работает */ }
        }
        if (abort.signal.aborted) return;
      }
      job.status = 'done';
    } catch (error) {
      if (abort.signal.aborted) return;
      job.status = 'error';
      job.error = error?.message || 'Не удалось загрузить';
      // ответ сервера 4xx (кроме «слишком часто» и тайм-аута): файл не подходит — «Повторить» бесполезна
      job.final = error?.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
      if (editor.editable.contains(block)) editor.toast(job.error, { status: 'error' });
    }
    if (editor.editable.contains(block)) this.render(block);
  }

  removeJob(block, job) {
    const remaining = (this.jobs.get(block) || []).filter(other => other !== job);
    if (remaining.length) this.jobs.set(block, remaining);
    else this.jobs.delete(block);
  }

  async retry(block, kind, job) {
    await this.send(block, kind, job);
    if (job.status !== 'done' || !this.editor.editable.contains(block)) return;
    this.removeJob(block, job);
    this.applyAssets(block, [job.asset], job.index);
    this.saveAfterUpload();
  }

  /** library — файлы из библиотеки CMS: не загружались, сводки сервера («WebP · 1200×630…») о них нет. */
  applyAssets(block, assets, index, { library = false } = {}) {
    const { kind, items, caption } = this.state(block);
    const valid = assets.map(asset => typeof asset === 'string' ? { url: asset } : asset).filter(asset => safeMediaUrl(asset?.url))
      .map(asset => mediaStateKind(this.state(block)) === 'audio' && asset.name ? { ...asset, name: asset.name.replace(/\.[a-z0-9]{2,5}$/i, '') } : asset);
    if (!valid.length) { this.editor.toast('Файл не выбран'); return; }
    if (index !== null) items[index] = { ...items[index], ...valid[0], caption: items[index]?.caption || '' };
    else if (mediaAcceptsMany(kind)) items.push(...valid);
    else items.splice(0, items.length, valid[0]);
    const before = kind === 'gallery' || kind === 'file' ? items.length - (index === null ? valid.length : 0) : 0;
    this.smooth(block, () => {
      this.update(block, kind, items, caption);
      if (this.editor.options.mediaSource === 'direct' && !library) {
        const report = uploadReport(valid);
        this.info.set(block, report.info);
        this.editor.toast(report.toast, { status: 'success' });
        this.render(block);
      }
    }, before);
  }

  /**
   * Смена содержимого блока без рывка: высота блока плавно переходит от прежней к новой (области загрузки уходят, файлы появляются),
   * а новые плитки, изображение, видео проявляются. При «уменьшении движения» всё меняется сразу.
   */
  smooth(block, change, fromIndex = 0) {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = block.offsetHeight;
    change();
    if (still) return;
    const to = block.offsetHeight;
    const figure = block.firstElementChild;
    const fresh = [...(figure?.children || [])].filter(node => node.tagName !== 'FIGCAPTION').slice(fromIndex);
    for (const node of fresh) node.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease' });
    if (Math.abs(to - from) < 2) return;
    // WAAPI, а не inline-стили: правка style блока попадала бы в историю правок отдельным шагом
    block.animate?.([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: 300, easing: 'ease' });
  }

  render(block) {
    this.rendered.add(block);
    block.querySelectorAll('.ted-audio').forEach(node => node.dispatchEvent(new Event('ted-audio-destroy')));
    const { kind, figure, items } = this.state(block);
    // и у копии блока (дублирование снимает все data-tedui-*), поэтому ещё и по классам
    block.querySelectorAll('[data-tedui-media-panel], .ted-ui-media__panel, .ted-ui-media__tile-tools, .ted-ui-media__caption, .ted-audio').forEach(node => node.remove());
    const jobs = this.jobs.get(block) || [];
    const panel = h('div', { class: 'ted-ui-media__panel', 'data-tedui-media-panel': '' });
    block.appendChild(panel);
    block.dataset.mediaReady = items.length ? 'true' : 'false';
    block.dataset.mediaKind = kind;
    const pending = jobs.filter(job => job.status !== 'done' || job.multi);   // идущие, сорвавшиеся и показанные зелёным (при множественной загрузке)
    block.toggleAttribute('data-tedui-media-replacing', pending.some(job => job.index !== null && job.status !== 'done'));
    if ((!items.length && !pending.length) || (items.length && mediaAcceptsMany(kind))) panel.appendChild(this.addButton(block, kind));
    if (!items.length && !pending.length && this.editor.options.mediaSource === 'direct') {
      panel.appendChild(h('div', { class: 'ted-ui-media__hint', text: MEDIA_HINTS[kind] }));
    }
    if (items.length && !mediaAcceptsMany(kind) && !pending.length) {
      const replace = smallButton({ name: 'media-replace', label: 'Заменить файл', onClick: () => this.choose(block, 0) });
      replace.replaceChildren(h('i', { class: 'ted-ui-media__refresh-icon', 'aria-hidden': 'true' }));
      const tools = h('div', { class: 'ted-ui-media__tools' });
      if (kind === 'image' || kind === 'audio') {
        tools.appendChild(smallButton({ name: 'media-settings', label: kind === 'image' ? 'Описание (alt)' : 'Название', iconName: 'edit', onClick: (event) => this.settings(block, 0, event.currentTarget) }));
      }
      tools.appendChild(replace);
      panel.appendChild(tools);
      if (kind === 'video' && items[0].embed) {
        panel.appendChild(this.embedPreview(items[0].url));
        const source = videoSourceButton(panel.ownerDocument, items[0].url);
        if (source) panel.appendChild(source);
      }
      if (kind === 'audio') panel.appendChild(buildAudioPlayer(figure.querySelector(':scope > audio'), { name: items[0].name, placeholder: 'Название', onName: () => tools.querySelector('[data-act="media-settings"]')?.click() }));
      if (kind !== 'file') panel.appendChild(this.captionField(block, figure, 'Добавить подпись'));
      const info = this.info.get(block) || savedInfo(kind, items[0]);
      if (info) {
        const line = h('div', { class: 'ted-ui-media__info', text: info });
        panel.appendChild(line);
        if (!this.info.has(block) && kind === 'image') savedImageDetails(line, info, items[0], figure.querySelector(':scope > img'));
      }
    }
    if (!items.length && !pending.length && kind === 'video') panel.appendChild(this.linkField(block));
    if (!items.length && !pending.length && kind === 'image' && this.canFetch()) panel.appendChild(this.linkField(block, 'image'));
    if (items.length) figure.ondblclick = (event) => {
      if (event.target.closest('video, audio, button')) return;
      event.preventDefault();
      const index = kind === 'gallery' ? [...figure.children].indexOf(event.target.closest('figure > figure')) :
        kind === 'file' ? [...figure.children].indexOf(event.target.closest('a')) : 0;
      if (kind === 'video') return;
      const pencil = kind === 'gallery' || kind === 'file' ? figure.querySelectorAll('[data-act="media-settings"]')[Math.max(0, index)] : block.querySelector('[data-act="media-settings"]');
      if (pencil) this.settings(block, Math.max(0, index), pencil);
    };
    if (kind === 'file') wrapFileNames(figure);   // название файла в две строки с многоточием
    if (kind === 'gallery' || kind === 'file') this.itemControls(block, figure, kind);
    if (kind === 'gallery' && items.length) panel.appendChild(h('div', { class: 'ted-ui-media__info', text: `Галерея · ${items.length} фото. У каждого фото своя подпись; ⠿ — переставить, карандаш — alt` }));
    for (const job of jobs) {
      if (job.status === 'done' && !job.multi) continue;   // одиночная загрузка: между концом и вставкой файла области нет
      panel.appendChild(this.jobPanel(block, kind, job));
    }
  }

  addButton(block, kind) {
    const clip = h('i', { class: 'ted-ui-media__paperclip', 'aria-hidden': 'true' });
    // скрепка — часть надписи: в узкой колонке стоит перед первым словом, а не отдельной строкой
    const pick = h('button', { type: 'button', class: 'ted-ui-media__drop', 'aria-label': `Выбрать файл: ${MEDIA_LABELS[kind]}` }, [
      h('span', { class: 'ted-ui-media__drop-label' }, [clip, kind === 'gallery' && this.state(block).items.length ? 'Добавить фото в галерею' : MEDIA_PICK[kind]]),
      h('span', { class: 'ted-ui-media__drop-hint', text: 'или перетащите сюда' }),
      h('span', { class: 'ted-ui-media__drop-active', text: 'Отпустите, чтобы загрузить' })]);
    const press = () => this.choose(block);
    pick.addEventListener('click', press);
    if (this.editor.options.mediaSource === 'manager') pick.replaceChildren(clip, h('span', {}, ['Из библиотеки']));
    if (MEDIA_LIBRARY.has(kind) && canPickLibrary(this.editor)) return this.libraryZone(block, pick);
    return pick;
  }

  /**
   * Зона загрузки со ссылкой библиотеки (Uploader/drop, library=true): «Выбрать … или перетащите сюда · Из библиотеки».
   * Кнопку в кнопку не вкладываем: зона — группа, щелчок по ней (кроме ссылки) выбирает файл с компьютера.
   */
  libraryZone(block, pick) {
    const [label, hint, active] = pick.children;
    const ariaLabel = pick.getAttribute('aria-label');
    const zone = h('div', { class: `${pick.className} ted-ui-media__drop--library`, role: 'group', 'aria-label': ariaLabel });
    const upload = h('button', { type: 'button', class: 'ted-ui-media__drop-link', 'aria-label': ariaLabel }, [label]);
    const library = h('button', { type: 'button', class: 'ted-ui-media__drop-link', 'data-act': 'media-library', text: 'Из библиотеки' });
    library.addEventListener('click', (event) => { event.stopPropagation(); this.choose(block, null, 'manager'); });
    upload.addEventListener('click', (event) => { event.stopPropagation(); this.choose(block); });
    zone.addEventListener('click', () => this.choose(block));
    // «или перетащите сюда · Из библиотеки» — одна группа: в узкой колонке переносится целиком
    const more = h('span', { class: 'ted-ui-media__drop-more' }, [hint, h('span', { class: 'ted-ui-media__drop-dot', text: '·', 'aria-hidden': 'true' }), library]);
    zone.append(upload, more, active);
    return zone;
  }

  /** Загрузка: сама зона drop заливается цветом по мере загрузки (как Uploader/drop в библиотеке); отмена — крестик Buttons/icon-small. */
  jobPanel(block, kind, job) {
    const layer = h('div', { class: `ted-ui-media__job ted-ui-media__job--${kind}${job.status === 'error' ? ' is-error' : ''}` });
    // у ошибки загрузка уже не идёт — крестик «Убрать», а не «Отменить загрузку» (проверка 22.11)
    const cancel = smallButton({ name: 'media-cancel', label: job.status === 'error' ? 'Убрать' : 'Отменить загрузку', iconName: 'close-small', onClick: () => { job.abort?.abort(); this.removeJob(block, job); this.render(block); } });
    cancel.classList.add('ted-ui-media__cancel');
    const group = h('div', { class: 'ted-ui-media__status' });
    if (job.status === 'done') {
      // множественная загрузка: у готового файла вместо прогресса зелёная область с галочкой (пока не загружены все)
      layer.classList.add('ted-ui-media__job--done');
      const mark = h('span', { class: 'ted-ui-media__done-icon', 'aria-hidden': 'true' }, [icon('check')]);
      layer.append(group);
      group.append(mark, h('div', { class: 'ted-ui-media__file' }, [h('strong', { role: 'status', text: 'Загружено' }), h('span', { text: jobLabel(job) })]));
      return layer;
    }
    if (job.status === 'error') {
      layer.append(group, cancel);
      // какой файл не подошёл и почему; «Повторить» — только если повтор может помочь (сбой сети, сервера)
      group.append(h('div', { class: 'ted-ui-media__file' }, [h('strong', { role: 'alert', text: 'Не удалось загрузить' }), h('span', { text: job.error ? `${jobName(job)}: ${job.error}` : jobName(job) })]));
      if (!job.final) group.append(mediaAction('Повторить', () => this.retry(block, kind, job)));   // secondary: рядом нет второй яркой кнопки, отмена — крестик
    } else {
      job.fill = h('div', { class: 'ted-ui-media__fill', role: 'progressbar', 'aria-label': 'Загрузка файла', 'aria-valuemin': '0', 'aria-valuemax': '100' });
      job.title = h('strong');
      layer.append(job.fill, group, cancel);
      group.append(h('i', { class: 'ted-ui-media__spinner', 'aria-hidden': 'true' }),
        h('div', { class: 'ted-ui-media__file' }, [job.title, h('span', { text: jobLabel(job) })]));
      this.progress(block, job);
    }
    return layer;
  }

  progress(block, job) {
    if (!job.fill) return;
    const pct = job.fraction === null ? null : Math.round(job.fraction * 100);
    const kind = this.state(block).kind;
    const what = kind === 'gallery' ? 'фото' : MEDIA_LABELS[kind].toLowerCase();
    // процент неизвестен — зона наполняется сама (CSS); после перерисовки — с того же места, а не с нуля
    if (pct === null) { job.pendingSince = job.pendingSince || performance.now(); job.fill.style.animationDelay = `-${((performance.now() - job.pendingSince) / 1000).toFixed(2)}s`; job.fill.style.width = ''; }
    else job.fill.style.width = `${pct}%`;
    job.fill.classList.toggle('is-pending', pct === null);
    if (pct === null) job.fill.removeAttribute('aria-valuenow');
    else job.fill.setAttribute('aria-valuenow', String(pct));
    job.title.textContent = job.stage === 'poster' ? 'Готовим постер…' : job.url ? 'Загружаем по ссылке и сжимаем…' : pct === 100 ? 'Обрабатываем на сервере…' : `Загружается ${what}${pct === null ? '…' : ` ${pct}%`}`;
  }

  /** Подпись под изображением, видео, аудио: прямо в блоке, без окна. Enter — переход к новому абзацу после блока. Пустая подпись в HTML не попадает. */
  captionField(block, figure, placeholder) {
    const input = h('input', { type: 'text', class: 'ted-ui-media__caption', placeholder, 'aria-label': 'Подпись', value: figure.querySelector(':scope > figcaption')?.textContent || '' });
    input.addEventListener('focus', () => this.editor.history.commit());
    input.addEventListener('input', () => { setCaption(figure, input.value.trim() ? input.value : ''); this.editor.afterChange(); });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const { editor } = this;
      let next = block.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { editor.history.commit(); next = emptyBlock(document); block.after(next); }
      editor.afterChange({ immediate: true, focus: next });
    });
    return input;
  }

  /** Превью видео с площадки: тот же плеер, что увидит читатель (в редакторе — первым кликом выбирается блок, вторым запускается видео). */
  embedPreview(url) {
    const src = videoEmbedUrl(url);
    const frame = h('iframe', { src, title: 'Видео', loading: 'lazy', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-popups', allow: 'fullscreen; picture-in-picture' });
    return h('div', { class: 'ted-ui-media__embed' }, [frame]);
  }

  /**
   * Видео или изображение по ссылке: поле и кнопка из окон редактора (ted-ui-input и Buttons/main xs), одной высоты.
   * Картинку по ссылке сервер скачивает и сжимает сам (upload.fromUrl) — чужой адрес в статье не остаётся (заказчик 17.11).
   */
  linkField(block, kind = 'video') {
    const image = kind === 'image';
    const input = h('input', { type: 'url', class: 'ted-ui-input ted-ui-media__url', autocomplete: 'off', placeholder: image ? 'Ссылка на картинку: https://…' : 'YouTube, RuTube, VK Видео или MP4', 'aria-label': image ? 'Ссылка на картинку' : 'Ссылка на видео' });
    const submit = () => {
      const text = input.value.trim();
      if (!text) return;
      if (image) {
        const url = safeMediaUrl(text);
        if (!url) return this.editor.toast('Ссылка не подошла: нужен адрес https://…', { status: 'error' });
        return isExternal(url) ? this.fetchUrl(block, url, null) : this.applyAssets(block, [{ url }], null);
      }
      if (videoEmbedUrl(text)) return this.applyAssets(block, [{ url: text, embed: true }], null);
      if (safeMediaUrl(text) && /\.(mp4|webm|ogv|m4v)(\?.*)?$/i.test(text)) return this.applyAssets(block, [{ url: text }], null);
      this.editor.toast('Ссылка не подошла: нужна страница видео на YouTube, RuTube, VK Видео или прямой адрес MP4/WebM', { status: 'error' });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (input.value.trim()) { submit(); return; }
      // пустое поле: Enter — новый абзац под блоком (как Enter в подписи)
      const { editor } = this;
      let next = block.nextElementSibling;
      if (!next || next.tagName !== 'P' || !isEmptyBlock(next)) { editor.history.commit(); next = emptyBlock(document); block.after(next); }
      editor.afterChange({ immediate: true, focus: next });
    });
    const button = h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary ted-ui-action--s ted-ui-media__link-go', text: 'Вставить' });
    button.addEventListener('click', submit);
    return h('div', { class: 'ted-ui-field__row ted-ui-media__link' }, [input, button]);
  }

  /**
   * Окно у кнопки-карандаша, устроено как окно «Якорь»: шапка с крестиком, поле, подсказка, «Сохранить» и «Отмена».
   * Изображение и фото галереи — «Описание (alt)»; файл и аудио — имя. Подпись правится прямо под медиа.
   */
  settings(block, index, anchor) {
    const { editor } = this;
    const { kind, items, caption } = this.state(block);
    const item = items[index];
    if (!item) return;
    const named = kind === 'file' || kind === 'audio';
    if (!named && kind !== 'image' && kind !== 'gallery') return;
    const key = named ? 'name' : 'alt';
    const title = { image: 'Изображение', gallery: 'Фото', file: 'Файл', audio: 'Аудио' }[kind];
    const label = named ? (kind === 'file' ? 'Имя файла' : 'Название') : 'Описание (alt)';
    const hint = named ? (kind === 'file' ? 'Так файл называется на странице.' : 'Показывается под волной.') : 'Что на картинке: читают поисковики и экранные дикторы.';
    const input = h('input', { class: 'ted-ui-input', type: 'text', autocomplete: 'off', 'aria-label': label, placeholder: named ? '' : 'Красный диван, вид спереди', value: item[key] || '' });
    const save = () => {
      editor.popover.close();
      item[key] = input.value.trim();
      this.update(block, kind, items, caption);
    };
    const cancel = () => editor.popover.close();
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } });
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [h('p', { class: 'ted-ui-form__title', text: title }), smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: cancel })]),
      h('label', { class: 'ted-ui-field' }, [h('span', { class: 'ted-ui-field__label', text: label }), input, h('span', { class: 'ted-ui-field__hint', text: hint })]),
      h('div', { class: 'ted-ui-form__footer' }, [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Сохранить', onclick: save }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Отмена', onclick: cancel }),
      ]),
    ];
    editor.popover.open(nodes, anchor, { cls: 'ted-ui-pop--link', focus: '.ted-ui-input', align: 'end' });
  }

  /**
   * Кнопки плитки галереи и файла: ручка ⠿, карандаш (alt и подпись / имя) и корзина в правом верхнем углу,
   * рамка только при перетаскивании (2 px, main/color1/light, поле 2), соседи плавно сдвигаются.
   * Ручка переносит и по горизонтали, и по вертикали (сетка), с клавиатуры — Alt + стрелки.
   */
  itemControls(block, figure, kind) {
    const tag = kind === 'gallery' ? 'figure' : 'a';
    const tiles = () => [...figure.querySelectorAll(`:scope > ${tag}`)];
    const noun = kind === 'gallery' ? 'фото' : 'файл';
    for (const [index, tile] of tiles().entries()) {
      const tools = h('div', { class: 'ted-ui-media__tile-tools', 'data-tedui-media-panel': '' });
      for (const type of ['click', 'dblclick']) tools.addEventListener(type, (event) => { event.preventDefault(); event.stopPropagation(); });
      const grip = smallButton({ name: 'media-grip', label: `Переместить ${noun} (Alt и стрелки)`, iconName: 'grip' });
      grip.addEventListener('contextmenu', (event) => event.preventDefault());
      grip.addEventListener('pointerdown', (event) => this.editor.handle.onGripDown(event, () => tile, grip, {
        item: true,
        siblings: tiles,
        onDrop: (from, to) => this.reorder(block, from, to),
      }));
      grip.addEventListener('keydown', (event) => {
        const step = { ArrowLeft: -1, ArrowUp: -2, ArrowRight: 1, ArrowDown: 2 }[event.key];
        if (!event.altKey || !step) return;
        event.preventDefault(); event.stopPropagation();
        this.reorder(block, index, index + step);
        block.querySelectorAll('.ted-ui-media__tile-tools button:first-child')[index + step]?.focus();
      });
      const settings = smallButton({ name: 'media-settings', label: kind === 'gallery' ? 'Описание (alt)' : 'Переименовать', iconName: 'edit', onClick: (event) => this.settings(block, index, event.currentTarget) });
      const remove = smallButton({ name: 'media-delete', label: `Удалить ${noun}`, iconName: 'trash', onClick: () => {
        const { kind: current, items, caption } = this.state(block);
        items.splice(index, 1); this.update(block, current, items, caption);
      } });
      tools.append(grip, settings);
      tools.append(remove);   // внешняя корзина у фото и у файла; в окне карандаша удаления нет
      tile.appendChild(tools);
      if (kind === 'gallery') {
        const input = this.captionField(block, tile, 'Подпись');
        input.setAttribute('data-tedui-media-panel', '');
        tile.appendChild(input);
      }
    }
  }

  /** Перестановка фото / файлов: переставляются сами плитки (картинки не грузятся заново — без мигания, решение 22.11). */
  reorder(block, from, to) {
    const { kind, items, figure } = this.state(block);
    if (to < 0 || to >= items.length || from === to) return;
    const tag = kind === 'gallery' ? 'figure' : 'a';
    const tiles = [...figure.querySelectorAll(':scope > ' + tag)];
    if (tiles.length !== items.length) { const { caption } = this.state(block); items.splice(to, 0, items.splice(from, 1)[0]); this.update(block, kind, items, caption); return; }
    const { editor } = this;
    editor.history.commit();
    const moving = tiles[from];
    const rest = tiles.filter((t) => t !== moving);
    figure.insertBefore(moving, rest[to] || (rest.length ? rest[rest.length - 1].nextSibling : null));
    this.render(block);
    editor.afterChange({ immediate: true });
  }

  /** Сервер умеет скачивать картинки по ссылке (прямая загрузка и upload.fromUrl из createUpload). */
  canFetch() {
    const { options } = this.editor;
    return options.mediaSource === 'direct' && typeof options.upload === 'function' && typeof options.upload.fromUrl === 'function';
  }

  /** Картинка по ссылке: та же область загрузки с крестиком отмены; index — заменить фото галереи (или изображение) на месте. */
  async fetchUrl(block, url, index = null) {
    if (!this.canFetch()) return;
    const { kind } = this.state(block);
    const job = { url, index, fraction: null, status: 'loading', multi: false };
    this.jobs.set(block, [...(this.jobs.get(block) || []), job]);
    this.render(block);
    await this.retry(block, kind, job);
  }

  /** После вставки: картинки с чужих сайтов в новых блоках загружаются на сервер (сжатие как у загруженных). */
  fetchExternal(before) {
    if (!this.canFetch()) return;
    for (const block of this.editor.editable.querySelectorAll(':scope > .ted-ui-media, .ted-ui-host > .ted-ui-media')) {
      if (before.has(block) || this.jobs.has(block)) continue;
      const { kind, items } = this.state(block);
      if (kind !== 'image' && kind !== 'gallery') continue;
      items.forEach((item, i) => { if (isExternal(item.url)) this.fetchUrl(block, item.url, i); });
    }
  }

  /**
   * Картинку перетащили с другой страницы (файла нет — только адрес): браузер вставил бы <img> как есть, шире колонки.
   * Вместо этого — блок «Изображение», а сервер скачивает и сжимает картинку (заказчик 17.11).
   */
  dropImageUrl(event, target) {
    const dt = event.dataTransfer;
    if (!dt) return;
    const tpl = document.createElement('template');
    tpl.innerHTML = dt.getData('text/html') || '';
    const imgs = tpl.content.querySelectorAll('img');
    const onlyImage = imgs.length === 1 && !tpl.content.textContent.trim();
    const list = (dt.getData('text/uri-list') || '').split(/\r?\n/).filter((x) => x && !x.startsWith('#'));
    const url = safeMediaUrl(onlyImage ? imgs[0].getAttribute('src') || '' : (!imgs.length && list.length === 1 && IMAGE_URL_RE.test(list[0]) ? list[0] : ''));
    if (!url) return;
    event.preventDefault();
    const block = target || this.create('image', topBlockOf(this.editor.editable, event.target), { select: false });
    if (target && this.state(target).kind !== 'image' && this.state(target).kind !== 'gallery') return;
    const { items, kind } = this.state(block);
    const index = items.length && !mediaAcceptsMany(kind) ? 0 : null;
    if (isExternal(url) && this.canFetch()) this.fetchUrl(block, url, index);
    else this.applyAssets(block, [{ url, alt: onlyImage ? imgs[0].getAttribute('alt') || '' : '' }], index);
  }

  filesFrom(transfer) { return [...(transfer?.files || [])].filter(file => file.type.startsWith('image/')); }

  pasteFiles(event, block) {
    if (this.editor.options.mediaSource !== 'direct' || typeof this.editor.options.upload !== 'function') return false;
    const files = this.filesFrom(event.clipboardData);
    const allowed = this.editor.allowedBlocks;
    if (!files.length || !blockAllowed(allowed, 'image')) return false;   // набор без изображений: файл не вставляем
    const gallery = files.length > 1 && blockAllowed(allowed, 'gallery');
    const target = this.create(gallery ? 'gallery' : 'image', block, { select: false });
    this.receive(target, gallery ? files : files.slice(0, 1));
    return true;
  }

  /**
   * Вставили ссылку (заказчик 17.11): она сразу стала ссылкой, а под абзацем — выбор, как её показать:
   * видео (YouTube, RuTube, VK), изображение (адрес JPG / PNG / WEBP / GIF — сервер скачает и сожмёт) или карточка
   * встраивания (если CMS подключила opengraph). Окно закрыли или «Оставить ссылкой» — остаётся обычная ссылка.
   */
  linkChoice(url, link, block) {
    const { editor } = this;
    if (!link || !link.isConnected) return false;
    // показать иначе можно только ссылку в отдельном абзаце: видео, изображение или карточка встраивания
    // и только блоком, разрешённым набором (этап 2)
    const asBlock = !!block && block.tagName === 'P';
    const allowed = editor.allowedBlocks;
    const video = asBlock && blockAllowed(allowed, 'video') && !!videoEmbedUrl(url);
    const picture = asBlock && !video && blockAllowed(allowed, 'image') && IMAGE_URL_RE.test(url) && !!safeMediaUrl(url);
    // карточка — блок из реестра, который умеет показать ссылку собой (blocks/<тип>/<тип>.js → fromLink, canFromLink)
    const card = asBlock && !video && !picture ? registeredBlocks().find((d) => d.fromLink && blockAllowed(allowed, d.type) && (!d.canFromLink || d.canFromLink(editor))) || null : null;
    const convert = () => {
      editor.popover.close();
      if (!link.isConnected || !editor.editable.contains(block)) return;
      editor.history.commit();
      link.remove();
      if (video) { this.create('video', block, { items: [{ url, embed: true }] }); return; }
      if (card) { card.fromLink(editor, block, url); return; }
      const target = this.create('image', block, { select: false });
      const src = safeMediaUrl(url);
      if (isExternal(src) && this.canFetch()) this.fetchUrl(target, src, null);
      else this.applyAssets(target, [{ url: src }], null);
    };
    // Switches/toggle s «Открывать в новой вкладке» — как в окне «Ссылка», меняет ссылку сразу (заказчик 17.11)
    const blank = h('input', { type: 'checkbox', role: 'switch', class: 'ted-ui-toggle__input' });
    blank.checked = link.getAttribute('target') === '_blank';
    blank.addEventListener('change', () => {
      if (!link.isConnected) return;
      editor.history.commit();
      if (blank.checked) { link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener'); }
      else { link.removeAttribute('target'); link.removeAttribute('rel'); }
      editor.afterChange({ immediate: true });
    });
    const blankRow = h('label', { class: 'ted-ui-toggle' }, [
      blank,
      h('span', { class: 'ted-ui-toggle__track', 'aria-hidden': 'true' }, [h('span', { class: 'ted-ui-toggle__knob' }, [icon('check')])]),
      h('span', { class: 'ted-ui-toggle__text', text: 'Открывать в новой вкладке' }),
    ]);
    // окно как «Якорь» и «Ссылка»: шапка с крестиком, «Встроить» (primary) и «Оставить ссылкой» (gray)
    const keep = () => editor.popover.close();
    const other = video || picture || card;
    const nodes = [
      h('div', { class: 'ted-ui-form__head' }, [
        h('p', { class: 'ted-ui-form__title', text: other ? 'Как показать ссылку?' : 'Ссылка' }),
        smallButton({ name: 'close', label: 'Закрыть', iconName: 'close-small', onClick: keep }),
      ]),
      blankRow,
      h('div', { class: 'ted-ui-form__footer' }, other ? [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: video ? 'Вставить видео' : picture ? 'Вставить изображение' : 'Встроить карточкой', onclick: convert }),
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--gray', text: 'Оставить ссылкой', onclick: keep }),
      ] : [
        h('button', { type: 'button', class: 'ted-ui-action ted-ui-action--primary', text: 'Готово', onclick: keep }),
      ]),
    ];
    const rect = link.getBoundingClientRect();
    editor.popover.open(nodes, { left: rect.left, right: rect.left + 56, top: rect.bottom, bottom: rect.bottom, width: 56, height: 0 }, { cls: 'ted-ui-pop--link ted-ui-pop--choice', anchorX: rect.left + 28 });
    return true;
  }

  dragOver(event) {
    const target = event.target.closest('.ted-ui-media');
    if (this.editor.options.mediaSource !== 'direct' || typeof this.editor.options.upload !== 'function' || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    target?.classList.add('is-drop-target');
  }

  dragLeave(event) {
    const target = event.target.closest('.ted-ui-media');
    if (target && !target.contains(event.relatedTarget)) target.classList.remove('is-drop-target');
  }

  drop(event) {
    const target = event.target.closest('.ted-ui-media');
    if (this.editor.options.mediaSource !== 'direct' || typeof this.editor.options.upload !== 'function') return;
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) { this.dropImageUrl(event, target); return; }
    event.preventDefault();
    if (target) {
      target.classList.remove('is-drop-target');
      const { kind, items } = this.state(target);
      this.receive(target, files, items.length && !mediaAcceptsMany(kind) ? 0 : null);
    } else {
      const images = this.filesFrom(event.dataTransfer);
      if (!images.length) return;
      const block = this.create(images.length > 1 ? 'gallery' : 'image', topBlockOf(this.editor.editable, event.target));
      this.receive(block, images);
    }
  }

}

/** Ссылка на картинку: адрес файла JPG, PNG, WEBP или GIF. */
const IMAGE_URL_RE = /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif)(?:[?#]\S*)?$/i;

/** Адрес с другого сайта (свои файлы — относительные или с этого же адреса). */
function isExternal(url) {
  if (!/^https?:\/\//i.test(url || '')) return false;
  try { return new URL(url).origin !== location.origin; } catch { return false; }
}

/** Имя в области загрузки: файл или последняя часть ссылки. */
function jobName(job) {
  if (job.file) return job.file.name;
  try { const u = new URL(job.url); return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname); } catch { return job.url || ''; }
}

function jobLabel(job) {
  if (job.file) return `${job.file.name} · ${fileSize(job.file.size)}`;
  try { return `${jobName(job)} · ${new URL(job.url).hostname}`; } catch { return jobName(job); }
}

function fileSize(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

function mediaAction(text, action, primary = false) {
  const button = h('button', { type: 'button', class: `ted-ui-action ted-ui-action--${primary ? 'primary' : 'gray'} ted-ui-media__action`, text });
  button.addEventListener('click', action);
  return button;
}

function setCaption(figure, value) {
  let caption = figure.querySelector(':scope > figcaption');
  if (!value) { caption?.remove(); return; }
  if (!caption) { caption = document.createElement('figcaption'); figure.appendChild(caption); }
  caption.textContent = value;
}

/** Что сказать пользователю после загрузки: сжато ли, во что превращено, сколько весит. */
function uploadReport(assets) {
  if (assets.length > 1) return { toast: `Загружено файлов: ${assets.length}`, info: '' };
  const a = assets[0];
  if (!a.size) return { toast: 'Файл загружен', info: '' };
  const kb = fileSize(a.size);
  const type = String(a.type || '').toUpperCase();
  const dims = a.width ? ` · ${a.width}×${a.height}` : '';
  const poster = a.poster ? ' · постер из первого кадра' : '';
  if (type === 'GIF') return { toast: `GIF сохранён без изменений${dims} · ${kb}`, info: `GIF${dims} · ${kb} · без изменений` };
  if (type === 'WEBP' && a.originalSize) {
    const saved = a.originalSize > a.size ? ` (было ${fileSize(a.originalSize)}, −${Math.round((1 - a.size / a.originalSize) * 100)}%)` : '';
    const text = `WebP${dims} · ${kb}${saved}`;
    return { toast: `Изображение: ${text}`, info: text };
  }
  if (a.converted) return { toast: `Видео сконвертировано в ${type} · ${kb} (было ${fileSize(a.originalSize)})`, info: `${type} · ${kb}${poster}` };
  return { toast: `Загружено · ${type} · ${kb}`, info: `${type} · ${kb}${poster}` };
}

/** Фото, открытое заново: к типу добавляются размеры (из разметки или из самой картинки) и вес (HEAD-запрос к своему серверу). */
const savedSizes = new Map();
async function savedImageDetails(line, type, item, img) {
  const dims = item.width && item.height ? { w: item.width, h: item.height }
    : await new Promise((resolve) => {
      const read = () => resolve(img?.naturalWidth ? { w: img.naturalWidth, h: img.naturalHeight } : null);
      if (!img || img.complete) read(); else { img.addEventListener('load', read, { once: true }); img.addEventListener('error', read, { once: true }); }
    });
  let size = 0;
  try {
    const url = new URL(item.url, line.ownerDocument.baseURI);
    if (url.origin === line.ownerDocument.defaultView?.location.origin) {
      if (!savedSizes.has(url.href)) savedSizes.set(url.href, fetch(url.href, { method: 'HEAD', credentials: 'same-origin' }).then((r) => (r.ok ? Number(r.headers.get('content-length')) || 0 : 0)).catch(() => 0));
      size = await savedSizes.get(url.href);
    }
  } catch { /* адрес не разобрать — без веса */ }
  if (!line.isConnected) return;
  line.textContent = [type, dims ? `${dims.w}×${dims.h}` : '', size ? fileSize(size) : ''].filter(Boolean).join(' · ');
}

/** Для блоков, открытых заново: что видно по адресу файла. */
function savedInfo(kind, item) {
  if (!item?.url) return '';
  const ext = /\.([a-z0-9]{2,5})(?:\?.*)?$/i.exec(item.url)?.[1]?.toUpperCase();
  if (kind === 'image' && ext === 'WEBP') return 'WebP';
  if (kind === 'image' && ext === 'GIF') return 'GIF';
  if (kind === 'video' && item.poster) return 'Постер задан: видео грузится по нажатию на плей';
  return '';
}
