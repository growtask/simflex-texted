// Блок «iFrame» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из src/site/blocks.js.

/** Высота фрейма блока «iFrame» из атрибута height, если браузер не умеет attr() в CSS: сброс сайта (iframe{height:auto}) сильнее атрибута. */
function siteFrameHeight(root) {
  if (window.CSS && CSS.supports && CSS.supports('height', 'attr(height px)')) return;
  for (const frame of root.querySelectorAll('.ted-iframe > iframe[height]')) {
    const h = parseInt(frame.getAttribute('height'), 10);
    if (h > 0 && h < 100000) frame.style.height = h + 'px';
  }
}

siteBlock(siteFrameHeight);
