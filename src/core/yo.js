// Ted — ёфикатор: «е» → «ё» там, где ё не вызывает сомнений.
// Словарь встроенный (без внешних запросов) и намеренно осторожный: в него входят только корни,
// где «е» вместо «ё» не бывает во всех формах, поэтому нет «все/всё», «моем», «берем», «счета» и т. п.
// Пополняется списками ниже.

const ADJ = 'ый|ого|ому|ым|ом|ая|ой|ую|ое|ые|ых|ыми|ою';
const NOUN = '|а|у|ом|е|ы|ов|ам|ами|ах|ей|и|ь|я|ю|ем|ям|ями|ях|ка|ки|ку|кой|ке|ков|кам|ками|ках';

// Корни в форме с «ё» + набор окончаний
const ADJ_STEMS = ('зелён тёмн чёрн жёлт тёпл твёрд лёгк мёртв чётк дешёв тяжёл весёл жёстк надёжн серьёзн озёрн ёмк пёстр ' +
  'шёлков шёрстн учёбн полётн приёмн зачётн отчётн счётн мёдов лёдян лёгочн ёлочн костёрн берёзов клёнов').split(' ');
const NOUN_STEMS = ('вертолёт самолёт полёт перелёт отчёт расчёт почёт учёт зачёт приём объём подъём съём наём заём ' +
  'актёр ёлк ёрш берёз клён костёр мёд свёкр тёщ щётк учёб тётк чёлк чёрт шёпот шёлк ребёнк телёнк котёнк жеребёнк утёнк ' +
  'орлёнк ягнёнк поросёнк ёмкост плёнк серёжк лётчик дёрн').split(' ');
// Слова целиком (изменяемые формы, где «ё» не везде, и слова с «ё» в окончании)
const WORDS = ('ещё её неё моё твоё своё ничьё чьё лёд лён пёс ёж жён идёт идёшь живёт живёшь берёт берёшь несёт несёшь ведёт ведёшь ' +
  'растёт поёт пьёт даёт даёшь встаёт признаёт продаёт передаёт создаёт узнаёт ждёт ждёшь зовёт течёт печёт жмёт везёт ' +
  'придёт найдёт уйдёт пойдёт зайдёт выйдёт пройдёт подойдёт придёшь найдёшь уйдёшь пойдёшь пришёл ушёл нашёл зашёл ' +
  'прошёл подошёл дошёл вошёл шёл нёс принёс унёс привёз увёз довёз вёз привёл увёл довёл ввёл').split(' ');

const toE = (s) => s.replace(/ё/g, 'е');
const map = new Map();           // «е-форма» целиком → «ё-форма»
const prefixes = [];             // {e: 'зелен', yo: 'зелён', ends: Set}

const addWord = (w) => map.set(toE(w), w);
WORDS.forEach(addWord);
const adjEnds = new Set(ADJ.split('|'));
const nounEnds = new Set(NOUN.split('|'));
for (const s of ADJ_STEMS) prefixes.push({ e: toE(s), yo: s, ends: adjEnds });
for (const s of NOUN_STEMS) prefixes.push({ e: toE(s), yo: s, ends: nounEnds });
prefixes.sort((a, b) => b.e.length - a.e.length);

const WORD_RE = /[А-Яа-яЁё]+/g;

function keepCase(src, yo) {
  if (src === src.toUpperCase() && src.length > 1) return yo.toUpperCase();
  if (src[0] !== src[0].toLowerCase()) return yo[0].toUpperCase() + yo.slice(1);
  return yo;
}

/** Заменяет «е» на «ё» в словах из словаря. Слова, где ё уже стоит, не трогает. */
export function yofy(text) {
  return text.replace(WORD_RE, (word) => {
    if (!/[еЕ]/.test(word)) return word;
    const low = word.toLowerCase();
    if (map.has(low)) return keepCase(word, map.get(low));
    for (const p of prefixes) {
      if (low.length >= p.e.length && low.startsWith(p.e) && p.ends.has(low.slice(p.e.length))) {
        return keepCase(word, p.yo + low.slice(p.e.length));
      }
    }
    return word;
  });
}

/** Добавляет слова сайта в словарь: список слов в форме с «ё» (например, ['щётка']). */
export function registerYo(words) {
  for (const w of words || []) {
    const word = String(w).trim().toLowerCase();
    if (word && /ё/.test(word)) map.set(toE(word), word);
  }
}
