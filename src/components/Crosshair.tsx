/**
 * Crosshair — drafting-table cursor lines with target lock.
 *
 * Adapted from the react-bits component (MIT + Commons Clause): a full-screen
 * canvas draws two hairlines through the smoothed pointer position, brackets
 * and measures whatever interactive element is under it, and pulses on click.
 * Everything renders on demand — the rAF loop stops once nothing is moving.
 */
import { useEffect, useRef } from 'react';

import './AmbientLayers.css';

const FONT = '500 10px "JetBrains Mono Variable", ui-monospace, monospace';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface Ink {
  r: number;
  g: number;
  b: number;
  a: number;
}

const toRgb = (ctx: CanvasRenderingContext2D, color: string): Ink => {
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const value = String(ctx.fillStyle);
  if (value.startsWith('#')) {
    const hex = parseInt(value.slice(1, 7), 16);
    return { r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255, a: 1 };
  }
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255, 1];
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
};

export interface CrosshairProps {
  color?: string;
  /** contain the crosshair to this element; otherwise it covers the viewport */
  containerRef?: React.RefObject<HTMLElement | null> | null;
  thickness?: number;
  opacity?: number;
  /** space around the pointer where the lines do not cross */
  gap?: number;
  /** 0 = lines stick to the pointer; higher trails behind */
  smoothing?: number;
  showCoordinates?: boolean;
  targetSelector?: string;
  clickPulse?: boolean;
  blendMode?: 'normal' | 'difference';
  className?: string;
}

export const Crosshair = ({
  color,
  containerRef = null,
  thickness = 1,
  opacity = 0.6,
  gap = 10,
  smoothing = 0.4,
  showCoordinates = true,
  /* Global interaction frame: every actionable or selectable surface gets the
     four-corner brackets. Selection surfaces also keep their rounded primary
     ring, so the two frames coexist on the same element. */
  targetSelector = 'a, button, [role="button"], [role="radio"], [role="option"], [role="switch"], [role="checkbox"], [role="slider"], [data-crosshair-target], .mode-card, .book-row, .model-card, .orbit-item, .achievement, .stat-tile, .animated-list__item, .kana-cell:not(.kana-cell--empty), .data-table tbody tr, .book-row .chip[data-selected]',
  clickPulse = true,
  blendMode = 'normal',
  className = ''
}: CrosshairProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return undefined;
    const host = containerRef?.current ?? null;
    const scope = (host ?? window) as HTMLElement;
    const resolvedColor =
      color ?? (getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#7ef0dc');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const state = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      clientX: 0,
      clientY: 0,
      inside: false,
      seen: false,
      presence: 0,
      target: null as Element | null,
      /* keyboard focus gets the same brackets as a pointer target, so the
         four-corner frame is the one language for functional controls */
      focusTarget: null as Element | null,
      lock: { x: 0, y: 0, w: 0, h: 0, alpha: 0 }
    };
    const pulses: { x: number; y: number; age: number }[] = [];
    const size = { w: 0, h: 0, dpr: 1 };
    let ink = toRgb(ctx, resolvedColor);
    let raf = 0;
    let last = 0;
    let alive = true;
    /* Element the lock is currently parked on. A change means a new target,
       not a resize of the same one, so the frame snaps instead of trailing. */
    let lockedEl: Element | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      size.dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.w = rect.width;
      size.h = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * size.dpr));
      canvas.height = Math.max(1, Math.round(rect.height * size.dpr));
      wake();
    };

    const rgba = (alpha: number) => `rgba(${ink.r}, ${ink.g}, ${ink.b}, ${clamp(alpha * ink.a, 0, 1)})`;
    const crisp = (value: number, width: number) => {
      const device = Math.round(width * size.dpr);
      return (Math.round(value * size.dpr) + (device % 2 ? 0.5 : 0)) / size.dpr;
    };

    const tag = (text: string, x: number, y: number, align: 'center' | 'middle') => {
      ctx.font = FONT;
      const width = ctx.measureText(text).width + 10;
      const height = 16;
      const left = clamp(align === 'center' ? x - width / 2 : x, 4, size.w - width - 4);
      const top = clamp(align === 'middle' ? y - height / 2 : y, 4, size.h - height - 4);
      const light = ink.r * 0.2126 + ink.g * 0.7152 + ink.b * 0.0722 > 150;
      ctx.fillStyle = rgba(0.92);
      ctx.beginPath();
      ctx.roundRect(left, top, width, height, 3);
      ctx.fill();
      ctx.fillStyle = light ? '#0a0a0a' : '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(text, left + width / 2, top + height / 2 + 0.5);
    };

    const segment = (x1: number, y1: number, x2: number, y2: number, horizontal: boolean) => {
      const length = horizontal ? x2 - x1 : y2 - y1;
      if (length <= 0) return;
      const gradient = horizontal
        ? ctx.createLinearGradient(0, 0, size.w, 0)
        : ctx.createLinearGradient(0, 0, 0, size.h);
      const at = clamp(horizontal ? state.x / size.w : state.y / size.h, 0.001, 0.999);
      gradient.addColorStop(0, rgba(0.08));
      gradient.addColorStop(at, rgba(1));
      gradient.addColorStop(1, rgba(0.08));
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };

    const brackets = (x: number, y: number, w: number, h: number, alpha: number) => {
      const arm = Math.min(13, w / 3, h / 3);
      ctx.strokeStyle = rgba(alpha);
      ctx.lineWidth = Math.max(1.5, thickness);
      ctx.setLineDash([]);
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(x, y + arm);
      ctx.lineTo(x, y);
      ctx.lineTo(x + arm, y);
      ctx.moveTo(x + w - arm, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + arm);
      ctx.moveTo(x + w, y + h - arm);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x + w - arm, y + h);
      ctx.moveTo(x + arm, y + h);
      ctx.lineTo(x, y + h);
      ctx.lineTo(x, y + h - arm);
      ctx.stroke();
    };

    const draw = () => {
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      if (state.presence > 0.001) {
        ctx.globalAlpha = state.presence * opacity * (1 - 0.6 * state.lock.alpha);
        ctx.lineWidth = thickness;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        const x = crisp(state.x, thickness);
        const y = crisp(state.y, thickness);
        segment(0, y, x - gap, y, true);
        segment(x + gap, y, size.w, y, true);
        segment(x, 0, x, y - gap, false);
        segment(x, y + gap, x, size.h, false);
        if (showCoordinates && state.lock.alpha < 0.999) {
          ctx.globalAlpha = state.presence * opacity * (1 - state.lock.alpha);
          tag(String(Math.round(state.x)), state.x, 10, 'center');
          tag(String(Math.round(state.y)), 10, state.y, 'middle');
        }
      }
      if (state.lock.alpha > 0.001) {
        const { x, y, w, h, alpha } = state.lock;
        ctx.globalAlpha = alpha * opacity;
        brackets(x, y, w, h, 1);
        if (showCoordinates && state.target) {
          const box = state.target.getBoundingClientRect();
          tag(`${Math.round(box.width)} × ${Math.round(box.height)}`, x + w / 2, y + h + 10, 'center');
        }
      }
      pulses.forEach(pulse => {
        const t = pulse.age / 0.55;
        const eased = 1 - (1 - t) ** 3;
        ctx.globalAlpha = (1 - t) ** 2 * opacity;
        ctx.strokeStyle = rgba(1);
        ctx.lineWidth = Math.max(1, thickness);
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(pulse.x, pulse.y, 3 + 30 * eased, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };

    const relative = () => {
      const rect = canvas.getBoundingClientRect();
      state.tx = state.clientX - rect.left;
      state.ty = state.clientY - rect.top;
      return rect;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const rect = relative();
      const follow = reduce || smoothing === 0 ? 1 : 1 - Math.exp(-dt / (0.008 + smoothing * 0.16));
      state.x += (state.tx - state.x) * follow;
      state.y += (state.ty - state.y) * follow;
      const wanted = state.inside ? 1 : 0;
      state.presence += (wanted - state.presence) * (reduce ? 1 : 1 - Math.exp(-dt / (wanted ? 0.12 : 0.25)));
      if (Math.abs(wanted - state.presence) < 0.002) state.presence = wanted;

      if (state.focusTarget && !state.focusTarget.isConnected) state.focusTarget = null;
      const lock = state.lock;
      const locked = state.target ?? state.focusTarget;

      /* Snap on target change: a new row/card must be framed immediately, not
         chased from the previous one. Only the alpha still eases in/out. */
      if (locked !== lockedEl) {
        lockedEl = locked;
        if (locked) {
          const box = locked.getBoundingClientRect();
          lock.x = box.left - rect.left - 6;
          lock.y = box.top - rect.top - 6;
          lock.w = box.width + 12;
          lock.h = box.height + 12;
        }
      }

      let goal: { x: number; y: number; w: number; h: number };
      if (locked) {
        const box = locked.getBoundingClientRect();
        goal = { x: box.left - rect.left - 6, y: box.top - rect.top - 6, w: box.width + 12, h: box.height + 12 };
      } else {
        goal = { x: state.x - 10, y: state.y - 10, w: 20, h: 20 };
      }
      const snap = reduce ? 1 : 1 - Math.exp(-dt / 0.085);
      lock.x += (goal.x - lock.x) * snap;
      lock.y += (goal.y - lock.y) * snap;
      lock.w += (goal.w - lock.w) * snap;
      lock.h += (goal.h - lock.h) * snap;
      const shown = locked ? 1 : 0;
      lock.alpha += (shown - lock.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / (shown ? 0.08 : 0.14)));
      if (Math.abs(shown - lock.alpha) < 0.002) lock.alpha = shown;
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].age += dt;
        if (pulses[i].age >= 0.55) pulses.splice(i, 1);
      }
      draw();

      const settling =
        Math.abs(state.tx - state.x) > 0.05 ||
        Math.abs(state.ty - state.y) > 0.05 ||
        state.presence !== wanted ||
        lock.alpha !== shown ||
        (locked && Math.abs(goal.w - lock.w) + Math.abs(goal.x - lock.x) + Math.abs(goal.y - lock.y) > 0.1) ||
        pulses.length > 0;
      if (settling) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf && alive) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };

    const pick = (element: EventTarget | null): Element | null => {
      if (!(element instanceof Element)) return null;
      let found: Element | null = null;
      try {
        found = element.closest(targetSelector);
      } catch {
        found = null;
      }
      if (found && host && !host.contains(found)) return null;
      return found;
    };

    const enter = () => {
      if (!state.seen) {
        state.seen = true;
        relative();
        state.x = state.tx;
        state.y = state.ty;
        state.lock.x = state.x - 10;
        state.lock.y = state.y - 10;
        state.lock.w = 20;
        state.lock.h = 20;
      }
      state.inside = true;
    };

    const onMove = (event: PointerEvent) => {
      state.clientX = event.clientX;
      state.clientY = event.clientY;
      if (event.pointerType === 'touch' && event.buttons === 0) return;
      enter();
      const next = pick(event.target);
      if (next !== state.target) state.target = next;
      wake();
    };

    const onDown = (event: PointerEvent) => {
      onMove(event);
      if (!clickPulse || reduce) return;
      relative();
      pulses.push({ x: state.tx, y: state.ty, age: 0 });
      wake();
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') state.inside = false;
      wake();
    };

    const onLeave = () => {
      state.inside = false;
      state.target = null;
      wake();
    };

    /* Keyboard focus: only the `:focus-visible` path draws brackets, so a
       mouse click keeps the pointer brackets as the single frame. */
    const onFocusIn = (event: FocusEvent) => {
      const found = pick(event.target);
      if (!found || !found.matches(':focus-visible')) return;
      state.focusTarget = found;
      wake();
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (state.focusTarget && next instanceof Node && state.focusTarget.contains(next)) return;
      state.focusTarget = null;
      wake();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    scope.addEventListener('pointermove', onMove);
    scope.addEventListener('pointerdown', onDown);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    if (host) host.addEventListener('pointerleave', onLeave);
    else document.documentElement.addEventListener('pointerleave', onLeave);
    resize();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      scope.removeEventListener('pointermove', onMove);
      scope.removeEventListener('pointerdown', onDown);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (host) host.removeEventListener('pointerleave', onLeave);
      else document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [color, containerRef, thickness, opacity, gap, smoothing, showCoordinates, targetSelector, clickPulse, blendMode]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`crosshair ${className}`.trim()}
      style={{ mixBlendMode: blendMode }}
    />
  );
};

export default Crosshair;
