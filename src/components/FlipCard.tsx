/**
 * FlipCard — a two-sided card that turns over on click or drag.
 *
 * Adapted from the react-bits FlipCard micro-interaction by David Haz
 * (MIT + Commons Clause). The 3D rotor, the pointer-slop gate and the flick
 * detection are the original author's; this port drops the tilt and glare
 * layers — the app's design language has no sheen — leaves each face bare so
 * the caller can dress it with the shared glass panel, and hinges the card on
 * a half turn so a hard flick lands on the other side instead of winding a
 * whole extra turn back to where it started.
 *
 * Both faces stay mounted. The one that is turned away is hidden from the eye
 * (`backface-visibility`) and from assistive tech (`inert`), so a face never
 * re-mounts: its scroll position and its reveal animations survive the turn.
 *
 * Two things stay with the caller. Sizing: the faces are absolute, so
 * `.flip-card` needs a height from CSS. Semantics: this is a pointer
 * affordance, so pair it with a labelled control (`aria-pressed`) instead of
 * making the whole card a button — a button role would present the card's text
 * as presentational and hide the record from a screen reader.
 */
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode
} from 'react';
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls
} from 'motion/react';

import './FlipCard.css';

export type FlipAxis = 'x' | 'y';

export interface FlipCardProps {
  front: ReactNode;
  back: ReactNode;
  /** 'y' turns like a page (drag sideways), 'x' turns like a hatch (drag up/down) */
  axis?: FlipAxis;
  /** own the flip from outside; omit and the card flips itself */
  flipped?: boolean;
  defaultFlipped?: boolean;
  onFlipChange?: (flipped: boolean) => void;
  /** turn the card when a face is clicked */
  flipOnClick?: boolean;
  /** turn the card when a face is dragged along its axis */
  draggable?: boolean;
  /** travel in px that maps to a half turn; defaults to the card's own extent */
  dragDistance?: number;
  perspective?: number;
  stiffness?: number;
  damping?: number;
  disabled?: boolean;
  className?: string;
}

/** travel before a press counts as a drag, how far a flick throws it, and the
    speed at which a flick starts to decide the landing on its own */
const SLOP = 5;
const FLICK = 260;
const HISTORY_MS = 90;
/** presses on these are theirs, not the card's */
const IGNORE = 'button, a, input, select, textarea, [data-flip-ignore]';

interface Grip {
  id: number;
  x: number;
  y: number;
  /** the half turn the card is hinged on when the press starts */
  base: number;
  /** how far the card sat from that hinge (only ever non-zero mid-spring) */
  offset: number;
  moved: boolean;
  hist: { t: number; v: number }[];
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
/** the nearest half turn — where the card is flat to the eye */
const snap = (deg: number) => Math.round(deg / 180) * 180;
const isBack = (deg: number) => Math.abs(Math.round(deg / 180)) % 2 === 1;
const ignores = (target: EventTarget | null) => target instanceof Element && target.closest(IGNORE) !== null;

export const FlipCard = ({
  front,
  back,
  axis = 'y',
  flipped,
  defaultFlipped = false,
  onFlipChange,
  flipOnClick = true,
  draggable = true,
  dragDistance = 0,
  perspective = 1400,
  stiffness = 170,
  damping = 20,
  disabled = false,
  className = ''
}: FlipCardProps) => {
  const reduce = useReducedMotion() ?? false;
  const controlled = flipped !== undefined;
  const [own, setOwn] = useState(defaultFlipped);
  const shown = controlled ? flipped : own;

  /** the side the card last came to rest on */
  const settled = useRef(shown);
  const grip = useRef<Grip | null>(null);
  const spin = useRef<AnimationPlaybackControls | null>(null);
  /** set when a drag ends, so the click that follows it does not turn twice */
  const swallowed = useRef(false);
  const [dragging, setDragging] = useState(false);

  const turn = useMotionValue(shown ? 180 : 0);
  const rotate = useMotionTemplate`perspective(${perspective}px) ${axis === 'x' ? 'rotateX' : 'rotateY'}(${turn}deg)`;

  const settle = (to: number, velocity: number, instant: boolean) => {
    spin.current?.stop();
    spin.current = null;
    if (instant || reduce) turn.jump(to);
    else spin.current = animate(turn, to, { type: 'spring', stiffness, damping, velocity, restDelta: 0.05 });

    const next = isBack(to);
    if (next === settled.current) return;
    settled.current = next;
    if (!controlled) setOwn(next);
    onFlipChange?.(next);
  };

  /** the half turn that lands on `side`, whichever way up the card happens to be */
  const halfTurn = (side: boolean) => {
    const base = snap(turn.get());
    return isBack(base) === side ? base : base + (side ? 180 : -180);
  };

  const flip = (instant: boolean) => settle(halfTurn(!settled.current), 0, instant);

  /* A parent that owns `flipped` may change it at any time — the bar's button,
     a new word. Turn to match, unless the card already came to rest there. */
  useEffect(() => {
    if (!controlled || settled.current === flipped) return;
    settle(halfTurn(flipped), 0, reduce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, controlled]);

  useEffect(() => () => spin.current?.stop(), []);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowed.current = false;
    if (disabled || e.button !== 0 || grip.current || ignores(e.target)) return;
    /* no capture yet: a press that turns out to be a scroll or a text
       selection has to stay the browser's. */
    const hinge = snap(turn.get());
    grip.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      base: hinge,
      offset: turn.get() - hinge,
      moved: false,
      hist: []
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;

    if (!g.moved) {
      if (!draggable || reduce) return;
      const along = axis === 'y' ? e.clientX - g.x : e.clientY - g.y;
      const across = axis === 'y' ? e.clientY - g.y : e.clientX - g.x;
      /* a press only becomes a drag once it clearly travels along the axis;
         anything else is a scroll, a selection or a click. */
      if (Math.abs(along) < SLOP || Math.abs(along) <= Math.abs(across)) return;
      if (!window.getSelection()?.isCollapsed) {
        grip.current = null;
        return;
      }
      g.moved = true;
      setDragging(true);
      spin.current?.stop();
      spin.current = null;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* capture is a nicety — the drag still tracks while inside the card */
      }
    }

    const extent = axis === 'y' ? e.currentTarget.offsetWidth : e.currentTarget.offsetHeight;
    const span = dragDistance > 0 ? dragDistance : extent || 1;
    const travel = axis === 'y' ? e.clientX - g.x : g.y - e.clientY;
    /* the card is hinged on a half turn: past that the hand just stops, rather
       than winding the card round twice */
    const deg = clamp(g.base + g.offset + (travel / span) * 180, g.base - 180, g.base + 180);
    turn.set(deg);

    const now = performance.now();
    g.hist.push({ t: now, v: deg });
    while (g.hist.length > 2 && now - g.hist[0].t > HISTORY_MS) g.hist.shift();
  };

  const release = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* the capture may already be gone */
    }
    if (!g.moved) return; /* a click, not a drag — let onClick turn the card */

    setDragging(false);
    swallowed.current = true;

    /* Where it lands is a single half turn from the hinge, never a full spin:
       a fast flick decides the direction, otherwise it is how far the hand
       got. The card is given the flick's speed so the spring carries the
       momentum instead of easing from a standstill. */
    const here = turn.get();
    const swept = here - g.base - g.offset;
    let velocity = 0;
    const first = g.hist[0];
    const last = g.hist[g.hist.length - 1];
    if (!cancelled && first && last && last.t > first.t && performance.now() - last.t < 60)
      velocity = ((last.v - first.v) / (last.t - first.t)) * 1000;

    const flick = Math.abs(velocity) > FLICK ? Math.sign(velocity) : 0;
    const push = cancelled ? 0 : flick || (Math.abs(swept) > 90 ? Math.sign(swept) : 0);
    settle(g.base + push * 180, velocity, false);
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (swallowed.current) {
      swallowed.current = false;
      return;
    }
    if (!flipOnClick || disabled || ignores(e.target)) return;
    flip(false);
  };

  return (
    <div
      className={`flip-card${className ? ` ${className}` : ''}`}
      data-axis={axis}
      data-dragging={dragging ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={e => release(e, false)}
      onPointerCancel={e => release(e, true)}
      onLostPointerCapture={e => release(e, true)}
      onClick={onClick}
      onDragStart={e => e.preventDefault()}
    >
      <motion.div className="flip-card__rotor" style={{ transform: rotate }}>
        <div className="flip-card__face" aria-hidden={shown} inert={shown}>
          {front}
        </div>
        <div className="flip-card__face flip-card__face--back" aria-hidden={!shown} inert={!shown}>
          {back}
        </div>
      </motion.div>
    </div>
  );
};

export default FlipCard;
