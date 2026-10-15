/**
 * Keycap legend atlas.
 *
 * Every legend in a layout is drawn once into a canvas grid. Keycap geometry
 * carries cell-local UVs and the shader offsets them by the key's cell, so the
 * whole keyboard renders from a single texture and a single draw call.
 *
 * Glyphs are painted white with the shape carried in the alpha channel: the
 * fragment shader mixes the cap colour toward the per-key legend colour by that
 * alpha, which is what allows accent keys to have their own legend colour.
 */
import * as THREE from 'three';
import type { KeyDef, LayoutDef } from './layouts';

export const ATLAS_COLS = 12;
export const CELL_PX = 128;

export interface LegendAtlas {
  texture: THREE.Texture;
  cols: number;
  rows: number;
  /** cell index for each key code */
  cells: Map<string, number>;
  /** the reserved cell used by side walls (no glyph) */
  blankCell: number;
  /** number of keys covered */
  count: number;
}

const FONT_STACK = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

const fitFontSize = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  weight = 600
) => {
  let size = maxSize;
  while (size > 8) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return 8;
};

const drawLegend = (ctx: CanvasRenderingContext2D, key: KeyDef, cell: number, cols: number) => {
  const cx = (cell % cols) * CELL_PX;
  const cy = Math.floor(cell / cols) * CELL_PX;
  const label = key.label ?? '';
  if (!label) return;

  const lines = label.split('\n').filter(line => line.length > 0);
  if (!lines.length) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const boxW = CELL_PX * 0.86;
  const boxH = CELL_PX * 0.86;

  if (lines.length >= 2) {
    /* shift legend above, base legend below — the usual keycap arrangement */
    const [top, bottom] = lines;
    const topSize = fitFontSize(ctx, top, boxW * 0.62, CELL_PX * 0.32, 600);
    const bottomSize = fitFontSize(ctx, bottom, boxW, CELL_PX * 0.62, 700);
    ctx.font = `600 ${topSize}px ${FONT_STACK}`;
    ctx.fillText(top, CELL_PX / 2, CELL_PX * 0.3);
    ctx.font = `700 ${bottomSize}px ${FONT_STACK}`;
    ctx.fillText(bottom, CELL_PX / 2, CELL_PX * 0.66);
  } else {
    const text = lines[0];
    const isGlyph = text.length <= 2;
    const maxSize = isGlyph ? CELL_PX * 0.68 : CELL_PX * 0.42;
    const size = fitFontSize(ctx, text, boxW, maxSize, 650);
    ctx.font = `650 ${size}px ${FONT_STACK}`;
    /* optical centring: textBaseline middle sits slightly low for caps */
    ctx.fillText(text, CELL_PX / 2, CELL_PX / 2 + size * 0.02);
  }

  void boxH;
  ctx.restore();
};

export const buildLegendAtlas = (layout: LayoutDef): LegendAtlas => {
  const keys = layout.keys;
  const count = keys.length;
  const totalCells = count + 1; /* cell 0 is reserved as blank */
  const rows = Math.ceil(totalCells / ATLAS_COLS);

  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_PX;
  canvas.height = rows * CELL_PX;
  const ctx = canvas.getContext('2d');

  const cells = new Map<string, number>();
  if (!ctx) {
    const texture = new THREE.CanvasTexture(canvas);
    return { texture, cols: ATLAS_COLS, rows, cells, blankCell: 0, count };
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  keys.forEach((key, index) => {
    const cell = index + 1;
    cells.set(key.code, cell);
    drawLegend(ctx, key, cell, ATLAS_COLS);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  /* No mipmaps: the atlas is a grid of cells, so mip levels blend each legend
     with its neighbours and the glyphs dissolve into mush at a distance.
     Anisotropic linear filtering keeps them crisp at grazing angles instead. */
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return { texture, cols: ATLAS_COLS, rows, cells, blankCell: 0, count };
};

/** Uniforms and GLSL shared by every keycap material. */
export const KEYCAP_UNIFORM_NAMES = ['uAtlas', 'uState', 'uEmissive', 'uLegendBoost'] as const;

export const KEYCAP_VERTEX_HEAD = `
attribute vec2 aKeyUv;
attribute vec2 aLegendUv;
attribute vec3 aCapColor;
attribute vec3 aLegendColor;
attribute float aSide;
varying vec2 vKeyUv;
varying vec2 vLegendUv;
varying vec3 vCapColor;
varying vec3 vLegendColor;
varying float vSide;
`;

export const KEYCAP_VERTEX_BODY = `
vKeyUv = aKeyUv;
vLegendUv = aLegendUv;
vCapColor = aCapColor;
vLegendColor = aLegendColor;
vSide = aSide;
`;

/**
 * The legend UV is baked into atlas space when the keyboard is merged, so the
 * fragment stage needs no per-key cell arithmetic — just one texture fetch.
 */
export const KEYCAP_FRAGMENT_HEAD = `
uniform sampler2D uAtlas;
uniform sampler2D uState;
uniform float uEmissive;
uniform float uLegendBoost;
varying vec2 vKeyUv;
varying vec2 vLegendUv;
varying vec3 vCapColor;
varying vec3 vLegendColor;
varying float vSide;

vec4 typelexLegend() {
  return texture2D(uAtlas, vLegendUv);
}

vec4 typelexState() {
  return texture2D(uState, vKeyUv);
}
`;

/** Injected right after map_fragment: cap colour, tinted by the legend mask. */
export const KEYCAP_COLOR_BODY = `
{
  vec4 legend = typelexLegend();
  diffuseColor.rgb = mix(vCapColor, vLegendColor, legend.a);
  /* The skirt of a keycap faces away from the light far more than its top does.
     Darkening it directly is the cheapest, most reliable depth cue in the whole
     scene — without it the board reads as a flat sticker from above. */
  diffuseColor.rgb *= mix(1.0, 0.66, vSide);
  diffuseColor.a = 1.0;
}
`;

/** Injected after emissivemap_fragment: backlight bleed + reactive glow. */
export const KEYCAP_EMISSIVE_BODY = `
{
  vec4 state = typelexState();
  vec4 legend = typelexLegend();
  float glow = state.a;
  vec3 tint = state.rgb;
  totalEmissiveRadiance += tint * uEmissive * (0.14 + 0.86 * glow) * mix(0.5, 1.0, legend.a);
  totalEmissiveRadiance += tint * glow * uLegendBoost * legend.a;
}
`;
