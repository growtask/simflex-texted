// Поведение блоков на сайте (этап 5): blocks/<тип>/<тип>.site.js регистрирует функцию siteBlock(fn), content.js вызывает
// её для каждого корня с содержимым (TedContent.mount). Сборка кладёт этот файл перед файлами блоков (build.json → content).
const SITE_BLOCKS = [];
function siteBlock(fn) { SITE_BLOCKS.push(fn); }

/** Подпись на языке страницы: английская, если у содержимого или у страницы lang="en…", иначе русская (1.0.2) */
function siteText(node, ru, en) {
  const el = node.nodeType === 9 ? node.documentElement : (node.closest && node.closest('[lang]')) || node.ownerDocument.documentElement;
  return /^en/i.test((el && el.getAttribute('lang')) || '') ? en : ru;
}

/**
 * Тост на сайте — тот же Feedback/toast, что в редакторе (.ted-ui-toast из ted.css): внизу по центру, 3,5 с; на тёмной
 * странице — светлый (как редактор в тёмной теме), ошибка — красный (1.0.4)
 */
function siteToast(node, text, status = '') {
  const doc = node.ownerDocument || node;
  let stack = doc.querySelector('body > .ted-ui-toasts[data-ted-site]');
  if (!stack) {
    stack = doc.createElement('div');
    stack.className = 'ted-ui-toasts';
    stack.setAttribute('data-ted-site', '');
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    doc.body.appendChild(stack);
  }
  const dark = !!(node.closest && node.closest('[data-ted-theme="dark"]')) || doc.documentElement.getAttribute('data-ted-theme') === 'dark';
  const toast = doc.createElement('div');
  toast.className = 'ted-ui-toast' + (status ? ' ted-ui-toast--' + status : dark ? ' ted-ui-toast--on-dark' : '');
  const p = doc.createElement('p');
  p.className = 'ted-ui-toast__text';
  p.textContent = text;
  const timer = doc.createElement('span');
  timer.className = 'ted-ui-toast__timer';
  timer.style.animationDuration = '3500ms';
  toast.append(p, timer);
  while (stack.children.length >= 3) stack.firstElementChild.remove();
  stack.appendChild(toast);
  setTimeout(() => { toast.classList.add('is-closing'); setTimeout(() => toast.remove(), 160); }, 3500);
  return toast;
}
