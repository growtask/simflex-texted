# Оформление и стили сайта

[← К оглавлению](README.md)

## Оформление и размеры

### Стили по слоям (этап 4)

Стили texted разделены на три слоя:

| Слой | Файлы | Чьи переменные |
|------|-------|----------------|
| **Токены** | `resources/css/ui/tokens.css` — интерфейс редактора; `resources/css/theme.default.css` — блоки | интерфейс — **админки**, блоки — **сайта** (имена дизайн-системы Simflex) |
| **Общие элементы интерфейса** | `resources/css/ui/*.css`: кнопки, поля, переключатель, вкладки, выпадающий список, окна, подсказки, слой взаимодействия | только `--ui-*` из токенов интерфейса |
| **Блоки** | `resources/css/content.css` | только переменные сайта (`--color-*`, `--font-*`, `--radius-*`) и свои `--ted-*` |

- **Порядок слоёв** закреплён порядком файлов в сборке (`tools/build.json`), а не `@layer` (решение 21.11). Сброс стилей Simflex написан без слоёв, а стиль без слоя всегда сильнее стиля в `@layer`: в слоях блоки на сайтах Simflex потеряли бы маркеры списков, цвет ссылок и размеры заголовков.
- **Стили texted влияют только на свои элементы** — `.ted-content` и `.ted-ui`. Страница вокруг не меняется.
- **Сброс стилей сайта и админки texted не ломает.** То, что сбросы обычно меняют у всех элементов (`box-sizing`, маркеры списков, `text-wrap`, размеры картинок и значков, `text-size-adjust`), у блоков и интерфейса задано явно.
- **Проверка** — набор `styles`: страница со сбросом стилей, как в Simflex, и без него, редактор и блоки совпадают до свойства.
- **Прямые цвета** записаны только в файлах токенов. Интерфейс и блоки берут цвета, скругления и тени из переменных; это тоже проверяет тест.

### Переменные сайта для блоков

Блоки берут эти переменные со страницы. Если переменной нет, используется значение из макета.

| Что | Переменные |
|-----|-----------|
| Шрифты | `--font-family-body`, `--font-family-heading`, `--font-mono` |
| Текст и значки | `--color-text-icon-gray-white`, `-gray-lighter`, `-gray-light`, `-gray-medium`, `-gray-dark`, `-gray-darker`, `--color-text-icon-color1-main`, `-color1-dark`, `-color1-light` |
| Заливки и линии | `--color-main-gray-white`, `-gray-lighter`, `-gray-light`, `-gray-medium`, `-gray-dark`, `-gray-darker`, `-gray-black`; `--color-main-color1-lighter`, `-light`, `-main`, `-dark`, `-darker`; `--color-main-color2-lighter`, `-light`, `-main`, `-darker` |
| Состояния | `--color-states-success-dark`, `-success-light`, `--color-states-error-dark`, `-error-light` |
| Скругления | `--radius-ui-small` (8), `--radius-ui-medium` (12), `--radius-ui-xlarge` (24) |

Имена — как у стилей дизайн-системы «Симфлекс АИ» (стиль `main/color1/main` → `--color-main-color1-main`). До 21.11 использовались `--gray-*`, `--color1-*`, `--text-icon-*` — их больше нет.

Тонкая настройка блоков — переменные `--ted-*` на `.ted-content`, например:

```css
.ted-content { --ted-c-link: #e5a21c; --ted-h2: 48; --ted-gap: 40; --ted-bg-color1: #fff3c4; }
```

Интерфейс редактора берёт переменные админки: те же цвета, `--radius-ui-*` (скругления кнопок, окон, полей), `--shadow-gray-*` и `--shadow-primary-*` (тени), `--font-family-body`.

### Подключение в Simflex

Доработка ядра не нужна: переменные дизайн-системы уже объявлены в `:root` и у админки, и у сайта. Тема админки — `data-theme="dark"` на `<html>`.

```js
Ted.init({ selector: '#content', theme: 'auto', server: … });   // 'auto' — тема интерфейса следует за data-theme админки
```

Цвета Simflex в тёмной теме не меняются: тёмная тема берёт другие оттенки. Так же устроен и texted — `.ted-ui[data-ted-theme="dark"]` в `tokens.css`.

**Блоки в админке в цветах сайта.** В админке в `:root` лежит палитра админки. Если у сайта своя палитра, выведите её переменные на `.ted-content` поля редактора:

```css
.ted-ui .ted-content { --color-main-color1-main: #e5a21c; --color-text-icon-color1-main: #e5a21c; /* … */ }
```

Блоки возьмут цвета сайта, а интерфейс останется в цветах админки: его токены вычисляются на `.ted-ui`, выше блоков. Это проверяет тест.

### Переопределения сайта

Если блок на сайте должен выглядеть совсем иначе, правьте не файлы пакета (обновление их затрёт), а свой файл `ted-site.overrides.css` в теме сайта. Подключите его **после** `ted.css`. Селекторы — не слабее, чем у texted (`.ted-content .класс-блока`):

```html
<link rel="stylesheet" href="/texted/ted.css">
<link rel="stylesheet" href="/theme/ted-site.overrides.css">
```

```css
/* ted-site.overrides.css */
.ted-content .ted-callout { border-radius: 0; }
.ted-content .ted-button__btn { text-transform: uppercase; }
```

### Прочее

**Перемотка аудио и видео.** Сервер должен отдавать файлы из `uf/` частями (HTTP Range, ответ 206). Apache и nginx делают это сами; встроенный сервер PHP — нет, поэтому демо (`tools/media-demo.php`) отдаёт аудио и видео сам. Без Range браузер не перематывает запись: клик по волне оставляет 0:00.

**Загрузка страницы без скачка.** Дайте полю класс `ted-editor` (`<textarea class="ted-editor">`): пока скрипт не загрузился, `ted.css` показывает на его месте пустой редактор той же высоты, без текста. Тёмная тема заготовки — `data-ted-theme="dark"` у поля или контейнера. Шрифт можно подгрузить заранее: `<link rel="preload" href=".../fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>`.

**px и vw.** Все размеры — `calc(число × var(--ted-u))`; `--ted-u` по умолчанию `1px`. Файл `ted.vw.css` включает vw-размеры (десктоп `100vw/1920`, ноутбук `/1366`,
планшет `/768`, телефон `/414`). Не подключайте его — останутся px. В режиме правки размеры всегда в px.

**Цветной фон:** `ted-bg-gray`, `ted-bg-color1`, `ted-bg-color2` берут цвета из `--color-main-gray-lighter`, `--color-main-color1-lighter`, `--color-main-color2-lighter` (светлая тема) и `--color-main-gray-dark`, `--color-main-color1-darker`, `--color-main-color2-darker` (тёмная, контейнер с `data-ted-theme="dark"`). Переопределить: `.ted-content { --ted-bg-color1: #fff3c4; }`.

**Раскладка по экранам:** цифры — 4 колонки, на планшете и телефоне 2; плюсы и минусы — две карточки в ряд, на телефоне (ширина окна до 480 px) друг под другом.
