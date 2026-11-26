// Настройки с сервера (этап 1 MODULAR_PLAN.md): то, что браузеру нужно знать из ted.config.php.
// CMS передаёт их в Ted.init({ server: <?= Config::load()->getClientJson() ?> }). Пути на диске, ffmpeg и ключи сюда не попадают.
//   filesUrl    — адрес папки файлов ('/uf' или 'https://cdn…/uf'): по нему редактор узнаёт свои файлы (удаление после сохранения)
//   limits      — наибольший размер файла по видам, байт: слишком большой файл не отправляется на сервер
//   opengraph   — false: карточки по ссылке выключены на сервере (опция opengraph не используется)
//   iframeHosts — сайты для блока «iFrame»: null — любой https, список — только эти (сервер проверяет то же самое)
//   preset      — набор поля ('full', 'mini', 'text', 'readonly', 'docs' или свой): его задаёт сервер по настройке поля (этап 2)
//   presets     — свои наборы из ted.config.php → presets: { имя: { blocks, mode } }
//   canEdit     — false: у пользователя нет права правки — только просмотр, кнопки «Редактировать» нет

import { PRESETS, checkPreset, presetOf } from './presets.js';
import { t, num } from './i18n.js';

const KINDS = ['image', 'video', 'audio', 'file'];
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** Проверенные настройки сервера; неверное значение заменяется значением по умолчанию (как до этапа 1). */
export function serverOptions(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const url = typeof s.filesUrl === 'string' ? s.filesUrl.trim().replace(/\/+$/, '') : '';
  const filesUrl = /^(?:\/(?!\/)[^\s?#]*|https?:\/\/[^\s/?#@]+(?:\/[^\s?#]*)?)$/i.test(url) ? url : '/uf';
  const limits = {};
  for (const kind of KINDS) {
    const n = s.limits && Number(s.limits[kind]);
    if (Number.isFinite(n) && n > 0) limits[kind] = n;
  }
  const hosts = Array.isArray(s.iframeHosts)
    ? [...new Set(s.iframeHosts.filter((x) => typeof x === 'string' && HOST.test(x)).map((x) => x.toLowerCase()))]
    : null;
  // этап 2: набор поля, свои наборы из ted.config.php и право на правку — тоже решает сервер
  const presets = {};
  if (s.presets && typeof s.presets === 'object' && !Array.isArray(s.presets)) {
    for (const [name, def] of Object.entries(s.presets)) {
      if (Object.prototype.hasOwnProperty.call(PRESETS, name)) continue;   // базовые наборы не переопределяются
      try { presets[name] = checkPreset(name, def); } catch (e) { /* неверное описание пропускаем: сервер его не пропустил бы */ }
    }
  }
  const preset = typeof s.preset === 'string' && presetOf(s.preset, presets) ? s.preset : null;
  return { filesUrl, limits, opengraph: s.opengraph !== false, iframeHosts: hosts, preset, presets, canEdit: s.canEdit !== false };
}

/** Размер для сообщения: «5 МБ», «2,5 МБ». */
export function formatLimit(bytes) {
  const mb = bytes / 1048576;
  return `${num(Math.round(mb * 10) / 10)} ${t('МБ')}`;
}
