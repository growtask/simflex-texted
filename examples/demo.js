// Оболочка демо: боковое меню со ссылками между режимами + переключатель темы.
// Подключение: <script src="demo-icons.js"></script><script src="demo.js"></script>
// Разметка: <nav class="demo-side" data-demo-nav></nav> (меню заполняется само).
(function () {
  // служебные страницы (во весь экран, узкие контейнеры): только ссылка «назад», без смены темы и оформления
  if (document.body.hasAttribute('data-demo-back')) {
    var back = document.createElement('a');
    back.className = 'demo-back'; back.href = 'index.html';
    back.innerHTML = (window.DEMO_ICONS && DEMO_ICONS['chevron-left'] || '') + '<span>Все режимы демо</span>';
    document.body.appendChild(back);
    return;
  }
  var PAGES = [
    { href: 'index.html', label: 'Главная', icon: 'gallery' },
    { href: 'admin.html', label: 'Админка', icon: 'edit' },
    { href: 'site.html', label: 'Сайт', icon: 'eye' },
    { href: 'docs.html', label: 'Документация', icon: 'text' },
    { href: 'editor.html', label: 'Во весь экран', icon: 'align-center', service: true },
    { href: 'narrow.html', label: 'Узкие контейнеры', icon: 'columns', service: true },
  ];
  var KEY = 'ted-demo-dark';
  var here = location.pathname.split('/').pop() || 'index.html';

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (html != null) e.innerHTML = html;
    return e;
  }
  function icon(name) { return (window.DEMO_ICONS && DEMO_ICONS[name]) || ''; }

  var lightOnly = document.body.hasAttribute("data-demo-light");  // «сайт» всегда светлый: тёмной темы у сайта в демо нет
  var dark = !lightOnly && localStorage.getItem(KEY) === "1";
  function applyTheme() {
    document.body.classList.toggle('dark', dark);
    if (window.Ted && Ted.setTheme) Ted.setTheme(dark ? 'dark' : 'light');
    document.querySelectorAll('[data-demo-toggle] span').forEach(function (s) { s.textContent = dark ? 'Светлая тема' : 'Тёмная тема'; });
    document.querySelectorAll('[data-demo-theme]').forEach(function (b) {
      b.setAttribute('aria-selected', String((b.dataset.demoTheme === 'dark') === dark));
    });
  }
  function setDark(v) { dark = v; localStorage.setItem(KEY, v ? '1' : '0'); applyTheme(); }

  document.body.classList.add('demo');

  document.querySelectorAll('[data-demo-nav]').forEach(function (nav) {
    nav.appendChild(el('a', { class: 'demo-brand', href: 'index.html', 'aria-label': 'TextEd — на главную' }, '<span class="demo-logo">' + (window.DEMO_LOGO || 'Simflex') + '</span><b>TextEd</b><small>редактор SimflexCMS · этап 1</small>'));
    PAGES.forEach(function (p) {
      var a = el('a', { class: 'demo-menu' + (p.service ? ' demo-menu--service' : ''), href: p.href }, icon(p.icon) + '<span>' + p.label + '</span>');
      if (p.href === here) a.setAttribute('aria-current', 'page');
      nav.appendChild(a);
    });
    nav.appendChild(el('div', { class: 'demo-spacer' }));
    // тема: в боковом меню — на всю ширину; на мобильном (тапбар) — такая же группа вверху страницы
    function themeTabs(cls) {
      var tabs = el('div', { class: 'demo-tabs ' + cls, role: 'tablist', 'aria-label': 'Тема демо' });
      [['light', 'Светлая'], ['dark', 'Тёмная']].forEach(function (t) {
        var b = el('button', { class: 'demo-tab', type: 'button', role: 'tab', 'data-demo-theme': t[0] }, '<span>' + t[1] + '</span>');
        b.onclick = function () { setDark(t[0] === 'dark'); };
        tabs.appendChild(b);
      });
      return tabs;
    }
    nav.appendChild(themeTabs('demo-theme'));
    var mainEl = document.querySelector('.demo-main');
    if (mainEl && !lightOnly) {
      var tb = el('button', { class: 'demo-tab demo-theme-top', type: 'button', 'data-demo-toggle': '' }, '<span></span>');
      tb.onclick = function () { setDark(!dark); };
      mainEl.insertBefore(tb, mainEl.firstChild);
    }
  });

  // сегментные переключатели Tabs/main: <div class="demo-tabs" data-demo-tabs="id"> — страницы подписываются на событие
  window.DemoUI = {
    isDark: function () { return dark; },
    navTabs: function (container) {
      PAGES.forEach(function (p) {
        var a = el("a", { class: "demo-tab", href: p.href }, "<span>" + p.label + "</span>");
        if (p.href === here) a.setAttribute("aria-current", "page");
        container.appendChild(a);
      });
    },
    tabs: function (container, items, value, onChange) {
      container.setAttribute('role', 'tablist');
      container.replaceChildren();
      items.forEach(function (it) {
        var b = el('button', { class: 'demo-tab', type: 'button', role: 'tab' }, '<span>' + it[1] + '</span>');
        b.setAttribute('aria-selected', String(it[0] === value));
        b.onclick = function () {
          container.querySelectorAll('.demo-tab').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
          b.setAttribute('aria-selected', 'true');
          onChange(it[0]);
        };
        container.appendChild(b);
      });
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyTheme); else applyTheme();
  window.addEventListener('load', applyTheme);
})();
