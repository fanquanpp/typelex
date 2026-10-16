/**
 * Pronunciation-aware chunking for the typing drill.
 *
 * The drill shows the target text as one slot per character. To make the
 * *pronunciation* visible while typing, the slots are grouped into chunks:
 *
 *   - English words are split into spelling syllables with the standard
 *     max-onset rule set, so "happy" renders as hap·py and "abandon" as
 *     a·ban·don. The full IPA line stays visible right under the word.
 *   - Japanese romaji items carry their kana segmentation directly — one chunk
 *     per kana (さ·く·ら), which is exactly how the word is read.
 *   - Sentences fall back to word-level chunks separated by spaces.
 *
 * Chunking is cosmetic only: it never changes what the user must type, and a
 * failed alignment degrades to "no chunks" rather than a wrong display.
 */

const VOWELS = new Set('aeiouy');

/** Consonant pairs that belong to one sound and must not be split apart. */
const KEEP_TOGETHER = new Set([
  'ch', 'sh', 'th', 'ph', 'wh', 'gh', 'ck', 'qu', 'kn', 'wr',
  'bl', 'br', 'cl', 'cr', 'dr', 'dw', 'fl', 'fr', 'gl', 'gr',
  'pl', 'pr', 'sc', 'sk', 'sl', 'sm', 'sn', 'sp', 'st', 'sw', 'tr', 'tw'
]);

export interface TextChunk {
  /** first character index (into the Array.from(text) array) of the chunk */
  start: number;
  /** number of characters in the chunk */
  length: number;
}

/**
 * Split a single English word into spelling syllables.
 *
 * Never leaves a syllable without a vowel, keeps digraphs together, attaches a
 * single intervocalic consonant to the following vowel (o·pen), and cuts
 * consonant clusters after the first consonant (ab·nor·mal) unless the pair is
 * a blend (a·ble).
 */
export const splitSpellingSyllables = (word: string): string[] => {
  const letters = word.toLowerCase();
  if (letters.length < 3 || !/^[a-z]+$/.test(letters)) return [word];

  const isVowel = (ch: string) => VOWELS.has(ch);
  const n = letters.length;
  const cuts: number[] = [];

  for (let i = 1; i < n - 1; i++) {
    if (!letters.slice(0, i).match(/[aeiouy]/)) continue;
    if (!letters.slice(i).match(/[aeiouy]/)) continue;
    const prev = letters[i - 1];
    const cur = letters[i];
    if (!(isVowel(prev) && !isVowel(cur))) continue;

    // consonant cluster starting at i
    let j = i;
    while (j < n && !isVowel(letters[j])) j++;
    const cluster = j - i;

    if (cluster === 1) {
      // V-CV → cut before the consonant (o·pen); before x reads better after (e·xit)
      if (cur !== 'x') cuts.push(i);
    } else if (cluster === 2) {
      // V-CCV → keep blends together, otherwise cut inside the cluster
      cuts.push(KEEP_TOGETHER.has(letters.slice(i, i + 2)) ? i : i + 1);
    } else {
      cuts.push(i + 1);
    }
  }

  const parts: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    if (cut > from && cut < n) {
      parts.push(word.slice(from, cut));
      from = cut;
    }
  }
  parts.push(word.slice(from));
  return parts.every(part => part.length > 0) && parts.length > 1 ? parts : [word];
};

/** Chunk boundaries of an English word: one chunk per spelling syllable. */
export const chunkEnglishWord = (word: string): TextChunk[] => {
  const letters = Array.from(word);
  const parts = splitSpellingSyllables(word);
  if (parts.length === 1) return [{ start: 0, length: letters.length }];

  const chunks: TextChunk[] = [];
  let cursor = 0;
  for (const part of parts) {
    const length = Array.from(part).length;
    chunks.push({ start: cursor, length });
    cursor += length;
  }
  // guard against miscounted multi-byte sequences
  if (cursor !== letters.length) return [{ start: 0, length: letters.length }];
  return chunks;
};

/**
 * Chunk a sentence by words: each whitespace-separated run becomes one chunk,
 * the separating space travels with the following chunk so no character is
 * left out.
 */
export const chunkSentence = (text: string): TextChunk[] => {
  const chars = Array.from(text);
  const chunks: TextChunk[] = [];
  let start = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ' && i > start) {
      chunks.push({ start, length: i - start });
      start = i;
    }
  }
  chunks.push({ start, length: chars.length - start });
  return chunks;
};
