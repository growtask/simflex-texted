# Простой локальный сервер для Windows без PHP и Node.js.
# Запуск из корня репозитория:  pwsh -File tools/serve.ps1   (или powershell -File ...)
# Затем откройте http://localhost:8000/examples/
# Если PHP установлен, вместо этого можно:  php -S localhost:8000

param([int]$Port = 8000)

$root = Split-Path -Parent $PSScriptRoot
$ufRoot = Join-Path (Split-Path -Parent $root) 'uf'
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon'
  '.mp3' = 'audio/mpeg'; '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.pdf' = 'application/pdf'
  '.woff' = 'font/woff'; '.woff2' = 'font/woff2'; '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Ted: http://localhost:$Port/examples/  (Ctrl+C — остановить)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($path -eq '') { $path = 'examples/' }
    # папка файлов демо лежит вне пакета (рядом с ted/, этап 1): /uf/… → ../uf/…
    $base = $root
    if ($path -like 'uf/*' -and (Test-Path $ufRoot -PathType Container)) { $base = $ufRoot; $path = $path.Substring(3) }
    $file = Join-Path $base $path
    if ((Test-Path $file -PathType Container)) { $file = Join-Path $file 'index.html' }
    $full = [System.IO.Path]::GetFullPath($file)
    $res = $ctx.Response
    $res.Headers.Add('Cache-Control', 'no-store')
    if ($full.StartsWith($base + [IO.Path]::DirectorySeparatorChar) -and (Test-Path $full -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes("404: $path")
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($msg, 0, $msg.Length) }
    }
    $res.Close()
    } catch {
      try { $ctx.Response.Abort() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
