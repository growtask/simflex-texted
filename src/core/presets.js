// Наборы (пресеты) — этап 2 MODULAR_PLAN.md. Набор = какие блоки доступны + как открывается редактор.
//
//   blocks — 'all' или список видов блоков ('p', 'h2', 'ul', 'image'…); абзац разрешён всегда;
//   mode   — 'edit' (сразу правка), 'view' (просмотр, «Редактировать» включает правку на той же странице),
//            'readonly' (только просмотр, правки нет).
//
// Набор поля задаёт СЕРВЕР CMS: TedConfig::clientJson($preset, $canEdit) → Ted.init({ server }). Он же очищает
// сохранённый HTML по набору (php/presets.php) — браузеру в этом не доверяем. Опция preset в браузере — для страниц без PHP.
// Свои наборы: ted.config.php → 'presets' (сервер передаёт их в браузер сам) или Ted.definePreset(name, { blocks, mode }).

import { registeredBlocks, blockDef } from './registry.js';

/* presets:begin — тот же список в php/presets.php (TedPresets::BASE), тест php/test-presets.php сравнивает */
export const PRESETS = {
  "full": { "blocks": "all", "mode": "edit" },
  "mini": { "blocks": ["p", "h2", "h3", "h4", "ul", "ol", "blockquote", "image"], "mode": "edit" },
  "text": { "blocks": ["p", "ul", "ol"], "mode": "edit" },
  "readonly": { "blocks": "all", "mode": "readonly" },
  "docs": { "blocks": "all", "mode": "view" }
};
/* presets:end */

/* types:begin — виды блоков для наборов; тот же список в php/presets.php (TedPresets::TYPES) */
export const PRESET_TYPES = [];
/* types:end */
// Список пуст: все виды — из реестра блоков (blocks/<тип>/block.json), этап 5.
// Блоки из реестра (этап 5, blocks/<тип>/block.json) добавляются к списку сами: presetTypes(), presetAlias().

/** Другие имена видов (как в опции blocks): quote → blockquote, code → pre, separator → hr, bg / color → background. */
export const PRESET_ALIASES = {};

/** Все виды блоков наборов: ядро + реестр. */
export function presetTypes() { return [...PRESET_TYPES, ...registeredBlocks().map((d) => d.type)]; }

/** Вид по другому имени: quote → blockquote, separator → hr (block.json → aliases). */
export function presetAlias(t) {
  if (PRESET_ALIASES[t]) return PRESET_ALIASES[t];
  const d = blockDef(t);
  return d ? d.type : t;
}
const MODES = ['edit', 'view', 'readonly'];
const NAME = /^[a-z][a-z0-9_-]{0,31}$/;

/** Свои наборы, заданные в браузере (Ted.definePreset). */
const defined = {};

/**
 * Проверить описание набора; вернуть { blocks: 'all' | [виды], mode }. Ошибка — исключение с понятным текстом
 * (те же правила, что у ted.config.php → presets).
 */
export function checkPreset(name, def) {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error(`Набор «${name}»: имя — латиница, цифры, «-» и «_», начинается с буквы`);
  if (!def || typeof def !== 'object' || Array.isArray(def)) throw new Error(`Набор «${name}»: нужно описание { blocks, mode }`);
  const extra = Object.keys(def).filter((k) => k !== 'blocks' && k !== 'mode');
  if (extra.length) throw new Error(`Набор «${name}»: неизвестный ключ «${extra[0]}». Допустимы: blocks, mode`);
  const mode = def.mode === undefined ? 'edit' : def.mode;
  if (!MODES.includes(mode)) throw new Error(`Набор «${name}»: mode — ${MODES.join(', ')}`);
  let blocks = def.blocks === undefined ? 'all' : def.blocks;
  if (blocks !== 'all') {
    if (!Array.isArray(blocks) || !blocks.length) throw new Error(`Набор «${name}»: blocks — 'all' или список видов блоков`);
    const out = [];
    for (const t of blocks) {
      const type = typeof t === 'string' ? presetAlias(t) : t;
      if (!presetTypes().includes(type)) throw new Error(`Набор «${name}»: неизвестный блок «${t}». Допустимы: ${presetTypes().join(', ')}`);
      if (!out.includes(type)) out.push(type);
    }
    blocks = out;
  }
  return { blocks, mode };
}

/** Ted.definePreset(name, { blocks, mode }): свой набор в браузере. Базовые наборы не переопределяются. */
export function definePreset(name, def) {
  if (Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new Error(`Набор «${name}» — базовый, его нельзя переопределить; дайте своему набору другое имя`);
  defined[name] = checkPreset(name, def);
  return defined[name];
}

/** Описание набора по имени: базовые → с сервера (ted.config.php) → заданные в браузере. Нет такого — null. */
export function presetOf(name, serverPresets = null) {
  if (typeof name !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(PRESETS, name)) return PRESETS[name];
  if (serverPresets && Object.prototype.hasOwnProperty.call(serverPresets, name)) return serverPresets[name];
  if (Object.prototype.hasOwnProperty.call(defined, name)) return defined[name];
  return null;
}

/** Имена всех известных наборов. */
export function presetNames(serverPresets = null) {
  return [...new Set([...Object.keys(PRESETS), ...Object.keys(serverPresets || {}), ...Object.keys(defined)])];
}
