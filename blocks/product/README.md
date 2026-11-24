# Блок «Товар» (`product`)

Карточка товара из каталога CMS (опция `products`: search / get) или заполненная вручную; «В корзину» или «Перейти». Макет `block-product (Action/product)`, окно `editor-popover kind=product`. Блок целиком в этой папке: ядро его не упоминает (тест набора `blocks`).

<!-- block.json:begin — собрано из block.json при сборке (tools/build.ps1, build.php), не правьте вручную -->
| Поле | Значение |
|---|---|
| Вид | `product` |
| Название | Товар |
| Меню | «Действия», значок `product`, «Превратить в…»: нет |
| Блок без текста | нет |
| Белый список | `div` (data-ted-product), `a` (data-ted-cart) |
| В наборе без блока | становится текстом |
| Макет Figma | block-product (Action/product) |
<!-- block.json:end -->

## Разметка

`<div class="ted-product" [data-ted-product="id"]>` — картинка, название, цена (старая — зачёркнута), `<a class="ted-product__btn" href [data-ted-cart="id"]>`. Полностью — в комментарии `product.js`. На сайте «В корзину» шлёт событие `ted:add-to-cart` (`product.site.js`); без скрипта — обычная ссылка на товар.

## Безопасность

Атрибуты `data-ted-product` и `data-ted-cart` — в белом списке через `html` в `block.json`; поле `ids` включает общее правило «значение — id CMS: латиница, цифры, _ и -, до 64» (JS `allowlist.js` и PHP `Sanitizer` одинаково). Ссылки и картинки — только через `urlOk`.

## Как ядро с ним работает

Только через реестр (`product.js` → `registerBlock`):

| Точка | Что делает |
|---|---|
| `create`, `afterInsert` | пустой товар («Выберите товар», «0 ₽»), сразу окно «Настройки товара» |
| `editorUi` (`editor.products`) | окно «Настройки товара» — каталог CMS или вручную — `product.editor.js` |
| `clean`, `serialize`, `normalize` | очистка, сохранение, пересборка карточки из данных |
| `toText` (+ `product.php` → `degrade`) | в наборе без товара — «Название — цена» ссылкой на товар |
| `canAlign`, `canBg` | выравнивания и цветного фона нет |
| `neverEmpty`, `caretBelow`, `ids` (block.json) | не пустая строка; под ним строка для курсора; правило id |

## Файлы

| Файл | Что внутри |
|---|---|
| `block.json` | описание, меню и образец плитки, атрибуты |
| `product.js` | цена, данные карточки, разметка, очистка, сохранение, регистрация |
| `product.editor.js` | окно «Настройки товара» |
| `product.php` | превращение в текст на сервере |
| `product.site.css`, `product.editor.css` | вид на сайте и в редакторе; отличия в редакторе (заглушки пустого) |
| `product.site.js` | корзина на сайте (в `content.js`) |
| `product.test.js` | тесты блока (набор `blocks`) |
