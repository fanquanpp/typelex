/**
 * Motion primitives.
 *
 * Hand-written equivalents of the effects we wanted from react-bits, with no
 * extra dependencies: everything below uses IntersectionObserver, CSS custom
 * properties, `element.animate()` or a single rAF loop. Each one respects
 * prefers-reduced-motion.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

/* ------------------------------------------------------------------ */
/* reveal on scroll                                                    */
/* ------------------------------------------------------------------ */

export const useInView = <T extends HTMLElement>(options?: IntersectionObserverInit) => {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    /* Anything already on screen at mount is revealed immediately. Relying on
       the observer alone means a reveal that never fires leaves the content
       permanently blurred and faded — which is exactly what happens in a
       background tab, and is unforgivable for above-the-fold copy. */
    const rect = element.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const viewportW = window.innerWidth || document.documentElement.clientWidth;
    if (rect.top < viewportH * 0.96 && rect.bottom > 0 && rect.left < viewportW && rect.right > 0) {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[entries.length - 1];
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px', ...options }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [options]);

  return { ref, inView };
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'section' | 'li' | 'article';
  style?: CSSProperties;
  /** anchor id so the sidebar's secondary menu can scroll to this section */
  id?: string;
}

export const Reveal = ({ children, className = '', delay = 0, as = 'div', style, id }: RevealProps) => {
  const { ref, inView } = useInView<HTMLDivElement>();
  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      id={id}
      className={`reveal ${className}`.trim()}
      data-visible={inView ? 'true' : 'false'}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </Tag>
  );
};

/* ------------------------------------------------------------------ */
/* text effects                                                        */
/* ------------------------------------------------------------------ */

export const SplitText = ({
  text,
  effect = 'rise',
  className = '',
  stagger = 26,
  as = 'span'
}: {
  text: string;
  effect?: 'rise' | 'flip' | 'pop';
  className?: string;
  stagger?: number;
  as?: 'span' | 'h1' | 'h2' | 'h3' | 'p';
}) => {
  const Tag = as;
  const characters = useMemo(() => Array.from(text), [text]);
  const reduced = prefersReducedMotion();
  if (reduced) return <Tag className={className}>{text}</Tag>;
  return (
    <Tag className={`split char-${effect} ${className}`.trim()} aria-label={text}>
      {characters.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className="split-char"
          style={{ '--i': index, animationDelay: `${index * stagger}ms` } as CSSProperties}
          aria-hidden="true"
        >
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
    </Tag>
  );
};

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-<>[]{}';

/** Scramble-then-resolve reveal, used for the word being introduced. */
export const DecryptText = ({
  text,
  className = '',
  speed = 34,
  trigger = 'view',
  style
}: {
  text: string;
  className?: string;
  speed?: number;
  trigger?: 'view' | 'always';
  style?: CSSProperties;
}) => {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [display, setDisplay] = useState(text);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(false);
    if (trigger === 'view' && !inView) return undefined;
    if (prefersReducedMotion()) {
      setDisplay(text);
      setDone(true);
      return undefined;
    }
    let frame = 0;
    const total = text.length;
    const timer = window.setInterval(() => {
      frame += 1;
      const revealed = Math.floor(frame / 2);
      setDisplay(
        Array.from(text)
          .map((char, index) => {
            if (index < revealed || char === ' ') return char;
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join('')
      );
      if (revealed >= total) {
        window.clearInterval(timer);
        setDisplay(text);
        setDone(true);
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, speed, trigger, inView]);

  return (
    <span ref={ref} className={`decrypt ${done ? 'decrypt-done' : ''} ${className}`.trim()} style={style}>
      {display}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* numbers                                                            */
/* ------------------------------------------------------------------ */

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

export const CountUp = ({
  to,
  from = 0,
  duration = 900,
  decimals = 0,
  suffix = '',
  prefix = '',
  className = ''
}: {
  to: number;
  from?: number;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) => {
  const { ref, inView } = useInView<HTMLSpanElement>();
  /* Starts at the true value rather than 0: if the element never enters the
     viewport (hidden tab, below the fold, reduced motion) the number shown is
     still correct, and the count-up becomes a reveal rather than a lie. */
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (!inView) return undefined;
    if (prefersReducedMotion()) {
      setValue(to);
      return undefined;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (to - from) * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, from, duration]);

  return (
    <span ref={ref} className={`tnum ${className}`.trim()}>
      {prefix}
      {value.toFixed(decimals)}
      {suffix}
    </span>
  );
};

/** Odometer-style digit roll for streak counters. */
export const Odometer = ({ value, className = '' }: { value: number; className?: string }) => {
  const digits = String(Math.max(0, Math.floor(value))).split('');
  return (
    <span className={`odometer ${className}`.trim()}>
      {digits.map((digit, index) => (
        <span className="odometer-digit" key={index}>
          <span className="odometer-reel" style={{ transform: `translateY(-${Number(digit) * 1.06}em)` }}>
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* pointer effects                                                     */
/* ------------------------------------------------------------------ */

/** Writes --spot-x / --spot-y on the element for the `.spotlight` overlay. */
export const useSpotlight = <T extends HTMLElement>(size = 320) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let raf = 0;
    let pending: { x: number; y: number } | null = null;

    const apply = () => {
      raf = 0;
      if (!pending) return;
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--spot-x', `${pending.x - rect.left}px`);
      element.style.setProperty('--spot-y', `${pending.y - rect.top}px`);
      pending = null;
    };

    const onMove = (event: PointerEvent) => {
      pending = { x: event.clientX, y: event.clientY };
      /* A separate attribute: `data-active` belongs to the component's own
         selected state (mode cards, category cards). Overwriting it here was
         what made a selected card lose its highlight on the first mouse-leave. */
      element.dataset.spotlight = 'true';
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      element.dataset.spotlight = 'false';
    };

    element.style.setProperty('--spot-size', `${size}px`);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [size]);

  return ref;
};

export const SpotlightCard = ({
  children,
  className = '',
  size = 320,
  style,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  size?: number;
  style?: CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const ref = useSpotlight<HTMLDivElement>(size);
  return (
    <div ref={ref} className={`spotlight ${className}`.trim()} style={style} {...rest}>
      {children}
    </div>
  );
};
