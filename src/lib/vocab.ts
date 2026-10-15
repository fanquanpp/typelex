/**
 * Vocabulary data access.
 *
 * The published dataset is split so that nothing large is ever loaded up front:
 *   - `<book>.index.json`      compact rows, loaded once per book (~200 KB)
 *   - `<book>.detail.<n>.json` full detail, one shard at a time (~400 KB each)
 *   - `<book>.sentences.json`  sentence-typing pool
 * Everything is memoised in module scope so navigating between pages never
 * refetches.
 */
import type {
  BookMeta,
  Category,
  Detail,
  IrregularVerb,
  JapaneseWord,
  Sentence,
  Word,
  WordRow
} from './types';

const BASE = `${import.meta.env.BASE_URL}data`.replace(/\/{2,}/g, '/');

const jsonCache = new Map<string, Promise<unknown>>();

const fetchJson = <T,>(path: string): Promise<T> => {
  const url = `${BASE}/${path}`;
  const cached = jsonCache.get(url);
  if (cached) return cached as Promise<T>;
  const promise = fetch(url)
    .then(response => {
      if (!response.ok) throw new Error(`Failed to load ${url} (${response.status})`);
      return response.json() as Promise<T>;
    })
    .catch(error => {
      jsonCache.delete(url);
      throw error;
    });
  jsonCache.set(url, promise);
  return promise as Promise<T>;
};

/* ------------------------------------------------------------------ */
/* books                                                              */
/* ------------------------------------------------------------------ */

export interface BooksFile {
  generated: string;
  books: BookMeta[];
}

let booksPromise: Promise<BookMeta[]> | null = null;

export const loadBooks = (): Promise<BookMeta[]> => {
  booksPromise ??= fetchJson<BooksFile>('vocab/books.json').then(file => file.books);
  return booksPromise;
};

/* ------------------------------------------------------------------ */
/* word index                                                         */
/* ------------------------------------------------------------------ */

const indexCache = new Map<string, Promise<Word[]>>();

export const loadWordIndex = (book: string): Promise<Word[]> => {
  const cached = indexCache.get(book);
  if (cached) return cached;
  const promise = fetchJson<{ book: string; words: WordRow[] }>(`vocab/${book}.index.json`).then(file =>
    file.words.map(
      ([word, uk, us, pos, cn, shard, multi, level]): Word => ({
        word,
        uk,
        us,
        pos,
        cn,
        shard,
        multi: multi === 1,
        level,
        book
      })
    )
  );
  indexCache.set(book, promise);
  return promise;
};

export const loadAllWordIndexes = async (books: string[]): Promise<Word[]> => {
  const lists = await Promise.all(books.map(loadWordIndex));
  const seen = new Set<string>();
  const out: Word[] = [];
  for (const list of lists) {
    for (const word of list) {
      const key = word.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(word);
    }
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* detail shards                                                      */
/* ------------------------------------------------------------------ */

const detailCache = new Map<string, Promise<Record<string, Detail>>>();

export const loadDetailShard = (book: string, shard: number): Promise<Record<string, Detail>> => {
  const key = `${book}:${shard}`;
  const cached = detailCache.get(key);
  if (cached) return cached;
  const promise = fetchJson<Record<string, Detail>>(`vocab/${book}.detail.${shard}.json`);
  detailCache.set(key, promise);
  return promise;
};

/** Resolve full detail for a word, fetching (and caching) only its shard. */
export const loadDetail = async (book: string, word: string, shard: number): Promise<Detail | null> => {
  const table = await loadDetailShard(book, shard);
  return table[word] ?? null;
};

/** Warm a shard without blocking — used to prefetch the next word's detail. */
export const prefetchDetail = (book: string, shard: number): void => {
  void loadDetailShard(book, shard).catch(() => undefined);
};

/* ------------------------------------------------------------------ */
/* sentences                                                          */
/* ------------------------------------------------------------------ */

const sentenceCache = new Map<string, Promise<Sentence[]>>();

export const loadSentences = (book: string): Promise<Sentence[]> => {
  const cached = sentenceCache.get(book);
  if (cached) return cached;
  const promise = fetchJson<Sentence[]>(`vocab/${book}.sentences.json`);
  sentenceCache.set(book, promise);
  return promise;
};

export const loadAllSentences = async (books: string[]): Promise<Sentence[]> => {
  const lists = await Promise.all(books.map(book => loadSentences(book).catch(() => [])));
  return lists.flat();
};

/* ------------------------------------------------------------------ */
/* categories + irregular verbs                                       */
/* ------------------------------------------------------------------ */

let categoryPromise: Promise<Category[]> | null = null;

export const loadCategories = (): Promise<Category[]> => {
  categoryPromise ??= fetchJson<{ categories: Category[] }>('categories.json').then(file => file.categories);
  return categoryPromise;
};

let irregularPromise: Promise<IrregularVerb[]> | null = null;

export const loadIrregularVerbs = (): Promise<IrregularVerb[]> => {
  irregularPromise ??= fetchJson<{ verbs: IrregularVerb[] }>('irregular-verbs.json').then(file => file.verbs);
  return irregularPromise;
};

/* ------------------------------------------------------------------ */
/* japanese                                                           */
/* ------------------------------------------------------------------ */

let japanesePromise: Promise<JapaneseWord[]> | null = null;

export const loadJapanese = (): Promise<JapaneseWord[]> => {
  japanesePromise ??= fetchJson<{ words: JapaneseWord[] }>('japanese.json').then(file => file.words);
  return japanesePromise;
};

/* ------------------------------------------------------------------ */
/* helpers                                                            */
/* ------------------------------------------------------------------ */

export const LEVEL_LABEL: Record<number, string> = {
  1: '高中',
  2: 'CET-4',
  3: 'CET-6'
};

export const bookAccent = (books: BookMeta[], id: string): string =>
  books.find(book => book.id === id)?.accent ?? 'var(--primary)';
