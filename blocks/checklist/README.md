# Блок «Чек-лист» (`checklist`)

Список с чек-боксами по макету `block-checklist` (check-box size=s): пункт 32, чек-бокс 24 (значок 20), зазор 8.

<!-- block.json:begin — собрано из block.json при сборке (tools/build.ps1, build.php), не правьте вручную -->
| Поле | Значение |
|---|---|
| Вид | `checklist` |
| Текстовый блок | да (правку ведёт текстовый движок ядра) |
| Название | Чек-лист |
| Меню | «Списки», значок `checklist`, «Превратить в…»: да |
| Блок без текста | нет |
| Белый список | `ul`, `li` |
| В наборе без блока | становится текстом |
| Макет Figma | block-checklist (check-box size=s) |
<!-- block.json:end -->

## Разметка

`<ul class="ted-checklist"><li class="ted-checked">Сделано</li><li>Не сделано</li></ul>`

## В редакторе

Текстовый блок: ввод, Enter, Backspace, заглушки и кнопки внутри блока ведёт текстовый движок ядра (`resources/js/core/editor.js`, `resources/js/core/blocks.js`, стили правки — `resources/css/ui/blocks.css`); превращение в текст в наборе без блока — `resources/js/core/blocks.js` и `src/Presets.php` (одинаково). Отсюда — плитка «Списки → Чек-лист», «Стиль текста → Чек-лист», JSON, стили на сайте.

## Файлы

| Файл | Что внутри |
|---|---|
| `block.json` | описание: меню, стиль текста, белый список |
| `checklist.js` | регистрация, JSON |
| `checklist.site.css` | вид на сайте и в редакторе |
| `checklist.test.js` | тесты блока и перенесённые прежние тесты (набор `blocks`) |
