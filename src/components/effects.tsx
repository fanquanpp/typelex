/**
 * Motion primitives.
 *
 * Hand-written equivalents of the effects we wanted from react-bits, with no
 * extra dependencies: everything below uses IntersectionObserver, CSS custom
 * properties, `element.animate()` or a single rAF loop. Each one respects
 * prefers-reduced-motion.
 */
import {
  useCallback,
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
  variant?: 'rise' | 'scale';
  as?: 'div' | 'section' | 'li' | 'article';
  style?: CSSProperties;
}

export const Reveal = ({ children, className = '', delay = 0, variant = 'rise', as = 'div', style }: RevealProps) => {
  const { ref, inView } = useInView<HTMLDivElement>();
  const Tag = as;
  return (
    <Tag
      ref={ref as never}
      className={`${variant === 'scale' ? 'reveal-scale' : 'reveal'} ${className}`.trim()}
      data-visible={inView ? 'true' : 'false'}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </Tag>
  );
};

export const StaggerGroup = ({
  children,
  className = '',
  as = 'div'
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'section';
}) => {
  const { ref, inView } = useInView<HTMLDivElement>();
  const Tag = as;
  const items = Array.isArray(children) ? children : [children];
  return (
    <Tag ref={ref as never} className={`stagger ${className}`.trim()} data-visible={inView ? 'true' : 'false'}>
      {items.map((child, index) => (
        <div key={index} style={{ '--i': index } as CSSProperties} className="stagger-item">
          {child}
        </div>
      ))}
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

export const ShinyText = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`shiny-text ${className}`.trim()}>{children}</span>
);

export const GradientText = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <span className={`gradient-text ${className}`.trim()}>{children}</span>
);

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
      element.dataset.active = 'true';
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      element.dataset.active = 'false';
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
  style
}: {
  children: ReactNode;
  className?: string;
  size?: number;
  style?: CSSProperties;
}) => {
  const ref = useSpotlight<HTMLDivElement>(size);
  return (
    <div ref={ref} className={`spotlight ${className}`.trim()} style={style}>
      {children}
    </div>
  );
};

/** 3D tilt that follows the pointer, with an optional glare. */
export const TiltCard = ({
  children,
  className = '',
  amplitude = 8,
  glare = true,
  style
}: {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  glare?: boolean;
  style?: CSSProperties;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (prefersReducedMotion()) return undefined;
    if (window.matchMedia?.('(hover: none)').matches) return undefined;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      element.dataset.tracking = 'true';
      element.style.setProperty('--ry', `${(nx * amplitude).toFixed(2)}deg`);
      element.style.setProperty('--rx', `${(-ny * amplitude).toFixed(2)}deg`);
    };
    const onLeave = () => {
      element.dataset.tracking = 'false';
      element.style.setProperty('--ry', '0deg');
      element.style.setProperty('--rx', '0deg');
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [amplitude]);

  return (
    <div
      ref={ref}
      className={`tilt ${glare ? 'glare' : ''} ${className}`.trim()}
      style={{ transformStyle: 'preserve-3d', ...style }}
    >
      {children}
    </div>
  );
};

/** Elements ease toward the cursor and spring back. */
export const Magnetic = ({
  children,
  className = '',
  strength = 7,
  style
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
  style?: CSSProperties;
}) => {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    if (prefersReducedMotion()) return undefined;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      const reach = Math.max(rect.width, rect.height) * 1.4;
      if (distance > reach) return;
      const pull = 1 - distance / reach;
      element.dataset.tracking = 'true';
      element.style.setProperty('--mx', `${(dx / strength) * pull}px`);
      element.style.setProperty('--my', `${(dy / strength) * pull}px`);
    };
    const onLeave = () => {
      element.dataset.tracking = 'false';
      element.style.setProperty('--mx', '0px');
      element.style.setProperty('--my', '0px');
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerleave', onLeave);
    return () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerleave', onLeave);
    };
  }, [strength]);

  return (
    <span ref={ref} className={`magnet ${className}`.trim()} style={style}>
      {children}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* backgrounds                                                         */
/* ------------------------------------------------------------------ */

/**
 * Springy dot grid on canvas 2D. Dots are pushed away from the cursor and
 * settle back; a click sends a shockwave through the lattice.
 */
export const DotGrid = ({
  className = '',
  gap = 26,
  dotSize = 2.1,
  color = 'rgba(255,255,255,0.16)',
  activeColor = 'rgba(100,230,208,0.85)',
  radius = 130
}: {
  className?: string;
  gap?: number;
  dotSize?: number;
  color?: string;
  activeColor?: string;
  radius?: number;
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    if (prefersReducedMotion()) return undefined;

    const reduced = window.matchMedia?.('(hover: none)').matches;
    if (reduced) return undefined;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const pointer = { x: -9999, y: -9999 };
    const shocks: { x: number; y: number; at: number }[] = [];
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      raf = 0;
      ctx.clearRect(0, 0, width, height);
      const now = performance.now();
      const cols = Math.ceil(width / gap) + 1;
      const rows = Math.ceil(height / gap) + 1;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const bx = col * gap;
          const by = row * gap;
          const dx = bx - pointer.x;
          const dy = by - pointer.y;
          const distance = Math.hypot(dx, dy);
          let ox = 0;
          let oy = 0;
          let heat = 0;
          if (distance < radius) {
            const force = (1 - distance / radius) ** 2;
            const angle = Math.atan2(dy, dx);
            ox = Math.cos(angle) * force * 16;
            oy = Math.sin(angle) * force * 16;
            heat = force;
          }
          for (const shock of shocks) {
            const age = (now - shock.at) / 700;
            if (age > 1) continue;
            const sdx = bx - shock.x;
            const sdy = by - shock.y;
            const sd = Math.hypot(sdx, sdy);
            const ring = Math.abs(sd - age * 320);
            if (ring < 44) {
              const force = (1 - ring / 44) * (1 - age);
              const angle = Math.atan2(sdy, sdx);
              ox += Math.cos(angle) * force * 26;
              oy += Math.sin(angle) * force * 26;
              heat = Math.max(heat, force * 0.8);
            }
          }
          const size = dotSize + heat * 2.6;
          ctx.fillStyle = heat > 0.05 ? activeColor : color;
          ctx.globalAlpha = 0.35 + heat * 0.65;
          ctx.beginPath();
          ctx.arc(bx + ox, by + oy, size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      while (shocks.length && now - shocks[0].at > 800) shocks.shift();
      if (shocks.length) raf = requestAnimationFrame(draw);
    };

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };

    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      wake();
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
      wake();
    };
    const onDown = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      shocks.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, at: performance.now() });
      wake();
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(canvas);
    resize();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, [gap, dotSize, color, activeColor, radius]);

  return <canvas ref={canvasRef} className={`dotgrid ${className}`.trim()} aria-hidden="true" />;
};

/** Sparks fly from every click — cheap, global, and adds a lot of feel. */
export const useClickSpark = (enabled = true, count = 8) => {
  useEffect(() => {
    if (!enabled) return undefined;
    if (prefersReducedMotion()) return undefined;
    const onDown = (event: PointerEvent) => {
      const host = document.createElement('div');
      host.style.position = 'fixed';
      host.style.left = `${event.clientX}px`;
      host.style.top = `${event.clientY}px`;
      host.style.pointerEvents = 'none';
      host.style.zIndex = '9999';
      document.body.appendChild(host);
      for (let i = 0; i < count; i++) {
        const spark = document.createElement('i');
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const distance = 22 + Math.random() * 30;
        spark.className = 'spark';
        spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
        host.appendChild(spark);
      }
      window.setTimeout(() => host.remove(), 620);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [enabled, count]);
};

/* ------------------------------------------------------------------ */
/* page transition                                                     */
/* ------------------------------------------------------------------ */

export const usePageTransitionKey = (key: string) => {
  const [stamp, setStamp] = useState(key);
  useEffect(() => {
    setStamp(key);
  }, [key]);
  return stamp;
};

/** Pixel-dissolve reveal used when a word card flips to its detail side. */
export const PixelTransition = ({
  children,
  trigger,
  className = '',
  gridSize = 12
}: {
  children: ReactNode;
  trigger: unknown;
  className?: string;
  gridSize?: number;
}) => {
  const [phase, setPhase] = useState<'idle' | 'cover' | 'reveal'>('idle');
  const previous = useRef(trigger);

  useEffect(() => {
    if (previous.current === trigger) return undefined;
    previous.current = trigger;
    if (prefersReducedMotion()) return undefined;
    setPhase('cover');
    const coverTimer = window.setTimeout(() => setPhase('reveal'), 190);
    const idleTimer = window.setTimeout(() => setPhase('idle'), 520);
    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(idleTimer);
    };
  }, [trigger]);

  const cells = gridSize * gridSize;
  const order = useMemo(
    () => Array.from({ length: cells }, (_, index) => index).sort(() => Math.random() - 0.5),
    [cells]
  );

  return (
    <div className={`relative ${className}`.trim()} style={{ position: 'relative' }}>
      {children}
      <div
        className="pixel-grid"
        data-phase={phase === 'idle' ? undefined : phase}
        style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)`, gridTemplateRows: `repeat(${gridSize}, 1fr)` }}
        aria-hidden="true"
      >
        {order.map((index, orderIndex) => (
          <i key={index} style={{ '--d': orderIndex * 1.6 } as CSSProperties} />
        ))}
      </div>
    </div>
  );
};

/** Hook: run a callback on every click of an element, with sparks. */
export const useMagneticHover = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const onEnter = useCallback(() => {
    if (ref.current) ref.current.dataset.hover = 'true';
  }, []);
  const onLeave = useCallback(() => {
    if (ref.current) ref.current.dataset.hover = 'false';
  }, []);
  return { ref, onEnter, onLeave };
};
