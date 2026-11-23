# Демо с рабочей загрузкой файлов: запускает PHP-сервер, печатает проверку сервера и открывает админку.
# Запуск:  pwsh -File ted/tools/demo.ps1 [-Port 8150] [-NoOpen]   (нужен PHP 8.4+ с gd и fileinfo)
#         [-FileManager <папка simflex-file-manager>]   файловый менеджер SimflexCMS в админке (по умолчанию — Документы\GitHub\simflex-file-manager, если есть)
param([int]$Port = 8150, [switch]$NoOpen, [string]$FileManager = '')
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$OutputEncoding = [Text.Encoding]::UTF8
$ted = Split-Path -Parent $PSScriptRoot
$php = & (Join-Path $PSScriptRoot 'find-php.ps1')
if (-not $php) { Write-Host 'PHP не найден. Установите PHP 8.4+ (winget install PHP.PHP.8.4) и повторите.'; exit 1 }
# Порт занят (например, прошлым запуском)? Берём следующий свободный
function Test-PortFree($p) { try { $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); $true } catch { $false } }
while (-not (Test-PortFree $Port) -and $Port -lt 8250) { $Port++ }
# PHP без php.ini (WinGet) сам не грузит gd, fileinfo, openssl и mbstring — подключаем из папки ext и отключаем opcache (падает на ASLR)
$ext = Join-Path (Split-Path -Parent $php) 'ext'
$flags = @('-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-d', 'upload_max_filesize=500M', '-d', 'post_max_size=512M')
if (Test-Path $ext) { $flags += @('-d', "extension_dir=`"$ext`"", '-d', 'extension=gd', '-d', 'extension=fileinfo', '-d', 'extension=openssl', '-d', 'extension=mbstring') }   # openssl — https для карточки ссылки (OpenGraph)
# Файловый менеджер: папка пакета передаётся серверу демо переменной окружения (tools/fm-demo.php)
if (-not $FileManager) { $FileManager = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'GitHub\simflex-file-manager' }
if (Test-Path (Join-Path $FileManager 'src/FileManager/Manager.php')) { $env:TED_DEMO_FILE_MANAGER = (Resolve-Path $FileManager).Path; Write-Host "Файловый менеджер: $env:TED_DEMO_FILE_MANAGER`n" }
else { $env:TED_DEMO_FILE_MANAGER = ''; Write-Host "Файловый менеджер не найден (-FileManager <папка simflex-file-manager>) — «Из библиотеки» в демо нет`n" }
Write-Host "Проверка сервера:`n"
& $php @flags (Join-Path $ted 'php/check.php')
$url = "http://127.0.0.1:$Port/examples/admin.html?media=direct"
Write-Host "`nДемо: $url   (Ctrl+C — остановить; проверка в браузере: http://127.0.0.1:$Port/php/check.php)"
# Браузер открываем, когда сервер уже отвечает (иначе «Страница недоступна»)
if (-not $NoOpen) {
  $wait = "for(`$i=0;`$i -lt 60;`$i++){ try{ `$c=New-Object Net.Sockets.TcpClient; `$c.Connect('127.0.0.1',$Port); `$c.Close(); break }catch{ Start-Sleep -Milliseconds 250 } }; Start-Process '$url'"
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile', '-Command', $wait
}
& $php @flags -S "127.0.0.1:$Port" -t $ted (Join-Path $ted 'tools/media-demo.php')
