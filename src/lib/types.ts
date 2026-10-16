/** Shared domain types for TypeLex. */

export type Orientation = 'portrait' | 'landscape';
export type Theme = 'dark' | 'light';
export type RomajiStyle = 'hepburn' | 'kunrei';

/** A compact row from `<book>.index.json`. */
export type WordRow = [string, string, string, string, string, number, 0 | 1, number];

export interface Word {
  word: string;
  uk: string;
  us: string;
  pos: string;
  cn: string;
  shard: number;
  multi: boolean;
  /** 1 = 高中, 2 = CET-4, 3 = CET-6 */
  level: number;
  book: string;
}

/** Full detail record — short keys keep the shard files small. */
export interface Detail {
  /** definitions: [pos, chinese, englishDefinition?] */
  d: [string, string, string?][];
  /** example sentences: [en, cn] */
  s?: [string, string][];
  /** real exam sentences: [en, sourceMeta] */
  x?: [string, string][];
  /** phrases: [en, cn] */
  p?: [string, string][];
  /** related words (同根词): [pos, [word, cn][]] */
  r?: [string, [string, string][]][];
  /** synonyms (同近义词): [pos, tranCn, words[]] */
  y?: [string, string, string[]][];
  /** mnemonic / 记忆法 */
  m?: string;
  /** confusable near-neighbours: [word, cn] */
  k?: [string, string][];
}

export interface BookMeta {
  id: string;
  name: string;
  short: string;
  tag: string;
  desc: string;
  accent: string;
  count: number;
  shards: number;
  sentences: number;
  coverage: {
    related: number;
    mnemonic: number;
    exam: number;
    sentence: number;
    phrase: number;
  };
  posCount: Record<string, number>;
}

export interface Sentence {
  /** text to type */
  t: string;
  /** chinese translation */
  c: string;
  /** source headword */
  w: string;
  /** book id */
  b: string;
  /** character length */
  n: number;
}

export interface Category {
  id: string;
  name: string;
  desc: string;
  icon: string;
  accent: string;
  count: number;
  words: { w: string; b: string; lv: number }[];
}

export interface IrregularVerb {
  base: string;
  past: string;
  pp: string;
  cn: string;
}

export interface JapaneseWord {
  /** kana reading — this is what the user types (as rōmaji) */
  kana: string;
  /** kanji form, empty when the word is written in kana only */
  kanji: string;
  /** hepburn rōmaji of the kana reading */
  romaji: string;
  /** hand-curated Chinese gloss (all JLPT levels) */
  cn: string;
  /** English gloss from the source dataset */
  en: string;
  /** JLPT level 5..1 (5 = N5) */
  jlpt: number;
}

/* ------------------------------------------------------------------ */
/* practice                                                            */
/* ------------------------------------------------------------------ */

export type PracticeMode =
  | 'random'
  | 'sequential'
  | 'category'
  | 'sentence'
  | 'weak'
  | 'srs'
  | 'japanese';

export type SessionLength = 'time' | 'count';

export interface SessionConfig {
  mode: PracticeMode;
  /** book ids in play */
  books: string[];
  /** category id when mode === 'category' */
  category?: string;
  /** jlpt levels when mode === 'japanese' */
  jlpt?: number[];
  length: SessionLength;
  /** seconds when length === 'time', item count when 'count' */
  amount: number;
  /** show the meaning card after each word */
  showCard: boolean;
  /** require the whole sentence, or word-by-word */
  strict: boolean;
}

export interface KeystrokeEvent {
  /** expected character */
  expected: string;
  /** what the user actually produced ('' for a backspace) */
  actual: string;
  correct: boolean;
  /** ms since the previous keystroke */
  delta: number;
  /** ms since session start */
  at: number;
}

export interface SessionSample {
  /** seconds since start */
  t: number;
  wpm: number;
  raw: number;
  errors: number;
}

export interface SessionResult {
  id: string;
  at: number;
  mode: PracticeMode;
  books: string[];
  category?: string;
  /** seconds */
  duration: number;
  /** net words per minute */
  wpm: number;
  /** raw words per minute */
  raw: number;
  /** 0..100 */
  accuracy: number;
  /** 0..100 */
  consistency: number;
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
  chars: number;
  items: number;
  /** per-second samples for the chart */
  samples: SessionSample[];
  /** words practised, in order */
  words: string[];
  /** keys that produced errors this session, keyed by character */
  errorsByKey: Record<string, number>;
  /** experience awarded for this session */
  xp: number;
}

export interface KeyStat {
  /** total presses */
  hits: number;
  /** total errors attributed to this key */
  misses: number;
  /** exponential moving average of time-to-type, ms */
  time: number;
  /** best filtered time-to-type seen, ms */
  best: number;
  samples: number;
}

export type WordState = 0 | 1 | 2; // unseen-ish / learning / known

export interface SrsCard {
  /** ease factor, 1.3 .. 2.8 */
  ease: number;
  /** interval in days */
  interval: number;
  /** consecutive successful recalls */
  reps: number;
  /** epoch ms when due */
  due: number;
  /** epoch ms of last review */
  last: number;
  lapses: number;
}

export interface DailyStat {
  /** seconds practised */
  seconds: number;
  /** items completed */
  items: number;
  /** best wpm that day */
  wpm: number;
}
