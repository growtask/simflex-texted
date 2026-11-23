// Блок «Код» на сайте: в шапке справа кнопка «Копировать код» (как в редакторе). Собирается в content.js
// (build.json → content → @blocks.content); siteBlock — из src/site/blocks.js.

const SITE_COPY_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H3.5A1.5 1.5 0 0 0 2 3v5.5A1.5 1.5 0 0 0 3.5 10H4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const SITE_CHECK_ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

async function siteCopyText(doc, text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* нет доступа к буферу (http, старый браузер) — пробуем запасной способ */ }
  try {
    const field = doc.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    doc.body.appendChild(field);
    field.select();
    const ok = doc.execCommand('copy');
    field.remove();
    return ok;
  } catch { return false; }
}

function siteCodeCopy(root) {
  for (const pre of root.querySelectorAll('pre')) {
    const code = pre.querySelector(':scope > code');
    if (!code || pre.querySelector(':scope > .ted-code-copy')) continue;
    const doc = pre.ownerDocument;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'ted-code-copy';
    button.setAttribute('aria-label', 'Копировать код');
    button.title = 'Копировать код';
    button.innerHTML = SITE_COPY_ICON;
    let timer = 0;
    button.addEventListener('click', async () => {
      const ok = await siteCopyText(doc, code.textContent);
      clearTimeout(timer);
      button.classList.toggle('is-copied', ok);
      button.classList.toggle('is-failed', !ok);
      button.innerHTML = ok ? SITE_CHECK_ICON : SITE_COPY_ICON;
      button.setAttribute('aria-label', ok ? 'Код скопирован' : 'Не удалось скопировать код');
      timer = setTimeout(() => { button.classList.remove('is-copied', 'is-failed'); button.innerHTML = SITE_COPY_ICON; button.setAttribute('aria-label', 'Копировать код'); }, 1600);
    });
    pre.prepend(button);
  }
}

siteBlock(siteCodeCopy);
