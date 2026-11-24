# Изменения texted

Формат: версия — дата — что появилось, что изменилось, что исправлено. Версия в коде — `Ted.version` (`src/index.js → VERSION`).
До 1.0 версии 0.x: возможны несовместимые изменения — они отмечены «⚠».

## Не выпущено

- Composer-пакет `simflex/texted` (`composer.json`). Редактор админки Simflex CMS (`simflex/core`) вместо TinyMCE.
- ⚠ Сервер — классы в namespace `Simflex\Texted\` (PSR-4, `src/`), только через автозагрузку composer: файлов `php/*.php`
  и `require` больше нет. Серверная часть блока — класс `Simflex\Texted\Blocks\<Тип>` в папке блока
  (`blocks/<тип>/<Тип>.php`, интерфейс `ServerBlock`) вместо массива функций. Проверка сервера — `bin/check.php`,
  правила папки файлов — `resources/uf.htaccess`, тесты PHP — `tests/php/`.

### Переход

| Было | Стало |
|---|---|
| `require 'ted/php/config.php'` и другие `require` | `composer require simflex/texted` (автозагрузка) |
| `TedConfig`, `TedSanitizer`, `TedPresets`, `TedBlocks` | `Simflex\Texted\Config`, `Sanitizer`, `Presets`, `Blocks` |
| `TedMediaStorage`, `TedOpenGraph`, `TedRateLimit` | `Simflex\Texted\MediaStorage`, `OpenGraph`, `RateLimit` |
| `TedAccessDenied` | `Simflex\Texted\Exception\AccessDenied` |
| `tedRespondToUpload($storage, $pagePath, $isReferenced)` | `$storage->respondToUpload($pagePath, $isReferenced)` |
| `tedRespondToOpenGraph($enabled)` | `OpenGraph::respondToRequest($isEnabled)` |
| `Config`: `client()`, `clientJson()` | `getClient()`, `getClientJson()` |
| `Config`: `filesDir()`, `filesUrl()`, `limit()`, `limits()`, `ffmpeg()` | `getFilesDir()`, `getFilesUrl()`, `getLimit()`, `getLimits()`, `getFfmpeg()` |
| `Config`: `opengraph()`, `iframeHosts()`, `presets()`, `preset()`, `rate()` | `isOpenGraphEnabled()`, `getIframeHosts()`, `getPresets()`, `getPreset()`, `getRates()` |
| `Config`: `editable()`, `storage()`, `rateLimit()` | `isEditable()`, `createStorage()`, `createRateLimit()` |
| `MediaStorage`: `filesDir()`, `filesUrl()` | `getFilesDir()`, `getFilesUrl()` |
| `OpenGraph`: `allowedUrl()`, `publicIp()`, `pinned()` | `isAllowedUrl()`, `isPublicIp()`, `getPinnedTarget()` |
| `RateLimit::client()` | `RateLimit::getClientKey()` |
| `blocks/<тип>/<тип>.php` (`return ['degrade' => fn …]`), `TedBlocks::hook()` | класс `Blocks\<Тип> implements ServerBlock`, `Blocks::getServerBlock()` |
| `php/check.php`, `php/uf.htaccess` | `bin/check.php`, `resources/uf.htaccess` |

`clean()`, `save()`, `respondToUpload()`, `respondToOpenGraph()`, `load()`, `fromArray()` у `Config` — без изменений.

## 0.1.0 — 22.11.2026 — первая версия

**Редактор**
- Блоки: текст, заголовки 2–6, списки, чек-лист, шаги, цитата с автором, выноска, цветной фон, ключевые цифры, плюсы и минусы, код с подсветкой и номерами строк, изображение, галерея, видео, аудио с плеером, файлы, таблица с формулами, колонки, содержание с прогрессом чтения, аккордеон, вкладки, кнопка и баннер, товар, встраивание (статья CMS, карточка по ссылке), iFrame, линия.
- Меню «/», «+», «Все блоки» с миниатюрами; перетаскивание блоков, в том числе внутри и между контейнерами; меню блока («Превратить в…», дублировать, в начало / в конец, якорь, удалить); отмена и повтор.
- Markdown-сокращения в начале строки; вставка из Word, Google Docs, Excel и Markdown-текста; типограф ✨.
- Наборы блоков (`full`, `mini`, `text`, `readonly`, `docs`, свои) и право на правку — проверяются и на сервере, на любой глубине вложения.
- Светлая и тёмная тема, плавная смена; интерфейс на русском и английском; черновик в браузере; предупреждение, если документ открыт в двух вкладках.
- Перенос статей: загрузка и выгрузка Markdown и JSON, промт для нейросети, печать и PDF; старые статьи TinyMCE открываются блоками.
- Клавиатура: Ctrl+. — меню блока, Ctrl+Shift+↑ / ↓ — перенос блока, Esc → Tab — к панели; роли и названия для программ чтения с экрана.

**Сайт**
- Чистый HTML без скриптов в содержимом; поведение вкладок, содержания, аудио, кнопки «Копировать код» — `content.js`; анимации с учётом «уменьшить движение».
- Стили блоков на переменных сайта (дизайн-система Simflex), px и vw.

**Сервер (PHP 8.4+)**
- Очистка HTML по общему с браузером белому списку (`TedSanitizer`), настройки `ted.config.php`, наборы и право на правку.
- Загрузка файлов: тип по содержимому, картинки → WebP с уменьшением, видео → WebM (ffmpeg), лимиты, лимит частоты, удаление только внутри папки файлов; карточки по ссылке с защитой от запросов во внутреннюю сеть.
- Проверка установки — `php php/check.php`.
