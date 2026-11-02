// The Grok Bot pets in 3D: every avatar shape the app offers, built as a soft,
// puffy body (outlines are extruded like a pillow; round ones are spun or squashed
// spheres). Each geometry is normalised to stand on y = 0, about 1.75 tall or wide.

import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PET_SHAPES = ['blob', 'pebble', 'bean', 'egg', 'squircle', 'tablet', 'capsule', 'cylinder', 'hex', 'gem', 'crystal', 'wedge', 'shield', 'dome', 'arch', 'cloud', 'teardrop', 'leaf', 'square', 'sparkle', 'clover', 'flower', 'heart', 'house', 'star', 'pumpkin'];

const V2 = (x, y) => new THREE.Vector2(x, y);

function rounded(pts, r) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const p1 = p.clone().add(a.clone().sub(p).normalize().multiplyScalar(r));
    const p2 = p.clone().add(b.clone().sub(p).normalize().multiplyScalar(r));
    if (i === 0) s.moveTo(p1.x, p1.y);
    else s.lineTo(p1.x, p1.y);
    s.quadraticCurveTo(p.x, p.y, p2.x, p2.y);
  }
  s.closePath();
  return s;
}
const poly = (pts, r) => rounded(pts.map(([x, y]) => V2(x, y)), r);
// a closed outline from a radius that depends on the angle
const polar = (f, n = 96) => new THREE.Shape(Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; const r = f(a); return V2(Math.cos(a) * r, Math.sin(a) * r); }));
const starPts = (k, R, r) => Array.from({ length: k * 2 }, (_, i) => { const a = Math.PI / 2 + (i * Math.PI) / k, d = i % 2 ? r : R; return [Math.cos(a) * d, Math.sin(a) * d]; });

const OUTLINES = {
  squircle: () => polar((a) => 1 / (Math.abs(Math.cos(a)) ** 4 + Math.abs(Math.sin(a)) ** 4) ** 0.25),
  tablet: () => poly([[-0.7, -1], [0.7, -1], [0.7, 1], [-0.7, 1]], 0.5),
  square: () => poly([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]], 0.32),
  hex: () => poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i * Math.PI) / 3), Math.sin((i * Math.PI) / 3)]), 0.3),
  gem: () => poly([[0, -1.05], [1, 0.15], [0.6, 0.85], [-0.6, 0.85], [-1, 0.15]], 0.22),
  crystal: () => poly([[0, 1.15], [0.68, 0.35], [0.48, -1], [-0.48, -1], [-0.68, 0.35]], 0.2),
  wedge: () => poly([[0, 1], [1, -0.75], [-1, -0.75]], 0.36),
  shield: () => poly([[-0.9, 0.9], [0.9, 0.9], [0.9, 0.05], [0, -1.1], [-0.9, 0.05]], 0.3),
  arch: () => { const s = new THREE.Shape(); s.moveTo(-0.85, -0.95); s.lineTo(0.85, -0.95); s.lineTo(0.85, 0.05); s.absarc(0, 0.05, 0.85, 0, Math.PI, false); s.lineTo(-0.85, -0.95); return s; },
  leaf: () => new THREE.Shape(Array.from({ length: 80 }, (_, i) => { const t = (i / 80) * Math.PI * 2; return V2(Math.sin(t) * 0.72 * (1 - 0.15 * Math.cos(t)), Math.cos(t) * 1.05); })),
  sparkle: () => poly(starPts(4, 1.05, 0.36), 0.12),
  star: () => poly(starPts(5, 1.05, 0.52), 0.16),
  clover: () => polar((a) => 0.55 + 0.45 * Math.abs(Math.cos(2 * a)) ** 0.7),
  flower: () => polar((a) => 0.72 + 0.28 * Math.cos(5 * a + Math.PI / 2)),
  heart: () => new THREE.Shape(Array.from({ length: 96 }, (_, i) => { const t = (i / 96) * Math.PI * 2; return V2((16 * Math.sin(t) ** 3) / 16, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16); })),
  house: () => poly([[0, 1.05], [0.95, 0.2], [0.95, -0.9], [-0.95, -0.9], [-0.95, 0.2]], 0.3),
};

const lathe = (f, n = 32) => new THREE.LatheGeometry(Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return V2(Math.max(0.0001, f(t)), t); }), 56);

const SOLIDS = {
  blob: () => new THREE.SphereGeometry(1, 48, 32).scale(1, 0.92, 0.88),
  pebble: () => new THREE.SphereGeometry(1, 48, 32).scale(1.08, 0.72, 0.85),
  bean: () => new THREE.CapsuleGeometry(0.55, 0.75, 12, 36).rotateZ(-0.55),
  egg: () => lathe((t) => 0.78 * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * (1 - 0.18 * t)).scale(1, 1.75, 1),
  capsule: () => new THREE.CapsuleGeometry(0.6, 0.65, 12, 36),
  // superellipse profile: straight sides, rounded rims, closed at both ends
  cylinder: () => lathe((t) => 0.8 * Math.max(0, 1 - Math.abs(2 * t - 1) ** 6) ** (1 / 6), 48).scale(1, 1.55, 1),
  dome: () => lathe((t) => 0.95 * Math.sqrt(Math.max(0, 1 - t ** 2)) * (t < 0.06 ? 0.9 + t * 1.6 : 1)).scale(1, 1.3, 1),
  teardrop: () => lathe((t) => 0.8 * Math.sin(Math.PI * Math.min(1, t * 1.15) ** 0.8) * (1 - t) ** 0.35).scale(1, 1.85, 1),
  cloud: () => mergeGeometries([[0, 0.55, 0, 0.62], [-0.55, 0.35, 0, 0.45], [0.55, 0.38, 0, 0.48], [0.25, 0.95, 0, 0.42], [-0.25, 0.9, 0.05, 0.38]]
    .map(([x, y, z, r]) => new THREE.SphereGeometry(r, 32, 24).translate(x, y, z))),
  pumpkin: () => {
    const g = new THREE.SphereGeometry(1, 64, 40);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ribs = 1 - 0.035 * (1 - Math.cos(Math.atan2(z, x) * 8)); // eight soft, rounded lobes
      p.setXYZ(i, x * ribs * 1.05, y * 0.8, z * ribs * 0.95);
    }
    g.computeVertexNormals();
    return g;
  },
};

function normalise(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  g.scale(1.75 / size, 1.75 / size, 1.75 / size);
  g.computeBoundingBox();
  return g;
}

export function petGeometry(shape) {
  if (OUTLINES[shape]) {
    const g = new THREE.ExtrudeGeometry(OUTLINES[shape](), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.38, bevelSize: 0.3, bevelSegments: 10, curveSegments: 24 });
    return normalise(toCreasedNormals(g, 1.3));
  }
  if (SOLIDS[shape]) return normalise(SOLIDS[shape]());
  return null;
}

// The pumpkin's stem, placed on top of the body after scaling.
export function petExtras(shape, height) {
  if (shape !== 'pumpkin') return [];
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.32, 12), new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.6 }));
  stem.position.set(-0.08, height + 0.08, 0);
  stem.rotation.z = 0.35;
  return [stem];
}
