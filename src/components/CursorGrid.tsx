/**
 * CursorGrid — an interactive grid that lights up around the pointer.
 *
 * Adapted from the react-bits component (MIT + Commons Clause). The simulation
 * is CPU-side (a per-cell level driven by a hold-then-fade envelope) and the
 * rendering is a raw WebGL2 shader that draws the grid lines, cells and a
 * pointer spotlight in one pass, reading the cell state from an R8 texture.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

import './AmbientLayers.css';

const INTRO_SECONDS = 1.4;
const STYLES = { lines: 0, dashed: 1, dots: 2, crosses: 3 } as const;

const FALLOFF_CURVES = {
  linear: (t: number) => t,
  smooth: (t: number) => t * t * (3 - 2 * t),
  sharp: (t: number) => t * t * t
};

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uCellSize;
uniform sampler2D uState;
uniform ivec2 uCells;
uniform vec3 uColor;
uniform vec3 uGridColor;
uniform float uLineWidth;
uniform float uMaxOpacity;
uniform float uFillOpacity;
uniform float uGridOpacity;
uniform int uGridStyle;
uniform vec2 uMouse;
uniform float uRadius;
uniform float uSpotlight;
uniform float uPresence;
uniform float uEdgeFade;
uniform float uReveal;

out vec4 outColor;

float level(vec2 cell) {
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= float(uCells.x) || cell.y >= float(uCells.y)) return 0.0;
  float v = texelFetch(uState, ivec2(cell), 0).r;
  return v * v * (3.0 - 2.0 * v);
}

float line(float d, float width) {
  float w = max(width, 1.0);
  return clamp(w * 0.5 + 0.5 - d, 0.0, 1.0) * (width / w);
}

void main() {
  vec2 pos = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 g = (pos - uOffset) / uCellSize;
  vec2 cell = floor(g);
  vec2 f = g - cell;
  vec2 edge = min(f, 1.0 - f) * uCellSize;

  float vx = line(edge.x, uLineWidth);
  float vy = line(edge.y, uLineWidth);
  if (uGridStyle == 1) {
    float dash = uCellSize / 6.0;
    vx *= step(0.5, fract((pos.y - uOffset.y) / dash + 0.25));
    vy *= step(0.5, fract((pos.x - uOffset.x) / dash + 0.25));
  } else if (uGridStyle == 2) {
    float r = max(uLineWidth * 1.25, 1.2);
    float d = length(edge);
    vx = clamp(r + 0.5 - d, 0.0, 1.0);
    vy = 0.0;
  } else if (uGridStyle == 3) {
    float arm = uCellSize * 0.1 + uLineWidth;
    vx *= step(edge.y, arm);
    vy *= step(edge.x, arm);
  }
  float mark = max(vx, vy);

  vec2 toMouse = pos - uMouse;
  float spot = exp(-dot(toMouse, toMouse) / max(uRadius * uRadius, 1.0) * 1.6) * uSpotlight * uPresence;

  vec2 center = uResolution * 0.5;
  float reach = length(center);
  float shown = smoothstep(uReveal * (reach + uCellSize * 2.0), uReveal * (reach + uCellSize * 2.0) - uCellSize * 2.0, length(pos - center));
  shown = uReveal >= 1.0 ? 1.0 : shown;

  float fade = 1.0;
  if (uEdgeFade > 0.0) {
    vec2 norm = pos / uResolution;
    vec2 a = clamp(norm / uEdgeFade, 0.0, 1.0);
    vec2 b = clamp((1.0 - norm) / uEdgeFade, 0.0, 1.0);
    vec2 sa = a * a * a * (a * (a * 6.0 - 15.0) + 10.0);
    vec2 sb = b * b * b * (b * (b * 6.0 - 15.0) + 10.0);
    fade = sa.x * sa.y * sb.x * sb.y;
  }

  float own = level(cell);
  float gridAlpha = mark * min(uGridOpacity + spot * 0.45, 1.0) * fade * shown;
  float litAlpha = 0.0;
  float fillAlpha = own * uFillOpacity;
  if (own > 0.0) {
    if (uGridStyle == 2) {
      float r = max(uLineWidth * 1.25, 1.2);
      litAlpha = clamp(r + 0.5 - length(edge), 0.0, 1.0) * own * uMaxOpacity;
    } else if (uGridStyle == 3) {
      float arm = uCellSize * 0.1 + uLineWidth;
      litAlpha = max(step(edge.y, arm) * vx, step(edge.x, arm) * vy) * own * uMaxOpacity;
    } else {
      litAlpha = mark * own * uMaxOpacity;
    }
  }
  litAlpha *= fade;
  fillAlpha *= fade;

  float cellAlpha = clamp(max(litAlpha, fillAlpha), 0.0, 1.0);
  float alpha = cellAlpha + gridAlpha * (1.0 - cellAlpha);
  vec3 premul = uColor * cellAlpha + uGridColor * gridAlpha * (1.0 - cellAlpha);
  outColor = vec4(premul, alpha);
}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
};

const link = (gl: WebGL2RenderingContext) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = String(hex || '#ffffff')
    .replace('#', '')
    .trim();
  const full = h.length === 3 || h.length === 4 ? h.slice(0, 3).split('').map(c => c + c).join('') : h;
  const num = parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(num)) return [1, 1, 1];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
};

/** Resolve a CSS custom property to a hex colour the shader can use. */
const readVar = (name: string, fallback: string) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (raw.startsWith('#')) return raw;
  if (raw) {
    const probe = document.createElement('canvas').getContext('2d');
    if (probe) {
      probe.fillStyle = raw;
      return probe.fillStyle.startsWith('#') ? probe.fillStyle : fallback;
    }
  }
  return fallback;
};

export interface CursorGridProps {
  cellSize?: number;
  color?: string;
  gridColor?: string;
  radius?: number;
  falloff?: keyof typeof FALLOFF_CURVES;
  highlight?: 'area' | 'cell';
  holdTime?: number;
  fadeDuration?: number;
  lineWidth?: number;
  maxOpacity?: number;
  fillOpacity?: number;
  gridOpacity?: number;
  gridStyle?: keyof typeof STYLES;
  spotlight?: number;
  clickPulse?: boolean;
  pulseSpeed?: number;
  ambient?: number;
  edgeFade?: number;
  intro?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Renders as an absolutely-positioned layer; the parent supplies the box. Set
 * `pointer-events: none` is already on the canvas, so content above stays
 * interactive — the grid just watches the window pointer.
 */
export const CursorGrid = ({
  cellSize = 56,
  color,
  gridColor,
  radius = 150,
  falloff = 'smooth',
  highlight = 'area',
  holdTime = 320,
  fadeDuration = 900,
  lineWidth = 1,
  maxOpacity = 0.85,
  fillOpacity = 0.1,
  gridOpacity = 0.06,
  gridStyle = 'lines',
  spotlight = 0.5,
  clickPulse = true,
  pulseSpeed = 620,
  ambient = 0.16,
  edgeFade = 0.24,
  intro = true,
  className = '',
  style,
  children
}: CursorGridProps) => {
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
    const shader = link(gl);
    if (!shader) return undefined;
    const u = shader.uniforms;
    const vao = gl.createVertexArray();
    const stateTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, stateTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    /* The grid ink must follow the page theme. `--cursor-grid-ink` is not
       defined anywhere, so without a theme-aware fallback this resolved to
       white on both themes — on the dark scene that reads as a white haze. */
    const themeInk = () =>
      readVar('--cursor-grid-ink', document.documentElement.dataset.theme === 'light' ? '#565e73' : '#a8b0c2');
    const view = { width: 1, height: 1, ratio: 1, cellSize: 0 };
    const grid = { cols: 0, rows: 0, offX: 0, offY: 0 };
    const pointer = { x: 0, y: 0, inside: false };
    const mouse = { x: 0, y: 0 };
    const pulses: { x: number; y: number; t0: number; strength: number }[] = [];
    let levels = new Float32Array(0);
    let waves = new Float32Array(0);
    let targets = new Float32Array(0);
    let touched = new Float32Array(0);
    let pixels = new Uint8Array(0);
    let presence = 0;
    let clock = 0;
    let introClock = intro && !reduce ? 0 : 1;
    let raf = 0;
    let last = 0;
    let visible = true;
    let dirty = true;
    let alive = true;

    const rebuild = () => {
      const size = cellSize;
      view.width = Math.max(1, container.clientWidth);
      view.height = Math.max(1, container.clientHeight);
      view.ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(view.width * view.ratio));
      canvas.height = Math.max(1, Math.round(view.height * view.ratio));
      const cols = Math.ceil(view.width / size) + 1;
      const rows = Math.ceil(view.height / size) + 1;
      const resized = cols !== grid.cols || rows !== grid.rows || size !== view.cellSize;
      grid.cols = cols;
      grid.rows = rows;
      grid.offX = (view.width - cols * size) / 2;
      grid.offY = (view.height - rows * size) / 2;
      view.cellSize = size;
      if (resized) {
        levels = new Float32Array(cols * rows);
        waves = new Float32Array(cols * rows);
        targets = new Float32Array(cols * rows);
        touched = new Float32Array(cols * rows).fill(-1e9);
        pixels = new Uint8Array(cols * rows);
        gl.bindTexture(gl.TEXTURE_2D, stateTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, cols, rows, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
      }
      dirty = true;
    };

    const light = (index: number, value: number) => {
      if (value > targets[index]) targets[index] = value;
      touched[index] = clock;
    };

    const energize = (x: number, y: number) => {
      const size = cellSize;
      if (highlight === 'cell') {
        const col = Math.floor((x - grid.offX) / size);
        const row = Math.floor((y - grid.offY) / size);
        if (col >= 0 && row >= 0 && col < grid.cols && row < grid.rows) light(row * grid.cols + col, 1);
        return;
      }
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const minCol = Math.max(0, Math.floor((x - radius - grid.offX) / size));
      const maxCol = Math.min(grid.cols - 1, Math.floor((x + radius - grid.offX) / size));
      const minRow = Math.max(0, Math.floor((y - radius - grid.offY) / size));
      const maxRow = Math.min(grid.rows - 1, Math.floor((y + radius - grid.offY) / size));
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const cx = grid.offX + col * size + size / 2;
          const cy = grid.offY + row * size + size / 2;
          const dist = Math.hypot(cx - x, cy - y);
          if (dist > radius) continue;
          const value = ease(1 - dist / radius);
          if (value > 0) light(row * grid.cols + col, value);
        }
      }
    };

    const sweepPulses = () => {
      const size = cellSize;
      const ahead = size * 0.6;
      const behind = size * 1.4;
      const far = Math.hypot(view.width, view.height);
      waves.fill(0);
      for (let k = pulses.length - 1; k >= 0; k--) {
        const pulse = pulses[k];
        const ringR = (clock - pulse.t0) * pulseSpeed;
        if (ringR - behind * 2 > far) {
          pulses.splice(k, 1);
          continue;
        }
        if (ringR < 0) continue;
        const envelope = pulse.strength * Math.max(0, 1 - ringR / (far + behind)) ** 0.6;
        const outer = ringR + ahead * 2;
        const minCol = Math.max(0, Math.floor((pulse.x - outer - grid.offX) / size));
        const maxCol = Math.min(grid.cols - 1, Math.floor((pulse.x + outer - grid.offX) / size));
        const minRow = Math.max(0, Math.floor((pulse.y - outer - grid.offY) / size));
        const maxRow = Math.min(grid.rows - 1, Math.floor((pulse.y + outer - grid.offY) / size));
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const cx = grid.offX + col * size + size / 2;
            const cy = grid.offY + row * size + size / 2;
            const off = Math.hypot(cx - pulse.x, cy - pulse.y) - ringR;
            if (off > ahead * 2 || off < -behind * 2) continue;
            const t = off > 0 ? off / ahead : off / behind;
            const value = envelope * Math.exp(-t * t);
            const index = row * grid.cols + col;
            if (value > waves[index]) waves[index] = value;
          }
        }
      }
      dirty = true;
    };

    const draw = () => {
      const ratio = view.ratio;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(shader.program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, stateTexture);
      if (dirty) {
        for (let i = 0; i < levels.length; i++)
          pixels[i] = Math.round(clamp(Math.max(levels[i], waves[i]), 0, 1) * 255);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.cols, grid.rows, gl.RED, gl.UNSIGNED_BYTE, pixels);
        dirty = false;
      }
      const lineDevice = lineWidth * ratio;
      const snap = Math.round(lineDevice) % 2 === 1 ? 0.5 : 0;
      gl.uniform1i(u.uState, 0);
      gl.uniform2f(u.uResolution, canvas.width, canvas.height);
      gl.uniform2f(u.uOffset, Math.round(grid.offX * ratio) + snap, Math.round(grid.offY * ratio) + snap);
      gl.uniform1f(u.uCellSize, cellSize * ratio);
      gl.uniform2i(u.uCells, grid.cols, grid.rows);
      gl.uniform3fv(u.uColor, hexToRgb(color ?? themeInk()));
      gl.uniform3fv(u.uGridColor, hexToRgb(gridColor ?? themeInk()));
      gl.uniform1f(u.uLineWidth, lineDevice);
      gl.uniform1f(u.uMaxOpacity, maxOpacity);
      gl.uniform1f(u.uFillOpacity, fillOpacity);
      gl.uniform1f(u.uGridOpacity, gridOpacity);
      gl.uniform1i(u.uGridStyle, STYLES[gridStyle] ?? 0);
      gl.uniform2f(u.uMouse, mouse.x * ratio, mouse.y * ratio);
      gl.uniform1f(u.uRadius, radius * ratio);
      gl.uniform1f(u.uSpotlight, spotlight);
      gl.uniform1f(u.uPresence, presence);
      gl.uniform1f(u.uEdgeFade, edgeFade);
      gl.uniform1f(u.uReveal, introClock >= 1 ? 1 : 1 - (1 - introClock) ** 2.2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      const dt = last ? clamp((now - last) / 1000, 0, 1 / 20) : 1 / 60;
      last = now;
      clock += dt;
      if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS);

      const follow = 1 - Math.exp(-dt / 0.07);
      mouse.x += (pointer.x - mouse.x) * follow;
      mouse.y += (pointer.y - mouse.y) * follow;
      const presenceGoal = pointer.inside ? 1 : 0;
      presence += (presenceGoal - presence) * (1 - Math.exp(-dt / 0.25));

      if (ambient > 0 && !reduce && levels.length) {
        const chance = ambient * dt * levels.length * 0.04;
        let spawns = Math.floor(chance) + (Math.random() < chance % 1 ? 1 : 0);
        while (spawns-- > 0) light(Math.floor(Math.random() * levels.length), 0.22 + Math.random() * 0.4);
      }
      if (pulses.length) sweepPulses();
      else if (waves.length && waves.some(value => value > 0)) {
        waves.fill(0);
        dirty = true;
      }

      const holdSeconds = holdTime / 1000;
      const fadeStep = dt / (fadeDuration / 1000);
      const attack = 1 - Math.exp(-dt / 0.045);
      let active = pulses.length > 0 || introClock < 1 || Math.abs(presence - presenceGoal) > 0.002;
      for (let i = 0; i < levels.length; i++) {
        let target = targets[i];
        if (target <= 0 && levels[i] <= 0) continue;
        if (clock - touched[i] > holdSeconds) target = Math.max(0, target - fadeStep);
        targets[i] = target;
        const before = levels[i];
        const next = target > before ? before + (target - before) * attack : target;
        levels[i] = next < 0.002 ? 0 : next;
        if (levels[i] !== before) dirty = true;
        if (levels[i] > 0 || targets[i] > 0) active = true;
      }
      if (Math.abs(mouse.x - pointer.x) + Math.abs(mouse.y - pointer.y) > 0.05 && presence > 0.002) active = true;
      if (ambient > 0 && !reduce) active = true;

      draw();
      if (active) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (!raf && alive && visible && !document.hidden) {
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    const locate = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };

    const onPointerMove = (event: PointerEvent) => {
      const { x, y, inside } = locate(event);
      const was = pointer.inside;
      pointer.inside = inside;
      if (!inside) {
        if (was) wake();
        return;
      }
      pointer.x = x;
      pointer.y = y;
      if (!was) {
        mouse.x = x;
        mouse.y = y;
      }
      energize(x, y);
      wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      const { x, y, inside } = locate(event);
      if (!inside || !clickPulse || reduce) return;
      pulses.push({ x, y, t0: clock, strength: 1 });
      wake();
    };

    const onPointerLeave = () => {
      pointer.inside = false;
      wake();
    };

    const onVisibility = () => wake();

    const resizeObserver = new ResizeObserver(() => {
      rebuild();
      draw();
      wake();
    });
    resizeObserver.observe(container);
    const intersection = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) wake();
    });
    intersection.observe(container);
    /* Follow the page theme: re-resolve the ink uniform when `data-theme`
       flips, then wake so the next frame already paints the new colour. */
    const themeObserver = new MutationObserver(() => wake());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    rebuild();
    if (introClock < 1) pulses.push({ x: view.width / 2, y: view.height / 2, t0: 0.15, strength: 0.6 });
    draw();
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteTexture(stateTexture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(shader.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [cellSize, color, gridColor, radius, falloff, highlight, holdTime, fadeDuration, lineWidth, maxOpacity, fillOpacity, gridOpacity, gridStyle, spotlight, clickPulse, pulseSpeed, ambient, edgeFade, intro]);

  return (
    <div ref={containerRef} className={`cursor-grid ${className}`.trim()} style={style}>
      <canvas ref={canvasRef} className="cursor-grid__canvas" aria-hidden="true" />
      {children ? <div className="cursor-grid__content">{children}</div> : null}
    </div>
  );
};

export default CursorGrid;
