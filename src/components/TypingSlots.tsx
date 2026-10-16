/**
 * TypingSlots — the CodeSlots-style input for the typing drill.
 *
 * The technique is from the react-bits CodeSlots component (MIT + Commons
 * Clause): a row of slots, each holding a spring-driven "land" animation for
 * the character that arrives and a drain for the one removed, a gliding caret
 * that interpolates its position between slots, and a soft shake + tint on
 * error. Springs here are the same hand-rolled semi-implicit integrator used
 * across the app (stiffness/omega follow the original's parameters).
 *
 * On top of the raw slots the component groups characters into pronunciation
 * chunks (English syllables / Japanese kana) so the reading is visible while
 * typing: chunk boundaries get a subtle divider, the chunk under the cursor is
 * lifted, and completed chunks fade slightly into the background.
 *
 * The keyboard event handling stays in the typing engine — this component is a
 * pure view over (text, typed) with animation state derived from the diff.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { chunkEnglishWord, chunkSentence, type TextChunk } from '../lib/typing/syllables';
import './TypingSlots.css';

interface SlotBody {
  land: number; // 0..1 how far the character has settled in
  velocity: number;
  present: boolean;
  drain: number; // 0..1 progress of the drain-out
}

export interface TypingSlotsProps {
  text: string;
  typed: string;
  /** brief window after an error, used for the shake + tint */
  errorAt?: number;
  sentence?: boolean;
  /** show pronunciation chunk boundaries (syllables / kana segments) */
  showChunks?: boolean;
  className?: string;
}

const OMEGA = (2 * Math.PI) / 0.34;
const ZETA = 1 - 0.22;

/** Chunk a drill text into pronunciation groups; falls back to no chunks. */
const chunkFor = (text: string, sentence: boolean): TextChunk[] => {
  try {
    if (sentence) return chunkSentence(text);
    if (/^[\p{Script=Latin}]+$/u.test(text)) return chunkEnglishWord(text);
    return [{ start: 0, length: Array.from(text).length }];
  } catch {
    return [{ start: 0, length: Array.from(text).length }];
  }
};

export const TypingSlots = ({
  text,
  typed,
  errorAt = 0,
  sentence = false,
  showChunks = true,
  className = ''
}: TypingSlotsProps) => {
  const chars = useMemo(() => Array.from(text), [text]);
  const input = useMemo(() => Array.from(typed), [typed]);
  const extras = input.slice(chars.length);
  const cursorIndex = Math.min(input.length, chars.length);

  const chunks = useMemo(
    () => (showChunks ? chunkFor(text, sentence) : []),
    [text, sentence, showChunks]
  );

  const bodies = useRef<SlotBody[]>([]);
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const caretRef = useRef<HTMLSpanElement | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const [shake, setShake] = useState(false);

  /* keep the body list in sync with the target length */
  if (bodies.current.length !== chars.length) {
    const next = Array.from({ length: chars.length }, (_, i) => bodies.current[i] ?? {
      land: input[i] !== undefined ? 1 : 0,
      velocity: 0,
      present: input[i] !== undefined,
      drain: 0
    });
    bodies.current = next;
  }

  /* diff-driven springs: a character appearing lands, one disappearing drains */
  useEffect(() => {
    chars.forEach((_, i) => {
      const body = bodies.current[i];
      const should = input[i] !== undefined;
      if (should && !body.present) {
        body.present = true;
        body.drain = 0;
      } else if (!should && body.present) {
        body.present = false;
      }
    });
  }, [chars, input]);

  /* the spring loop */
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      bodies.current.forEach((body, i) => {
        const node = refs.current[i];
        body.land = body.present ? 1 : 0;
        if (node) node.dataset.state = body.present ? 'landed' : 'empty';
      });
      return undefined;
    }
    let alive = true;
    const tick = (now: number) => {
      if (!alive) return;
      const dt = lastRef.current ? Math.min(0.05, (now - lastRef.current) / 1000) : 0.016;
      lastRef.current = now;
      let moving = false;

      bodies.current.forEach((body, i) => {
        const node = refs.current[i];
        const target = body.present ? 1 : 0;
        if (Math.abs(body.land - target) > 0.001 || Math.abs(body.velocity) > 0.004) {
          body.velocity += (OMEGA * OMEGA * (target - body.land) - 2 * ZETA * OMEGA * body.velocity) * dt;
          body.land += body.velocity * dt;
          if (Math.abs(body.land - target) < 0.001 && Math.abs(body.velocity) < 0.01) {
            body.land = target;
            body.velocity = 0;
          } else {
            moving = true;
          }
        }
        if (node) {
          node.dataset.state = body.land > 0.02 ? (body.present ? 'landed' : 'draining') : 'empty';
          node.style.setProperty('--land', body.land.toFixed(4));
        }
      });

      /* caret glides between slots */
      const row = rowRef.current;
      const caret = caretRef.current;
      if (row && caret) {
        const anchor = refs.current[Math.max(0, Math.min(cursorIndex, chars.length - 1))];
        const next = refs.current[Math.min(chars.length, chars.length)];
        const base = anchor?.offsetLeft ?? 0;
        const slotWidth = anchor?.offsetWidth ?? 0;
        const gap = next && anchor ? Math.max(0, next.offsetLeft - anchor.offsetLeft - anchor.offsetWidth) : 0;
        caret.style.transform = `translateX(${(base + slotWidth + gap / 2).toFixed(2)}px)`;
        caret.dataset.show = document.hasFocus() ? 'true' : 'false';
      }

      if (moving) rafRef.current = requestAnimationFrame(tick);
      else lastRef.current = 0;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = 0;
    };
  }, [chars.length, cursorIndex]);

  /* error shake */
  useEffect(() => {
    if (!errorAt) return undefined;
    setShake(true);
    const timer = window.setTimeout(() => setShake(false), 340);
    return () => window.clearTimeout(timer);
  }, [errorAt]);

  /* ---- pronunciation chunks: index → chunk lookups ---- */
  const chunkOfChar = useMemo(() => {
    const map = new Map<number, { index: number; first: boolean; last: boolean }>();
    chunks.forEach((chunk, index) => {
      for (let i = chunk.start; i < chunk.start + chunk.length; i++) {
        map.set(i, { index, first: i === chunk.start, last: i === chunk.start + chunk.length - 1 });
      }
    });
    return map;
  }, [chunks]);

  const activeChunk = useMemo(() => {
    const entry = chunkOfChar.get(Math.max(0, cursorIndex - 1));
    return entry ? entry.index : cursorIndex === 0 && chunks.length ? 0 : -1;
  }, [chunkOfChar, cursorIndex, chunks.length]);

  const renderSlot = (char: string, index: number, extra = false) => {
    const inputChar = extra ? extras[index] : input[index];
    const state = extra ? 'extra' : inputChar === undefined ? 'pending' : inputChar === char ? 'correct' : 'incorrect';
    const group = chunkOfChar.get(index);
    return (
      <span
        key={`${extra ? 'extra' : 'slot'}-${index}-${char}`}
        ref={node => {
          if (!extra) refs.current[index] = node;
        }}
        className="typing-slots__slot"
        data-state={state}
        data-cursor={index === cursorIndex ? 'true' : undefined}
        data-chunk-first={group?.first ? 'true' : undefined}
        data-chunk-last={group?.last ? 'true' : undefined}
        data-chunk-active={group && group.index === activeChunk && chunks.length > 1 ? 'true' : undefined}
        aria-hidden="true"
      >
        <span className="typing-slots__glyph">{char === ' ' ? '\u00a0' : char}</span>
      </span>
    );
  };

  return (
    <div
      ref={rowRef}
      className={`typing-slots ${sentence ? 'typing-slots--sentence' : ''} ${shake ? 'typing-slots--shake' : ''} ${className}`.trim()}
      style={{ '--slot-count': chars.length } as CSSProperties}
      aria-label={text}
    >
      {chars.map((char, index) => renderSlot(char, index))}
      {/* characters typed past the end */}
      {extras.map((char, index) => renderSlot(char, index, true))}
      <span ref={caretRef} className="typing-slots__caret" data-show="false" aria-hidden="true">
        <i />
      </span>
      <span className="sr-only">{text}</span>
    </div>
  );
};

export default TypingSlots;
