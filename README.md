# texted — блочный редактор для сайтов и CMS

texted превращает обычное поле `textarea` в блочный редактор и отдаёт чистый HTML со стандартными тегами.
Один скрипт и один файл стилей: без Node.js, без внешних сервисов, без зависимостей. Серверная часть — PHP 8.4+.

**Блоки:** текст и заголовки, списки, чек-лист, шаги, цитата с автором, выноска, цветной фон, ключевые цифры, плюсы и минусы,
код с подсветкой, изображение, галерея, видео, аудио, файлы, таблица с формулами, колонки, содержание, аккордеон, вкладки,
кнопка и баннер, товар, встраивание, iFrame. Наборы блоков («только текст», свои), светлая и тёмная тема, русский и английский
интерфейс, Markdown и JSON, печать в PDF, типограф ✨.

## Установка

В Simflex CMS редактор входит в ядро (`simflex/core`): ставить и подключать его отдельно не нужно — поля
с `editorFull` / `editorMini` открываются в texted.

В другом проекте на PHP:

```bash
composer require simflex/texted
```

1. Опубликуйте статику пакета в корень веб-сервера: `vendor/` не должен быть доступен из браузера. Нужны
   `dist/`, `fonts/`, `tiles/` и `content.js` с сохранением взаимного расположения (стили ссылаются на `../fonts/`
   и `../tiles/`) — шагом сборки или деплоя, например в `public/assets/texted/`.
2. Подключите стили и скрипт и превратите поле в редактор:

```html
<link rel="stylesheet" href="/assets/texted/dist/ted.css">
<textarea name="content" id="content"><?= htmlspecialchars($page['content']) ?></textarea>
<script src="/assets/texted/dist/ted.js"></script>
<script>Ted.init({ selector: '#content', server: <?= $ted->getClientJson('full', $canEdit) ?> });</script>
```

3. HTML из браузера сохраняйте и выводите **только очищенным** (классы сервера загружает автозагрузка composer):

```php
$ted = Config::fromArray(['files' => ['dir' => __DIR__ . '/public/uf', 'url' => '/uf']]);   // ключи — ted.config.example.php
$clean = $ted->save($_POST['content'], 'full', $canEdit); // при сохранении: очистка, набор блоков, право на правку
echo $ted->clean($page['content']);                       // при выводе
```

На страницах сайта подключите оформление и поведение блоков (вкладки, содержание, плеер):

```html
<link rel="stylesheet" href="/assets/texted/dist/ted.css">
<script src="/assets/texted/content.js" defer></script>
```

4. Загрузка файлов — `$ted->respondToUpload($pagePath, $preset, $canEdit)` за авторизацией CMS; в браузере
`Ted.init({ selector: '#content', upload: Ted.createUpload('/admin/ted-upload', { headers }) })`. Проверка сервера: `php bin/check.php`.

## Документация

[Оглавление](docs/README.md) · [установка и CMS](docs/install.md) · [настройки](docs/settings.md) · [наборы блоков](docs/presets.md) ·
[файлы](docs/files.md) · [Markdown, JSON, нейросети, PDF](docs/import-export.md) · [безопасность](docs/security.md) ·
[API](docs/api.md) · [стили сайта](docs/styles.md) · [разработчикам](docs/development.md) · [для нейросетей и агентов](AGENTS.md)

## Безопасность — коротко

HTML из браузера не доверяем: перед сохранением и выводом его всегда очищает сервер (`Sanitizer::clean`) по тому же белому
списку, что и браузер. Загрузка — только за авторизацией CMS, тип файла проверяется по содержимому, папка файлов — только данные.
Подробно — [docs/security.md](docs/security.md).

## Версия и лицензия

Версия — `Ted.version` и [CHANGELOG.md](CHANGELOG.md). Лицензия — MIT ([LICENSE](LICENSE)): можно использовать, менять и распространять, в том числе в коммерческих проектах, сохраняя уведомление об авторах.
