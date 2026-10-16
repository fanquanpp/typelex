/**
 * WarmTooltip — a tooltip that stays warm.
 *
 * From react-bits (MIT + Commons Clause), converted from the Tailwind variant to
 * plain CSS on this app's tokens; the behaviour is the original's: a group keeps
 * one label alive after the first open, so a row of icon buttons swaps a single
 * label that glides between triggers instead of re-opening cold every time.
 * Cold open waits out `delay`, an open label closes after an 80ms grace, the
 * label pops through a small blur and swaps content along the travel direction.
 * Touch opens it on a long press and swallows the click that follows.
 *
 * Changes for this app: Tailwind utilities became `.wt*` CSS on the design
 * tokens (the label is a solid surface, not a hard-coded #f5f5f5), the sizes
 * start at 12px to respect the site's type floor, and the group's `lean` (a
 * velocity-driven tilt) is not ported — this app's chrome is calm by policy.
 */
import React, {
  cloneElement,
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type Variants
} from 'motion/react';

import './WarmTooltip.css';

export type WarmTooltipSide = 'top' | 'bottom' | 'left' | 'right';
export type WarmTooltipSize = 'sm' | 'md' | 'lg';

export interface WarmTooltipGroupProps {
  delay?: number;
  warmWindow?: number;
  travel?: number;
  onWarmChange?: (warm: boolean) => void;
  children?: ReactNode;
}

export interface WarmTooltipGroupHandle {
  reset: () => void;
}

export interface WarmTooltipProps {
  content: ReactNode;
  shortcut?: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: WarmTooltipSide;
  delay?: number;
  warmWindow?: number;
  surfaceColor?: string;
  inkColor?: string;
  size?: WarmTooltipSize;
  radius?: number;
  gap?: number;
  arrow?: boolean;
  popDuration?: number;
  popScale?: number;
  popBlur?: number;
  showFuse?: boolean;
  longPress?: number;
  disabled?: boolean;
  className?: string;
}

type Phase = 'closed' | 'open' | 'closing';
type Mode = 'cold' | 'warm' | 'instant';
type Timer = ReturnType<typeof setTimeout> | undefined;
type Swap = { dir: number; across: boolean };

interface Payload {
  id: string;
  trigger: HTMLElement;
  content: ReactNode;
  shortcut?: ReactNode;
  side: WarmTooltipSide;
  gap: number;
  arrow: boolean;
  surfaceColor: string;
  inkColor: string;
  radius: number;
  font: number;
  px: number;
  py: number;
  popDuration: number;
  popScale: number;
  popBlur: number;
  warmWindow: number;
}

interface GroupState {
  state: Phase;
  current: Payload | null;
  mode: Mode | 'move';
  instant: boolean;
  warmUntil: number;
  warm: boolean;
  swap: Swap;
  closeTimer: Timer;
  leaveTimer: Timer;
  warmTimer: Timer;
}

interface GroupApi {
  id: string;
  delay: number;
  warmWindow: number;
  activeId: string | null;
  isWarm: () => boolean;
  show: (payload: Payload, mode: Mode) => void;
  hide: (tooltipId: string, instant?: boolean) => void;
  reset: () => void;
}

interface TriggerState {
  open: Timer;
  press: Timer;
  press0: { x: number; y: number; id: number } | null;
  suppressClick: boolean;
}

type TriggerProps = Required<Omit<WarmTooltipProps, 'delay' | 'warmWindow' | 'shortcut'>> &
  Pick<WarmTooltipProps, 'delay' | 'warmWindow' | 'shortcut'>;

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SIGN: Record<WarmTooltipSide, number> = { top: 1, bottom: -1, left: -1, right: 1 };
const ORIGIN: Record<WarmTooltipSide, string> = {
  top: 'center bottom',
  bottom: 'center top',
  left: 'right center',
  right: 'left center'
};
/* The site has a 12px type floor, so the smallest label is 12px, not 11.5. */
const SIZES: Record<WarmTooltipSize, { font: number; px: number; py: number }> = {
  sm: { font: 12, px: 8, py: 5 },
  md: { font: 13, px: 10, py: 6 },
  lg: { font: 14, px: 12, py: 7 }
};
const MARGIN = 8;
const HOLD_SLOP = 10;
const SWAP = 0.14;
const SWAP_SHIFT = 10;
const RISE = 4;
const GRACE = 80;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const horizontal = (side: WarmTooltipSide) => side === 'top' || side === 'bottom';

const anchorOf = (rect: DOMRect, side: WarmTooltipSide, gap: number): [number, number] => {
  if (side === 'top') return [rect.left + rect.width / 2, rect.top - gap];
  if (side === 'bottom') return [rect.left + rect.width / 2, rect.bottom + gap];
  if (side === 'left') return [rect.left - gap, rect.top + rect.height / 2];
  return [rect.right + gap, rect.top + rect.height / 2];
};

const layoutOf = (x: number, y: number, width: number, height: number, side: WarmTooltipSide) => {
  if (horizontal(side)) {
    const X = clamp(x - width / 2, MARGIN, Math.max(MARGIN, window.innerWidth - MARGIN - width));
    return { X, Y: side === 'top' ? y - height : y };
  }
  const Y = clamp(y - height / 2, MARGIN, Math.max(MARGIN, window.innerHeight - MARGIN - height));
  return { X: side === 'left' ? x - width : x, Y };
};

const LAYER: Variants = {
  enter: ({ dir, across }: Swap) => ({
    opacity: dir === 0 ? 1 : 0,
    x: across ? 0 : SWAP_SHIFT * dir,
    y: across ? SWAP_SHIFT * dir : 0,
    filter: dir === 0 ? 'blur(0px)' : 'blur(3px)'
  }),
  show: { opacity: 1, x: 0, y: 0, filter: 'blur(0px)' },
  exit: ({ dir, across }: Swap) => ({
    opacity: 0,
    x: across ? 0 : -SWAP_SHIFT * dir,
    y: across ? -SWAP_SHIFT * dir : 0,
    filter: 'blur(3px)'
  })
};

const GroupContext = createContext<GroupApi | null>(null);

export const WarmTooltipGroup = forwardRef<WarmTooltipGroupHandle, WarmTooltipGroupProps>(function WarmTooltipGroup(
  { delay = 400, warmWindow = 300, travel = 320, onWarmChange, children },
  ref
) {
  const reduce = useReducedMotion();
  const id = useId();
  const [current, setCurrent] = useState<Payload | null>(null);
  const [state, setState] = useState<Phase>('closed');
  const st = useRef<GroupState>({
    state: 'closed',
    current: null,
    mode: 'cold',
    instant: false,
    warmUntil: -Infinity,
    warm: false,
    swap: { dir: 0, across: false },
    closeTimer: undefined,
    leaveTimer: undefined,
    warmTimer: undefined
  });
  const textRef = useRef<HTMLSpanElement | null>(null);
  const api = useRef<{
    show: (payload: Payload, mode: Mode) => void;
    hide: (tooltipId: string, instant?: boolean) => void;
  }>({ show: () => {}, hide: () => {} });

  const ax = useMotionValue(0);
  const ay = useMotionValue(0);
  const w = useMotionValue(0);
  const h = useMotionValue(0);
  const presence = useMotionValue(0);

  const place = useTransform([ax, ay, w, h], ([x, y, width, height]: number[]) => {
    const side = st.current.current ? st.current.current.side : 'top';
    const { X, Y } = layoutOf(x, y, width, height, side);
    return `translate(${X}px, ${Y}px)`;
  });
  const arrowAt = useTransform([ax, ay, w, h], ([x, y, width, height]: number[]) => {
    const side = st.current.current ? st.current.current.side : 'top';
    const { X, Y } = layoutOf(x, y, width, height, side);
    return horizontal(side) ? clamp(x - X, 10, width - 10) : clamp(y - Y, 10, height - 10);
  });
  const pop = useTransform(presence, p => {
    const item = st.current.current;
    if (reduce || !item) return 'none';
    const side = item.side;
    const scale = item.popScale + (1 - item.popScale) * p;
    const rise = (1 - p) * RISE * SIGN[side] * (side === 'left' ? -1 : 1);
    const tx = horizontal(side) ? 0 : rise;
    const ty = horizontal(side) ? rise : 0;
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  });
  const blur = useTransform(presence, p => {
    const item = st.current.current;
    return reduce || !item ? 'none' : `blur(${item.popBlur * (1 - p)}px)`;
  });

  const isWarm = () => st.current.state !== 'closed' || now() < st.current.warmUntil;
  const notify = () => {
    const next = isWarm();
    if (next === st.current.warm) return;
    st.current.warm = next;
    onWarmChange?.(next);
  };

  const finishClose = () => {
    st.current.state = 'closed';
    st.current.current = null;
    setState('closed');
    setCurrent(null);
    notify();
  };

  api.current.show = (payload: Payload, mode: Mode) => {
    clearTimeout(st.current.closeTimer);
    clearTimeout(st.current.leaveTimer);
    const prev = st.current.current;
    const fresh = st.current.state === 'closed';
    if (prev && prev.id !== payload.id) {
      const [px, py] = anchorOf(prev.trigger.getBoundingClientRect(), prev.side, prev.gap);
      const [nx, ny] = anchorOf(payload.trigger.getBoundingClientRect(), payload.side, payload.gap);
      const across = !horizontal(payload.side);
      st.current.swap = { dir: Math.sign(across ? ny - py : nx - px) || 1, across };
    } else {
      st.current.swap = { dir: 0, across: !horizontal(payload.side) };
    }
    st.current.mode = fresh ? mode : mode === 'instant' ? 'instant' : 'move';
    st.current.instant = mode === 'instant';
    st.current.current = payload;
    st.current.state = 'open';
    setCurrent(payload);
    setState('open');
    notify();
  };

  const beginClose = (instant: boolean) => {
    const item = st.current.current;
    if (!item || st.current.state !== 'open') return;
    st.current.state = 'closing';
    setState('closing');
    st.current.warmUntil = now() + item.warmWindow;
    clearTimeout(st.current.warmTimer);
    st.current.warmTimer = setTimeout(notify, item.warmWindow + 1);
    if (instant) {
      presence.jump(0);
      finishClose();
      return;
    }
    const closeMs = Math.round(item.popDuration * 0.8);
    animate(presence, 0, { duration: closeMs / 1000, ease: EASE_OUT });
    st.current.closeTimer = setTimeout(finishClose, closeMs);
  };

  api.current.hide = (tooltipId: string, instant?: boolean) => {
    const item = st.current.current;
    if (!item || item.id !== tooltipId || st.current.state !== 'open') return;
    clearTimeout(st.current.leaveTimer);
    if (instant || st.current.instant) {
      beginClose(true);
      return;
    }
    st.current.leaveTimer = setTimeout(() => beginClose(false), GRACE);
  };

  const group = useMemo(
    () => ({
      id,
      delay,
      warmWindow,
      activeId: current ? current.id : null,
      isWarm,
      show: (payload: Payload, mode: Mode) => api.current.show(payload, mode),
      hide: (tooltipId: string, instant?: boolean) => api.current.hide(tooltipId, instant),
      reset: () => {
        if (st.current.current) api.current.hide(st.current.current.id, true);
        st.current.warmUntil = -Infinity;
        clearTimeout(st.current.warmTimer);
        notify();
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, delay, warmWindow, current]
  );
  useImperativeHandle(ref, () => ({ reset: group.reset }), [group]);

  useLayoutEffect(() => {
    const item = st.current.current;
    const text = textRef.current;
    if (!item || !text || state !== 'open') return;
    const [tx, ty] = anchorOf(item.trigger.getBoundingClientRect(), item.side, item.gap);
    const tw = text.offsetWidth + item.px * 2;
    const th = text.offsetHeight + item.py * 2;
    const mode = st.current.mode;
    if (mode === 'move' && !reduce && travel > 0) {
      const spring = { type: 'spring' as const, duration: travel / 1000, bounce: 0.1 };
      animate(ax, tx, spring);
      animate(ay, ty, spring);
      animate(w, tw, spring);
      animate(h, th, spring);
      animate(presence, 1, { duration: 0.12, ease: EASE_OUT });
      return;
    }
    ax.jump(tx);
    ay.jump(ty);
    w.jump(tw);
    h.jump(th);
    if (mode === 'cold') {
      presence.jump(0);
      animate(presence, 1, { duration: item.popDuration / 1000, ease: EASE_OUT });
    } else {
      presence.jump(1);
    }
    /* A cold open can be measured while the chrome is still settling (first
       hover after a route change), which parked the label in the corner of the
       viewport. One frame later the geometry is real, so re-anchor there. */
    const raf = requestAnimationFrame(() => {
      const live = st.current.current;
      if (!live || st.current.state === 'closed') return;
      const [nx, ny] = anchorOf(live.trigger.getBoundingClientRect(), live.side, live.gap);
      ax.jump(nx);
      ay.jump(ny);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, state]);

  useEffect(() => {
    if (state === 'closed') return undefined;
    let raf = 0;
    const follow = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const item = st.current.current;
        if (!item) return;
        const [tx, ty] = anchorOf(item.trigger.getBoundingClientRect(), item.side, item.gap);
        ax.jump(tx);
        ay.jump(ty);
      });
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && st.current.current) api.current.hide(st.current.current.id, true);
    };
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', follow);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', follow);
      document.removeEventListener('visibilitychange', onHidden);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(
    () => () => {
      clearTimeout(st.current.closeTimer);
      clearTimeout(st.current.leaveTimer);
      clearTimeout(st.current.warmTimer);
    },
    []
  );

  const canPortal = typeof document !== 'undefined';
  const side = current ? current.side : 'top';

  return (
    <GroupContext.Provider value={group}>
      {children}
      {state !== 'closed' && current && canPortal
        ? createPortal(
            <motion.span
              id={id}
              role="tooltip"
              className="wt__layer"
              data-side={side}
              style={
                {
                  transform: place,
                  width: w,
                  height: h,
                  '--wt-surface': current.surfaceColor,
                  '--wt-ink': current.inkColor,
                  '--wt-radius': `${current.radius}px`,
                  '--wt-font': `${current.font}px`,
                  '--wt-origin': ORIGIN[side]
                } as MotionStyle
              }
            >
              <motion.span className="wt__surface" style={{ transform: pop, opacity: presence, filter: blur }}>
                <AnimatePresence initial={false} custom={st.current.swap}>
                  <motion.span
                    key={current.id}
                    className="wt__swap"
                    custom={st.current.swap}
                    variants={LAYER}
                    initial="enter"
                    animate="show"
                    exit="exit"
                    transition={{ duration: reduce ? 0 : SWAP, ease: EASE_OUT }}
                  >
                    <span
                      ref={el => {
                        if (el) textRef.current = el;
                      }}
                      className="wt__text"
                    >
                      {current.content}
                      {current.shortcut ? <kbd className="wt__kbd">{current.shortcut}</kbd> : null}
                    </span>
                  </motion.span>
                </AnimatePresence>
                {current.arrow ? (
                  <motion.span className="wt__arrow" data-side={side} style={{ [horizontal(side) ? 'left' : 'top']: arrowAt }} aria-hidden="true" />
                ) : null}
              </motion.span>
            </motion.span>,
            document.body
          )
        : null}
    </GroupContext.Provider>
  );
});

const Trigger: React.FC<TriggerProps> = ({
  content,
  shortcut,
  children,
  side,
  delay,
  warmWindow,
  surfaceColor,
  inkColor,
  size,
  radius,
  gap,
  arrow,
  popDuration,
  popScale,
  popBlur,
  showFuse,
  longPress,
  disabled,
  className
}) => {
  const group = useContext(GroupContext) as GroupApi;
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [fuse, setFuse] = useState<'idle' | 'arming'>('idle');
  const [pressing, setPressing] = useState(false);
  const t = useRef<TriggerState>({ open: undefined, press: undefined, press0: null, suppressClick: false });
  const preset = SIZES[size] || SIZES.md;
  const coldDelay = delay ?? group.delay;
  const active = group.activeId === id;

  const payload = (): Payload => ({
    id,
    trigger: triggerRef.current as HTMLSpanElement,
    content,
    shortcut,
    side,
    gap,
    arrow,
    surfaceColor,
    inkColor,
    radius,
    font: preset.font,
    px: preset.px,
    py: preset.py,
    popDuration,
    popScale,
    popBlur,
    warmWindow: warmWindow ?? group.warmWindow
  });

  const hide = (instant?: boolean) => {
    clearTimeout(t.current.open);
    setFuse('idle');
    group.hide(id, instant);
  };

  const arm = () => {
    if (group.isWarm()) {
      group.show(payload(), 'warm');
      return;
    }
    setFuse('arming');
    t.current.open = setTimeout(() => {
      setFuse('idle');
      group.show(payload(), 'cold');
    }, coldDelay);
  };

  const cancelPress = () => {
    clearTimeout(t.current.press);
    if (!t.current.press0) return;
    t.current.press0 = null;
    setPressing(false);
    setFuse('idle');
  };

  useEffect(() => {
    if (disabled) {
      cancelPress();
      hide(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  useEffect(() => {
    if (!active) return undefined;
    const onOutside = (event: PointerEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) hide(false);
    };
    document.addEventListener('pointerdown', onOutside, true);
    return () => document.removeEventListener('pointerdown', onOutside, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(
    () => () => {
      clearTimeout(t.current.open);
      clearTimeout(t.current.press);
    },
    []
  );

  const handlers = disabled
    ? {}
    : {
        onPointerEnter: (event: React.PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== 'touch' && event.buttons === 0) arm();
        },
        onPointerLeave: (event: React.PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== 'touch') hide(false);
        },
        onPointerDown: (event: React.PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType === 'mouse') {
            hide(false);
            return;
          }
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* capture is optional: the slop check below still cancels the press */
          }
          t.current.press0 = { x: event.clientX, y: event.clientY, id: event.pointerId };
          setPressing(true);
          setFuse('arming');
          t.current.press = setTimeout(() => {
            t.current.suppressClick = true;
            t.current.press0 = null;
            setPressing(false);
            setFuse('idle');
            group.show(payload(), 'cold');
          }, longPress);
        },
        onPointerMove: (event: React.PointerEvent<HTMLSpanElement>) => {
          const start = t.current.press0;
          if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > HOLD_SLOP) {
            cancelPress();
          }
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (event: React.MouseEvent<HTMLSpanElement>) => {
          if (t.current.press0) event.preventDefault();
        },
        onClickCapture: (event: React.MouseEvent<HTMLSpanElement>) => {
          if (!t.current.suppressClick) return;
          t.current.suppressClick = false;
          event.preventDefault();
          event.stopPropagation();
        },
        onFocus: (event: React.FocusEvent<HTMLSpanElement>) => {
          if ((event.target as HTMLElement).matches?.(':focus-visible')) group.show(payload(), 'instant');
        },
        onBlur: () => hide(true),
        onKeyDown: (event: React.KeyboardEvent<HTMLSpanElement>) => {
          if (event.key === 'Escape') hide(true);
        }
      };

  const described = children.props['aria-describedby'] as string | undefined;

  return (
    <span
      ref={triggerRef}
      className={`wt${className ? ` ${className}` : ''}`}
      data-pressing={pressing ? '' : undefined}
      style={
        {
          '--wt-surface': surfaceColor,
          '--wt-fuse-ms': `${t.current.press0 ? longPress : coldDelay}ms`
        } as CSSProperties
      }
      {...handlers}
    >
      {cloneElement(children, { 'aria-describedby': active ? group.id : described })}
      {showFuse ? <span className="wt__fuse" data-side={side} data-fuse={fuse} aria-hidden="true" /> : null}
    </span>
  );
};

const WarmTooltip: React.FC<WarmTooltipProps> = ({
  content,
  shortcut,
  children,
  side = 'top',
  delay,
  warmWindow,
  surfaceColor = 'var(--surface-solid)',
  inkColor = 'var(--ink)',
  size = 'md',
  radius = 8,
  gap = 8,
  arrow = true,
  popDuration = 160,
  popScale = 0.94,
  popBlur = 4,
  showFuse = false,
  longPress = 500,
  disabled = false,
  className = ''
}) => {
  const context = useContext(GroupContext);
  const props = {
    content,
    shortcut,
    children,
    side,
    delay,
    warmWindow,
    surfaceColor,
    inkColor,
    size,
    radius,
    gap,
    arrow,
    popDuration,
    popScale,
    popBlur,
    showFuse,
    longPress,
    disabled,
    className
  };
  if (context) return <Trigger {...props} />;
  return (
    <WarmTooltipGroup delay={delay} warmWindow={warmWindow}>
      <Trigger {...props} />
    </WarmTooltipGroup>
  );
};

export default WarmTooltip;
