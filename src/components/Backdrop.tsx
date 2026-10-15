/**
 * Backdrop — the colour the glass refracts.
 *
 * Frosted glass only reads as glass if there is something worth blurring behind
 * it, and the previous build had an almost-black page, which is why every panel
 * looked like a flat grey box. This is a single full-screen shader pass that
 * layers two cheap fields:
 *
 *   - an **iridescent iterator field** (the "tixy" trick): two accumulators fed
 *     back into each other inside a short loop produce a smooth, organic,
 *     full-bleed colour wash with no noise texture and no render target;
 *   - a soft **aurora band** with a couple of sine terms, which gives the page
 *     vertical depth so panels at the top and bottom sit on different colours.
 *
 * Cost: one quad, no texture fetches, ~8 cos/sin pairs. It renders on demand and
 * stops entirely when the tab is hidden or the user prefers reduced motion, so a
 * typist is never paying for it.
 *
 * If WebGL is unavailable the CSS layer underneath still paints a gradient mesh,
 * so the glass never sits on flat black.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

import './Backdrop.css';

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uWarp;
uniform float uIntensity;
uniform float uContrast;
uniform float uGrain;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
uniform vec3 uBaseColor;
uniform float uAmount;

varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

/* Two accumulators feeding each other: the classic iridescent iterator field.
   Cheap, smooth, and never repeats in a way the eye can catch. */
vec3 iridescence(vec2 st) {
  float a = 0.0;
  float d = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    a += cos(fi - d - a * st.x * uWarp);
    d += sin(st.y * fi + a);
  }
  vec3 phase = vec3(d, a, 2.5);
  vec3 col = vec3(
    cos(st.x * d),
    cos(st.y * a),
    cos(st.x * a + st.y * d)
  ) * 0.6 + 0.4;
  return cos(col * cos(phase) * 0.5 + 0.5);
}

void main() {
  vec2 res = uResolution;
  vec2 uv = (gl_FragCoord.xy - 0.5 * res) / min(res.x, res.y);
  vec2 st = uv * uScale;

  vec3 field = iridescence(st);

  /* Map the field onto the palette. Two stops per axis keeps it colourful
     without turning into a rainbow, which would fight the text. */
  vec3 warm = mix(uColorA, uColorB, clamp(field.r * 0.65 + field.g * 0.35, 0.0, 1.0));
  vec3 cool = mix(uColorC, uColorD, clamp(field.b * 0.7 + field.g * 0.3, 0.0, 1.0));
  vec3 colour = mix(cool, warm, 0.5 + 0.5 * sin(field.g * 3.0 + uTime * 0.05));

  /* Aurora band: gives the page a top-to-bottom gradient so glass panels at
     different heights refract different colours. */
  float band = smoothstep(
    0.6,
    -0.3,
    uv.y + 0.16 * sin(uv.x * 1.5 + uTime * 0.07) + 0.07 * sin(uv.x * 3.3 - uTime * 0.05)
  );
  colour += uColorA * band * 0.22;

  /* Compress the range: the field is a smooth wash, not a high-contrast image.
     A contrast above 1 here is what made the first pass look like a blue lens
     flare and swallowed the content. */
  colour = (colour - 0.5) * uContrast + 0.5;

  /* Blend into the page base. This is the step that makes the backdrop read as
     "dark room with coloured light" instead of "bright blue wallpaper" — the
     colour stays as bloom, and text keeps its contrast. */
  colour = mix(uBaseColor, colour, uAmount);

  float vignette = smoothstep(1.4, 0.2, length(uv * vec2(1.0, 1.15)));
  colour *= mix(0.42, 1.0, vignette);

  colour *= uIntensity;
  colour += (hash(gl_FragCoord.xy + uTime) - 0.5) * uGrain;

  gl_FragColor = vec4(colour, 1.0);
}
`;

export interface BackdropProps {
  className?: string;
}

export const Backdrop = ({ className = '' }: BackdropProps) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer: THREE.WebGLRenderer;
    let alive = true;
    let raf = 0;
    let visible = true;
    let disposed = false;
    let cleanup = () => {};

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    const boot = () => {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
      } catch {
        return;
      }
      if (!alive) return;

      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const canvas = renderer.domElement;
      canvas.className = 'backdrop__canvas';
      canvas.setAttribute('aria-hidden', 'true');
      host.appendChild(canvas);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      /* Read the solid --scene-* tokens. They are plain hex precisely because
         THREE.Color cannot parse `hsl(h s% l% / a)`. */
      const root = getComputedStyle(document.documentElement);
      const readVar = (name: string, fallback: string) => {
        const raw = root.getPropertyValue(name).trim();
        const colour = new THREE.Color();
        try {
          colour.setStyle(raw || fallback);
        } catch {
          colour.setStyle(fallback);
        }
        return colour;
      };

      const uniforms = {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        /* Large, smooth features: fine detail is exactly what a heavy blur
           destroys, and busy backdrops distract a typist. */
        uScale: { value: 2.1 },
        uWarp: { value: 0.72 },
        uIntensity: { value: 0.92 },
        uContrast: { value: 0.82 },
        uGrain: { value: 0.01 },
        uAmount: { value: 0.55 },
        uColorA: { value: readVar('--scene-a', '#6a3ce0') },
        uColorB: { value: readVar('--scene-b', '#14a8c0') },
        uColorC: { value: readVar('--scene-c', '#cf3f8c') },
        uColorD: { value: readVar('--scene-d', '#3350d8') },
        uBaseColor: { value: readVar('--scene-base', '#0a0b14') }
      };

      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms,
        depthTest: false,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      scene.add(mesh);

      const resize = () => {
        const width = Math.max(1, host.clientWidth);
        const height = Math.max(1, host.clientHeight);
        /* The field is smooth, so half resolution is invisible and halves the
           fill cost — this runs behind everything on every page. */
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5) * 0.75;
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        uniforms.uResolution.value.set(width * ratio, height * ratio);
      };

      const start = () => {
        if (raf || !visible || disposed) return;
        raf = requestAnimationFrame(tick);
      };

      const tick = (now: number) => {
        raf = 0;
        if (disposed || !alive) return;
        uniforms.uTime.value = now * 0.001;
        renderer.render(scene, camera);
        if (!reduced && visible) raf = requestAnimationFrame(tick);
      };

      const readTheme = () => {
        const style = getComputedStyle(document.documentElement);
        const amount = Number(style.getPropertyValue('--scene-amount').trim());
        uniforms.uAmount.value = Number.isFinite(amount) && amount > 0 ? amount : 0.55;
        uniforms.uBaseColor.value = readVar('--scene-base', '#0a0b14');
        uniforms.uColorA.value = readVar('--scene-a', '#6a3ce0');
        uniforms.uColorB.value = readVar('--scene-b', '#14a8c0');
        uniforms.uColorC.value = readVar('--scene-c', '#cf3f8c');
        uniforms.uColorD.value = readVar('--scene-d', '#3350d8');
      };
      readTheme();

      const themeObserver = new MutationObserver(readTheme);
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

      resize();
      renderer.render(scene, camera);
      if (!reduced) start();

      const resizeObserver = new ResizeObserver(() => {
        resize();
        renderer.render(scene, camera);
      });
      resizeObserver.observe(host);

      const intersectionObserver = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
      });
      intersectionObserver.observe(host);

      const onVisibility = () => {
        if (!document.hidden) start();
      };
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        themeObserver.disconnect();
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        geometry.dispose();
        material.dispose();
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      };
    };

    boot();

    return () => {
      alive = false;
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      cleanup();
    };
  }, []);

  return (
    <div ref={hostRef} className={`backdrop ${className}`.trim()} aria-hidden="true">
      <div className="backdrop__mesh" />
      <div className="backdrop__grid" />
    </div>
  );
};

export default Backdrop;
