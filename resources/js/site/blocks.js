// Поведение блоков на сайте (этап 5): blocks/<тип>/<тип>.site.js регистрирует функцию siteBlock(fn), content.js вызывает
// её для каждого корня с содержимым (TedContent.mount). Сборка кладёт этот файл перед файлами блоков (build.json → content).
const SITE_BLOCKS = [];
function siteBlock(fn) { SITE_BLOCKS.push(fn); }
