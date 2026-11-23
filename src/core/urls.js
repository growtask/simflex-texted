// Ссылки и адреса — одно правило для всего редактора (этап 3 MODULAR_PLAN.md, «Безопасность»).
// Тот же код на сервере: php/sanitize.php → TedSanitizer::urlOk. Общие примеры — tests/security/url-vectors.json
// (их проверяют оба теста: набор security в tests/run.html и php/test-sanitize.php).
//
// Разрешено:
//   https:, http:                      — везде;
//   mailto:, tel:                      — только в ссылках (href);
//   data:image/png|jpeg|gif|webp|avif|bmp — только в src картинки (растровые картинки старых статей, решение 21.11);
//   без схемы: «/путь», «#якорь», «?запрос», «страница.html», «../папка/», «//сайт/путь» (решение 21.11).
// Всё остальное — javascript:, vbscript:, data: (в ссылке, SVG, HTML), file:, blob:, about:, любые другие схемы — нет.
// Схема определяется так же, как её видит браузер: пробелы, переводы строк, табуляция, невидимые знаки и
// управляющие символы внутри схемы игнорируются, регистр не важен; HTML-сущности (&#106;) раскрывает разбор HTML
// до проверки. Для подстраховки опасная схема ищется и после раскодирования %XX (%6Aavascript:).

export const URL_KINDS = ['link', 'media', 'image'];
const IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp)[;,]/;
const DANGER = /^(?:javascript|vbscript|livescript|mocha|data|file|blob|about|filesystem|jar|view-source|ms-[a-z-]+):/;
// пробелы, управляющие и невидимые знаки, которые браузер выбрасывает или которыми прячут схему
const HIDDEN = /[\u0000-\u0020\u007f-\u00a0\u00ad\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f-\u2064\u3000\ufeff\ufffd]/g;

/** Строка без невидимых знаков, в нижнем регистре: так её схему видит браузер. */
function bare(value) {
  return String(value).replace(HIDDEN, '').toLowerCase();
}

/**
 * Адрес допустим? kind: 'link' — href ссылки (ещё mailto:, tel:); 'media' — src видео, аудио, фрейма, постер, адрес карточки;
 * 'image' — src картинки (ещё растровая data:image).
 */
export function urlOk(value, kind = 'link') {
  if (typeof value !== 'string') return false;
  const v = bare(value);
  if (!v) return false;
  let decoded = v;
  try { decoded = decodeURIComponent(v); } catch (e) { decoded = v.replace(/%[0-9a-f]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(1), 16))); }
  decoded = bare(decoded);
  if (kind === 'image' && IMAGE_DATA.test(v)) return true;
  if (DANGER.test(v) || DANGER.test(decoded)) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(v);
  if (!scheme) return true;   // без схемы: путь на сайте, якорь, запрос, «//сайт»
  if (scheme[1] === 'http' || scheme[1] === 'https') return true;
  return kind === 'link' && (scheme[1] === 'mailto' || scheme[1] === 'tel');
}

/** srcset: каждый адрес — по правилу картинки. */
export function srcsetOk(value) {
  return typeof value === 'string' && value.split(',').every((part) => {
    const url = part.trim().split(/\s+/)[0] || '';
    return !!url && urlOk(url, 'image');
  });
}
