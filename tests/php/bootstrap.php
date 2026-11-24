<?php

declare(strict_types=1);

/**
 * Подключение классов texted для тестов и инструментов разработки (bin/, tools/).
 *
 * После `composer install` в клоне пакета — автозагрузка composer. Без неё (клон без vendor/, у автора нет composer) —
 * та же раскладка вручную: Simflex\Texted\… → src/ (PSR-4), Simflex\Texted\Blocks\<Тип> → blocks/<тип>/<Тип>.php
 * (classmap). Сайтам это не нужно: пакет ставится только через composer.
 */

$composerAutoload = dirname(__DIR__, 2) . '/vendor/autoload.php';
if (is_file($composerAutoload)) {
    require_once $composerAutoload;
    return;
}

spl_autoload_register(static function (string $class): void {
    $root = dirname(__DIR__, 2);
    $prefix = 'Simflex\\Texted\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = substr($class, strlen($prefix));
    if (str_starts_with($relative, 'Blocks\\')) {
        $name = substr($relative, strlen('Blocks\\'));
        $folder = strtolower((string) preg_replace('/(?<!^)[A-Z]/', '-$0', $name));
        $file = $root . '/blocks/' . $folder . '/' . $name . '.php';
    } else {
        $file = $root . '/src/' . str_replace('\\', '/', $relative) . '.php';
    }
    if (is_file($file)) {
        require_once $file;
    }
});
