import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Building, H } from './world.js';
import { BotLayer } from './bots.js';
import { state, subscribe, ingest } from './store.js';
import { startFeed } from './feed.js';
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

scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d5ce, 1.15));
const sun = new THREE.DirectionalLight(0xfff5e8, 2.1);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
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
controls.screenSpacePanning = true;
controls.minZoom = 0.3;
controls.maxZoom = 3;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.25;

const building = new Building(scene);
const botLayer = new BotLayer(building);
botLayer.wanders = !new URLSearchParams(location.search).has('still');

let halfH = 15;
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
  document.documentElement.dataset.quality = tier;
  resize();
}
const quality = createQuality(applyQuality);

// --- camera moves ---
const tween = { active: false };
// Moves between floors pull back a little mid-flight and swing round slightly, then settle.
const AZ_HOME = Math.atan2(DIR.x, DIR.z);
function flyTo(target, zoom, dur = 1.25, arc = 0.14) {
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

let focus = null, selected = null;

function focusFloor(team, instant = false) {
  focus = team && building.floor(team) ? team : null;
  building.showUpTo(focus);
  botLayer.focus = focus;
  if (focus) flyTo(new THREE.Vector3(0, (building.floor(focus).number - 1) * H + 1.2, 0), 0.9);
  else flyTo(new THREE.Vector3(0, (building.count * H) / 2 - 2, 0), Math.min(1, halfH / ((building.count * H) / 2 + 12)));
  if (instant) { tween.dur = 0.001; building.snap(); }
  ui.setFocus(focus);
}

function select(id) {
  selected = id && state.bots.has(id) ? id : null;
  botLayer.selected = selected;
  ui.setSelected(selected);
  if (selected) {
    const team = state.bots.get(selected).team;
    if (team !== focus) focusFloor(team);
  }
}

const ui = createUI(document.getElementById('ui'), {
  state,
  onFloor: (team) => { select(null); focusFloor(team); },
  onSelect: select,
  onZoom: (d) => flyTo(controls.target.clone(), THREE.MathUtils.clamp(camera.zoom * (d > 0 ? 1.25 : 0.8), controls.minZoom, controls.maxZoom), 0.35, 0),
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
  renderer.domElement.style.cursor = botLayer.hovered ? 'pointer' : '';
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const b = hit(e, botLayer.pickables());
  if (b) return select(b.object.userData.botId);
  const slab = hit(e, building.slabs());
  const team = slab?.object.userData.team;
  if (team && team !== focus) { select(null); focusFloor(team); }
  else select(null);
});
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (selected) select(null);
  else focusFloor(null);
});

// --- data ---
const instantUntil = performance.now() + 1500;
let started = false;
subscribe((kind) => {
  if (kind === 'roster' || kind === 'status') {
    const rebuilt = building.setTeams(state.teams);
    botLayer.sync(state, performance.now() < instantUntil);
    if (!started) {
      started = true;
      const firstWaiting = [...state.bots.values()].find((b) => b.state === 'waiting');
      focusFloor(firstWaiting?.team || state.teams[0]);
      tween.dur = 0.01;
    } else if (rebuilt) {
      if (focus && !building.floor(focus)) focusFloor(null);
      else building.showUpTo(focus);
    }
  }
  ui.render();
});

// A dashboard doesn't need the screen's full refresh rate: the tier sets the pace,
// a bit faster while the camera moves, and slow when the window isn't in front.
let last = performance.now(), elapsed = 0, movingUntil = 0, lastZ = '';
controls.addEventListener('change', () => { movingUntil = performance.now() + 300; });
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
  focusFloor, select, ingest,
  // push the camera in on one bot (close-ups in recordings)
  closeUp(id, zoom = 2.2, dur = 1.2) {
    const b = botLayer.get(id);
    if (!b) return;
    const v = new THREE.Vector3();
    b.body.getWorldPosition(v);
    flyTo(v, zoom, dur, 0.05);
  },
  quality: () => quality.tier,
  stats: () => ({ frame: renderer.info.render.frame, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries }),
  screenOf(id) {
    const b = botLayer.get(id);
    if (!b) return null;
    const v = new THREE.Vector3();
    b.body.getWorldPosition(v);
    v.y += b.height * 0.45;
    v.project(camera);
    return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
  },
};

await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
startFeed();
