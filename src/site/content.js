// Публичное поведение блоков на сайте: каждый блок подключает своё (blocks/<тип>/<тип>.site.js → siteBlock),
// здесь — запуск. Без зависимостей, подключается с defer.

/**
 * Корни для автоматического запуска: статьи .ted-content страницы, но не редактор (.ted-ui) — у правки свои кнопки и плеер,
 * иначе в редакторе появлялся второй аудиоплеер сайта (проверка 22.11). Статья без обёртки .ted-content — вся страница.
 */
function siteRoots() {
  const all = Array.from(document.querySelectorAll('.ted-content'));
  if (!all.length) return [document];
  return all.filter((el) => !el.closest('.ted-ui') && !(el.parentElement && el.parentElement.closest('.ted-content')));
}

/** embed: false — видео площадок остаются ссылками (просмотр в редакторе). */
function siteMount(root = null, { embed = true } = {}) {
  for (const r of root ? [root] : siteRoots()) {
    for (const fn of SITE_BLOCKS) fn(r, { embed });   // поведение блоков из папок (blocks/<тип>/<тип>.site.js)
  }
}

window.TedContent = { mount: siteMount };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => siteMount(), { once: true });
else siteMount();
