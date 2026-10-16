/**
 * LetterGlitch — a field of monospace glyphs that scrambles and glows.
 *
 * Adapted from the react-bits component (MIT + Commons Clause): a canvas2D
 * glyph atlas plus an RGBA8 state texture (glyph index, rest level, heat,
 * colour slot) driven by a CPU simulation, rendered by a one-pass WebGL2
 * shader. A few soft "walkers" ignite trails of glitched cells, which reads far
 * more organic than per-cell random flicker.
 *
 * Used here as a faint ambient layer behind the hero panel only — behind body
 * text it would be noise.
 */
import { useEffect, useRef, type CSSProperties } from 'react';

import './AmbientLayers.css';

const DEFAULT_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789';
const MAX_COLORS = 8;
const INTRO_SECONDS = 1.4;
const REST_RATE = 0.2;
const GLITCH_RATE = 0.1;
const MAX_WALKERS = 40;

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uAtlas;
uniform sampler2D uState;
uniform ivec2 uCell;
uniform ivec2 uGrid;
uniform int uAtlasColumns;
uniform vec2 uResolution;
uniform vec2 uOrigin;
uniform vec3 uBase;
uniform float uBaseOpacity;
uniform vec3 uColors[8];
uniform float uEdge;
uniform float uCenter;
uniform vec2 uPointer;
uniform float uRadius;
uniform float uPresence;
uniform float uReveal;
uniform float uTime;
uniform float uFlow;
uniform float uFlowScale;
out vec4 outColor;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

float smoother(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) - uOrigin;
  ivec2 q = ivec2(floor(frag));
  ivec2 cell = q / uCell;
  vec4 color = vec4(0.0);
  if (all(greaterThanEqual(q, ivec2(0))) && all(lessThan(cell, uGrid))) {
    vec4 state = texelFetch(uState, cell, 0);
    int glyph = int(state.r * 255.0 + 0.5);
    ivec2 texel = ivec2(glyph % uAtlasColumns, glyph / uAtlasColumns) * uCell + (q - cell * uCell);
    float coverage = texelFetch(uAtlas, texel, 0).a;
    if (coverage > 0.0) {
      vec2 center = vec2(cell * uCell) + vec2(uCell) * 0.5 + uOrigin;
      float mask = 1.0;
      if (uEdge > 0.0) {
        vec2 edge = min(center, uResolution - center) / uEdge;
        mask = smoother(edge.x) * smoother(edge.y);
      }
      if (uCenter > 0.0) {
        vec2 room = max(abs(center - uResolution * 0.5) - uResolution * vec2(0.3, 0.24), 0.0);
        float soft = min(uResolution.x, uResolution.y) * 0.24;
        mask *= 1.0 - uCenter * (1.0 - smoother(length(room) / soft));
      }
      float seed = hash(vec2(cell) + 17.0);
      float rest = state.g * uBaseOpacity * (0.8 + 0.2 * sin(uTime * (0.5 + 1.2 * seed) + seed * 40.0));
      if (uFlow > 0.0) {
        vec2 p = center / uFlowScale;
        float n = 0.65 * noise(p + vec2(uTime * 0.05, uTime * 0.03)) + 0.35 * noise(p * 2.03 - vec2(uTime * 0.04, -uTime * 0.06));
        rest *= mix(1.0, 0.1 + 1.7 * smoothstep(0.25, 0.8, n), uFlow);
      }
      if (uPresence > 0.0) {
        float d = length(center - uPointer) / uRadius;
        float f = clamp(1.0 - d * d, 0.0, 1.0);
        rest = mix(rest, max(rest, uReveal * step(0.004, state.g)), f * f * uPresence);
      }
      float heat = state.b;
      rest = min(rest, 1.0) * (1.0 - heat);
      vec3 tint = uColors[int(state.a * 255.0 + 0.5)];
      float weight = coverage * mask;
      color = vec4((uBase * rest + tint * heat) * weight, (rest + heat) * weight);
    }
  }
  outColor = color;
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoother = (value: number) => {
  const x = clamp(value, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

interface Walker {
  x: number;
  y: number;
  angle: number;
  life: number;
  span: number;
  speed: number;
  color: number;
  carry: number;
  after: number;
  wiggle: number;
  branch: number;
}

export interface LetterGlitchProps {
  glitchColors?: string[];
  baseColor?: string;
  characters?: string;
  fontSize?: number;
  spacing?: number;
  density?: number;
  baseOpacity?: number;
  glitchAmount?: number;
  speed?: number;
  interactive?: boolean;
  cursorRadius?: number;
  flow?: number;
  edgeFade?: number;
  centerFade?: number;
  className?: string;
  style?: CSSProperties;
}

/* Theme-aware defaults: the glyph field sits on the colour backdrop, so its
   base ink must follow the page's `data-theme` — a light base on the dark
   scene lifts the whole page into a white haze (the bug that shipped once). */
const readThemeName = () =>
  document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

const THEME_PALETTE: Record<'light' | 'dark', { colors: string[]; base: string }> = {
  dark: {
    colors: ['#5f6d85', '#7d8ba3', '#4d5a70', '#8b97ad'],
    base: '#2a3346'
  },
  light: {
    colors: ['#7ef0dc', '#b7a6ff', '#7fb4ff', '#ffffff'],
    base: '#c8d2e4'
  }
};

export const LetterGlitch = ({
  glitchColors,
  baseColor,
  characters = DEFAULT_CHARACTERS,
  fontSize = 14,
  spacing = 0.6,
  density = 0.82,
  baseOpacity = 0.14,
  glitchAmount = 0.34,
  speed = 1,
  interactive = true,
  cursorRadius = 150,
  flow = 0.4,
  edgeFade = 0.3,
  centerFade = 0.35,
  className = '',
  style
}: LetterGlitchProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false
    });
    if (!container || !canvas || !gl) return undefined;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return undefined;
    }
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
    }
    const u = uniforms;
    const vao = gl.createVertexArray();
    const makeTexture = () => {
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    };
    const atlasTexture = makeTexture();
    const stateTexture = makeTexture();
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const atlas = document.createElement('canvas');
    const atlasContext = atlas.getContext('2d');
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!atlasContext) return undefined;

    const themeName = readThemeName();
    const fallbackPalette = THEME_PALETTE[themeName];
    const palette = fallbackPalette.colors.slice(0, MAX_COLORS);
    const colors = glitchColors ?? palette;
    const base = baseColor ?? fallbackPalette.base;

    const parse = (value: string): [number, number, number] => {
      if (probe) {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#ffffff';
        probe.fillStyle = value;
        probe.fillRect(0, 0, 1, 1);
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
        return [r / 255, g / 255, b / 255];
      }
      return [1, 1, 1];
    };

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const view = { width: 1, height: 1, ratio: 1 };
    const grid = { cols: 0, rows: 0, cellW: 0, cellH: 0, originX: 0, originY: 0, atlasColumns: 1 };
    const pointer = { x: 0, y: 0, sx: 0, sy: 0, inside: false, presence: 0, stir: 0, fresh: true };
    const walkers: Walker[] = [];
    let pool: number[] = [0];
    let typeKey = '';
    let colorCount = colors.length;
    let count = 0;
    let data = new Uint8Array(0);
    let heat = new Float32Array(0);
    let peak = new Float32Array(0);
    let hold = new Float32Array(0);
    let fade = new Float32Array(0);
    let wait = new Float32Array(0);
    let delay = new Float32Array(0);
    let luck = new Float32Array(0);
    let level = new Float32Array(0);
    let born = new Float32Array(0);
    let slot = new Int32Array(0);
    let active = new Int32Array(0);
    let activeCount = 0;
    let introLeft = !reduce;
    let clock = 0;
    let time = 0;
    let restCarry = 0;
    let glitchCarry = 0;
    let cursorCarry = 0;
    let dirty = true;
    let raf = 0;
    let last = 0;
    let visible = true;
    let alive = true;

    const randomGlyph = () => pool[(Math.random() * pool.length) | 0];
    const randomColor = () => (Math.random() * colorCount) | 0;
    const restValue = (i: number, appear = 1) =>
      luck[i] < density ? Math.round(level[i] * 255 * appear) : 0;

    const cellAt = (x: number, y: number) => {
      const c = Math.floor((x - grid.originX) / grid.cellW);
      const r = Math.floor((y - grid.originY) / grid.cellH);
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return -1;
      return r * grid.cols + c;
    };

    const ignite = (i: number, strength: number, holdTime: number, fadeTime: number, color: number, after = 0) => {
      if (slot[i] < 0) {
        slot[i] = activeCount;
        active[activeCount++] = i;
        heat[i] = 0;
        hold[i] = holdTime;
        peak[i] = strength;
        fade[i] = fadeTime;
        wait[i] = 0;
        delay[i] = after;
        data[i * 4 + 3] = color;
        return;
      }
      if (heat[i] < 0.15) data[i * 4 + 3] = color;
      peak[i] = hold[i] > 0 ? Math.max(peak[i], strength) : strength;
      hold[i] = Math.max(hold[i], holdTime);
      fade[i] = Math.max(fade[i], fadeTime);
      delay[i] = Math.min(delay[i], after);
    };

    const release = (k: number) => {
      const i = active[k];
      const moved = active[--activeCount];
      active[k] = moved;
      slot[moved] = k;
      slot[i] = -1;
      heat[i] = 0;
      data[i * 4 + 2] = 0;
    };

    const addWalker = (walker: Partial<Walker> & Pick<Walker, 'x' | 'y' | 'angle' | 'life' | 'span' | 'speed' | 'color'>) => {
      if (walkers.length < MAX_WALKERS) {
        walkers.push({ carry: 0, after: 0, wiggle: 0, branch: 0, ...walker });
      }
    };

    const buildType = () => {
      const size = fontSize * view.ratio;
      const font = `${size}px "JetBrains Mono Variable", ui-monospace, monospace`;
      const unique = Array.from(new Set(Array.from(characters))).slice(0, 256);
      atlasContext.font = font;
      let advance = 1;
      unique.forEach(char => {
        advance = Math.max(advance, atlasContext.measureText(char).width);
      });
      const metrics = atlasContext.measureText('M');
      const cellW = Math.max(2, Math.ceil(advance + size * spacing));
      const cellH = Math.max(2, Math.ceil(size * (0.95 + spacing)));
      const columns = Math.max(1, Math.min(unique.length, Math.floor(maxSize / cellW)));
      atlas.width = columns * cellW;
      atlas.height = Math.ceil(unique.length / columns) * cellH;
      atlasContext.font = font;
      atlasContext.textAlign = 'center';
      atlasContext.textBaseline = 'alphabetic';
      atlasContext.fillStyle = '#ffffff';
      const baseline = cellH / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      unique.forEach((char, i) => {
        atlasContext.fillText(char, (i % columns) * cellW + cellW / 2, Math.floor(i / columns) * cellH + baseline);
      });
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      const lookup = new Map(unique.map((char, i) => [char, i]));
      const nextPool = Array.from(characters)
        .map(char => lookup.get(char))
        .filter((index): index is number => index !== undefined);
      pool = nextPool.length ? nextPool : [0];
      const resized = cellW !== grid.cellW || cellH !== grid.cellH;
      grid.cellW = cellW;
      grid.cellH = cellH;
      grid.atlasColumns = columns;
      return resized;
    };

    const buildGrid = () => {
      const cols = Math.ceil(canvas.width / grid.cellW) + 1;
      const rows = Math.ceil(canvas.height / grid.cellH) + 1;
      grid.originX = Math.floor((canvas.width - cols * grid.cellW) / 2);
      grid.originY = Math.floor((canvas.height - rows * grid.cellH) / 2);
      const n = cols * rows;
      const nextData = new Uint8Array(n * 4);
      const nextLuck = new Float32Array(n);
      const nextLevel = new Float32Array(n);
      const nextBorn = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        nextData[i * 4] = randomGlyph();
        nextLuck[i] = Math.random();
        nextLevel[i] = 0.55 + 0.45 * Math.random();
        nextBorn[i] = introLeft
          ? INTRO_SECONDS * (0.3 * Math.min(1, Math.hypot((i % cols) / cols - 0.5, Math.floor(i / cols) / rows - 0.5) * 1.6) + 0.7 * Math.random() ** 1.3)
          : -1;
      }
      grid.cols = cols;
      grid.rows = rows;
      count = n;
      data = nextData;
      luck = nextLuck;
      level = nextLevel;
      born = nextBorn;
      heat = new Float32Array(n);
      peak = new Float32Array(n);
      hold = new Float32Array(n);
      fade = new Float32Array(n);
      wait = new Float32Array(n);
      delay = new Float32Array(n);
      slot = new Int32Array(n).fill(-1);
      active = new Int32Array(n);
      activeCount = 0;
      walkers.length = 0;
      for (let i = 0; i < n; i++) data[i * 4 + 1] = born[i] >= 0 ? 0 : restValue(i);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      dirty = false;
    };

    const stepWalkers = (dt: number) => {
      for (let k = walkers.length - 1; k >= 0; k--) {
        const w = walkers[k];
        if (w.after > 0) {
          w.after -= dt;
          continue;
        }
        const step = Math.max(
          1,
          Math.abs(Math.cos(w.angle)) * grid.cellW + Math.abs(Math.sin(w.angle)) * grid.cellH * 0.6
        );
        w.carry += w.speed * dt;
        while (w.carry >= step && w.life > 0) {
          w.carry -= step;
          w.life -= step;
          w.angle += (Math.random() - 0.5) * w.wiggle;
          w.x += Math.cos(w.angle) * step;
          w.y += Math.sin(w.angle) * step;
          const i = cellAt(w.x, w.y);
          if (i < 0) {
            w.life = 0;
            break;
          }
          const left = w.life / w.span;
          ignite(i, 0.5 + 0.5 * left, 0.03 + Math.random() * 0.05, 0.5 + 0.5 * left, w.color);
          if (w.branch && Math.random() < w.branch) {
            const side = Math.random() < 0.5 ? -1 : 1;
            const life = w.life * (0.45 + Math.random() * 0.3);
            addWalker({
              x: w.x,
              y: w.y,
              angle: w.angle + side * (0.5 + Math.random() * 0.5),
              life,
              span: w.span,
              speed: w.speed,
              wiggle: w.wiggle,
              color: w.color
            });
          }
        }
        if (w.life <= 0) walkers.splice(k, 1);
      }
    };

    const ambient = (dt: number) => {
      if (reduce || speed <= 0 || !count) return;
      restCarry += count * REST_RATE * speed * dt;
      let changes = Math.min(count, restCarry | 0);
      restCarry -= changes;
      while (changes-- > 0) {
        const i = (Math.random() * count) | 0;
        if (slot[i] < 0) {
          data[i * 4] = randomGlyph();
          dirty = true;
        }
      }
      const tempo = Math.max(speed, 0.2);
      glitchCarry += count * glitchAmount ** 1.6 * GLITCH_RATE * speed * dt;
      let events = Math.min(count, glitchCarry | 0);
      glitchCarry -= events;
      while (events-- > 0) {
        const i = (Math.random() * count) | 0;
        const color = randomColor();
        const strength = 0.4 + 0.5 * Math.random();
        const holdTime = (0.04 + Math.random() * 0.26) / tempo;
        const fadeTime = (0.45 + Math.random() * 0.6) / tempo;
        const roll = Math.random();
        if (roll < 0.2) {
          const c = i % grid.cols;
          const length = Math.min(grid.cols - c, 2 + ((Math.random() * 7) | 0));
          const pace = 0.028 / tempo;
          for (let k = 0; k < length; k++) ignite(i + k, strength, holdTime, fadeTime, color, k * pace);
        } else {
          ignite(i, strength, holdTime, fadeTime, color);
        }
      }
    };

    const excite = (dt: number) => {
      if (pointer.presence < 0.02 || reduce || !count) return;
      const radius = cursorRadius * view.ratio;
      if (radius < 1) return;
      const c0 = Math.max(0, Math.floor((pointer.sx - radius - grid.originX) / grid.cellW));
      const c1 = Math.min(grid.cols - 1, Math.floor((pointer.sx + radius - grid.originX) / grid.cellW));
      const r0 = Math.max(0, Math.floor((pointer.sy - radius - grid.originY) / grid.cellH));
      const r1 = Math.min(grid.rows - 1, Math.floor((pointer.sy + radius - grid.originY) / grid.cellH));
      const chance = pointer.presence * (3 + 9 * pointer.stir) * dt;
      for (let r = r0; r <= r1; r++) {
        const dy = (grid.originY + (r + 0.5) * grid.cellH - pointer.sy) / radius;
        for (let c = c0; c <= c1; c++) {
          const dx = (grid.originX + (c + 0.5) * grid.cellW - pointer.sx) / radius;
          const d = dx * dx + dy * dy;
          if (d >= 1) continue;
          const i = r * grid.cols + c;
          if (slot[i] < 0 && Math.random() < (1 - d) * (1 - d) * chance) {
            data[i * 4] = randomGlyph();
            dirty = true;
          }
        }
      }
      const cells = (Math.PI * radius * radius) / (grid.cellW * grid.cellH);
      cursorCarry += cells * pointer.presence * (0.15 + 4 * pointer.stir) * dt;
      let sparks = Math.min(512, cursorCarry | 0);
      cursorCarry -= sparks;
      while (sparks-- > 0) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.sqrt(Math.random());
        const falloff = (1 - distance * distance) ** 2;
        if (Math.random() > falloff) continue;
        const i = cellAt(pointer.sx + Math.cos(angle) * distance * radius, pointer.sy + Math.sin(angle) * distance * radius);
        if (i < 0) continue;
        ignite(
          i,
          (0.3 + 0.7 * Math.random()) * (0.45 + 0.55 * pointer.stir),
          0.02 + Math.random() * 0.08,
          0.35 + Math.random() * 0.4,
          randomColor()
        );
      }
    };

    const settle = (dt: number) => {
      const tempo = Math.max(speed, 0.5);
      const attack = 1 - Math.exp(-dt / 0.05);
      for (let k = 0; k < activeCount; ) {
        const i = active[k];
        if (delay[i] > 0) {
          delay[i] -= dt;
          k++;
          continue;
        }
        let h = heat[i];
        if (hold[i] > 0) {
          hold[i] -= dt;
          h = h + (peak[i] - h) * attack;
        } else {
          h = h * Math.exp((-dt * 4) / Math.max(fade[i], 0.05));
        }
        if (h < 0.012 && hold[i] <= 0) {
          release(k);
          dirty = true;
          continue;
        }
        heat[i] = h;
        wait[i] -= dt;
        if (wait[i] <= 0) {
          data[i * 4] = randomGlyph();
          wait[i] = ((0.045 + 0.45 * (1 - h) * (1 - h)) * (0.6 + 0.8 * Math.random())) / tempo;
        }
        data[i * 4 + 2] = Math.round(h * 255);
        dirty = true;
        k++;
      }
    };

    const reveal = (dt: number) => {
      if (!introLeft) return;
      let pending = false;
      for (let i = 0; i < count; i++) {
        const t = born[i];
        if (t < 0) continue;
        const age = clock - t;
        if (age < 0) {
          pending = true;
          continue;
        }
        if (age < dt && Math.random() < (luck[i] < density ? 0.45 : 0.12)) {
          ignite(i, 0.4 + 0.5 * Math.random(), 0.02, 0.35 + Math.random() * 0.35, randomColor());
        }
        const appear = smoother(age / 0.35);
        data[i * 4 + 1] = restValue(i, appear);
        if (appear >= 1) born[i] = -1;
        else pending = true;
      }
      dirty = true;
      if (!pending) introLeft = false;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const dt = last ? clamp((now - last) / 1000, 0.0005, 0.05) : 1 / 60;
      last = now;
      clock += dt;
      if (!reduce) time += dt * speed;
      const key = `${fontSize * view.ratio}|${spacing}|${characters}`;
      if (key !== typeKey) {
        typeKey = key;
        const resized = buildType();
        if (resized || !grid.cols) buildGrid();
      }
      const goal = interactive && pointer.inside && !reduce ? 1 : 0;
      pointer.presence += (goal - pointer.presence) * (1 - Math.exp(-dt / 0.25));
      const px = pointer.sx;
      const py = pointer.sy;
      const follow = 1 - Math.exp(-dt / 0.07);
      pointer.sx += (pointer.x - pointer.sx) * follow;
      pointer.sy += (pointer.y - pointer.sy) * follow;
      const moved = Math.hypot(pointer.sx - px, pointer.sy - py) / view.ratio / dt;
      pointer.stir += (clamp(moved / 1400, 0, 1) - pointer.stir) * (1 - Math.exp(-dt / 0.12));
      if (pointer.stir < 0.001) pointer.stir = 0;
      reveal(dt);
      ambient(dt);
      excite(dt);
      stepWalkers(dt);
      settle(dt);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.BLEND);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      if (dirty) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.cols, grid.rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
        dirty = false;
      }
      gl.uniform1i(u.uState, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
      gl.uniform1i(u.uAtlas, 0);
      gl.uniform2i(u.uCell, grid.cellW, grid.cellH);
      gl.uniform2i(u.uGrid, grid.cols, grid.rows);
      gl.uniform1i(u.uAtlasColumns, grid.atlasColumns);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform2f(u.uOrigin, grid.originX, grid.originY);
      gl.uniform3fv(u.uBase, parse(base));
      gl.uniform1f(u.uBaseOpacity, baseOpacity);
      const paletteFloat = new Float32Array(MAX_COLORS * 3);
      colors.slice(0, MAX_COLORS).forEach((color, i) => {
        const [r, g, b] = parse(color);
        paletteFloat[i * 3] = r;
        paletteFloat[i * 3 + 1] = g;
        paletteFloat[i * 3 + 2] = b;
      });
      gl.uniform3fv(u.uColors, paletteFloat);
      gl.uniform1f(u.uEdge, edgeFade * Math.min(canvas.width, canvas.height));
      gl.uniform1f(u.uCenter, centerFade);
      gl.uniform2f(u.uPointer, pointer.sx, pointer.sy);
      gl.uniform1f(u.uRadius, Math.max(1, cursorRadius * view.ratio));
      gl.uniform1f(u.uPresence, pointer.presence);
      gl.uniform1f(u.uReveal, Math.min(1, baseOpacity * 3.5));
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uFlow, flow);
      gl.uniform1f(u.uFlowScale, Math.max(canvas.width, canvas.height) * 0.32);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const busy =
        (!reduce && speed > 0) ||
        activeCount > 0 ||
        walkers.length > 0 ||
        introLeft ||
        (pointer.presence !== 0 && pointer.presence !== 1) ||
        pointer.stir > 0;
      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const wake = () => {
      if (!raf && alive && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const resize = () => {
      view.width = Math.max(1, container.clientWidth);
      view.height = Math.max(1, container.clientHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      typeKey = '';
      const resized = buildType();
      if (resized || !grid.cols) buildGrid();
      wake();
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer.inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      pointer.x = x * view.ratio;
      pointer.y = y * view.ratio;
      if (pointer.fresh || pointer.presence < 0.02) {
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
        pointer.fresh = false;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      locate(event);
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(container);
    /* Follow the page theme: re-resolve the palette uniforms when `data-theme`
       flips, then wake so the change is on screen within a frame. */
    const themeObserver = new MutationObserver(() => {
      const next = THEME_PALETTE[readThemeName()];
      const palette = (glitchColors ?? next.colors).slice(0, MAX_COLORS);
      const paletteFloat = new Float32Array(MAX_COLORS * 3);
      palette.forEach((color, i) => {
        const [r, g, b] = parse(color);
        paletteFloat[i * 3] = r;
        paletteFloat[i * 3 + 1] = g;
        paletteFloat[i * 3 + 2] = b;
      });
      gl.uniform3fv(u.uBase, parse(baseColor ?? next.base));
      gl.uniform3fv(u.uColors, paletteFloat);
      wake();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    resize();
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      gl.deleteTexture(atlasTexture);
      gl.deleteTexture(stateTexture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [glitchColors, baseColor, characters, fontSize, spacing, density, baseOpacity, glitchAmount, speed, interactive, cursorRadius, flow, edgeFade, centerFade]);

  return (
    <div ref={containerRef} className={`letter-glitch ${className}`.trim()} style={style} aria-hidden="true">
      <canvas ref={canvasRef} className="letter-glitch__canvas" />
    </div>
  );
};

export default LetterGlitch;
