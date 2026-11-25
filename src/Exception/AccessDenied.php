<?php

declare(strict_types=1);

namespace Simflex\Texted\Exception;

use RuntimeException;

/**
 * Нет права на правку: сохранение и загрузка отклоняются (Config::save, Config::respondToUpload) — CMS отвечает 403
 */
final class AccessDenied extends RuntimeException
{
}
