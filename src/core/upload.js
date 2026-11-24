// Прямая загрузка: XHR даёт реальный прогресс отправки и поддерживает отмену.
export function createUpload(endpoint, { headers = {} } = {}) {
  // maxSide — картинку уменьшить до этой стороны (товар: размер карточки с запасом для ретины, 22.11); сервер ограничивает 160…2560
  const upload = (file, { kind, pagePath, signal, onProgress, maxSide } = {}) => new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abortError = () => new DOMException('Загрузка отменена', 'AbortError');
    if (signal?.aborted) { reject(abortError()); return; }

    request.open('POST', endpoint);
    request.responseType = 'json';
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.addEventListener('progress', (event) => {
      if (onProgress) onProgress(event.lengthComputable ? event.loaded / event.total : null);
    });
    request.addEventListener('load', () => {
      const response = request.response;
      if (request.status >= 200 && request.status < 300 && response?.url) resolve(response);
      else {
        const err = new Error(response?.error || 'Не удалось загрузить файл');
        err.status = request.status;   // 4xx (формат, размер) — повтор того же файла не поможет (проверка 22.11)
        reject(err);
      }
    });
    request.addEventListener('error', () => reject(new Error('Не удалось загрузить файл')));
    request.addEventListener('abort', () => reject(abortError()));
    const abort = () => request.abort();
    request.addEventListener('loadend', () => signal?.removeEventListener('abort', abort));
    signal?.addEventListener('abort', abort, { once: true });

    const body = new FormData();
    body.append('file', file);
    body.append('kind', kind || 'file');
    if (pagePath) body.append('pagePath', pagePath);
    if (maxSide) body.append('maxSide', String(Math.round(maxSide)));
    try { request.send(body); }
    catch (error) {
      signal?.removeEventListener('abort', abort);
      reject(error);
    }
  });
  // Удаление файлов с сервера после сохранения документа (тот же маршрут, action=delete)
  upload.remove = (urls, { pagePath } = {}) => {
    const body = new FormData();
    body.append('action', 'delete');
    body.append('urls', JSON.stringify(urls));
    if (pagePath) body.append('pagePath', pagePath);
    return fetch(endpoint, { method: 'POST', headers, body }).then((response) => {
      if (!response.ok) throw new Error('Не удалось удалить файлы');
      return response.json();
    });
  };
  // Картинка по ссылке: сервер скачивает и сжимает её сам (тот же маршрут, action=fetch) — чужой адрес в статье не остаётся
  upload.fromUrl = (url, { pagePath, signal } = {}) => {
    const body = new FormData();
    body.append('action', 'fetch');
    body.append('url', url);
    body.append('kind', 'image');
    if (pagePath) body.append('pagePath', pagePath);
    return fetch(endpoint, { method: 'POST', headers, body, signal }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Не удалось загрузить картинку');
      return data;
    });
  };
  return upload;
}

/** Первый кадр видеофайла как WebP-постер (null, если браузер не умеет этот формат). */
export function videoPoster(file, maxWidth = 1280) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (blob) => { URL.revokeObjectURL(url); video.removeAttribute('src'); video.load(); resolve(blob); };
    const timer = setTimeout(() => done(null), 8000);
    video.muted = true; video.preload = 'auto'; video.playsInline = true;
    video.addEventListener('error', () => { clearTimeout(timer); done(null); }, { once: true });
    video.addEventListener('loadeddata', () => { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); }, { once: true });
    video.addEventListener('seeked', () => {
      clearTimeout(timer);
      const scale = Math.min(1, maxWidth / (video.videoWidth || maxWidth));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); canvas.toBlob((blob) => done(blob), 'image/webp', 0.82); }
      catch { done(null); }
    }, { once: true });
    video.src = url;
  });
}

export function mediaPagePath(editor) {
  const { mediaPageUrl, pageUrl } = editor.options;
  if (mediaPageUrl) return new URL(mediaPageUrl, location.href).pathname;
  const value = typeof pageUrl === 'string' ? pageUrl : null;
  return new URL(value || location.href, location.href).pathname;
}

export const MEDIA_ACCEPT = {
  image: 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',
  video: 'video/*,.mp4,.webm,.mov,.avi,.mkv,.m4v,.wmv,.flv,.mpg,.mpeg,.3gp',
  audio: 'audio/mpeg,audio/wav,.mp3,.wav',
  file: '.pdf,.docx,.xlsx,.zip',
};

/** Расширения, которые принимает блок (выбор из библиотеки CMS): файл другого вида не вставляется. «Файл» — любой документ. */
export const MEDIA_EXT = {
  image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  video: ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', '3gp'],
  audio: ['mp3', 'wav'],
  file: null,
};
const MEDIA_WRONG = { image: 'не изображение', video: 'не видео', audio: 'не аудио', file: 'не подходит' };
const extOf = (url) => (String(url).split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';

/**
 * Прямая загрузка и библиотека CMS вместе: загрузка настроена (upload) и передан pickFile — в зоне загрузки
 * есть ссылка «Из библиотеки» (Uploader/drop, library=true; заказчик 23.11).
 */
export function canPickLibrary(editor) {
  const { mediaSource, pickFile, upload } = editor.options;
  return mediaSource === 'direct' && typeof upload === 'function' && typeof pickFile === 'function';
}

/**
 * Returns selected File objects in direct mode or asset descriptors in manager mode.
 * source: 'manager' — выбор из библиотеки и при прямой загрузке (ссылка «Из библиотеки» в зоне).
 */
export async function chooseMedia(editor, kind, { multiple = false, source = null } = {}) {
  if (!Object.hasOwn(MEDIA_ACCEPT, kind)) throw new TypeError('Неизвестный тип медиа');
  const { mediaSource, pickFile, upload } = editor.options;
  if ((source || mediaSource) === 'manager') {
    if (typeof pickFile !== 'function') throw new Error('Файловый менеджер не настроен');
    // окна редактора закрываем: окно менеджера — поверх всего (22.11)
    editor.popover?.close();
    editor.subPopover?.close();
    // каждый вызов — свой номер: окно, закрытое без выбора, может так и не ответить; его поздний ответ не применяется
    const token = (editor.pickToken = (editor.pickToken || 0) + 1);
    const extensions = MEDIA_EXT[kind] || null;
    const selected = await pickFile({ kind, multiple, accept: MEDIA_ACCEPT[kind], extensions, pagePath: mediaPagePath(editor), editor });
    if (token !== editor.pickToken) return { source: 'manager', assets: [] };
    const all = [].concat(selected || []).filter(Boolean);
    // фильтр по виду: менеджер может отдать pdf в «Изображение» — такой файл пропускаем с сообщением
    const fits = (a) => !extensions || extensions.includes(extOf(a.url || a.name || ''));
    const assets = all.filter(fits);
    const wrong = all.filter((a) => !fits(a));
    if (wrong.length) editor.toast(`${wrong.map((a) => decodeURIComponent((a.name || a.url || '').split('/').pop())).join(', ')} — ${MEDIA_WRONG[kind]}, пропущено`, { status: 'error' });
    return { source: 'manager', assets: multiple ? assets : assets.slice(0, 1) };
  }
  if (typeof upload !== 'function') throw new Error('Прямая загрузка не настроена');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = MEDIA_ACCEPT[kind];
  input.multiple = multiple;
  const assets = await new Promise((resolve) => {
    input.addEventListener('change', () => resolve([...input.files]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
  return { source: 'direct', assets };
}

/** Карточка ссылки для блока «Встраивание»: страницу читает сервер CMS (src/OpenGraph.php), ответ — { url, title, text, image, site }. */
export function createOpenGraph(endpoint, { headers = {} } = {}) {
  return async (url) => {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ url }) });
    let data = null;
    try { data = await response.json(); } catch (e) { data = null; }
    if (!response.ok || !data || data.error) throw new Error((data && data.error) || 'Не удалось получить карточку');
    return data;
  };
}
