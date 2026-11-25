// Проверка сайта со строгой CSP (этап 3): своя страница без встроенных скриптов. Этот файл — единственный скрипт страницы:
// он записывает нарушения CSP, кладёт на страницу сохранённый HTML всех блоков (tests/presets/vectors.json — как его
// отдаёт редактор), подключает content.js и сообщает итог в window.__tedCsp (его читает набор security).
(async () => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    violations.push(`${e.violatedDirective}: ${e.blockedURI || 'inline'} ${e.sourceFile ? '(' + e.sourceFile.split('/').pop() + ':' + e.lineNumber + ')' : ''} ${(e.sample || '').slice(0, 60)}`.trim());
  });
  const data = await (await fetch('../presets/vectors.json')).json();
  const root = document.getElementById('content');
  root.innerHTML = data.vectors.map((v) => v.html).join('\n');
  const script = document.createElement('script');
  script.src = '../../dist/content.js';
  await new Promise((resolve) => { script.onload = resolve; script.onerror = resolve; document.body.append(script); });
  await new Promise((r) => setTimeout(r, 300));
  const inlineHandlers = [...document.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length;
  window.__tedCsp = {
    violations,
    blocks: root.children.length,
    audioPlayers: root.querySelectorAll('.ted-audio').length,
    copyButtons: root.querySelectorAll('.ted-code-copy').length,
    inlineHandlers,
  };
})();
