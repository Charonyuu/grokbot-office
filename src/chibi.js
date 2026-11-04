// Chibi bodies: a small rounded torso, two arms and two legs under the bot's own
// avatar head. One skinned mesh per bot (rigid skinning, one draw call), posed by code:
// joint angles for swings, two-bone IK for hands and feet that must touch something.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HIPS = 0.62; // hip height standing, floor = 0
export const NECK = 0.56; // hips to the bottom of the head
export const HEAD = 1.3; // the head's largest side
const SHOULDER = { x: 0.27, y: 0.44 }; // from the hips
const HIP = { x: 0.14, y: -0.03 };
const ARM = [0.24, 0.24]; // shoulder to elbow, elbow to the middle of the hand
const LEG = [0.29, 0.225]; // hip to knee, knee to the middle of the foot

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function hash(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const OUTFITS = ['tee', 'stripes', 'hoodie', 'overalls', 'scarf'];
const PANTS = ['#3b4660', '#4f6d9a', '#2c2c33', '#8a7058', '#56705a'];
const SHOES = ['#ffffff', '#2a2a2e', '#f3ede2', '#ffcf3f'];

// Clothes picked from the bot's id, tinted from its colour.
export function palette(rec) {
  const h = hash(rec.id || rec.name || rec.shape);
  const base = new THREE.Color(rec.color || '#888888');
  const hsl = {};
  base.getHSL(hsl);
  const white = new THREE.Color('#ffffff');
  const light = base.clone().lerp(white, 0.5);
  const deep = hsl.l < 0.22 ? new THREE.Color('#55555c') : base.clone().multiplyScalar(0.6);
  const comp = new THREE.Color().setHSL((hsl.h + 0.5) % 1, hsl.s < 0.1 ? 0.1 : clamp(hsl.s * 0.7 + 0.1, 0.3, 0.7), 0.6);
  const shirt = [light, new THREE.Color('#f7f7f5'), deep, comp][(h >>> 2) % 4];
  return {
    outfit: OUTFITS[(h >>> 5) % OUTFITS.length],
    skin: base,
    shirt,
    trim: shirt === comp ? light : comp,
    pants: new THREE.Color(PANTS[(h >>> 9) % PANTS.length]),
    shoes: new THREE.Color(SHOES[(h >>> 12) % SHOES.length]),
  };
}

// bones: 0 hips, 1 spine, 2 head, 3 shoulder L, 4 elbow L, 5 shoulder R, 6 elbow R,
// 7 thigh L, 8 knee L, 9 thigh R, 10 knee R. Left is +x (the bot faces +z).
const B = { hips: 0, spine: 1, head: 2, shL: 3, elL: 4, shR: 5, elR: 6, thL: 7, knL: 8, thR: 9, knR: 10 };

function paint(geo, bone, color) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const p = geo.attributes.position, c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.copy(typeof color === 'function' ? color(p.getX(i), p.getY(i), p.getZ(i)) : color);
    col.set([c.r, c.g, c.b], i * 3);
    si[i * 4] = bone;
    sw[i * 4] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return geo;
}

const capsule = (r, len, x, y, z) => new THREE.CapsuleGeometry(r, len, 4, 12).translate(x, y, z);
const sphere = (r, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(x, y, z);

function bodyGeometry(pal) {
  const parts = [];
  const { outfit, skin, shirt, trim, pants, shoes } = pal;
  // torso: a little bean, flattened front to back
  const prof = [[0.001, -0.1], [0.15, -0.09], [0.25, -0.04], [0.3, 0.07], [0.31, 0.2], [0.29, 0.34], [0.24, 0.46], [0.16, 0.54], [0.07, 0.58], [0.001, 0.59]];
  const torso = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 22).scale(1, 1, 0.86).translate(0, HIPS, 0);
  const torsoColor = (x, y, z) => {
    const u = y - HIPS;
    if (outfit === 'overalls') {
      if (u < 0.3) return pants;
      if (z > 0.05 && Math.abs(Math.abs(x) - 0.12) < 0.035) return pants; // straps
      return shirt;
    }
    if (u < 0.08) return pants;
    if (outfit === 'stripes') return Math.floor((u - 0.08) / 0.075) % 2 ? trim : shirt;
    if (outfit === 'hoodie' && z > 0.12 && u > 0.12 && u < 0.24 && Math.abs(x) < 0.17) return trim; // pocket
    return shirt;
  };
  parts.push(paint(torso, B.spine, torsoColor));
  if (outfit === 'tee' || outfit === 'stripes' || outfit === 'overalls') {
    parts.push(paint(new THREE.TorusGeometry(0.15, 0.035, 6, 18).rotateX(Math.PI / 2).translate(0, HIPS + 0.56, 0), B.spine, trim));
  } else if (outfit === 'hoodie') {
    parts.push(paint(new THREE.TorusGeometry(0.17, 0.075, 8, 18).rotateX(Math.PI / 2 - 0.35).translate(0, HIPS + 0.55, -0.05), B.spine, shirt.clone().multiplyScalar(0.85)));
  } else {
    parts.push(paint(new THREE.TorusGeometry(0.17, 0.07, 8, 18).rotateX(Math.PI / 2).translate(0, HIPS + 0.54, 0), B.spine, trim));
    parts.push(paint(capsule(0.055, 0.16, 0.1, HIPS + 0.42, 0.25).rotateZ(0.05), B.spine, trim));
  }
  for (const s of [1, -1]) {
    const sx = s * SHOULDER.x, sy = HIPS + SHOULDER.y;
    const [sh, el] = s > 0 ? [B.shL, B.elL] : [B.shR, B.elR];
    parts.push(paint(capsule(0.088, 0.1, sx, sy - 0.1, 0), sh, outfit === 'overalls' ? shirt : outfit === 'stripes' ? trim : shirt));
    parts.push(paint(capsule(0.075, 0.08, sx, sy - ARM[0] - 0.09, 0), el, skin));
    parts.push(paint(sphere(0.1, sx, sy - ARM[0] - ARM[1], 0), el, skin));
    const hx = s * HIP.x, hy = HIPS + HIP.y;
    const [th, kn] = s > 0 ? [B.thL, B.knL] : [B.thR, B.knR];
    parts.push(paint(capsule(0.112, 0.1, hx, hy - 0.145, 0), th, pants));
    parts.push(paint(capsule(0.1, 0.07, hx, hy - LEG[0] - 0.1, 0), kn, pants));
    parts.push(paint(sphere(1, hx, hy - LEG[0] - LEG[1], 0.045, 0.12, 0.078, 0.18), kn, shoes));
  }
  return mergeGeometries(parts, false);
}

const mats = {
  gloss: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.35 }),
  plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
};
export const bodyMaterial = (gloss) => (gloss ? mats.gloss : mats.plain);

// Props a bot holds while it does things, shared by everyone.
const PROPS = {
  cup: [new THREE.CylinderGeometry(0.09, 0.075, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }), [0, -0.33, 0.03]],
  donut: [new THREE.TorusGeometry(0.1, 0.05, 8, 16), new THREE.MeshStandardMaterial({ color: 0xff8fc1, roughness: 0.5 }), [0, -0.34, 0.03]],
  paddle: [mergeGeometries([new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18).rotateX(Math.PI / 2).translate(0, -0.22, 0), new THREE.CylinderGeometry(0.03, 0.03, 0.14, 8).translate(0, -0.03, 0)]), new THREE.MeshStandardMaterial({ color: 0xe53935, roughness: 0.5 }), [0, -0.26, 0]],
  controller: [new THREE.BoxGeometry(0.38, 0.08, 0.17), new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.4 }), null],
  bowl: [new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }), null],
};

const X = V(1, 0, 0);
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _mh = new THREE.Matrix4(), _ms = new THREE.Matrix4(), _mr = new THREE.Matrix4(), _mi = new THREE.Matrix4();
const _e = new THREE.Euler(), _v = V(0, 0, 0), _p = V(0, 0, 0), _one = V(1, 1, 1);

// Two-bone IK in the joint's parent space: rotation for the upper bone and the bend
// of the lower one. fold is +1 for elbows (forearm folds forward), -1 for knees.
function ik(target, a, b, pole, fold, outQ) {
  const d = clamp(target.length(), Math.abs(a - b) + 0.02, a + b - 0.002);
  const bend = Math.PI - Math.acos(clamp((a * a + b * b - d * d) / (2 * a * b), -1, 1));
  const H = V(0, -a - b * Math.cos(bend), fold * b * Math.sin(bend)).normalize();
  const W = V(fold, 0, 0);
  const F = H.clone().cross(W);
  const u = target.clone().normalize();
  const f = pole.clone().multiplyScalar(-1);
  f.addScaledVector(u, -f.dot(u));
  if (f.lengthSq() < 1e-6) f.set(0, 0, fold).addScaledVector(u, -u.z * fold);
  f.normalize();
  const w = f.clone().cross(u);
  _m1.makeBasis(H, W, F);
  _m2.makeBasis(u, w, f);
  _m2.multiply(_m1.transpose());
  outQ.setFromRotationMatrix(_m2);
  return bend;
}

export class Chibi {
  constructor(rec, gloss) {
    this.pal = palette(rec);
    const bones = Object.keys(B).map(() => new THREE.Bone());
    const at = (i, parent, x, y, z) => { bones[i].position.set(x, y, z); bones[parent]?.add(bones[i]); };
    at(B.hips, -1, 0, HIPS, 0);
    at(B.spine, B.hips, 0, 0, 0);
    at(B.head, B.spine, 0, NECK, 0);
    at(B.shL, B.spine, SHOULDER.x, SHOULDER.y, 0);
    at(B.elL, B.shL, 0, -ARM[0], 0);
    at(B.shR, B.spine, -SHOULDER.x, SHOULDER.y, 0);
    at(B.elR, B.shR, 0, -ARM[0], 0);
    at(B.thL, B.hips, HIP.x, HIP.y, 0);
    at(B.knL, B.thL, 0, -LEG[0], 0);
    at(B.thR, B.hips, -HIP.x, HIP.y, 0);
    at(B.knR, B.thR, 0, -LEG[0], 0);
    this.bones = bones;
    this.mesh = new THREE.SkinnedMesh(bodyGeometry(this.pal), bodyMaterial(gloss));
    this.mesh.add(bones[B.hips]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.castShadow = true;
    // poses reach well outside the bind pose (lying down, arms up): a generous fixed sphere
    this.mesh.boundingSphere = new THREE.Sphere(V(0, 1.1, 0), 2.2);
    this.head = bones[B.head]; // the avatar head goes here
    this.target = bones.map(() => new THREE.Quaternion());
    this.hips = V(0, HIPS, 0);
    this.props = {};
    this.headFront = 0.4;
    this.headHalf = 0.6;
  }

  setGloss(gloss) { this.mesh.material = bodyMaterial(gloss); }

  prop(name, on) {
    let m = this.props[name];
    if (!m && !on) return;
    if (!m) {
      const [geo, mat, off] = PROPS[name];
      m = this.props[name] = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      if (name === 'controller') { m.position.set(0, 0.27, 0.38); this.bones[B.spine].add(m); }
      else if (name === 'bowl') { m.position.set(0.04, 0.22, 0.42); this.bones[B.spine].add(m); }
      else { m.position.set(...off); this.bones[B.elR].add(m); }
    }
    m.visible = on;
  }

  // the middle of a hand, in world space
  hand(side, out) {
    return this.bones[side > 0 ? B.elL : B.elR].localToWorld(out.set(0, -ARM[1], 0));
  }

  // P: { hy, hz, hp, sp, sr, syaw, hx, hr, hyaw, aL, aR, lL, lR, prop }
  // limbs: { a: [x, z, bend] } joint angles, or { t: Vector3, p: Vector3 } body-space
  // target and pole (right side given as is, not mirrored).
  apply(P, k) {
    const bones = this.bones, T = this.target;
    this.hips.set(0, P.hy ?? HIPS, P.hz ?? 0);
    T[B.hips].setFromEuler(_e.set(P.hp || 0, 0, 0));
    T[B.spine].setFromEuler(_e.set(P.sp || 0, P.syaw || 0, P.sr || 0));
    T[B.head].setFromEuler(_e.set(P.hx || 0, P.hyaw || 0, P.hr || 0));
    // the target frames of hips and spine, for IK targets given in body space
    const mh = _mh.compose(this.hips, T[B.hips], _one);
    const ms = _ms.multiplyMatrices(mh, _mr.makeRotationFromQuaternion(T[B.spine]));
    const limb = (spec, up, low, joint, frame, len, fold) => {
      if (!spec) spec = { a: [0, 0, 0] };
      if (spec.a) {
        const [x, z, bend] = spec.a;
        T[up].setFromEuler(_e.set(x, 0, z));
        T[low].setFromAxisAngle(X, -fold * bend);
        return;
      }
      _mi.copy(frame).invert();
      const t = _v.copy(spec.t).applyMatrix4(_mi).sub(joint);
      const pole = _p.copy(spec.p || V(0, 0, -fold)).transformDirection(_mi);
      const bend = ik(t, len[0], len[1], pole, fold, T[up]);
      T[low].setFromAxisAngle(X, -fold * bend);
    };
    limb(P.aL, B.shL, B.elL, bones[B.shL].position, ms, ARM, 1);
    limb(P.aR, B.shR, B.elR, bones[B.shR].position, ms, ARM, 1);
    limb(P.lL, B.thL, B.knL, bones[B.thL].position, mh, LEG, -1);
    limb(P.lR, B.thR, B.knR, bones[B.thR].position, mh, LEG, -1);
    bones[B.hips].position.lerp(this.hips, k);
    for (let i = 0; i < bones.length; i++) bones[i].quaternion.slerp(T[i], k);
    for (const name in this.props) this.props[name].visible = P.prop === name || (Array.isArray(P.prop) && P.prop.includes(name));
    if (P.prop) for (const name of [].concat(P.prop)) this.prop(name, true);
  }
}

// mirror a left-side limb spec onto the right
export const mirror = (s) => (s.a ? { a: [s.a[0], -s.a[1], s.a[2]] } : { t: V(-s.t.x, s.t.y, s.t.z), p: s.p ? V(-s.p.x, s.p.y, s.p.z) : undefined });
export { V as vec, HIP, SHOULDER, ARM, LEG };
