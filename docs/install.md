# Установка и подключение

[← К оглавлению](README.md)

## Быстрый старт

**1. Установите пакет** и опубликуйте папку `dist/` пакета в корень веб-сервера (`vendor/` из браузера недоступен):
в ней всё нужное, стили ссылаются на шрифты, плитки и значки относительно. В Simflex CMS это делает ядро.

```bash
composer require simflex/texted
```

```
/texted/ted.js       ← скрипт редактора           (vendor/simflex/texted/dist/ted.js)
/texted/ted.css      ← стили редактора и оформления блоков
/texted/content.js   ← поведение блоков на сайте
/texted/fonts/       ← шрифты
/texted/tiles/       ← картинки для меню блоков (нужны только админке)
/texted/icons/       ← значки медиа (файл, скачать)
```

**2. Подключите в админке** и превратите поле в редактор:

```html
<link rel="stylesheet" href="/texted/ted.css">
<script src="/texted/ted.js"></script>

<textarea name="content"><?= htmlspecialchars($page['content']) ?></textarea>

<script>
  Ted.init({ selector: 'textarea[name=content]' });
</script>
```

Редактор сам записывает HTML обратно в `textarea`. Форма отправляется как обычно.

**3. Очистите HTML на сервере перед сохранением** (это обязательно, см. [Безопасность](#безопасность-прочитайте-обязательно)):

```php
$clean = Sanitizer::clean($_POST['content']);   // класс загружает автозагрузка composer; сохраняйте и выводите только $clean
```

**Настройки сервера — один файл `ted.config.php`** (необязательно: без него папка файлов — `<корень сайта>/uf`, адрес `/uf`, лимиты по умолчанию). Скопируйте `ted.config.example.php` в свой проект (не в `vendor/`) и передайте путь в `Config::load()` или переменной `TED_CONFIG`; настройки можно задать и массивом — `Config::fromArray()`. В файле: папка файлов на диске и её адрес для браузера (два значения — папка может лежать вне сайта или на CDN), лимиты размеров, ffmpeg, карточки по ссылке вкл./выкл., сайты для блока «iFrame». Ошибка в ключе или значении — понятное сообщение, а не тихое значение по умолчанию.

```php
$ted = Config::load('/var/www/site/ted.config.php');   // путь к настройкам (или переменная TED_CONFIG)
$clean = $ted->clean($_POST['content']);           // то же, что Sanitizer::clean, плюс сайты iFrame из настроек
$ted->createStorage()->respondToUpload($pagePath);    // маршрут загрузки — после проверки входа и CSRF
```

Браузеру нужна только часть настроек — передайте её в `Ted.init`; путь на диске, ffmpeg и ключи в неё не входят:

```html
<script>Ted.init({ selector: 'textarea[name=content]', server: <?= $ted->getClientJson() ?> });</script>
```

`server` — `{ filesUrl, limits, opengraph, iframeHosts, preset, presets, canEdit }` (набор поля и право — `getClientJson($preset, $canEdit)`, см. «Наборы блоков и право на правку»): по адресу папки редактор узнаёт свои файлы (удаление после сохранения), файл больше лимита не отправляет, при выключенных карточках не предлагает «Встроить карточкой», в «iFrame» принимает только сайты из списка (сервер проверяет то же самое). Проверка настроек и сервера: `php texted/bin/check.php`.

**4. Выведите на сайте.** На странице подключите `ted.css` (и `ted.vw.css`, если сайт на vw-размерах) и выведите сохранённый HTML внутри контейнера:

```html
<link rel="stylesheet" href="/texted/ted.css">
<?= $page['content'] ?>   <!-- уже обёрнут в <div class="ted-content"> -->
```

Чтобы работали аудиоплеер (тот же, что в редакторе, по макету Media/audio) и запуск видео с площадок по клику, добавьте `<script src="/texted/content.js" defer></script>`. Этот файл **собирается** (`tools/build.ps1` или `php tools/build.php`) из `resources/js/core/audio-player.js` и `resources/js/site/content.js`; вручную его не правьте. Без него на сайте остаётся родной `<audio controls>`.

Посмотреть всё в работе: откройте двойным кликом `examples/index.html` (демо работают прямо с диска, сервер не нужен).

## Режимы встраивания

| Где используется | Настройки |
|------------------|-----------|
| Админка (редактор в форме) | `previewMode: false`, `onSave`, `autosave: 'ключ'` |
| Документация (правка прямо на странице) | набор `docs` (или `mode: 'view'`, `preview: 'inline'`), `onSave` |
| Доступ без права редактирования | сервер: `getClientJson($preset, false)`; без сервера — `readOnly: true` или набор `readonly` |
| Полноэкранный редактор | без настроек |

## Подключение к CMS

**Обычная форма.** `Ted.init({ selector: 'textarea' })` — редактор пишет HTML в `textarea` при каждом изменении, форма отправляется как обычно.
Кнопка «Сохранить» вызывает `form.requestSubmit()`: проверку полей и отправку делает браузер, сообщение об успехе редактор не показывает —
его не за что подтверждать, пока сервер не ответил. Если страница не перезагружается (форма уходит через `fetch`), после ответа сервера вызовите `ed.markSaved()`.

```js
const [ed] = Ted.init({ selector: '#content', autosave: 'page-' + pageId + '-content' });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
  if (res.ok) ed.markSaved(); else showError();
});
```

**Сохранение через `onSave`.** Функция получает HTML и возвращает `Promise`. Версия считается сохранённой только после его успеха; при отказе
повторный выход в просмотр или «Сохранить» отправит снова. Запросы идут по очереди; один и тот же текст не отправляется дважды, пока запрос идёт.

```js
Ted.init({
  selector: '#content',
  onSave: (html) => fetch('/api/page/12', { method: 'PUT', body: html }).then((r) => { if (!r.ok) throw new Error(r.status); }),
});
```

**Черновик.** `autosave: true` строит ключ из пути страницы и `id` / `name` поля. Если у поля нет ни того ни другого или в одном маршруте открывают разные документы,
ключи совпадут (в консоль выводится предупреждение). Для CMS всегда задавайте явный ключ: `autosave: 'doc-<id документа>-<поле>'`.

**Удаление и повторное создание.** `ed.destroy()`, `Ted.destroy(editor)`, `Ted.destroy(element)` и `Ted.destroy('#селектор')` равнозначны:
снимаются все слушатели и окна, редактор убирается из `Ted.editors`. Повторный вызов безопасен.
