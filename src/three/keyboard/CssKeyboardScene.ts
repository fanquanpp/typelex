/**
 * CssKeyboardScene — the DOM/CSS replacement for the Three.js keyboard.
 *
 * The WebGL board read as heavy and imprecise for what it communicated; this
 * implementation renders the same layout data (real ANSI units, correct row
 * stagger, non-1u widths) as absolutely-positioned DOM keys inside a single
 * perspective container. The 3D reading comes from a small fixed tilt plus
 * pointer parallax — deliberately shallow — and presses stay imperative:
 * `press()/release()/highlight()/error()` mutate the key record and write
 * inline styles/classes directly, never through React state.
 *
 * It implements the same public surface as the old KeyboardScene, so
 * KeyboardStage and every consumer keep working unchanged.
 */
import { fingerForCode, FINGER_COLOR } from '../../lib/typing/fingers';
import type { Theme } from '../../lib/types';
import { getLayout, type LayoutDef } from './layouts';
import { getModel, type KeyboardModel, type RgbStyle } from './models';
import type { ViewPreset } from './KeyboardScene';
import './csskb.css';

export interface CssKeyboardSceneOptions {
  modelId: string;
  theme: Theme;
  fingerHints: boolean;
  showNextKey: boolean;
  rgbStyle: RgbStyle;
  interactive: boolean;
  onKeyClick?: (code: string) => void;
}

interface KeyRecord {
  def: LayoutDef['keys'][number];
  el: HTMLButtonElement;
  press: number;
  pressed: boolean;
  flashUntil: number;
  glow: number;
}

const VIEW_TILT: Record<ViewPreset, { rx: number; ry: number; scale: number }> = {
  angled: { rx: 24, ry: 0, scale: 1 },
  top: { rx: 8, ry: 0, scale: 1.12 },
  front: { rx: 2, ry: 0, scale: 1.04 },
  close: { rx: 30, ry: 0, scale: 1.5 }
};

export class CssKeyboardScene {
  private container: HTMLElement;
  private options: CssKeyboardSceneOptions;
  private model: KeyboardModel;
  private layout: LayoutDef;
  private records: KeyRecord[] = [];
  private byCode = new Map<string, KeyRecord>();
  private nextCode: string | null = null;
  private heat: Record<string, number> = {};
  private host: HTMLDivElement;
  private board: HTMLDivElement;
  private plate: HTMLDivElement;
  private pointerX = 0;
  private pointerY = 0;
  private targetX = 0;
  private targetY = 0;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private view: ViewPreset = 'angled';

  constructor(container: HTMLElement, options: CssKeyboardSceneOptions) {
    this.container = container;
    this.options = options;
    this.model = getModel(options.modelId);
    this.layout = getLayout(this.model.layoutId);

    this.host = document.createElement('div');
    this.host.className = 'csskb';
    this.host.setAttribute('aria-hidden', 'true');

    this.board = document.createElement('div');
    this.board.className = 'csskb__board';

    this.plate = document.createElement('div');
    this.plate.className = 'csskb__plate';

    this.board.appendChild(this.plate);
    this.host.appendChild(this.board);
    this.container.appendChild(this.host);

    this.buildKeys();
    this.applyThemeClasses();
    this.applyView(this.view);

    this.host.addEventListener('pointermove', this.onPointerMove);
    this.host.addEventListener('pointerleave', this.onPointerLeave);
    this.resizeObserver = new ResizeObserver(() => this.layout_());
    this.resizeObserver.observe(container);
    this.layout_();

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private resizeObserver: ResizeObserver;

  /* ------------------------------------------------------------------ */
  /* construction                                                       */
  /* ------------------------------------------------------------------ */

  private buildKeys() {
    const { keys } = this.layout;
    const unit = 100; /* plate is sized in % via padding hack; keys use unit math */
    void unit;
    this.plate.style.setProperty('--kb-cols', `${this.layout.width}`);
    this.plate.style.setProperty('--kb-rows', `${this.layout.depth}`);

    for (const def of keys) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'csskb__key';
      el.dataset.code = def.code;
      const finger = fingerForCode(def.code);
      if (finger) el.style.setProperty('--finger-color', FINGER_COLOR[finger]);
      const legend = document.createElement('span');
      legend.className = 'csskb__legend';
      legend.textContent = def.label.replace('\n', ' ');
      el.appendChild(legend);
      if (this.options.interactive) {
        el.addEventListener('click', () => {
          this.press(def.code, true);
          window.setTimeout(() => this.release(def.code), 110);
          this.options.onKeyClick?.(def.code);
        });
      }
      this.plate.appendChild(el);
      const record: KeyRecord = { def, el, press: 0, pressed: false, flashUntil: 0, glow: 0 };
      this.records.push(record);
      this.byCode.set(def.code, record);
    }
    this.applyGeometry();
  }

  /** Position every key from layout units — px math against the plate box. */
  private applyGeometry() {
    const width = this.plate.clientWidth;
    if (!width) return;
    const unitPx = width / this.layout.width;
    for (const record of this.records) {
      const { def } = record;
      record.el.style.left = `${def.x * unitPx}px`;
      record.el.style.top = `${def.y * unitPx}px`;
      record.el.style.width = `${def.w * unitPx}px`;
      record.el.style.height = `${def.h * unitPx}px`;
      record.el.style.setProperty('--kb-cap-h', `${Math.max(3, this.model.capHeight * unitPx * 0.16)}px`);
    }
  }

  private layout_() {
    this.applyGeometry();
  }

  /* ------------------------------------------------------------------ */
  /* theme / options                                                    */
  /* ------------------------------------------------------------------ */

  private applyThemeClasses() {
    this.host.dataset.theme = this.options.theme;
    this.host.dataset.profile = this.model.profile;
    this.host.dataset.finger = this.options.fingerHints ? 'true' : 'false';
    this.host.dataset.backlight = this.model.backlight;
    this.host.dataset.rgb = this.options.rgbStyle;
    this.plate.style.setProperty('--kb-case', this.model.case.color);
    this.plate.style.setProperty('--kb-deck', this.model.case.deckColor ?? this.model.case.color);
    this.plate.style.setProperty('--kb-cap', this.model.caps.color);
    this.plate.style.setProperty('--kb-legend', this.model.caps.legend);
  }

  /* ------------------------------------------------------------------ */
  /* view / parallax                                                    */
  /* ------------------------------------------------------------------ */

  applyView(view: ViewPreset) {
    this.view = view;
    const preset = VIEW_TILT[view] ?? VIEW_TILT.angled;
    this.host.dataset.view = view;
    this.board.style.setProperty('--kb-rx', `${preset.rx}deg`);
    this.board.style.setProperty('--kb-ry', `${preset.ry}deg`);
    this.board.style.setProperty('--kb-scale', `${preset.scale}`);
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    this.targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };

  private onPointerLeave = () => {
    this.targetX = 0;
    this.targetY = 0;
  };

  private tick = (now: number) => {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0);
    this.last = now;

    /* shallow pointer parallax: ±1.4° around the resting tilt */
    const follow = 1 - Math.exp(-dt / 0.18);
    this.pointerX += (this.targetX - this.pointerX) * follow;
    this.pointerY += (this.targetY - this.pointerY) * follow;

    const preset = VIEW_TILT[this.view] ?? VIEW_TILT.angled;
    const px = this.options.interactive ? this.pointerX * 1.4 : 0;
    const py = this.options.interactive ? this.pointerY * 0.9 : 0;
    this.board.style.transform = `rotateX(${preset.rx + py}deg) rotateY(${preset.ry + px}deg) scale(${preset.scale})`;

    /* key press springs — transform + shadow, no layout */
    let animating = false;
    for (const record of this.records) {
      const target = record.pressed ? 1 : 0;
      const speed = target > record.press ? 14 : 9;
      const next = record.press + (target - record.press) * Math.min(1, speed * dt);
      const moved = Math.abs(next - record.press) > 0.004;
      record.press = moved ? next : target;
      if (moved || record.press !== 0) animating = true;
      const flash = record.flashUntil > now;
      if (flash) animating = true;
      else if (record.flashUntil) {
        record.flashUntil = 0;
        record.el.classList.remove('csskb__key--flash');
      }
      const translateY = record.press * 0.42;
      record.el.style.setProperty('--kb-press', `${translateY.toFixed(3)}`);
      record.el.style.setProperty('--kb-press-shadow', (1 - record.press).toFixed(3));
    }
    this.raf = requestAnimationFrame(this.tick);
    void animating;
  };

  /* ------------------------------------------------------------------ */
  /* public API (mirrors KeyboardScene)                                 */
  /* ------------------------------------------------------------------ */

  setView(view: ViewPreset) {
    this.applyView(view);
  }

  setModel(modelId: string) {
    const model = getModel(modelId);
    if (model.id === this.model.id) return;
    this.model = model;
    this.layout = getLayout(model.layoutId);
    this.plate.textContent = '';
    this.records = [];
    this.byCode.clear();
    this.buildKeys();
    this.applyThemeClasses();
  }

  setTheme(theme: Theme) {
    this.options.theme = theme;
    this.applyThemeClasses();
  }

  setFingerHints(on: boolean) {
    this.options.fingerHints = on;
    this.applyThemeClasses();
  }

  setShowNextKey(on: boolean) {
    this.options.showNextKey = on;
    this.applyHighlight();
  }

  setRgbStyle(style: RgbStyle) {
    this.options.rgbStyle = style;
    this.applyThemeClasses();
  }

  setHeatmap(heat: Record<string, number>) {
    this.heat = heat;
    this.applyHeat();
  }

  private applyHeat() {
    for (const record of this.records) {
      const value = this.heat[record.def.code];
      if (value !== undefined) record.el.style.setProperty('--kb-heat', `${value.toFixed(2)}`);
      else record.el.style.removeProperty('--kb-heat');
    }
  }

  private applyHighlight() {
    for (const record of this.records) {
      record.el.classList.toggle('csskb__key--next', this.options.showNextKey && record.def.code === this.nextCode);
    }
  }

  press(code: string, correct = true) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.pressed = true;
    if (!correct) {
      record.flashUntil = performance.now() + 220;
      record.el.classList.add('csskb__key--flash');
    }
  }

  release(code: string) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.pressed = false;
  }

  highlight(code: string | null) {
    this.nextCode = code;
    this.applyHighlight();
  }

  error(code: string) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.flashUntil = performance.now() + 260;
    record.el.classList.add('csskb__key--flash');
  }

  /** A centre-out ripple of presses — used when a session completes. */
  pulse() {
    const midX = this.layout.width / 2;
    const midY = this.layout.depth / 2;
    for (const record of this.records) {
      const delay = Math.hypot(record.def.x - midX, record.def.y - midY) * 26;
      window.setTimeout(() => {
        this.press(record.def.code, true);
        window.setTimeout(() => this.release(record.def.code), 90);
      }, delay);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.host.removeEventListener('pointermove', this.onPointerMove);
    this.host.removeEventListener('pointerleave', this.onPointerLeave);
    this.host.remove();
  }
}

export default CssKeyboardScene;
