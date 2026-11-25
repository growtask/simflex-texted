// Блок «Таблица» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Таблица шире колонки — data-ted-scroll: 12 до полосы прокрутки, как в редакторе. */
function siteTableScroll(root) {
  const wraps = Array.from(root.querySelectorAll('.ted-table__wrap'));
  if (!wraps.length) return;
  const check = () => { for (const w of wraps) w.toggleAttribute('data-ted-scroll', w.scrollWidth > w.clientWidth + 1); };
  check();
  if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(check); wraps.forEach((w) => ro.observe(w)); }
  else window.addEventListener('resize', check);
}

siteBlock(siteTableScroll);
