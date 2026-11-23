// Медиа на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из src/site/blocks.js.
// Плеер (audio-player.js), имена файлов (file-names.js) и кнопка «Смотреть на …» (video-link.js) — те же, что в редакторе.

const SITE_VIDEO_HOSTS = ['www.youtube-nocookie.com', 'rutube.ru', 'vkvideo.ru'];

// Ссылка на видео площадки становится её плеером (с её постером) сразу; браузер сам грузит его, когда он приближается к экрану (loading=lazy)
function siteEmbed(link) {
  let url;
  try { url = new URL(link.dataset.tedVideo); } catch { return; }
  if (url.protocol !== 'https:' || !SITE_VIDEO_HOSTS.includes(url.hostname) || url.username || url.password || url.port) return;
  const frame = link.ownerDocument.createElement('iframe');
  frame.title = link.textContent.trim() || 'Видеоплеер';
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
