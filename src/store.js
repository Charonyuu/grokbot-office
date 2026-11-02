// Bot roster + live status. Everything the office shows comes from here.

import { PET_SHAPES } from './pets.js';

const listeners = new Set();

export const state = {
  teams: [], // top floor first
  bots: new Map(),
  activity: [],
  finished: [],
  routines: [],
  source: 'demo',
  usageUnit: 'tokens', // what bot.usage counts
  plan: null, // account-wide usage, when the source knows it
  conn: 'live',
};

// Grok Bot's own avatar colours
const PALETTE = ['#FF263C', '#FF6700', '#FF9800', '#00C972', '#00BCA6', '#1084FE', '#9159FE', '#FF309B', '#936439', '#777777'];
export const SHAPES = [...PET_SHAPES, 'drop', 'cube', 'tri', 'ghost'];
const STATES = new Set(['working', 'waiting', 'error', 'resting']);
const ALIASES = {
  start: 'working', started: 'working', busy: 'working', running: 'working', step: 'working',
  done: 'resting', finished: 'resting', complete: 'resting', completed: 'resting', idle: 'resting', rest: 'resting',
  stuck: 'error', failed: 'error', fail: 'error',
  need: 'waiting', needs: 'waiting', blocked: 'waiting', ask: 'waiting', question: 'waiting',
};

export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const notify = (kind, bot) => listeners.forEach((fn) => fn(kind, bot));

export const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

function makeBot(b, at) {
  const id = b.id ? slug(b.id) : slug(b.name);
  const h = hash(id);
  return {
    id,
    name: String(b.name || id).slice(0, 40),
    team: String(b.team || 'Lobby').slice(0, 30),
    shape: SHAPES.includes(b.shape) ? b.shape : PET_SHAPES[h % PET_SHAPES.length],
    color: /^#[0-9a-f]{3,8}$/i.test(b.color || '') ? b.color : PALETTE[(h >>> 3) % PALETTE.length],
    chat: /^(https?:\/\/|grokbot:\/\/agent\/)/.test(b.chat || '') ? b.chat : '',
    state: 'resting', task: '', since: at, wsince: at,
    steps: 0, tasks: 0, workedMs: 0, usage: 0, recent: [],
  };
}

export function applyRoster(list, at = Date.now()) {
  const seen = new Set();
  const teams = [];
  for (const raw of list || []) {
    if (!raw || (!raw.name && !raw.id)) continue;
    const fresh = makeBot(raw, at);
    const prev = state.bots.get(fresh.id);
    const bot = prev
      ? Object.assign(prev, { name: fresh.name, team: fresh.team, shape: fresh.shape, color: fresh.color, chat: fresh.chat || prev.chat })
      : fresh;
    if (raw.usage != null) bot.usage = +raw.usage || 0;
    state.bots.set(bot.id, bot);
    seen.add(bot.id);
    if (!teams.includes(bot.team)) teams.push(bot.team);
  }
  for (const id of [...state.bots.keys()]) if (!seen.has(id)) state.bots.delete(id);
  state.teams = teams;
  notify('roster');
}

function normState(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (STATES.has(s)) return s;
  return ALIASES[s] || ALIASES[s.split(/\W/)[0]] || null;
}

function describe(s, task, done) {
  if (done) return task ? `Finished: ${task}` : 'Finished a task';
  if (s === 'working') return task || 'Working';
  if (s === 'waiting') return `Needs you${task ? `: ${task}` : ''}`;
  if (s === 'error') return `Stuck${task ? `: ${task}` : ''}`;
  return task ? `Last: ${task}` : 'Resting';
}

function findBot(key) {
  return state.bots.get(slug(key)) || [...state.bots.values()].find((b) => b.name.toLowerCase() === String(key).toLowerCase());
}

export function applyStatus(msg, at = Date.now()) {
  const key = msg.bot ?? msg.id ?? msg.name;
  if (!key) return;
  let bot = findBot(key);
  if (!bot) {
    // An unknown bot walks in on its own; new teams go on top.
    bot = makeBot({ name: key, team: msg.team, shape: msg.shape, color: msg.color, chat: msg.chat }, at);
    state.bots.set(bot.id, bot);
    if (!state.teams.includes(bot.team)) state.teams.unshift(bot.team);
    notify('roster');
  }
  const raw = String(msg.state ?? msg.status ?? '').toLowerCase().trim();
  const next = normState(raw) || bot.state;
  const done = /^(done|finished|complete)/.test(raw);
  if (bot.state === 'working') bot.workedMs += Math.max(0, at - bot.wsince);
  bot.wsince = at;
  if (next !== bot.state) bot.since = at;
  bot.state = next;
  if (msg.task) bot.task = String(msg.task).slice(0, 140);
  if (next === 'working') bot.steps++;
  if (done) {
    bot.tasks++;
    bot.doneAt = at;
    state.finished.unshift({ id: bot.id, task: bot.task, at });
    state.finished.splice(12);
  }
  if (msg.usage != null) bot.usage = +msg.usage || bot.usage;
  const line = { at, id: bot.id, state: next, text: describe(next, bot.task, done) };
  // keep newest first even when old lines arrive late (replays, demo start)
  const put = (list, n) => { const i = list.findIndex((x) => x.at <= at); list.splice(i < 0 ? list.length : i, 0, line); list.splice(n); };
  put(bot.recent, 6);
  put(state.activity, 40);
  notify('status', bot);
}

export function applyUsage(msg) {
  if (msg.unit) state.usageUnit = String(msg.unit).slice(0, 20);
  const list = Array.isArray(msg.bots) ? msg.bots : [msg];
  for (const u of list) {
    const bot = findBot(u.bot ?? u.id ?? u.name ?? '');
    if (bot) bot.usage = +(u.used ?? u.usage) || bot.usage;
  }
  notify('usage');
}

// One message from the feed: {t:'roster'|'usage'|'routines', ...} or a status line.
export function ingest(msg, at = Date.now()) {
  if (!msg || typeof msg !== 'object') return;
  const t = msg.t || msg.type;
  if (t === 'roster') applyRoster(msg.bots, at);
  else if (t === 'usage') applyUsage(msg);
  else if (t === 'plan') { state.plan = { percent: +msg.percent || 0, resetAt: +msg.resetAt || 0, label: String(msg.label || '').slice(0, 30) }; notify('plan'); }
  else if (t === 'routines') { state.routines = (msg.list || []).slice(0, 20); notify('routines'); }
  else applyStatus(msg, at);
}

export const workedMs = (b, now = Date.now()) => b.workedMs + (b.state === 'working' ? now - b.wsince : 0);
export const setConn = (source, conn) => { state.source = source; state.conn = conn; notify('conn'); };
