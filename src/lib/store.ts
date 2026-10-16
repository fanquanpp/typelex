/**
 * Application state.
 *
 * Everything the user can lose by refreshing lives here and is persisted to
 * localStorage: settings, vocabulary progress, per-key statistics, session
 * history, and the in-flight practice session (queue + cursor) so a refresh
 * drops you back exactly where you were.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type { RgbStyle } from '../three/keyboard/models';
import type { SoundProfile } from './audio';
import { createCard, reviewCard, type Grade } from './srs';
import type {
  AdvanceMode,
  DailyStat,
  KeyStat,
  RomajiStyle,
  SessionConfig,
  SessionResult,
  SrsCard,
  Theme,
  WordState
} from './types';
import type { PracticeItem } from './typing/session';
import { levelFromTotalXp } from './typing/metrics';

export interface PersistedSession {
  id: string;
  queue: PracticeItem[];
  index: number;
  /** epoch ms when the session started */
  startedAt: number;
  /** accumulated active time in ms */
  elapsed: number;
  /** keystroke counters so far */
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
  chars: number;
  /** per-item results already completed */
  errorsByKey: Record<string, number>;
  config: SessionConfig;
  seed: number;
}

export interface Settings {
  theme: Theme;
  keyboardModel: string;
  soundEnabled: boolean;
  soundProfile: SoundProfile;
  volume: number;
  fingerHints: boolean;
  showNextKey: boolean;
  /** what a finished item does: hand over to the next one, or wait for Enter */
  advanceMode: AdvanceMode;
  rgbStyle: RgbStyle;
  romajiStyle: RomajiStyle;
  keyboardVisible: boolean;
  keyboardView: 'angled' | 'top' | 'front' | 'close';
  cardAnimation: 'pixel' | 'flip' | 'fade';
}

export interface AppState {
  settings: Settings;
  config: SessionConfig;
  /** sequential-mode cursors, keyed by `${books.join('-')}|${category ?? ''}` */
  cursors: Record<string, number>;
  session: PersistedSession | null;

  xp: number;
  history: SessionResult[];
  keyStats: Record<string, KeyStat>;
  srs: Record<string, SrsCard>;
  stars: string[];
  known: Record<string, WordState>;
  daily: Record<string, DailyStat>;
  streak: { current: number; best: number; last: string };
  studySeen: number;

  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setConfig: (patch: Partial<SessionConfig>) => void;
  setCursor: (key: string, value: number) => void;
  setSession: (session: PersistedSession | null) => void;

  recordSession: (result: SessionResult) => void;
  mergeKeyStats: (stats: Record<string, KeyStat>) => void;
  review: (key: string, grade: Grade) => void;
  reviewMany: (keys: string[], grade: Grade) => void;
  toggleStar: (key: string) => void;
  setKnown: (key: string, state: WordState) => void;
  markStudySeen: () => void;
  resetProgress: () => void;
}

const today = () => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const dayGap = (a: string, b: string) => {
  const parse = (value: string) => {
    const [y, m, d] = value.split('-').map(Number);
    return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
};

const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  keyboardModel: 'office',
  soundEnabled: true,
  soundProfile: 'laptop',
  volume: 0.6,
  fingerHints: false,
  showNextKey: true,
  advanceMode: 'auto',
  rgbStyle: 'solid',
  romajiStyle: 'hepburn',
  keyboardVisible: true,
  keyboardView: 'angled',
  cardAnimation: 'pixel'
};

const DEFAULT_CONFIG: SessionConfig = {
  mode: 'random',
  books: ['highschool'],
  length: 'count',
  amount: 20,
  showCard: true,
  strict: false
};

const initialSettings = (): Settings => {  if (typeof document === 'undefined') return DEFAULT_SETTINGS;
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? { ...DEFAULT_SETTINGS, theme } : DEFAULT_SETTINGS;
};

export const useApp = create<AppState>()(
  persist(
    set => ({
      settings: initialSettings(),
      config: DEFAULT_CONFIG,
      cursors: {},
      session: null,

      xp: 0,
      history: [],
      keyStats: {},
      srs: {},
      stars: [],
      known: {},
      daily: {},
      streak: { current: 0, best: 0, last: '' },
      studySeen: 0,

      setSetting: (key, value) =>
        set(state => {
          const settings = { ...state.settings, [key]: value };
          if (key === 'theme' && typeof document !== 'undefined') {
            document.documentElement.dataset.theme = String(value);
            try {
              localStorage.setItem('typelex.theme', String(value));
            } catch {
              /* storage may be unavailable */
            }
          }
          if (key === 'soundEnabled' || key === 'volume') {
            /* audio is applied by the app shell so the module stays side-effect free */
          }
          return { settings };
        }),

      setConfig: patch => set(state => ({ config: { ...state.config, ...patch } })),
      setCursor: (key, value) => set(state => ({ cursors: { ...state.cursors, [key]: value } })),
      setSession: session => set({ session }),

      recordSession: result =>
        set(state => {
          const day = today();
          const previous = state.daily[day] ?? { seconds: 0, items: 0, wpm: 0 };
          const daily: Record<string, DailyStat> = {
            ...state.daily,
            [day]: {
              seconds: previous.seconds + result.duration,
              items: previous.items + result.items,
              wpm: Math.max(previous.wpm, result.wpm)
            }
          };

          const streak = { ...state.streak };
          if (streak.last !== day) {
            const gap = streak.last ? dayGap(streak.last, day) : 999;
            streak.current = gap === 1 ? streak.current + 1 : 1;
            streak.best = Math.max(streak.best, streak.current);
            streak.last = day;
          }

          const keyStats = { ...state.keyStats };
          for (const [char, misses] of Object.entries(result.errorsByKey)) {
            const existing = keyStats[char] ?? { hits: 0, misses: 0, time: 0, best: 0, samples: 0 };
            keyStats[char] = { ...existing, misses: existing.misses + misses };
          }

          const history = [result, ...state.history].slice(0, 200);

          return {
            history,
            daily,
            streak,
            keyStats,
            xp: state.xp + result.xp
          };
        }),

      mergeKeyStats: stats =>
        set(state => {
          const keyStats = { ...state.keyStats };
          for (const [char, incoming] of Object.entries(stats)) {
            const existing = keyStats[char];
            if (!existing) {
              keyStats[char] = incoming;
              continue;
            }
            const samples = existing.samples + incoming.samples;
            keyStats[char] = {
              hits: existing.hits + incoming.hits,
              misses: existing.misses + incoming.misses,
              samples,
              time:
                samples > 0
                  ? (existing.time * existing.samples + incoming.time * incoming.samples) / samples
                  : 0,
              best: existing.best > 0 && incoming.best > 0 ? Math.min(existing.best, incoming.best) : existing.best || incoming.best
            };
          }
          return { keyStats };
        }),

      review: (key, grade) =>
        set(state => ({
          srs: {
            ...state.srs,
            [key]: reviewCard(state.srs[key] ?? createCard(), grade)
          }
        })),

      reviewMany: (keys, grade) =>
        set(state => {
          const srs = { ...state.srs };
          const now = Date.now();
          for (const key of keys) srs[key] = reviewCard(srs[key] ?? createCard(now), grade, now);
          return { srs };
        }),

      toggleStar: key =>
        set(state => ({
          stars: state.stars.includes(key) ? state.stars.filter(entry => entry !== key) : [...state.stars, key]
        })),

      setKnown: (key, value) =>
        set(state => ({ known: { ...state.known, [key]: value } })),

      markStudySeen: () => set(state => ({ studySeen: state.studySeen + 1 })),

      resetProgress: () =>
        set({
          xp: 0,
          history: [],
          keyStats: {},
          srs: {},
          stars: [],
          known: {},
          daily: {},
          streak: { current: 0, best: 0, last: '' },
          studySeen: 0,
          session: null,
          cursors: {}
        })
    }),
    {
      name: 'typelex.store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        settings: state.settings,
        config: state.config,
        cursors: state.cursors,
        session: state.session,
        xp: state.xp,
        history: state.history.slice(0, 60),
        keyStats: state.keyStats,
        srs: state.srs,
        stars: state.stars,
        known: state.known,
        daily: state.daily,
        streak: state.streak,
        studySeen: state.studySeen
      })
    }
  )
);

/* ------------------------------------------------------------------ */
/* selectors                                                           */
/* ------------------------------------------------------------------ */

export const level = (xp: number) => levelFromTotalXp(xp);

export const dueWords = (srs: Record<string, SrsCard>, now = Date.now()) =>
  Object.entries(srs)
    .filter(([, card]) => card.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([key]) => {
      const [book, ...rest] = key.split(':');
      return { word: rest.join(':'), book, shard: 0 };
    });

export const sessionKeyFor = (config: SessionConfig) =>
  `${[...config.books].sort().join('-')}|${config.category ?? ''}`;
