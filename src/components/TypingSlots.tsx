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
 * The keyboard event handling stays in the typing engine — this component is a
 * pure view over (text, typed) with animation state derived from the diff.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

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
  className?: string;
}

const OMEGA = (2 * Math.PI) / 0.34;
const ZETA = 1 - 0.22;

export const TypingSlots = ({ text, typed, errorAt = 0, sentence = false, className = '' }: TypingSlotsProps) => {
  const chars = useMemo(() => Array.from(text), [text]);
  const input = useMemo(() => Array.from(typed), [typed]);
  const extras = input.slice(chars.length);
  const cursorIndex = Math.min(input.length, chars.length);

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

  return (
    <div
      ref={rowRef}
      className={`typing-slots ${sentence ? 'typing-slots--sentence' : ''} ${shake ? 'typing-slots--shake' : ''} ${className}`.trim()}
      style={{ '--slot-count': chars.length } as CSSProperties}
      aria-label={text}
    >
      {chars.map((char, index) => {
        const inputChar = input[index];
        const state = inputChar === undefined ? 'pending' : inputChar === char ? 'correct' : 'incorrect';
        return (
          <span
            key={`${index}-${char}`}
            ref={node => {
              refs.current[index] = node;
            }}
            className="typing-slots__slot"
            data-state={state}
            data-cursor={index === cursorIndex ? 'true' : undefined}
            aria-hidden="true"
          >
            <span className="typing-slots__glyph">{char === ' ' ? '\u00a0' : char}</span>
          </span>
        );
      })}
      {/* characters typed past the end */}
      {extras.map((char, index) => (
        <span key={`extra-${index}`} className="typing-slots__slot typing-slots__slot--extra" aria-hidden="true">
          <span className="typing-slots__glyph">{char === ' ' ? '\u00a0' : char}</span>
        </span>
      ))}
      <span ref={caretRef} className="typing-slots__caret" data-show="false" aria-hidden="true">
        <i />
      </span>
      <span className="sr-only">{text}</span>
    </div>
  );
};

export default TypingSlots;
