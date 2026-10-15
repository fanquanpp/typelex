/**
 * Practice queue construction.
 *
 * A session is a flat, ordered list of items. Building it is a pure function of
 * (config, data, progress) so a session can be regenerated deterministically
 * after a refresh — the queue and the cursor are persisted, not the DOM.
 */
import type { JapaneseWord, PracticeMode, Sentence, SessionConfig, Word } from '../types';
import { loadAllSentences, loadAllWordIndexes, loadCategories, loadJapanese } from '../vocab';
import type { KeyAccumulator } from './metrics';

export interface PracticeItem {
  id: string;
  kind: 'word' | 'sentence' | 'japanese';
  /** the exact string the user must type */
  text: string;
  word?: Word;
  sentence?: Sentence;
  jp?: JapaneseWord;
  /** short meaning shown on the card */
  meaning: string;
  /** phonetic / reading line */
  phonetic: string;
  /** part of speech */
  pos: string;
  /** translation of a sentence */
  translation?: string;
  /** book id, for stats + colour */
  book: string;
}

/** Deterministic PRNG so a persisted seed reproduces the same queue. */
export const mulberry32 = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const shuffleWith = <T,>(list: T[], random: () => number): T[] => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const wordToItem = (word: Word): PracticeItem => ({
  id: `${word.book}:${word.word}`,
  kind: 'word',
  text: word.word,
  word,
  meaning: word.cn,
  phonetic: word.us || word.uk,
  pos: word.pos,
  book: word.book
});

const sentenceToItem = (sentence: Sentence): PracticeItem => ({
  id: `s:${sentence.b}:${sentence.w}:${sentence.t.slice(0, 24)}`,
  kind: 'sentence',
  text: sentence.t,
  sentence,
  meaning: sentence.c,
  phonetic: sentence.w,
  pos: 'sentence',
  translation: sentence.c,
  book: sentence.b
});

const japaneseToItem = (word: JapaneseWord): PracticeItem => ({
  id: `jp:${word.kana}:${word.romaji}`,
  kind: 'japanese',
  text: word.romaji,
  jp: word,
  meaning: word.cn || word.en,
  phonetic: word.kanji ? `${word.kanji}　${word.kana}` : word.kana,
  pos: `N${word.jlpt}`,
  book: `n${word.jlpt}`
});

export interface QueueDeps {
  /** key statistics, used by the adaptive "weak keys" mode */
  keyStats?: Record<string, KeyAccumulator>;
  /** words the user has marked known, skipped in random drills */
  known?: Set<string>;
  /** words that are due for review, for the SRS mode */
  dueWords?: { word: string; book: string; shard: number }[];
  /** sequential-mode cursor per pool key */
  cursor?: number;
  seed?: number;
}

export interface QueueResult {
  items: PracticeItem[];
  /** next cursor value for sequential mode */
  cursor: number;
  poolSize: number;
}

const MAX_QUEUE = 240;

/**
 * Pick words that exercise the user's slowest / least accurate keys.
 * Mirrors the "weak spot" heuristic: sample a handful of candidates and keep
 * the one whose worst characters score highest.
 */
const weakSpotQueue = (
  words: Word[],
  keyStats: Record<string, KeyAccumulator>,
  random: () => number,
  targetMs: number
): Word[] => {
  const score = (word: Word) => {
    let total = 0;
    let count = 0;
    for (const char of word.word.toLowerCase()) {
      const stat = keyStats[char];
      count += 1;
      if (!stat || stat.samples === 0) {
        total += targetMs * 1.35;
        continue;
      }
      const missPenalty = stat.hits ? (stat.misses / stat.hits) * targetMs * 2.2 : 0;
      total += stat.time + missPenalty;
    }
    return count ? total / count : 0;
  };

  const ranked = words
    .map(word => ({ word, value: score(word) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, Math.min(words.length, 400));

  return shuffleWith(ranked, random)
    .slice(0, MAX_QUEUE)
    .map(entry => entry.word);
};

export const buildQueue = async (config: SessionConfig, deps: QueueDeps = {}): Promise<QueueResult> => {
  const seed = deps.seed ?? Math.floor(Math.random() * 2 ** 31);
  const random = mulberry32(seed);
  const amount =
    config.length === 'time' ? Math.max(40, Math.round(config.amount * 1.1)) : Math.max(1, config.amount);

  /* ---------------- japanese track ---------------- */
  if (config.mode === 'japanese') {
    const all = await loadJapanese();
    const levels = config.jlpt?.length ? config.jlpt : [5, 4, 3, 2, 1];
    const pool = all.filter(word => levels.includes(word.jlpt));
    const items = shuffleWith(pool, random).slice(0, Math.min(amount, MAX_QUEUE)).map(japaneseToItem);
    return { items, cursor: 0, poolSize: pool.length };
  }

  /* ---------------- sentence track ---------------- */
  if (config.mode === 'sentence') {
    const sentences = await loadAllSentences(config.books);
    const items = shuffleWith(sentences, random).slice(0, Math.min(amount, MAX_QUEUE)).map(sentenceToItem);
    return { items, cursor: 0, poolSize: sentences.length };
  }

  /* ---------------- srs review ---------------- */
  if (config.mode === 'srs') {
    const due = deps.dueWords ?? [];
    if (!due.length) return { items: [], cursor: 0, poolSize: 0 };
    const indexes = await Promise.all(config.books.map(book => loadAllWordIndexes([book])));
    const lookup = new Map<string, Word>();
    for (const list of indexes) for (const word of list) lookup.set(`${word.book}:${word.word}`, word);
    const items: PracticeItem[] = [];
    for (const entry of due) {
      const word = lookup.get(`${entry.book}:${entry.word}`);
      if (word) items.push(wordToItem(word));
      if (items.length >= MAX_QUEUE) break;
    }
    return { items, cursor: 0, poolSize: items.length };
  }

  /* ---------------- word tracks ---------------- */
  const all = await loadAllWordIndexes(config.books);
  let pool = all.filter(word => !deps.known?.has(`${word.book}:${word.word}`));

  if (config.mode === 'category' && config.category) {
    const categories = await loadCategories();
    const category = categories.find(entry => entry.id === config.category);
    if (category) {
      const allowed = new Set(category.words.map(entry => `${entry.b}:${entry.w}`));
      pool = pool.filter(word => allowed.has(`${word.book}:${word.word}`));
      if (!pool.length) {
        const byKey = new Map(all.map(word => [`${word.book}:${word.word}`, word]));
        pool = category.words
          .map(entry => byKey.get(`${entry.b}:${entry.w}`))
          .filter((word): word is Word => Boolean(word));
      }
    }
  }

  if (!pool.length) pool = all;

  if (config.mode === 'weak' && deps.keyStats) {
    const items = weakSpotQueue(pool, deps.keyStats, random, 260).map(wordToItem);
    return { items, cursor: 0, poolSize: pool.length };
  }

  if (config.mode === 'sequential') {
    const start = deps.cursor ?? 0;
    const slice: Word[] = [];
    for (let i = 0; i < Math.min(amount, MAX_QUEUE); i++) {
      slice.push(pool[(start + i) % pool.length]);
    }
    return { items: slice.map(wordToItem), cursor: (start + slice.length) % pool.length, poolSize: pool.length };
  }

  /* random */
  const items = shuffleWith(pool, random).slice(0, Math.min(amount, MAX_QUEUE)).map(wordToItem);
  return { items, cursor: 0, poolSize: pool.length };
};

export const MODE_LABEL: Record<PracticeMode, string> = {
  random: '随机模式',
  sequential: '顺序模式',
  category: '专项模式',
  sentence: '句子模式',
  weak: '弱键特训',
  srs: '记忆复习',
  japanese: '日语罗马音'
};

export const MODE_DESC: Record<PracticeMode, string> = {
  random: '从所选词库中随机抽取，覆盖最广，适合日常刷量。',
  sequential: '按字母顺序推进，进度可续，适合系统性地过一遍词表。',
  category: '按词性或主题集中突破：形容词、介词、不规则动词、易混词……',
  sentence: '打整句真题例句，练节奏、标点与 Shift，同时记住词的用法。',
  weak: '根据你的按键速度与错误率，专挑拖后腿的字母组成词。',
  srs: '只复习到期的词，答对就拉长间隔，答错就缩短 —— 记忆效率最高。',
  japanese: '用罗马音输入日语单词，同时记假名、汉字与含义。'
};
