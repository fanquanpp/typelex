/**
 * The typing engine.
 *
 * Keystrokes are captured on `keydown` at the window level — this is a
 * physical-keyboard trainer, so we need `event.code` (for the 3D board and the
 * finger map) which the `input`/`beforeinput` path cannot give us. Guard rails:
 *   - printable keys only, no Ctrl/Alt/Meta combinations (except word-delete)
 *   - Tab, Space, Backspace, quote, slash and F1 are prevented from reaching the
 *     browser (Firefox quick-find, back-navigation, focus traversal)
 *   - typing is ignored while a real form control has focus
 *   - elapsed time only accrues while the session is running and the tab visible
 *
 * Metrics follow the mainstream definitions: net WPM counts only fully correct
 * words, raw WPM counts every character typed, and accuracy is per-keystroke and
 * therefore still penalises an error you went back and fixed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { playError, playKey, playKeyUp, type SoundProfile } from '../audio';
import { updateKeyStat, wpm as wpmOf, consistencyOf, type KeyAccumulator } from './metrics';
import type { KeystrokeEvent, SessionConfig, SessionResult, SessionSample, AdvanceMode } from '../types';
import type { PracticeItem } from './session';

export interface TypingCallbacks {
  onKeyDown?: (code: string, char: string, correct: boolean) => void;
  onKeyUp?: (code: string) => void;
  onItemComplete?: (item: PracticeItem, info: { ms: number; errors: number; typed: string }) => void;
  onFinish?: (result: SessionResult) => void;
  onError?: (code: string) => void;
}

export interface TypingOptions {
  queue: PracticeItem[];
  config: SessionConfig;
  soundEnabled: boolean;
  soundProfile: SoundProfile;
  volume: number;
  /** 'auto' moves on by itself, 'enter' waits for the user to confirm */
  advanceMode?: AdvanceMode;
  callbacks?: TypingCallbacks;
  /** start from a restored position */
  initialIndex?: number;
  initialElapsed?: number;
  /** run the session */
  active?: boolean;
}

export interface TypingView {
  index: number;
  item: PracticeItem | null;
  typed: string;
  /** index of the next character to type */
  cursor: number;
  wpm: number;
  raw: number;
  accuracy: number;
  consistency: number;
  elapsed: number;
  remaining: number;
  progress: number;
  finished: boolean;
  paused: boolean;
  errorsByKey: Record<string, number>;
  samples: SessionSample[];
  itemErrors: number;
  totalErrors: number;
  /** true for ~200ms after a wrong key so the UI can shake */
  missedAt: number;
  /** the item is finished and the run is waiting for Enter (advanceMode 'enter') */
  awaitingEnter: boolean;
}

const SENTENCE_PAUSE = 260;

export const useTypingSession = (options: TypingOptions) => {
  const {
    queue,
    config,
    soundEnabled,
    soundProfile,
    volume,
    advanceMode = 'auto',
    callbacks,
    initialIndex = 0,
    initialElapsed = 0,
    active = true
  } = options;

  /* mutable engine state — kept out of React so keystrokes never re-render twice */
  const engine = useRef({
    index: initialIndex,
    typed: '',
    startedAt: 0,
    wallStartedAt: Date.now(),
    elapsed: initialElapsed,
    lastTick: 0,
    correct: 0,
    incorrect: 0,
    extra: 0,
    missed: 0,
    chars: 0,
    errorsByKey: {} as Record<string, number>,
    keyStats: {} as Record<string, KeyAccumulator>,
    events: [] as KeystrokeEvent[],
    samples: [] as SessionSample[],
    lastKeyAt: 0,
    itemStartedAt: 0,
    itemErrors: 0,
    itemHadError: false,
    finished: false,
    paused: false,
    wordBuffer: [] as string[],
    lastSampleSecond: -1,
    advanceAt: 0,
    awaitingEnter: false
  });

  const [view, setView] = useState<TypingView>(() => ({
    index: initialIndex,
    item: queue[initialIndex] ?? null,
    typed: '',
    cursor: 0,
    wpm: 0,
    raw: 0,
    accuracy: 100,
    consistency: 0,
    elapsed: initialElapsed / 1000,
    remaining: Math.max(0, queue.length - initialIndex),
    progress: queue.length ? initialIndex / queue.length : 0,
    finished: false,
    paused: false,
    errorsByKey: {},
    samples: [],
    itemErrors: 0,
    totalErrors: 0,
    missedAt: 0,
    awaitingEnter: false
  }));

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const syncView = useCallback((missedAt?: number) => {
    const state = engine.current;
    const item = queue[state.index] ?? null;
    const seconds = Math.max(0.001, state.elapsed / 1000);
    const accuracy = state.correct + state.incorrect > 0
      ? (state.correct / (state.correct + state.incorrect)) * 100
      : 100;
    /* Below one second the denominator is noise — a burst of keystrokes would
       report a four-digit WPM. Hold the readout at zero until it means something. */
    const measurable = state.elapsed >= 1000;
    setView(previous => ({
      index: state.index,
      item,
      typed: state.typed,
      cursor: state.typed.length,
      wpm: measurable
        ? wpmOf(state.wordBuffer.reduce((sum, word) => sum + word.length, 0) + state.typed.length, seconds)
        : 0,
      raw: measurable ? wpmOf(state.correct + state.incorrect + state.extra, seconds) : 0,
      accuracy,
      consistency: consistencyOf(state.samples, 'raw'),
      elapsed: state.elapsed / 1000,
      remaining: Math.max(0, queue.length - state.index),
      progress: queue.length ? Math.min(1, state.index / queue.length) : 0,
      finished: state.finished,
      paused: state.paused,
      errorsByKey: state.errorsByKey,
      samples: state.samples,
      itemErrors: state.itemErrors,
      totalErrors: state.incorrect,
      missedAt: missedAt ?? previous.missedAt,
      awaitingEnter: state.awaitingEnter
    }));
  }, [queue]);

  const finish = useCallback(() => {
    const state = engine.current;
    if (state.finished) return;
    state.finished = true;
    /* Floor the duration: a session finished in a few keystrokes (or one whose
       clock never ran because the tab was hidden) must not produce a WPM in the
       thousands. */
    const wallSeconds = (Date.now() - state.wallStartedAt) / 1000;
    const seconds = Math.max(1, Math.min(wallSeconds, state.elapsed / 1000 + 1));
    const accuracy = state.correct + state.incorrect > 0
      ? (state.correct / (state.correct + state.incorrect)) * 100
      : 100;
    const result: SessionResult = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      mode: config.mode,
      books: config.books,
      category: config.category,
      duration: seconds,
      wpm: wpmOf(state.wordBuffer.reduce((sum, word) => sum + word.length, 0), seconds),
      raw: wpmOf(state.correct + state.incorrect + state.extra, seconds),
      accuracy,
      consistency: consistencyOf(state.samples, 'raw'),
      correct: state.correct,
      incorrect: state.incorrect,
      extra: state.extra,
      missed: state.missed,
      chars: state.correct + state.incorrect + state.extra,
      items: state.index,
      samples: state.samples,
      words: state.wordBuffer.slice(),
      errorsByKey: state.errorsByKey,
      xp: 0
    };
    syncView();
    callbacksRef.current?.onFinish?.(result);
  }, [config.mode, config.books, config.category, syncView]);

  const advance = useCallback(() => {
    const state = engine.current;
    const item = queue[state.index];
    const now = performance.now();
    if (item) {
      state.wordBuffer.push(item.text);
      callbacksRef.current?.onItemComplete?.(item, {
        ms: Math.max(1, now - state.itemStartedAt),
        errors: state.itemErrors,
        typed: state.typed
      });
    }
    state.index += 1;
    state.typed = '';
    state.itemErrors = 0;
    state.itemHadError = false;
    state.itemStartedAt = now;
    state.awaitingEnter = false;
    state.advanceAt = 0;

    if (state.index >= queue.length) {
      finish();
      return;
    }
    syncView();
  }, [queue, finish, syncView]);

  const handleChar = useCallback(
    (char: string, code: string) => {
      const state = engine.current;
      if (state.finished || state.paused) return;
      /* the item is done and the user asked to confirm before moving on: further
         characters are not part of any word any more */
      if (state.awaitingEnter) return;
      const item = queue[state.index];
      if (!item) return;

      const target = item.text;
      const position = state.typed.length;
      const expected = target[position];

      /* past the end of the target: count as an extra character */
      if (expected === undefined) {
        state.extra += 1;
        state.incorrect += 1;
        state.typed += char;
        state.itemErrors += 1;
        state.itemHadError = true;
        state.errorsByKey[expected ?? char] = (state.errorsByKey[expected ?? char] ?? 0) + 1;
        callbacksRef.current?.onError?.(code);
        playError(soundEnabled);
        syncView(performance.now());
        return;
      }

      const correct = char === expected;
      const now = performance.now();
      const delta = state.lastKeyAt ? now - state.lastKeyAt : 0;
      state.lastKeyAt = now;

      state.events.push({
        expected,
        actual: char,
        correct,
        delta,
        at: state.elapsed + (now - state.itemStartedAt)
      });

      if (correct) {
        state.correct += 1;
      } else {
        state.incorrect += 1;
        state.itemErrors += 1;
        state.itemHadError = true;
        state.errorsByKey[expected] = (state.errorsByKey[expected] ?? 0) + 1;
        callbacksRef.current?.onError?.(code);
        playError(soundEnabled);
      }

      const stat = state.keyStats[expected] ?? { hits: 0, misses: 0, time: 0, best: 0, samples: 0 };
      state.keyStats[expected] = updateKeyStat(stat, expected, correct, delta);

      if (correct || !config.strict) {
        state.typed += char;
      }

      callbacksRef.current?.onKeyDown?.(code, char, correct);

      if (state.typed === target) {
        /* the item is complete: hand over to the next one, or hold here until
           Enter — `advanceMode: 'enter'` is for people who want to look at what
           they just typed (the letters stay lit) before moving on */
        if (advanceMode === 'enter') {
          state.awaitingEnter = true;
          syncView();
          return;
        }
        /* hold briefly on sentences so the completion is visible */
        if (item.kind === 'sentence') {
          state.advanceAt = now + SENTENCE_PAUSE;
        } else {
          advance();
          return;
        }
      }
      syncView(correct ? undefined : performance.now());
    },
    [queue, config.strict, soundEnabled, advance, advanceMode, syncView]
  );

  /** Enter confirms a finished item in 'enter' mode. */
  const confirm = useCallback(() => {
    const state = engine.current;
    if (state.finished || state.paused || !state.awaitingEnter) return;
    advance();
  }, [advance]);

  const handleBackspace = useCallback(
    (word: boolean) => {
      const state = engine.current;
      if (state.finished || state.paused) return;
      /* un-typing a confirmed word would leave the run in limbo: the next item is
         already paid for by the Enter press */
      if (state.awaitingEnter) return;
      if (!state.typed) return;
      if (word) {
        state.typed = state.typed.replace(/\s*\S+\s*$/, '');
      } else {
        state.typed = state.typed.slice(0, -1);
      }
      syncView();
    },
    [syncView]
  );

  /* ---- global key handling ---- */
  useEffect(() => {
    if (!active) return undefined;

    const isEditable = (element: Element | null) => {
      if (!element) return false;
      const tag = element.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (element as HTMLElement).isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const state = engine.current;
      if (state.finished) return;
      if (isEditable(document.activeElement) && !event.metaKey && !event.ctrlKey) {
        /* let search fields and settings inputs work normally */
        const target = document.activeElement as HTMLElement;
        if (target.dataset?.typelexCapture !== 'true') return;
      }

      if (event.key === 'Enter') {
        /* only meaningful in 'enter' mode, where it confirms a finished item */
        if (state.awaitingEnter) {
          event.preventDefault();
          confirm();
        }
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        handleBackspace(event.ctrlKey || event.altKey);
        return;
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1) return;

      /* stop Firefox quick-find and browser back-navigation on these keys */
      if (event.key === ' ' || event.key === "'" || event.key === '/' || event.key === '\\') {
        event.preventDefault();
      }
      handleChar(event.key, event.code);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      callbacksRef.current?.onKeyUp?.(event.code);
    };

    const onBlur = () => {
      const state = engine.current;
      state.paused = true;
      syncView();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [active, handleChar, handleBackspace, confirm, syncView]);

  /* ---- clock: elapsed time, per-second samples, sentence advance ---- */
  useEffect(() => {
    if (!active) return undefined;
    const state = engine.current;
    state.startedAt = performance.now();
    state.lastTick = state.startedAt;
    state.itemStartedAt = state.startedAt;

    const timer = window.setInterval(() => {
      const current = engine.current;
      if (current.finished) return;
      const now = performance.now();
      const delta = now - current.lastTick;
      current.lastTick = now;

      if (!current.paused && !document.hidden) {
        current.elapsed += delta;
      }

      if (current.advanceAt && now >= current.advanceAt) {
        current.advanceAt = 0;
        advance();
        return;
      }

      const seconds = Math.max(0.001, current.elapsed / 1000);
      const whole = Math.floor(seconds);
      if (whole > current.lastSampleSecond && !current.paused) {
        current.lastSampleSecond = whole;
        const net = wpmOf(current.wordBuffer.reduce((sum, word) => sum + word.length, 0), seconds);
        const raw = wpmOf(current.correct + current.incorrect + current.extra, seconds);
        current.samples.push({ t: whole, wpm: net, raw, errors: current.incorrect });
      }

      if (config.length === 'time' && seconds >= config.amount) {
        finish();
        return;
      }

      syncView();
    }, 200);

    return () => window.clearInterval(timer);
  }, [active, advance, config.length, config.amount, finish, syncView]);

  /* ---- sound + volume ---- */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length !== 1 && event.key !== 'Backspace') return;
      playKey(soundProfile, soundEnabled);
    };
    const onKeyUp = () => {
      playKeyUp(soundProfile, soundEnabled);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [soundEnabled, soundProfile, volume]);

  /* ---- controls ---- */
  const restart = useCallback(() => {
    const state = engine.current;
    state.index = 0;
    state.typed = '';
    state.elapsed = 0;
    state.correct = 0;
    state.incorrect = 0;
    state.extra = 0;
    state.missed = 0;
    state.chars = 0;
    state.errorsByKey = {};
    state.events = [];
    state.samples = [];
    state.wordBuffer = [];
    state.finished = false;
    state.paused = false;
    state.itemErrors = 0;
    state.itemHadError = false;
    state.itemStartedAt = performance.now();
    state.lastSampleSecond = -1;
    state.awaitingEnter = false;
    state.advanceAt = 0;
    syncView();
  }, [syncView]);

  const togglePause = useCallback(() => {
    const state = engine.current;
    state.paused = !state.paused;
    state.lastTick = performance.now();
    syncView();
  }, [syncView]);

  const skip = useCallback(() => {
    advance();
  }, [advance]);

  const keyStatsSnapshot = useMemo(() => engine.current.keyStats, [view.index]);

  return {
    view,
    restart,
    togglePause,
    skip,
    finish,
    confirm,
    keyStats: keyStatsSnapshot
  };
};
