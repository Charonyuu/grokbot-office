// The building: one open-plan floor per team, stacked. Every bot on a floor has its
// own named desk; the rest of the floor is a Google-office-style campus (café, gym,
// lounge) where bots on a break go and hang out. Everything is drawn from code.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const H = 7.5;
const WALL_H = H - 0.5;
const LIFT = 34; // how far a floor rises when the building is cut open below it
const ZONE_W = 28; // width of the café / gym / lounge side of a floor
const SPREAD_GAP = 14; // space between floors laid out side by side (the walls are tall)
// Desks come in pods of four: two pairs facing each other across a low planter.
const DESK_W = 2.0, DESK_D = 1.0, PAIR_X = 2.1; // a desk, and the pitch of the two side by side
const SEAT_Z = 2.0; // from the pod's centre line to each chair
const POD_X = 6.4, POD_Z = 8.6; // pod pitch: a narrow gap side to side, a clear aisle front to back

// How big a floor has to be so every bot on its busiest team gets its own desk.
export function floorPlan(n) {
  n = Math.max(1, n | 0);
  const desks = Math.max(6, n);
  const pods = Math.ceil(desks / 4);
  const rows = Math.max(2, Math.ceil(Math.sqrt(pods / 1.4)));
  const cols = Math.max(1, Math.ceil(pods / rows));
  const deskLen = cols * POD_X;
  const W = 15.3 + deskLen + 3.4 + ZONE_W + 0.6;
  const D = Math.max(22, rows * POD_Z + 8);
  return { rows, cols, pods, desks, deskLen, W, D, seats: pods * 4, key: `${rows}x${cols}x${pods}` };
}

// one personal thing per bot, picked from its id, always in the same corner of the desk
const ITEMS = ['plant', 'cactus', 'mug', 'plush', 'frame', 'fishbowl', 'trophy', 'books', 'headphones', 'donut'];

function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const cache = new Map();
// one shared material per colour, so a floor bakes down to a few dozen draw calls
const C = (color, o = {}) => {
  const k = `${color}|${JSON.stringify(o)}`;
  if (!cache.has(k)) cache.set(k, mat(color, o));
  return cache.get(k);
};
// Google-ish primaries plus a few playful pastels
export const G = { blue: 0x4285f4, red: 0xea4335, yellow: 0xfbbc05, green: 0x34a853, teal: 0x14b8a6, purple: 0x8e6cf1, pink: 0xff7eb6, orange: 0xff8a3d };
const PRIMARY = [G.blue, G.red, G.yellow, G.green];

const M = {
  top: mat(0xf6f6f3, { roughness: 0.95 }),
  edge: mat(0xd9d9d6),
  wall: mat(0xfafaf9, { roughness: 0.95 }),
  frame: mat(0x1c1c1e, { roughness: 0.45, metalness: 0.3 }),
  band: mat(0x2b3038, { roughness: 0.15, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xeef3f6, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
  desk: mat(0xf1eadb, { roughness: 0.6 }),
  white: mat(0xffffff, { roughness: 0.5 }),
  laptop: mat(0xc6c7cb, { roughness: 0.35, metalness: 0.6 }),
  leather: mat(0x2a2a2d, { roughness: 0.45 }),
  pot: mat(0xfbfbfb, { roughness: 0.45 }),
  trunk: mat(0x6b5a48),
  leaves: [mat(0x86b36f), mat(0x6a9a5a), mat(0x9cc483)],
  wood: mat(0xd9b98c, { roughness: 0.65 }),
  steel: mat(0xb8bcc4, { roughness: 0.3, metalness: 0.7 }),
  dark: mat(0x2c2f36, { roughness: 0.5 }),
  lift: mat(0x8d8d90, { roughness: 0.5 }),
  walnut: mat(0x9a6b45, { roughness: 0.6 }),
  oak: mat(0xe8d3b0, { roughness: 0.6 }),
  chair: mat(0x3b4048, { roughness: 0.55 }),
};
const PASTEL = { mint: 0xbfeadb, pink: 0xffd1e0, lavender: 0xd9ccff, butter: 0xfff0b3, sky: 0xcfe6ff, peach: 0xffd8bf };
const DECOR_COLORS = [PASTEL.mint, PASTEL.pink, PASTEL.lavender, PASTEL.butter, PASTEL.sky, PASTEL.peach, 0xffe0f0, 0xd6f5e3];

// Little things for desks. Each returns [geometry, material] pairs standing on y = 0
// (the desk top); `mine` is the bot's own colour, r a seeded random.
const cylG = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sphG = (rad, seg = 10) => new THREE.SphereGeometry(rad, seg, Math.max(6, (seg * 0.7) | 0));
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const anyOf = (r, list) => list[Math.floor(r() * list.length)];
const DECOR = {
  plant: (mine, r) => [
    [cylG(0.13, 0.1, 0.2).translate(0, 0.1, 0), C(0xc8734a, { roughness: 0.7 })],
    ...[[0, 0.34, 0], [0.08, 0.29, 0.05], [-0.07, 0.3, -0.05], [0.02, 0.27, -0.09]].map(([x, y, z], k) => [sphG(0.11).translate(x, y, z), M.leaves[k % 3]]),
  ],
  cactus: (mine, r) => [
    [cylG(0.12, 0.1, 0.16).translate(0, 0.08, 0), C(anyOf(r, [G.blue, G.pink, 0xf2f2f2]), { roughness: 0.6 })],
    [new THREE.CapsuleGeometry(0.065, 0.28, 4, 10).translate(0, 0.36, 0), C(0x4f9d5d, { roughness: 0.7 })],
    [new THREE.CapsuleGeometry(0.035, 0.1, 4, 8).rotateZ(0.9).translate(0.09, 0.34, 0), C(0x4f9d5d, { roughness: 0.7 })],
    [sphG(0.04, 8).translate(0, 0.58, 0), C(G.pink, { roughness: 0.5 })],
  ],
  lamp: (mine, r) => {
    const col = C(anyOf(r, [G.yellow, G.red, G.blue, G.green, 0xffffff]), { roughness: 0.4 });
    return [
      [cylG(0.13, 0.14, 0.04, 16).translate(0, 0.02, 0), col],
      [cylG(0.02, 0.02, 0.5, 6).rotateZ(0.25).translate(-0.06, 0.27, 0), M.steel],
      [cylG(0.05, 0.16, 0.16, 16).rotateZ(-0.7).translate(-0.1, 0.52, 0), col],
      [sphG(0.05, 8).translate(-0.05, 0.47, 0), C(0xfff3b0, { emissive: 0xffd36b, emissiveIntensity: 1.2 })],
    ];
  },
  mug: (mine, r) => [
    [cylG(0.08, 0.07, 0.16, 14).translate(0, 0.08, 0), mine],
    [new THREE.TorusGeometry(0.05, 0.015, 6, 12).translate(0.085, 0.09, 0), mine],
    [cylG(0.07, 0.07, 0.01, 12).translate(0, 0.15, 0), C(0x6b4226, { roughness: 0.4 })],
  ],
  plush: (mine, r) => [
    [sphG(0.15, 14).scale(1, 0.9, 0.9).translate(0, 0.14, 0), mine],
    [sphG(0.05, 8).translate(-0.09, 0.27, 0), mine],
    [sphG(0.05, 8).translate(0.09, 0.27, 0), mine],
    [new THREE.CapsuleGeometry(0.015, 0.03, 2, 6).translate(-0.045, 0.17, -0.13), M.white],
    [new THREE.CapsuleGeometry(0.015, 0.03, 2, 6).translate(0.045, 0.17, -0.13), M.white],
  ],
  miniflag: (mine, r) => [
    [cylG(0.06, 0.07, 0.04).translate(0, 0.02, 0), M.dark],
    [cylG(0.01, 0.01, 0.45, 6).translate(0, 0.24, 0), M.steel],
    [boxG(0.22, 0.14, 0.01).translate(0.11, 0.39, 0), mine],
  ],
  frame: (mine, r) => [
    [boxG(0.3, 0.24, 0.03).rotateX(-0.25).translate(0, 0.13, 0), anyOf(r, [M.wood, M.walnut, M.dark, M.white])],
    [boxG(0.24, 0.18, 0.01).rotateX(-0.25).translate(0, 0.135, -0.02), C(anyOf(r, [PASTEL.sky, PASTEL.peach, PASTEL.mint]), { roughness: 0.4 })],
    [sphG(0.035, 8).translate(0.03, 0.14, -0.035), mine],
  ],
  books: (mine, r) => [0, 1, 2].map((k) => [boxG(0.32 - k * 0.03, 0.06, 0.22).rotateY((r() - 0.5) * 0.5).translate(0, 0.03 + k * 0.062, 0), C(anyOf(r, [G.blue, G.red, G.yellow, G.green, G.purple, G.teal]), { roughness: 0.6 })]),
  headphones: (mine, r) => {
    const col = C(anyOf(r, [0x2c2f36, G.pink, G.blue, 0xffffff]), { roughness: 0.4 });
    return [
      [cylG(0.05, 0.06, 0.03).translate(0, 0.015, 0), M.dark],
      [cylG(0.012, 0.012, 0.3, 6).translate(0, 0.17, 0), M.steel],
      [new THREE.TorusGeometry(0.12, 0.02, 6, 16, Math.PI).translate(0, 0.3, 0), col],
      [cylG(0.055, 0.055, 0.05, 12).rotateZ(Math.PI / 2).translate(-0.12, 0.3, 0), col],
      [cylG(0.055, 0.055, 0.05, 12).rotateZ(Math.PI / 2).translate(0.12, 0.3, 0), col],
    ];
  },
  fan: (mine, r) => {
    const col = C(anyOf(r, [PASTEL.mint, PASTEL.sky, PASTEL.pink, 0xffffff]), { roughness: 0.5 });
    return [
      [cylG(0.08, 0.09, 0.03, 14).translate(0, 0.015, 0), col],
      [cylG(0.015, 0.015, 0.2, 6).translate(0, 0.12, 0), M.steel],
      [new THREE.TorusGeometry(0.12, 0.012, 6, 20).translate(0, 0.3, 0), col],
      [sphG(0.035, 8).translate(0, 0.3, 0), M.dark],
      ...[0, 1, 2].map((k) => [boxG(0.2, 0.05, 0.005).rotateZ((k * Math.PI) / 3).translate(0, 0.3, 0.01), M.white]),
    ];
  },
  fishbowl: (mine, r) => [
    [cylG(0.08, 0.09, 0.02, 14).translate(0, 0.01, 0), C(0xe8d9b5, { roughness: 0.9 })],
    [sphG(0.15, 16).translate(0, 0.15, 0), M.bowl],
    [sphG(0.04, 8).scale(1.6, 1, 0.7).translate(0.02, 0.15, 0), C(0xff8c1a, { roughness: 0.4 })],
  ],
  trophy: (mine, r) => [
    [boxG(0.14, 0.06, 0.14).translate(0, 0.03, 0), M.dark],
    [cylG(0.02, 0.03, 0.1, 8).translate(0, 0.11, 0), M.gold],
    [cylG(0.1, 0.05, 0.14, 14).translate(0, 0.23, 0), M.gold],
    [new THREE.TorusGeometry(0.045, 0.012, 6, 10).translate(-0.1, 0.24, 0), M.gold],
    [new THREE.TorusGeometry(0.045, 0.012, 6, 10).translate(0.1, 0.24, 0), M.gold],
  ],
  donut: (mine, r) => [
    [cylG(0.16, 0.14, 0.02, 16).translate(0, 0.01, 0), M.white],
    [new THREE.TorusGeometry(0.075, 0.04, 8, 14).rotateX(Math.PI / 2).translate(0, 0.06, 0), C(anyOf(r, [G.pink, PASTEL.lavender, 0x8b5a2b]), { roughness: 0.6 })],
  ],
};
M.bowl = new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false });
M.gold = mat(0xf4c542, { roughness: 0.25, metalness: 0.8 });
// what the day/night cycle (main.js) tints: window glass and the desk lamps' bulbs
export const NIGHT_MATS = { glass: M.glass, bulb: C(0xfff3b0, { emissive: 0xffd36b, emissiveIntensity: 1.2 }) };
M.decorVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function shade(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, material, x, y, z, r = 0) {
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const m = shade(new THREE.Mesh(geo, material));
  m.position.set(x, y, z);
  return m;
}

function cyl(rt, rb, h, material, x, y, z, seg = 20) {
  const m = shade(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material));
  m.position.set(x, y, z);
  return m;
}

function ball(r, material, x, y, z, seg = 14) {
  const m = shade(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), material));
  m.position.set(x, y, z);
  return m;
}

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowWall(len) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H), M.glass);
  glass.position.y = WALL_H / 2;
  g.add(glass);
  g.add(box(len, 0.14, 0.2, M.frame, 0, 0.07, 0));
  g.add(box(len, 0.14, 0.2, M.frame, 0, WALL_H - 0.07, 0));
  g.add(box(len, 0.08, 0.08, M.frame, 0, 1.2, 0.25));
  const n = Math.round(len / 3);
  for (let i = 0; i <= n; i++) g.add(box(0.12, WALL_H, 0.2, M.frame, -len / 2 + (i * len) / n, WALL_H / 2, 0));
  return g;
}

function plant(x, z, s = 1) {
  const g = new THREE.Group();
  const r = rng(Math.round(x * 97 + z * 31));
  g.add(cyl(0.42, 0.34, 0.85, M.pot, 0, 0.425, 0));
  g.add(cyl(0.05, 0.07, 1.4, M.trunk, 0, 1.4, 0, 8));
  const leafGeo = new THREE.SphereGeometry(1, 12, 9);
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, d = 0.15 + r() * 0.5;
    const leaf = shade(new THREE.Mesh(leafGeo, M.leaves[i % 3]));
    leaf.scale.setScalar(0.3 + r() * 0.25);
    leaf.position.set(Math.cos(a) * d, 2.1 + r() * 0.8, Math.sin(a) * d);
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  return g;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function teamScreen(team, number) {
  const tex = canvasTex(768, 384, (x) => {
    x.fillStyle = '#17171a';
    x.fillRect(0, 0, 768, 384);
    x.fillStyle = '#7a7a82';
    x.font = '700 34px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(`FLOOR ${number}`, 52, 86);
    x.fillStyle = '#ffffff';
    x.font = '800 96px "Plus Jakarta Sans", system-ui, sans-serif';
    x.fillText(team, 52, 196, 664);
    const r = rng(number * 13 + team.length);
    const cols = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
    for (let i = 0; i < 14; i++) {
      const h = 20 + r() * 80;
      x.fillStyle = cols[i % 4];
      x.globalAlpha = 0.9;
      x.fillRect(52 + i * 47, 340 - h, 28, h);
    }
  });
  const g = new THREE.Group();
  g.add(box(6.7, 3.5, 0.12, M.frame, 0, 0, -0.08));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  g.add(face);
  g.userData.tex = tex;
  return g;
}

// A zone's floor: a soft coloured rug with a pattern and the zone's name painted on.
function rugTex(w, d, base, dots, label, ink) {
  const px = 40;
  return canvasTex(Math.round(w * px), Math.round(d * px), (x, cw, ch) => {
    x.fillStyle = base;
    x.fillRect(0, 0, cw, ch);
    const r = rng(cw * 7 + ch);
    for (let i = 0; i < (cw * ch) / 2600; i++) {
      x.fillStyle = dots[i % dots.length];
      x.globalAlpha = 0.5;
      x.beginPath();
      x.arc(r() * cw, r() * ch, 4 + r() * 7, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    x.strokeStyle = ink;
    x.lineWidth = 10;
    x.setLineDash([26, 16]);
    x.strokeRect(14, 14, cw - 28, ch - 28);
    x.setLineDash([]);
    x.font = `600 ${Math.round(px * 1.7)}px Fredoka, "Plus Jakarta Sans", system-ui, sans-serif`;
    x.fillStyle = ink;
    x.globalAlpha = 0.85;
    x.textAlign = 'right';
    x.fillText(label, cw - 40, ch - 40);
  });
}

// Melt every static mesh under `root` into one mesh per material, so a floor
// costs a few dozen draw calls instead of hundreds. Meshes marked keep stay.
function bake(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const melted = [];
  root.traverse((o) => {
    if (!o.isMesh || o.userData.keep || Array.isArray(o.material)) return;
    let g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!buckets.has(o.material)) buckets.set(o.material, { geos: [], cast: o.castShadow, receive: o.receiveShadow });
    buckets.get(o.material).geos.push(g);
    melted.push(o);
  });
  for (const o of melted) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const [material, b] of buckets) {
    const m = new THREE.Mesh(mergeGeometries(b.geos), material);
    m.castShadow = b.cast;
    m.receiveShadow = b.receive;
    root.add(m);
    for (const g of b.geos) g.dispose();
  }
  // empty groups left behind cost a traverse every frame
  const empty = [];
  root.traverse((o) => { if (o !== root && !o.isMesh && !o.children.length && o.type === 'Group') empty.push(o); });
  for (const o of empty) o.removeFromParent();
}

// A floor seen from outside: white shell with one dark ribbon window.
function facade(W, D) {
  const g = new THREE.Group();
  const t = 0.3;
  g.add(box(W + 0.6, WALL_H, t, M.wall, 0, WALL_H / 2, D / 2 + 0.15));
  g.add(box(W + 0.6, WALL_H, t, M.wall, 0, WALL_H / 2, -D / 2 - 0.15));
  g.add(box(t, WALL_H, D + 0.6, M.wall, W / 2 + 0.15, WALL_H / 2, 0));
  g.add(box(t, WALL_H, D + 0.6, M.wall, -W / 2 - 0.15, WALL_H / 2, 0));
  g.add(box(W + 0.4, WALL_H, D + 0.4, M.wall, 0, WALL_H / 2, 0));
  const bh = 2.4, by = 3.7;
  g.add(box(W + 0.7, bh, 0.1, M.band, 0, by, D / 2 + 0.32));
  g.add(box(0.1, bh, D + 0.7, M.band, W / 2 + 0.32, by, 0));
  for (let x = -W / 2 + 3; x < W / 2; x += 3) g.add(box(0.14, bh, 0.06, M.wall, x, by, D / 2 + 0.39));
  for (let z = -D / 2 + 2.5; z < D / 2; z += 2.5) g.add(box(0.06, bh, 0.14, M.wall, W / 2 + 0.39, by, z));
  // a strip of colour under the window band, so floors read as one campus
  PRIMARY.forEach((c, i) => g.add(box((W + 0.7) / 4, 0.25, 0.1, C(c, { roughness: 0.6 }), -W / 2 - 0.35 + ((W + 0.7) / 4) * (i + 0.5), by - bh / 2 - 0.35, D / 2 + 0.32)));
  return g;
}

// ---------- walking: a coarse grid over the floor and A* through it ----------

const CELL = 0.4;
const BODY_R = 0.8; // how far walking bots keep from furniture

class Nav {
  constructor(W, D, blocks) {
    this.W = W; this.D = D;
    this.nx = Math.ceil(W / CELL);
    this.nz = Math.ceil(D / CELL);
    const g = (this.grid = new Uint8Array(this.nx * this.nz));
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = -W / 2 + (i + 0.5) * CELL, z = -D / 2 + (j + 0.5) * CELL;
        let b = x < -W / 2 + 0.35 + BODY_R || x > W / 2 - 0.5 || z < -D / 2 + BODY_R || z > D / 2 - 0.5;
        for (let k = 0; !b && k < blocks.length; k++) {
          const o = blocks[k];
          b = o.r != null ? Math.hypot(x - o.x, z - o.z) < o.r + BODY_R : Math.abs(x - o.x) < o.w / 2 + BODY_R && Math.abs(z - o.z) < o.d / 2 + BODY_R;
        }
        g[j * this.nx + i] = b ? 1 : 0;
      }
    }
  }

  cell(x, z) {
    const i = THREE.MathUtils.clamp(Math.floor((x + this.W / 2) / CELL), 0, this.nx - 1);
    const j = THREE.MathUtils.clamp(Math.floor((z + this.D / 2) / CELL), 0, this.nz - 1);
    return j * this.nx + i;
  }

  center(c) {
    return V(-this.W / 2 + ((c % this.nx) + 0.5) * CELL, 0, -this.D / 2 + (Math.floor(c / this.nx) + 0.5) * CELL);
  }

  free(x, z, grid = this.grid) {
    return !grid[this.cell(x, z)];
  }

  nearestFree(c, grid) {
    if (!grid[c]) return c;
    const ci = c % this.nx, cj = Math.floor(c / this.nx);
    for (let r = 1; r < 30; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) continue;
          const k = j * this.nx + i;
          if (grid[k]) continue;
          const d = di * di + dj * dj;
          if (d < bd) { bd = d; best = k; }
        }
      }
      if (best >= 0) return best;
    }
    return c;
  }

  // straight line between two cell centres touches no blocked cell
  clear(a, b, grid) {
    const pa = this.center(a), pb = this.center(b);
    const n = Math.ceil(pa.distanceTo(pb) / (CELL * 0.5));
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (grid[this.cell(pa.x + (pb.x - pa.x) * t, pa.z + (pb.z - pa.z) * t)]) return false;
    }
    return true;
  }

  // A* over the grid (8 neighbours), then pulled tight so paths run straight.
  find(from, to, grid) {
    const nx = this.nx, N = grid.length;
    const s = this.nearestFree(this.cell(from.x, from.z), grid);
    const e = this.nearestFree(this.cell(to.x, to.z), grid);
    if (s === e) return [this.center(e)];
    const gs = new Float32Array(N).fill(Infinity);
    const par = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const ei = e % nx, ej = Math.floor(e / nx);
    const hh = (c) => { const dx = Math.abs((c % nx) - ei), dz = Math.abs(Math.floor(c / nx) - ej); return dx + dz - 0.586 * Math.min(dx, dz); };
    const heap = [];
    const push = (c, f) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    gs[s] = 0;
    push(s, hh(s));
    let found = false;
    while (heap.length) {
      const [, c] = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === e) { found = true; break; }
      const ci = c % nx, cj = Math.floor(c / nx);
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nx || j >= this.nz) continue;
          const k = j * nx + i;
          if (grid[k] || closed[k]) continue;
          if (di && dj && (grid[cj * nx + i] || grid[j * nx + ci])) continue; // no corner cutting
          const g2 = gs[c] + (di && dj ? 1.414 : 1);
          if (g2 < gs[k]) { gs[k] = g2; par[k] = c; push(k, g2 + hh(k)); }
        }
      }
    }
    if (!found) return [this.center(e)];
    const cells = [];
    for (let c = e; c >= 0; c = par[c]) cells.push(c);
    cells.reverse();
    const out = [];
    let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.clear(cells[a], cells[b], grid)) b--;
      out.push(this.center(cells[b]));
      a = b;
    }
    return out;
  }
}

// ---------- one floor ----------

export class Floor {
  constructor(team, number, plan) {
    this.team = team;
    this.number = number;
    this.plan = plan;
    const { W, D } = plan;
    this.W = W;
    this.D = D;
    this.blocks = [];
    this.textures = [];
    this.rest = [];
    this.zones = {};
    this.fx = {};
    const g = (this.group = new THREE.Group());
    // inner: the open office; facade: the closed shell shown when you look down on it
    this.inner = new THREE.Group();
    this.facade = facade(W, D);
    this.facade.visible = false;
    g.add(this.inner, this.facade);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, 0.5, D + 0.8), [M.edge, M.edge, M.top, M.edge, M.edge, M.edge]);
    slab.position.y = -0.25;
    slab.receiveShadow = true;
    slab.castShadow = true;
    slab.userData.team = team;
    this.slab = slab;
    g.add(slab);

    const win = windowWall(W);
    win.position.z = -D / 2;
    this.inner.add(win);
    this.inner.add(box(0.35, WALL_H, D, M.wall, -W / 2, WALL_H / 2, 0));
    // Google-coloured stripes on the side wall
    PRIMARY.forEach((c, i) => this.inner.add(box(0.06, WALL_H - 0.6, 0.42, C(c, { roughness: 0.6 }), -W / 2 + 0.2, WALL_H / 2, -D / 2 + 6.2 + i * 0.6)));

    this.screen = teamScreen(team, number);
    this.screen.position.set(-W / 2 + 0.3, 3.9, -D / 2 + 3);
    this.screen.rotation.y = Math.PI / 2;
    this.inner.add(this.screen);

    this.x0 = -W / 2 + 15.3; // desks start here
    this.deskRight = this.x0 + plan.deskLen;
    this.aisleX = this.deskRight + 1.7; // the main corridor between desks and zones
    this.zx0 = this.deskRight + 3.4;
    this.zx1 = W / 2 - 0.6;

    this.seats = this.desks();
    this.codexOffice();
    this.cafe();
    this.gym();
    this.lounge();
    this.liftAndPlants();
    this.nav = new Nav(W, D, this.blocks);
    this.plates = this.makePlates();

    bake(this.inner);
    this.inner.add(this.plates); // after baking: rebuilt whenever who sits where changes
    bake(this.facade);
    this.facade.traverse((o) => { o.userData.team = team; });
  }

  codexOffice() {
    const g = this.inner, left = -this.W / 2 + 0.4, right = left + 11.5;
    const front = this.D / 2 - 0.4, back = front - 8.5, doorZ = back + 4.25;
    g.add(box(11.5, 0.025, 8.5, C(0x202932), (left + right) / 2, 0.015, (front + back) / 2));
    // The building wall closes the left side. Leave a wide opening in the aisle wall.
    const wall = (x, z, w, d) => {
      g.add(box(w, 3.2, d, M.glass, x, 1.6, z));
      g.add(box(w, 0.09, d, M.frame, x, 3.2, z));
      this.solid(x, z, w, d);
    };
    wall((left + right) / 2, back, 11.5, 0.08);
    wall((left + right) / 2, front, 11.5, 0.08);
    for (const [z, d] of [[(back + doorZ - 1.5) / 2, doorZ - 1.5 - back], [(front + doorZ + 1.5) / 2, front - doorZ - 1.5]]) wall(right, z, 0.08, d);
    for (const [x, z] of [[left, back], [right, back], [left, front], [right, front], [right, doorZ - 1.5], [right, doorZ + 1.5]]) g.add(box(0.09, 3.2, 0.09, M.frame, x, 1.6, z));
    const signTex = canvasTex(256, 80, (c) => { c.fillStyle = '#101c20'; c.fillRect(0, 0, 256, 80); c.fillStyle = '#37d9d0'; c.font = 'bold 48px sans-serif'; c.textAlign = 'center'; c.fillText('CODEX', 128, 56); });
    this.textures.push(signTex);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.7), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
    sign.position.set(right, 2.8, doorZ); sign.rotation.y = Math.PI / 2; g.add(sign);
    const tex = canvasTex(256, 256, (c) => { c.fillStyle = '#10201b'; c.fillRect(0, 0, 256, 256); c.font = '14px monospace'; for (let i = 0; i < 16; i++) { c.fillStyle = i % 3 ? '#74e6a1' : '#eefcf4'; c.fillText(['const task = await run();', '  return result.ok;', '// Codex is working', '  applyPatch(files);'][i % 4], 8, 16 + i * 16); } });
    tex.wrapT = THREE.RepeatWrapping; this.textures.push(tex); this.codexTexture = tex;
    this.codexBusyMaterial = new THREE.MeshBasicMaterial({ map: tex });
    this.codexIdleMaterial = new THREE.MeshBasicMaterial({ color: 0x21363a });
    const screenGeo = new THREE.PlaneGeometry(1.3, 0.7);
    this.codexDesks = [];
    for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
      const x = left + 1.45 + col * 2.65, z = back + 1.2 + row * 4;
      g.add(box(2, 0.14, 0.9, M.dark, x, 1.15, z));
      for (const dx of [-0.85, 0.85]) g.add(box(0.1, 1.1, 0.1, M.frame, x + dx, 0.55, z));
      g.add(box(1.4, 0.8, 0.1, M.frame, x, 1.75, z - 0.25));
      const screen = new THREE.Mesh(screenGeo, this.codexIdleMaterial); screen.position.set(x, 1.75, z - 0.19); screen.userData.keep = true; g.add(screen);
      g.add(box(0.5, 0.25, 0.45, M.frame, x + 0.7, 1.34, z + 0.18));
      this.solid(x, z, 2, 0.9);
      this.codexDesks.push({ robotPos: V(x, 0.72, z + 1), face: Math.PI, superviseSpot: { pos: V(x + 0.95, 0, z + 1.5), face: Math.PI }, printerPos: V(x + 0.7, 1.4, z + 0.45), screen });
    }
    this.codexDoor = { pos: V(right, 0, doorZ) };
    this.codexQueue = [-1.5, 0, 1.5].map((dz) => ({ pos: V(right + 1.5, 0, doorZ + dz), face: -Math.PI / 2 }));
    this.codexBoardCanvas = document.createElement('canvas'); this.codexBoardCanvas.width = 512; this.codexBoardCanvas.height = 320;
    const boardTex = new THREE.CanvasTexture(this.codexBoardCanvas); this.textures.push(boardTex); this.codexBoardTexture = boardTex;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.1), new THREE.MeshBasicMaterial({ map: boardTex }));
    board.position.set(-this.W / 2 + 0.21, 4.15, doorZ); board.rotation.y = Math.PI / 2; board.userData.keep = true; g.add(board);
    this.setCodexBoard(null);
  }

  setCodexBoard(summary) {
    const key = JSON.stringify(summary || {}); if (key === this.codexBoardKey) return; this.codexBoardKey = key;
    const c = this.codexBoardCanvas.getContext('2d'); c.fillStyle = '#101c20'; c.fillRect(0, 0, 512, 320);
    c.strokeStyle = '#37d9d0'; c.lineWidth = 3; c.strokeRect(8, 8, 496, 304);
    c.fillStyle = '#7ee7bb'; c.font = 'bold 40px sans-serif'; c.fillText('CODEX TODAY', 24, 52);
    c.fillStyle = '#ffffff'; c.font = 'bold 110px sans-serif'; c.fillText(String(summary?.today || 0), 24, 155);
    c.font = '34px sans-serif'; (summary?.top || []).slice(0, 3).forEach((b, i) => { c.fillStyle = b.color || '#7ee7bb'; c.fillText(`#${i + 1}`, 24, 204 + i * 46); c.fillStyle = '#ffffff'; c.fillText(`${b.name}  ${b.count}`, 85, 204 + i * 46, 400); });
    this.codexBoardTexture.needsUpdate = true;
  }

  solid(x, z, w, d) { this.blocks.push({ x, z, w, d }); }
  round(x, z, r) { this.blocks.push({ x, z, r }); }
  spot(zone, act, x, y, z, face, approach = null) {
    const sp = { zone, act, pos: V(x, y, z), face, approach, taken: null };
    this.rest.push(sp);
    return sp;
  }

  rug(zone, x0, z0, x1, z1, base, dots, label, ink) {
    const w = x1 - x0, d = z1 - z0;
    const tex = rugTex(w, d, base, dots, label, ink);
    this.textures.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
    m.receiveShadow = true;
    this.inner.add(m);
    this.zones[zone] = { x0, z0, x1, z1 };
  }

  // ---------- desks: a standalone workstation for every bot ----------

  // Pods of four separate desks on a straight grid: two desks side by side, facing two
  // more across a low planter. Pods fill from the corridor side; a slot left over gets
  // a tidy bookshelf with plants. Every desk, chair and screen is the same model.
  desks() {
    const { rows, cols, pods } = this.plan;
    const seats = [];
    const carpet = C(0xe9edf3, { roughness: 0.95 }), trim = C(0xc9d2de, { roughness: 0.9 });
    const cx = (this.x0 + this.deskRight) / 2, cw = this.plan.deskLen + 0.6, cd = rows * POD_Z - 0.6;
    this.inner.add(box(cw, 0.02, cd, carpet, cx, 0.01, 0));
    for (const e of [-1, 1]) this.inner.add(box(cw, 0.022, 0.12, trim, cx, 0.011, e * (cd / 2 - 0.06)));
    let k = 0;
    for (let c = 0; c < cols; c++) {
      const x = this.deskRight - POD_X / 2 - c * POD_X;
      for (let r = 0; r < rows; r++) {
        const z = (r - (rows - 1) / 2) * POD_Z;
        if (k++ >= pods) { this.shelfNook(x, z); continue; }
        this.pod(x, z);
        for (const [dx, sz, yaw] of [[-1, -1, 0], [1, -1, 0], [-1, 1, Math.PI], [1, 1, Math.PI]]) {
          // the name flag and lamp on the pod's outer side, the personal thing on the inner one
          const out = yaw ? -dx : dx;
          seats.push(this.station(x + dx * PAIR_X / 2, z + sz * SEAT_Z, yaw, out, seats.length));
        }
      }
    }
    return seats;
  }

  // the planter down the middle of a pod, and the pod's footprint for walkers
  pod(x, z) {
    const g = this.inner;
    const len = PAIR_X * 2 - 0.3, h = 1.45;
    g.add(box(len, 0.3, 0.3, M.white, x, h + 0.2, z, 0.04));
    for (let i = 0; i < 7; i++) g.add(ball(0.17 + (i % 2) * 0.04, M.leaves[i % 3], x - len / 2 + 0.3 + (i * (len - 0.6)) / 6, h + 0.42, z, 10));
    this.solid(x, z, PAIR_X * 2, (SEAT_Z - 1.45 + DESK_D / 2) * 2);
  }

  // a pod slot with nobody to seat: a low bookshelf between two planters, squared up
  shelfNook(x, z) {
    const g = this.inner;
    g.add(box(3.0, 1.1, 0.6, M.white, x, 0.55, z, 0.04));
    for (let b = 0; b < 2; b++) {
      g.add(box(2.8, 0.04, 0.5, M.wood, x, 0.35 + b * 0.5, z + 0.04));
      for (let i = 0; i < 9; i++) g.add(box(0.16, 0.34, 0.4, C(DECOR_COLORS[(b * 9 + i) % DECOR_COLORS.length], { roughness: 0.6 }), x - 1.2 + i * 0.3, 0.37 + b * 0.5 + 0.17, z + 0.05));
    }
    for (const e of [-1, 1]) g.add(plant(x + e * 2.2, z, 0.8));
    this.solid(x, z, 3.0, 0.6);
    for (const e of [-1, 1]) this.round(x + e * 2.2, z, 0.35);
  }

  // One workstation: desk, chair, monitor, keyboard and lamp, all in the desk's own
  // frame (the bot sits at the origin facing +z, the desk in front of it). `out` is
  // which side (-1/1, desk frame) the name flag goes on.
  station(x, z, yaw, out, i) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    grp.rotation.y = yaw;
    this.inner.add(grp);
    const h = 1.45, dz = 1.45;
    // light-oak top on white panel legs, with a modesty panel at the back
    grp.add(box(DESK_W, 0.08, DESK_D, M.oak, 0, h, dz, 0.03));
    for (const ex of [-1, 1]) grp.add(box(0.06, h - 0.04, DESK_D - 0.1, M.white, ex * (DESK_W / 2 - 0.08), (h - 0.04) / 2, dz));
    grp.add(box(DESK_W - 0.2, 0.6, 0.04, M.white, 0, h - 0.4, dz + DESK_D / 2 - 0.08));
    // the chair: charcoal seat and back on a five-star base
    grp.add(cyl(0.46, 0.46, 0.12, M.chair, 0, 0.82, 0, 18));
    grp.add(cyl(0.05, 0.05, 0.7, M.steel, 0, 0.42, 0, 8));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const leg = box(0.5, 0.05, 0.07, M.dark, Math.cos(a) * 0.25, 0.06, Math.sin(a) * 0.25);
      leg.rotation.y = -a;
      grp.add(leg);
    }
    grp.add(box(0.85, 0.75, 0.1, M.chair, 0, 1.35, -0.62, 0.05));
    // monitor and keyboard; the screen lights up while its bot works
    const display = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.48), new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.3, emissive: 0x000000 }));
    display.userData.keep = true;
    display.rotation.y = Math.PI;
    display.scale.set(1.2, 1.1, 1);
    display.position.set(0, 0.29, -0.01);
    grp.add(box(0.36, 0.03, 0.26, M.dark, 0, h + 0.06, 1.72));
    grp.add(box(0.06, 0.45, 0.06, M.dark, 0, h + 0.27, 1.77));
    const screen = new THREE.Group();
    screen.position.set(0, h + 0.38, 1.75);
    screen.add(box(1.0, 0.62, 0.05, M.dark, 0, 0.29, 0.02, 0.02));
    screen.add(display);
    grp.add(screen);
    grp.add(box(0.7, 0.02, 0.22, M.white, 0, h + 0.05, 1.12));
    grp.add(box(0.1, 0.03, 0.15, M.white, -out * 0.55, h + 0.055, 1.14, 0.015));
    // the same white lamp on every desk (it glows at night)
    const lamp = new THREE.Group();
    lamp.position.set(out * 0.8, h + 0.04, 1.72);
    lamp.rotation.y = out > 0 ? 0 : Math.PI;
    for (const [geo, material] of DECOR.lamp(null, () => 0.9)) lamp.add(shade(new THREE.Mesh(geo, material)));
    grp.add(lamp);

    // obstacle for walkers: the chair (the pod's desks are one block, see pod())
    this.round(x, z, 0.45);

    this.inner.updateMatrixWorld(true);
    const inv = this.inner.matrixWorld.clone().invert();
    const frame = new THREE.Matrix4().multiplyMatrices(inv, grp.matrixWorld);
    const at = (lx, y, lz) => V(lx, y, lz).applyMatrix4(frame);
    const approach = at(0, 0, -2.15);
    const flag = [out * 0.9, 1.08];
    return {
      pos: V(x, 0.9, z),
      face: yaw,
      approach: V(approach.x, 0, approach.z),
      display,
      type: 'desk',
      h,
      // where the hands go to type: the desk's near edge, by the keyboard
      reach: { y: h + 0.06, z: 0.95 },
      frame,
      item: [-out * 0.72, 1.62],
      plate: at(flag[0], h + 1.42, flag[1]),
      pole: at(flag[0], h + 0.66, flag[1]),
      i,
    };
  }

  // Every desk's name flag in one mesh, drawn from one canvas; desk decorations in a
  // few merged meshes. Both are rebuilt when who sits where changes.
  makePlates() {
    const n = this.seats.length, cols = 4, rowsN = Math.ceil(n / cols);
    const cw = 256, ch = 72;
    const c = document.createElement('canvas');
    c.width = cols * cw;
    c.height = rowsN * ch;
    this.plateCanvas = c;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.plateTex = tex;
    this.textures.push(tex);
    this.plateRows = rowsN;
    const g = new THREE.Group();
    this.plateMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
    this.poleMesh = new THREE.Mesh(new THREE.BufferGeometry(), M.frame);
    this.poleMesh.castShadow = true;
    for (const m of [this.plateMesh, this.poleMesh]) { m.userData.keep = true; m.visible = false; g.add(m); }
    this.decor = new THREE.Group();
    g.add(this.decor);
    this.plateKey = null;
    this.setPlates([]);
    return g;
  }

  // flags (and their poles) only on desks that have an owner
  plateGeometry(names) {
    const cols = 4, rowsN = this.plateRows;
    const plates = [], poles = [];
    this.seats.forEach((s, i) => {
      if (!names[i]) return;
      const p = new THREE.PlaneGeometry(1.05, 0.3);
      const uv = p.attributes.uv;
      const u0 = (i % cols) / cols, v0 = 1 - (Math.floor(i / cols) + 1) / rowsN;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, u0 + uv.getX(q) / cols, v0 + uv.getY(q) / rowsN);
      p.rotateY(Math.PI / 4);
      p.translate(s.plate.x, s.plate.y, s.plate.z);
      plates.push(p);
      poles.push(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).translate(s.pole.x, s.pole.y, s.pole.z));
    });
    for (const [mesh, list] of [[this.plateMesh, plates], [this.poleMesh, poles]]) {
      mesh.geometry.dispose();
      mesh.geometry = list.length ? mergeGeometries(list) : new THREE.BufferGeometry();
      mesh.visible = list.length > 0;
      for (const q of list) q.dispose();
    }
  }

  // Each bot's desk gets its own things, picked from its id so they never change.
  decorate(names) {
    for (const m of [...this.decor.children]) { m.geometry.dispose(); m.removeFromParent(); }
    const buckets = new Map();
    const put = (geo, material, m4) => {
      let g = geo.applyMatrix4(m4);
      if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
      for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!buckets.has(material)) buckets.set(material, []);
      buckets.get(material).push(g);
    };
    const T = (x, y, z, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    this.seats.forEach((s, i) => {
      const who = names[i];
      if (!who) return;
      const h = hashStr(who.id || who.name);
      const r = rng(h);
      const mine = C(parseInt(String(who.color).replace('#', '').slice(0, 6), 16) || 0x777777, { roughness: 0.45 });
      // one personal thing, and the chair's back in the bot's colour
      const [ix, iz] = s.item;
      for (const [geo, material] of DECOR[ITEMS[h % ITEMS.length]](mine, r)) put(geo, material, s.frame.clone().multiply(T(ix, s.h + 0.05, iz, 0.4)));
      put(new THREE.BoxGeometry(0.75, 0.6, 0.03), mine, s.frame.clone().multiply(T(0, 1.35, -0.69)));
    });
    // plain-coloured bits share one vertex-coloured mesh; glass, gold and lights keep theirs
    const plain = [];
    for (const [material, geos] of [...buckets]) {
      if (material.transparent || material.metalness > 0.5 || material.emissive.getHex() !== 0) continue;
      for (const g of geos) {
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let q = 0; q < n; q++) col.set([material.color.r, material.color.g, material.color.b], q * 3);
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        plain.push(g);
      }
      buckets.delete(material);
    }
    if (plain.length) buckets.set(M.decorVC, plain);
    for (const [material, geos] of buckets) {
      const m = new THREE.Mesh(mergeGeometries(geos), material);
      m.castShadow = true;
      m.receiveShadow = true;
      m.userData.keep = true;
      this.decor.add(m);
      for (const g of geos) g.dispose();
    }
  }

  // names[i] = { id, name, color } for the bot at seat i, or nothing for a free desk
  setPlates(names) {
    const key = this.seats.map((_, i) => (names[i] ? `${names[i].id}\u0001${names[i].name}\u0001${names[i].color}` : '')).join('\u0002');
    if (key === this.plateKey) return;
    this.plateKey = key;
    this.plateGeometry(names);
    this.decorate(names);
    const x = this.plateCanvas.getContext('2d');
    const cw = 256, ch = 72, cols = 4;
    x.clearRect(0, 0, this.plateCanvas.width, this.plateCanvas.height);
    this.seats.forEach((_, i) => {
      const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
      const who = names[i];
      if (!who) return;
      x.fillStyle = who.color;
      x.beginPath();
      x.roundRect(ox + 2, oy + 2, cw - 4, ch - 4, 18);
      x.fill();
      x.fillStyle = '#ffffff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      let size = 38;
      const label = who.name;
      do { x.font = `800 ${size}px "Plus Jakarta Sans", system-ui, sans-serif`; size -= 2; } while (x.measureText(label).width > cw - 28 && size > 18);
      x.strokeStyle = 'rgba(0,0,0,0.25)';
      x.lineWidth = 5;
      x.strokeText(label, ox + cw / 2, oy + ch / 2 + 2, cw - 24);
      x.fillText(label, ox + cw / 2, oy + ch / 2 + 2, cw - 24);
    });
    this.plateTex.needsUpdate = true;
  }

  // Café: a counter with coffee and fruit along the windows, round tables to eat at.
  cafe() {
    const g = this.inner;
    const c = this.zx0, b = -this.D / 2, z1 = -0.8;
    this.rug('cafe', c, b + 0.3, c + 12.6, z1, '#fff1d6', ['#ffb74d', '#ff8a65', '#ffd54f'], 'CAFÉ', '#e8711c');
    // counter: orange front, white top
    g.add(box(8.4, 1.3, 1.2, C(G.orange, { roughness: 0.55 }), c + 4.6, 0.65, b + 1.2, 0.08));
    g.add(box(8.6, 0.1, 1.35, M.white, c + 4.6, 1.35, b + 1.2, 0.04));
    this.solid(c + 4.6, b + 1.2, 8.6, 1.35);
    // coffee machine with a red light and two cups
    g.add(box(1.0, 1.15, 0.75, M.dark, c + 1.6, 1.98, b + 1.15, 0.08));
    g.add(box(0.7, 0.18, 0.5, M.steel, c + 1.6, 1.55, b + 1.45, 0.03));
    g.add(ball(0.06, C(G.red, { emissive: G.red, emissiveIntensity: 0.8 }), c + 1.9, 2.35, b + 1.53, 8));
    for (const [dx, col] of [[-0.75, G.blue], [0.75, G.green]]) g.add(cyl(0.12, 0.1, 0.24, C(col, { roughness: 0.4 }), c + 1.6 + dx, 1.52, b + 1.5, 12));
    // fruit bowl
    g.add(cyl(0.55, 0.3, 0.3, M.white, c + 4.3, 1.55, b + 1.2, 18));
    const fr = rng(7);
    [G.red, G.orange, G.yellow, G.green, G.red, G.yellow].forEach((col, i) => {
      const a = (i / 6) * Math.PI * 2;
      g.add(ball(0.17, C(col, { roughness: 0.45 }), c + 4.3 + Math.cos(a) * 0.28, 1.78 + fr() * 0.08, b + 1.2 + Math.sin(a) * 0.22, 10));
    });
    // donuts on a stand
    g.add(cyl(0.5, 0.5, 0.05, M.white, c + 6.6, 1.65, b + 1.2, 18));
    g.add(cyl(0.05, 0.08, 0.25, M.white, c + 6.6, 1.5, b + 1.2, 8));
    for (const [dx, col] of [[-0.22, G.pink], [0.22, G.yellow], [0, G.purple]]) {
      const d = shade(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.07, 8, 16), C(col, { roughness: 0.6 })));
      d.rotation.x = -Math.PI / 2;
      d.position.set(c + 6.6 + dx, 1.74, b + 1.2 + (dx ? 0.1 : -0.2));
      g.add(d);
    }
    // fridge with drinks
    g.add(box(1.3, 2.6, 1.0, M.steel, c + 11.4, 1.3, b + 1.0, 0.08));
    g.add(box(1.1, 2.2, 0.04, new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.1, emissive: 0x2a5d7a, emissiveIntensity: 0.25 }), c + 11.4, 1.35, b + 1.52));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) g.add(cyl(0.07, 0.07, 0.32, C(PRIMARY[(i + j) % 4], { roughness: 0.4 }), c + 11.0 + j * 0.27, 0.6 + i * 0.7, b + 1.3, 8));
    this.solid(c + 11.4, b + 1.0, 1.3, 1.0);
    // standing at the counter
    this.spot('cafe', 'coffee', c + 1.6, 0, b + 2.95, Math.PI);
    this.spot('cafe', 'snack', c + 4.3, 0, b + 2.95, Math.PI);
    this.spot('cafe', 'coffee', c + 6.9, 0, b + 2.95, Math.PI);
    this.spot('cafe', 'chat', c + 10.3, 0, b + 3.2, Math.PI * 0.85);
    // two round tables with four stools each
    [[c + 3.2, PRIMARY[0]], [c + 9.4, PRIMARY[3]]].forEach(([tx, col], ti) => {
      const tz = -4.2;
      g.add(cyl(0.95, 0.95, 0.08, M.white, tx, 1.36, tz, 32));
      g.add(cyl(0.08, 0.08, 1.3, M.frame, tx, 0.67, tz, 10));
      g.add(cyl(0.5, 0.5, 0.05, M.frame, tx, 0.03, tz, 20));
      this.round(tx, tz, 0.95);
      for (let s = 0; s < 4; s++) {
        const a = Math.PI / 4 + (s * Math.PI) / 2;
        const sx = tx + Math.cos(a) * 1.9, sz = tz + Math.sin(a) * 1.9;
        g.add(cyl(0.4, 0.4, 0.9, C(s % 2 ? col : G.yellow, { roughness: 0.5 }), sx, 0.45, sz, 18));
        this.round(sx, sz, 0.42);
        // a plate and a mug in front of each stool
        const px = tx + Math.cos(a) * 0.55, pz = tz + Math.sin(a) * 0.55;
        g.add(cyl(0.22, 0.18, 0.04, M.white, px, 1.42, pz, 16));
        g.add(ball(0.09, C([G.red, G.green, G.orange, G.yellow][(s + ti) % 4], { roughness: 0.45 }), px, 1.5, pz, 8));
        g.add(cyl(0.08, 0.07, 0.16, C(PRIMARY[(s + ti + 1) % 4], { roughness: 0.4 }), tx + Math.cos(a + 0.5) * 0.5, 1.48, tz + Math.sin(a + 0.5) * 0.5, 10));
        const face = Math.atan2(tx - sx, tz - sz);
        this.spot('cafe', s % 2 ? 'chat' : 'eat', sx, 0.9, sz, face, V(tx + Math.cos(a) * 3.2, 0, tz + Math.sin(a) * 3.2));
      }
    });
  }

  // Gym: treadmills by the window, a ping-pong table, a hoop and yoga mats.
  gym() {
    const g = this.inner;
    const g0 = this.zx0 + 13.2, b = -this.D / 2, z1 = -0.8, x1 = this.zx1;
    this.rug('gym', g0, b + 0.3, x1, z1, '#d7f5df', ['#7fd18f', '#64b5f6', '#a5d6a7'], 'GYM', '#1e8e3e');
    // treadmills, runners face the room
    for (const [tx, col] of [[g0 + 1.5, G.blue], [g0 + 3.9, G.red]]) {
      const tz = b + 2.2;
      g.add(box(1.4, 0.24, 2.8, M.dark, tx, 0.12, tz, 0.06));
      g.add(box(1.1, 0.04, 2.5, mat(0x111214, { roughness: 0.9 }), tx, 0.26, tz));
      for (const ex of [-1, 1]) {
        g.add(box(0.08, 1.4, 0.08, M.steel, tx + ex * 0.66, 0.9, tz + 1.15));
        g.add(box(0.06, 0.06, 1.2, M.steel, tx + ex * 0.66, 1.4, tz + 0.6));
      }
      g.add(box(1.4, 0.4, 0.14, C(col, { roughness: 0.4 }), tx, 1.62, tz + 1.15, 0.04));
      this.solid(tx, tz, 1.4, 2.8);
      this.spot('gym', 'run', tx, 0.28, tz - 0.1, 0, V(tx, 0, tz + 2.6));
    }
    // dumbbell rack
    g.add(box(2.2, 0.9, 0.6, M.dark, g0 + 7.6, 0.45, b + 0.9, 0.05));
    for (let i = 0; i < 4; i++) {
      const dx = g0 + 6.85 + i * 0.5;
      g.add(cyl(0.04, 0.04, 0.5, M.steel, dx, 1.0, b + 0.9, 6).rotateX(Math.PI / 2));
      for (const ez of [-0.22, 0.22]) g.add(cyl(0.13, 0.13, 0.1, C(PRIMARY[i], { roughness: 0.5 }), dx, 1.0, b + 0.9 + ez, 12).rotateX(Math.PI / 2));
    }
    this.solid(g0 + 7.6, b + 0.9, 2.2, 0.6);
    // ping-pong table along x, players at both ends
    const px = g0 + 7.6, pz = -3.5;
    g.add(box(3.0, 0.08, 1.6, C(G.blue, { roughness: 0.5 }), px, 0.98, pz));
    g.add(box(3.02, 0.02, 0.04, M.white, px, 1.03, pz));
    g.add(box(0.03, 0.2, 1.7, M.white, px, 1.12, pz));
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) g.add(box(0.07, 0.95, 0.07, M.frame, px + ex * 1.35, 0.47, pz + ez * 0.7));
    this.solid(px, pz, 3.0, 1.6);
    this.spot('gym', 'pingpong', px - 2.6, 0, pz, Math.PI / 2);
    this.spot('gym', 'pingpong', px + 2.6, 0, pz, -Math.PI / 2);
    this.fx.pp = { center: V(px, 1.08, pz), spots: [this.rest.length - 2, this.rest.length - 1] };
    const ppBall = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mat(0xffa94d, { roughness: 0.4, emissive: 0x552200, emissiveIntensity: 0.3 }));
    ppBall.userData.keep = true;
    ppBall.castShadow = true;
    ppBall.position.copy(this.fx.pp.center);
    g.add(ppBall);
    this.fx.ppBall = ppBall;
    // basketball hoop on the window, shooter facing it
    const hx = x1 - 1.6;
    g.add(box(0.14, 4.4, 0.14, M.steel, hx, 2.2, b + 0.55));
    g.add(box(1.8, 1.2, 0.08, M.white, hx, 4.4, b + 0.75));
    g.add(box(0.7, 0.5, 0.09, C(G.red, { roughness: 0.5 }), hx, 4.2, b + 0.77));
    const rim = shade(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 8, 24), C(G.orange, { roughness: 0.4 })));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(hx, 3.85, b + 1.2);
    g.add(rim);
    this.round(hx, b + 0.8, 0.4);
    this.spot('gym', 'hoops', hx, 0, b + 4.6, Math.PI);
    this.fx.hoop = { spot: this.rest.length - 1, rim: rim.position.clone() };
    const hb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mat(0xf07a1a, { roughness: 0.6 }));
    hb.userData.keep = true;
    hb.castShadow = true;
    hb.position.set(hx + 0.6, 0.24, b + 3.4);
    g.add(hb);
    this.fx.hoopBall = hb;
    // yoga mats
    for (const [mx, col] of [[g0 + 1.6, G.purple], [x1 - 1.6, G.pink]]) {
      g.add(box(1.5, 0.05, 2.3, C(col, { roughness: 0.85 }), mx, 0.03, -2.4, 0.02));
      this.spot('gym', 'yoga', mx, 0.05, -2.4, Math.PI / 4);
    }
  }

  // Lounge: sofa, bean bags in front of a games TV, foosball, an arcade cabinet.
  lounge() {
    const g = this.inner;
    const l = this.zx0, x1 = this.zx1, z0 = 0.8, z1 = this.D / 2 - 0.3;
    this.rug('lounge', l, z0, x1, z1, '#ebe5ff', ['#b39ddb', '#90caf9', '#f48fb1'], 'LOUNGE', '#6a4fd6');
    // a big teal sofa facing the room
    const sx = l + 4.6, sz = 2.6;
    const sofa = C(G.teal, { roughness: 0.9 });
    g.add(box(7.6, 0.6, 1.8, sofa, sx, 0.4, sz, 0.22));
    g.add(box(7.6, 1.1, 0.5, sofa, sx, 0.95, sz - 0.85, 0.2));
    g.add(box(0.5, 0.85, 1.8, sofa, sx - 3.8, 0.55, sz, 0.2));
    g.add(box(0.5, 0.85, 1.8, sofa, sx + 3.8, 0.55, sz, 0.2));
    [G.yellow, G.pink, G.blue].forEach((col, i) => g.add(box(0.9, 0.7, 0.25, C(col, { roughness: 0.9 }), sx - 2.4 + i * 2.4 + 0.7, 1.2, sz - 0.5, 0.12)));
    this.solid(sx, sz - 0.1, 8.1, 2.0);
    // nappers lie along the sofa, head to the armrest
    this.spot('lounge', 'nap', sx - 2.4, 0.7, sz + 0.2, 0, V(sx - 2.4, 0, sz + 2.3)).lie = 1;
    this.spot('lounge', 'relax', sx, 0.7, sz + 0.2, 0, V(sx, 0, sz + 2.3));
    this.spot('lounge', 'nap', sx + 2.4, 0.7, sz + 0.2, 0, V(sx + 2.4, 0, sz + 2.3)).lie = -1;
    // coffee table
    g.add(cyl(0.9, 0.9, 0.08, M.wood, sx, 0.55, 7.0, 32));
    g.add(cyl(0.1, 0.1, 0.5, M.frame, sx, 0.27, 7.0, 10));
    g.add(cyl(0.12, 0.1, 0.2, C(G.red, { roughness: 0.4 }), sx + 0.3, 0.68, 6.9, 10));
    g.add(box(0.6, 0.06, 0.45, C(G.blue, { roughness: 0.6 }), sx - 0.25, 0.62, 7.1));
    this.round(sx, 7.0, 0.9);
    // games corner: TV on a stand, two bean bags in front
    const tvx = l + 13.4;
    g.add(box(3.6, 0.7, 0.8, M.wood, tvx, 0.35, 1.5, 0.05));
    g.add(box(3.3, 1.95, 0.12, M.dark, tvx, 1.75, 1.5, 0.04));
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 1.7), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.25, emissive: 0x000000 }));
    tv.position.set(tvx, 1.75, 1.57);
    tv.userData.keep = true;
    g.add(tv);
    this.fx.tv = tv;
    g.add(box(0.5, 0.12, 0.3, M.white, tvx + 1.2, 0.76, 1.55));
    this.solid(tvx, 1.5, 3.6, 0.8);
    for (const [bx, col] of [[tvx - 1.3, G.red], [tvx + 1.3, G.yellow]]) {
      const bag = shade(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), C(col, { roughness: 0.9 })));
      bag.scale.set(0.95, 0.45, 0.95);
      bag.position.set(bx, 0.3, 4.6);
      g.add(bag);
      this.round(bx, 4.6, 0.85);
      this.spot('lounge', 'game', bx, 0.45, 4.75, Math.PI, V(bx, 0, 6.9));
    }
    this.fx.game = [this.rest.length - 2, this.rest.length - 1];
    // a lone purple bean bag for reading
    const bag = shade(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), C(G.purple, { roughness: 0.9 })));
    bag.scale.set(0.95, 0.45, 0.95);
    bag.position.set(l + 10.0, 0.3, 8.6);
    g.add(bag);
    this.round(l + 10.0, 8.6, 0.85);
    this.spot('lounge', 'relax', l + 10.0, 0.45, 8.6, Math.PI / 4, V(l + 12.4, 0, 8.6));
    // foosball: rods run front to back, players on the long sides
    const fx = l + 20.0, fz = 4.0;
    g.add(box(2.6, 0.55, 1.4, C(G.green, { roughness: 0.6 }), fx, 1.05, fz, 0.06));
    g.add(box(2.4, 0.02, 1.2, mat(0x7fd38a, { roughness: 0.8 }), fx, 1.33, fz));
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) g.add(box(0.12, 0.8, 0.12, M.dark, fx + ex * 1.15, 0.4, fz + ez * 0.55));
    for (let i = 0; i < 4; i++) {
      const rx = fx - 0.9 + i * 0.6;
      const rod = cyl(0.025, 0.025, 2.0, M.steel, rx, 1.4, fz, 6);
      rod.rotation.x = Math.PI / 2;
      g.add(rod);
      for (let p = -1; p <= 1; p++) g.add(box(0.1, 0.25, 0.08, C(i % 2 ? G.red : G.blue, { roughness: 0.5 }), rx, 1.35, fz + p * 0.35));
    }
    this.solid(fx, fz, 2.6, 1.4);
    this.spot('lounge', 'foosball', fx, 0, fz - 1.75, 0);
    this.spot('lounge', 'foosball', fx, 0, fz + 1.75, Math.PI);
    // arcade cabinet
    const ax = x1 - 0.9, az = 2.2;
    g.add(box(1.2, 2.5, 1.1, C(G.purple, { roughness: 0.5 }), ax, 1.25, az, 0.06));
    g.add(box(0.12, 0.5, 1.12, C(G.yellow, { roughness: 0.5 }), ax - 0.55, 2.3, az));
    const arc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.75), new THREE.MeshStandardMaterial({ color: 0x101014, emissive: 0x000000 }));
    arc.position.set(ax - 0.62, 1.75, az);
    arc.rotation.y = -Math.PI / 2;
    arc.userData.keep = true;
    g.add(arc);
    this.fx.arcade = arc;
    this.solid(ax, az, 1.2, 1.1);
    this.spot('lounge', 'game', ax - 1.55, 0, az, Math.PI / 2);
    this.fx.game.push(this.rest.length - 1);
    // armchair
    const chair = new THREE.Group();
    const lc = C(G.orange, { roughness: 0.8 });
    chair.add(box(1.7, 0.6, 1.6, lc, 0, 0.4, 0, 0.18));
    chair.add(box(1.7, 1.1, 0.4, lc, 0, 0.9, -0.62, 0.15));
    chair.add(box(0.35, 0.8, 1.6, lc, -0.85, 0.55, 0, 0.12));
    chair.add(box(0.35, 0.8, 1.6, lc, 0.85, 0.55, 0, 0.12));
    chair.position.set(x1 - 2.0, 0, 8.3);
    chair.rotation.y = -Math.PI * 0.75;
    g.add(chair);
    this.round(x1 - 2.0, 8.3, 1.0);
    const cp = V(0, 0.7, 0.1).applyEuler(chair.rotation).add(chair.position);
    const ca = V(0, 0, 2.0).applyEuler(chair.rotation).add(chair.position);
    this.spot('lounge', 'nap', cp.x, cp.y, cp.z, chair.rotation.y, ca);
    // standing and chatting in the open
    this.spot('lounge', 'chat', l + 16.6, 0, 8.6, Math.PI / 2);
    this.spot('lounge', 'chat', l + 19.0, 0, 8.6, -Math.PI / 2);
  }

  liftAndPlants() {
    const g = this.inner;
    const { W, D } = this;
    // glass lift at the front of the corridor, where new bots arrive (door faces the corridor)
    const lift = new THREE.Group();
    const s = 2.6, half = s / 2;
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) lift.add(box(0.1, WALL_H, 0.1, M.frame, ex * half, WALL_H / 2, ez * half));
    for (const y of [0.05, WALL_H - 0.05]) {
      lift.add(box(s, 0.1, 0.1, M.frame, 0, y, -half));
      lift.add(box(s, 0.1, 0.1, M.frame, 0, y, half));
      lift.add(box(0.1, 0.1, s, M.frame, -half, y, 0));
      lift.add(box(0.1, 0.1, s, M.frame, half, y, 0));
    }
    lift.add(box(s - 0.1, 0.06, s - 0.1, M.lift, 0, 0.03, 0));
    for (const [px, pz, ry] of [[half, 0, Math.PI / 2], [-half, 0, Math.PI / 2], [0, half, 0]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(s, WALL_H), M.glass);
      p.position.set(px, WALL_H / 2, pz);
      p.rotation.y = ry;
      lift.add(p);
    }
    const lz = D / 2 - 1.5;
    lift.position.set(this.aisleX, 0, lz);
    g.add(lift);
    this.spawn = V(this.aisleX, 0, lz);
    this.spawnOut = V(this.aisleX, 0, lz - 2.6);
    // a Google-coloured line down the corridor floor
    PRIMARY.forEach((c, i) => g.add(box(0.12, 0.02, D - 4.6, C(c, { roughness: 0.6 }), this.aisleX - 0.45 + i * 0.3, 0.012, -1.0)));
    const spots = [[this.zx0 + 12.9, -D / 2 + 1.0, 1.0], [this.zx0 + 12.9, 0, 0.8], [this.zx0 + 0.7, D / 2 - 1.0, 0.9], [this.zx0 + 14.5, D / 2 - 1.0, 1.05]];
    for (const [x, z, sc] of spots) {
      g.add(plant(x, z, sc));
      this.round(x, z, 0.42 * sc);
    }
  }

  // Path from where a bot stands to a target: out of its seat (exit), along the free
  // floor, then into the target via its approach point.
  route(from, to, approach, exit, avoid = []) {
    const nav = this.nav;
    let grid = nav.grid;
    if (avoid.length) {
      grid = grid.slice();
      for (const p of avoid) {
        const ci = Math.floor((p.x + this.W / 2) / CELL), cj = Math.floor((p.z + this.D / 2) / CELL);
        for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= nav.nx || j >= nav.nz) continue;
          if (Math.hypot(di, dj) * CELL < 1.5) grid[j * nav.nx + i] = 1;
        }
      }
    }
    const start = exit && !nav.free(from.x, from.z) ? exit : from;
    const end = approach || to;
    const pts = [];
    if (start !== from) pts.push(V(start.x, 0, start.z));
    pts.push(...nav.find(start, end, grid));
    if (approach) pts.push(V(approach.x, 0, approach.z));
    pts.push(to.clone());
    return pts.filter((p, i) => (i === 0 ? Math.hypot(p.x - from.x, p.z - from.z) > 0.05 : p.distanceTo(pts[i - 1]) > 0.05) || i === pts.length - 1);
  }

  setClosed(closed) {
    this.inner.visible = !closed;
    this.facade.visible = closed;
  }

  // A free spot to spend a break at, preferring a different zone from the last one.
  pickRest(id, avoidZone) {
    const free = this.rest.map((r, i) => (r.taken && r.taken !== id ? -1 : i)).filter((i) => i >= 0 && this.rest[i].taken !== id);
    if (!free.length) return this.extraSpot();
    const other = free.filter((i) => this.rest[i].zone !== avoidZone);
    const pool = other.length && Math.random() < 0.7 ? other : free;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Every spot taken: make up a standing one somewhere open in a zone.
  extraSpot() {
    const zones = Object.entries(this.zones);
    for (let tries = 0; tries < 80; tries++) {
      const [zone, z] = zones[tries % zones.length];
      const x = z.x0 + 1.2 + Math.random() * (z.x1 - z.x0 - 2.4);
      const zz = z.z0 + 1.2 + Math.random() * (z.z1 - z.z0 - 2.4);
      if (!this.nav.free(x, zz)) continue;
      if (this.rest.some((r) => Math.hypot(r.pos.x - x, r.pos.z - zz) < 2.4)) continue;
      this.rest.push({ zone, act: 'chat', pos: V(x, 0, zz), face: Math.random() * Math.PI * 2, approach: null, taken: null, extra: true });
      return this.rest.length - 1;
    }
    this.rest.push({ zone: 'lounge', act: 'chat', pos: V(this.aisleX + 2, 0, Math.random() * 6 - 3), face: Math.PI / 4, approach: null, taken: null, extra: true });
    return this.rest.length - 1;
  }

  claimRest(id, avoidZone) {
    let i = this.rest.findIndex((r) => r.taken === id);
    if (i < 0) i = this.pickRest(id, avoidZone);
    this.releaseRest(id);
    this.rest[i].taken = id;
    return i;
  }

  // A different free spot, for a bot on a break that feels like moving.
  moveRest(id) {
    const own = this.rest.findIndex((r) => r.taken === id);
    const cur = this.rest[own];
    // nowhere else free: stay put rather than invent more spots
    if (own >= 0 && !this.rest.some((r) => !r.taken)) return own;
    const i = this.pickRest(id, cur?.zone);
    this.releaseRest(id);
    this.rest[i].taken = id;
    return i;
  }

  releaseRest(id) {
    for (const r of this.rest) if (r.taken === id) r.taken = null;
  }

  dispose() {
    this.group.traverse((o) => o.geometry?.dispose());
    this.screen.userData.tex.dispose();
    for (const t of this.textures) t.dispose();
  }
}

export class Building {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.floors = new Map();
    this.order = [];
    this.key = '';
    this.plan = floorPlan(1);
    this.layout = 'stack'; // or 'spread': every floor side by side, all open
    this.decor = true; // desk decorations (off on the low quality tier)
  }

  setDecor(on) {
    this.decor = on;
    for (const f of this.floors.values()) f.decor.visible = on;
  }

  // biggest: bots on the busiest team, so every floor has a desk for each of its bots
  setTeams(teams, biggest = 1) {
    const plan = floorPlan(biggest);
    const key = `${teams.join('\u0001')}|${plan.key}`;
    if (key === this.key) return false;
    this.key = key;
    this.plan = plan;
    for (const f of this.floors.values()) {
      f.group.removeFromParent();
      f.dispose();
    }
    this.floors.clear();
    this.order = teams.slice();
    teams.forEach((team, i) => {
      const f = new Floor(team, teams.length - i, plan);
      f.decor.visible = this.decor;
      f.base = this.home(f);
      f.group.position.copy(f.base);
      this.root.add(f.group);
      this.floors.set(team, f);
    });
    return true;
  }

  floor(team) {
    return this.floors.get(team);
  }

  get count() {
    return this.order.length;
  }

  grid() {
    const n = Math.max(1, this.count);
    const cols = Math.ceil(Math.sqrt(n));
    return { cols, rows: Math.ceil(n / cols) };
  }

  // where a floor sits: stacked by number, or on a grid in 'spread'
  home(f) {
    if (this.layout !== 'spread') return V(0, (f.number - 1) * H, 0);
    const { cols, rows } = this.grid();
    const i = this.order.indexOf(f.team);
    const { W, D } = this.plan;
    return V(((i % cols) - (cols - 1) / 2) * (W + SPREAD_GAP), 0, (Math.floor(i / cols) - (rows - 1) / 2) * (D + SPREAD_GAP));
  }

  // size of everything on screen, for fitting the camera
  extent() {
    const { W, D } = this.plan;
    if (this.layout !== 'spread') return { w: W, d: D, h: this.count * H };
    const { cols, rows } = this.grid();
    return { w: cols * W + (cols - 1) * SPREAD_GAP, d: rows * D + (rows - 1) * SPREAD_GAP, h: H };
  }

  // Lay every floor out side by side, all open, so every bot is in view at once.
  spread() {
    this.layout = 'spread';
    for (const f of this.floors.values()) {
      f.away = false;
      f.delay = 0;
      f.closeIn = -1;
      f.group.visible = true;
      f.setClosed(false);
    }
  }

  // Cut the building open: floors above the focused one lift away, the higher ones first.
  showUpTo(team) {
    this.layout = 'stack';
    const top = team && this.floors.has(team) ? this.floors.get(team).number : Infinity;
    for (const f of this.floors.values()) {
      const away = f.number > top;
      if (away !== f.away) f.delay = away ? (this.count - f.number) * 0.07 : f.number * 0.06;
      f.away = away;
      if (!away) f.group.visible = true;
      // floors under the one you look at close up; opening is instant (covered by the
      // floors still above), closing waits until the floors above have come back down
      const closed = f.number < Math.min(top, this.count);
      if (!closed) f.setClosed(false);
      f.closeIn = closed ? 0.75 : -1;
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-dt * 5.5);
    for (const f of this.floors.values()) {
      f.lift ??= 0;
      const home = this.home(f);
      f.base ??= home.clone();
      f.base.lerp(home, k);
      if (f.base.distanceTo(home) < 0.01) f.base.copy(home);
      if (f.closeIn >= 0) { f.closeIn -= dt; if (f.closeIn < 0) f.setClosed(true); }
      if (f.delay > 0) { f.delay -= dt; f.group.position.set(f.base.x, f.base.y + f.lift, f.base.z); continue; }
      const target = f.away ? LIFT : 0;
      f.lift += (target - f.lift) * k;
      if (Math.abs(target - f.lift) < 0.01) f.lift = target;
      f.group.position.set(f.base.x, f.base.y + f.lift, f.base.z);
      f.group.visible = !(f.away && f.lift > LIFT - 0.5);
    }
  }

  // Jump straight to the cut, no lift animation.
  snap() {
    for (const f of this.floors.values()) {
      f.delay = 0;
      f.lift = f.away ? LIFT : 0;
      f.base = this.home(f);
      if (f.closeIn >= 0) { f.closeIn = -1; f.setClosed(true); }
    }
    this.update(0);
  }

  slabs() {
    return [...this.floors.values()].filter((f) => !f.away && f.group.visible).flatMap((f) => (f.inner.visible ? [f.slab] : [f.slab, ...f.facade.children]));
  }
}
