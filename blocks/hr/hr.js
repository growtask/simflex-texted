// Блок «Разделитель» (линия, макет block-line / Layout/line) — первый блок, перенесённый в папку (этап 5 MODULAR_PLAN.md).
// Сайт и правка: <hr>. Без текста: выделяется целиком, панель «line», нет «Превратить в…», рамка — обводкой.
// Вставка: меню «/», «Все блоки», Markdown «---» + Enter, Ctrl+Shift+−. В наборе без линии — исчезает (block.json → degrade: drop).
import HR_BLOCK from './block.json' with { type: 'json' };
import { registerBlock } from '../../resources/js/core/registry.js';

registerBlock({
  toMarkdown: () => '---',   // Ted.toMarkdown (22.11)
  ...HR_BLOCK,
  match: (el) => el.tagName === 'HR',
  create: (doc) => doc.createElement('hr'),
  clean: (node, doc) => doc.createElement('hr'),   // у линии нет атрибутов и содержимого
  fromJson: () => '<hr>',                          // Ted.fromBlocks: { "type": "hr" }
});
