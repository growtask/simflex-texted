// Поведение блоков на сайте (этап 5): blocks/<тип>/<тип>.site.js регистрирует функцию siteBlock(fn), content.js вызывает
// её для каждого корня с содержимым (TedContent.mount). Сборка кладёт этот файл перед файлами блоков (build.json → content).
const SITE_BLOCKS = [];
function siteBlock(fn) { SITE_BLOCKS.push(fn); }

/** Подпись на языке страницы: английская, если у содержимого или у страницы lang="en…", иначе русская (1.0.2) */
function siteText(node, ru, en) {
  const el = node.nodeType === 9 ? node.documentElement : (node.closest && node.closest('[lang]')) || node.ownerDocument.documentElement;
  return /^en/i.test((el && el.getAttribute('lang')) || '') ? en : ru;
}
