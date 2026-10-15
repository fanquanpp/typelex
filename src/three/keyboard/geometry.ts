/**
 * Procedural geometry for the 3D keyboard.
 *
 * Keycaps are built from a radial grid over a rounded rectangle so the top
 * surface can be dished (a real keycap is concave) while keeping a clean
 * perimeter for the side walls. UVs are cell-local — the shader offsets them by
 * a per-instance atlas cell, which is what lets one InstancedMesh carry 104
 * different legends.
 */
import * as THREE from 'three';

export interface KeycapOptions {
  /** width in units */
  width: number;
  /** depth in units */
  depth: number;
  /** height in units */
  height: number;
  /** how deep the top surface dishes, in units */
  dish: number;
  /** how much narrower the top is than the base (0..0.5) */
  taper: number;
  /** corner radius in units */
  radius: number;
  /** vertical wall inset for the side walls, in units */
  skirt: number;
  /** perimeter segments (multiple of 4) */
  segments?: number;
  /** concentric rings from the perimeter to the centre */
  rings?: number;
}

/**
 * Evenly spaced points along a rounded rectangle, traced as a **single simple
 * closed loop**.
 *
 * This matters more than it looks: the keycap top face is built by connecting
 * corresponding points on successive scaled rings, so if the perimeter jumps
 * around (for example walking the top edge and then a corner arc in the wrong
 * direction) the ring-to-ring quads criss-cross and every keycap renders as a
 * bow-tie. Sampling by arc length keeps the loop monotonic and evenly spaced.
 */
const roundedRectPerimeter = (
  hw: number,
  hd: number,
  r: number,
  segments: number
): [number, number][] => {
  const radius = Math.max(0.0001, Math.min(r, Math.min(hw, hd)));
  const sx = Math.max(0, hw - radius);
  const sy = Math.max(0, hd - radius);
  const arc = (Math.PI / 2) * radius;

  /* clockwise from the top edge: edge -> corner arc -> edge -> ... */
  const parts: { len: number; at: (u: number) => [number, number] }[] = [
    { len: 2 * sx, at: u => [-sx + 2 * sx * u, hd] },
    {
      len: arc,
      at: u => {
        const a = (Math.PI / 2) * (1 - u);
        return [sx + radius * Math.cos(a), sy + radius * Math.sin(a)];
      }
    },
    { len: 2 * sy, at: u => [hw, sy - 2 * sy * u] },
    {
      len: arc,
      at: u => {
        const a = -(Math.PI / 2) * u;
        return [sx + radius * Math.cos(a), -sy + radius * Math.sin(a)];
      }
    },
    { len: 2 * sx, at: u => [sx - 2 * sx * u, -hd] },
    {
      len: arc,
      at: u => {
        const a = -Math.PI / 2 - (Math.PI / 2) * u;
        return [-sx + radius * Math.cos(a), -sy + radius * Math.sin(a)];
      }
    },
    { len: 2 * sy, at: u => [-hw, -sy + 2 * sy * u] },
    {
      len: arc,
      at: u => {
        const a = Math.PI - (Math.PI / 2) * u;
        return [-sx + radius * Math.cos(a), sy + radius * Math.sin(a)];
      }
    }
  ];

  const total = parts.reduce((sum, part) => sum + part.len, 0) || 1;
  const points: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    let remaining = (i / segments) * total;
    let point: [number, number] = parts[0].at(0);
    for (let p = 0; p < parts.length; p++) {
      const part = parts[p];
      const last = p === parts.length - 1;
      if (remaining <= part.len || last) {
        point = part.at(part.len > 0 ? Math.min(1, remaining / part.len) : 0);
        break;
      }
      remaining -= part.len;
    }
    points.push(point);
  }
  return points;
};

/**
 * A single keycap. The returned geometry has:
 *   position, normal, uv, and `aSide` (0 = top surface, 1 = side skirt).
 */
export const buildKeycapGeometry = (options: KeycapOptions): THREE.BufferGeometry => {
  const {
    width,
    depth,
    height,
    dish,
    taper,
    radius,
    skirt,
    segments = 24,
    rings = 5
  } = options;

  const baseHw = width / 2;
  const baseHd = depth / 2;
  const topHw = Math.max(0.02, baseHw * (1 - taper));
  const topHd = Math.max(0.02, baseHd * (1 - taper));
  const baseRadius = Math.min(radius, baseHw, baseHd);
  const topRadius = Math.max(0.004, baseRadius * 0.72);

  const positions: number[] = [];
  const uvs: number[] = [];
  const sides: number[] = [];
  const indices: number[] = [];

  /* ---- top surface: concentric rings, dished ---- */
  const ringPoints: [number, number][][] = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = 1 - ring / rings;
    ringPoints.push(roundedRectPerimeter(topHw * t, topHd * t, topRadius * t, segments));
  }
  const centreIndex = 0;
  for (let ring = 0; ring <= rings; ring++) {
    const t = 1 - ring / rings;
    const y = height - dish * (1 - t * t);
    for (const [x, z] of ringPoints[ring]) {
      positions.push(x, y, -z);
      uvs.push((x / topHw + 1) / 2, (z / topHd + 1) / 2);
      sides.push(0);
    }
    void t;
  }
  void centreIndex;

  for (let ring = 0; ring < rings; ring++) {
    const a0 = ring * segments;
    const b0 = (ring + 1) * segments;
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      indices.push(a0 + i, b0 + i, a0 + next);
      indices.push(a0 + next, b0 + i, b0 + next);
    }
  }

  /* ---- side skirt: perimeter at the top, wider ring at the base ---- */
  const wallTop = (rings) * segments;
  const wallBottom = (rings + 1) * segments;
  const bottomHw = baseHw + skirt;
  const bottomHd = baseHd + skirt;
  const bottomPoints = roundedRectPerimeter(bottomHw, bottomHd, baseRadius + skirt * 0.5, segments);
  const topPoints = ringPoints[0];

  for (const [x, z] of topPoints) {
    positions.push(x, height, -z);
    uvs.push(0.5, 0.5);
    sides.push(1);
  }
  for (const [x, z] of bottomPoints) {
    positions.push(x, 0, -z);
    uvs.push(0.5, 0.5);
    sides.push(1);
  }

  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    indices.push(wallTop + i, wallBottom + i, wallTop + next);
    indices.push(wallTop + next, wallBottom + i, wallBottom + next);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  /* deliberately not named `uv`: the material never enables USE_UV, and the
     legend atlas is sampled through this attribute instead */
  geometry.setAttribute('aLegendUv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
};

/** Rounded rectangle shape, used for cases and plates. */
export const roundedRectShape = (width: number, height: number, radius: number) => {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.max(0, Math.min(radius, hw, hh));
  const k = r * 0.4477;
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.bezierCurveTo(hw - k, -hh, hw, -hh + k, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.bezierCurveTo(hw, hh - k, hw - k, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.bezierCurveTo(-hw + k, hh, -hw, hh - k, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.bezierCurveTo(-hw, -hh + k, -hw + k, -hh, -hw + r, -hh);
  return shape;
};

export interface CaseOptions {
  width: number;
  depth: number;
  height: number;
  radius: number;
  bevel: number;
}

/**
 * A rounded slab whose **top face sits at y = 0** and whose body extends
 * downward to y = -height.
 *
 * ExtrudeGeometry grows along +Z, and rotateX(-90°) maps +Z onto +Y, so the
 * slab initially grows upward — which would bury the keycaps inside the case.
 * Translating down by `height` puts the deck at the origin and the body below
 * it, which is where the keycaps and plate expect to sit.
 */
export const buildCaseGeometry = ({ width, depth, height, radius, bevel }: CaseOptions) => {
  const shape = roundedRectShape(width, depth, radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 12
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height, 0);
  geometry.computeVertexNormals();
  return geometry;
};

/** A thin plate that sits just under the keycaps (the switch plate). */
export const buildPlateGeometry = (width: number, depth: number, radius: number) => {
  const shape = roundedRectShape(width, depth, radius);
  const geometry = new THREE.ShapeGeometry(shape, 12);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};

/** A rounded ring (used for the RGB underglow strip and the case rim). */
export const buildRimGeometry = (width: number, depth: number, radius: number, thickness: number) => {
  const outer = roundedRectShape(width, depth, radius);
  const inner = roundedRectShape(width - thickness * 2, depth - thickness * 2, Math.max(0, radius - thickness));
  outer.holes.push(new THREE.Path(inner.getPoints(48).reverse()));
  const geometry = new THREE.ShapeGeometry(outer, 12);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
};
