/**
 * Typing metrics.
 *
 * Formulas follow the conventions used by the mainstream typing trainers so the
 * numbers are comparable:
 *   - WPM  = (characters / 5) / minutes          — the "1 word = 5 chars" rule
 *   - net WPM counts only fully correct words
 *   - raw WPM counts every character actually typed (correct + wrong + extra)
 *   - accuracy is measured per keystroke, live, so a corrected typo still counts
 *   - consistency = 100 · (1 − tanh(σ/μ + (σ/μ)³/3 + (σ/μ)⁵/5))   [kogasa]
 */
import type { KeystrokeEvent, SessionSample } from '../types';

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const round = (value: number, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** characters per minute -> words per minute */
export const cpmToWpm = (cpm: number) => cpm / 5;

export const wpm = (charCount: number, seconds: number) => {
  if (seconds <= 0) return 0;
  return charCount / 5 / (seconds / 60);
};

export const rawWpm = (allChars: number, seconds: number) => wpm(allChars, seconds);

export const accuracyOf = (events: KeystrokeEvent[]) => {
  let correct = 0;
  let total = 0;
  for (const event of events) {
    if (!event.actual) continue;
    total += 1;
    if (event.correct) correct += 1;
  }
  return total ? (correct / total) * 100 : 100;
};

/**
 * Consistency (a.k.a. "kogasa"): maps the coefficient of variation of the
 * per-second speed series onto 0..100, where a perfectly steady typist scores
 * 100 and an erratic one approaches 0.
 */
export const consistencyOf = (samples: SessionSample[], key: 'wpm' | 'raw' = 'raw') => {
  const values = samples.map(sample => sample[key]).filter(value => value > 0);
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const cov = Math.sqrt(variance) / mean;
  const inner = cov + cov ** 3 / 3 + cov ** 5 / 5;
  return clamp(100 * (1 - Math.tanh(inner)), 0, 100);
};

export interface CharBreakdown {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

/**
 * Compare the typed stream against the target for one item.
 * `extra` = characters typed past the end of the target, `missed` = target
 * characters never typed.
 */
export const compareText = (target: string, typed: string): CharBreakdown => {
  let correct = 0;
  let incorrect = 0;
  const shared = Math.min(target.length, typed.length);
  for (let i = 0; i < shared; i++) {
    if (target[i] === typed[i]) correct += 1;
    else incorrect += 1;
  }
  return {
    correct,
    incorrect,
    extra: Math.max(0, typed.length - target.length),
    missed: Math.max(0, target.length - typed.length)
  };
};

/**
 * Per-key statistics. Each key keeps an exponentially smoothed time-to-type
 * (α = 0.1) plus its best observed value, which is what the adaptive drill
 * uses to decide what to practise next.
 */
const SMOOTHING = 0.1;
export const MIN_KEY_SAMPLE_MS = 40;
export const MAX_KEY_SAMPLE_MS = 12000;

export interface KeyAccumulator {
  hits: number;
  misses: number;
  time: number;
  best: number;
  samples: number;
}

export const updateKeyStat = (
  stat: KeyAccumulator,
  char: string,
  correct: boolean,
  deltaMs: number
): KeyAccumulator => {
  const next: KeyAccumulator = { ...stat };
  next.hits += 1;
  if (!correct) next.misses += 1;
  if (deltaMs >= MIN_KEY_SAMPLE_MS && deltaMs <= MAX_KEY_SAMPLE_MS) {
    next.time = next.samples === 0 ? deltaMs : SMOOTHING * deltaMs + (1 - SMOOTHING) * next.time;
    next.best = next.samples === 0 ? deltaMs : Math.min(next.best, deltaMs);
    next.samples += 1;
  }
  void char;
  return next;
};

/** Accuracy for a single key, 0..1, with a neutral prior for unseen keys. */
export const keyAccuracy = (stat?: KeyAccumulator) => {
  if (!stat || stat.hits === 0) return 1;
  return clamp(1 - stat.misses / stat.hits, 0, 1);
};

/** Confidence in a key relative to a target time-to-type: ≥1 means "at target". */
export const keyConfidence = (stat: KeyAccumulator | undefined, targetMs: number) => {
  if (!stat || stat.samples === 0 || stat.time <= 0) return 0;
  return targetMs / stat.time;
};

export const speedToTime = (cpm: number) => (cpm > 0 ? 60000 / cpm : Infinity);
export const timeToSpeed = (ms: number) => (ms > 0 ? 60000 / ms : 0);

/* ------------------------------------------------------------------ */
/* XP / level curve (monkeytype-compatible, invertible)                */
/* ------------------------------------------------------------------ */

export const levelMaxXp = (level: number) => 49 * (level - 1) + 100;

export const totalXpToReachLevel = (level: number) => (49 * level ** 2 + 53 * level - 102) / 2;

export const levelFromTotalXp = (totalXp: number) =>
  Math.floor((Math.sqrt(392 * Math.max(0, totalXp) + 22801) - 53) / 98);

export const levelProgress = (totalXp: number) => {
  const level = Math.max(1, levelFromTotalXp(totalXp));
  const base = totalXpToReachLevel(level);
  const need = levelMaxXp(level);
  const current = totalXp - base;
  return { level, current: Math.max(0, current), need, ratio: clamp(current / need, 0, 1) };
};

export const xpForSession = (result: { chars: number; accuracy: number; wpm: number }) => {
  const base = result.chars * 0.6;
  const speedBonus = Math.max(0, result.wpm - 20) * 1.4;
  const accuracyFactor = clamp(result.accuracy / 100, 0, 1) ** 1.5;
  return Math.max(1, Math.round((base + speedBonus) * accuracyFactor));
};
