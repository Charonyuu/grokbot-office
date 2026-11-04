// The bots: little chibi people with the bot's own avatar as their head (shape, colour
// and pill eyes), built from code (no model files).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { petGeometry, petExtras } from './pets.js';
import { Chibi, HIPS, NECK, HEAD, vec, mirror } from './chibi.js';

const SCALE = 1.3;
const SPEED = 3.6;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function roundedShape(pts, r) {
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

function extruded(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: 8, curveSegments: 16 });
  return toCreasedNormals(g, 1.2);
}

function buildGeometry(shape) {
  let g = petGeometry(shape);
  if (g) return g;
  if (shape === 'cube') g = new RoundedBoxGeometry(1.3, 1.3, 1.2, 6, 0.42);
  else if (shape === 'ghost') g = new THREE.CapsuleGeometry(0.62, 0.55, 12, 36);
  else if (shape === 'tri') {
    g = extruded(roundedShape([[0, 1.55], [-0.98, 0], [0.98, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 0.38), 0.5, 0.28);
  } else if (shape === 'star') {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.5 : 1.0;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
    g = extruded(roundedShape(pts, 0.17), 0.3, 0.24);
  } else {
    // gumdrop
    const p = [V(0, 0, 0), V(0.7, 0, 0), V(0.82, 0.04, 0), V(0.87, 0.14, 0)].map((v) => new THREE.Vector2(v.x, v.y));
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      p.push(new THREE.Vector2(0.87 * (1 - 0.18 * t) * Math.sqrt(Math.max(0, 1 - t ** 2.6)), 0.14 + t * 1.32));
    }
    g = new THREE.LatheGeometry(p, 56);
  }
  g.computeBoundingBox();
  const bb = g.boundingBox;
  g.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  g.computeBoundingBox();
  return g;
}

const EYE = { drop: [0.2, 0.66], cube: [0.22, 0.74], tri: [0.17, 0.52], star: [0.16, 0.92], ghost: [0.2, 1.1] };
const shapes = new Map();

// Eyes sit on the front surface: probe it with a ray so every shape gets them right.
function shapeInfo(shape) {
  if (shapes.has(shape)) return shapes.get(shape);
  const geo = buildGeometry(shape);
  // the app's pets: eyes a little above the middle, a pill's width apart
  const [ex, ey] = EYE[shape] || [0.23, geo.boundingBox.max.y * 0.56];
  const probe = new THREE.Mesh(geo);
  const ray = new THREE.Raycaster();
  const eyes = [-ex, ex].map((x) => {
    ray.set(V(x, ey, 10), V(0, 0, -1));
    const hit = ray.intersectObject(probe)[0];
    const n = hit?.face ? hit.face.normal.clone() : V(0, 0, 1);
    // sit flat on the surface, leaning a little like the app's pets
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.26));
    return { p: V(x, ey, hit ? hit.point.z - 0.04 : 0.6), q };
  });
  const info = { geo, eyes, height: geo.boundingBox.max.y };
  shapes.set(shape, info);
  return info;
}

const eyeGeo = new THREE.CapsuleGeometry(0.1, 0.2, 4, 14);
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0x3a3a3a });
// the sleep bubble that swells and shrinks by the nose while a bot dozes
const snotGeo = new THREE.SphereGeometry(0.21, 20, 14);
const snotMat = new THREE.MeshStandardMaterial({ color: 0xd8ecff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.72, depthWrite: false });

const bodyMat = (color, gloss) => (gloss
  ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.18 })
  : new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35 }));

export class Bot {
  constructor(rec, gloss) {
    this.id = rec.id;
    this.shape = rec.shape;
    this.color = rec.color;
    this.rec = rec;
    const info = shapeInfo(rec.shape);

    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);

    // the body, and the avatar head on its neck
    this.gloss = gloss;
    this.chibi = new Chibi(rec, gloss);
    this.limbs = this.chibi.mesh;
    this.limbs.userData.botId = rec.id;
    this.pivot.add(this.limbs);
    const k = HEAD / 1.75;
    const inner = new THREE.Group();
    inner.scale.setScalar(k);
    inner.position.y = -0.04;
    this.chibi.head.add(inner);
    this.mat = bodyMat(rec.color, gloss);
    this.body = new THREE.Mesh(info.geo, this.mat);
    this.body.castShadow = true;
    this.body.userData.botId = rec.id;
    inner.add(this.body);
    for (const m of petExtras(rec.shape, info.height)) inner.add(m);
    this.eyes = info.eyes.map((e) => {
      const m = new THREE.Mesh(eyeGeo, eyeMat);
      m.position.copy(e.p);
      m.quaternion.copy(e.q);
      m.scale.set(1, 1, 0.55);
      inner.add(m);
      return m;
    });
    const bb = info.geo.boundingBox;
    this.chibi.headFront = bb.max.z * k;
    this.chibi.headHalf = bb.max.x * k;
    this.chibi.headDepth = (bb.max.z - bb.min.z) * k;
    this.headH = info.height * k;
    this.height = HIPS + NECK - 0.04 + this.headH;
    const nose = info.eyes[1];
    this.snot = new THREE.Mesh(snotGeo, snotMat);
    this.snot.position.set(nose.p.x + 0.13, nose.p.y - 0.16, nose.p.z + 0.1);
    this.snot.visible = false;
    inner.add(this.snot);

    const el = document.createElement('div');
    el.className = 'bub';
    el.innerHTML = '<span class="bub-ic"></span><span class="bub-name"></span>';
    el.querySelector('.bub-name').textContent = rec.name;
    this.el = el;
    this.label = new CSS2DObject(el);
    this.label.position.set(0, this.height + 0.55, 0);
    this.root.add(this.label);

    this.pos = V(0, 0, 0);
    this.path = [];
    this.rotY = 0;
    this.face = 0;
    this.moveFace = 0;
    this.walk = 0;
    this.side = V(0, 0, 0); // sidestep while passing another bot
    this.phase = Math.random() * 6.28;
    this.blink = 1 + Math.random() * 4;
    this.blinkT = 0;
    this.floor = null;
    this.seat = null;
    this.spot = null;
    this.exit = null; // where to step out to when leaving the seat or spot it is on
    this.lastZone = null;
    this.key = '';
    this.placed = false;
    this.shownState = '';
    this.wander = 6 + Math.random() * 10;
    this.celebrate = 0;
    this.doneShow = 0;
    this.seenDone = 0;
    this.alert = null;
  }

  // clear-coat shine on capable machines, plain plastic on the low tier
  setGloss(gloss) {
    if (gloss === this.gloss) return;
    this.gloss = gloss;
    this.mat.dispose();
    this.mat = bodyMat(this.color, gloss);
    this.body.material = this.mat;
    this.chibi.setGloss(gloss);
    this.limbs.castShadow = gloss; // the low tier skips the body's shadow
  }

  dispose() {
    this.root.removeFromParent();
    this.el.remove();
    this.mat.dispose();
    this.limbs.geometry.dispose();
    this.limbs.skeleton.dispose();
    this.floor?.releaseRest(this.id);
  }
}

const shown = (f) => !!f && f.group.visible && f.inner.visible;

// What bots on a break get up to, by spot. The bubble shows the emoji.
export const ACTS = {
  nap: { label: 'Napping on the sofa', emoji: '' },
  relax: { label: 'Chilling in the lounge', emoji: '🎧' },
  game: { label: 'Playing video games', emoji: '🎮' },
  foosball: { label: 'Playing foosball', emoji: '⚽' },
  run: { label: 'Running on the treadmill', emoji: '🏃' },
  pingpong: { label: 'Playing ping-pong', emoji: '🏓' },
  hoops: { label: 'Shooting hoops', emoji: '🏀' },
  yoga: { label: 'Doing yoga', emoji: '🧘' },
  eat: { label: 'Having lunch', emoji: '🍜' },
  snack: { label: 'Grabbing a snack', emoji: '🍩' },
  coffee: { label: 'Getting a coffee', emoji: '☕' },
  chat: { label: 'Chatting', emoji: '💬' },
};
export const ZONES = { cafe: 'Café', gym: 'Gym', lounge: 'Lounge' };
// how long a bot stays at a spot before wandering on, in seconds [min, extra]
const STAY = { nap: [24, 30], relax: [14, 16], eat: [16, 14], chat: [10, 12], yoga: [16, 14], run: [12, 14] };

const ICONS = {
  working: '<i></i><i></i><i></i>',
  waiting: '<b>?</b>',
  error: '<b>!</b>',
  done: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3 5 8.6l4.5-5"/></svg>',
  resting: '<span class="zz">z</span><span class="zz">z</span><span class="zz">Z</span>',
};
const iconFor = (look) => (ICONS[look] ?? (look === 'rest-nap' ? ICONS.resting : `<span class="emo">${ACTS[look.slice(5)]?.emoji || '☕'}</span>`));

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const HOP = 0.9; // how far out a bot hops up onto (or down off) a seat
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const FACE_CAMERA = Math.PI / 4; // the camera looks in from +x +z

const ringGeo = new THREE.RingGeometry(0.95, 1.3, 40).rotateX(-Math.PI / 2);
const alertMat = {
  waiting: new THREE.MeshBasicMaterial({ color: 0xf5b544, transparent: true, opacity: 0.85, depthWrite: false }),
  error: new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.85, depthWrite: false }),
};

// ---- poses -------------------------------------------------------------------------
// Everything a bot's body does, from where it is and what it is up to. Hand and foot
// targets are in the bot's own space: origin under it on whatever it stands or sits
// on, facing +z (its desk or whatever it plays with is in front).
const SH = 0.44; // hips to shoulders
const surface = (y) => (y >= 0.8 ? 'chair' : y >= 0.6 ? 'sofa' : y >= 0.35 ? 'bag' : 'floor');
const hang = (s) => ({ a: [0.05, s * 0.12, 0.25] });
const both = (P, L) => { P.aL = L; P.aR = mirror(L); };
const bothLegs = (P, L) => { P.lL = L; P.lR = mirror(L); };
const tgt = (x, y, z, px, py, pz) => ({ t: vec(x, y, z), p: vec(px, py, pz) });
// a point fixed to the chest, in body space, for the current lean
const chest = (P, x, y, z) => { const c = Math.cos(P.sp || 0), s = Math.sin(P.sp || 0); return vec(x, P.hy + y * c - z * s, P.hz + y * s + z * c); };

function sit(P, kind, ph) {
  if (kind === 'chair') {
    P.hy = 0.13; P.hz = 0.14;
    const sw = 0.05 * Math.sin(ph * 2);
    P.lL = tgt(0.15, -0.28, P.hz + 0.3 + sw, 0, 0.4, 1);
    P.lR = tgt(-0.15, -0.28, P.hz + 0.3 - sw, 0, 0.4, 1);
  } else if (kind === 'sofa') {
    P.hy = 0.13; P.hz = 0;
    P.lL = { a: [-1.47, 0.07, 0.1] };
    P.lR = { a: [-1.4, -0.07, 0.22] };
  } else {
    P.hy = 0.2; P.hz = 0.05;
    P.lL = tgt(0.22, 0.2, 0.55, 0.5, 1, 0.5);
    P.lR = tgt(-0.22, 0.2, 0.55, -0.5, 1, 0.5);
  }
}
const lap = (P) => both(P, tgt(0.15, P.hy + 0.1, P.hz + 0.3, 1, -0.3, -0.3));

function posture(bot, c) {
  const { t, ph, s, act, sp } = c;
  const ch = bot.chibi;
  const P = { hy: HIPS, hz: 0, aL: hang(1), aR: hang(-1), lL: { a: [0, 0.03, 0.04] }, lR: { a: [0, -0.03, 0.04] }, eye: 1, prop: null };
  const mouth = (x) => vec(x, P.hy + NECK + 0.06, P.hz + ch.headFront * 0.75 + 0.07);
  const neckZ = () => P.hz + Math.sin(P.sp || 0) * NECK;

  if (c.party) {
    // done: a spinning cheer
    const p = 1 - c.celebrate / 1.1;
    P.y = Math.sin(Math.PI * Math.min(1, p * 1.25)) * 0.9;
    P.yaw = Math.PI * 2 * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
    both(P, tgt(0.34, HIPS + SH + 0.42, 0.1 + 0.08 * Math.sin(t * 16), 1, -0.4, 0));
    bothLegs(P, { a: [-0.45, 0.06, 0.9 * Math.sin(Math.PI * Math.min(1, p * 1.25))] });
    return P;
  }
  if (c.moving) {
    if (c.climb) {
      // hopping up onto (or down off) a seat
      bothLegs(P, { a: [-0.9, 0.05, 1.3] });
      both(P, { a: [-0.6, 0.6, 0.4] });
      return P;
    }
    const w = (c.walk * Math.PI) / 0.9, sw = Math.sin(w), cw = Math.cos(w);
    P.y = 0.07 * Math.abs(cw);
    P.lL = { a: [-0.55 * sw, 0.03, 0.15 + 0.6 * Math.max(0, cw)] };
    P.lR = { a: [0.55 * sw, -0.03, 0.15 + 0.6 * Math.max(0, -cw)] };
    P.aL = { a: [0.55 * sw, 0.1, 0.45] };
    P.aR = { a: [-0.55 * sw, -0.1, 0.45] };
    P.syaw = 0.12 * sw;
    P.sp = 0.06;
    return P;
  }

  if (c.atSeat) {
    const seat = c.seat, standing = seat.type === 'standing';
    const y0 = seat.pos.y;
    if (s === 'working') {
      // typing: sitting up to the desk, hands on the keyboard
      if (standing) { P.hz = seat.reach.z - 0.58; P.sp = 0.08; }
      else { sit(P, 'chair', ph); P.hz = Math.min(0.3, Math.max(0.05, seat.reach.z - 0.7)); P.sp = 0.16; }
      for (const sd of [1, -1]) {
        const tap = 0.04 * Math.max(0, Math.sin(t * 15 + (sd > 0 ? 0 : 2.1) + bot.phase));
        P[sd > 0 ? 'aL' : 'aR'] = tgt(sd * 0.19, seat.reach.y - y0 + 0.05 + tap, seat.reach.z - 0.06, sd * 0.9, -0.6, -0.4);
      }
      P.hx = 0.1 + 0.04 * Math.sin(t * 2.2 + bot.phase);
      P.sy = 1 + 0.015 * Math.sin(t * 7 + bot.phase);
      if (!standing) { P.lL.t.z = P.hz + 0.3; P.lR.t.z = P.hz + 0.3; }
      return P;
    }
    if (s === 'waiting') {
      // needs you: up on its chair, bouncing and waving
      const k = Math.sin(t * 4.2 + bot.phase);
      P.y = Math.max(0, k) * 0.42;
      P.sy = 1 + (k < 0 ? 0.05 * k : 0.03 * k);
      P.aR = tgt(-0.62 + 0.1 * Math.sin(t * 10), HIPS + SH + 0.3, 0.16, -1, -0.6, 0);
      P.aL = tgt(0.37, HIPS + 0.12, 0.04, 1, 0.1, -0.5);
      bothLegs(P, { a: [-0.15 * Math.max(0, k), 0.05, 0.3 * Math.max(0, k)] });
      P.hr = 0.12 * Math.sin(t * 2.1);
      return P;
    }
    if (s === 'error') {
      // stuck: hands on its head, shaking
      const on = Math.sin(t * 1.3 + bot.phase) > 0 ? 1 : 0.15;
      P.rz = Math.sin(t * 16) * 0.08 * on;
      P.hyaw = Math.sin(t * 13) * 0.3 * on;
      both(P, tgt(Math.min(ch.headHalf, 0.55) + 0.05, HIPS + NECK + 0.22, 0.04, 1, -0.6, 0));
      bothLegs(P, { a: [-0.1, 0.12, 0.2] });
      return P;
    }
    // finished or idle at the desk
    if (!standing) { sit(P, 'chair', ph); lap(P); P.sp = -0.05; }
    P.sy = 1 + 0.02 * Math.sin(t * 1.5 + bot.phase);
    return P;
  }

  if (!act) { P.sy = 1 + 0.02 * Math.sin(ph * 1.5); return P; }
  const kind = surface(sp.pos.y);
  const side = c.side ? -1 : 1;
  switch (act) {
    case 'nap':
      if (sp.lie) {
        // stretched out along the sofa on its back
        P.yaw = sp.lie * Math.PI / 2;
        P.rx = -Math.PI / 2;
        P.pz = 1.3;
        P.px = -sp.lie * 0.08;
        P.y = Math.max(ch.headDepth / 2, 0.27) + 0.01;
        P.lL = { a: [-0.5, 0.06, 0.9] };
        P.lR = { a: [-0.05, -0.05, 0.15] };
        both(P, tgt(0.12, HIPS + 0.26, 0.3 + 0.015 * Math.sin(t * 1.3 + bot.phase), 1, 0, 0));
        P.sp = 0.03 * Math.sin(t * 1.3 + bot.phase);
      } else {
        // dozing off in the armchair
        sit(P, 'sofa', ph);
        P.sp = -0.42;
        P.hr = 0.22 + 0.1 * Math.sin(t * 0.55 + bot.phase);
        P.hx = 0.15;
        both(P, tgt(0.16, P.hy + 0.12, P.hz + 0.2, 1, -0.3, -0.3));
        P.sy = 1 + 0.03 * Math.sin(t * 1.3 + bot.phase);
      }
      P.eye = 0.08;
      break;
    case 'relax':
      sit(P, kind, ph);
      P.sp = -0.25;
      both(P, tgt(0.28, P.hy + NECK * 0.97 + 0.2, P.hz - 0.27, 1, 0.5, 0));
      P.hyaw = 0.35 * Math.sin(ph * 0.3);
      P.hr = 0.08 * Math.sin(ph * 0.6);
      if (kind === 'sofa') P.lR = { a: [-1.25, -0.25, 0.55] }; // one leg crossed over
      break;
    case 'game':
      if (kind === 'bag') {
        sit(P, 'bag', ph);
        P.sp = 0.14 + 0.04 * Math.sin(ph * 1.3);
        P.sr = 0.07 * Math.sin(ph * 2.1);
        const cp = chest(P, 0, 0.27, 0.38);
        for (const sd of [1, -1]) {
          const j = 0.025 * Math.sin(ph * 23 + sd);
          P[sd > 0 ? 'aL' : 'aR'] = tgt(sd * 0.15, cp.y + j, cp.z - 0.01, sd, -0.6, -0.2);
        }
        P.prop = 'controller';
        P.hx = 0.12;
      } else {
        // at the arcade cabinet, mashing buttons
        P.hz = 0.3; P.sp = 0.1;
        for (const sd of [1, -1]) P[sd > 0 ? 'aL' : 'aR'] = tgt(sd * 0.17, 1.33 + 0.05 * Math.max(0, Math.sin(ph * 17 + sd * 1.7)), 0.86, sd, -0.6, -0.3);
        P.syaw = 0.12 * Math.sin(ph * 2.3);
        P.y = Math.abs(Math.sin(ph * 6.5)) * 0.04;
      }
      break;
    case 'foosball':
      P.hz = 0.35; P.hy = HIPS - 0.04; P.sp = 0.2;
      bothLegs(P, { a: [-0.2, 0.1, 0.35] });
      for (const sd of [1, -1]) P[sd > 0 ? 'aL' : 'aR'] = tgt(sd * 0.3, 1.37, 0.8 + 0.07 * Math.sin(ph * 7 + (sd > 0 ? 0 : Math.PI)), sd, -0.5, -0.3);
      P.yaw = 0.12 * Math.sin(ph * 7);
      P.lateral = 0.25 * Math.sin(ph * 1.7);
      break;
    case 'run': {
      const w = ph * 10, sw = Math.sin(w), cw = Math.cos(w);
      P.y = Math.abs(cw) * 0.16;
      P.sp = 0.16;
      P.lL = { a: [-0.95 * sw, 0.03, 0.35 + 1.0 * Math.max(0, cw)] };
      P.lR = { a: [0.95 * sw, -0.03, 0.35 + 1.0 * Math.max(0, -cw)] };
      P.aL = { a: [0.85 * sw, 0.12, 1.55] };
      P.aR = { a: [-0.85 * sw, -0.12, 1.55] };
      P.syaw = 0.15 * sw;
      break;
    }
    case 'pingpong': {
      const k = t * 4.4 + (c.side ? Math.PI : 0);
      P.hy = HIPS - 0.06; P.sp = 0.15;
      bothLegs(P, { a: [-0.25, 0.16, 0.45] });
      P.aR = tgt(-0.3 + 0.3 * Math.sin(k), HIPS + 0.48, 0.45 + 0.12 * Math.cos(k), -1, -0.4, -0.3);
      P.aL = { a: [-0.3, 0.6, 0.7] };
      P.prop = 'paddle';
      P.lateral = 0.5 * Math.sin(t * 2.2 + (c.side ? Math.PI : 0));
      P.y = Math.abs(Math.sin(t * 4.4)) * 0.1;
      break;
    }
    case 'hoops': {
      const cc = (ph % 2.6) / 2.6;
      P.act = 'hoops'; P.c = cc;
      if (cc < 0.18) {
        const d = Math.sin((cc / 0.18) * Math.PI);
        P.hy = HIPS - 0.14 * d;
        bothLegs(P, { a: [-0.45 * d, 0.08, 0.9 * d] });
        both(P, tgt(0.15, P.hy + 0.55, 0.36, 1, -0.6, -0.2));
      } else if (cc < 0.45) {
        const u = (cc - 0.18) / 0.27;
        P.y = Math.sin(u * Math.PI) * 0.9;
        both(P, tgt(0.13, HIPS + SH + 0.45, 0.22, 1, -0.3, -0.4));
        bothLegs(P, { a: [-0.1, 0.05, 0.25] });
      } else if (cc < 0.7) both(P, tgt(0.16, HIPS + SH + 0.38, 0.3, 1, -0.3, -0.4));
      P.hx = -0.15;
      break;
    }
    case 'yoga': {
      P.eye = 0.1;
      if (Math.sin(ph * 0.35) > 0) {
        // tree: one foot on the other knee, hands together overhead
        P.lL = tgt(0.03, 0.36, 0.04, 1, 0, 0.25);
        P.lR = { a: [0, -0.02, 0] };
        both(P, tgt(0.06, HIPS + SH + 0.46, 0.05, 1, 0, 0));
        P.rz = 0.03 * Math.sin(ph * 0.9);
      } else {
        // star: arms and legs out wide
        both(P, { a: [0, 1.5, 0.05] });
        bothLegs(P, { a: [0, 0.32, 0] });
        P.y = -0.03;
      }
      break;
    }
    case 'eat':
    case 'chat':
      if (kind === 'chair') sit(P, 'chair', ph);
      if (act === 'eat') {
        P.prop = 'bowl';
        const bowl = chest(P, 0.04, 0.22, 0.42);
        P.aL = tgt(0.12, bowl.y, bowl.z - 0.02, 1, -0.6, -0.3);
        const bite = Math.sin(ph * 0.8) > 0 && Math.sin(ph * 5) > -0.2;
        P.aR = bite ? { t: mouth(-0.05), p: vec(-1, -0.5, -0.2) } : tgt(-0.08, bowl.y + 0.06, bowl.z, -1, -0.6, -0.3);
        P.hx = bite ? -0.05 : 0.15;
      } else {
        P.aL = tgt(0.28 + 0.06 * Math.sin(ph * 3), P.hy + 0.3 + 0.1 * Math.sin(ph * 2.3), P.hz + 0.3, 1, -0.6, -0.2);
        P.aR = tgt(-0.28 - 0.06 * Math.sin(ph * 2.6 + 1), P.hy + 0.26 + 0.12 * Math.sin(ph * 2.9 + 1), P.hz + 0.32, -1, -0.6, -0.2);
        P.hx = 0.08 * Math.sin(ph * 4);
        P.yaw = 0.25 * Math.sin(ph * 0.9);
        P.y = kind === 'chair' ? 0 : Math.max(0, Math.sin(ph * 4)) * 0.05;
      }
      break;
    case 'coffee':
    case 'snack': {
      const cyc = (ph % 5) / 5, sip = cyc > 0.68;
      P.prop = act === 'coffee' ? 'cup' : 'donut';
      P.aR = sip ? { t: mouth(-0.04), p: vec(-1, -0.5, -0.2) } : tgt(-0.15, HIPS + 0.3, 0.34, -1, -0.5, -0.3);
      P.hx = sip ? -0.18 : 0.04;
      P.sy = 1 + 0.02 * Math.sin(ph * 1.5);
      P.lL = { a: [0, 0.04, 0.04] }; P.lR = { a: [-0.08, -0.03, 0.18] };
      break;
    }
    default:
      P.sy = 1 + 0.02 * Math.sin(ph * 1.5);
  }
  return P;
}

export class BotLayer {
  constructor(building) {
    this.building = building;
    this.bots = new Map();
    this.selected = null;
    this.hovered = null;
    this.focus = null;
    this.spread = false; // every floor side by side
    this.gloss = true;
    this.wanders = true; // bots on a break stroll between zones (off for scripted recordings)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.12, 56), new THREE.MeshBasicMaterial({ color: 0x5fd38a, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
  }

  sync(state, instant) {
    for (const [id, bot] of this.bots) {
      const rec = state.bots.get(id);
      if (!rec || rec.shape !== bot.shape || rec.color !== bot.color) {
        bot.dispose();
        this.bots.delete(id);
      }
    }
    const byTeam = new Map();
    for (const rec of state.bots.values()) {
      if (!byTeam.has(rec.team)) byTeam.set(rec.team, []);
      byTeam.get(rec.team).push(rec);
    }
    for (const [team, recs] of byTeam) {
      const floor = this.building.floor(team);
      if (!floor) continue;
      const plates = [];
      recs.forEach((rec, i) => {
        let bot = this.bots.get(rec.id);
        const fresh = !bot;
        if (fresh) {
          bot = new Bot(rec, this.gloss);
          this.bots.set(rec.id, bot);
        }
        bot.rec = rec;
        if (bot.floor !== floor) {
          bot.floor?.releaseRest(bot.id);
          floor.inner.add(bot.root);
          bot.floor = floor;
          bot.spot = null;
          bot.exit = null;
          bot.path = [];
          bot.key = '';
          bot.placed = !fresh || instant ? false : 'spawn';
        }
        // every bot has its own desk (floors are sized so there is always one)
        const seat = floor.seats[i % floor.seats.length];
        plates[i % floor.seats.length] = { id: rec.id, name: rec.name, color: rec.color };
        if (bot.seat && bot.seat !== seat) {
          bot.seat.display.material.emissive.set(0);
          if (bot.key === 'seat') bot.key = 'reseat';
        }
        bot.seat = seat;
        if (rec.doneAt && rec.doneAt !== bot.seenDone) {
          bot.seenDone = rec.doneAt;
          if (!instant && bot.placed === true) { bot.celebrate = 1.1; bot.doneShow = 2.2; }
        }
        this.retarget(bot, instant);
      });
      floor.setPlates(plates);
    }
  }

  // bots standing about on open floor, for walkers to go round
  standing(floor, except) {
    const out = [];
    for (const b of this.bots.values()) {
      if (b === except || b.floor !== floor || b.path.length) continue;
      if (floor.nav.free(b.pos.x, b.pos.z)) out.push(b.pos);
    }
    return out;
  }

  go(bot, to, approach) {
    const f = bot.floor;
    bot.path = f.route(bot.pos, to, approach, bot.path.length ? null : bot.exit, this.standing(f, bot));
    bot.exit = approach;
  }

  retarget(bot, instant) {
    const s = bot.rec.state, seat = bot.seat, f = bot.floor;
    let to, face, key, approach;
    if (s === 'resting') {
      if (bot.spot == null || f.rest[bot.spot]?.taken !== bot.id) bot.spot = f.claimRest(bot.id, bot.lastZone);
      const sp = f.rest[bot.spot];
      to = sp.pos; face = sp.face; key = `rest${bot.spot}`; approach = sp.approach;
    } else {
      if (bot.spot != null) { bot.lastZone = f.rest[bot.spot]?.zone; f.releaseRest(bot.id); bot.spot = null; }
      // needing you or stuck: at the desk, turned to face you
      to = seat.pos; approach = seat.approach; key = 'seat';
      face = s === 'waiting' || s === 'error' ? FACE_CAMERA : seat.face;
    }
    seat.display.material.emissive.set(s === 'working' ? bot.color : s === 'waiting' ? 0xf5b544 : s === 'error' ? 0xff4d4d : 0x000000);
    seat.display.material.emissiveIntensity = s === 'working' ? 0.7 : 0.45;
    bot.face = face;
    if (key === bot.key) return;
    bot.key = key;
    if (bot.placed === 'spawn') {
      bot.pos.copy(f.spawn);
      bot.rotY = Math.PI;
      bot.path = [f.spawnOut.clone(), ...f.route(f.spawnOut, to, approach, null, this.standing(f, bot))];
      bot.exit = approach;
      bot.placed = true;
    } else if (instant || !bot.placed) {
      bot.pos.copy(to);
      bot.path = [];
      bot.rotY = face;
      bot.exit = approach;
      bot.placed = true;
    } else {
      this.go(bot, to, approach);
    }
  }

  setGloss(gloss) {
    this.gloss = gloss;
    for (const b of this.bots.values()) b.setGloss(gloss);
  }

  pickables() {
    const out = [];
    for (const b of this.bots.values()) if (shown(b.floor)) out.push(b.body, b.limbs);
    return out;
  }

  get(id) {
    return this.bots.get(id);
  }

  // where a bot is and what it is up to, for the side card
  activityOf(id) {
    const b = this.bots.get(id);
    if (!b || !b.floor) return null;
    if (b.rec.state !== 'resting' || b.spot == null) return { zone: 'desk', label: b.path.length ? 'Heading back to the desk' : 'At the desk' };
    const sp = b.floor.rest[b.spot];
    if (!sp) return null;
    return { zone: sp.zone, act: sp.act, label: b.path.length ? `Heading to the ${ZONES[sp.zone].toLowerCase()}` : ACTS[sp.act].label };
  }

  // how many bots of a team are where
  places(team) {
    const out = { desk: 0, cafe: 0, gym: 0, lounge: 0 };
    for (const b of this.bots.values()) {
      if (b.floor?.team !== team) continue;
      const sp = b.rec.state === 'resting' && b.spot != null ? b.floor.rest[b.spot] : null;
      out[sp ? sp.zone : 'desk']++;
    }
    return out;
  }

  update(dt, t) {
    const floors = new Set();
    for (const bot of this.bots.values()) {
      if (!bot.floor) continue;
      floors.add(bot.floor);
      const f = bot.floor;
      const s = bot.rec.state;
      // finished a task: a little spin-jump on the spot before heading off
      const party = bot.celebrate > 0;
      if (party) bot.celebrate -= dt;
      bot.doneShow -= dt;
      const sp = s === 'resting' && bot.spot != null ? f.rest[bot.spot] : null;
      if (this.wanders && sp && !bot.path.length && !party && (bot.wander -= dt) < 0) {
        const i = f.moveRest(bot.id);
        const next = f.rest[i];
        const [a, b] = STAY[next.act] || [9, 10];
        bot.wander = a + Math.random() * b;
        if (i !== bot.spot) {
          bot.lastZone = sp.zone;
          bot.spot = i;
          bot.key = `rest${i}`;
          bot.face = next.face;
          this.go(bot, next.pos, next.approach);
        }
      }
      const moving = bot.path.length > 0 && !party;
      let hop = 0;
      bot.climb = 0;
      if (moving) {
        const tgt = bot.path[0];
        if (bot.legTo !== tgt) { bot.legTo = tgt; bot.legFrom = bot.pos.clone(); }
        const A = bot.legFrom;
        const dx = tgt.x - bot.pos.x, dz = tgt.z - bot.pos.z;
        const len = Math.hypot(dx, dz);
        const step = SPEED * dt;
        if (len > 0.01) bot.moveFace = Math.atan2(dx, dz);
        if (len <= step) { bot.pos.copy(tgt); bot.path.shift(); }
        else {
          bot.pos.x += (dx * step) / len;
          bot.pos.z += (dz * step) / len;
          // walk on the floor, then hop up onto a seat at the very end (or down off it
          // at the start) instead of floating up a slope
          const L = Math.hypot(tgt.x - A.x, tgt.z - A.z), done = L - len + step;
          const up = tgt.y > A.y + 0.01, down = tgt.y < A.y - 0.01;
          const u = up ? clamp01((done - (L - HOP)) / HOP) : down ? clamp01(done / HOP) : 1;
          bot.pos.y = A.y + (tgt.y - A.y) * (up || down ? u : clamp01(done / Math.max(L, 0.001)));
          if ((up || down) && u > 0 && u < 1) { hop = Math.sin(u * Math.PI) * 0.45; bot.climb = 1; }
        }
        bot.walk += step;
      }
      const act = sp && !moving && !party ? sp.act : null;

      // step aside for anyone close ahead (everybody keeps to the same side, so two
      // bots meeting head-on pass each other instead of walking through)
      const want = V(0, 0, 0);
      if (moving) {
        const mx = Math.sin(bot.moveFace), mz = Math.cos(bot.moveFace);
        for (const o of this.bots.values()) {
          if (o === bot || o.floor !== f) continue;
          const dx = o.pos.x - bot.pos.x, dz = o.pos.z - bot.pos.z;
          const dd = Math.hypot(dx, dz);
          if (dd < 0.001 || dd > 2.1) continue;
          if ((dx * mx + dz * mz) / dd < 0.15) continue;
          const push = (2.1 - dd) / 2.1;
          want.x += mz * push * 0.9;
          want.z += -mx * push * 0.9;
        }
        if (want.length() > 0.9) want.setLength(0.9);
      }
      bot.side.lerp(want, 1 - Math.exp(-dt * 5));

      bot.rotY = lerpAngle(bot.rotY, moving ? bot.moveFace : bot.face, 1 - Math.exp(-dt * 10));
      const ph = t + bot.phase;
      const atSeat = !moving && bot.key === 'seat' && !sp;
      const ctx = { t, ph, dt, s, act, sp, moving, party, atSeat, seat: bot.seat, climb: bot.climb, walk: bot.walk, side: bot.spot % 2, celebrate: bot.celebrate };
      const P = posture(bot, ctx);
      bot.chibi.apply(P, P.snap ? 1 : 1 - Math.exp(-dt * 16));

      bot.root.position.copy(bot.pos).add(bot.side);
      if (P.lateral) bot.root.position.add(V(Math.cos(bot.rotY) * P.lateral, 0, -Math.sin(bot.rotY) * P.lateral));
      bot.root.rotation.y = bot.rotY + (P.yaw || 0);
      bot.pivot.position.set(P.px || 0, (P.y || 0) + hop, P.pz || 0);
      const sy = P.sy || 1;
      bot.pivot.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      bot.pivot.rotation.set(P.rx || 0, 0, P.rz || 0);
      let eye = P.eye ?? 1;
      if (P.act === 'hoops') this.shoot(f, bot, P.c);

      bot.blink -= dt;
      if (bot.blink < 0) { bot.blinkT = 0.13; bot.blink = 2.5 + Math.random() * 3.5; }
      if (bot.blinkT > 0 && eye > 0.5) { bot.blinkT -= dt; eye = Math.min(eye, 0.12); }
      for (const e of bot.eyes) e.scale.y = eye;
      const dozing = s === 'resting' && !moving && !party && act === 'nap';
      bot.snot.visible = dozing;
      if (dozing) {
        // swells on the breath in, and every few breaths grows big and pops
        const breath = (Math.sin(t * 1.3 + bot.phase) + 1) / 2;
        const cycle = ((t * 1.3 + bot.phase) / (Math.PI * 2)) % 4;
        const big = cycle > 3 ? 1 + (cycle - 3) * 0.9 : 1;
        bot.snot.scale.setScalar(cycle > 3.92 ? 0.01 : (0.3 + 0.75 * breath) * big);
      }

      // needs you / stuck: a pulsing ring on the floor round its desk
      const alarm = (s === 'waiting' || s === 'error') && !moving;
      if (alarm && !bot.alert) {
        bot.alert = new THREE.Mesh(ringGeo, alertMat.waiting);
        bot.alert.renderOrder = 2;
        bot.root.add(bot.alert);
      }
      if (bot.alert) {
        bot.alert.visible = alarm;
        if (alarm) {
          bot.alert.material = alertMat[s];
          bot.alert.position.y = 0.04 - bot.pos.y;
          bot.alert.scale.setScalar(1 + 0.18 * Math.sin(t * (s === 'error' ? 9 : 5) + bot.phase));
        }
      }

      const look = bot.doneShow > 0 ? 'done' : s === 'resting' && sp ? `rest-${sp.act}` : s;
      if (bot.shownState !== look) {
        bot.el.className = `bub is-${look.startsWith('rest-') ? 'resting' : look} ${look.startsWith('rest-') ? `act-${look.slice(5)}` : ''}`;
        bot.el.firstChild.innerHTML = iconFor(look);
        bot.shownState = look;
      }
      const named = bot.id === this.selected || bot.id === this.hovered;
      bot.el.classList.toggle('named', named);
      bot.el.classList.toggle('is-selected', bot.id === this.selected);
      // Bubbles on the floor in focus; from outside, only bots that need you (top floor,
      // or every floor when they are laid out side by side).
      const near = this.spread || (this.focus ? f.team === this.focus : f.number === this.building.count);
      const say = this.focus && !this.spread ? true : look === 'waiting' || look === 'error';
      bot.label.visible = shown(f) && (bot.id === this.selected || (near && (named || say)));
    }

    alertMat.waiting.opacity = 0.55 + 0.35 * Math.sin(t * 5);
    alertMat.error.opacity = 0.55 + 0.4 * Math.sin(t * 9);
    for (const f of floors) if (shown(f)) this.floorFx(f, t);

    const sel = this.selected && this.bots.get(this.selected);
    this.ring.visible = !!(sel && shown(sel.floor));
    if (this.ring.visible) {
      if (this.ring.parent !== sel.floor.inner) sel.floor.inner.add(this.ring);
      this.ring.position.set(sel.root.position.x, 0.03, sel.root.position.z);
    }
  }

  // the bot standing at a spot, if it has got there and is still on its break
  at(f, i) {
    const id = f.rest[i]?.taken;
    const b = id && this.bots.get(id);
    return b && b.floor === f && !b.path.length && b.rec.state === 'resting' && b.celebrate <= 0 ? b : null;
  }

  // the hoop: the ball sits on the shooter's head, flies to the rim on the jump, drops through
  shoot(f, bot, c) {
    const ballM = f.fx.hoopBall, rim = f.fx.hoop.rim;
    // the ball is held between the hands until it leaves them
    bot.root.updateMatrixWorld(true);
    const a = bot.chibi.hand(1, V(0, 0, 0)), b = bot.chibi.hand(-1, V(0, 0, 0));
    const head = f.inner.worldToLocal(a.add(b).multiplyScalar(0.5));
    head.x += Math.sin(bot.rotY) * 0.12;
    head.z += Math.cos(bot.rotY) * 0.12;
    if (c < 0.42) {
      ballM.position.copy(head);
      bot.ballFrom = head;
    } else if (c < 0.75) {
      const u = (c - 0.42) / 0.33;
      ballM.position.lerpVectors(bot.ballFrom || head, rim, u);
      ballM.position.y += Math.sin(u * Math.PI) * 1.6;
    } else {
      const u = (c - 0.75) / 0.25;
      ballM.position.set(rim.x, rim.y - (rim.y - 0.24) * Math.min(1, u * 1.6), rim.z + u * 1.8);
      if (u > 0.62) ballM.position.y = 0.24 + Math.abs(Math.sin((u - 0.62) * 8)) * 0.6 * (1 - u);
    }
  }

  floorFx(f, t) {
    const fx = f.fx;
    // ping-pong: rally between two players, a solo player bounces the ball
    const [a, b] = fx.pp.spots.map((i) => this.at(f, i));
    const front = (p) => V(p.pos.x + Math.sin(p.rotY) * 0.9, 1.08, p.pos.z + Math.cos(p.rotY) * 0.9);
    if (a && b) {
      const u = (t * 0.55) % 1, half = u < 0.5 ? u * 2 : (u - 0.5) * 2;
      const [p, q] = u < 0.5 ? [front(a), front(b)] : [front(b), front(a)];
      fx.ppBall.position.lerpVectors(p, q, half);
      fx.ppBall.position.y = 1.08 + Math.abs(Math.sin(half * Math.PI * 2)) * 0.55;
    } else if (a || b) {
      const p = front(a || b);
      fx.ppBall.position.set(p.x, 1.08 + Math.abs(Math.sin(t * 4)) * 0.6, p.z);
    } else fx.ppBall.position.copy(fx.pp.center);
    // nobody at the hoop: the ball rests on the floor
    if (!this.at(f, fx.hoop.spot)) fx.hoopBall.position.set(fx.hoop.rim.x + 0.6, 0.24, fx.hoop.rim.z + 2.2);
    // screens light up while someone is playing
    const playing = fx.game.some((i) => this.at(f, i));
    const tvOn = this.at(f, fx.game[0]) || this.at(f, fx.game[1]);
    fx.tv.material.emissive.setHSL((t * 0.15) % 1, 0.75, tvOn ? 0.45 + 0.1 * Math.sin(t * 6) : 0.06);
    fx.arcade.material.emissive.setHSL((t * 0.3 + 0.5) % 1, 0.9, this.at(f, fx.game[2]) ? 0.5 : playing ? 0.12 : 0.08);
  }
}
