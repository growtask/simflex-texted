// Правки заказчика 23.11.2026: поведение, найденное вручную, — тестом.
import { group, test, eq, ok } from '../harness.js';
import { make } from '../helpers.js';

// без служебных атрибутов редактора (заглушка, фокус)
const html = (el) => el.outerHTML.replace(/ data-tedui-[a-z-]+="[^"]*"/g, '');
const enter = (ed) => ed.editable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
const caretIn = (node, offset) => {
  const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
};

group('Enter: новая строка без стилей и слева (23.11)', () => {
  test('в конце центрированного абзаца с кодом — новый чистый абзац слева, курсор в нём', () => {
    const ed = make('<p class="ted-align-center" id="a1">Текст и <code>/doc</code></p>');
    ed.editable.focus();
    const code = ed.editable.querySelector('code');
    caretIn(code.firstChild, code.firstChild.length);
    enter(ed);
    const [first, second] = ed.editable.children;
    eq(html(first), '<p class="ted-align-center" id="a1">Текст и <code>/doc</code></p>');
    eq(html(second), '<p><br></p>', 'без выравнивания, якоря и кода');
    const r = getSelection().getRangeAt(0);
    ok(second.contains(r.startContainer) && !r.startContainer.parentElement?.closest('code'), 'курсор в новом абзаце, не в коде');
  });

  test('в середине — хвост в новый абзац со своим оформлением, абзац без выравнивания; в начале — пустая строка выше', () => {
    const ed = make('<p class="ted-align-center">Начало <strong>жирный</strong> конец</p>');
    ed.editable.focus();
    const b = ed.editable.querySelector('strong');
    caretIn(b.firstChild, 3);
    enter(ed);
    eq(html(ed.editable.children[0]), '<p class="ted-align-center">Начало <strong>жир</strong></p>');
    eq(html(ed.editable.children[1]), '<p><strong>ный</strong> конец</p>');
    caretIn(ed.editable.children[0].firstChild, 0);
    enter(ed);
    eq(ed.editable.children.length, 3);
    eq(html(ed.editable.children[1]), '<p class="ted-align-center">Начало <strong>жир</strong></p>', 'абзац остался со своим выравниванием');
  });
});
