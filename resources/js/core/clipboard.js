// Копирование в буфер обмена (1.0.4). Без https (и не на localhost) браузер не даёт Clipboard API — копируем запасным
// способом сразу, пока идёт нажатие (после await браузер его уже не разрешает). На https — Clipboard API, при отказе — запасной.
// Тот же порядок — у кнопки «Копировать код» на сайте (blocks/pre/pre.site.js).

/** Запасной способ: скрытое поле + execCommand('copy'); фокус возвращается туда, где был. */
function legacyCopy(text) {
  const active = document.activeElement;
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(field);
  field.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  field.remove();
  if (active && active.focus) active.focus({ preventScroll: true });
  return ok;
}

/** Скопировать текст; Promise<boolean> — получилось ли. */
export function copyText(text) {
  const api = window.isSecureContext && navigator.clipboard && navigator.clipboard.writeText;
  if (!api) return Promise.resolve(legacyCopy(text));
  return navigator.clipboard.writeText(text).then(() => true, () => legacyCopy(text));
}
