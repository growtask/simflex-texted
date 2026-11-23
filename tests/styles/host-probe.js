// Страница вокруг редактора (набор styles, этап 4). Подключает по параметрам сброс стилей сайта и texted,
// ставит редактор со всеми блоками и вывод блоков «как на сайте», затем снимает подписи вычисленных стилей.
(function () {
  const q = new URLSearchParams(location.search);
  const css = (href) => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); return new Promise((r) => { l.onload = r; l.onerror = r; }); };
  const js = (src) => new Promise((r) => { const s = document.createElement('script'); s.src = src; s.onload = r; s.onerror = r; document.head.append(s); });
  const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  // все вычисленные свойства, кроме переменных (--*) и тех, что зависят от положения курсора и анимаций
  const SKIP = /^(--|transition|animation)/;
  const sig = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    if (pseudo && (cs.content === 'none' || cs.content === 'normal')) return '-';
    if (cs.display === 'none') return 'display:none';   // скрытый элемент: остальные свойства не видны
    // подсказку ставит JS по положению кнопки на странице — сравниваем её вид, но не координаты
    const skip = el.classList && el.classList.contains('ted-ui-tip') ? /^(--|transition|animation|top|bottom|left|right|inset)/ : SKIP;
    const names = [];
    for (let i = 0; i < cs.length; i++) if (!skip.test(cs[i])) names.push(cs[i]);
    names.sort();
    return names.map((p) => p + ':' + cs.getPropertyValue(p)).join(';');
  };
  const path = (el, root) => { const parts = []; for (let n = el; n && n !== root; n = n.parentElement) parts.unshift(n.tagName.toLowerCase() + ':' + [...n.parentElement.children].indexOf(n) + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).sort().join('.') : '')); return parts.join('>'); };
  const snap = (root) => {
    const out = {};
    if (!root) return out;
    for (const el of root.querySelectorAll('*')) {
      const key = path(el, root);
      out[key] = fnv(sig(el)) + '|' + fnv(sig(el, '::before')) + '|' + fnv(sig(el, '::after'));
      if (q.has('detail') && key.includes(q.get('detail'))) out[key + '#full'] = sig(el);
    }
    return out;
  };
  window.__tedHostReady = (async () => {
    if (q.get('reset') === '1') await css('host-reset.css');
    if (q.get('ted') === '1') {
      await css('../../dist/ted.css');
      await js('../../dist/ted.js');
      const data = await (await fetch('../presets/vectors.json')).json();
      const html = data.vectors.map((v) => v.html).join('\n');
      const ed = window.Ted.create(document.getElementById('ed'), { value: html, theme: q.get('theme') || 'light', autofocus: false });
      window.__ed = ed;
      const site = document.createElement('div');
      site.className = 'ted-content';
      site.innerHTML = html;
      document.getElementById('site').append(site);
    }
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 300));
    // анимация открытия (класс is-appearing снимается через 1 с) — снимок не должен зависеть от того, успела ли она закончиться
    document.querySelectorAll('.is-appearing').forEach((el) => el.classList.remove('is-appearing'));
    document.getAnimations().forEach((a) => a.finish());
    window.__tedHost = { outside: snap(document.getElementById('outside')), ed: snap(document.getElementById('ed')), site: snap(document.getElementById('site')) };
    return window.__tedHost;
  })();
})();
