import { yofy } from './yo.js';
// Ted — типографика «Форматировать текст» (✨): русский и английский, правила в духе СБОЛ.
// Правила разбиты на категории (TYPO_CATEGORIES): каждую можно отключить, для каждой считается число правок.
// Работает по текстовым узлам блоков, не трогает код (<code>, <pre>), адреса и слова-исключения. Регистр не меняет.

const NBSP = ' ';

/** Категории правок: id, подпись в панели. Порядок — порядок в панели. */
export const TYPO_CATEGORIES = [
  { id: 'quotes', label: 'Кавычки' },
  { id: 'dashes', label: 'Тире и диапазоны' },
  { id: 'punct', label: 'Знаки препинания' },
  { id: 'spaces', label: 'Лишние пробелы' },
  { id: 'nbsp', label: 'Неразрывные пробелы' },
  { id: 'numbers', label: 'Числа и валюта' },
  { id: 'phones', label: 'Телефоны' },
  { id: 'symbols', label: 'Символы и единицы' },
  { id: 'terms', label: 'Термины' },
  { id: 'yo', label: 'Буква ё' },
];

// Короткие слова, после которых пробел должен быть неразрывным (русский)
const RU_SHORT = '(?:[А-Яа-яЁё]{1,3}|что|если|чтобы|как|так|также|или|для|без|над|под|при|про|это|все|уже|ещё|даже|либо|между|через|перед|после)';
const RU_SHORT_RE = new RegExp(`(^|[\\s${NBSP}«„("—–-])(${RU_SHORT}) +(?=\\S)`, 'gi');
// Короткие слова английского: артикли и предлоги не отрываем от следующего слова
const EN_SHORT_RE = /(^|[\s"“(])(a|an|the|of|in|on|to|at|by|or|as|is|it|if|we|my|no|so|up|do|go|he|me|us) +(?=\S)/gi;

const UNITS = '%|₽|\\$|€|руб\\.?|р\\.|коп\\.|км\\/ч|м\\/с|кг|км|мм|см|дм|мг|мл|шт\\.?|лет|года?|гг\\.|г\\.|мин\\.?|сек\\.?|ч\\.|ГБ|МБ|КБ|ТБ|Гб|Мб|Кб|dpi|px|кВт|Вт|кГц|МГц|ГГц|Гц|°C|м²|м³|см²|см³|км²|мс|мкс|м|г|л|В|А';
const RU_TAIL_UNITS = new RegExp(`(\\d) +(${UNITS})(?![\\wА-Яа-яЁё])`, 'g');

const SP = '[ \\t\\u00a0]';            // пробел или неразрывный
const MONTHS = 'январ[ьяе]|феврал[ьяе]|март[ае]?|апрел[ьяе]|ма[йяе]|июн[ьяе]|июл[ьяе]|август[ае]?|сентябр[ьяе]|октябр[ьяе]|ноябр[ьяе]|декабр[ьяе]';
const DAYS = 'понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресень[ея]';
const ABBR_NOBREAK = '(?:г|гг|обл|ул|пр-т|пр|кв|корп|стр|д|оф|илл|рис|табл|им|пос|пл|пер|наб|тел|ст|гл|с|мкр|эт|пом|вл)';
const LEGAL = '(?:АО|ОАО|ЗАО|ООО|ПАО|ИП|НКО|ФГУП)';
const CUR_SIGN = { usd: '$', eur: '€', руб: '₽', р: '₽', rur: '₽', rub: '₽' };
const NOT_LETTER = '(?<![A-Za-zА-Яа-яЁё])';

export function detectLang(text) {
  const cyr = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const lat = (text.match(/[A-Za-z]/g) || []).length;
  return cyr >= lat ? 'ru' : 'en';
}

// ---------------------------------------------------------------------------
// Сравнение строк: сколько «правок» и где (для счётчиков и подсветки)
// ---------------------------------------------------------------------------

const TOKEN = /[\p{L}\p{N}]+|[\s\S]/gu;
function tokens(s) {
  const out = [];
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(s); m; m = TOKEN.exec(s)) out.push({ t: m[0], i: m.index });
  return out;
}

/** Отличия b от a: массив {start, end} — диапазоны символов в b. Пустой, если строки равны. */
export function diffRanges(a, b) {
  if (a === b) return [];
  const A = tokens(a);
  const B = tokens(b);
  let p = 0;
  while (p < A.length && p < B.length && A[p].t === B[p].t) p += 1;
  let q = 0;
  while (q < A.length - p && q < B.length - p && A[A.length - 1 - q].t === B[B.length - 1 - q].t) q += 1;
  const a2 = A.slice(p, A.length - q);
  const b2 = B.slice(p, B.length - q);
  const n = a2.length;
  const m = b2.length;
  const posAt = (j) => (j < m ? b2[j].i : (b2[m - 1] ? b2[m - 1].i + b2[m - 1].t.length : (B[p] ? B[p].i : b.length)));
  if (!n && !m) return [];
  if (n * m > 250000) return [{ start: posAt(0), end: posAt(m) }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a2[i].t === b2[j].t ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let cur = null;
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a2[i].t === b2[j].t && dp[i][j] === dp[i + 1][j + 1] + 1) { cur = null; i += 1; j += 1; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) {
      const tk = b2[j];
      if (!cur) { cur = { start: tk.i, end: tk.i + tk.t.length }; hunks.push(cur); } else cur.end = tk.i + tk.t.length;
      j += 1;
    } else {
      if (!cur) { const pos = posAt(j); cur = { start: pos, end: pos }; hunks.push(cur); }
      i += 1;
    }
  }
  return hunks;
}

// ---------------------------------------------------------------------------
// Правила
// ---------------------------------------------------------------------------

// Устойчивые написания (СБОЛ): латинские термины работают в любом тексте, русские — только в русском
const TERMS_ANY = [
  [new RegExp(`${NOT_LETTER}master[\\s-]?card(?![A-Za-z])`, 'gi'), 'Mastercard'],
  [new RegExp(`${NOT_LETTER}google[\\s-]?pay(?![A-Za-z])`, 'gi'), 'Google Pay'],
  [new RegExp(`${NOT_LETTER}apple[\\s-]?pay(?![A-Za-z])`, 'gi'), 'Apple Pay'],
  [new RegExp(`${NOT_LETTER}wi[\\s-]?fi(?![A-Za-z])`, 'gi'), 'Wi-Fi'],
  [new RegExp(`${NOT_LETTER}e-?mail(?![A-Za-z])`, 'gi'), 'email'],
  [new RegExp(`${NOT_LETTER}qr[\\s-]?код`, 'gi'), 'QR-код'],
  [new RegExp(`${NOT_LETTER}(cvv|cvc)(2?)[\\s-]?код`, 'gi'), (m, a, b) => `${a.toUpperCase()}${b}-код`],
  [new RegExp(`${NOT_LETTER}(cvv|cvc)(?![A-Za-z0-9])`, 'gi'), (m, a) => a.toUpperCase()],
  [new RegExp(`${NOT_LETTER}push[\\s-]?(уведомлени)`, 'gi'), 'Push-$1'],
];
const TERMS_RU = [
  [/(?<![А-Яа-яЁё])пин[\s-]?код/gi, 'ПИН-код'],
  [/(?<![А-Яа-яЁё])сим[\s-]?карт/gi, 'сим-карт'],
  [/(?<![А-Яа-яЁё])смс(?![А-Яа-яЁё])/gi, 'СМС'],
  [/(?<![А-Яа-яЁё])офф?-?лайн/gi, 'офлайн'],
  [/(?<![А-Яа-яЁё])он-?лайн/gi, 'онлайн'],
  [/(?<![А-Яа-яЁё])мск(?![А-Яа-яЁё])/gi, 'мск'],
];

const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function terms(s, ru, extra) {
  for (const [re, to] of TERMS_ANY) s = s.replace(re, to);
  if (ru) for (const [re, to] of TERMS_RU) s = s.replace(re, to);
  // свои термины сайта: [что, как] — строка (слово целиком, без учёта регистра) или RegExp
  for (const [from, to] of extra || []) {
    const re = from instanceof RegExp ? from : new RegExp(`(?<![\\p{L}\\d])${escapeRe(String(from))}(?![\\p{L}\\d])`, 'giu');
    s = s.replace(re, to);
  }
  return s;
}

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

/** Валюта и числа перед ней (СБОЛ): ₽ $ €, группы по тысячам, запятая, копейки, тыс. / млн / млрд / трлн. */
function currency(s) {
  const unit = '(?:тыс\\.|(?:млн|млрд|трлн)\\.?)';
  // знак впереди: «$ 109», «$109» → «109 $»
  s = s.replace(new RegExp(`([$€₽])${SP}*(\\d+(?:[\\u00a0 ]\\d{3})*(?:[.,]\\d+)?)`, 'g'), '$2 $1');
  // копейки сливаем: «45 руб. 5 коп.» → «45,05 ₽»
  s = s.replace(new RegExp(`(\\d+)${SP}*(?:руб\\.?|р\\.|₽)${SP}*(\\d{1,2})${SP}*коп\\.?(?![А-Яа-яЁё])`, 'gi'), (m, r, k) => `${r},${k.padStart(2, '0')} ₽`);
  // слова-валюты → знак
  s = s.replace(new RegExp(`(\\d|${unit})${SP}*(usd|eur|rur|rub|руб(?:лей|ля|ль)?\\.?|р\\.|р)(?![A-Za-zА-Яа-яЁё0-9])`, 'gi'), (m, a, w) => {
    const key = w.toLowerCase().replace(/\.$/, '').replace(/^руб.*/, 'руб');
    return `${a} ${CUR_SIGN[key] || w}`;
  });
  // знак после числа через неразрывный пробел
  s = s.replace(new RegExp(`(\\d|${unit})${SP}*([$€₽])`, 'g'), '$1 $2');
  // тыс. — с точкой, млн / млрд / трлн — без
  s = s.replace(/(\d)[\s ]*тыс\.?(?![А-Яа-яЁё])/gi, '$1 тыс.');
  s = s.replace(/(\d)[\s ]*(млн|млрд|трлн)\.?(?![А-Яа-яЁё])/gi, '$1 $2');
  // группы тысяч и запятая — только у сумм
  s = s.replace(new RegExp(`(?<![\\d.,])(\\d+(?:[\\u00a0 ]\\d{3})*)(?:[.,](\\d{1,2}))?(?=\\u00a0(?:${unit}\\u00a0)?[$€₽])`, 'g'),
    (m, int, frac) => groupThousands(int.replace(/[  ]/g, '')) + (frac ? `,${frac}` : ''));
  // процент без пробела
  s = s.replace(/(\d)[ \t ]+%/g, '$1%');
  return s;
}

/** Телефоны (СБОЛ): 8 800 555-55-50, +7 495 500-55-50, +7 4212 79-40-35. */
function phones(s, keep) {
  const hold = (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0002`; };
  const four = /(?<![\d])(?:\+7|8)[\s-]*\(?(\d{4})\)?[\s ]+(\d{2})-(\d{2})-(\d{2})(?!\d)/g;
  s = s.replace(four, (m, a, b, c, d) => hold(`+7 ${a} ${b}-${c}-${d}`));
  const gen = /(?<![\d])(\+7|8|7)[\s-]*\(?(\d{3})\)?[\s-]*(\d{3})[\s-]*(\d{2})[\s-]*(\d{2})(?!\d)/g;
  return s.replace(gen, (m, p, a, b, c, d) => hold(a === '800' ? `8 800 ${b}-${c}-${d}` : `+7 ${a} ${b}-${c}-${d}`));
}

/** Символы, единицы, стрелки, дроби. */
function symbols(s) {
  s = s.replace(/\(c\)/gi, '©').replace(/\(r\)/gi, '®').replace(/\(tm\)/gi, '™');
  s = s.replace(/\+-/g, '±');
  s = s.replace(/(?<=\s|^)->(?=\s|$)/g, '→').replace(/(?<=\s|^)<-(?=\s|$)/g, '←');
  s = s.replace(/(?<=\s)!=(?=\s)/g, '≠').replace(/(?<=\s)<=(?=\s)/g, '≤').replace(/(?<=\s)>=(?=\s)/g, '≥');
  // 1920x1080 и 5 x 3 → ×  (0x1F не трогаем)
  s = s.replace(/(?<!\b0)(?<=\d)[xх](?=\d)/g, '×');
  s = s.replace(/(?<=\d) [xх] (?=\d)/g, ' × ');
  // дроби
  s = s.replace(/(?<![\d/.,])1\/2(?![\d/])/g, '½').replace(/(?<![\d/.,])1\/4(?![\d/])/g, '¼').replace(/(?<![\d/.,])3\/4(?![\d/])/g, '¾')
    .replace(/(?<![\d/.,])1\/3(?![\d/])/g, '⅓').replace(/(?<![\d/.,])2\/3(?![\d/])/g, '⅔');
  // градусы: «20 C», «20°С» → «20 °C» (латинская C)
  s = s.replace(/(\d)[ \t ]*[°º˚][ \t ]*([CFСсf])(?![A-Za-zА-Яа-яЁё])/g, (m, d, u) => `${d} °${u === 'С' || u === 'с' || u === 'C' ? 'C' : u.toUpperCase()}`);
  // квадратные и кубические единицы: 20 м2 → 20 м²
  s = s.replace(/(\d[ \t ]*)(мм|см|дм|км|м|га)([23])(?![\dA-Za-zА-Яа-яЁё])/g, (m, pre, u, p) => `${pre}${u}${p === '2' ? '²' : '³'}`);
  return s;
}

/** Тире: между словами, в начале строки и предложения, диапазоны. */
function dashes(s, ru) {
  // минус перед числом (решение 22.11: только перед числом): «-5 °C», «(-3)», «= -2,5» → «−5»; дефис между буквами и цифрами не трогаем
  s = s.replace(/(^|[\s(=:;«"„])-(?=\d)/g, '$1−');
  s = s.replace(/([^\s-])\s+(?:--|-|–|—)\s+(?=\S)/g, `$1${ru ? NBSP : ' '}— `);
  s = s.replace(/(\S)--(\S)/g, '$1—$2');
  if (!ru) return s;
  // в начале строки и предложения: «— » с неразрывным пробелом
  s = s.replace(/^[ \t]*(?:--|-|–|—)(?:[ \t ]+|(?=[А-Яа-яЁё«„"]))/, '— ');
  s = s.replace(/([.!?…])[ \t]+(?:--|-|–|—)[ \t ]+(?=[А-ЯЁ«„"])/g, '$1 — ');
  // диапазоны: числа, время, даты, римские цифры, месяцы, дни недели — короткое тире без пробелов
  s = s.replace(/(?<![\d-])(\d+)[ \t ]*[-–—][ \t ]*(\d+)(?![\d-])/g, '$1–$2');
  s = s.replace(/(\d{1,2}:\d{2})[ \t]*[-–—][ \t]*(\d{1,2}:\d{2})/g, '$1–$2');
  s = s.replace(/(?<![A-Za-zА-Яа-яЁё])([IVXLC]{1,6})[ \t]*[-–—][ \t]*([IVXLC]{1,6})(?![A-Za-zА-Яа-яЁё])/g, '$1–$2');
  s = s.replace(new RegExp(`(?<![А-Яа-яЁё])(${MONTHS})[ \\t]*[-–—][ \\t]*(${MONTHS})(?![А-Яа-яЁё])`, 'gi'), '$1–$2');
  s = s.replace(new RegExp(`(?<![А-Яа-яЁё])(${DAYS})[ \\t]*[-–—][ \\t]*(${DAYS})(?![А-Яа-яЁё])`, 'gi'), '$1–$2');
  return s;
}

/** Знаки препинания: многоточие, «?!», повторы, точка за кавычкой, точка в конце заголовка. */
function punct(s, ru, block) {
  // русские знаки до многоточия: «!?» → «?!», «...?» и «?...» → «?‥», «...!» и «!...» → «!‥»
  if (ru) s = s.replace(/!\?/g, '?!').replace(/(?:…|\.{3})\?|\?(?:…|\.{3})/g, '?‥').replace(/(?:…|\.{3})!|!(?:…|\.{3})/g, '!‥');
  s = s.replace(/\.{3,}/g, '…').replace(/…{2,}/g, '…');
  if (!ru) return s;
  s = s.replace(/([?!,;:])\1+/g, '$1');
  s = s.replace(/(?<!\.)\.{2}(?!\.)/g, '.');
  // точка уходит из-под закрывающей кавычки: «текст.» → «текст».
  s = s.replace(/(?<![.…!?])\.([»“”])/g, '$1.');
  // убрать точку в конце одно-предложенческой строки (заголовок, пункт списка)
  if (block && /^(H[2-6]|LI)$/.test(block) && !/[.!?…][ \t ]+\S/.test(s)) s = s.replace(/(?<![.…!?])\.[ \t ]*$/, '');
  return s;
}

/** Лишние пробелы: подряд идущие, у знаков препинания и скобок, после знаков. */
function spaces(s) {
  s = s.replace(/[ \t]{2,}/g, ' ');
  s = s.replace(/[ \t ]+([,.;:!?…‥%)\]»”])(?!\d)/g, '$1');
  s = s.replace(/([(\[«“„])[ \t ]+/g, '$1');
  s = s.replace(/([,;!?])(?=[A-Za-zА-Яа-яЁё«“"(])/g, '$1 ');
  s = s.replace(/([А-Яа-яЁё]{2,}|[a-z]{2,})([:])(?=[A-Za-zА-Яа-яЁё«“])/g, '$1$2 ');
  s = s.replace(/([a-zа-яё]{2,})\.(?=[A-ZА-ЯЁ][a-zа-яё])/g, '$1. ');
  return s;
}

/** Неразрывные пробелы. */
function nbspRules(s, ru) {
  if (!ru) {
    s = s.replace(EN_SHORT_RE, (m, pre, w) => `${pre}${w}${NBSP}`);
    return s.replace(/(\d) +(%|km|kg|mm|cm|GB|MB|KB|TB|px|dpi)(?![A-Za-z])/g, `$1${NBSP}$2`);
  }
  s = s.replace(/(?<![А-Яа-яЁё])([А-ЯЁ]\.)[\s ]*(?=[А-ЯЁ]\.)/g, '$1');                          // А. А. → А.А.
  s = s.replace(/(?<![А-Яа-яЁё])([А-ЯЁ]\.)[ \t]*(?=[А-ЯЁ][а-яё])/g, '$1 ');                     // А.А. Иванов
  s = s.replace(/([А-ЯЁ][а-яё]+)[ \t]+(?=[А-ЯЁ]\.)/g, '$1 ');                                  // Петров К.П.
  s = s.replace(/(?<=\S)[ \t ]+(и)[ \t ]+(т)\.[ \t ]*(д|п)\./gi, ' $1 $2. $3.');
  s = s.replace(/(?<=\S)[ \t ]+(и)[ \t ]+(др|пр)\./gi, ' $1 $2.');
  s = s.replace(/(\d)[ \t]+(?=[A-Za-zА-Яа-яЁё])/g, '$1 ');                                      // число + слово
  s = s.replace(/[ \t]+(?=(?:б|бы|ж|же|ли|ль)(?![А-Яа-яЁё]))/gi, ' ');                           // частицы
  s = s.replace(new RegExp(`(?<![А-Яа-яЁё.])(${ABBR_NOBREAK}\\.|№|§)[ \\t]+(?=\\S)`, 'g'), '$1 '); // г. ул. кв. № §
  s = s.replace(new RegExp(`(${LEGAL})[ \\t]+(?=[«„"A-ZА-ЯЁ])`, 'g'), '$1 ');                     // ООО «…»
  // последнее короткое слово предложения и строки
  s = s.replace(/[ \t]+(?=[А-Яа-яЁё]{1,4}[»”)]*(?:[.!?…‥]+|$)(?:[ \t ]|$))/g, ' ');
  // слова до трёх букв и союзы не отрываем от следующего слова
  s = s.replace(RU_SHORT_RE, (m, pre, w) => `${pre}${w}${NBSP}`);
  s = s.replace(RU_SHORT_RE, (m, pre, w) => `${pre}${w}${NBSP}`); // подряд идущие «и в», «а в»
  s = s.replace(RU_TAIL_UNITS, `$1${NBSP}$2`);
  return s.replace(/(\d{1,3}(?: \d{3})+)(?![\d])/g, (m) => m.replace(/ /g, NBSP));
}

function quotes(s, lang, state) {
  const ru = lang === 'ru';
  const open1 = ru ? '«' : '“';
  const close1 = ru ? '»' : '”';
  const open2 = ru ? '„' : '‘';
  const close2 = ru ? '“' : '’';
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c !== '"' && c !== '“' && c !== '”' && c !== '«' && c !== '»' && c !== '„') { out += c; continue; }
    const prev = s[i - 1];
    const next = s[i + 1];
    const startsWord = !prev || /[\s(\[{—–-]/.test(prev) || prev === NBSP || (prev && /[«„“]/.test(prev));
    const endsWord = !next || /[\s)\].,;:!?…—–-]/.test(next) || next === NBSP || (next && /[»”“]/.test(next));
    // «ёлочки» и „лапки“ уже стоят — нормализуем к нужному виду
    let opening;
    if (c === '«' || c === '“' && ru === false || c === '„') opening = true;
    else if (c === '»' || c === '”') opening = false;
    else opening = startsWord && !endsWord ? true : (!startsWord && endsWord ? false : state.depth === 0);
    if (opening) {
      out += state.depth === 0 ? open1 : open2;
      state.depth += 1;
    } else {
      if (state.depth > 0) state.depth -= 1;
      out += state.depth === 0 ? close1 : close2;
    }
  }
  return out;
}

/**
 * Исправляет строку. state.depth — вложенность кавычек (переносится между узлами одного блока).
 * block — имя тега блока. ctx: { off: Set категорий, stats: {категория: число правок}, protect: RegExp, terms: [] }.
 */
export function typografText(text, lang, state = { depth: 0 }, block = '', ctx = {}) {
  if (!text) return text;
  const off = ctx.off || new Set();
  const stats = ctx.stats || null;
  const ru = lang === 'ru';
  // адреса, почта, слова-исключения не трогаем: прячем под метки и возвращаем в конце
  const keep = [];
  const hold = (m) => { keep.push(m); return `\u0001${keep.length - 1}\u0002`; };
  let s = text.replace(/(?:https?:\/\/|www\.|mailto:)\S+|[\w.+-]+@[\w-]+\.[\w.-]+|\b[\w-]+\.[a-z]{2,6}(?:\/\S*)/gi, hold);
  if (ctx.protect) s = s.replace(ctx.protect, hold);

  const step = (cat, fn) => {
    if (off.has(cat)) return;
    const before = s;
    s = fn(s);
    if (stats && s !== before) stats[cat] = (stats[cat] || 0) + diffRanges(before, s).length;
  };

  if (ru) step('phones', (v) => phones(v, keep));
  step('spaces', (v) => v.replace(/[ \t]{2,}/g, ' '));
  step('symbols', symbols);
  step('punct', (v) => punct(v, ru, ctx.single ? block : ''));
  step('dashes', (v) => dashes(v, ru));
  step('quotes', (v) => quotes(v, lang, state));
  // точка уходит из-под закрывающей кавычки — после того, как кавычки приведены к «ёлочкам»
  if (ru) step('punct', (v) => v.replace(/(?<![.…!?])\.([»“”])/g, '$1.'));
  step('spaces', spaces);
  step('terms', (v) => terms(v, ru, ctx.terms));
  if (ru) step('yo', yofy);
  step('numbers', (v) => (ru ? currency(v) : v));
  step('nbsp', (v) => nbspRules(v, ru));
  // апостроф в английском: don't → don’t
  if (!ru) step('punct', (v) => v.replace(/([A-Za-z])'([a-z])/g, '$1’$2'));

  return s.replace(/\u0001(\d+)\u0002/g, (m, i) => keep[Number(i)]);
}

const SKIP = 'code, pre, kbd, samp, script, style';

/** Слова-исключения → RegExp для typografText (ctx.protect). */
export function protectRegExp(words) {
  const list = (words || []).map((w) => String(w).trim()).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  return new RegExp(`(?<![\\p{L}\\d])(?:${list.map(escapeRe).join('|')})(?![\\p{L}\\d])`, 'gu');
}

/**
 * Обходит блоки и исправляет текстовые узлы.
 * Возвращает { changed, edits: [{ node, before }], stats } (edits — для подсветки и отката).
 * opts: { lang: 'ru' | 'en' | 'auto', off: Set, protect: RegExp, terms: [] }
 */
export function typografBlocks(blocks, opts = {}) {
  const lang = opts.lang || 'auto';
  const stats = {};
  const edits = [];
  for (const block of blocks) {
    if (!block || block.nodeType !== 1 || block.matches(SKIP) || block.classList.contains('ted-ui-raw')) continue;
    const l = lang === 'auto' ? detectLang(block.textContent || '') : lang;
    const state = { depth: 0 };
    const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement && n.parentElement.closest(SKIP)) continue;
      nodes.push(n);
    }
    nodes.forEach((n, i) => {
      const tag = nodes.length === 1 ? (n.parentElement.closest('li, h2, h3, h4, h5, h6, p, blockquote') || block).tagName : '';
      let next = typografText(n.data, l, state, tag, { off: opts.off, stats, protect: opts.protect, terms: opts.terms, single: nodes.length === 1 });
      // пробел между узлами (…слово </b>…) не схлопываем с соседним
      if (i === 0) next = next.replace(/^[ \t]+(?=\S)/, (m) => (block.tagName === 'LI' || block.tagName === 'P' ? '' : m));
      if (i === nodes.length - 1) next = next.replace(/[ \t]+$/, '');
      if (next !== n.data) { edits.push({ node: n, before: n.data }); n.data = next; }
    });
  }
  return { changed: edits.length, edits, stats };
}
