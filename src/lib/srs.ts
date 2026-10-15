/**
 * Spaced repetition for vocabulary.
 *
 * A trimmed SM-2: four grades (again / hard / good / easy) adjust an ease
 * factor and an interval in days. The tuning is deliberately gentle — this
 * backs a typing drill, not a full-blown flashcard app, so a correct answer
 * should not push a word a month away on the first pass.
 */
import type { SrsCard } from './types';

export type Grade = 'again' | 'hard' | 'good' | 'easy';

const DAY = 86_400_000;

export const createCard = (now = Date.now()): SrsCard => ({
  ease: 2.4,
  interval: 0,
  reps: 0,
  due: now,
  last: now,
  lapses: 0
});

const GRADE_EASE: Record<Grade, number> = { again: -0.22, hard: -0.1, good: 0, easy: 0.13 };

const clampEase = (ease: number) => Math.min(2.8, Math.max(1.3, ease));

export const reviewCard = (card: SrsCard, grade: Grade, now = Date.now()): SrsCard => {
  const ease = clampEase(card.ease + GRADE_EASE[grade]);
  let interval: number;
  let reps = card.reps;
  let lapses = card.lapses;

  if (grade === 'again') {
    reps = 0;
    lapses += 1;
    interval = 0;
  } else {
    reps += 1;
    if (reps === 1) {
      interval = grade === 'hard' ? 0.5 : grade === 'good' ? 1 : 2;
    } else if (reps === 2) {
      interval = grade === 'hard' ? 2 : grade === 'good' ? 4 : 6;
    } else {
      const multiplier = grade === 'hard' ? 1.25 : grade === 'good' ? ease : ease * 1.25;
      interval = Math.max(1, card.interval * multiplier);
    }
    interval = Math.min(interval, 365);
  }

  return {
    ease,
    interval,
    reps,
    due: now + (interval === 0 ? 4 * 60_000 : interval * DAY),
    last: now,
    lapses
  };
};

export const isDue = (card: SrsCard, now = Date.now()) => card.due <= now;

/** A word's maturity 0..1, used for the progress rings in the wordbook. */
export const maturity = (card: SrsCard) => {
  if (card.interval <= 0) return 0;
  return Math.min(1, Math.log2(card.interval + 1) / Math.log2(31));
};

export const describeInterval = (card: SrsCard) => {
  if (card.interval <= 0) return '待重学';
  if (card.interval < 1) return '12 小时';
  if (card.interval < 30) return `${Math.round(card.interval)} 天`;
  if (card.interval < 365) return `${Math.round(card.interval / 30)} 个月`;
  return '已掌握';
};

/**
 * Derive a grade from a typing attempt, so practice mode feeds the scheduler
 * without asking the user to self-assess:
 *   - clean and fast            -> good
 *   - clean but slow            -> hard
 *   - clean, very fast, mature  -> easy
 *   - had to correct a mistake  -> again
 */
export const gradeFromAttempt = (input: {
  hadError: boolean;
  corrected: boolean;
  msPerChar: number;
  mature: boolean;
}): Grade => {
  if (input.hadError && input.corrected) return 'again';
  if (input.msPerChar <= 190 && input.mature) return 'easy';
  if (input.msPerChar <= 300) return 'good';
  return 'hard';
};
