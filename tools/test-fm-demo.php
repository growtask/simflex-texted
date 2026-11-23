<?php
declare(strict_types=1);

// Проверка демо файлового менеджера (tools/fm-demo.php) с настоящим пакетом simflex-file-manager:
// обёртка для Windows совместима с текущим Manager (23.11 пакет поменял resolvePath — менеджер в демо перестал видеть файлы),
// корень и вложенная папка отдают файлы, выход из корня — отказ. Пакет не найден — проверка пропускается.
// Папка пакета: переменная TED_DEMO_FILE_MANAGER или «Документы\GitHub\simflex-file-manager» (как tools/demo.ps1).

$package = getenv('TED_DEMO_FILE_MANAGER') ?: '';
if ($package === '') {
    $home = getenv('USERPROFILE') ?: (getenv('HOME') ?: '');
    foreach ([$home . '/OneDrive/Документы/GitHub/simflex-file-manager', $home . '/Documents/GitHub/simflex-file-manager'] as $dir) {
        if (is_file($dir . '/src/FileManager/Manager.php')) { $package = $dir; break; }
    }
}
if ($package === '' || !is_file($package . '/src/FileManager/Manager.php')) {
    echo "  Файловый менеджер не найден — пропущено\n";
    exit(0);
}

require_once __DIR__ . '/fm-demo.php';
require_once $package . '/src/FileManager/Manager.php';

$root = sys_get_temp_dir() . '/ted-fm-demo-' . bin2hex(random_bytes(4));
mkdir($root . '/images/company', 0775, true);
file_put_contents($root . '/top.txt', 'a');
file_put_contents($root . '/images/company/pic.txt', 'b');

$failed = 0;
$check = static function (string $name, bool $ok) use (&$failed): void {
    echo ($ok ? '  ✓ ' : '  ✗ ') . $name . "\n";
    if (!$ok) $failed++;
};
$call = static function (string $method, string $path) use ($root): array {
    $_REQUEST = ['method' => $method, 'path' => $path];
    $manager = ted_demo_windows_manager($root, static fn(): bool => true);
    ob_start();
    @$manager->handleRequest();   // header() в консоли после вывода — предупреждение, не ошибка
    return json_decode((string) ob_get_clean(), true) ?: [];
};
$names = static fn(array $json): array => array_column($json['items'] ?? [], 'name');

try {
    $check('корень: файлы видны', in_array('top.txt', $names($call('getFileList', '/')), true));
    $check('вложенная папка: файлы видны', in_array('pic.txt', $names($call('getFileList', '/images/company')), true));
    $check('дерево папок', in_array('images', $names($call('getTree', '')), true));
    $out = $call('getFileList', '/../');
    $check('выход из корня — отказ', ($out['error']['code'] ?? 0) !== 0 && !isset($out['items']));
} finally {
    @unlink($root . '/images/company/pic.txt'); @rmdir($root . '/images/company'); @rmdir($root . '/images');
    @unlink($root . '/top.txt'); @rmdir($root);
}
exit($failed ? 1 : 0);
