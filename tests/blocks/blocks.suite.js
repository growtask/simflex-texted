// Набор blocks (этап 5): реестр и тесты каждого блока из его папки — список блоков из bin/build.json → blocks.
import './registry.test.js';
import './fixes-2211.test.js';
import './fixes-2311.test.js';

const BUILD = await (await fetch(new URL('../../bin/build.json', import.meta.url), { cache: 'no-store' })).json();
for (const b of BUILD.blocks) await import(`../../blocks/${b}/${b}.test.js`);
