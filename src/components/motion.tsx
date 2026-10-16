/**
 * Motion components.
 *
 * Hand-written equivalents of the react-bits effects worth having here, built
 * with no extra dependencies: CSS custom properties, `element.animate()`, canvas
 * 2D, and one shared rAF where a spring is needed. Techniques and constants
 * follow the originals (credited in ATTRIBUTION.md).
 */
import { useEffect, useRef, useState } from 'react';

import './motion.css';

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

const prefersReduced = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);


/** Semi-implicit spring, sub-stepped so it stays stable at any frame rate. */
const integrate = (
  state: { value: number; velocity: number },
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
  steps = 4
) => {
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += (stiffness * (target - state.value) - damping * state.velocity) * h;
    state.value += state.velocity * h;
  }
};


const SPRING_OMEGA = (2 * Math.PI) / 0.7;
const SPRING_ZETA = 1 - 0.2;

export const Counter = ({
  value,
  decimals = 0,
  minDigits = 1,
  suffix = '',
  prefix = '',
  className = ''
}: {
  value: number;
  decimals?: number;
  minDigits?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) => {
  const [display, setDisplay] = useState(value);
  const state = useRef({ value, velocity: 0 });
  const raf = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (prefersReduced()) {
      state.current.value = value;
      setDisplay(value);
      return undefined;
    }
    let alive = true;
    const tick = (now: number) => {
      if (!alive) return;
      const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 0.016;
      last.current = now;
      integrate(state.current, value, SPRING_OMEGA ** 2, 2 * SPRING_ZETA * SPRING_OMEGA, dt, 4);
      const settled =
        Math.abs(state.current.value - value) < 0.0008 && Math.abs(state.current.velocity) < 0.004;
      if (settled) {
        state.current.value = value;
        state.current.velocity = 0;
      }
      setDisplay(state.current.value);
      if (!settled) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [value]);

  const text = display.toFixed(decimals);
  const [whole, fraction] = text.split('.');
  const padded = whole.padStart(minDigits, '0');
  const speed = Math.abs(state.current.velocity);
  const blur = Math.min(0.09, Math.max(0, (speed - 3) * 0.006));

  return (
    <span className={`counter ${className}`.trim()} style={{ filter: blur > 0.001 ? `blur(${blur}em)` : undefined }}>
      {prefix && <span className="counter__affix">{prefix}</span>}
      {padded.split('').map((digit, index) => (
        <span className="counter__digit" key={`${index}-${padded.length}`}>
          {digit}
        </span>
      ))}
      {decimals > 0 && (
        <>
          <span className="counter__sep">.</span>
          <span className="counter__fraction">{fraction}</span>
        </>
      )}
      {suffix && <span className="counter__affix">{suffix}</span>}
    </span>
  );
};