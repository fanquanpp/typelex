/**
 * Liquid Glass surface.
 *
 * A real glass material, not just a blur: the rim refracts what is behind it,
 * with per-channel displacement so edges pick up a slight chromatic fringe.
 *
 * How it works (the technique is the same one Apple's Liquid Glass uses):
 *
 *   1. A signed distance field of the rounded rectangle is rasterised to a
 *      canvas — no tracing or distance transform needed, the rounded-rect SDF is
 *      analytic: `length(max(|p| - (half - r), 0)) - r`.
 *   2. That field is blurred and its gradient taken. The gradient points inward,
 *      so it becomes a displacement vector: zero in the middle of the panel
 *      (the interior should be a clean blur) and strongest in a narrow band at
 *      the border (where glass actually bends light).
 *   3. The vector is encoded into an RGB image — R = dx, G = dy, B = flat — and
 *      fed to an SVG filter as `feImage`.
 *   4. The filter runs three `feDisplacementMap` passes over the same map with
 *      different scales, isolates one channel from each with `feColorMatrix`,
 *      and screens them back together. That per-channel offset *is* the
 *      chromatic aberration at the edge.
 *   5. `backdrop-filter: url(#id) saturate(...)` applies the whole thing to
 *      whatever is painted behind the element.
 *
 * Chrome/Edge support `url()` in `backdrop-filter`; Safari and Firefox do not,
 * so those fall back to a layered blur+sheen+rim that keeps the material
 * readable. The map is generated once per corner radius and shared, because it
 * is a smooth field and stretching it is visually indistinguishable from
 * regenerating it per element.
 */
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import './GlassSurface.css';

/** Longest edge of the generated displacement map, in pixels. */
const MAP_MAX = 384;

const settle = (x: number) => 1 / (1 + Math.exp(-1.702 * x));

const roundedRectSdf = (px: number, py: number, hw: number, hh: number, r: number) => {
  const radius = Math.max(0, Math.min(r, hw, hh));
  const qx = Math.abs(px) - (hw - radius);
  const qy = Math.abs(py) - (hh - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
};

const blurLine = (src: Float32Array, dst: Float32Array, offset: number, stride: number, n: number, r: number) => {
  const scale = 1 / (2 * r + 1);
  let sum = src[offset] * (r + 1);
  for (let i = 1; i <= r; i++) sum += src[offset + Math.min(i, n - 1) * stride];
  for (let i = 0; i < n; i++) {
    dst[offset + i * stride] = sum * scale;
    sum += src[offset + Math.min(i + r + 1, n - 1) * stride] - src[offset + Math.max(i - r, 0) * stride];
  }
};

const blurGrid = (grid: Float32Array, w: number, h: number, r: number) => {
  if (r < 1) return;
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) blurLine(grid, tmp, y * w, 1, w, r);
    for (let x = 0; x < w; x++) blurLine(tmp, grid, x, w, h, r);
  }
};

interface MapOptions {
  /** corner radius in map pixels */
  radius: number;
  /** width of the refracting band, as a fraction of the shorter side */
  borderWidth: number;
  /** softness of the band falloff, in map pixels */
  softness: number;
}

const mapCache = new Map<string, string>();

/** Build the displacement map for one corner radius, as a data URL. */
const buildDisplacementMap = (options: MapOptions): string | null => {
  const key = `${options.radius.toFixed(1)}|${options.borderWidth}|${options.softness}`;
  const cached = mapCache.get(key);
  if (cached) return cached;

  const w = MAP_MAX;
  const h = MAP_MAX;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const hw = w / 2;
  const hh = h / 2;
  const depth = new Float32Array(w * h);
  const edge = Math.min(w, h) * options.borderWidth * 0.5;
  const reach = edge + options.softness * 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      /* positive inside, negative outside — matching the field the gradient needs */
      const sd = roundedRectSdf(x + 0.5 - hw, y + 0.5 - hh, hw, hh, options.radius);
      depth[y * w + x] = -sd;
    }
  }

  const field = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) field[i] = Math.min(Math.max(depth[i], -6), reach);
  blurGrid(field, w, h, Math.max(1, Math.round(Math.max(1.5, options.softness * 0.35))));

  const image = ctx.createImageData(w, h);
  /* `calm` keeps the interior perfectly flat so only the border refracts. */
  const calm = 0.93;
  const bend = 0.25;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const dx = field[i + (x < w - 1 ? 1 : 0)] - field[i - (x > 0 ? 1 : 0)];
      const dy = field[i + (y < h - 1 ? w : 0)] - field[i - (y > 0 ? w : 0)];
      const still = calm * settle((depth[i] - edge) / options.softness);
      const amount = (1 - still) * bend;
      image.data[i * 4] = Math.max(0, Math.min(255, 255 * (0.5 + dx * amount)));
      image.data[i * 4 + 1] = Math.max(0, Math.min(255, 255 * (0.5 + dy * amount)));
      image.data[i * 4 + 2] = 128;
      image.data[i * 4 + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL();
  mapCache.set(key, url);
  return url;
};

/** Whether this browser can run an SVG filter inside backdrop-filter. */
let refractionSupported: boolean | null = null;
const canRefract = () => {
  if (refractionSupported !== null) return refractionSupported;
  refractionSupported =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    (CSS.supports('backdrop-filter', 'url(#x)') || CSS.supports('-webkit-backdrop-filter', 'url(#x)'));
  return refractionSupported;
};

export interface GlassSurfaceProps {
  children?: ReactNode;
  /** corner radius in px — keep it crisp, this is not a pill */
  radius?: number;
  /** width of the refracting rim, as a fraction of the shorter side */
  borderWidth?: number;
  /** how far the rim pulls the backdrop, in px */
  displace?: number;
  /** blur applied to the backdrop, in px */
  blur?: number;
  saturation?: number;
  brightness?: number;
  /** strength of the chromatic fringe at the rim */
  aberration?: number;
  /** the specular sheen across the glass */
  sheen?: boolean;
  /** force the non-refracting fallback */
  plain?: boolean;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'section' | 'aside' | 'header' | 'nav' | 'article' | 'li';
  interactive?: boolean;
}

export const GlassSurface = ({
  children,
  radius = 14,
  borderWidth = 0.07,
  displace = 0,
  blur = 14,
  saturation = 1.8,
  brightness = 1.06,
  aberration = 14,
  sheen = true,
  plain = false,
  className = '',
  style,
  as = 'div',
  interactive = false
}: GlassSurfaceProps) => {
  const rawId = useId();
  const filterId = useMemo(() => `glass-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`, [rawId]);
  const imageRef = useRef<SVGFEImageElement | null>(null);
  const redRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const greenRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const blueRef = useRef<SVGFEDisplacementMapElement | null>(null);
  const blurRef = useRef<SVGFEGaussianBlurElement | null>(null);
  const [refractive, setRefractive] = useState(false);

  useEffect(() => {
    if (plain) return;
    setRefractive(canRefract());
  }, [plain]);

  useEffect(() => {
    if (!refractive) return;
    /* The map is generated at a fixed resolution and stretched, so a softness of
       ~2.4 map-pixels is what reads as a glass edge at any element size. */
    const url = buildDisplacementMap({ radius, borderWidth, softness: 2.4 });
    if (!url) {
      setRefractive(false);
      return;
    }
    imageRef.current?.setAttribute('href', url);
    /* Per-channel scales: a small spread between them is the chromatic fringe.
       Too much and the rim looks like a printing misregistration. */
    redRef.current?.setAttribute('scale', String(displace + aberration * 0.5));
    greenRef.current?.setAttribute('scale', String(displace + aberration));
    blueRef.current?.setAttribute('scale', String(displace + aberration * 1.5));
    blurRef.current?.setAttribute('stdDeviation', '0.6');
  }, [refractive, radius, borderWidth, displace, aberration]);

  const Tag = as;
  const styleVars = {
    '--glass-radius': `${radius}px`,
    '--glass-blur': `${blur}px`,
    '--glass-sat': saturation,
    '--glass-bright': brightness,
    ...style
  } as CSSProperties;

  return (
    <Tag
      className={`glass-surface ${refractive ? 'glass-surface--refract' : 'glass-surface--plain'} ${
        interactive ? 'glass-surface--interactive' : ''
      } ${className}`.trim()}
      style={styleVars}
    >
      {refractive && (
        <svg className="glass-surface__defs" aria-hidden="true" focusable="false">
          <defs>
            <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
              <feImage ref={imageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
              <feDisplacementMap ref={redRef} in="SourceGraphic" in2="map" result="dispRed" />
              <feColorMatrix
                in="dispRed"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="red"
              />
              <feDisplacementMap ref={greenRef} in="SourceGraphic" in2="map" result="dispGreen" />
              <feColorMatrix
                in="dispGreen"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="green"
              />
              <feDisplacementMap ref={blueRef} in="SourceGraphic" in2="map" result="dispBlue" />
              <feColorMatrix
                in="dispBlue"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="out" />
              <feGaussianBlur ref={blurRef} in="out" stdDeviation="0.6" />
            </filter>
          </defs>
        </svg>
      )}
      {refractive && <span className="glass-surface__backdrop" style={{ backdropFilter: `url(#${filterId}) saturate(${saturation}) brightness(${brightness})` }} aria-hidden="true" />}
      <span className="glass-surface__tint" aria-hidden="true" />
      {sheen && <span className="glass-surface__sheen" aria-hidden="true" />}
      <span className="glass-surface__rim" aria-hidden="true" />
      <span className="glass-surface__content">{children}</span>
    </Tag>
  );
};

export default GlassSurface;
