/**
 * PillNav — a capsule navigation bar with a spring-follow highlight.
 *
 * Adapted from the react-bits `PillNav` component (MIT + Commons Clause),
 * re-authored for this project's conventions: plain CSS classes over the
 * design tokens instead of Tailwind, React Router `Link` via linkComponent,
 * and the theme follows the app's `data-theme` attribute rather than a prop.
 *
 * The spring engine (glide fill, press squash, intro reveal) is the original
 * author's; what changed is styling and how links are rendered.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react';

import './PillNav.css';

export interface PillNavItem {
  label: string;
  href?: string;
  icon?: ReactNode;
  ariaLabel?: string;
}

export interface PillNavProps {
  logo?: string | ReactNode;
  logoAlt?: string;
  logoHref?: string;
  items?: PillNavItem[];
  activeHref?: string;
  defaultActiveIndex?: number;
  onItemClick?: (item: PillNavItem, index: number, event: ReactMouseEvent<HTMLElement>) => void;
  linkComponent?: ElementType;
  size?: 'sm' | 'md';
  itemStyle?: 'pill' | 'plain';
  hoverEffect?: 'fill' | 'glide' | 'none';
  indicator?: 'dot' | 'none';
  surface?: 'glass' | 'solid' | 'none';
  highlightColor?: string;
  barColor?: string;
  textColor?: string;
  bounce?: number;
  stretch?: number;
  intro?: boolean;
  collapse?: 'auto' | 'always' | 'never';
  onMenuToggle?: (open: boolean) => void;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}

interface LinkProps {
  className: string;
  'aria-current'?: 'page';
  'aria-label'?: string;
  tabIndex?: number;
  onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
}

interface Engine {
  enter: (index: number, event?: ReactPointerEvent) => void;
  leave: () => void;
  focus: (index: number, event?: ReactFocusEvent) => void;
  blur: () => void;
  press: (event?: ReactPointerEvent) => void;
  release: () => void;
  refresh: () => void;
}

const SIZES: Record<string, Record<string, string>> = {
  sm: { '--pn-h': '36px', '--pn-pad': '3px', '--pn-inner': '30px', '--pn-x': '12px', '--pn-font': '13px', '--pn-gap': '6px', '--pn-mark': '18px' },
  md: { '--pn-h': '42px', '--pn-pad': '4px', '--pn-inner': '34px', '--pn-x': '14px', '--pn-font': '13.5px', '--pn-gap': '8px', '--pn-mark': '22px' }
};

const DEFAULT_ITEMS: PillNavItem[] = [{ label: 'Home', href: '#' }];

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const readVar = (element: Element, name: string) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;

const PillNav = ({
  logo,
  logoAlt = 'Logo',
  logoHref = '#',
  items = DEFAULT_ITEMS,
  activeHref,
  defaultActiveIndex = 0,
  onItemClick,
  linkComponent: LinkComponent = 'a',
  size = 'sm',
  itemStyle = 'plain',
  hoverEffect = 'fill',
  indicator = 'none',
  surface = 'glass',
  highlightColor,
  barColor,
  textColor,
  bounce = 0.3,
  stretch = 0.5,
  intro = true,
  collapse = 'auto',
  onMenuToggle,
  ariaLabel = 'Main',
  className = '',
  style
}: PillNavProps) => {
  const panelId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const logoRef = useRef<HTMLSpanElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const measureListRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLLIElement | null)[]>([]);
  const engineRef = useRef<Engine | null>(null);
  const introRef = useRef(intro);
  const slideRef = useRef(false);
  const pendingRef = useRef<boolean | null>(null);
  const [selected, setSelected] = useState(defaultActiveIndex);
  const [collapsed, setCollapsed] = useState(collapse === 'always');
  const [open, setOpen] = useState(false);
  const [panelShown, setPanelShown] = useState(false);

  const controlled = activeHref !== undefined;
  const activeIndex = controlled ? items.findIndex(item => item.href === activeHref) : selected;
  const hasLogo = Boolean(logo);
  const fill = hoverEffect === 'fill';
  const glide = !fill && (hoverEffect === 'glide' || indicator !== 'none');

  const settings = {
    hoverEffect,
    indicator,
    activeIndex,
    bounce: clamp(bounce, 0, 1),
    stretch: clamp(stretch, 0, 1)
  };
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const vars: Record<string, string> = { ...(SIZES[size] ?? SIZES.sm) };
  if (surface === 'glass') vars['--pn-blur'] = 'blur(20px) saturate(1.6)';
  if (surface === 'solid') {
    vars['--pn-blur'] = 'none';
  }
  if (surface === 'none') {
    vars['--pn-surface'] = 'transparent';
    vars['--pn-shadow'] = 'none';
    vars['--pn-blur'] = 'none';
    vars['--pn-edge'] = 'transparent';
    vars['--pn-rim'] = 'transparent';
  }
  if (barColor) vars['--pn-surface'] = barColor;
  if (textColor) {
    vars['--pn-strong'] = textColor;
    vars['--pn-text'] = `color-mix(in srgb, ${textColor} 64%, transparent)`;
  }
  if (highlightColor) {
    vars['--pn-pill'] = highlightColor;
    vars['--pn-dot'] = highlightColor;
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const state = {
      x0: 0,
      x1: 0,
      v0: 0,
      v1: 0,
      alpha: 0,
      pop: 1,
      pressing: false,
      press: 1,
      pressVelocity: 0,
      dotX: 0,
      dotVelocity: 0,
      dotAlpha: 0,
      hover: -1,
      focus: false,
      sliding: false,
      waiting: slideRef.current && !reduce
    };
    slideRef.current = false;
    const rects: { left: number; width: number }[] = [];
    let trackWidth = 0;
    let trackHeight = 0;
    let raf = 0;
    let last = 0;

    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      trackWidth = track.offsetWidth;
      trackHeight = track.offsetHeight;
      slotRefs.current.forEach((slot, index) => {
        if (!slot) return;
        rects[index] = { left: slot.offsetLeft, width: slot.offsetWidth };
        const reach = Math.ceil(2 * Math.sqrt((slot.offsetWidth / 2) ** 2 + slot.offsetHeight ** 2)) + 2;
        slot.style.setProperty('--pn-fill', `${reach}px`);
      });
    };

    const glideIndex = () => {
      const s = settingsRef.current;
      if (s.hoverEffect === 'fill') return -1;
      if (s.hoverEffect === 'glide' && state.hover >= 0) return state.hover;
      return s.indicator !== 'none' ? s.activeIndex : -1;
    };

    const sync = () => {
      const s = settingsRef.current;
      slotRefs.current.forEach((slot, index) => {
        if (!slot) return;
        const hovered = state.hover === index;
        slot.toggleAttribute('data-lit', hovered);
        slot.toggleAttribute('data-hover', hovered && s.hoverEffect === 'fill');
      });
      root.toggleAttribute('data-focus', state.focus && state.hover >= 0);
      root.toggleAttribute(
        'data-dot-lit',
        s.hoverEffect === 'fill' && state.hover >= 0 && state.hover === s.activeIndex
      );
    };

    const render = () => {
      const glideEl = glideRef.current;
      const ink = inkRef.current;
      const dot = dotRef.current;
      const width = Math.max(0, state.x1 - state.x0);
      const scale = state.press * state.pop;
      const target = rects[glideIndex()];
      const squash = target ? 1 - clamp((width / Math.max(target.width, 1) - 1) * 0.3, 0, 0.14) : 1;
      if (glideEl) {
        glideEl.style.width = `${width}px`;
        glideEl.style.transform = `translate3d(${state.x0}px, 0, 0) scale(${scale}, ${scale * squash})`;
        glideEl.style.opacity = `${state.alpha}`;
      }
      if (ink) {
        const half = (width * scale) / 2;
        const center = (state.x0 + state.x1) / 2;
        const inset = (trackHeight * (1 - scale * squash)) / 2;
        ink.style.clipPath = `inset(${inset}px ${trackWidth - center - half}px ${inset}px ${center - half}px round ${trackHeight / 2}px)`;
        ink.style.opacity = `${state.alpha}`;
      }
      if (dot) {
        const pull = clamp(Math.abs(state.dotVelocity) / 700, 0, 2.2);
        dot.style.transform = `translate3d(${state.dotX}px, 0, 0) scaleX(${1 + pull})`;
        dot.style.opacity = `${state.dotAlpha}`;
      }
    };

    const tick = (now: number) => {
      raf = 0;
      const s = settingsRef.current;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      const index = glideIndex();
      const target = rects[index];
      const zeta = 1 - 0.55 * s.bounce;
      const base = 520;
      let busy = false;

      if (target && !state.waiting) {
        const t0 = target.left;
        const t1 = target.left + target.width;
        if (state.alpha < 0.02 && !state.sliding) {
          state.x0 = t0;
          state.x1 = t1;
          state.v0 = 0;
          state.v1 = 0;
          state.pop = 0.9;
        }
        if (reduce) {
          state.x0 = t0;
          state.x1 = t1;
          state.v0 = 0;
          state.v1 = 0;
        } else {
          const direction = Math.sign((t0 + t1) / 2 - (state.x0 + state.x1) / 2);
          const lead = base * (1 + 0.9 * s.stretch);
          const trail = base * (1 - 0.5 * s.stretch);
          const k0 = direction < 0 ? lead : direction > 0 ? trail : base;
          const k1 = direction > 0 ? lead : direction < 0 ? trail : base;
          const steps = Math.ceil(dt / (1 / 240));
          const h = dt / steps;
          for (let i = 0; i < steps; i++) {
            state.v0 += (-k0 * (state.x0 - t0) - 2 * zeta * Math.sqrt(k0) * state.v0) * h;
            state.x0 += state.v0 * h;
            state.v1 += (-k1 * (state.x1 - t1) - 2 * zeta * Math.sqrt(k1) * state.v1) * h;
            state.x1 += state.v1 * h;
          }
        }
        state.alpha += (1 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.06));
        busy =
          Math.abs(state.x0 - t0) > 0.05 ||
          Math.abs(state.x1 - t1) > 0.05 ||
          Math.abs(state.v0) > 0.5 ||
          Math.abs(state.v1) > 0.5 ||
          state.alpha < 0.999;
        if (!busy) state.sliding = false;
      } else {
        state.alpha += (0 - state.alpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.07));
        if (state.alpha > 0.002) busy = true;
        else state.alpha = 0;
      }

      state.pop += (1 - state.pop) * (reduce ? 1 : 1 - Math.exp(-dt / 0.09));
      if (Math.abs(1 - state.pop) > 0.001) busy = true;

      const pressTarget = state.pressing ? 0.95 : 1;
      if (reduce) {
        state.press = pressTarget;
        state.pressVelocity = 0;
      } else {
        state.pressVelocity += (-700 * (state.press - pressTarget) - 30 * state.pressVelocity) * dt;
        state.press += state.pressVelocity * dt;
      }
      if (Math.abs(state.press - pressTarget) > 0.0005 || Math.abs(state.pressVelocity) > 0.01) busy = true;

      const dotTarget = s.indicator === 'dot' ? rects[s.activeIndex] : null;
      if (dotTarget && !state.waiting) {
        const center = dotTarget.left + dotTarget.width / 2;
        if (state.dotAlpha < 0.02) {
          state.dotX = center;
          state.dotVelocity = 0;
        }
        if (reduce) {
          state.dotX = center;
          state.dotVelocity = 0;
        } else {
          const k = 360;
          const steps = Math.ceil(dt / (1 / 240));
          const h = dt / steps;
          for (let i = 0; i < steps; i++) {
            state.dotVelocity +=
              (-k * (state.dotX - center) - 2 * (1 - 0.5 * s.bounce) * Math.sqrt(k) * state.dotVelocity) * h;
            state.dotX += state.dotVelocity * h;
          }
        }
        state.dotAlpha += (1 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1));
        if (Math.abs(state.dotX - center) > 0.05 || Math.abs(state.dotVelocity) > 0.5 || state.dotAlpha < 0.999)
          busy = true;
      } else {
        state.dotAlpha += (0 - state.dotAlpha) * (reduce ? 1 : 1 - Math.exp(-dt / 0.1));
        if (state.dotAlpha > 0.002) busy = true;
        else state.dotAlpha = 0;
      }

      render();
      if (busy) raf = requestAnimationFrame(tick);
    };

    const wake = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const engine: Engine = {
      enter: (index, event) => {
        if (event?.pointerType === 'touch') return;
        state.hover = index;
        state.focus = false;
        sync();
        wake();
      },
      leave: () => {
        if (state.focus) return;
        state.hover = -1;
        sync();
        wake();
      },
      focus: (index, event) => {
        const target = event?.target;
        const visible = target instanceof Element && target.matches(':focus-visible');
        state.focus = visible;
        state.hover = visible ? index : state.hover;
        sync();
        wake();
      },
      blur: () => {
        if (!state.focus) return;
        state.focus = false;
        state.hover = -1;
        sync();
        wake();
      },
      press: event => {
        if (event && event.button > 0) return;
        state.pressing = true;
        wake();
      },
      release: () => {
        if (!state.pressing) return;
        state.pressing = false;
        wake();
      },
      refresh: () => {
        measure();
        sync();
        wake();
      }
    };
    engineRef.current = engine;

    measure();
    sync();
    render();
    wake();

    let timer = 0;
    if (state.waiting) {
      state.x0 = 0;
      state.x1 = 0;
      timer = window.setTimeout(() => {
        state.waiting = false;
        if (glideIndex() >= 0) {
          state.alpha = 1;
          state.sliding = true;
        }
        wake();
      }, 420);
    }

    const resizeObserver = new ResizeObserver(() => {
      measure();
      render();
      wake();
    });
    if (trackRef.current) resizeObserver.observe(trackRef.current);
    document.fonts?.ready?.then(() => engine.refresh()).catch(() => {});
    window.addEventListener('pointerup', engine.release);
    window.addEventListener('pointercancel', engine.release);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      window.removeEventListener('pointerup', engine.release);
      window.removeEventListener('pointercancel', engine.release);
      engineRef.current = null;
    };
  }, [collapsed, items.length]);

  useEffect(() => {
    engineRef.current?.refresh();
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !measureRef.current) return undefined;
    const evaluate = () => {
      if (collapse === 'always' || collapse === 'never') {
        setCollapsed(collapse === 'always');
        return;
      }
      const parent = root.parentElement;
      if (!parent) return;
      const styles = getComputedStyle(parent);
      const available =
        parent.clientWidth - (parseFloat(styles.paddingLeft) || 0) - (parseFloat(styles.paddingRight) || 0);
      const listWidth = measureListRef.current?.offsetWidth ?? 0;
      const height = readVar(root, '--pn-h');
      const pad = readVar(root, '--pn-pad');
      const gap = readVar(root, '--pn-gap');
      const need = (hasLogo ? height + gap : 0) + listWidth + pad * 2;
      const next = need > available + 0.5;
      if (introRef.current && next !== collapsed) pendingRef.current = next;
      setCollapsed(next);
    };
    evaluate();
    const observer = new ResizeObserver(evaluate);
    if (root.parentElement) observer.observe(root.parentElement);
    observer.observe(measureRef.current);
    return () => observer.disconnect();
  }, [collapse, collapsed, hasLogo]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !introRef.current) return;
    if (pendingRef.current !== null && pendingRef.current !== collapsed) return;
    pendingRef.current = null;
    introRef.current = false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const pop = (element: HTMLElement | null, delay: number) =>
      element?.animate(
        [
          { opacity: 0, transform: 'scale(0.6)' },
          { opacity: 1, transform: 'scale(1)' }
        ],
        { duration: 700, delay, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' }
      );
    const reveal = (element: HTMLElement | null) => {
      if (!element) return;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      element.animate(
        [
          { clipPath: `inset(0px ${Math.max(0, width - height)}px 0px 0px round ${height / 2}px)` },
          { clipPath: `inset(0px 0px 0px 0px round ${height / 2}px)` }
        ],
        { duration: 760, delay: 90, easing: EASE_OUT, fill: 'backwards' }
      );
    };
    pop(logoRef.current, 0);
    if (collapsed) {
      pop(toggleRef.current, 120);
      return;
    }
    slideRef.current = true;
    reveal(barRef.current);
    slotRefs.current.forEach((slot, index) => {
      slot?.animate(
        [
          { opacity: 0, transform: 'translateX(-10px)' },
          { opacity: 1, transform: 'translateX(0)' }
        ],
        { duration: 560, delay: 200 + index * 50, easing: EASE_OUT, fill: 'backwards' }
      );
    });
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed && open) setOpen(false);
  }, [collapsed, open]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const root = rootRef.current;
    if (!panel || !root) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const header = toggleRef.current?.offsetHeight ?? 44;
    const start = `inset(0px 0px ${Math.max(0, height - header)}px ${Math.max(0, width - header)}px round ${header / 2}px)`;
    const end = 'inset(0px 0px 0px 0px round 20px)';
    const rows = panel.querySelectorAll('li');
    const running: Animation[] = [];
    if (open) {
      if (reduce) return undefined;
      running.push(panel.animate([{ clipPath: start }, { clipPath: end }], { duration: 560, easing: EASE_OUT }));
      rows.forEach((row, index) => {
        running.push(
          row.animate(
            [
              { opacity: 0, transform: 'translateY(-8px)' },
              { opacity: 1, transform: 'translateY(0)' }
            ],
            { duration: 420, delay: 90 + index * 40, easing: EASE_OUT, fill: 'backwards' }
          )
        );
      });
    } else {
      if (reduce) {
        setPanelShown(false);
        return undefined;
      }
      const morph = panel.animate([{ clipPath: end }, { clipPath: start }], {
        duration: 380,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        fill: 'forwards'
      });
      morph.onfinish = () => setPanelShown(false);
      running.push(morph);
      rows.forEach(row => {
        running.push(row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }));
      });
    }
    return () => {
      running.forEach(animation => {
        animation.onfinish = null;
        animation.cancel();
      });
    };
  }, [open, panelShown]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const spin = (event: ReactPointerEvent) => {
    const mark = markRef.current;
    if (!mark || event.pointerType === 'touch' || mark.getAnimations().length) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    mark.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 900,
      easing: 'cubic-bezier(0.65, 0, 0.25, 1)'
    });
  };

  const choose = (item: PillNavItem, index: number, event: ReactMouseEvent<HTMLElement>) => {
    onItemClick?.(item, index, event);
    if (!controlled) setSelected(index);
  };

  const toggle = () => {
    const next = !open;
    if (next) setPanelShown(true);
    setOpen(next);
    onMenuToggle?.(next);
  };

  const link = (item: PillNavItem, props: LinkProps, children: ReactNode) => {
    if (!item.href) {
      return (
        <button type="button" {...props}>
          {children}
        </button>
      );
    }
    return (
      <LinkComponent href={item.href} {...props}>
        {children}
      </LinkComponent>
    );
  };

  const face = (item: PillNavItem) => (
    <>
      {item.icon}
      {item.label}
    </>
  );

  return (
    <nav
      ref={rootRef}
      className={['pill-nav', className].filter(Boolean).join(' ')}
      data-items={itemStyle}
      data-collapsed={collapsed ? '' : undefined}
      data-open={open ? '' : undefined}
      data-panel={panelShown ? '' : undefined}
      style={{ ...vars, ...style } as CSSProperties}
      aria-label={ariaLabel}
    >
      {logo && (
        <span ref={logoRef} className="pill-nav__logo">
          <LinkComponent href={logoHref} className="pill-nav__logo-link" aria-label={logoAlt} onPointerEnter={spin}>
            <span ref={markRef} className="pill-nav__mark">
              {typeof logo === 'string' ? <img src={logo} alt="" draggable={false} /> : logo}
            </span>
          </LinkComponent>
          <span className="pill-nav__rim" />
        </span>
      )}

      {!collapsed && (
        <div ref={barRef} className="pill-nav__bar">
          <div ref={trackRef} className="pill-nav__track" onPointerLeave={() => engineRef.current?.leave()}>
            <ul className="pill-nav__list">
              {items.map((item, index) => (
                <li
                  key={`${item.label}-${index}`}
                  ref={element => {
                    slotRefs.current[index] = element;
                  }}
                  className="pill-nav__slot"
                  data-lit={undefined}
                  onPointerEnter={event => engineRef.current?.enter(index, event)}
                  onPointerDown={event => engineRef.current?.press(event)}
                  onFocus={event => engineRef.current?.focus(index, event)}
                  onBlur={() => engineRef.current?.blur()}
                >
                  {link(
                    item,
                    {
                      className: 'pill-nav__item',
                      'aria-current': index === activeIndex ? 'page' : undefined,
                      'aria-label': item.ariaLabel,
                      onClick: event => choose(item, index, event)
                    },
                    <>
                      {fill && <span className="pill-nav__fill" aria-hidden="true" />}
                      <span className="pill-nav__face">{face(item)}</span>
                      {fill && (
                        <span className="pill-nav__face-alt" aria-hidden="true">
                          {face(item)}
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
            {glide && <span ref={glideRef} className="pill-nav__glide" aria-hidden="true" />}
            {glide && (
              <div ref={inkRef} className="pill-nav__ink" aria-hidden="true">
                {items.map((item, index) => (
                  <span key={`${item.label}-${index}`} className="pill-nav__ink-item">
                    {face(item)}
                  </span>
                ))}
              </div>
            )}
            {indicator === 'dot' && <span ref={dotRef} className="pill-nav__dot" aria-hidden="true" />}
          </div>
          <span className="pill-nav__rim" />
        </div>
      )}

      {collapsed && (
        <button
          ref={toggleRef}
          type="button"
          className="pill-nav__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={toggle}
        >
          <span className="pill-nav__burger" aria-hidden="true">
            <span className="pill-nav__line-top" />
            <span className="pill-nav__line-bottom" />
          </span>
          <span className="pill-nav__rim" />
        </button>
      )}

      {collapsed && panelShown && (
        <div ref={panelRef} id={panelId} className="pill-nav__panel">
          <ul className="pill-nav__menu">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                {link(
                  item,
                  {
                    className: 'pill-nav__row',
                    'aria-current': index === activeIndex ? 'page' : undefined,
                    tabIndex: open ? undefined : -1,
                    onClick: event => {
                      choose(item, index, event);
                      setOpen(false);
                      onMenuToggle?.(false);
                    }
                  },
                  face(item)
                )}
              </li>
            ))}
          </ul>
          <span className="pill-nav__rim" />
        </div>
      )}

      <div ref={measureRef} className="pill-nav__measure" aria-hidden="true">
        <div ref={measureListRef} className="pill-nav__list">
          {items.map((item, index) => (
            <span key={`${item.label}-${index}`} className="pill-nav__ink-item">
              {face(item)}
            </span>
          ))}
        </div>
      </div>
    </nav>
  );
};

export default PillNav;
