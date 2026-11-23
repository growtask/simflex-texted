<?php
// Настройки texted на сервере. Скопируйте этот файл РЯДОМ с папкой пакета (не внутрь ted/ — обновление его затрёт):
//   /var/www/site/ted/                 ← пакет
//   /var/www/site/ted.config.php       ← ваши настройки
// или укажите путь: переменная окружения TED_CONFIG=/путь/ted.config.php, либо TedConfig::load('/путь/ted.config.php').
// Любой ключ можно не писать — действует значение по умолчанию. Неизвестный ключ — ошибка (защита от опечаток).
// Проверка настроек и сервера: php ted/php/check.php

return [
    // Папка файлов: путь на диске и адрес для браузера — два разных значения.
    // По умолчанию: <корень сайта>/uf и /uf. Старые статьи с адресами /uf/… работают, пока адрес и папка те же.
    'files' => [
        'dir' => __DIR__ . '/uf',          // полный путь на диске; папка создаётся при первой загрузке
        'url' => '/uf',                    // как её видит браузер: '/uf' или 'https://cdn.example.com/uf'
    ],

    // Наибольший размер файла, МБ (не больше, чем upload_max_filesize и post_max_size в PHP)
    'limits' => [
        'image' => 5,
        'video' => 500,
        'audio' => 50,
        'file' => 20,
    ],

    // ffmpeg: 'auto' — найти (TED_FFMPEG или ffmpeg в PATH), false — не использовать, или путь: '/usr/bin/ffmpeg'.
    // Без ffmpeg видео принимаются только MP4, AVI и WebM, постер к видео делает браузер.
    'ffmpeg' => 'auto',

    // Карточки по ссылке (блок «Встраивание»): сервер читает страницу по ссылке. false — выключить.
    'opengraph' => true,

    // Блок «iFrame»: null — любой https-адрес; список — только эти сайты (без https:// и пути).
    'iframe' => [
        'hosts' => null,
        // 'hosts' => ['www.youtube.com', 'player.vimeo.com', 'yandex.ru'],
    ],

    // Свои наборы блоков сверх базовых (full, mini, text, readonly, docs). Набор поля выбирает CMS:
    //   в шаблоне: Ted.init({ server: … }) с $ted->clientJson('news', $user->canEdit()) — браузеру: набор и право
    //   $clean = $ted->save($_POST['content'], 'news', $user->canEdit());         — сервер: очистка по набору, без права — отказ
    // blocks — 'all' или список: p, h2…h6, blockquote, pre, callout, background, facts, proscons, ul, ol, checklist, steps,
    //   image, gallery, video, audio, file, table, embed, iframe, columns, hr, toc, accordion, tabs, button, product.
    //   Абзац разрешён всегда. Запрещённые блоки при сохранении становятся обычным текстом.
    // mode — 'edit' (сразу правка), 'view' (просмотр, «Редактировать» включает правку), 'readonly' (только просмотр).
    // Лимит частоты запросов в минуту на пользователя (сессия + IP): загрузка файлов и запросы сервера наружу
    // (карточка по ссылке, картинка по ссылке). Сверх лимита — ответ 429. 0 — без лимита.
    'rate' => [
        'upload' => 60,
        'fetch' => 20,
    ],

    'presets' => [
        // 'news' => ['blocks' => ['h2', 'h3', 'ul', 'ol', 'blockquote', 'image', 'gallery', 'video'], 'mode' => 'edit'],
    ],
];
