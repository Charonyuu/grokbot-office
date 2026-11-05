import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { NIGHT_MATS, Building, H } from './world.js';
import { BotLayer } from './bots.js';
import { state, subscribe, ingest } from './store.js';
import { startFeed, codexDemo } from './feed.js';
import { createUI } from './ui.js';
import { createQuality } from './quality.js';

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.NeutralToneMapping;
stage.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xebebec);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const hemi = new THREE.HemisphereLight(0xffffff, 0xd8d5ce, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff5e8, 2.1);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(-14, 30, 12);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
const DIR = new THREE.Vector3(1, 0.9, 1).normalize();
camera.position.copy(DIR).multiplyScalar(120);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// map-style: left-drag (one finger) slides the view along the floor; right-drag, or
// Shift/Ctrl/⌘ + drag, orbits; wheel or pinch zooms (two-finger trackpad scroll pans, below)
controls.screenSpacePanning = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
controls.minZoom = 0.12;
controls.maxZoom = 3;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.25;

const building = new Building(scene);

// Day and night, by the viewer's clock (?time=19 to try an hour): cool bright mornings,
// neutral days, an orange sunset, then a dark blue night with the desk lamps glowing.
// [hour, background, sky, ground, hemi, sun colour, sun, environment, glass, glass opacity, lamp glow]
const SKY = [
  [0, 0x1c2542, 0x6f7fb8, 0x2a2f45, 0.4, 0x9fb4ff, 0.3, 0.12, 0x23345e, 0.6, 5],
  [5.5, 0x2a3358, 0x8090c4, 0x34394f, 0.6, 0xa9b8ff, 0.45, 0.2, 0x2e3f6a, 0.55, 4],
  [7, 0xdfe6f2, 0xe8efff, 0xd2d6de, 1.1, 0xeaf0ff, 1.9, 0.45, 0xe6eef8, 0.35, 1.2],
  [11, 0xebebec, 0xffffff, 0xd8d5ce, 1.15, 0xfff5e8, 2.1, 0.5, 0xeef3f6, 0.35, 1.2],
  [16, 0xece9e4, 0xfffaf0, 0xd8d2c6, 1.12, 0xffeed8, 2.05, 0.5, 0xf1f0ea, 0.35, 1.2],
  [18.5, 0xf1c7a0, 0xffd6ad, 0xc9a68a, 1.0, 0xff9a4d, 2.0, 0.42, 0xffc58f, 0.42, 2.2],
  [20, 0x343a62, 0x8a8fc9, 0x34364c, 0.62, 0xb9a6ff, 0.55, 0.22, 0x2c3a68, 0.55, 4],
  [24, 0x1c2542, 0x6f7fb8, 0x2a2f45, 0.4, 0x9fb4ff, 0.3, 0.12, 0x23345e, 0.6, 5],
];
const fixedHour = parseFloat(new URLSearchParams(location.search).get('time'));
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mixC = (out, a, b, k) => out.copy(_ca.setHex(a)).lerp(_cb.setHex(b), k);
function daylight() {
  const d = new Date();
  const h = Number.isFinite(fixedHour) ? ((fixedHour % 24) + 24) % 24 : d.getHours() + d.getMinutes() / 60;
  let i = 0;
  while (SKY[i + 1][0] <= h) i++;
  const a = SKY[i], b = SKY[i + 1], k = (h - a[0]) / (b[0] - a[0]);
  const n = (j) => a[j] + (b[j] - a[j]) * k;
  mixC(scene.background, a[1], b[1], k);
  mixC(hemi.color, a[2], b[2], k);
  mixC(hemi.groundColor, a[3], b[3], k);
  hemi.intensity = n(4);
  mixC(sun.color, a[5], b[5], k);
  sun.intensity = n(6);
  scene.environmentIntensity = n(7);
  mixC(NIGHT_MATS.glass.color, a[8], b[8], k);
  NIGHT_MATS.glass.opacity = n(9);
  NIGHT_MATS.bulb.emissiveIntensity = n(10);
  // light text on the dark sky for the bits of UI drawn straight on the background
  document.body.classList.toggle('night', scene.background.getHSL({}).l < 0.35);
}
daylight();
setInterval(daylight, 20e3);
const botLayer = new BotLayer(building);
botLayer.wanders = !new URLSearchParams(location.search).has('still');
if (new URLSearchParams(location.search).has('debug')) import('./debug.js').then((m) => m.startDebug());

let halfH = 15;
// Zoom that fits a w x d footprint (h tall) in the window, seen from the camera's corner.
function fitZoom(w, d, h = 8) {
  const aspect = innerWidth / innerHeight;
  const across = (w + d) * Math.SQRT1_2;
  const tall = across * 0.53 + h * 0.85;
  return THREE.MathUtils.clamp(0.76 * Math.min((2 * halfH * aspect) / across, (2 * halfH) / tall), controls.minZoom, 1.6);
}
// keep the sun's shadow box just big enough for what is on screen
function fitShadow() {
  const e = building.extent();
  const r = Math.max(24, Math.hypot(e.w, e.d) * 0.55);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: 60 + r * 2 });
  sun.shadow.camera.updateProjectionMatrix();
}
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  halfH = Math.max(15, 19.5 / aspect);
  Object.assign(camera, { left: -halfH * aspect, right: halfH * aspect, top: halfH, bottom: -halfH });
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  labels.setSize(w, h);
}
addEventListener('resize', resize);

function applyQuality(c, tier) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, c.dpr));
  renderer.shadowMap.enabled = c.shadow > 0;
  renderer.shadowMap.type = c.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = c.shadow > 0;
  if (c.shadow) {
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(c.shadow, c.shadow);
  }
  // shadow on/off changes every shader
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
  botLayer.setGloss(c.gloss);
  building.setDecor(tier !== 'low');
  document.documentElement.dataset.quality = tier;
  resize();
}
const quality = createQuality(applyQuality);

// --- camera moves ---
const tween = { active: false };
// Moves between floors pull back a little mid-flight and swing round slightly, then settle.
const AZ_HOME = Math.atan2(DIR.x, DIR.z);
function flyTo(target, zoom, dur = 1.25, arc = 0.14) {
  // drop any drag still gliding on (damping), so the flight lands where it should
  controls._panOffset?.set(0, 0, 0);
  controls._sphericalDelta?.set(0, 0, 0);
  const off = camera.position.clone().sub(controls.target);
  Object.assign(tween, {
    from: controls.target.clone(), to: target, z0: camera.zoom, z1: zoom, t: 0, dur, arc, active: true,
    r: off.length(), y: off.y, a0: Math.atan2(off.x, off.z),
  });
  tween.a1 = tween.a0 + Math.atan2(Math.sin(AZ_HOME - tween.a0), Math.cos(AZ_HOME - tween.a0));
}
function stepTween(dt) {
  if (!tween.active) return;
  tween.t = Math.min(1, tween.t + dt / tween.dur);
  const t = tween.t, e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
  const bump = Math.sin(Math.PI * e);
  controls.target.lerpVectors(tween.from, tween.to, e);
  const h = Math.sqrt(Math.max(0, tween.r * tween.r - tween.y * tween.y));
  const a = tween.a0 + (tween.a1 - tween.a0) * e + bump * 0.06 * tween.arc / 0.14;
  camera.position.set(controls.target.x + Math.sin(a) * h, controls.target.y + tween.y, controls.target.z + Math.cos(a) * h);
  camera.zoom = (tween.z0 + (tween.z1 - tween.z0) * e) * (1 - tween.arc * bump);
  camera.updateProjectionMatrix();
  if (t >= 1) tween.active = false;
}

let focus = null, selected = null, spread = false;

function focusFloor(team, instant = false) {
  focus = team && building.floor(team) ? team : null;
  spread = false;
  building.showUpTo(focus);
  botLayer.focus = focus;
  botLayer.spread = false;
  fitShadow();
  const { W, D } = building.plan;
  if (focus) flyTo(new THREE.Vector3(0, (building.floor(focus).number - 1) * H + 1.2, 0), fitZoom(W, D));
  else flyTo(new THREE.Vector3(0, (building.count * H) / 2 - 2, 0), Math.min(1, halfH / ((building.count * H) / 2 + 12), fitZoom(W, D, building.count * H)));
  if (instant) { tween.dur = 0.001; building.snap(); }
  ui.setFocus(focus, false);
}

// Every floor side by side and open, so every bot is in sight at once.
function spreadOut(instant = false) {
  focus = null;
  spread = true;
  building.spread();
  botLayer.focus = null;
  botLayer.spread = true;
  fitShadow();
  const e = building.extent();
  flyTo(new THREE.Vector3(0, 1.2, 0), fitZoom(e.w, e.d), 1.4);
  if (instant) { tween.dur = 0.001; building.snap(); }
  ui.setFocus(null, true);
}

function select(id) {
  selected = id && state.bots.has(id) ? id : null;
  botLayer.selected = selected;
  ui.setSelected(selected);
  if (selected && !spread) {
    const team = state.bots.get(selected).team;
    if (team !== focus) focusFloor(team);
  }
}

const ui = createUI(document.getElementById('ui'), {
  state,
  onFloor: (team) => { select(null); focusFloor(team); },
  onSpread: () => { select(null); spreadOut(); },
  onSelect: select,
  activityOf: (id) => botLayer.activityOf(id),
  places: (team) => botLayer.places(team),
  onZoom: (d) => d === 0 ? resetView() : flyTo(controls.target.clone(), THREE.MathUtils.clamp(camera.zoom * (d > 0 ? 1.25 : 0.8), controls.minZoom, controls.maxZoom), 0.35, 0),
});

// --- picking ---
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function hit(e, objects) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(objects, false)[0];
}
let down = null;
renderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointermove', (e) => {
  const h = hit(e, botLayer.pickables());
  botLayer.hovered = h?.object.userData.botId || null;
  renderer.domElement.style.cursor = botLayer.hovered ? 'pointer' : down ? 'grabbing' : 'grab';
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const d0 = down;
  down = null;
  renderer.domElement.style.cursor = botLayer.hovered ? 'pointer' : 'grab';
  if (!d0 || Math.hypot(e.clientX - d0.x, e.clientY - d0.y) > 5) return;
  const b = hit(e, botLayer.pickables());
  if (b) return select(b.object.userData.botId);
  const slab = hit(e, building.slabs());
  const team = slab?.object.userData.team;
  if (team && team !== focus) { select(null); focusFloor(team); }
  else select(null);
});
// Two-finger trackpad scroll pans; a mouse wheel and a pinch (sent as ctrl + wheel) zoom.
const _r = new THREE.Vector3(), _f = new THREE.Vector3();
function panBy(dx, dy) {
  const el = renderer.domElement;
  const wpp = (camera.right - camera.left) / camera.zoom / el.clientWidth;
  _r.setFromMatrixColumn(camera.matrix, 0).setY(0).normalize();
  _f.subVectors(controls.target, camera.position).setY(0);
  const tilt = Math.max(0.3, Math.sin(Math.atan2(camera.position.y - controls.target.y, _f.length())));
  _f.normalize();
  const move = _r.multiplyScalar(dx * wpp).addScaledVector(_f, (-dy * wpp) / tilt);
  controls.target.add(move);
  camera.position.add(move);
  movingUntil = performance.now() + 300;
}
renderer.domElement.addEventListener('wheel', (e) => {
  const mouse = e.deltaMode !== 0 || (!e.deltaX && e.wheelDeltaY && e.wheelDeltaY % 120 === 0);
  if (e.ctrlKey || mouse) return; // OrbitControls zooms
  e.preventDefault();
  e.stopImmediatePropagation();
  tween.active = false;
  panBy(e.deltaX, e.deltaY);
}, { capture: true, passive: false });
// keep the office in view: the point you look at stays over the building
function clampView() {
  const e = building.extent(), t = controls.target;
  const x = THREE.MathUtils.clamp(t.x, -e.w / 2, e.w / 2), z = THREE.MathUtils.clamp(t.z, -e.d / 2, e.d / 2);
  if (x === t.x && z === t.z) return;
  camera.position.x += x - t.x;
  camera.position.z += z - t.z;
  t.x = x;
  t.z = z;
}
function resetView() {
  if (spread) spreadOut();
  else focusFloor(focus);
}
renderer.domElement.addEventListener('dblclick', (e) => { if (!hit(e, botLayer.pickables())) resetView(); });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (selected) select(null);
  else if (spread || focus) focusFloor(null);
  else spreadOut();
});

// --- data ---
const instantUntil = performance.now() + 1500;
let started = false;
subscribe((kind) => {
  if (kind === 'roster' || kind === 'status') {
    const per = new Map();
    for (const b of state.bots.values()) per.set(b.team, (per.get(b.team) || 0) + 1);
    const rebuilt = building.setTeams(state.teams, Math.max(1, ...per.values()));
    botLayer.sync(state, performance.now() < instantUntil);
    if (!started) {
      started = true;
      const firstWaiting = [...state.bots.values()].find((b) => b.state === 'waiting');
      const q = new URLSearchParams(location.search);
      if (q.has('all')) spreadOut(true);
      else focusFloor((q.get('floor') && building.floor(q.get('floor')) ? q.get('floor') : null) || firstWaiting?.team || state.teams[0]);
      tween.dur = 0.01;
    } else if (rebuilt) {
      if (spread) spreadOut();
      else if (focus && !building.floor(focus)) focusFloor(null);
      else focusFloor(focus);
    }
  }
  if (kind === 'codex') for (const f of building.floors.values()) f.setCodexBoard({ ...state.codex, top: (state.codex?.top || []).map((x) => ({ ...x, color: state.bots.get(x.bot)?.color })) });
  ui.render();
});

// A dashboard doesn't need the screen's full refresh rate: the tier sets the pace,
// a bit faster while the camera moves, and slow when the window isn't in front.
let last = performance.now(), elapsed = 0, movingUntil = 0, lastZ = '';
controls.addEventListener('change', () => { movingUntil = performance.now() + 300; });
controls.addEventListener('start', () => { tween.active = false; }); // grabbing the view stops a camera flight
renderer.setAnimationLoop((now) => {
  const c = quality.cfg;
  const busy = tween.active || now < movingUntil;
  const fps = !quality.fixed && !document.hasFocus() ? 10 : busy ? c.busyFps : c.fps;
  const budget = 1000 / fps;
  const gap = now - last;
  if (gap < budget - 2) return;
  const t0 = performance.now();
  const dt = Math.min(gap / 1000, 0.05);
  last = now;
  elapsed += dt;
  stepTween(dt);
  building.update(dt);
  controls.update();
  clampView();
  botLayer.update(dt, elapsed);
  sun.target.position.copy(controls.target);
  sun.position.copy(controls.target).add(SUN_OFFSET);
  renderer.render(scene, camera);
  // bubbles grow a little as you zoom in, so close-ups still read
  const z = Math.min(2.4, Math.max(0.8, camera.zoom)).toFixed(2);
  if (z !== lastZ) labels.domElement.style.setProperty('--z', (lastZ = z));
  labels.render(scene, camera);
  quality.sample(performance.now() - t0, gap, budget);
});

// Hooks for scripted recordings (promo videos).
window.__office = {
  focusFloor, spreadOut, select, ingest, botLayer, building, controls, camera,
  codexDemo: (name) => codexDemo(name), codexDone: (name) => codexDemo(name, true),
  // jump the camera to a spot on the focused floor (screenshots of one zone)
  look(x, z, zoom = 1.6) {
    const f = focus && building.floor(focus);
    const y = f ? f.group.position.y + 1.2 : 1.2;
    flyTo(new THREE.Vector3(x, y, z), zoom, 0.001, 0);
  },
  // push the camera in on one bot (close-ups in recordings)
  closeUp(id, zoom = 2.2, dur = 1.2) {
    const b = botLayer.get(id);
    if (!b) return;
    const v = new THREE.Vector3();
    b.root.getWorldPosition(v);
    v.y += 1.2;
    flyTo(v, zoom, dur, 0.05);
  },
  // run the office forward without drawing (tests on slow headless machines)
  warp(seconds = 1) {
    for (let i = 0; i < seconds * 20; i++) { elapsed += 0.05; stepTween(0.05); building.update(0.05); botLayer.update(0.05, elapsed); }
  },
  quality: () => quality.tier,
  stats: () => ({ frame: renderer.info.render.frame, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }),
  screenOf(id) {
    const b = botLayer.get(id);
    if (!b) return null;
    const v = new THREE.Vector3();
    b.root.getWorldPosition(v);
    v.y += b.height * 0.5;
    v.project(camera);
    return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
  },
};

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
startFeed();
