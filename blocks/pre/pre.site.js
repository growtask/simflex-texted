// Блок «Код» на сайте: в шапке справа кнопка «Копировать код» (как в редакторе). Собирается в content.js
// (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

const SITE_COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const SITE_CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * Копирование в буфер. Без https (и не на localhost) браузер не даёт Clipboard API — сразу запасной способ, пока ещё
 * идёт нажатие (после await браузер его уже не разрешает). На https — Clipboard API, при отказе — запасной (1.0.4)
 */
function siteCopyText(doc, text) {
  const legacy = () => {
    try {
      const field = doc.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      const active = doc.activeElement;
      doc.body.appendChild(field);
      field.select();
      const ok = doc.execCommand('copy');
      field.remove();
      if (active && active.focus) active.focus({ preventScroll: true });
      return ok;
    } catch { return false; }
  };
  const win = doc.defaultView || window;
  const api = win.isSecureContext && win.navigator.clipboard && win.navigator.clipboard.writeText;
  if (!api) return Promise.resolve(legacy());
  return win.navigator.clipboard.writeText(text).then(() => true, () => legacy());
}

function siteCodeCopy(root) {
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector(':scope > code');
    if (!code || pre.querySelector(':scope > .ted-code-copy')) continue;
    const doc = pre.ownerDocument;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ted-code-copy';
    button.setAttribute('aria-label', siteText(pre, 'Копировать код', 'Copy code'));
    button.title = siteText(pre, 'Копировать код', 'Copy code');
    button.innerHTML = SITE_COPY_ICON;
    let timer = 0;
    button.addEventListener('click', async () => {
      const ok = await siteCopyText(doc, code.textContent);
      clearTimeout(timer);
      button.classList.toggle('is-copied', ok);
      button.classList.toggle('is-failed', !ok);
      button.innerHTML = ok ? SITE_CHECK_ICON : SITE_COPY_ICON;
      button.setAttribute('aria-label', ok ? siteText(pre, 'Код скопирован', 'Code copied') : siteText(pre, 'Не удалось скопировать код', 'Could not copy the code'));
      // как в редакторе: тост «Код скопирован» / «Не удалось скопировать код»
      siteToast(pre, ok ? siteText(pre, 'Код скопирован', 'Code copied') : siteText(pre, 'Не удалось скопировать код', 'Could not copy the code'), ok ? '' : 'error');
      timer = setTimeout(() => { button.classList.remove('is-copied', 'is-failed'); button.innerHTML = SITE_COPY_ICON; button.setAttribute('aria-label', siteText(pre, 'Копировать код', 'Copy code')); }, 1600);
    });
    pre.prepend(button);
  }
}

siteBlock(siteCodeCopy);
