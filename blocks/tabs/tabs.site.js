// Блок «Вкладки» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из src/site/blocks.js.

let tabsUid = 0;
let tabsSpring = '';
/** Пружина с лёгким перелётом (~5 %, как glide в UI-ките rpm) в виде linear(); без поддержки — ease-out. */
function tabsSpringEasing() {
  if (tabsSpring) return tabsSpring;
  const zeta = 0.68, omega = 6.9 / zeta, wd = omega * Math.sqrt(1 - zeta * zeta), pts = [];
  for (let i = 0; i <= 48; i++) {
    const u = i / 48;
    pts.push(i === 48 ? 1 : +(1 - Math.exp(-zeta * omega * u) * (Math.cos(wd * u) + (zeta * omega / wd) * Math.sin(wd * u))).toFixed(4));
  }
  const value = 'linear(' + pts.join(', ') + ')';
  tabsSpring = window.CSS && CSS.supports && CSS.supports('transition-timing-function', value) ? value : 'cubic-bezier(0.2, 0, 0, 1)';
  return tabsSpring;
}
/** Вкладки: из названий панелей — ряд вкладок (role=tablist), видна одна панель; стрелки ← → переключают. Без скрипта — разделы подряд. */
function siteTabs(root) {
  for (const tabs of root.querySelectorAll('.ted-tabs:not([data-ted-tabs])')) {
    const panels = [...tabs.querySelectorAll(':scope > .ted-tabs__panel')];
    if (!panels.length) continue;
    const uid = 'ted-tabs-' + (++tabsUid);
    const bar = document.createElement('div');
    bar.className = 'ted-tabs__bar';
    bar.setAttribute('role', 'tablist');
    const buttons = panels.map((panel, i) => {
      const title = panel.querySelector(':scope > .ted-tabs__title');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ted-tabs__tab';
      b.id = uid + '-t' + i;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', uid + '-p' + i);
      b.textContent = (title && title.textContent.trim()) || 'Вкладка ' + (i + 1);
      panel.id = panel.id || uid + '-p' + i;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', b.id);
      bar.appendChild(b);
      return b;
    });
    // скользящее подчёркивание: полоса переезжает к выбранной вкладке (первая установка и смена ширины — без движения)
    const ink = document.createElement('span');
    ink.className = 'ted-tabs__ink';
    ink.setAttribute('aria-hidden', 'true');
    bar.appendChild(ink);
    bar.style.setProperty('--ted-ease-spring', tabsSpringEasing());
    let current = 0;
    const place = (glide) => {
      const b = buttons[current];
      bar.toggleAttribute('data-ted-glide', !!glide);
      ink.style.setProperty('--ted-ink-x', b.offsetLeft + 'px');
      ink.style.setProperty('--ted-ink-w', String(b.offsetWidth));
    };
    if (window.ResizeObserver) new ResizeObserver(() => place(false)).observe(bar);
    const select = (k, focus) => {
      const glide = bar.isConnected && k !== current && tabs.hasAttribute('data-ted-tabs');
      current = k;
      buttons.forEach((b, i) => { b.setAttribute('aria-selected', String(i === k)); b.tabIndex = i === k ? 0 : -1; });
      place(glide);
      panels.forEach((p, i) => { p.hidden = i !== k; });
      if (focus) buttons[k].focus();
      buttons[k].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    buttons.forEach((b, i) => {
      b.addEventListener('click', () => select(i, false));
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        select((i + step + buttons.length) % buttons.length, true);
      });
    });
    tabs.insertBefore(bar, tabs.firstChild);
    tabs.setAttribute('data-ted-tabs', '');
    select(0, false);
  }
}

siteBlock(siteTabs);
