/**
 * The 3D keyboard.
 *
 * One merged keycap geometry carries the whole board: every keycap's vertices
 * are baked into a single buffer with atlas-space legend UVs and per-vertex cap
 * colours, so the keyboard renders in a single draw call. Presses animate by
 * rewriting only the affected vertex range, and the animated backlight is driven
 * by a tiny state texture (one texel per key) instead of per-vertex updates.
 */
import * as THREE from 'three';

import { FINGER_COLOR, fingerForCode } from '../../lib/typing/fingers';
import type { Theme } from '../../lib/types';
import {
  buildCaseGeometry,
  buildKeycapGeometry,
  buildPlateGeometry,
  buildRimGeometry
} from './geometry';
import {
  buildLegendAtlas,
  KEYCAP_COLOR_BODY,
  KEYCAP_EMISSIVE_BODY,
  KEYCAP_FRAGMENT_HEAD,
  KEYCAP_VERTEX_BODY,
  KEYCAP_VERTEX_HEAD,
  type LegendAtlas
} from './legends';
import { getLayout, type KeyDef, type LayoutDef } from './layouts';
import { getModel, PROFILE_SCULPT, type KeyboardModel, type RgbStyle } from './models';

/** 1 keyboard unit = 1 world unit; the camera is framed in the same units. */
const TRAVEL = 0.08;
const HOVER_LIFT = 0.03;
const STATE_COLS = 32;
/** Field of view. Wide enough to give the board real perspective convergence. */
const FOV = 40;
const WASD = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
/** Fraction of an atlas cell kept clear on each side to avoid filter bleed. */
const INSET = 0.02;

export type ViewPreset = 'angled' | 'top' | 'front' | 'close';

export interface KeyboardSceneOptions {
  modelId: string;
  theme: Theme;
  fingerHints: boolean;
  showNextKey: boolean;
  rgbStyle: RgbStyle;
  interactive: boolean;
  /** called when the user clicks a keycap */
  onKeyClick?: (code: string) => void;
}

interface KeyRecord {
  def: KeyDef;
  index: number;
  vertexStart: number;
  vertexCount: number;
  stateUv: [number, number];
  accent: boolean;
  baseCap: THREE.Color;
  legend: THREE.Color;
  press: number;
  pressVelocity: number;
  hover: number;
  glow: number;
  rgb: THREE.Color;
  flash: number;
  /** last Y offset written to the vertex buffer, so we only rewrite when it changes */
  offsetApplied: number;
}

const hexToColor = (hex: string) => new THREE.Color(hex);

const buildEnvironment = (renderer: THREE.WebGLRenderer) => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0.04, 0.04, 0.05);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const materials: THREE.Material[] = [];
  const panel = (intensity: number, position: [number, number, number], scale: [number, number]) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(intensity, intensity, intensity),
      side: THREE.DoubleSide
    });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(3.4, [0, 14, 6], [26, 10]);
  panel(5.2, [-16, 6, 10], [1.6, 22]);
  panel(3.6, [16, 4, 12], [1.2, 22]);
  panel(2.2, [0, -12, 8], [30, 0.5]);
  panel(1.6, [0, 10, -14], [24, 8]);
  panel(0.7, [10, -6, -8], [10, 8]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  geometry.dispose();
  materials.forEach(material => material.dispose());
  return target;
};

/** A soft radial shadow catcher placed under the board. */
const buildShadowTexture = () => {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.32)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

/** A small OLED panel or brand badge, drawn to a canvas. */
const buildDeckLabel = (text: string, width: number, height: number, accent: string) => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.max(64, Math.round((512 * height) / width));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#08090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.fillStyle = accent;
    ctx.font = `700 ${Math.round(canvas.height * 0.46)}px "Inter", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

export class KeyboardScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private environment: THREE.Texture | null = null;
  private options: KeyboardSceneOptions;

  private layout: LayoutDef;
  private model: KeyboardModel;
  private atlas: LegendAtlas | null = null;

  private keycapMesh: THREE.Mesh | null = null;
  private keycapMaterial: THREE.MeshPhysicalMaterial | null = null;
  private keycapGeometry: THREE.BufferGeometry | null = null;
  private caseMesh: THREE.Mesh | null = null;
  private caseMaterial: THREE.MeshPhysicalMaterial | null = null;
  private plateMesh: THREE.Mesh | null = null;
  private rimMesh: THREE.Mesh | null = null;
  private underglowMesh: THREE.Mesh | null = null;
  private shadowMesh: THREE.Mesh | null = null;
  private detailGroup = new THREE.Group();
  private extraTextures: THREE.Texture[] = [];
  private extraMaterials: THREE.Material[] = [];
  private extraGeometries: THREE.BufferGeometry[] = [];

  private records: KeyRecord[] = [];
  private byCode = new Map<string, KeyRecord>();
  private vertexToKey: Int32Array = new Int32Array(0);
  private basePositions: Float32Array | null = null;
  private stateTexture: THREE.DataTexture | null = null;
  private stateData = new Uint8Array(0);
  private stateRows = 1;
  private keycapUniforms: Record<string, THREE.IUniform> = {};

  private nextCode: string | null = null;
  private nextPulse = 0;
  private rgbPhase = 0;
  private idlePhase = 0;
  private heat: Record<string, number> = {};

  private yaw = 0;
  private pitch = 0.58;
  private distance = 30;
  private targetYaw = 0;
  private targetPitch = 0.58;
  private targetDistance = 30;

  private pointer = new THREE.Vector2(-10, -10);
  private raycaster = new THREE.Raycaster();
  private hoverCode: string | null = null;
  private dragging = false;
  private dragStart = { x: 0, y: 0, yaw: 0, pitch: 0 };
  private moved = 0;

  private raf = 0;
  private last = 0;
  private alive = true;
  private visible = true;
  private measured = { width: 0, height: 0 };
  private keyLight: THREE.DirectionalLight | null = null;
  private stableReads = 0;
  private sizeTimer = 0;
  private reducedMotion = false;

  constructor(container: HTMLElement, options: KeyboardSceneOptions) {
    this.container = container;
    this.options = options;
    this.layout = getLayout(getModel(options.modelId).layoutId);
    this.model = getModel(options.modelId);

    this.reducedMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.className = 'keyboard-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);

    this.environment = buildEnvironment(this.renderer).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = 0.55;

    /* Keycap-to-keycap contact shadows are the strongest depth cue available,
       so the key light casts and the board receives. One tight ortho frustum
       around the board is enough and costs a single extra pass. */
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
    keyLight.position.set(-8, 13, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0006;
    keyLight.shadow.normalBias = 0.015;
    const shadowCamera = keyLight.shadow.camera as THREE.OrthographicCamera;
    shadowCamera.near = 1;
    shadowCamera.far = 70;
    const fillLight = new THREE.DirectionalLight(0xc8d6ff, 0.42);
    fillLight.position.set(12, 7, 9);
    const rimLight = new THREE.DirectionalLight(0x8fa6ff, 0.6);
    rimLight.position.set(4, 5, -14);
    this.keyLight = keyLight;
    this.scene.add(keyLight, fillLight, rimLight, this.root);

    this.root.rotation.x = THREE.MathUtils.degToRad(0);
    this.rebuild();

    const resizeObserver = new ResizeObserver(() => this.resize());
    resizeObserver.observe(container);
    this.resizeObserver = resizeObserver;

    const intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      if (this.visible) this.start();
    });
    intersectionObserver.observe(container);
    this.intersectionObserver = intersectionObserver;

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.onVisibility = () => {
      if (document.hidden) return;
      /* ResizeObserver callbacks are not delivered while a tab is hidden, so the
         drawing buffer can be stale by the time we come back — re-measure first. */
      this.resize();
      this.start();
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.onLoad = () => this.resize();
    this.startSizeWatch();

  }

  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private onVisibility: (() => void) | null = null;
  private onLoad: (() => void) | null = null;

  /* ---------------------------------------------------------------- */
  /* construction                                                      */
  /* ---------------------------------------------------------------- */

  private clearBoard() {
    const disposeMesh = (mesh: THREE.Mesh | null) => {
      if (!mesh) return;
      this.root.remove(mesh);
      if (mesh === this.shadowMesh || mesh === this.keycapMesh) return;
      mesh.geometry?.dispose();
    };
    disposeMesh(this.keycapMesh);
    disposeMesh(this.caseMesh);
    disposeMesh(this.plateMesh);
    disposeMesh(this.rimMesh);
    disposeMesh(this.underglowMesh);
    disposeMesh(this.shadowMesh);
    this.root.remove(this.detailGroup);
    this.keycapGeometry?.dispose();
    this.keycapMaterial?.dispose();
    this.caseMaterial?.dispose();
    this.atlas?.texture.dispose();
    this.stateTexture?.dispose();
    this.extraGeometries.forEach(geometry => geometry.dispose());
    this.extraMaterials.forEach(material => material.dispose());
    this.extraTextures.forEach(texture => texture.dispose());
    this.extraGeometries = [];
    this.extraMaterials = [];
    this.extraTextures = [];
    this.detailGroup = new THREE.Group();
    this.records = [];
    this.byCode.clear();
    this.keycapMesh = null;
    this.caseMesh = null;
    this.plateMesh = null;
    this.rimMesh = null;
    this.underglowMesh = null;
    this.shadowMesh = null;
    this.keycapGeometry = null;
    this.keycapMaterial = null;
    this.caseMaterial = null;
    this.atlas = null;
    this.stateTexture = null;
  }

  private rebuild() {
    this.clearBoard();
    const model = this.model;
    const layout = this.layout;

    /* ---- case ---- */
    const bezel = model.case.bezel;
    const caseW = layout.width + bezel * 2;
    const caseD = layout.depth + bezel * 2;
    this.caseMaterial = new THREE.MeshPhysicalMaterial({
      color: hexToColor(model.case.color),
      roughness: model.case.roughness,
      metalness: model.case.metalness,
      clearcoat: model.case.material === 'aluminium' ? 0.35 : 0.12,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.9
    });
    this.caseMesh = new THREE.Mesh(
      buildCaseGeometry({
        width: caseW,
        depth: caseD,
        height: model.case.height,
        radius: model.case.radius,
        bevel: 0.05
      }),
      this.caseMaterial
    );
    this.caseMesh.position.y = -0.014;
    this.root.add(this.caseMesh);

    /* ---- recessed deck tray (laptops sit their caps in a well) ---- */
    if (model.features.tray) {
      const trayMaterial = new THREE.MeshPhysicalMaterial({
        color: hexToColor(model.case.deckColor ?? model.case.color).multiplyScalar(0.72),
        roughness: Math.min(0.95, model.case.roughness + 0.15),
        metalness: 0.05
      });
      const tray = new THREE.Mesh(
        buildPlateGeometry(caseW - 0.34, caseD - 0.34, Math.max(0.1, model.case.radius - 0.14)),
        trayMaterial
      );
      tray.position.y = -0.03;
      this.root.add(tray);
      this.extraMaterials.push(trayMaterial);
      this.extraGeometries.push(tray.geometry);
    }

    /* ---- switch plate ---- */
    const plateMaterial = new THREE.MeshPhysicalMaterial({
      color: hexToColor(model.case.deckColor ?? model.case.color).multiplyScalar(0.6),
      roughness: 0.75,
      metalness: model.case.material === 'aluminium' ? 0.55 : 0.2
    });
    this.plateMesh = new THREE.Mesh(
      buildPlateGeometry(layout.width + 0.2, layout.depth + 0.2, 0.12),
      plateMaterial
    );
    this.plateMesh.position.y = 0.004;
    this.root.add(this.plateMesh);
    this.extraMaterials.push(plateMaterial);

    /* ---- legend atlas ---- */
    const atlas = buildLegendAtlas(layout);
    this.atlas = atlas;

    /* ---- keycaps ---- */
    this.buildKeycaps(atlas);

    /* ---- RGB underglow strip ---- */
    if (model.underglow) {
      const underglowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      this.underglowMesh = new THREE.Mesh(
        buildRimGeometry(caseW + 0.06, caseD + 0.06, model.case.radius, 0.09),
        underglowMaterial
      );
      this.underglowMesh.position.y = -model.case.height * 0.78;
      this.root.add(this.underglowMesh);
      this.extraMaterials.push(underglowMaterial);
    }

    /* ---- signature details ---- */
    this.buildDetails();

    /* ---- shadow ---- */
    if (!this.shadowMesh) {
      const shadowTexture = buildShadowTexture();
      this.extraTextures.push(shadowTexture);
      const shadowMaterial = new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.85
      });
      this.extraMaterials.push(shadowMaterial);
      const geometry = new THREE.PlaneGeometry(caseW * 1.9, caseD * 2.4);
      this.extraGeometries.push(geometry);
      this.shadowMesh = new THREE.Mesh(geometry, shadowMaterial);
      this.shadowMesh.rotation.x = -Math.PI / 2;
      this.shadowMesh.position.y = -model.case.height - 0.85;
    }
    this.root.add(this.shadowMesh);

    if (this.keycapMesh) {
      this.keycapMesh.castShadow = true;
      this.keycapMesh.receiveShadow = true;
    }
    if (this.plateMesh) this.plateMesh.receiveShadow = true;
    if (this.caseMesh) {
      this.caseMesh.receiveShadow = true;
      this.caseMesh.castShadow = true;
    }

    /* size the shadow frustum to this board */
    if (this.keyLight) {
      const ortho = this.keyLight.shadow.camera as THREE.OrthographicCamera;
      const half = Math.max(caseW, caseD) * 0.78;
      ortho.left = -half;
      ortho.right = half;
      ortho.top = half;
      ortho.bottom = -half;
      ortho.updateProjectionMatrix();
      this.keyLight.shadow.needsUpdate = true;
    }

    /* tilt the whole board toward the viewer */
    this.root.rotation.x = THREE.MathUtils.degToRad(model.case.tilt);
    this.distance = this.defaultDistance();
    this.targetDistance = this.distance;
    this.clampCamera();
  }

  private buildKeycaps(atlas: LegendAtlas) {
    const layout = this.layout;
    const model = this.model;
    const sculpt = PROFILE_SCULPT[model.profile];
    const cellW = 1 / atlas.cols;
    const cellH = 1 / atlas.rows;
    const blankX = (atlas.blankCell % atlas.cols) * cellW;
    const blankY = Math.floor(atlas.blankCell / atlas.cols) * cellH;

    const positions: number[] = [];
    const normals: number[] = [];
    const legendUvs: number[] = [];
    const keyUvs: number[] = [];
    const capColors: number[] = [];
    const legendColors: number[] = [];
    const indices: number[] = [];
    const vertexToKey: number[] = [];

    this.stateRows = Math.max(1, Math.ceil(layout.keys.length / STATE_COLS));
    const accentSet = new Set(layout.accent);
    const geometryCache = new Map<string, THREE.BufferGeometry>();

    const capBase = hexToColor(model.caps.color);
    const capAccent = hexToColor(model.caps.accent);
    const legendBase = hexToColor(model.caps.legend);
    const legendAccent = hexToColor(model.caps.accentLegend ?? model.caps.legend);

    layout.keys.forEach((def, index) => {
      const rowIndex = Math.min(def.row, sculpt.height.length - 1);
      const height = model.capHeight * sculpt.height[rowIndex];
      const tilt = sculpt.tilt[rowIndex];
      const gap = model.gap;
      const cacheKey = `${def.w}|${def.h}|${rowIndex}`;

      let geometry = geometryCache.get(cacheKey);
      if (!geometry) {
        const isChiclet = model.profile === 'chiclet' || model.profile === 'lowprofile';
        geometry = buildKeycapGeometry({
          width: def.w - gap,
          depth: def.h - gap,
          height,
          dish: model.dish,
          taper: isChiclet ? 0.17 : 0.23,
          radius: isChiclet ? 0.11 : 0.095,
          skirt: isChiclet ? 0.012 : 0.022,
          segments: 24,
          rings: 5
        });
        if (tilt) {
          const radians = THREE.MathUtils.degToRad(tilt);
          geometry.rotateX(radians);
          geometry.translate(0, Math.abs(Math.sin(radians)) * (def.h * 0.5), 0);
        }
        geometryCache.set(cacheKey, geometry);
      }

      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const legendUv = geometry.getAttribute('aLegendUv');
      const side = geometry.getAttribute('aSide');
      const count = position.count;
      const start = positions.length / 3;

      const cell = atlas.cells.get(def.code) ?? atlas.blankCell;
      const cellX = (cell % atlas.cols) * cellW;
      const cellY = Math.floor(cell / atlas.cols) * cellH;

      const accent = accentSet.has(def.code) || (model.features.wasd === true && WASD.has(def.code));
      const cap = accent ? capAccent : capBase;
      const legendColor = accent ? legendAccent : legendBase;

      const keyX = def.x + def.w / 2 - layout.width / 2;
      const keyZ = def.y + def.h / 2 - layout.depth / 2;
      const keyU = ((index % STATE_COLS) + 0.5) / STATE_COLS;
      const keyV = (Math.floor(index / STATE_COLS) + 0.5) / this.stateRows;

      for (let i = 0; i < count; i++) {
        positions.push(position.getX(i) + keyX, position.getY(i), position.getZ(i) + keyZ);
        normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
        const isSide = side.getX(i) > 0.5;
        /* inset the sample slightly inside the cell so linear filtering never
           picks up a neighbouring legend along the cell border */
        const u = INSET + (isSide ? 0.5 : legendUv.getX(i)) * (1 - INSET * 2);
        const v = INSET + (isSide ? 0.5 : legendUv.getY(i)) * (1 - INSET * 2);
        legendUvs.push((isSide ? blankX : cellX) + u * cellW, (isSide ? blankY : cellY) + v * cellH);
        keyUvs.push(keyU, keyV);
        capColors.push(cap.r, cap.g, cap.b);
        legendColors.push(legendColor.r, legendColor.g, legendColor.b);
        vertexToKey.push(index);
      }

      const geometryIndex = geometry.getIndex();
      if (geometryIndex) {
        for (let i = 0; i < geometryIndex.count; i++) indices.push(start + geometryIndex.getX(i));
      }

      this.records.push({
        def,
        index,
        vertexStart: start,
        vertexCount: count,
        stateUv: [keyU, keyV],
        accent,
        baseCap: cap.clone(),
        legend: legendColor.clone(),
        press: 0,
        pressVelocity: 0,
        hover: 0,
        glow: 0,
        rgb: new THREE.Color(0xffffff),
        flash: 0,
        offsetApplied: 0
      });
    });

    geometryCache.forEach(geometry => this.extraGeometries.push(geometry));

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('aLegendUv', new THREE.Float32BufferAttribute(legendUvs, 2));
    merged.setAttribute('aKeyUv', new THREE.Float32BufferAttribute(keyUvs, 2));
    merged.setAttribute('aCapColor', new THREE.Float32BufferAttribute(capColors, 3));
    merged.setAttribute('aLegendColor', new THREE.Float32BufferAttribute(legendColors, 3));
    merged.setIndex(indices);
    merged.computeBoundingSphere();

    this.keycapGeometry = merged;
    this.basePositions = new Float32Array(positions);
    this.vertexToKey = Int32Array.from(vertexToKey);

    /* ---- state texture: one texel per key ---- */
    this.stateData = new Uint8Array(STATE_COLS * this.stateRows * 4);
    const stateTexture = new THREE.DataTexture(
      this.stateData,
      STATE_COLS,
      this.stateRows,
      THREE.RGBAFormat,
      THREE.UnsignedByteType
    );
    stateTexture.magFilter = THREE.NearestFilter;
    stateTexture.minFilter = THREE.NearestFilter;
    stateTexture.generateMipmaps = false;
    stateTexture.needsUpdate = true;
    this.stateTexture = stateTexture;

    /* ---- material ---- */
    const uniforms: Record<string, THREE.IUniform> = {
      uAtlas: { value: atlas.texture },
      uState: { value: stateTexture },
      uEmissive: { value: this.options.theme === 'light' ? 0.55 : 0.95 },
      uLegendBoost: { value: 1.4 }
    };
    this.keycapUniforms = uniforms;

    const material = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: this.model.profile === 'chiclet' ? 0.52 : 0.42,
      metalness: 0.04,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.75
    });
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${KEYCAP_VERTEX_HEAD}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${KEYCAP_VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${KEYCAP_FRAGMENT_HEAD}`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${KEYCAP_COLOR_BODY}`)
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n${KEYCAP_EMISSIVE_BODY}`
        );
    };
    this.keycapMaterial = material;

    const mesh = new THREE.Mesh(merged, material);
    mesh.frustumCulled = false;
    this.keycapMesh = mesh;
    this.root.add(mesh);

    this.byCode.clear();
    for (const record of this.records) this.byCode.set(record.def.code, record);
    this.applyFingerHints();
  }

  private buildDetails() {
    const model = this.model;
    const layout = this.layout;

    const addMesh = (
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      position: [number, number, number],
      rotation?: [number, number, number]
    ) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      if (rotation) mesh.rotation.set(...rotation);
      this.detailGroup.add(mesh);
      this.extraGeometries.push(geometry);
      this.extraMaterials.push(material);
      return mesh;
    };

    /* ThinkPad pointing stick, centred on the G / H / B junction */
    if (model.features.trackPoint) {
      const stem = new THREE.CylinderGeometry(0.075, 0.1, 0.16, 16);
      const nubMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xd23b3b,
        roughness: 0.35,
        clearcoat: 0.8,
        clearcoatRoughness: 0.2
      });
      addMesh(stem, nubMaterial, [0, model.capHeight * 0.35, -0.15]);
      const cap = new THREE.SphereGeometry(0.11, 18, 14);
      cap.scale(1, 0.72, 1);
      addMesh(cap, nubMaterial, [0, model.capHeight * 0.62, -0.15]);
    }

    /* ROG-style deck vents */
    if (model.features.vents) {
      const ventMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x0a0b0d,
        roughness: 0.9,
        metalness: 0.1
      });
      for (let i = 0; i < 5; i++) {
        const geometry = new THREE.BoxGeometry(0.42, 0.05, 0.03);
        addMesh(geometry, ventMaterial, [-layout.width / 2 + 0.5 + i * 0.55, 0.02, -layout.depth / 2 - 0.42]);
      }
      const ventRow = new THREE.BoxGeometry(2.6, 0.05, 0.03);
      addMesh(ventRow, ventMaterial, [layout.width / 2 - 1.9, 0.02, layout.depth / 2 + 0.42]);
    }

    /* OLED panel (ROG Azoth) */
    if (model.features.oled) {
      const width = 1.5;
      const height = 0.42;
      const texture = buildDeckLabel('TYPING', width, height, '#7cf5c8');
      this.extraTextures.push(texture);
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
      const geometry = new THREE.PlaneGeometry(width, height);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(layout.width / 2 - 1.1, 0.01, -layout.depth / 2 - 0.42);
      this.detailGroup.add(mesh);
      this.extraGeometries.push(geometry);
      this.extraMaterials.push(material);
    }

    /* brand wordmark */
    if (model.features.badge && model.features.badge.trim()) {
      const texture = buildDeckLabel(model.features.badge, 3.2, 0.4, '#9aa3b2');
      this.extraTextures.push(texture);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.5,
        toneMapped: false
      });
      const geometry = new THREE.PlaneGeometry(2.0, 0.25);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.008, layout.depth / 2 + 0.44);
      this.detailGroup.add(mesh);
      this.extraGeometries.push(geometry);
      this.extraMaterials.push(material);
    }

    /* WASD cluster gets a subtle deck outline on gaming boards */
    if (model.features.wasd) {
      const outlineMaterial = new THREE.MeshBasicMaterial({
        color: hexToColor(model.caps.accent),
        transparent: true,
        opacity: 0.16,
        toneMapped: false
      });
      const geometry = new THREE.PlaneGeometry(3.2, 1.2);
      const mesh = new THREE.Mesh(geometry, outlineMaterial);
      mesh.rotation.x = -Math.PI / 2;
      const wasdX = (() => {
        const w = this.byCode.get('KeyW');
        return w ? w.def.x + 0.5 - layout.width / 2 : -3;
      })();
      const wasdZ = (() => {
        const w = this.byCode.get('KeyW');
        return w ? w.def.y + 1 - layout.depth / 2 : -1;
      })();
      mesh.position.set(wasdX, 0.006, wasdZ);
      this.detailGroup.add(mesh);
      this.extraGeometries.push(geometry);
      this.extraMaterials.push(outlineMaterial);
    }

    this.root.add(this.detailGroup);
  }

  /* ---------------------------------------------------------------- */
  /* colour + state                                                    */
  /* ---------------------------------------------------------------- */

  private applyFingerHints() {
    if (!this.keycapGeometry) return;
    const attribute = this.keycapGeometry.getAttribute('aCapColor') as THREE.BufferAttribute;
    const hints = this.options.fingerHints;
    const dim = this.options.theme === 'light' ? 0.86 : 0.7;
    const scratch = new THREE.Color();

    for (const record of this.records) {
      let color = record.baseCap;
      if (hints) {
        const finger = fingerForCode(record.def.code);
        if (finger) {
          scratch.set(FINGER_COLOR[finger]);
          /* keep the homing keys readable while still tinting by finger */
          color = scratch.clone().lerp(record.baseCap, record.def.homing ? 0.72 : 0.62).multiplyScalar(dim);
        }
      }
      for (let i = 0; i < record.vertexCount; i++) {
        const at = record.vertexStart + i;
        attribute.setXYZ(at, color.r, color.g, color.b);
      }
    }
    attribute.needsUpdate = true;
  }

  /** Advance the animated backlight for one frame. */
  private updateBacklight(dt: number) {
    const model = this.model;
    const on = model.backlight !== 'none';
    const style = this.options.rgbStyle;
    this.rgbPhase += dt;

    if (!on) {
      for (const record of this.records) {
        const target = record.press > 0.02 ? 0.35 : record.flash;
        record.glow += (target - record.glow) * Math.min(1, dt * 12);
        record.rgb.setRGB(1, 1, 1);
      }
      return;
    }

    const layout = this.layout;
    const isWhite = model.backlight === 'white';
    const accent = new THREE.Color(this.options.theme === 'light' ? 0x2a6f68 : 0x64e6d0);
    const base = new THREE.Color(0xffffff);

    for (const record of this.records) {
      const def = record.def;
      let color = base;
      let glow = 0.34;

      switch (style) {
        case 'solid':
          color = isWhite ? base : accent;
          glow = 0.4;
          break;
        case 'wave': {
          const hue = ((def.x / layout.width) * 0.85 + this.rgbPhase * 0.16) % 1;
          color = new THREE.Color().setHSL(hue, 0.85, 0.58);
          glow = 0.42;
          break;
        }
        case 'rainbow': {
          const hue = ((def.x / layout.width) * 0.55 + (def.y / layout.depth) * 0.4 + this.rgbPhase * 0.1) % 1;
          color = new THREE.Color().setHSL(hue, 0.9, 0.56);
          glow = 0.44;
          break;
        }
        case 'reactive': {
          const pulse = Math.max(record.press, record.glow * 0.6);
          const hue = 0.5 - Math.min(0.45, pulse * 0.45);
          color = new THREE.Color().setHSL(hue, 0.8, 0.5 + pulse * 0.28);
          glow = 0.24 + pulse * 0.7;
          break;
        }
        case 'starlight': {
          const seed = (def.x * 12.9898 + def.y * 78.233) % 1;
          const twinkle = Math.max(0, Math.sin(this.rgbPhase * (0.6 + seed) + seed * 40));
          color = isWhite ? base : accent;
          glow = 0.18 + twinkle * 0.62;
          break;
        }
        case 'heatmap': {
          const value = this.heat[def.code] ?? 0;
          color = new THREE.Color().setHSL(0.58 - Math.min(0.58, value * 0.58), 0.85, 0.52);
          glow = 0.18 + value * 0.75;
          break;
        }
        default:
          break;
      }

      record.rgb.copy(color);
      const flashTarget = record.flash;
      const pressTarget = record.press;
      const wanted = Math.max(glow, pressTarget * 0.95, flashTarget);
      record.glow += (wanted - record.glow) * Math.min(1, dt * 10);
    }

    /* the "type this next" key overrides everything and pulses */
    if (this.options.showNextKey && this.nextCode) {
      const record = this.byCode.get(this.nextCode);
      if (record) {
        this.nextPulse = (this.nextPulse + dt * 2.2) % (Math.PI * 2);
        const pulse = 0.55 + 0.45 * Math.sin(this.nextPulse);
        record.rgb.setRGB(0.35, 0.98, 0.82);
        record.glow = Math.max(record.glow, 0.5 + pulse * 0.5);
      }
    }
  }

  private flushStateTexture() {
    if (!this.stateTexture || !this.stateData) return;
    const data = this.stateData;
    for (const record of this.records) {
      const [u, v] = record.stateUv;
      const x = Math.min(STATE_COLS - 1, Math.floor(u * STATE_COLS));
      const y = Math.min(this.stateRows - 1, Math.floor(v * this.stateRows));
      const at = (y * STATE_COLS + x) * 4;
      data[at] = Math.round(Math.min(1, record.rgb.r) * 255);
      data[at + 1] = Math.round(Math.min(1, record.rgb.g) * 255);
      data[at + 2] = Math.round(Math.min(1, record.rgb.b) * 255);
      data[at + 3] = Math.round(Math.min(1, record.glow) * 255);
    }
    this.stateTexture.needsUpdate = true;
  }

  /** Rewrite the Y of every key that is currently moving. */
  private flushPressedKeys() {
    if (!this.keycapGeometry || !this.basePositions) return;
    const attribute = this.keycapGeometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const base = this.basePositions;
    let touched = false;

    for (const record of this.records) {
      const offset = record.press * TRAVEL + record.hover * HOVER_LIFT;
      const target = record.offsetApplied ?? 0;
      if (Math.abs(offset - target) < 1e-4 && record.press < 0.001 && record.hover < 0.001) {
        if (target !== 0) {
          for (let i = 0; i < record.vertexCount; i++) {
            const at = (record.vertexStart + i) * 3 + 1;
            array[at] = base[at];
          }
          record.offsetApplied = 0;
          touched = true;
        }
        continue;
      }
      for (let i = 0; i < record.vertexCount; i++) {
        const at = (record.vertexStart + i) * 3 + 1;
        array[at] = base[at] - offset;
      }
      record.offsetApplied = offset;
      touched = true;
    }
    if (touched) attribute.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */
  /* camera                                                            */
  /* ---------------------------------------------------------------- */

  private defaultDistance() {
    const aspect = Math.max(0.4, this.container.clientWidth / Math.max(1, this.container.clientHeight));
    const width = this.layout.width + this.model.case.bezel * 2;
    const depth = this.layout.depth + this.model.case.bezel * 2;
    const halfFov = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const fitW = width / (halfFov * aspect);
    const fitD = depth / halfFov;
    return Math.max(fitW, fitD) * 0.6 + 1.6;
  }

  private clampCamera() {
    this.pitch = THREE.MathUtils.clamp(this.pitch, 0.1, 1.32);
    this.yaw = THREE.MathUtils.clamp(this.yaw, -0.62, 0.62);
    this.distance = THREE.MathUtils.clamp(this.distance, this.defaultDistance() * 0.45, this.defaultDistance() * 1.6);
  }

  private applyCamera() {
    const x = Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const y = Math.sin(this.pitch) * this.distance;
    const z = Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    this.camera.position.set(x, y, z * 0.92 + this.layout.depth * 0.22);
    this.camera.lookAt(0, 0, 0.1);
    this.camera.updateMatrixWorld();
  }

  setView(view: ViewPreset) {
    const base = this.defaultDistance();
    switch (view) {
      case 'top':
        this.targetPitch = 1.3;
        this.targetYaw = 0;
        this.targetDistance = base * 0.92;
        break;
      case 'front':
        this.targetPitch = 0.34;
        this.targetYaw = 0;
        this.targetDistance = base * 0.9;
        break;
      case 'close':
        this.targetPitch = 0.72;
        this.targetYaw = 0;
        this.targetDistance = base * 0.6;
        break;
      case 'angled':
      default:
        this.targetPitch = 0.58;
        this.targetYaw = 0;
        this.targetDistance = base;
        break;
    }
    this.start();
  }

  /** Measure the container and, only if it changed, reallocate the buffer. */
  private resize() {
    /* getBoundingClientRect is used rather than clientWidth because the first
       measurement can land before the grid has settled, and a fractional box
       should still round to the right buffer size. */
    const rect = this.container.getBoundingClientRect();
    const width = Math.round(rect.width || this.container.clientWidth);
    const height = Math.round(rect.height || this.container.clientHeight);
    /* A hidden or not-yet-laid-out tab reports a zero-size box; resizing to that
       would throw away a good buffer, so leave the current size in place. */
    if (width < 2 || height < 2) return;
    if (width === this.measured.width && height === this.measured.height) return;
    this.measured = { width, height };
    this.renderer.domElement.dataset.size = `${width}x${height}`;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.distance = this.defaultDistance();
    this.targetDistance = this.distance;
    this.render();
  }

  /**
   * Watch the container size.
   *
   * ResizeObserver handles the ordinary case instantly, but its callbacks are
   * not delivered while a tab is hidden, and a background tab also throttles
   * timers. A one-per-second measurement is therefore kept as a safety net:
   * `resize()` is change-gated, so an unchanged box costs a single
   * getBoundingClientRect and nothing else.
   */
  private startSizeWatch() {
    if (this.sizeTimer) return;
    this.sizeTimer = window.setInterval(() => this.resize(), 900);
    this.settleSize(0);
  }

  /** A short burst of early measurements to catch the first-layout reflows. */
  private settleSize(attempt = 0) {
    if (!this.alive) return;
    const before = this.measured;
    this.resize();
    const unchanged = this.measured.width === before.width && this.measured.height === before.height;
    this.stableReads = unchanged ? this.stableReads + 1 : 0;
    if (this.stableReads < 6 && attempt < 25) {
      window.setTimeout(() => this.settleSize(attempt + 1), 180);
    }
  }

  /* ---------------------------------------------------------------- */
  /* interaction                                                       */
  /* ---------------------------------------------------------------- */

  private pickKey(clientX: number, clientY: number): KeyRecord | null {
    if (!this.keycapMesh) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObject(this.keycapMesh, false);
    const hit = hits[0];
    const face = hit?.face;
    if (!face) return null;
    const keyIndex = this.vertexToKey[face.a];
    if (keyIndex === undefined) return null;
    return this.records[keyIndex] ?? null;
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.dragging) {
      const dx = event.clientX - this.dragStart.x;
      const dy = event.clientY - this.dragStart.y;
      this.moved = Math.max(this.moved, Math.abs(dx) + Math.abs(dy));
      this.targetYaw = this.dragStart.yaw + dx * 0.004;
      this.targetPitch = this.dragStart.pitch + dy * 0.003;
      this.yaw = this.targetYaw;
      this.pitch = THREE.MathUtils.clamp(this.targetPitch, 0.1, 1.48);
      this.targetYaw = this.yaw;
      this.targetPitch = this.pitch;
      this.start();
      return;
    }
    if (!this.options.interactive) return;
    const record = this.pickKey(event.clientX, event.clientY);
    const code = record?.def.code ?? null;
    if (code !== this.hoverCode) {
      this.hoverCode = code;
      this.renderer.domElement.style.cursor = code ? 'pointer' : 'default';
      this.start();
    }
  };

  private onPointerDown = (event: PointerEvent) => {
    this.dragging = true;
    this.moved = 0;
    this.dragStart = { x: event.clientX, y: event.clientY, yaw: this.yaw, pitch: this.pitch };
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.dragging && this.moved < 6 && this.options.interactive) {
      const record = this.pickKey(event.clientX, event.clientY);
      if (record) {
        this.press(record.def.code, true);
        window.setTimeout(() => this.release(record.def.code), 120);
        this.options.onKeyClick?.(record.def.code);
      }
    }
    this.dragging = false;
    this.renderer.domElement.releasePointerCapture?.(event.pointerId);
  };

  private onPointerLeave = () => {
    this.hoverCode = null;
    this.dragging = false;
    this.start();
  };

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0012);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance * factor,
      this.defaultDistance() * 0.45,
      this.defaultDistance() * 1.6
    );
    this.start();
  };

  /* ---------------------------------------------------------------- */
  /* public API                                                        */
  /* ---------------------------------------------------------------- */

  setModel(modelId: string) {
    const model = getModel(modelId);
    if (model.id === this.model.id) return;
    this.model = model;
    this.layout = getLayout(model.layoutId);
    this.rebuild();
    this.start();
  }

  setTheme(theme: Theme) {
    if (theme === this.options.theme) return;
    this.options.theme = theme;
    if (this.keycapUniforms.uEmissive) {
      this.keycapUniforms.uEmissive.value = theme === 'light' ? 0.5 : 0.95;
    }
    this.applyFingerHints();
    this.start();
  }

  setFingerHints(on: boolean) {
    if (on === this.options.fingerHints) return;
    this.options.fingerHints = on;
    this.applyFingerHints();
    this.start();
  }

  setShowNextKey(on: boolean) {
    this.options.showNextKey = on;
    this.start();
  }

  setRgbStyle(style: RgbStyle) {
    this.options.rgbStyle = style;
    this.start();
  }

  setHeatmap(heat: Record<string, number>) {
    this.heat = heat;
    this.start();
  }

  press(code: string, correct = true) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.pressVelocity = 1;
    record.press = Math.max(record.press, 0.001);
    if (!correct) record.flash = 1;
    this.start();
  }

  release(code: string) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.pressVelocity = -1;
    this.start();
  }

  highlight(code: string | null) {
    if (code === this.nextCode) return;
    this.nextCode = code;
    this.start();
  }

  error(code: string) {
    const record = this.byCode.get(code);
    if (!record) return;
    record.flash = 1;
    this.start();
  }

  /** A ripple from the centre — used when a session completes. */
  pulse() {
    for (const record of this.records) {
      const delay = Math.hypot(record.def.x - this.layout.width / 2, record.def.y - this.layout.depth / 2) * 0.045;
      window.setTimeout(() => {
        record.pressVelocity = 1;
        record.press = Math.max(record.press, 0.001);
        window.setTimeout(() => {
          record.pressVelocity = -1;
        }, 90);
      }, delay * 1000);
    }
    this.start();
  }

  reset() {
    this.yaw = 0;
    this.pitch = 0.66;
    this.targetYaw = 0;
    this.targetPitch = 0.66;
    this.targetDistance = this.defaultDistance();
    this.records.forEach(record => {
      record.press = 0;
      record.hover = 0;
      record.flash = 0;
    });
    this.start();
  }

  /* ---------------------------------------------------------------- */
  /* loop                                                              */
  /* ---------------------------------------------------------------- */

  private start() {
    if (this.raf || !this.visible || !this.alive) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (!this.alive) return;
    const dt = Math.min(0.05, Math.max(1 / 240, (now - this.last) / 1000));
    this.last = now;
    this.idlePhase += dt;

    /* camera easing */
    const ease = 1 - Math.exp(-dt / 0.12);
    this.yaw += (this.targetYaw - this.yaw) * ease;
    this.pitch += (this.targetPitch - this.pitch) * ease;
    this.distance += (this.targetDistance - this.distance) * ease;

    /* idle drift keeps the board alive without being distracting */
    const drift = this.reducedMotion ? 0 : Math.sin(this.idlePhase * 0.22) * 0.02;
    const savedYaw = this.yaw;
    this.yaw += drift;
    this.applyCamera();
    this.yaw = savedYaw;

    /* key physics */
    const stiffness = 320;
    const damping = 26;
    for (const record of this.records) {
      if (record.press !== 0 || record.pressVelocity !== 0) {
        record.pressVelocity += (-stiffness * record.press - damping * record.pressVelocity) * dt;
        record.press += record.pressVelocity * dt;
        if (Math.abs(record.press) < 0.001 && Math.abs(record.pressVelocity) < 0.01) {
          record.press = 0;
          record.pressVelocity = 0;
        } else {
          record.press = THREE.MathUtils.clamp(record.press, -0.12, 1.2);
        }
      }
      if (record.flash > 0) {
        record.flash = Math.max(0, record.flash - dt * 2.4);
      }
      const hoverTarget = this.hoverCode === record.def.code ? 1 : 0;
      record.hover += (hoverTarget - record.hover) * Math.min(1, dt * 14);
    }

    this.updateBacklight(dt);
    this.flushStateTexture();
    this.flushPressedKeys();

    /* underglow colour follows the average of the animated key colours */
    if (this.underglowMesh) {
      const material = this.underglowMesh.material as THREE.MeshBasicMaterial;
      let r = 0;
      let g = 0;
      let b = 0;
      let glow = 0;
      for (const record of this.records) {
        r += record.rgb.r;
        g += record.rgb.g;
        b += record.rgb.b;
        glow += record.glow;
      }
      const count = Math.max(1, this.records.length);
      material.color.setRGB(r / count, g / count, b / count);
      material.opacity = 0.22 + (glow / count) * 0.5;
    }

    this.renderer.render(this.scene, this.camera);

    /* keep animating while anything is still in motion */
    const busy =
      !this.reducedMotion &&
      (this.records.some(record => record.press !== 0 || record.pressVelocity !== 0 || record.flash > 0) ||
        this.model.backlight !== 'none');
    const moving =
      Math.abs(this.targetYaw - this.yaw) > 0.0004 ||
      Math.abs(this.targetPitch - this.pitch) > 0.0004 ||
      Math.abs(this.targetDistance - this.distance) > 0.02;
    if (this.visible && (busy || moving || !this.reducedMotion)) {
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  private render() {
    this.applyCamera();
    this.updateBacklight(0);
    this.flushStateTexture();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.alive = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.sizeTimer) window.clearInterval(this.sizeTimer);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onLoad) window.removeEventListener('load', this.onLoad);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
    this.clearBoard();
    this.environment?.dispose();
    this.renderer.dispose();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
}

export type { KeyboardModel, RgbStyle };
