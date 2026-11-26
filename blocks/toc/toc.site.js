// Блок «Содержание» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из resources/js/site/blocks.js.

/** Содержание: список свёрнут («Показать» / «Скрыть»); полоса прогресса чтения идёт за читателем — прилипает к верху области статьи (окна или прокручиваемой колонки) с отступом 8 px, пока статья не дочитана. */
function siteToc(root) {
  for (const toc of root.querySelectorAll('.ted-toc:not([data-ted-toc])')) {
    toc.setAttribute('data-ted-toc', '');
    const panel = toc.querySelector('.ted-toc__panel');
    const list = toc.querySelector('.ted-toc__list');
    if (panel && list && list.children.length) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ted-toc__toggle';
      const set = (open) => { toc.toggleAttribute('data-ted-collapsed', !open); btn.textContent = open ? siteText(toc, 'Скрыть', 'Hide') : siteText(toc, 'Показать', 'Show'); btn.setAttribute('aria-expanded', String(open)); };
      // плавно — только по нажатию (data-ted-anim): при загрузке свёрнутый список не «схлопывается» на глазах
      btn.addEventListener('click', () => { toc.setAttribute('data-ted-anim', ''); set(toc.hasAttribute('data-ted-collapsed')); });
      panel.appendChild(btn);
      set(false);
    }
    const progress = toc.querySelector('.ted-toc__progress');
    const bar = toc.querySelector('.ted-toc__bar');
    if (!progress || !bar) continue;
    const article = toc.closest('.ted-content') || document.body;
    // область, где прокручивается статья: окно или ближайший прокручиваемый родитель (предпросмотр «Как выглядит на сайте», колонка CMS)
    let scroller = null;
    for (let n = article.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n).overflowY;
      if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight) { scroller = n; break; }
    }
    const GAP = 8;   // полоса — вверху области статьи, с отступом 8 px от её края (и ниже липкой шапки сайта: --ted-sticky-top)
    const sticky = () => parseFloat(getComputedStyle(article).getPropertyValue('--ted-sticky-top')) || 0;
    let frame = 0;
    const update = () => {
      frame = 0;
      const view = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      const a = article.getBoundingClientRect();
      const top = a.top - view.top;
      const total = a.height - view.height;
      const p = total > 0 ? Math.min(1, Math.max(0, -top / total)) : (a.bottom <= view.top + view.height ? 1 : 0);
      bar.style.width = (p * 100).toFixed(2) + '%';
      const t = toc.getBoundingClientRect();
      const edge = view.top + sticky() + GAP;
      const stuck = t.top < edge && a.bottom > edge;
      if (stuck) { progress.style.top = (Math.max(0, view.top) + sticky() + GAP) + 'px'; progress.style.left = t.left + 'px'; progress.style.width = t.width + 'px'; }
      else { progress.style.top = ''; progress.style.left = ''; progress.style.width = ''; }
      toc.toggleAttribute('data-ted-stuck', stuck);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    (scroller || window).addEventListener('scroll', schedule, { passive: true });
    if (scroller) window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  }
}

siteBlock(siteToc);
