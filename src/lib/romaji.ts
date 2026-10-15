/**
 * Kana → rōmaji conversion.
 *
 * Two romanisation systems are supported so learners can match whichever their
 * textbook uses:
 *   - hepburn: し = shi, つ = tsu, ふ = fu, じ = ji, ちゃ = cha
 *   - kunrei:  し = si, つ = tu, ふ = hu, じ = zi, ちゃ = tya
 *
 * Handles the three things that actually break naive converters:
 *   1. small tsu っ — geminates the following consonant (がっこう → gakkou)
 *   2. syllabic ん — becomes n', not n, before a vowel or y (しんいち → shin'ichi)
 *   3. long vowel mark ー — repeats the previous vowel in Hepburn
 */

import type { RomajiStyle } from './types';

export type { RomajiStyle };

const MONOGRAPHS: Record<RomajiStyle, Record<string, string>> = {
  hepburn: {
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
  },
  kunrei: {
    あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
    か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
    さ: 'sa', し: 'si', す: 'su', せ: 'se', そ: 'so',
    た: 'ta', ち: 'ti', つ: 'tu', て: 'te', と: 'to',
    な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
    は: 'ha', ひ: 'hi', ふ: 'hu', へ: 'he', ほ: 'ho',
    ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
    や: 'ya', ゆ: 'yu', よ: 'yo',
    ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
    わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'o', ん: 'n',
    が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
    ざ: 'za', じ: 'zi', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
    だ: 'da', ぢ: 'zi', づ: 'zu', で: 'de', ど: 'do',
    ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
    ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
    ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
    ゔ: 'vu'
  }
};

const DIGRAPHS: Record<RomajiStyle, Record<string, string>> = {
  hepburn: {
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
    ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
    てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
    うぇ: 'we', うぃ: 'wi',
    ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo'
  },
  kunrei: {
    きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', きぇ: 'kye',
    しゃ: 'sya', しゅ: 'syu', しょ: 'syo', しぇ: 'sye',
    ちゃ: 'tya', ちゅ: 'tyu', ちょ: 'tyo', ちぇ: 'tye',
    にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
    ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
    みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
    りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
    ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
    じゃ: 'zya', じゅ: 'zyu', じょ: 'zyo', じぇ: 'zye',
    びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
    ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
    ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', ふゅ: 'fyu',
    てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
    うぇ: 'we', うぃ: 'wi',
    ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo'
  }
};

/** Katakana → hiragana so a single table handles both scripts. */
const katakanaToHiragana = (text: string) =>
  text.replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60));

const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);

export interface RomajiSegment {
  /** the kana chunk this rōmaji came from */
  kana: string;
  /** the rōmaji produced */
  romaji: string;
}

/**
 * Convert kana to rōmaji, returning both the flat string and a per-chunk
 * segmentation (used to highlight which kana the cursor is inside).
 */
export const kanaToRomajiSegments = (input: string, style: RomajiStyle = 'hepburn'): RomajiSegment[] => {
  const mono = MONOGRAPHS[style];
  const digraph = DIGRAPHS[style];
  const text = katakanaToHiragana(input);
  const segments: RomajiSegment[] = [];
  let index = 0;

  const peek = (offset = 0) => text[index + offset] ?? '';

  while (index < text.length) {
    const char = peek();
    const pair = char + peek(1);

    /* small tsu — geminate the next consonant */
    if (char === 'っ') {
      const next = digraph[pair] ?? mono[peek(1)] ?? '';
      const doubled = next ? next[0] + next : '';
      segments.push({ kana: char, romaji: doubled });
      index += 1;
      continue;
    }

    /* long vowel mark */
    if (char === 'ー') {
      const previous = segments[segments.length - 1]?.romaji ?? '';
      const last = previous[previous.length - 1] ?? '';
      segments.push({ kana: char, romaji: VOWELS.has(last) ? last : '' });
      index += 1;
      continue;
    }

    /* syllabic n — n' before a vowel or y */
    if (char === 'ん') {
      const next = mono[peek(1)] ?? digraph[pair] ?? '';
      const needsApostrophe = next.startsWith('a') || next.startsWith('i') || next.startsWith('u') ||
        next.startsWith('e') || next.startsWith('o') || next.startsWith('y');
      segments.push({ kana: char, romaji: needsApostrophe ? "n'" : 'n' });
      index += 1;
      continue;
    }

    if (digraph[pair]) {
      segments.push({ kana: pair, romaji: digraph[pair] });
      index += 2;
      continue;
    }

    if (mono[char]) {
      segments.push({ kana: char, romaji: mono[char] });
      index += 1;
      continue;
    }

    /* anything else (kanji, latin, punctuation) passes through untouched */
    segments.push({ kana: char, romaji: char });
    index += 1;
  }

  return segments;
};

export const kanaToRomaji = (input: string, style: RomajiStyle = 'hepburn'): string =>
  kanaToRomajiSegments(input, style)
    .map(segment => segment.romaji)
    .join('');

/**
 * Loose comparison for grading typed rōmaji: accepts both romanisations and
 * ignores the n' apostrophe, so a learner is never marked wrong for using a
 * different but valid system.
 */
export const romajiMatches = (typed: string, target: string): boolean => {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/si/g, 'shi')
      .replace(/ti/g, 'chi')
      .replace(/tu/g, 'tsu')
      .replace(/hu/g, 'fu')
      .replace(/zi/g, 'ji')
      .replace(/sya/g, 'sha')
      .replace(/syu/g, 'shu')
      .replace(/syo/g, 'sho')
      .replace(/tya/g, 'cha')
      .replace(/tyu/g, 'chu')
      .replace(/tyo/g, 'cho')
      .replace(/zya/g, 'ja')
      .replace(/zyu/g, 'ju')
      .replace(/zyo/g, 'jo')
      .replace(/ou/g, 'o')
      .replace(/oo/g, 'o')
      .replace(/uu/g, 'u');
  return normalize(typed) === normalize(target);
};
