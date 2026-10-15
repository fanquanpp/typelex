/**
 * OrbitCards — cards that orbit along an SVG path.
 *
 * Adapted from the react-bits `OrbitImages` component by Dominik Koch
 * (MIT + Commons Clause). Re-implemented in TypeScript and extended: instead of
 * only `<img>` items it renders arbitrary card content, which is what lets the
 * practice hub orbit word-list cards (高中 / 四级 / 六级 / N1…) rather than photos.
 *
 * The layout engine is unchanged in spirit: the path is sampled into a lookup
 * table, items are placed by arc parameter with a depth-based scale/opacity
 * curve, and pointer drag feeds an inertial glide.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react';

import './OrbitCards.css';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const SAMPLES = 720;
const FRONT_GROW = 0.3;
const BACK_SHRINK = 0.45;
const BACK_DIM = 0.55;
const INTRO_SPREAD = 1.3;
const INTRO_FADE = 0.45;
const DRAG_THRESHOLD = 5;

export interface OrbitItem {
  id: string;
  content: ReactNode;
  label: string;
  accent?: string;
}

interface Props {
  items: OrbitItem[];
  shape?: 'ellipse' | 'circle' | 'infinity' | 'wave' | 'rectangle';
  baseWidth?: number;
  radiusX?: number;
  radiusY?: number;
  rotation?: number;
  duration?: number;
  itemWidth?: number;
  itemHeight?: number;
  direction?: 'normal' | 'reverse';
  width?: string | number;
  height?: string | number;
  className?: string;
  showPath?: boolean;
  pathColor?: string;
  pathDash?: number;
  paused?: boolean;
  depth?: number;
  itemRadius?: number;
  shadow?: number;
  hoverScale?: number;
  hoverSpeed?: number;
  draggable?: boolean;
  clickToFront?: boolean;
  onItemClick?: (index: number, item: OrbitItem) => void;
  intro?: boolean;
  centerContent?: ReactNode;
  activeId?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toCssLength = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

const wrapSigned = (value: number) => value - Math.round(value);

const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const sample = (a1: number, a2: number, t: number) => ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t;
  const slope = (a1: number, a2: number, t: number) => 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
  return (x: number) => {
    if (x <= 0 || x >= 1) return x;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(x1, x2, t);
      if (Math.abs(s) < 1e-6) break;
      t = clamp(t - (sample(x1, x2, t) - x) / s, 0, 1);
    }
    return sample(y1, y2, t);
  };
};

const EASINGS = {
  linear: (t: number) => t,
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1)
};

const easeOutQuint = (t: number) => 1 - (1 - t) ** 5;

const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy}`;

const rectanglePath = (cx: number, cy: number, w: number, h: number) => {
  const hw = w / 2;
  const hh = h / 2;
  return `M ${cx - hw} ${cy - hh} L ${cx + hw} ${cy - hh} L ${cx + hw} ${cy + hh} L ${cx - hw} ${cy + hh} Z`;
};

const infinityPath = (cx: number, cy: number, w: number, h: number) => {
  const hw = w / 2;
  const hh = h / 2;
  return `M ${cx} ${cy} C ${cx + hw * 0.5} ${cy - hh}, ${cx + hw} ${cy - hh}, ${cx + hw} ${cy} C ${cx + hw} ${cy + hh}, ${cx + hw * 0.5} ${cy + hh}, ${cx} ${cy} C ${cx - hw * 0.5} ${cy + hh}, ${cx - hw} ${cy + hh}, ${cx - hw} ${cy} C ${cx - hw} ${cy - hh}, ${cx - hw * 0.5} ${cy - hh}, ${cx} ${cy}`;
};

const wavePath = (cx: number, cy: number, w: number, amplitude: number, waves: number) => {
  const points: string[] = [];
  const segments = waves * 20;
  const hw = w / 2;
  for (let i = 0; i <= segments; i++) {
    const x = cx - hw + (w * i) / segments;
    const y = cy + Math.sin((i / segments) * waves * 2 * Math.PI) * amplitude;
    points.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  for (let i = segments; i >= 0; i--) {
    const x = cx - hw + (w * i) / segments;
    const y = cy - Math.sin((i / segments) * waves * 2 * Math.PI) * amplitude;
    points.push(`L ${x} ${y}`);
  }
  return `${points.join(' ')} Z`;
};

interface EngineState {
  lut: Float32Array | null;
  length: number;
  front: number;
  yMid: number;
  yHalf: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
  scale: number;
  size: number;
  items: { el: HTMLElement; t: string; o: string; z: string }[];
  strokes: SVGPathElement[];
  lap: number;
  manual: number;
  glide: number;
  speed: number;
  drag: { id: number; x: number; y: number; active: boolean; samples: [number, number][]; rate: number; anchor: number; manual: number } | null;
  seek: { from: number; t: number; delta: number; dur: number } | null;
  hovered: boolean;
  hoverIndex: number;
  suppressUntil: number;
  introStart: number;
  introDone: boolean;
  visible: boolean;
  reduced: boolean;
  raf: number;
  last: number;
  destroyed: boolean;
}

interface EngineConfig {
  baseWidth: number;
  rotation: number;
  duration: number;
  itemWidth: number;
  itemHeight: number;
  direction: 'normal' | 'reverse';
  pathWidth: number;
  pathDash: number;
  easing: keyof typeof EASINGS;
  paused: boolean;
  depth: number;
  hoverScale: number;
  hoverSpeed: number;
  draggable: boolean;
  clickToFront: boolean;
  onItemClick?: (index: number, item: OrbitItem) => void;
  intro: boolean;
  items: OrbitItem[];
}

const createEngine = (
  root: HTMLElement,
  config: { current: EngineConfig },
  setAspect: (value: number) => void
) => {
  const query = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const st: EngineState = {
    lut: null,
    length: 0,
    front: 0,
    yMid: 0,
    yHalf: 1,
    bbox: [0, 0, 1, 1],
    width: 0,
    height: 0,
    scale: 0,
    size: 0,
    items: [],
    strokes: [],
    lap: 0,
    manual: 0,
    glide: 0,
    speed: 1,
    drag: null,
    seek: null,
    hovered: false,
    hoverIndex: -1,
    suppressUntil: 0,
    introStart: -1,
    introDone: !config.current.intro,
    visible: typeof IntersectionObserver === 'undefined',
    reduced: !!query?.matches,
    raf: 0,
    last: 0,
    destroyed: false
  };
  st.speed = st.reduced || config.current.paused ? 0 : 1;

  const collect = () => {
    st.items = Array.from(root.querySelectorAll<HTMLElement>('[data-orbit-item]')).map(el => ({
      el,
      t: '',
      o: '',
      z: ''
    }));
    st.strokes = Array.from(root.querySelectorAll<SVGPathElement>('[data-orbit-stroke]'));
  };

  const build = () => {
    const cfg = config.current;
    const path = root.querySelector<SVGPathElement>('[data-orbit-path]');
    let length = 0;
    try {
      length = path ? path.getTotalLength() : 0;
    } catch {
      length = 0;
    }
    if (!path || !length || !Number.isFinite(length)) {
      st.lut = null;
      return;
    }
    const lut = new Float32Array(SAMPLES * 2);
    const angle = (cfg.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const origin = cfg.baseWidth / 2;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let front = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const point = path.getPointAtLength((i / SAMPLES) * length);
      const dx = point.x - origin;
      const dy = point.y - origin;
      const x = origin + dx * cos - dy * sin;
      const y = origin + dx * sin + dy * cos;
      lut[i * 2] = x;
      lut[i * 2 + 1] = y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      if (y > lut[front * 2 + 1] + 1e-6) front = i;
    }
    st.lut = lut;
    st.length = length;
    st.front = front / SAMPLES;
    st.yMid = (y0 + y1) / 2;
    st.yHalf = Math.max(1e-3, (y1 - y0) / 2);
    const depth = clamp(cfg.depth, 0, 1);
    const margin = Math.max(cfg.itemWidth, cfg.itemHeight) * 0.5 * (1 + depth * FRONT_GROW) * Math.max(1, cfg.hoverScale) + 2;
    st.bbox = [x0 - margin, y0 - margin, x1 + margin, y1 + margin];
    setAspect((x1 - x0 + margin * 2) / (y1 - y0 + margin * 2));
  };

  const applyDash = (reveal: number) => {
    const cfg = config.current;
    const dash = cfg.pathDash > 0 && st.scale ? cfg.pathDash / st.scale : 0;
    for (const stroke of st.strokes) {
      if (reveal < 1 && !dash) {
        stroke.style.strokeDasharray = `${st.length} ${st.length}`;
        stroke.style.strokeDashoffset = String(st.length * (1 - reveal));
        stroke.style.opacity = '';
      } else {
        stroke.style.strokeDasharray = dash ? `${dash} ${dash * 1.6}` : '';
        stroke.style.strokeDashoffset = '';
        stroke.style.opacity = reveal < 1 ? String(reveal) : '';
      }
    }
  };

  const layout = () => {
    st.width = root.clientWidth;
    st.height = root.clientHeight;
    if (!st.lut) return;
    const [bx0, by0, bx1, by1] = st.bbox;
    const scale = Math.min(st.width / (bx1 - bx0), st.height / (by1 - by0));
    st.scale = scale > 0 && Number.isFinite(scale) ? scale : 0;
    st.size = config.current.itemWidth * st.scale;
    for (const item of st.items) {
      item.el.style.width = `${st.size}px`;
      item.el.style.height = `${config.current.itemHeight * st.scale}px`;
    }
    if (!st.scale) return;
    const vw = st.width / st.scale;
    const vh = st.height / st.scale;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    root.querySelectorAll<SVGSVGElement>('[data-orbit-svg]').forEach(svg => {
      svg.setAttribute('viewBox', `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`);
    });
    const clip = root.querySelector<SVGRectElement>('[data-orbit-clip]');
    if (clip) {
      clip.setAttribute('x', String(cx - vw));
      clip.setAttribute('y', String(st.yMid));
      clip.setAttribute('width', String(vw * 2));
      clip.setAttribute('height', String(vh * 2));
    }
    for (const stroke of st.strokes) {
      stroke.style.strokeWidth = String(config.current.pathWidth / st.scale);
    }
    applyDash(1);
  };

  const sample = (u: number): [number, number] => {
    const f = (((u % 1) + 1) % 1) * SAMPLES;
    const i0 = Math.floor(f) % SAMPLES;
    const i1 = (i0 + 1) % SAMPLES;
    const t = f - Math.floor(f);
    const lut = st.lut!;
    return [
      lut[i0 * 2] + (lut[i1 * 2] - lut[i0 * 2]) * t,
      lut[i0 * 2 + 1] + (lut[i1 * 2 + 1] - lut[i0 * 2 + 1]) * t
    ];
  };

  const progress = () => {
    const cfg = config.current;
    const ease = EASINGS[cfg.easing] ?? EASINGS.linear;
    const whole = Math.floor(st.lap);
    return (whole + ease(st.lap - whole)) * (cfg.direction === 'reverse' ? -1 : 1) + st.manual;
  };

  /* Cards are spread evenly around the path; the original component's `fill`
     option is always on here, so the offset is simply index / count. */
  const offsetOf = (index: number, count: number) => index / Math.max(1, count);

  const write = (item: EngineState['items'][number], key: 't' | 'o' | 'z', prop: string, value: string) => {
    if (item[key] !== value) {
      item[key] = value;
      item.el.style.setProperty(prop, value);
    }
  };

  const render = (now: number) => {
    const cfg = config.current;
    if (!st.lut || !st.scale) return;
    const p = progress();
    const count = st.items.length;
    const depth = clamp(cfg.depth, 0, 1);
    const [bx0, by0, bx1, by1] = st.bbox;
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    const halfW = (cfg.itemWidth * st.scale) / 2;
    const halfH = (cfg.itemHeight * st.scale) / 2;
    const introRunning = st.introStart >= 0;
    const elapsed = introRunning ? (now - st.introStart) / 1000 : 0;
    const spread = introRunning ? easeOutQuint(clamp(elapsed / INTRO_SPREAD, 0, 1)) : 1;
    const appear = introRunning ? clamp(elapsed / INTRO_FADE, 0, 1) : 1;

    for (let i = 0; i < count; i++) {
      const item = st.items[i];
      let u = p + offsetOf(i, count);
      if (introRunning) u = st.front + wrapSigned(u - st.front) * spread;
      const [x, y] = sample(u);
      const d = clamp((y - st.yMid) / st.yHalf, -1, 1);
      const w = (d + 1) / 2;
      let scale = 1 + depth * (FRONT_GROW * w - BACK_SHRINK * (1 - w));
      let opacity = 1 - depth * BACK_DIM * (1 - w);
      if (introRunning) {
        scale *= 0.7 + 0.3 * appear;
        opacity *= appear * appear * (3 - 2 * appear);
      }
      const sx = (x - cx) * st.scale + st.width / 2 - halfW;
      const sy = (y - cy) * st.scale + st.height / 2 - halfH;
      let z = depth > 0 ? (d <= 0 ? 10 + Math.round((d + 1) * 80) : 110 + Math.round(d * 80)) : 1;
      if (i === st.hoverIndex) z += 200;
      write(
        item,
        't',
        'transform',
        `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0px) scale(${scale.toFixed(4)})`
      );
      write(item, 'o', 'opacity', opacity > 0.999 ? '' : opacity.toFixed(3));
      write(item, 'z', 'zIndex', String(z));
    }
    if (introRunning) applyDash(easeOutQuint(clamp(elapsed / INTRO_SPREAD, 0, 1)));
  };

  const frame = (now: number) => {
    st.raf = 0;
    if (st.destroyed) return;
    const cfg = config.current;
    const dt = st.last ? clamp((now - st.last) / 1000, 0, 0.1) : 0;
    st.last = now;
    let busy = false;

    if (st.lut && st.scale && st.introStart === -1 && !st.introDone && st.visible) {
      if (cfg.intro && !st.reduced) st.introStart = now;
      else st.introDone = true;
      root.removeAttribute('data-intro');
    }
    if (st.introStart >= 0) {
      if ((now - st.introStart) / 1000 >= INTRO_SPREAD) {
        st.introStart = -2;
        st.introDone = true;
        applyDash(1);
      } else {
        busy = true;
      }
    }

    const want = cfg.paused || st.reduced ? 0 : st.hovered ? clamp(cfg.hoverSpeed, 0, 1) : 1;
    if (st.speed !== want) {
      st.speed += (want - st.speed) * (1 - Math.exp(-dt / 0.35));
      if (Math.abs(st.speed - want) < 0.002) st.speed = want;
      busy = true;
    }
    if (st.speed > 0 && cfg.duration > 0) {
      st.lap += (dt * st.speed) / cfg.duration;
      busy = true;
    }
    if (st.drag?.active) {
      busy = true;
    } else if (st.seek) {
      st.seek.t = Math.min(1, st.seek.t + dt / st.seek.dur);
      const e = st.seek.t < 0.5 ? 4 * st.seek.t ** 3 : 1 - (-2 * st.seek.t + 2) ** 3 / 2;
      st.manual = st.seek.from + st.seek.delta * e;
      if (st.seek.t >= 1) st.seek = null;
      busy = true;
    } else if (st.glide) {
      st.manual += st.glide * dt;
      st.glide *= Math.exp(-dt / 0.7);
      if (Math.abs(st.glide) < 0.0004) st.glide = 0;
      busy = true;
    }

    render(now);

    const whole = Math.floor(st.lap);
    if (whole) st.lap -= whole;
    if (!st.drag && !st.seek) st.manual -= Math.floor(st.manual);
    if (busy && st.visible && !st.destroyed) st.raf = requestAnimationFrame(frame);
  };

  const wake = () => {
    if (st.raf || st.destroyed || !st.visible) return;
    st.last = 0;
    st.raf = requestAnimationFrame(frame);
  };

  const local = (event: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    const k = root.offsetWidth ? rect.width / root.offsetWidth || 1 : 1;
    return [(event.clientX - rect.left) / k, (event.clientY - rect.top) / k] as [number, number];
  };

  const dragRate = () => {
    if (!st.lut || !st.scale) return 0;
    const a = sample(st.front - 3 / SAMPLES);
    const b = sample(st.front + 3 / SAMPLES);
    const along = ((b[0] - a[0]) / (6 / SAMPLES)) * st.scale;
    const floor = st.length * st.scale * 0.35;
    return Math.abs(along) < floor ? Math.sign(along || 1) * floor : along;
  };

  const itemIndex = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest('[data-orbit-item]') : null;
    return el && root.contains(el) ? Number(el.getAttribute('data-orbit-item')) : -1;
  };

  const bringToFront = (index: number) => {
    if (!st.lut || index < 0) return;
    const u = progress() + offsetOf(index, st.items.length);
    const delta = wrapSigned(st.front - u);
    st.glide = 0;
    st.seek = { from: st.manual, delta, t: 0, dur: 0.45 + Math.abs(delta) * 1.4 };
    wake();
  };

  const onEnter = () => {
    st.hovered = true;
    wake();
  };
  const onLeave = () => {
    st.hovered = false;
    st.hoverIndex = -1;
    wake();
  };
  const onOver = (event: PointerEvent) => {
    const index = itemIndex(event.target);
    if (index !== st.hoverIndex) {
      st.hoverIndex = index;
      if (st.lut) render(performance.now());
    }
  };

  const onDown = (event: PointerEvent) => {
    const cfg = config.current;
    if (!cfg.draggable || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if (event.target instanceof Element && event.target.closest('[data-orbit-center]')) return;
    const [x, y] = local(event);
    st.drag = { id: event.pointerId, x, y, active: false, samples: [], rate: dragRate(), anchor: 0, manual: 0 };
  };

  const onMove = (event: PointerEvent) => {
    const drag = st.drag;
    if (!drag || event.pointerId !== drag.id) return;
    const [x, y] = local(event);
    const along = x - drag.x;
    if (!drag.active) {
      if (Math.abs(along) < DRAG_THRESHOLD) return;
      if (Math.abs(y - drag.y) > Math.abs(along)) {
        st.drag = null;
        return;
      }
      drag.active = true;
      drag.anchor = along;
      drag.manual = st.manual;
      st.seek = null;
      st.glide = 0;
      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        /* capture is best-effort */
      }
      root.setAttribute('data-dragging', '');
    }
    if (drag.rate) st.manual = drag.manual + (along - drag.anchor) / drag.rate;
    const now = performance.now();
    drag.samples.push([now, along]);
    while (drag.samples.length > 2 && now - drag.samples[0][0] > 100) drag.samples.shift();
    wake();
  };

  const endDrag = (event: PointerEvent, cancelled: boolean) => {
    const drag = st.drag;
    if (!drag || event.pointerId !== drag.id) return;
    st.drag = null;
    if (!drag.active) return;
    root.removeAttribute('data-dragging');
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    const now = performance.now();
    st.suppressUntil = now + 400;
    const samples = drag.samples;
    if (!cancelled && samples.length > 1 && drag.rate) {
      const [t0, a0] = samples[0];
      const [t1, a1] = samples[samples.length - 1];
      if (t1 > t0 && now - t1 < 80) st.glide = clamp((((a1 - a0) / (t1 - t0)) * 1000) / drag.rate, -3, 3);
    }
    wake();
  };

  const activate = (index: number) => {
    const cfg = config.current;
    if (index < 0) return;
    if (cfg.clickToFront) bringToFront(index);
    cfg.onItemClick?.(index, cfg.items[index]);
  };

  const onClick = (event: MouseEvent) => {
    if (performance.now() < st.suppressUntil) {
      event.preventDefault();
      event.stopPropagation();
      st.suppressUntil = 0;
      return;
    }
    activate(itemIndex(event.target));
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const index = itemIndex(event.target);
    if (index < 0) return;
    event.preventDefault();
    activate(index);
  };

  const onFocus = (event: FocusEvent) => {
    const index = itemIndex(event.target);
    if (index >= 0 && config.current.clickToFront && event.target instanceof Element && event.target.matches(':focus-visible')) {
      bringToFront(index);
    }
  };

  const onMotion = () => {
    st.reduced = !!query?.matches;
    wake();
  };

  root.addEventListener('pointerenter', onEnter);
  root.addEventListener('pointerleave', onLeave);
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointerdown', onDown);
  root.addEventListener('pointermove', onMove);
  root.addEventListener('pointerup', event => endDrag(event, false));
  root.addEventListener('pointercancel', event => endDrag(event, true));
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('focusin', onFocus);
  query?.addEventListener?.('change', onMotion);

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          layout();
          render(performance.now());
          wake();
        })
      : null;
  resizeObserver?.observe(root);

  const intersection =
    typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          entries => {
            st.visible = entries[entries.length - 1].isIntersecting;
            if (st.visible) wake();
          },
          { threshold: 0.05 }
        )
      : null;
  intersection?.observe(root);

  const onVisibility = () => {
    if (!document.hidden) wake();
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', wake);

  const refresh = () => {
    collect();
    build();
    layout();
    render(performance.now());
    wake();
  };

  const destroy = () => {
    st.destroyed = true;
    if (st.raf) cancelAnimationFrame(st.raf);
    root.removeEventListener('pointerenter', onEnter);
    root.removeEventListener('pointerleave', onLeave);
    root.removeEventListener('pointerover', onOver);
    root.removeEventListener('pointerdown', onDown);
    root.removeEventListener('pointermove', onMove);
    query?.removeEventListener?.('change', onMotion);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', wake);
    resizeObserver?.disconnect();
    intersection?.disconnect();
  };

  return { refresh, wake, destroy };
};

export const OrbitCards = ({
  items,
  shape = 'ellipse',
  baseWidth = 1400,
  radiusX = 620,
  radiusY = 130,
  rotation = -7,
  duration = 46,
  itemWidth = 150,
  itemHeight = 96,
  direction = 'normal',
  width = '100%',
  height = 'auto',
  className = '',
  showPath = false,
  pathColor = 'var(--border)',
  pathDash = 0,
  paused = false,
  depth = 0.55,
  itemRadius = 16,
  shadow = 0.3,
  hoverScale = 1.1,
  hoverSpeed = 0.25,
  draggable = true,
  clickToFront = true,
  onItemClick,
  intro = true,
  centerContent,
  activeId
}: Props) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null);
  const clipId = useId().replace(/:/g, '');
  const [introPending] = useState(intro);
  const [measuredAspect, setAspect] = useState<number | null>(null);

  const center = baseWidth / 2;

  const path = useMemo(() => {
    switch (shape) {
      case 'circle':
        return ellipsePath(center, center, radiusX, radiusX);
      case 'rectangle':
        return rectanglePath(center, center, radiusX * 2, radiusY * 2);
      case 'infinity':
        return infinityPath(center, center, radiusX * 2, radiusY * 2);
      case 'wave':
        return wavePath(center, center, radiusX * 2, radiusY, 3);
      case 'ellipse':
      default:
        return ellipsePath(center, center, radiusX, radiusY);
    }
  }, [shape, center, radiusX, radiusY]);

  const config = useRef<EngineConfig>({
    baseWidth,
    rotation,
    duration,
    itemWidth,
    itemHeight,
    direction,
    pathWidth: 2,
    pathDash,
    easing: 'linear',
    paused,
    depth,
    hoverScale,
    hoverSpeed,
    draggable,
    clickToFront,
    onItemClick,
    intro,
    items
  });
  config.current = {
    baseWidth,
    rotation,
    duration,
    itemWidth,
    itemHeight,
    direction,
    pathWidth: 2,
    pathDash,
    easing: 'linear',
    paused,
    depth,
    hoverScale,
    hoverSpeed,
    draggable,
    clickToFront,
    onItemClick,
    intro,
    items
  };

  useIsomorphicLayoutEffect(() => {
    if (!rootRef.current) return undefined;
    const engine = createEngine(rootRef.current, config, setAspect);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useIsomorphicLayoutEffect(() => {
    engineRef.current?.refresh();
  }, [path, rotation, baseWidth, itemWidth, itemHeight, depth, hoverScale, items.length, showPath, pathDash, measuredAspect, height]);

  useEffect(() => {
    engineRef.current?.wake();
  });

  const aspect = measuredAspect ?? (radiusX * 2 + itemWidth * 1.6) / (radiusY * 2 + itemHeight * 1.6);
  const autoHeight = height === 'auto' || height === undefined;
  const layered = depth > 0 && !!centerContent;

  return (
    <div
      ref={rootRef}
      className={`orbit-container ${className}`.trim()}
      style={{
        width: toCssLength(width),
        height: autoHeight ? undefined : toCssLength(height),
        aspectRatio: autoHeight ? String(aspect) : undefined,
        '--orbit-radius': `${(itemRadius / Math.max(1, itemWidth)) * 100}%`,
        '--orbit-shadow': String(clamp(shadow, 0, 1)),
        '--orbit-hover-scale': String(hoverScale)
      } as CSSProperties}
      data-intro={introPending ? '' : undefined}
      data-draggable={draggable ? '' : undefined}
    >
      <svg
        className="orbit-path-svg"
        data-orbit-svg=""
        preserveAspectRatio="none"
        style={{ zIndex: 0, visibility: showPath ? undefined : 'hidden' }}
        aria-hidden="true"
      >
        <path
          data-orbit-path=""
          data-orbit-stroke=""
          d={path}
          fill="none"
          stroke={pathColor}
          strokeLinecap="round"
          transform={`rotate(${rotation} ${center} ${center})`}
        />
      </svg>
      {showPath && layered && (
        <svg className="orbit-path-svg" data-orbit-svg="" preserveAspectRatio="none" style={{ zIndex: 105 }} aria-hidden="true">
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <rect data-orbit-clip="" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            <path
              data-orbit-stroke=""
              d={path}
              fill="none"
              stroke={pathColor}
              strokeLinecap="round"
              transform={`rotate(${rotation} ${center} ${center})`}
            />
          </g>
        </svg>
      )}
      {items.map((item, index) => (
        <div
          key={item.id}
          className="orbit-item"
          data-orbit-item={index}
          data-active={activeId === item.id ? '' : undefined}
          data-clickable={clickToFront || onItemClick ? '' : undefined}
          role={onItemClick ? 'button' : undefined}
          tabIndex={onItemClick ? 0 : undefined}
          aria-label={item.label}
        >
          <div className="orbit-item-inner" style={{ '--orbit-accent': item.accent ?? 'var(--primary)' } as CSSProperties}>
            {item.content}
          </div>
        </div>
      ))}
      {centerContent && (
        <div className="orbit-center-content" data-orbit-center="">
          {centerContent}
        </div>
      )}
    </div>
  );
};

export default OrbitCards;
