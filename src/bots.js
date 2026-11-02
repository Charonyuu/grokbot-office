// The bots: soft glossy blobs with two pill eyes, built from code (no model files).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LANE_X } from './world.js';
import { petGeometry, petExtras } from './pets.js';

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
    const inner = new THREE.Group();
    inner.scale.setScalar(SCALE);
    this.root.add(this.pivot);
    this.pivot.add(inner);

    this.gloss = gloss;
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
    this.height = info.height * SCALE;
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
    this.phase = Math.random() * 6.28;
    this.blink = 1 + Math.random() * 4;
    this.blinkT = 0;
    this.floor = null;
    this.seat = null;
    this.spot = null;
    this.key = '';
    this.placed = false;
    this.shownState = '';
    this.wander = 4 + Math.random() * 8;
    this.celebrate = 0;
    this.doneShow = 0;
    this.seenDone = 0;
  }

  // clear-coat shine on capable machines, plain plastic on the low tier
  setGloss(gloss) {
    if (gloss === this.gloss) return;
    this.gloss = gloss;
    this.mat.dispose();
    this.mat = bodyMat(this.color, gloss);
    this.body.material = this.mat;
  }

  dispose() {
    this.root.removeFromParent();
    this.el.remove();
    this.mat.dispose();
    this.floor?.releaseRest(this.id);
  }
}

const shown = (f) => !!f && f.group.visible && f.inner.visible;

const ICONS = {
  working: '<i></i><i></i><i></i>',
  waiting: '<b>?</b>',
  error: '<b>!</b>',
  done: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3 5 8.6l4.5-5"/></svg>',
  resting: '<span class="zz">z</span><span class="zz">z</span><span class="zz">Z</span>',
};

const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// Walk out to the aisle, along it to the free column, then in to the target.
function route(from, to, lanes) {
  const lane = (p) => (p.x >= LANE_X - 0.01 ? null : lanes.reduce((a, b) => (Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a)));
  const lf = lane(from), lt = lane(to);
  const pts = [];
  const same = lf !== null && lf === lt;
  if (lf !== null) {
    pts.push(V(from.x, 0, lf));
    if (!same) pts.push(V(LANE_X, 0, lf));
  }
  if (lt !== null) {
    if (!same) pts.push(V(LANE_X, 0, lt));
    pts.push(V(to.x, 0, lt));
  }
  pts.push(to.clone());
  return pts.filter((p, i) => i === 0 ? p.distanceTo(from) > 0.01 : p.distanceTo(pts[i - 1]) > 0.01);
}

export class BotLayer {
  constructor(building) {
    this.building = building;
    this.bots = new Map();
    this.selected = null;
    this.hovered = null;
    this.focus = null;
    this.gloss = true;
    this.wanders = true; // bots on a break stroll between spots (off for scripted recordings)
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
          bot.key = '';
          bot.placed = !fresh || instant ? false : 'spawn';
        }
        if (bot.seat && bot.seat !== floor.seats[i % floor.seats.length]) bot.seat.display.material.emissive.set(0);
        bot.seat = floor.seats[i % floor.seats.length];
        if (rec.doneAt && rec.doneAt !== bot.seenDone) {
          bot.seenDone = rec.doneAt;
          if (!instant && bot.placed === true) { bot.celebrate = 1.1; bot.doneShow = 2.2; }
        }
        this.retarget(bot, instant);
      });
    }
  }

  retarget(bot, instant) {
    const s = bot.rec.state, seat = bot.seat, f = bot.floor;
    let to, face, key;
    if (s === 'resting') {
      if (bot.spot == null || f.rest[bot.spot]?.taken !== bot.id) bot.spot = f.claimRest(bot.id);
      const sp = f.rest[bot.spot];
      to = sp.pos; face = sp.face; key = `rest${bot.spot}`;
    } else {
      if (bot.spot != null) { f.releaseRest(bot.id); bot.spot = null; }
      if (s === 'waiting') { to = V(seat.pos.x, 0, seat.lane); face = Math.PI / 4; key = 'stand'; }
      else { to = seat.pos; face = seat.face; key = 'seat'; }
    }
    seat.display.material.emissive.set(s === 'working' ? bot.color : 0x000000);
    seat.display.material.emissiveIntensity = 0.7;
    bot.face = face;
    if (key === bot.key) return;
    bot.key = key;
    if (bot.placed === 'spawn') {
      bot.pos.copy(f.spawn);
      bot.rotY = Math.PI / 2;
      const out = V(f.spawn.x + 2.4, 0, f.spawn.z);
      bot.path = [out, ...route(out, to, f.lanes)];
      bot.placed = true;
    } else if (instant || !bot.placed) {
      bot.pos.copy(to);
      bot.path = [];
      bot.rotY = face;
      bot.placed = true;
    } else {
      bot.path = route(bot.pos, to, f.lanes);
    }
  }

  setGloss(gloss) {
    this.gloss = gloss;
    for (const b of this.bots.values()) b.setGloss(gloss);
  }

  pickables() {
    const out = [];
    for (const b of this.bots.values()) if (shown(b.floor)) out.push(b.body);
    return out;
  }

  get(id) {
    return this.bots.get(id);
  }

  update(dt, t) {
    for (const bot of this.bots.values()) {
      if (!bot.floor) continue;
      const s = bot.rec.state;
      // finished a task: a little spin-jump on the spot before heading off
      const party = bot.celebrate > 0;
      if (party) bot.celebrate -= dt;
      bot.doneShow -= dt;
      if (this.wanders && s === 'resting' && !bot.path.length && !party && (bot.wander -= dt) < 0) {
        bot.wander = 7 + Math.random() * 9;
        const i = bot.floor.moveRest(bot.id);
        if (i >= 0 && i !== bot.spot) {
          const sp = bot.floor.rest[i];
          bot.spot = i;
          bot.key = `rest${i}`;
          bot.face = sp.face;
          bot.path = route(bot.pos, sp.pos, bot.floor.lanes);
        }
      }
      const moving = bot.path.length > 0 && !party;
      let hop = 0;
      if (moving) {
        const tgt = bot.path[0];
        const d = tgt.clone().sub(bot.pos);
        const len = d.length();
        const step = SPEED * dt;
        if (Math.hypot(d.x, d.z) > 0.01) bot.moveFace = Math.atan2(d.x, d.z);
        if (len <= step) { bot.pos.copy(tgt); bot.path.shift(); }
        else bot.pos.addScaledVector(d, step / len);
        bot.walk += step;
        hop = Math.abs(Math.sin((bot.walk * Math.PI) / 0.9)) * 0.22;
      }
      bot.root.position.copy(bot.pos);
      bot.rotY = lerpAngle(bot.rotY, moving ? bot.moveFace : bot.face, 1 - Math.exp(-dt * 10));
      bot.root.rotation.y = bot.rotY;

      let sy = 1, y = hop, rz = 0, eye = 1;
      if (party) {
        const p = 1 - bot.celebrate / 1.1;
        y = Math.sin(Math.PI * Math.min(1, p * 1.25)) * 0.9;
        bot.root.rotation.y = bot.rotY + Math.PI * 2 * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
        sy = p < 0.12 ? 1 - p * 1.5 : 1;
      } else if (moving) sy = 1 + 0.05 * Math.sin((bot.walk * Math.PI * 2) / 0.9);
      else if (s === 'working') { const k = Math.sin(t * 7 + bot.phase); sy = 1 + 0.035 * k; y = 0.03 * Math.max(0, k); }
      else if (s === 'waiting') { const k = Math.sin(t * 4.2 + bot.phase); y = Math.max(0, k) * 0.45; sy = 1 + (k < 0 ? 0.07 * k : 0.04 * k); }
      else if (s === 'error') rz = Math.sin(t * 16) * 0.1 * (Math.sin(t * 1.3 + bot.phase) > 0 ? 1 : 0.15);
      else {
        // asleep: slow deep breaths, head lolling to one side, eyes shut
        sy = 1 + 0.06 * Math.sin(t * 1.3 + bot.phase);
        rz = 0.13 * Math.sin(t * 0.55 + bot.phase) + 0.06;
        eye = 0.08;
      }
      bot.pivot.position.y = y;
      bot.pivot.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
      bot.pivot.rotation.z = rz;

      bot.blink -= dt;
      if (bot.blink < 0) { bot.blinkT = 0.13; bot.blink = 2.5 + Math.random() * 3.5; }
      if (bot.blinkT > 0 && s !== 'resting') { bot.blinkT -= dt; eye = Math.min(eye, 0.12); }
      for (const e of bot.eyes) e.scale.y = eye;
      const dozing = s === 'resting' && !moving && !party;
      bot.snot.visible = dozing;
      if (dozing) {
        // swells on the breath in, and every few breaths grows big and pops
        const breath = (Math.sin(t * 1.3 + bot.phase) + 1) / 2;
        const cycle = ((t * 1.3 + bot.phase) / (Math.PI * 2)) % 4;
        const big = cycle > 3 ? 1 + (cycle - 3) * 0.9 : 1;
        bot.snot.scale.setScalar(cycle > 3.92 ? 0.01 : (0.3 + 0.75 * breath) * big);
      }

      const look = bot.doneShow > 0 ? 'done' : s;
      if (bot.shownState !== look) {
        bot.el.className = `bub is-${look}`;
        bot.el.firstChild.innerHTML = ICONS[look];
        bot.shownState = look;
      }
      const named = bot.id === this.selected || bot.id === this.hovered;
      bot.el.classList.toggle('named', named);
      bot.el.classList.toggle('is-selected', bot.id === this.selected);
      // Bubbles on the floor in focus; from outside, only bots that need you (top floor).
      const near = this.focus ? bot.floor.team === this.focus : bot.floor.number === this.building.count;
      const say = this.focus ? true : look === 'waiting' || look === 'error';
      bot.label.visible = shown(bot.floor) && (bot.id === this.selected || (near && (named || say)));
    }

    const sel = this.selected && this.bots.get(this.selected);
    this.ring.visible = !!(sel && shown(sel.floor));
    if (this.ring.visible) {
      if (this.ring.parent !== sel.floor.inner) sel.floor.inner.add(this.ring);
      this.ring.position.set(sel.pos.x, 0.03, sel.pos.z);
    }
  }
}
