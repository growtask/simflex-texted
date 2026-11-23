// Горячие клавиши. Сравниваем по физической клавише (event.code), поэтому
// сочетания работают и в русской раскладке (Ctrl+B = Ctrl+И).
// Mod = Ctrl на Windows/Linux, ⌘ на macOS.

export const HOTKEYS = [
  // Строчное форматирование
  { cmd: 'bold', code: 'Mod+KeyB', keys: 'Mod+B', label: 'Жирный' },
  { cmd: 'italic', code: 'Mod+KeyI', keys: 'Mod+I', label: 'Курсив' },
  { cmd: 'underline', code: 'Mod+KeyU', keys: 'Mod+U', label: 'Подчёркнутый' },
  { cmd: 'strike', code: 'Mod+Shift+KeyS', keys: 'Mod+Shift+S', label: 'Зачёркнутый' },
  { cmd: 'code', code: 'Mod+KeyE', keys: 'Mod+E', label: 'Код в строке' },
  { cmd: 'link', code: 'Mod+KeyK', keys: 'Mod+K', label: 'Ссылка' },

  // Типы блоков
  // (заголовки, списки, цитата — из block.json своих блоков, после «Ссылки»)

  // Выравнивание
  { cmd: 'align:left', code: 'Mod+Shift+KeyL', keys: 'Mod+Shift+L', label: 'По левому краю' },
  { cmd: 'align:center', code: 'Mod+Shift+KeyE', keys: 'Mod+Shift+E', label: 'По центру' },
  { cmd: 'align:right', code: 'Mod+Shift+KeyR', keys: 'Mod+Shift+R', label: 'По правому краю' },

  // Правка
  { cmd: 'undo', code: 'Mod+KeyZ', keys: 'Mod+Z', label: 'Отменить' },
  { cmd: 'redo', code: 'Mod+Shift+KeyZ', keys: 'Mod+Shift+Z', label: 'Повторить' },
  { cmd: 'redo', code: 'Mod+KeyY', keys: 'Mod+Y', label: 'Повторить', hidden: true },

  // Редактор
  { cmd: 'mode', code: 'Mod+Shift+KeyP', keys: 'Mod+Shift+P', label: 'Просмотр / редактирование' },
  { cmd: 'save', code: 'Mod+KeyS', keys: 'Mod+S', label: 'Сохранить' },
  { cmd: 'help', code: 'Mod+Slash', keys: 'Mod+/', label: 'Горячие клавиши' },
  // работа с блоками без мыши (доступность, 22.11): меню блока и перенос вверх / вниз
  { cmd: 'blockmenu', code: 'Mod+Period', keys: 'Mod+.', label: 'Меню блока' },
  { cmd: 'moveup', code: 'Mod+Shift+ArrowUp', keys: 'Mod+Shift+↑', label: 'Блок выше' },
  { cmd: 'movedown', code: 'Mod+Shift+ArrowDown', keys: 'Mod+Shift+↓', label: 'Блок ниже' },
];

const KEYS_IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export function eventCombo(e) {
  const mod = KEYS_IS_MAC ? e.metaKey : e.ctrlKey;
  if (!mod) return '';
  // Ctrl+Alt на Windows — это AltGr, его не трогаем
  if (e.altKey) return '';
  return `Mod+${e.shiftKey ? 'Shift+' : ''}${e.code}`;
}

export function findHotkey(e) {
  const combo = eventCombo(e);
  if (!combo) return null;
  return HOTKEYS.find((k) => k.code === combo) || null;
}

export function keysFor(cmd) {
  const k = HOTKEYS.find((x) => x.cmd === cmd && !x.hidden);
  return k ? k.keys : '';
}
