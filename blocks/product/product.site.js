// Блок «Товар» на сайте. Собирается в content.js (build.json → content → @blocks.content); siteBlock — из src/site/blocks.js.

/** Товар: «В корзину» шлёт событие ted:add-to-cart { id, button }; CMS кладёт товар в корзину и вызывает preventDefault() —
 * тогда переход по ссылке отменяется. Без обработчика (или без скрипта) кнопка просто ведёт на страницу товара. */
function siteCart(root) {
  if (root.__tedCart) return;
  root.__tedCart = true;
  root.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a.ted-product__btn[data-ted-cart]');
    if (!a) return;
    const ev = new CustomEvent('ted:add-to-cart', { bubbles: true, cancelable: true, detail: { id: a.getAttribute('data-ted-cart'), button: a } });
    if (!a.dispatchEvent(ev)) e.preventDefault();
  });
}

siteBlock(siteCart);
