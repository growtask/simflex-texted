// Блок «Цветной фон» (макет block-background) — этап 5.6. Не отдельный элемент, а оформление текстового блока: класс
// ted-bg-gray / ted-bg-color1 / ted-bg-color2 на абзаце, заголовке, списке, цитате (у выноски и цифр — плашка). Кнопка
// «Цветной фон» в панели и правила наложения — в текстовом движке ядра (как выравнивание); снимается в наборе без фона.
// Здесь — пункт меню «Акцент → Цветной фон» (новый абзац на сером фоне), запрет внутри контейнеров, стили, тесты.
import BACKGROUND_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';

registerBlock({
  ...BACKGROUND_BLOCK,
  match: () => false,   // абзац на фоне остаётся абзацем
  create: (doc) => {
    const p = doc.createElement('p');
    p.className = 'ted-bg-gray';
    p.appendChild(doc.createElement('br'));
    return { el: p, focus: p };
  },
});
