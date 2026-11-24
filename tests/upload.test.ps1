param([string]$Php = 'php', [int]$Port = 8151)
$ErrorActionPreference = 'Stop'
$ted = Split-Path -Parent $PSScriptRoot
$temp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$root = Join-Path $temp ('ted-php-smoke-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$previousRoot = $env:TED_FILES_DIR
$previousConfig = $env:TED_CONFIG
$env:TED_FILES_DIR = (Join-Path $root 'uf')   # папка файлов демо (ted.config.php → files.dir) — во временной папке
# свои настройки теста (не ted.config.php рядом с пакетом: в клоне репозитория его нет, файлы ушли бы в пакет)
$env:TED_CONFIG = (Join-Path $root 'ted.config.php')
[IO.File]::WriteAllText($env:TED_CONFIG, "<?php`nreturn ['files' => ['dir' => getenv('TED_FILES_DIR'), 'url' => '/uf']];`n", [Text.UTF8Encoding]::new($false))
$server = "http://127.0.0.1:$Port"
$headers = 'X-Ted-Demo: media'
$proc = $null
try {
  $fixture = Join-Path $root 'photo.png'
  $bitmap = [System.Drawing.Bitmap]::new(8, 8)
  try { $bitmap.Save($fixture, [System.Drawing.Imaging.ImageFormat]::Png) }
  finally { $bitmap.Dispose() }
  # PHP без php.ini (WinGet и т. п.) не грузит gd и fileinfo сам — подключаем из папки ext
  $phpExe = (Get-Command $Php).Source
  $extDir = Join-Path (Split-Path -Parent $phpExe) 'ext'
  $extArgs = @()
  if (Test-Path -LiteralPath $extDir) { $extArgs = @('-d', ('"extension_dir=' + $extDir + '"'), '-d', 'extension=gd', '-d', 'extension=fileinfo') }
  $proc = Start-Process -FilePath $Php -ArgumentList ($extArgs + @('-d', 'opcache.enable=0', '-d', 'opcache.enable_cli=0', '-d', 'upload_max_filesize=5M', '-d', 'post_max_size=6M', '-d', ('"session.save_path=' + $root + '"'), '-S', "127.0.0.1:$Port", '-t', ('"' + $ted + '"'), ('"' + (Join-Path $ted 'tools/media-demo.php') + '"'))) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $root 'php.log')
  for ($i = 0; $i -lt 20; $i++) {
    try { Invoke-WebRequest "$server/examples/admin.html" -TimeoutSec 1 | Out-Null; break }
    catch { Start-Sleep -Milliseconds 200 }
  }

  $cookie = Join-Path $root 'session.cookies'
  $result = curl.exe --fail-with-body --silent --show-error -c $cookie -H $headers -F ('file=@' + $fixture) -F 'kind=image' -F 'pagePath=/ignored/' "$server/ted-demo-media/upload"
  if ($LASTEXITCODE -ne 0) { throw "Upload: $result" }
  try { $asset = $result | ConvertFrom-Json }
  catch { throw "Expected JSON, got: $result" }
  if ($asset.url -notmatch '^/uf/images/company/photo\.webp$') { throw "URL: $result" }
  if (!(Select-String -LiteralPath $cookie -Pattern 'PHPSESSID' -Quiet)) { throw 'Upload session cookie was not stored' }
  $created = Join-Path $root ($asset.url.TrimStart('/'))
  $data = [IO.File]::ReadAllBytes($created)
  if ([Text.Encoding]::ASCII.GetString($data, 8, 4) -ne 'WEBP') { throw 'Expected WebP' }

  $body = Join-Path $root 'body.html'
  Set-Content -LiteralPath $body -Value ('<figure><img src="' + $asset.url + '"></figure>') -NoNewline
  $saved = curl.exe --fail-with-body --silent --show-error -b $cookie -H $headers --data-binary ('@' + $body) "$server/ted-demo-media/save"
  if ($LASTEXITCODE -ne 0 -or !($saved | ConvertFrom-Json).saved -or -not (Test-Path -LiteralPath $created)) { throw 'Referenced image disappeared' }
  # Удаление без CMS: клиент после сохранения шлёт action=delete с адресами файлов, которых больше нет в документе
  function Remove-Uploaded($urls) { (curl.exe --fail-with-body --silent --show-error -b $cookie -H $headers -F 'action=delete' -F ('urls=' + (ConvertTo-Json -InputObject @($urls) -Compress)) "$server/ted-demo-media/upload") | ConvertFrom-Json }
  $deleted = Remove-Uploaded @('/etc/passwd', '/uf/images/other-page/' + ($asset.url -split '/')[-1], $asset.url)
  if ($deleted.removed -ne 1 -or (Test-Path -LiteralPath $created)) { throw "Image was not deleted (or foreign path was touched): $($deleted | ConvertTo-Json -Compress)" }
  # Видео, файл: сохраняются как есть; после сохранения без ссылки на них удаляются (вместе с постером)
  $mp4 = Join-Path $root 'clip.mp4'
  [IO.File]::WriteAllBytes($mp4, [byte[]](0,0,0,24,102,116,121,112,109,112,52,50,0,0,0,0,109,112,52,50,105,115,111,109,0,0,0,8,102,114,101,101))
  $pdf = Join-Path $root 'doc.pdf'
  [IO.File]::WriteAllText($pdf, "%PDF-1.4`n1 0 obj<<>>endobj`ntrailer<<>>`n%%EOF")
  $video = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $mp4) -F 'kind=video' "$server/ted-demo-media/upload") | ConvertFrom-Json
  if ($video.url -notmatch '^/uf/video/company/clip\.mp4$' -or $video.type -ne 'mp4' -or $video.converted) { throw "Video: $($video | ConvertTo-Json -Compress)" }
  # MP3 со служебными данными перед звуком (finfo: application/octet-stream) принимается по содержимому; мусор с расширением .mp3 — нет
  $frame = [byte[]](@(0xFF, 0xFB, 0x90, 0x00) + (@(0) * 413))   # MPEG-1 Layer III, 128 кбит/с, 44,1 кГц: кадр 417 байт
  $mp3Bytes = [byte[]]((@(0) * 700) + $frame + $frame + $frame)
  $mp3 = Join-Path $root 'lead-junk.mp3'; [IO.File]::WriteAllBytes($mp3, $mp3Bytes)
  $audio = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $mp3) -F 'kind=audio' "$server/ted-demo-media/upload") | ConvertFrom-Json
  if ($audio.url -notmatch '^/uf/audio/company/lead-junk\.mp3$') { throw "MP3 with leading data: $($audio | ConvertTo-Json -Compress)" }
  $junk = Join-Path $root 'junk.mp3'; [IO.File]::WriteAllBytes($junk, [byte[]](1..200 | ForEach-Object { ($_ * 37) % 251 }))
  $bad = curl.exe --silent -c $cookie -b $cookie -H $headers -F ('file=@' + $junk) -F 'kind=audio' "$server/ted-demo-media/upload"
  if ($bad -notmatch '"error"' -or $bad -match '"url"') { throw "Junk .mp3 accepted: $bad" }
  # Демо-сервер отдаёт аудио и видео из папки файлов (ted.config.php → files.dir, вне пакета) частями (HTTP Range), иначе браузер не перематывает запись (волна, полоса видео)
  $rangeDir = Join-Path $env:TED_FILES_DIR 'audio'; New-Item -ItemType Directory -Force $rangeDir | Out-Null
  $rangeFile = Join-Path $rangeDir '_range-test.mp3'; [IO.File]::WriteAllBytes($rangeFile, [byte[]](0..199 | ForEach-Object { $_ % 256 }))
  try {
    $rangeHead = curl.exe --silent --show-error -o NUL -D - -H 'Range: bytes=10-19' "$server/uf/audio/_range-test.mp3"
    if (-not ($rangeHead -match '206') -or -not ($rangeHead -match 'Content-Range: bytes 10-19/200') -or -not ($rangeHead -match 'Accept-Ranges: bytes')) { throw "Range: $rangeHead" }
    $outside = curl.exe --silent -o NUL -w '%{http_code}' "$server/uf/../src/MediaStorage.php.mp3"
    if ($outside -eq '206' -or $outside -eq '200') { throw "Range вне uf/ отдал $outside" }
  } finally { Remove-Item -LiteralPath $rangeFile -Force -ErrorAction SilentlyContinue }
  $doc = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $pdf) -F 'kind=file' "$server/ted-demo-media/upload") | ConvertFrom-Json
  if ($doc.url -notmatch '^/uf/files/company/doc\.pdf$') { throw "File: $($doc | ConvertTo-Json -Compress)" }
  $videoPath = Join-Path $root ($video.url.TrimStart('/')); $docPath = Join-Path $root ($doc.url.TrimStart('/'))
  $deleted = Remove-Uploaded @($video.url)
  if ($deleted.removed -ne 1 -or (Test-Path -LiteralPath $videoPath) -or -not (Test-Path -LiteralPath $docPath)) { throw 'Video was not deleted, or the other file disappeared' }
  $deleted = Remove-Uploaded @($doc.url)
  if ($deleted.removed -ne 1 -or (Test-Path -LiteralPath $docPath)) { throw 'File was not deleted' }
  # Названия: кириллица становится латиницей, одинаковые названия получают номер (doc.pdf, doc-2.pdf, doc-3.pdf)
  $slugTest = Join-Path $root 'slug.php'
  [IO.File]::WriteAllText($slugTest, ('<?php require ' + "'" + ((Join-Path $ted 'tests/php/bootstrap.php') -replace '\\', '/') + "'" + '; foreach (["Октябрь 2026 — ТЗ.pdf", "ТЗ_для_Гротеска_правки_после_приёмки_05_11.pdf", "Щука, ёж.docx", "con.pdf", "....pdf"] as $n) echo \Simflex\Texted\MediaStorage::slugify($n), "|";'), [Text.UTF8Encoding]::new($false))
  $slugs = (& $Php $slugTest) -join ''
  if ($slugs -ne 'oktyabr-2026-tz|tz-dlya-groteska-pravki-posle-priyomki-05-11|shchuka-yozh|file-con|file|') { throw "Транслитерация: $slugs" }
  $d1 = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $pdf) -F 'kind=file' "$server/ted-demo-media/upload") | ConvertFrom-Json
  $d2 = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $pdf) -F 'kind=file' "$server/ted-demo-media/upload") | ConvertFrom-Json
  $d3 = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $pdf) -F 'kind=file' "$server/ted-demo-media/upload") | ConvertFrom-Json
  if ($d1.url -notmatch '/doc\.pdf$' -or $d2.url -notmatch '/doc-2\.pdf$' -or $d3.url -notmatch '/doc-3\.pdf$') { throw "Одинаковые названия: $($d1.url) $($d2.url) $($d3.url)" }
  $deleted = Remove-Uploaded @($d1.url, $d2.url, $d3.url)
  if ($deleted.removed -ne 3) { throw 'Файлы с номерами не удалены' }
  # Картинка по ссылке (action=fetch): во внутреннюю сеть сервер не ходит, не https — отказ
  foreach ($bad in @('http://127.0.0.1/a.png', 'http://169.254.169.254/latest/meta-data', 'http://localhost:8150/examples/admin.html', 'file:///etc/passwd', 'javascript:alert(1)')) {
    $r = (curl.exe --silent -b $cookie -H $headers -F 'action=fetch' -F ('url=' + $bad) "$server/ted-demo-media/upload") | ConvertFrom-Json
    if (-not $r.error -or $r.url) { throw "Картинка по ссылке ${bad}: сервер не отказал ($($r | ConvertTo-Json -Compress))" }
  }
  # GIF не конвертируется: сохраняется как есть, анимация остаётся
  $gif = Join-Path $root 'anim.gif'
  [IO.File]::WriteAllBytes($gif, [byte[]](71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59))
  $animated = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $gif) -F 'kind=image' "$server/ted-demo-media/upload") | ConvertFrom-Json
  if ($animated.url -notmatch '^/uf/images/company/anim\.gif$' -or $animated.type -ne 'gif' -or $animated.converted) { throw "GIF: $($animated | ConvertTo-Json -Compress)" }
  $gifBytes = [IO.File]::ReadAllBytes((Join-Path $root ($animated.url.TrimStart('/'))))
  if ([Text.Encoding]::ASCII.GetString($gifBytes, 0, 4) -ne 'GIF8' -or $gifBytes.Length -ne 43) { throw 'GIF was changed' }
  Remove-Uploaded @($animated.url) | Out-Null
  # Этап 3: «двойной» GIF (картинка + HTML со скриптом) не принимается — GIF хранится без пересборки, поэтому проверяется
  $poly = Join-Path $root 'poly.gif'
  [IO.File]::WriteAllBytes($poly, [byte[]](71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59) + [Text.Encoding]::ASCII.GetBytes('<script>alert(1)</script>'))
  $polyAnswer = curl.exe --silent -c $cookie -b $cookie -H $headers -F ('file=@' + $poly) -F 'kind=image' "$server/ted-demo-media/upload"
  if ($polyAnswer -notmatch '"error"' -or $polyAnswer -match '"url"' -or (Test-Path -LiteralPath (Join-Path $root 'uf/images/company/poly.gif'))) { throw "GIF с кодом принят: $polyAnswer" }
  Write-Output 'PHP: «двойной» GIF с HTML отклонён.'
  Write-Output 'PHP: видео, файл и GIF сохраняются как есть; аудио и видео отдаются частями (Range); удаление по запросу после сохранения (без CMS) работает, чужие пути не трогает.'

  # Конвертация в WebM и постер: нужен ffmpeg (TED_FFMPEG или PATH); без него проверка честно пропускается и это видно в отчёте
  $ff = if ($env:TED_FFMPEG) { $env:TED_FFMPEG } else { (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source }
  if ($ff) {
    $avi = Join-Path $root 'clip.avi'
    & $ff -y -v error -f lavfi -i testsrc=duration=1:size=320x180:rate=25 -c:v mpeg4 $avi
    $conv = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $avi) -F 'kind=video' "$server/ted-demo-media/upload") | ConvertFrom-Json
    if ($conv.url -notmatch '\.webm$' -or -not $conv.converted -or $conv.poster -notmatch '\.webp$') { throw "AVI → WebM: $($conv | ConvertTo-Json -Compress)" }
    $webm = [IO.File]::ReadAllBytes((Join-Path $root ($conv.url.TrimStart('/'))))
    if ($webm[0] -ne 0x1A -or $webm[1] -ne 0x45 -or $webm[2] -ne 0xDF -or $webm[3] -ne 0xA3) { throw 'Not a WebM (EBML) file' }
    $poster = [IO.File]::ReadAllBytes((Join-Path $root ($conv.poster.TrimStart('/'))))
    if ([Text.Encoding]::ASCII.GetString($poster, 8, 4) -ne 'WEBP') { throw 'Poster is not WebP' }
    Write-Output 'PHP: AVI → WebM (VP9) и постер WebP из первого кадра проверены.'
  } else {
    # без ffmpeg: AVI принимается как есть, MOV и другие форматы отклоняются понятной ошибкой
    $aviFile = Join-Path $root 'raw.avi'
    [IO.File]::WriteAllBytes($aviFile, [byte[]](82,73,70,70,36,0,0,0,65,86,73,32,76,73,83,84,16,0,0,0,104,100,114,108,97,118,105,104,0,0,0,0,0,0,0,0))
    $rawAvi = (curl.exe --fail-with-body --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $aviFile) -F 'kind=video' "$server/ted-demo-media/upload") | ConvertFrom-Json
    if ($rawAvi.url -notmatch '/raw\.avi$' -or $rawAvi.converted) { throw "AVI без ffmpeg: $($rawAvi | ConvertTo-Json -Compress)" }
    Remove-Uploaded @($rawAvi.url) | Out-Null
    $movFile = Join-Path $root 'clip.mov'
    [IO.File]::WriteAllBytes($movFile, [byte[]](0,0,0,20,102,116,121,112,113,116,32,32,0,0,0,0,113,116,32,32,0,0,0,8,119,105,100,101))
    $movAnswer = curl.exe --silent --show-error -c $cookie -b $cookie -H $headers -F ('file=@' + $movFile) -F 'kind=video' "$server/ted-demo-media/upload"
    if ($movAnswer -notmatch '"error".*ffmpeg') { throw "MOV без ffmpeg должен отклоняться: $movAnswer" }
    Write-Output 'PHP: без ffmpeg принимаются MP4, AVI и WebM, MOV отклоняется с понятной ошибкой; конвертацию в WebM и серверный постер не проверяли (задайте TED_FFMPEG).'
  }
  Write-Output 'PHP: PNG → WebP, public page path, retention and deletion after save passed.'

  # Этап 2: набор поля и право на правку решает сервер (в демо — сессия), а не запрос браузера
  [Console]::OutputEncoding = [Text.Encoding]::UTF8   # ответы с кириллицей
  $roCookie = Join-Path $root 'readonly.cookies'
  $null = curl.exe --fail-with-body --silent --show-error -c $roCookie "$server/ted-demo-media/config.js?preset=mini&access=ro"
  $forged = Join-Path $root 'forged.html'
  Set-Content -LiteralPath $forged -Value '<h2>Заголовок</h2><blockquote class="ted-callout"><p>Совет</p></blockquote>' -NoNewline -Encoding utf8NoBOM
  $code = curl.exe --silent -o NUL -w '%{http_code}' -b $roCookie -H $headers --data-binary ('@' + $forged) "$server/ted-demo-media/save"
  if ($code -ne '403') { throw "Без права правки сохранение должно отклоняться (403), ответ $code" }
  $code = curl.exe --silent -o NUL -w '%{http_code}' -b $roCookie -H $headers -F ('file=@' + $fixture) -F 'kind=image' "$server/ted-demo-media/upload"
  if ($code -ne '403') { throw "Без права правки загрузка должна отклоняться (403), ответ $code" }
  if (Test-Path -LiteralPath (Join-Path $root 'uf/images/company/photo-2.webp')) { throw 'Без права правки файл записан на диск' }
  $miniCookie = Join-Path $root 'mini.cookies'
  $cfg = curl.exe --fail-with-body --silent --show-error -c $miniCookie "$server/ted-demo-media/config.js?preset=mini"
  if ($cfg -notmatch '"preset":"mini"' -or $cfg -notmatch '"canEdit":true') { throw "Настройки браузера без набора: $cfg" }
  $savedMini = (curl.exe --fail-with-body --silent --show-error -b $miniCookie -H $headers --data-binary ('@' + $forged) "$server/ted-demo-media/save") | ConvertFrom-Json
  if ($savedMini.html -notmatch '<h2>Заголовок</h2>' -or $savedMini.html -match 'ted-callout' -or $savedMini.html -notmatch 'Совет') { throw "mini: выноска должна стать текстом: $($savedMini.html)" }
  Write-Output 'PHP: без права правки сохранение и загрузка отклоняются (403); набор mini — подделанная выноска сохраняется текстом.'
} catch {
  if (Test-Path -LiteralPath (Join-Path $root 'php.log')) { Get-Content -LiteralPath (Join-Path $root 'php.log') -Tail 20 }
  throw
} finally {
  if ($proc) { Stop-Process -Id $proc.Id -ErrorAction SilentlyContinue }
  $env:TED_FILES_DIR = $previousRoot
  $env:TED_CONFIG = $previousConfig
  $resolved = (Resolve-Path -LiteralPath $root).ProviderPath
  if ([IO.Path]::GetDirectoryName($resolved) -eq $temp -and [IO.Path]::GetFileName($resolved) -match '^ted-php-smoke-[a-f0-9]{32}$') {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
