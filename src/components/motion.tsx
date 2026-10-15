/**
 * Motion components.
 *
 * Hand-written equivalents of the react-bits effects worth having here, built
 * with no extra dependencies: CSS custom properties, `element.animate()`, canvas
 * 2D, and one shared rAF where a spring is needed. Techniques and constants
 * follow the originals (credited in ATTRIBUTION.md).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';

import './motion.css';

/* ------------------------------------------------------------------ */
/* shared helpers                                                      */
/* ------------------------------------------------------------------ */

const prefersReduced = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

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

/* ------------------------------------------------------------------ */
/* VariableProximity — letters gain weight near the cursor             */
/* ------------------------------------------------------------------ */

/**
 * Splits a label into per-character spans and drives a variable-font axis from
 * the pointer's distance to each glyph. Falls back to plain text when the font
 * has no variable axis or the user prefers reduced motion.
 */
export const VariableProximity = ({
  label,
  className = '',
  radius = 130,
  from = 300,
  to = 800,
  falloff = 'gaussian',
  smoothing = 0.2,
  lift = 0.06,
  idleWave = true,
  as: Tag = 'span'
}: {
  label: string;
  className?: string;
  radius?: number;
  from?: number;
  to?: number;
  falloff?: 'linear' | 'exponential' | 'gaussian';
  smoothing?: number;
  lift?: number;
  idleWave?: boolean;
  as?: 'span' | 'h1' | 'h2' | 'p';
}) => {
  const rootRef = useRef<HTMLElement | null>(null);
  const chars = useMemo(() => Array.from(label), [label]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReduced()) return undefined;

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-vp-char]'));
    if (!nodes.length) return undefined;

    const levels = new Float32Array(nodes.length);
    const pointer = { x: -9999, y: -9999, inside: false };
    let raf = 0;
    let last = 0;
    let wavePhase = 0;

    const strengthAt = (distance: number) => {
      const t = clamp01(distance / radius);
      if (falloff === 'linear') return 1 - t;
      if (falloff === 'exponential') return (1 - t) ** 2;
      const e = Math.exp(-2 * t * t);
      const edge = Math.exp(-2);
      return (e - edge) / (1 - edge);
    };

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
    };
    const onLeave = () => {
      pointer.inside = false;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      wavePhase += dt;
      const k = 1 - Math.exp(-dt / Math.max(0.02, smoothing * 0.4));

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        let target = 0;
        if (pointer.inside) {
          const rect = node.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          target = strengthAt(Math.hypot(pointer.x - cx, pointer.y - cy));
        } else if (idleWave) {
          /* A travelling swell keeps the headline alive when the pointer is away. */
          const period = 3.2;
          const phase = (i / Math.max(1, nodes.length - 1)) * 2 - wavePhase / period;
          const wave = (1 + Math.cos(phase * Math.PI * 2)) / 2;
          target = 0.7 * wave ** 2.2;
        }
        levels[i] += (target - levels[i]) * k;
        const weight = Math.round(from + (to - from) * levels[i]);
        const liftPx = lift * levels[i];
        node.style.fontVariationSettings = `'wght' ${weight}`;
        node.style.transform = liftPx > 0.001 ? `translateY(${(-liftPx).toFixed(4)}em)` : '';
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [chars.length, radius, from, to, falloff, smoothing, lift, idleWave]);

  return (
    <Tag ref={rootRef as never} className={`variable-proximity ${className}`.trim()} aria-label={label}>
      {chars.map((char, index) => (
        <span key={index} data-vp-char="" className="variable-proximity__char" aria-hidden="true">
          {char === ' ' ? '\u00a0' : char}
        </span>
      ))}
    </Tag>
  );
};

/* ------------------------------------------------------------------ */
/* RotatingText — cycles phrases character by character                */
/* ------------------------------------------------------------------ */

export const RotatingText = ({
  texts,
  interval = 2600,
  effect = 'slide',
  stagger = 26,
  className = ''
}: {
  texts: string[];
  interval?: number;
  effect?: 'slide' | 'flip' | 'blur' | 'scale';
  stagger?: number;
  className?: string;
}) => {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (texts.length < 2) return undefined;
    let timer = 0;
    const run = window.setTimeout(() => {
      setPhase('out');
      timer = window.setTimeout(() => {
        setIndex(value => (value + 1) % texts.length);
        setPhase('in');
      }, 420);
    }, interval);
    return () => {
      window.clearTimeout(run);
      window.clearTimeout(timer);
    };
  }, [index, interval, texts.length]);

  const current = texts[index] ?? '';

  return (
    <span className={`rotating-text rotating-text--${effect} ${className}`.trim()} aria-live="polite">
      <span className="rotating-text__inner" data-phase={phase}>
        {Array.from(current).map((char, charIndex) => (
          <span
            key={`${index}-${charIndex}`}
            className="rotating-text__char"
            style={{ '--i': charIndex, animationDelay: `${charIndex * stagger}ms` } as CSSProperties}
            aria-hidden="true"
          >
            {char === ' ' ? '\u00a0' : char}
          </span>
        ))}
      </span>
      <span className="sr-only">{current}</span>
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Counter — spring-driven odometer with motion blur                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Magnet — spring-pulled toward the cursor                            */
/* ------------------------------------------------------------------ */

export const Magnet = ({
  children,
  className = '',
  padding = 90,
  strength = 2.6,
  tilt = 0,
  scale = 1,
  maxOffset = 26
}: {
  children: ReactNode;
  className?: string;
  padding?: number;
  strength?: number;
  tilt?: number;
  scale?: number;
  maxOffset?: number;
}) => {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReduced()) return undefined;
    if (window.matchMedia?.('(hover: none)').matches) return undefined;

    const body = { x: 0, y: 0 };
    const velocity = { x: 0, y: 0 };
    const pointer = { x: -9999, y: -9999, active: false };
    let raf = 0;
    let last = 0;

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };
    const onLeave = () => {
      pointer.active = false;
    };

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const rect = element.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = pointer.x - cx;
      const dy = pointer.y - cy;
      /* Distance to the box, zero while the pointer is inside it. */
      const outside = Math.hypot(
        Math.max(0, Math.abs(dx) - rect.width / 2),
        Math.max(0, Math.abs(dy) - rect.height / 2)
      );
      let targetX = 0;
      let targetY = 0;
      if (pointer.active && outside < padding) {
        const pull = 1 - clamp01((outside - padding * 0.5) / (padding * 0.5));
        targetX = Math.max(-maxOffset, Math.min(maxOffset, (dx / strength) * pull));
        targetY = Math.max(-maxOffset, Math.min(maxOffset, (dy / strength) * pull));
      }
      velocity.x += (170 * (targetX - body.x) - 16 * velocity.x) * dt;
      velocity.y += (170 * (targetY - body.y) - 16 * velocity.y) * dt;
      body.x += velocity.x * dt;
      body.y += velocity.y * dt;

      const nx = rect.width ? dx / (rect.width * 1.6) : 0;
      const ny = rect.height ? dy / (rect.height * 1.6) : 0;
      const s = 1 + (scale - 1) * clamp01(1 - outside / padding);
      element.style.transform =
        `translate3d(${body.x.toFixed(2)}px, ${body.y.toFixed(2)}px, 0)` +
        (tilt ? ` perspective(800px) rotateX(${(-ny * tilt).toFixed(2)}deg) rotateY(${(nx * tilt).toFixed(2)}deg)` : '') +
        (Math.abs(s - 1) > 0.001 ? ` scale(${s.toFixed(3)})` : '');

      const moving =
        Math.abs(targetX - body.x) > 0.05 ||
        Math.abs(targetY - body.y) > 0.05 ||
        Math.abs(velocity.x) > 0.05 ||
        Math.abs(velocity.y) > 0.05;
      if (moving) raf = requestAnimationFrame(frame);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, [padding, strength, tilt, scale, maxOffset]);

  return (
    <span ref={ref} className={`magnet-wrap ${className}`.trim()}>
      {children}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* StarBorder — a light laps the border                                */
/* ------------------------------------------------------------------ */

interface Segment {
  type: 'line' | 'arc';
  length: number;
}

const buildOutline = (w: number, h: number, r: number): { segments: Segment[]; total: number } => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  const arc = (Math.PI / 2) * radius;
  const segments: Segment[] = [
    { type: 'line', length: w - radius * 2 },
    { type: 'arc', length: arc },
    { type: 'line', length: h - radius * 2 },
    { type: 'arc', length: arc },
    { type: 'line', length: w - radius * 2 },
    { type: 'arc', length: arc },
    { type: 'line', length: h - radius * 2 },
    { type: 'arc', length: arc }
  ];
  return { segments, total: segments.reduce((sum, s) => sum + s.length, 0) };
};

const pointAt = (segments: Segment[], w: number, h: number, r: number, distance: number) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  let d = distance;
  const sx = w - radius;
  const sy = h - radius;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (d > segment.length) {
      d -= segment.length;
      continue;
    }
    const t = segment.length > 0 ? d / segment.length : 0;
    switch (i) {
      case 0:
        return { x: radius + (w - radius * 2) * t, y: 0 };
      case 1: {
        const a = -Math.PI / 2 + (Math.PI / 2) * t;
        return { x: sx + radius * Math.cos(a), y: radius + radius * Math.sin(a) };
      }
      case 2:
        return { x: w, y: radius + (h - radius * 2) * t };
      case 3: {
        const a = (Math.PI / 2) * t;
        return { x: sx + radius * Math.cos(a), y: sy + radius * Math.sin(a) };
      }
      case 4:
        return { x: w - radius - (w - radius * 2) * t, y: h };
      case 5: {
        const a = Math.PI / 2 + (Math.PI / 2) * t;
        return { x: sx + radius * Math.cos(a), y: sy + radius * Math.sin(a) };
      }
      case 6:
        return { x: 0, y: h - radius - (h - radius * 2) * t };
      default: {
        const a = Math.PI + (Math.PI / 2) * t;
        return { x: radius + radius * Math.cos(a), y: sy + radius * Math.sin(a) };
      }
    }
  }
  return { x: radius, y: 0 };
};

export const StarBorder = ({
  children,
  className = '',
  radius = 11,
  color = 'var(--primary)',
  duration = 5,
  thickness = 1.5,
  trailLength = 0.3,
  glow = 0.7,
  stars = 1,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
  color?: string;
  duration?: number;
  thickness?: number;
  trailLength?: number;
  glow?: number;
  stars?: number;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) => {
  const hostRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    if (prefersReduced()) return undefined;

    const BLEED = 34;
    let width = 0;
    let height = 0;
    let outline = buildOutline(1, 1, radius);
    let phase = 0;
    let speed = 1;
    let raf = 0;
    let last = 0;
    let hovering = false;
    let alive = true;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round((width + BLEED * 2) * ratio);
      canvas.height = Math.round((height + BLEED * 2) * ratio);
      canvas.style.width = `${width + BLEED * 2}px`;
      canvas.style.height = `${height + BLEED * 2}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      outline = buildOutline(width, height, radius);
    };

    const draw = () => {
      ctx.clearRect(0, 0, width + BLEED * 2, height + BLEED * 2);
      ctx.save();
      ctx.translate(BLEED, BLEED);
      ctx.globalCompositeOperation = 'lighter';

      for (let s = 0; s < stars; s++) {
        const head = (phase + s / Math.max(1, stars)) % 1;
        const trail = Math.max(6, outline.total * trailLength);
        const steps = 26;
        for (let i = steps; i >= 0; i--) {
          const u = i / steps;
          const d = head * outline.total - u * trail;
          const point = pointAt(outline.segments, width, height, radius, ((d % outline.total) + outline.total) % outline.total);
          const fade = (1 - u) ** 2;
          ctx.beginPath();
          ctx.fillStyle = color;
          ctx.globalAlpha = fade * 0.85;
          ctx.arc(point.x, point.y, thickness * (0.6 + fade * 1.5), 0, Math.PI * 2);
          ctx.fill();
        }
        const headPoint = pointAt(outline.segments, width, height, radius, head * outline.total);
        const bloom = ctx.createRadialGradient(
          headPoint.x,
          headPoint.y,
          0,
          headPoint.x,
          headPoint.y,
          thickness * 12
        );
        bloom.addColorStop(0, color);
        bloom.addColorStop(1, 'transparent');
        ctx.globalAlpha = glow;
        ctx.fillStyle = bloom;
        ctx.beginPath();
        ctx.arc(headPoint.x, headPoint.y, thickness * 12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      const cruise = 1 / duration;
      const target = hovering ? cruise * 2.4 : cruise;
      speed += (target - speed) * (1 - Math.exp(-dt / 0.45));
      phase = (phase + speed * dt) % 1;
      draw();
      raf = requestAnimationFrame(frame);
    };

    const onEnter = () => {
      hovering = true;
    };
    const onLeave = () => {
      hovering = false;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    raf = requestAnimationFrame(frame);
    host.addEventListener('pointerenter', onEnter);
    host.addEventListener('pointerleave', onLeave);

    return () => {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      host.removeEventListener('pointerenter', onEnter);
      host.removeEventListener('pointerleave', onLeave);
    };
  }, [radius, color, duration, thickness, trailLength, glow, stars]);

  return (
    <button ref={hostRef} className={`star-border ${className}`.trim()} style={{ borderRadius: radius }} {...rest}>
      <canvas ref={canvasRef} className="star-border__light" aria-hidden="true" />
      <span className="star-border__inner" style={{ borderRadius: radius }}>
        {children}
      </span>
    </button>
  );
};

/* ------------------------------------------------------------------ */
/* GlareCard — a light band sweeps across on hover                     */
/* ------------------------------------------------------------------ */

/**
 * The glare is a real light band: a gradient whose alpha profile is a smooth
 * bump, rotated to the glare angle and swept across by `transform`. This reads
 * far more like glass than a plain opacity fade.
 */
export const GlareCard = ({
  children,
  className = '',
  angle = -32,
  size = 26,
  opacity = 0.42,
  duration = 780,
  style
}: {
  children: ReactNode;
  className?: string;
  angle?: number;
  size?: number;
  opacity?: number;
  duration?: number;
  style?: CSSProperties;
}) => (
  <div
    className={`glare-card ${className}`.trim()}
    style={
      {
        '--glare-angle': `${angle}deg`,
        '--glare-size': `${size}%`,
        '--glare-opacity': opacity,
        '--glare-duration': `${duration}ms`,
        ...style
      } as CSSProperties
    }
  >
    {children}
    <span className="glare-card__band" aria-hidden="true" />
  </div>
);

/* ------------------------------------------------------------------ */
/* GradualBlur — a progressive blur ramp on one edge                   */
/* ------------------------------------------------------------------ */

/**
 * Stacks N backdrop-filter layers, each masked to a slice of the edge, with
 * exponentially increasing blur radii. Overlapping them approximates a smooth
 * blur ramp rather than a hard band — the trick is that each layer's radius is
 * `sqrt(to² - from²)` so the stack composes to the intended total.
 */
export const GradualBlur = ({
  position = 'bottom',
  height = '5.5rem',
  strength = 2,
  layers = 7,
  className = '',
  tint
}: {
  position?: 'top' | 'bottom' | 'left' | 'right';
  height?: string;
  strength?: number;
  layers?: number;
  className?: string;
  tint?: string;
}) => {
  const maxBlur = strength * 12;
  const horizontal = position === 'left' || position === 'right';
  const direction = position === 'bottom' ? 'to top' : position === 'top' ? 'to bottom' : position === 'right' ? 'to left' : 'to right';

  const stack = useMemo(() => {
    const items: { blur: number; mask: string }[] = [];
    for (let i = 0; i < layers; i++) {
      const from = i / layers;
      const to = (i + 1) / layers;
      /* exponential ramp: the outer layers stay nearly sharp */
      const radiusTo = (maxBlur * (2 ** (4 * to) - 1)) / 15;
      const radiusFrom = (maxBlur * (2 ** (4 * from) - 1)) / 15;
      const blur = Math.max(0.01, Math.sqrt(Math.max(0, radiusTo ** 2 - radiusFrom ** 2)));
      items.push({
        blur,
        mask: `linear-gradient(${direction}, transparent ${(from * 100).toFixed(2)}%, #000 ${(to * 100).toFixed(2)}%)`
      });
    }
    return items;
  }, [layers, maxBlur, direction]);

  return (
    <div
      className={`gradual-blur gradual-blur--${position} ${className}`.trim()}
      style={{
        [horizontal ? 'width' : 'height']: height,
        background: tint
      } as CSSProperties}
      aria-hidden="true"
    >
      {stack.map((layer, index) => (
        <span
          key={index}
          className="gradual-blur__layer"
          style={{
            backdropFilter: `blur(${layer.blur.toFixed(2)}px)`,
            WebkitBackdropFilter: `blur(${layer.blur.toFixed(2)}px)`,
            maskImage: layer.mask,
            WebkitMaskImage: layer.mask
          }}
        />
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* AnimatedList — spring selection indicator + staggered reveal         */
/* ------------------------------------------------------------------ */

export const AnimatedList = <T,>({
  items,
  onSelect,
  renderItem,
  className = '',
  maxHeight = 460,
  fadeSize = 48
}: {
  items: T[];
  onSelect?: (item: T, index: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  maxHeight?: number;
  fadeSize?: number;
}) => {
  const [selected, setSelected] = useState(0);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const spring = useRef({ value: 0, velocity: 0, height: 0, heightVelocity: 0 });
  const raf = useRef(0);
  const last = useRef(0);

  useLayoutEffect(() => {
    const element = itemRefs.current[selected];
    const viewport = viewportRef.current;
    if (!element || !viewport) return;
    /* Centre the selection in the viewport, then let the spring catch up. */
    const target = element.offsetTop - (viewport.clientHeight - element.offsetHeight) / 2;
    viewport.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  }, [selected]);

  useEffect(() => {
    if (prefersReduced()) return undefined;
    let alive = true;
    const tick = (now: number) => {
      if (!alive) return;
      const dt = last.current ? Math.min(0.05, (now - last.current) / 1000) : 0.016;
      last.current = now;
      const element = itemRefs.current[selected];
      if (element && indicatorRef.current) {
        const omega = 30;
        const zeta = 0.78;
        integrate(spring.current, element.offsetTop, omega ** 2, 2 * zeta * omega, dt, 4);
        spring.current.height += (element.offsetHeight - spring.current.height) * (1 - Math.exp(-dt / 0.1));
        indicatorRef.current.style.transform = `translate3d(0, ${spring.current.value.toFixed(2)}px, 0)`;
        indicatorRef.current.style.height = `${spring.current.height.toFixed(2)}px`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [selected, items.length]);

  const onKey = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected(value => Math.min(items.length - 1, value + 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected(value => Math.max(0, value - 1));
      } else if (event.key === 'Enter' && items[selected]) {
        onSelect?.(items[selected], selected);
      }
    },
    [items, onSelect, selected]
  );

  return (
    <div
      className={`animated-list ${className}`.trim()}
      style={{ '--al-max': `${maxHeight}px`, '--al-fade': `${fadeSize}px` } as CSSProperties}
    >
      <span className="animated-list__indicator" ref={indicatorRef} aria-hidden="true" />
      <ul
        className="animated-list__viewport"
        ref={viewportRef as never}
        tabIndex={0}
        role="listbox"
        onKeyDown={onKey}
        aria-activedescendant={`al-item-${selected}`}
      >
        {items.map((item, index) => (
          <li
            key={index}
            id={`al-item-${index}`}
            ref={node => {
              itemRefs.current[index] = node;
            }}
            className="animated-list__item"
            data-selected={index === selected ? 'true' : undefined}
            role="option"
            aria-selected={index === selected}
            onPointerEnter={() => setSelected(index)}
            onClick={() => {
              setSelected(index);
              onSelect?.(item, index);
            }}
            style={{ '--al-index': index } as CSSProperties}
          >
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
    </div>
  );
};
