// Where status lines come from: an ntfy topic (?topic=...) or a made-up demo team.

import { ingest, state, setConn } from './store.js';

const ROSTER = [
  { name: 'Arxiv Owl', team: 'Lab', shape: 'egg', color: '#1084FE', init: 'working' },
  { name: 'Repo Scout', team: 'Lab', shape: 'hex', color: '#9159FE', init: 'working' },
  { name: 'Hype Check', team: 'Lab', shape: 'sparkle', color: '#00C972', init: 'working' },
  { name: 'Benchmarker', team: 'Lab', shape: 'tablet', color: '#FF9800', init: 'resting' },
  { name: 'Prior Art', team: 'Lab', shape: 'shield', color: '#00BCA6', init: 'working' },
  { name: 'Hook Writer', team: 'Studio', shape: 'squircle', color: '#1084FE', init: 'working' },
  { name: 'Thread Weaver', team: 'Studio', shape: 'pumpkin', color: '#FF6700', init: 'working' },
  { name: 'Clip Cutter', team: 'Studio', shape: 'house', color: '#FF9800', init: 'working' },
  { name: 'Cover Art', team: 'Studio', shape: 'heart', color: '#FF263C', init: 'resting' },
  { name: 'Caption Bot', team: 'Studio', shape: 'cloud', color: '#FF309B', init: 'working' },
  { name: 'Weekly Digest', team: 'Studio', shape: 'blob', color: '#1b1b1f', init: 'waiting' },
  { name: 'Lead Finder', team: 'Growth', shape: 'bean', color: '#00BCA6', init: 'working' },
  { name: 'Reply Drafter', team: 'Growth', shape: 'pebble', color: '#FF9800', init: 'working' },
  { name: 'Headline Lab', team: 'Growth', shape: 'gem', color: '#9159FE', init: 'resting' },
  { name: 'Inbox Butler', team: 'Back Office', shape: 'clover', color: '#00C972', init: 'working' },
  { name: 'Receipt Matcher', team: 'Back Office', shape: 'dome', color: '#936439', init: 'working' },
  { name: 'Price Watch', team: 'Back Office', shape: 'flower', color: '#FF6700', init: 'resting' },
  // a fuller office: plenty of bots on a break, so the café, gym and lounge are busy
  { name: 'Paper Trail', team: 'Lab', shape: 'capsule', color: '#FF309B', init: 'resting' },
  { name: 'Eval Runner', team: 'Lab', shape: 'cube', color: '#00C972', init: 'resting' },
  { name: 'Data Diver', team: 'Lab', shape: 'teardrop', color: '#FF263C', init: 'error' },
  { name: 'Story Board', team: 'Studio', shape: 'star', color: '#FF9800', init: 'resting' },
  { name: 'Meme Maker', team: 'Studio', shape: 'clover', color: '#9159FE', init: 'resting' },
  { name: 'Voice Over', team: 'Studio', shape: 'arch', color: '#00BCA6', init: 'resting' },
  { name: 'Thumb Nailer', team: 'Studio', shape: 'square', color: '#1084FE', init: 'resting' },
  { name: 'Trend Spotter', team: 'Growth', shape: 'crystal', color: '#FF309B', init: 'resting' },
  { name: 'Deal Closer', team: 'Growth', shape: 'wedge', color: '#1b1b1f', init: 'resting' },
  { name: 'SEO Gnome', team: 'Growth', shape: 'leaf', color: '#00C972', init: 'waiting' },
  { name: 'Tax Helper', team: 'Back Office', shape: 'cylinder', color: '#1084FE', init: 'resting' },
  { name: 'Calendar Pal', team: 'Back Office', shape: 'egg', color: '#FF263C', init: 'resting' },
  { name: 'Travel Agent', team: 'Back Office', shape: 'sparkle', color: '#9159FE', init: 'resting' },
];

// ?demo&bots=60: pad the demo out to that many bots (they all go on one big floor), to try a crowded office
function crowd(n) {
  const words = ['Quick', 'Tiny', 'Busy', 'Sunny', 'Lucky', 'Fuzzy', 'Zippy', 'Happy', 'Brave', 'Witty'];
  const jobs = ['Scout', 'Writer', 'Fixer', 'Sorter', 'Helper', 'Watcher', 'Planner', 'Finder'];
  const colors = ['#FF263C', '#FF6700', '#FF9800', '#00C972', '#00BCA6', '#1084FE', '#9159FE', '#FF309B'];
  const shapes = ['blob', 'pebble', 'bean', 'egg', 'squircle', 'capsule', 'hex', 'gem', 'cloud', 'heart', 'star', 'dome'];
  const out = [];
  for (let i = 0; out.length + ROSTER.length < n; i++) {
    out.push({ name: `${words[i % words.length]} ${jobs[Math.floor(i / words.length) % jobs.length]}${i >= 80 ? ` ${i}` : ''}`, team: 'Crowd', shape: shapes[i % shapes.length], color: colors[(i * 3) % colors.length], init: i % 3 ? 'resting' : 'working' });
  }
  return out;
}
let roster = ROSTER;

const TASKS = {
  Lab: ['Reading 9 new papers on tool use', 'Diffing two model leaderboards', 'Skimming launch posts from this week', 'Re-running the eval suite', 'Looking up prior art for the card idea', 'Writing up what changed in agent memory'],
  Crowd: ['Sorting the inbox', 'Watching three prices', 'Planning next week', 'Finding a cheaper flight'],
  Studio: ['Writing 5 hooks for the launch post', 'Turning the blog post into a thread', 'Cutting a 20s clip from the demo', 'Drawing a cover for Tuesday', 'Adding captions to the reel', 'Collecting links for the digest'],
  Growth: ['Finding 30 indie hackers who build agents', 'Drafting replies under the launch post', 'Comparing two landing page headlines', 'Tagging new signups by source'],
  'Back Office': ['Archiving 58 old newsletters', 'Matching receipts to card charges', 'Checking if the API price dropped', 'Renewing the domain list'],
};
const ASKS = ['Send the digest now or Monday?', 'Headline A or B?', 'OK to reply from your account?', 'Which clip goes first?'];
const ERRORS = ['Session expired', 'Hit the rate limit', 'Page changed, selector broke'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ?sleepy: everyone but a few starts on a break (for recordings about dozing bots)
const AWAKE = new Set(['Arxiv Owl', 'Repo Scout', 'Lead Finder', 'Inbox Butler']);

const codexCounts = new Map();
export function codexDemo(name, done = false) {
  const b = [...state.bots.values()].find((x) => x.id === name || x.name.toLowerCase() === String(name).toLowerCase());
  if (!b) return;
  if (!done) codexCounts.set(b.id, (codexCounts.get(b.id) || 0) + 1);
  ingest({ bot: b.id, state: 'working', task: b.task, codex: { state: done ? 'done' : 'running', at: Date.now(), task: 'Fix the flaky test' } });
  const top = [...codexCounts].map(([id, count]) => ({ bot: id, name: state.bots.get(id)?.name || id, count })).sort((a, b) => b.count - a.count);
  ingest({ t: 'codex', today: top.reduce((n, x) => n + x.count, 0), day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(Date.now()), top: top.slice(0, 5) });
}

function startDemo(still, sleepy) {
  setConn('demo', 'live');
  const now = Date.now();
  const want = +new URLSearchParams(location.search).get('bots') || 0;
  roster = want > ROSTER.length ? [...ROSTER, ...crowd(Math.min(want, 300))] : ROSTER;
  // recordings get Grok Bot links so the card shows its real button (they point nowhere)
  ingest({ t: 'roster', bots: roster.map(({ init, ...b }) => ({ ...b, chat: still ? `grokbot://agent/demo-${b.name.toLowerCase().replace(/\W+/g, '-')}` : '', usage: 4000 + Math.random() * 60000 })) }, now - 3600e3);
  for (const b of roster) {
    const at = now - Math.random() * 40 * 60e3;
    const init = sleepy && !AWAKE.has(b.name) ? 'resting' : still && b.init === 'waiting' ? 'working' : b.init;
    const task = init === 'waiting' ? pick(ASKS) : init === 'error' ? pick(ERRORS) : pick(TASKS[b.team]);
    if (init === 'resting') ingest({ bot: b.name, state: 'done', task: pick(TASKS[b.team]) }, at);
    else ingest({ bot: b.name, state: init, task }, at);
  }
  // ?still: no random events, so a recording can script every change itself
  if (!still) {
    setInterval(tick, 1800);
    const names = ['Arxiv Owl', 'Hook Writer', 'Lead Finder']; let n = 0;
    const cycle = () => { const name = names[n++ % names.length]; codexDemo(name); setTimeout(() => codexDemo(name, true), 30000 + Math.random() * 10000); };
    setTimeout(cycle, 4000); setInterval(cycle, 45000);
  }
}

function tick() {
  const bots = [...state.bots.values()];
  const b = pick(bots);
  if (b.codex?.state === 'running') return;
  const tasks = TASKS[b.team] || TASKS.Lab;
  const r = Math.random();
  // roughly half the office on a break at any time, so the zones stay lively
  if (b.state === 'working') {
    if (r < 0.4) ingest({ bot: b.id, state: 'working', task: pick(tasks) });
    else if (r < 0.75) ingest({ bot: b.id, state: 'done', task: b.task });
    else if (r < 0.84) ingest({ bot: b.id, state: 'waiting', task: pick(ASKS) });
    else if (r < 0.88) ingest({ bot: b.id, state: 'error', task: pick(ERRORS) });
  } else if (b.state === 'resting') {
    if (r < 0.32) ingest({ bot: b.id, state: 'working', task: pick(tasks) });
  } else if (b.state === 'waiting') {
    if (r < 0.35) ingest({ bot: b.id, state: 'working', task: pick(tasks) });
  } else if (r < 0.45) {
    ingest({ bot: b.id, state: 'working', task: pick(tasks) });
  }
  ingest({ t: 'usage', bots: bots.filter((x) => x.state === 'working').map((x) => ({ bot: x.id, used: x.usage + 150 + Math.random() * 900 })) });
}

// Lines may be JSON or plain "Bot | state | task".
function parseBody(text) {
  text = String(text || '').trim();
  if (text.startsWith('{')) {
    try { return JSON.parse(text); } catch { return null; }
  }
  const [bot, st, ...rest] = text.split('|').map((s) => s.trim());
  return bot && st ? { bot, state: st, task: rest.join(' | ') } : null;
}

function startNtfy(server, topic) {
  setConn('ntfy', 'connecting');
  const es = new EventSource(`${server.replace(/\/$/, '')}/${encodeURIComponent(topic)}/sse?since=24h`);
  es.onopen = () => setConn('ntfy', 'live');
  es.onerror = () => setConn('ntfy', 'reconnecting');
  es.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.event && m.event !== 'message') return;
    const body = parseBody(m.message);
    if (body) ingest(body, (m.time || Date.now() / 1000) * 1000);
  };
}

// Served by bin/office.mjs: read the Grok Bot app on this machine.
function startLocal() {
  setConn('local', 'connecting');
  const es = new EventSource('/api/events');
  es.onopen = () => setConn('local', 'live');
  es.onerror = () => setConn('local', 'reconnecting');
  es.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    ingest(m, m.at || Date.now());
  };
}

export async function startFeed() {
  const q = new URLSearchParams(location.search);
  const topic = q.get('topic');
  if (topic) return startNtfy(q.get('server') || 'https://ntfy.sh', topic);
  if (!q.has('demo') && !q.has('still')) {
    const ping = await fetch('/api/ping').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (ping?.source === 'grokbot-local' && ping.found) return startLocal();
  }
  startDemo(q.has('still'), q.has('sleepy'));
}
