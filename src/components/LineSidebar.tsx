/**
 * LineSidebar — a proximity-reactive vertical nav.
 *
 * Ported from the react-bits component (MIT + Commons Clause): each item eases
 * a single `--effect` value (0..1) toward a cursor-proximity target inside one
 * shared rAF loop, and every derived property (colour, shift, marker scale)
 * reads that same value, so nothing can fall out of step.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

import './LineSidebar.css';

type Falloff = 'linear' | 'smooth' | 'sharp';

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  sharp: p => p * p * p
};

export interface LineSidebarProps {
  items: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  /** index of the item selected on mount */
  defaultActive?: number | null;
  /** controlled active index — wins over internal state when provided */
  activeIndex?: number | null;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
}

export const LineSidebar = ({
  items,
  accentColor = 'var(--primary)',
  textColor = 'var(--ink-muted)',
  markerColor = 'var(--ink-ghost)',
  showIndex = true,
  showMarker = true,
  proximityRadius = 110,
  maxShift = 22,
  falloff = 'smooth',
  markerLength = 46,
  markerGap = 2,
  tickScale = 0.45,
  scaleTick = true,
  itemGap = 18,
  fontSize = 0.92,
  smoothing = 110,
  defaultActive = null,
  activeIndex: controlledActive,
  onItemClick,
  className = ''
}: LineSidebarProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const internalActive = useRef<number | null>(defaultActive);
  const [innerActive, setInnerActive] = useState<number | null>(defaultActive);
  const active = controlledActive !== undefined ? controlledActive : innerActive;
  internalActive.current = active;

  const runFrame = useCallback((now: number) => {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothing, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    let moving = false;
    for (let i = 0; i < itemRefs.current.length; i++) {
      const el = itemRefs.current[i];
      if (!el) continue;
      const target = Math.max(targetsRef.current[i] || 0, internalActive.current === i ? 1 : 0);
      const current = currentRef.current[i] || 0;
      const next = current + (target - current) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }
    rafRef.current = moving ? requestAnimationFrame(runFrame) : null;
  }, [smoothing]);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLUListElement>) => {
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = event.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      for (let i = 0; i < itemRefs.current.length; i++) {
        const el = itemRefs.current[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    },
    [falloff, proximityRadius, startLoop]
  );

  const onPointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoop();
  }, [startLoop]);

  const onClick = useCallback(
    (index: number, label: string) => {
      setInnerActive(index);
      onItemClick?.(index, label);
    },
    [onItemClick]
  );

  useEffect(() => {
    startLoop();
  }, [active, startLoop]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    []
  );

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''} ${className}`.trim()}
      style={
        {
          '--ls-accent': accentColor,
          '--ls-text': textColor,
          '--ls-marker': markerColor,
          '--ls-marker-length': `${markerLength}px`,
          '--ls-marker-gap': `${markerGap}px`,
          '--ls-tick-scale': tickScale,
          '--ls-max-shift': `${maxShift}px`,
          '--ls-item-gap': `${itemGap}px`,
          '--ls-font-size': `${fontSize}rem`
        } as CSSProperties
      }
      aria-label="主导航"
    >
      <ul ref={listRef} className="line-sidebar__list" onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
        {items.map((label, index) => (
          <li
            key={`${label}-${index}`}
            ref={el => {
              itemRefs.current[index] = el;
            }}
            className="line-sidebar__item"
            aria-current={active === index ? 'true' : undefined}
            onClick={() => onClick(index, label)}
          >
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            <span className="line-sidebar__label">
              {showIndex && <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>}
              <span className="line-sidebar__text">{label}</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default LineSidebar;
