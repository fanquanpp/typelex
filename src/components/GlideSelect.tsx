/**
 * GlideSelect — a chip that opens a menu where a pill glides between rows.
 *
 * From react-bits (MIT + Commons Clause), converted from the Tailwind variant to
 * plain CSS on this app's tokens. Behaviour is unchanged: the same gliding
 * highlight, the same pointer scrub (drag through the list and it tracks your
 * finger), the same keyboard model (combobox trigger + listbox, arrow keys,
 * Home/End, type-ahead, Escape), the same viewport flip, and the same pop
 * origin. Two changes: the Hugeicons chevron/tick became inline SVGs — the app
 * ships no icon package — and the colours default to the design tokens instead
 * of a hard-coded zinc palette, so it sits in the app without any props.
 *
 * This is the sanctioned replacement for a native `<select>`: the app bans the
 * browser-drawn dropdown, which ignores the theme.
 */
import React, { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import './GlideSelect.css';

export interface GlideSelectOption {
  value: string;
  label: ReactNode;
  /** muted value shown at the right of the row (counts, units, …) */
  tag?: string;
}

export interface GlideSelectProps {
  options?: (string | GlideSelectOption)[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: GlideSelectOption) => void;
  placeholder?: string;
  showTags?: boolean;
  /** the check on the selected row */
  accentColor?: string;
  /** chip and menu background */
  surfaceColor?: string;
  /** labels; tags and the chevron derive from it */
  textColor?: string;
  size?: 'sm' | 'md' | 'lg';
  radius?: number;
  menuWidth?: number;
  placement?: 'top' | 'bottom';
  align?: 'left' | 'right';
  popDuration?: number;
  glideDuration?: number;
  rememberPosition?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

type Phase = 'closed' | 'open' | 'closing';

const SIZES: Record<string, { chip: number; row: number; font: number }> = {
  sm: { chip: 28, row: 26, font: 12 },
  md: { chip: 32, row: 30, font: 13 },
  lg: { chip: 44, row: 40, font: 14 }
};
const PAD = 4;
const GAP = 1;
const MENU_GAP = 6;
const DEFAULT_OPTIONS: (string | GlideSelectOption)[] = ['One', 'Two', 'Three'];

const norm = (option: string | GlideSelectOption): GlideSelectOption =>
  typeof option === 'string' ? { value: option, label: option } : option;
const textOf = (item: GlideSelectOption) => (typeof item.label === 'string' ? item.label : item.value);
const typeaheadIndex = (items: GlideSelectOption[], from: number, char: string) => {
  const needle = char.toLowerCase();
  const count = items.length;
  for (let step = 1; step <= count; step++) {
    const index = (from + step) % count;
    if (textOf(items[index]).toLowerCase().startsWith(needle)) return index;
  }
  return from;
};

const CaretIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 9.5l6 6 6-6" />
  </svg>
);

const TickIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const GlideSelect: React.FC<GlideSelectProps> = ({
  options = DEFAULT_OPTIONS,
  value,
  defaultValue,
  onChange,
  placeholder = '请选择…',
  showTags = true,
  accentColor = 'var(--primary)',
  surfaceColor = 'var(--surface-solid)',
  textColor = 'var(--ink)',
  size = 'md',
  radius = 10,
  menuWidth = 176,
  placement = 'bottom',
  align = 'left',
  popDuration = 180,
  glideDuration = 220,
  rememberPosition = true,
  disabled = false,
  ariaLabel = '选择',
  className = ''
}) => {
  const items = options.map(norm);
  const [inner, setInner] = useState(defaultValue ?? '');
  const current = value ?? inner;
  const selected = items.findIndex(item => item.value === current);
  const [phase, setPhase] = useState<Phase>('closed');
  const [active, setActive] = useState<number | null>(null);
  const [side, setSide] = useState<'top' | 'bottom'>(placement);
  /* The menu is portalled, so its position is measured, not inherited: an
     `absolute` menu is clipped by the first `overflow: hidden` ancestor (the
     wordbook toolbar has one). */
  const [box, setBox] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const instant = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrub = useRef<{ id: number; top: number } | null>(null);
  const id = useId();
  const S = SIZES[size] ?? SIZES.md;
  const step = S.row + GAP;
  const popOut = Math.round((popDuration * 2) / 3);

  useLayoutEffect(() => {
    if (phase !== 'open') return;
    const el = menuRef.current;
    const root = rootRef.current;
    if (!el || !root) return;
    const rect = root.getBoundingClientRect();
    const width = Math.max(el.offsetWidth, rect.width);
    const height = el.offsetHeight;
    el.style.width = `${width}px`;
    /* Grow on the requested side, but never off the viewport. */
    const fitsBelow = rect.bottom + MENU_GAP + height <= window.innerHeight;
    const fitsAbove = rect.top - MENU_GAP - height >= 0;
    const nextSide =
      placement === 'bottom' ? (fitsBelow || !fitsAbove ? 'bottom' : 'top') : fitsAbove || !fitsBelow ? 'top' : 'bottom';
    const rawX = align === 'left' ? rect.left : rect.right - width;
    const x = Math.min(Math.max(rawX, MENU_GAP), Math.max(MENU_GAP, window.innerWidth - MENU_GAP - width));
    const y = nextSide === 'bottom' ? rect.bottom + MENU_GAP : rect.top - MENU_GAP - height;
    setSide(nextSide);
    setBox({ x, y });
    el.style.transitionDuration = instant.current ? '0ms' : '';
    el.dataset.state = 'closed';
    void el.offsetHeight;
    el.dataset.state = 'open';
    const pill = pillRef.current;
    if (pill) {
      pill.style.transition = 'none';
      pill.style.transform = `translateY(${Math.max(0, selected) * step}px)`;
      pill.style.opacity = '0';
      void pill.offsetHeight;
      pill.style.transition = '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill || phase !== 'open') return;
    if (active === null) {
      pill.style.opacity = '0';
      return;
    }
    const jump = instant.current || pill.style.opacity !== '1';
    pill.style.transitionDuration = jump ? '0ms, 150ms' : '';
    pill.style.transform = `translateY(${active * step}px)`;
    pill.style.opacity = '1';
    instant.current = false;
  }, [active, phase, step]);

  const open = (viaKey: boolean) => {
    if (disabled) return;
    clearTimeout(closeTimer.current);
    instant.current = true;
    setActive(selected >= 0 ? selected : viaKey ? 0 : null);
    setPhase('open');
  };

  const close = (mode: 'instant' | 'pop') => {
    setActive(null);
    clearTimeout(closeTimer.current);
    const el = menuRef.current;
    if (mode === 'instant' || !el) {
      setPhase('closed');
      return;
    }
    el.style.transitionDuration = '';
    el.dataset.state = 'closed';
    setPhase('closing');
    closeTimer.current = setTimeout(() => setPhase('closed'), popOut + 20);
  };

  const pick = (index: number, viaKey: boolean) => {
    const item = items[index];
    if (!item) {
      close('instant');
      return;
    }
    if (item.value !== current) {
      if (value === undefined) setInner(item.value);
      onChange?.(item.value, item);
      if (!viaKey && rootRef.current) rootRef.current.dataset.swap = '';
    }
    close('instant');
    triggerRef.current?.focus({ preventScroll: true });
  };

  const onTriggerKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    const count = items.length;
    const cursor = active ?? Math.max(0, selected);
    if (phase !== 'open') {
      if (key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        open(true);
      }
      return;
    }
    const go = (index: number) => {
      event.preventDefault();
      instant.current = true;
      setActive(Math.min(count - 1, Math.max(0, index)));
    };
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      go(active === null ? cursor : cursor + (key === 'ArrowDown' ? 1 : -1));
    } else if (key === 'Home' || key === 'End') {
      go(key === 'Home' ? 0 : count - 1);
    } else if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      pick(cursor, true);
    } else if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') event.preventDefault();
      close('instant');
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      go(typeaheadIndex(items, cursor, key));
    }
  };

  useEffect(() => {
    if (phase === 'closed') return undefined;
    const onDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) close('pop');
    };
    /* The portalled menu cannot follow the chip, so a scroll that moves the chip
       closes it. Only the chip's own scroll chain counts — an unrelated list
       animating its own scroll (the wordbook's virtual list does) must not. */
    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element) || target.contains(rootRef.current)) close('instant');
    };
    const onResize = () => close('instant');
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (disabled && phase !== 'closed') close('instant');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const rowAt = (y: number) => {
    const box = scrub.current;
    if (!box) return null;
    const index = Math.floor((y - box.top - PAD) / step);
    return index >= 0 && index < items.length ? index : null;
  };

  const onListDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scrub.current) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer capture is a nicety: without it the scrub still tracks */
    }
    scrub.current = { id: event.pointerId, top: event.currentTarget.getBoundingClientRect().top };
    instant.current = true;
    setActive(rowAt(event.clientY));
  };

  const onListMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== event.pointerId) return;
    const index = rowAt(event.clientY);
    if (index !== active) setActive(index);
  };

  const onListUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrub.current || scrub.current.id !== event.pointerId) return;
    const index = event.type === 'pointerup' ? rowAt(event.clientY) : null;
    scrub.current = null;
    if (index !== null) pick(index, false);
    else if (!rememberPosition) setActive(null);
  };

  const onListOver = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' || scrub.current) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-index]');
    if (!row) return;
    const index = Number(row.dataset.index);
    if (index !== active) setActive(index);
  };

  const origin = `${side === 'bottom' ? 'top' : 'bottom'} ${align}`;

  /* The palette + geometry live in custom properties. The menu is portalled to
     <body>, so it does not inherit them from the root: the same object goes on
     both. */
  const skin = {
    '--gs-accent': accentColor,
    '--gs-surface': surfaceColor,
    '--gs-text': textColor,
    '--gs-radius': `${radius}px`,
    '--gs-inner-radius': `${Math.max(3, radius - 4)}px`,
    '--gs-chip': `${S.chip}px`,
    '--gs-row': `${S.row}px`,
    '--gs-font': `${S.font}px`,
    '--gs-menu-w': `${menuWidth}px`,
    '--gs-pop': `${popDuration}ms`,
    '--gs-pop-out': `${popOut}ms`,
    '--gs-glide': `${glideDuration}ms`,
    '--gs-origin': origin
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`gs${className ? ` ${className}` : ''}`}
      data-size={size}
      data-disabled={disabled ? '' : undefined}
      onAnimationEnd={event => {
        if (event.animationName === 'gs-swap' && rootRef.current) delete rootRef.current.dataset.swap;
      }}
      style={skin}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={phase === 'open'}
        aria-controls={`${id}-list`}
        aria-activedescendant={active !== null ? `${id}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className="gs__trigger"
        onPointerDown={event => {
          if (event.button !== 0 || disabled) return;
          event.currentTarget.focus({ preventScroll: true });
          if (phase === 'open') close('pop');
          else open(false);
        }}
        onKeyDown={onTriggerKey}
      >
        <span className="gs__label" key={current} data-empty={selected < 0 ? '' : undefined}>
          {selected >= 0 ? items[selected].label : placeholder}
        </span>
        <span className="gs__caret" aria-hidden="true">
          <CaretIcon />
        </span>
      </button>

      {phase !== 'closed'
        ? createPortal(
            <div
              ref={menuRef}
              className="gs__menu"
              data-state="open"
              data-side={side}
              data-align={align}
              style={{ ...skin, left: box.x, top: box.y }}
            >
              <div
                id={`${id}-list`}
                role="listbox"
                aria-label={ariaLabel}
                className="gs__list"
                data-live={active !== null ? '' : undefined}
                onPointerOver={onListOver}
                onPointerLeave={() => {
                  if (!scrub.current && !rememberPosition) setActive(null);
                }}
                onPointerDown={onListDown}
                onPointerMove={onListMove}
                onPointerUp={onListUp}
                onPointerCancel={onListUp}
                onLostPointerCapture={onListUp}
              >
                <span ref={pillRef} className="gs__pill" aria-hidden="true" />
                {items.map((item, index) => (
                  <div
                    key={item.value}
                    id={`${id}-${index}`}
                    role="option"
                    aria-selected={index === selected}
                    data-index={index}
                    className="gs__row"
                  >
                    <span className="gs__row-label">{item.label}</span>
                    {showTags && item.tag ? <span className="gs__tag">{item.tag}</span> : null}
                    <span className="gs__check" data-on={index === selected ? '' : undefined} aria-hidden="true">
                      <TickIcon />
                    </span>
                  </div>
                ))}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
};

export default GlideSelect;
