// Название файла в плитке: не длиннее двух строк, дальше многоточие. Для обрезки текст ссылки оборачивается в <span class="ted-media__name">
// (одно CSS-правило на самой ссылке обрезало бы текст только при авто-высоте и ломало бы центровку). В сохранённом HTML обёртки нет:
// её ставит редактор в блоке и content.js на сайте.
export function wrapFileNames(root) {
  for (const link of root.querySelectorAll('.ted-media--file > a')) {
    if (link.querySelector(':scope > .ted-media__name')) continue;
    const texts = [...link.childNodes].filter((node) => node.nodeType === 3);
    if (!texts.length) continue;
    const name = link.ownerDocument.createElement('span');
    name.className = 'ted-media__name';
    texts[0].before(name);
    name.append(...texts);
  }
}
