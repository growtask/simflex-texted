// Кнопка «Смотреть на YouTube» (Buttons/main secondary s) под плеером площадки: если автор запретил встраивание,
// читатель всё равно может открыть видео на самой площадке. Ставят content.js на сайте и редактор под превью; в сохранённом HTML её нет.
export function videoSourceLabel(href) {
  let host = '';
  try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { return ''; }
  if (/^(m\.)?youtube(-nocookie)?\.com$|^youtu\.be$/.test(host)) return 'Смотреть на YouTube';
  if (host === 'rutube.ru') return 'Смотреть на RuTube';
  if (host === 'vkvideo.ru' || host === 'vk.com') return 'Смотреть в VK Видео';
  return '';
}

export function videoSourceButton(doc, href) {
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
