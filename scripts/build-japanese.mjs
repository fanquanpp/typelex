/**
 * build-japanese.mjs — turns the JLPT N1–N5 CSV exports into public/data/japanese.json.
 *
 * Source: jamsinclair/open-anki-jlpt-decks (MIT). The underlying word list comes
 * from tanos.co.uk (Jonathan Waller, CC-BY) — see ATTRIBUTION.md.
 *
 * The dataset ships expression / reading / English meaning. Rōmaji is derived
 * from the kana reading (never from the kanji form) and Chinese glosses are
 * merged in from scripts/curated/jp-zh.json, which we authored ourselves.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'raw', 'jlpt');
const OUT = path.join(ROOT, 'public', 'data', 'japanese.json');
const CURATED = path.join(ROOT, 'scripts', 'curated', 'jp-zh.json');

/* ------------------------------------------------------------------ */
/* kana -> romaji (Hepburn)                                            */
/* ------------------------------------------------------------------ */

const MONO = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゔ: 'vu'
};

const DIGRAPH = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', きぇ: 'kye',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', しぇ: 'she',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ちぇ: 'che',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', じぇ: 'je',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
  うぇ: 'we', うぃ: 'wi'
};

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

const toHiragana = text => text.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

const kanaToRomaji = input => {
  const text = toHiragana(input);
  let out = '';
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const pair = char + (text[i + 1] ?? '');

    if (char === 'っ') {
      const next = DIGRAPH[pair] ?? MONO[text[i + 1]] ?? '';
      out += next ? next[0] : '';
      i += 1;
      continue;
    }
    if (char === 'ー') {
      const last = out[out.length - 1] ?? '';
      out += VOWELS.has(last) ? last : '';
      i += 1;
      continue;
    }
    if (char === 'ん') {
      const next = DIGRAPH[pair] ?? MONO[text[i + 1]] ?? '';
      out += /^[aiueoy]/.test(next) ? "n'" : 'n';
      i += 1;
      continue;
    }
    if (DIGRAPH[pair]) {
      out += DIGRAPH[pair];
      i += 2;
      continue;
    }
    if (MONO[char]) {
      out += MONO[char];
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* CSV parsing (quoted fields with embedded commas)                     */
/* ------------------------------------------------------------------ */

const parseCsv = file => {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      field = '';
      if (row.length > 1) rows.push(row);
      row = [];
    } else if (char !== '\r') field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.length > 1) rows.push(row);
  }
  return rows;
};

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

/** Normalise a reading for gloss lookup: drop spaces, parentheticals, tilde marks. */
const normalizeKey = value =>
  String(value ?? '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[～〜~\s]/g, '')
    .trim();

const main = () => {
  console.log('TypeLex Japanese data build');
  console.log('===========================');

  const curated = fs.existsSync(CURATED)
    ? JSON.parse(fs.readFileSync(CURATED, 'utf8'))
    : { n5: {}, n4: {} };

  const glosses = new Map();
  for (const level of ['n5', 'n4']) {
    for (const [key, value] of Object.entries(curated[level] ?? {})) {
      glosses.set(normalizeKey(key), value);
    }
  }

  const words = [];
  const seen = new Set();
  const stats = {};

  for (const level of [5, 4, 3, 2, 1]) {
    const file = path.join(RAW, `n${level}.csv`);
    if (!fs.existsSync(file)) {
      console.warn(`  ! missing ${file}`);
      continue;
    }
    const rows = parseCsv(file);
    let kept = 0;
    let zh = 0;

    for (const row of rows) {
      const [expression, reading, meaning] = row;
      const kana = String(reading ?? '').trim();
      const kanji = String(expression ?? '').trim();
      if (!kana) continue;

      /* Skip pure-grammar patterns and any entry whose reading is not kana. */
      if (/^[（(]/.test(kana) || /^[～〜~]/.test(kana) || /[a-zA-Z]/.test(kana)) continue;

      const romaji = kanaToRomaji(kana);
      if (!romaji || !/^[a-z' -]+$/.test(romaji)) continue;

      const key = `${kana}|${romaji}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const chinese = glosses.get(normalizeKey(kana));
      if (chinese) zh += 1;

      words.push({
        kana,
        kanji: kanji === kana ? '' : kanji,
        romaji,
        cn: chinese ?? '',
        en: String(meaning ?? '').trim(),
        pos: '',
        jlpt: level
      });
      kept += 1;
    }

    stats[`n${level}`] = { total: rows.length, kept, withChinese: zh };
    console.log(`  n${level}: ${kept} words (${zh} with Chinese gloss)`);
  }

  /* N5 first, then up — a beginner-facing default order. */
  words.sort((a, b) => b.jlpt - a.jlpt || a.kana.localeCompare(b.kana, 'ja'));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), stats, words }));

  const withChinese = words.filter(w => w.cn).length;
  console.log(`  total: ${words.length} words, ${withChinese} with Chinese gloss (${((withChinese / words.length) * 100).toFixed(1)}%)`);
  console.log('Done.');
};

main();
