#!/usr/bin/env node
// Serves the office and feeds it straight from the Grok Bot desktop app on this
// machine: the app keeps a local cache of your bots (roster, recent transcripts,
// weekly usage). This reads it, works out who is busy / waiting / resting, and
// pushes changes to the page over server-sent events. Nothing leaves your machine.
//
//   node bin/office.mjs            -> http://127.0.0.1:4321/
//   PORT=5000 GROKBOT_DIR=... node bin/office.mjs

import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync, watch, existsSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT || 4321);
const DIR = process.env.GROKBOT_DIR || join(homedir(), 'Library/Application Support/Grok Bot/sand-client-persistence');

// Grok Bot's avatar shapes and colour names, mapped onto the office's own.
// Shapes pass straight through (the office builds every Grok pet); colours are the app's own.
const COLOR = {
  black: '#1b1b1f', brown: '#936439', red: '#FF263C', orange: '#FF6700', yellow: '#FF9800', green: '#00C972',
  cyan: '#00BCA6', blue: '#1084FE', violet: '#9159FE', magenta: '#FF309B', gray: '#777777',
};
const WORKING_FOR = 30 * 60e3; // a question with no reply yet counts as work for this long
const FRESH = 2 * 60e3; // output this recent still counts as working
const ASKING_FOR = 24 * 3600e3; // an unanswered question from the bot counts as waiting for this long

// ---------- reading the cache ----------

function decodeName(file) {
  const s = file.replace(/\.blob$/, '').toUpperCase();
  const bits = [...s].map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join('');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes).toString('utf8');
}

function readCache() {
  if (!existsSync(DIR)) return null;
  const files = {};
  for (const f of readdirSync(DIR)) if (f.endsWith('.blob')) files[decodeName(f)] = join(DIR, f);
  const json = (path) => { try { return JSON.parse(readFileSync(path, 'utf8')).value; } catch { return null; } };
  // newest roster wins if more than one account has signed in here
  const rosters = Object.keys(files).filter((k) => k.endsWith('.roster.last-roster'))
    .sort((a, b) => statSync(files[b]).mtimeMs - statSync(files[a]).mtimeMs);
  if (!rosters.length) return null;
  const account = rosters[0].slice(0, -'.roster.last-roster'.length);
  const at = (name) => files[`${account}.${name}`];
  return {
    roster: json(at('roster.last-roster'))?.rows || [],
    sections: json(at('sidebar.last-sections'))?.sections || [],
    usage: json(at('weekly-usage.cache'))?.reading?.usage || null,
    transcript: (id) => (at(`transcript.replicas.${id}`) ? json(at(`transcript.replicas.${id}`))?.entries || [] : []),
  };
}

const snippet = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);

function teamOf(row, sections) {
  for (const s of sections) {
    const ids = s.agentIds || s.items || s.memberIds || [];
    if (ids.includes?.(row.id)) return s.name || s.title || 'Team';
  }
  return 'My bots';
}

// Who is doing what, from the roster row and its cached transcript.
function statusOf(row, entries, now) {
  const lastAt = row.lastActivityAt || row.updatedAt || now;
  const lastText = snippet(row.lastEntry?.text);
  if (row.awaitingUserResponse) return { state: 'waiting', task: lastText, at: lastAt };
  const talk = entries.filter((e) => e.kind === 'message' || e.kind === 'send-message');
  const last = talk[talk.length - 1];
  if (talk.some((e) => e.isStreaming)) return { state: 'working', task: 'Writing a reply', at: lastAt };
  if (last?.kind === 'message' && last.role === 'user' && now - (last.timestampMs || 0) < WORKING_FOR) {
    return { state: 'working', task: `On it: ${snippet(last.content)}`, at: last.timestampMs };
  }
  if (now - lastAt < FRESH) return { state: 'working', task: lastText, at: lastAt };
  // Its last word asks something of you and you haven't answered: a choice card, a
  // permission request, a form, an email draft to approve, or a plain question.
  // (The app's own awaitingUserResponse flag only covers some of these.)
  const m = last?.kind === 'send-message' ? last.message || {} : null;
  if (m && now - (last.timestampMs || 0) < ASKING_FOR) {
    const ask = {
      widget: () => m.widget?.prompt || 'Pick an option',
      'local-tool-permission': () => m.ask?.title || m.ask?.description || 'Asks permission to use a tool',
      'user-form': () => m.formRequest?.title || 'Fill in a form',
      'email-draft': () => `Approve email${m.draft?.subject ? `: ${m.draft.subject}` : ''}`,
      text: () => (/[?？]\s*$/.test(String(m.content || '')) ? m.content : null),
    }[m.type]?.();
    if (ask) return { state: 'waiting', task: snippet(ask), at: last.timestampMs };
  }
  return { state: 'resting', task: lastText, at: lastAt };
}

// Messages it sent in the last 7 days: the cache has no per-bot token counts.
const recentReplies = (entries, now) => entries.filter((e) => e.kind === 'send-message' && now - (e.timestampMs || 0) < 7 * 864e5).length;

// ---------- turning the cache into feed messages ----------

let last = { roster: '', status: new Map(), plan: '', usage: '' };

function snapshot(full) {
  const cache = readCache();
  const now = Date.now();
  if (!cache) return full ? [{ t: 'roster', bots: [] }] : [];
  const out = [];
  const rows = cache.roster.filter((r) => !r.isRemovedFromSidebar && !r.isHiddenFromSidebar && !r.isGroup);
  const bots = rows.map((r) => ({
    id: r.id, name: r.name || 'Bot', team: teamOf(r, cache.sections),
    shape: r.avatarShape || 'blob', color: COLOR[r.avatarColor] || '#777777',
    chat: `grokbot://agent/${encodeURIComponent(r.id)}`, // opens this bot in the desktop app
  }));
  const rosterKey = JSON.stringify(bots);
  if (full || rosterKey !== last.roster) out.push({ t: 'roster', bots });
  last.roster = rosterKey;

  const usage = [];
  for (const r of rows) {
    const entries = cache.transcript(r.id);
    const s = statusOf(r, entries, now);
    const prev = last.status.get(r.id);
    const key = `${s.state}|${s.task}`;
    if (full || key !== prev?.key) {
      // a bot that was working and now isn't has finished something
      const state = prev && prev.state === 'working' && s.state === 'resting' ? 'done' : s.state;
      out.push({ bot: r.id, state, task: s.task, at: s.at });
    }
    last.status.set(r.id, { key, state: s.state });
    usage.push({ bot: r.id, used: recentReplies(entries, now) });
  }
  const usageKey = JSON.stringify(usage);
  if (full || usageKey !== last.usage) out.push({ t: 'usage', unit: 'replies', bots: usage });
  last.usage = usageKey;

  if (cache.usage) {
    const plan = { t: 'plan', percent: cache.usage.percentUsed, resetAt: cache.usage.nextResetMs, label: cache.usage.unifiedPlanName || cache.usage.grokPlanLabel || '' };
    const planKey = JSON.stringify(plan);
    if (full || planKey !== last.plan) out.push(plan);
    last.plan = planKey;
  }
  return out;
}

// ---------- server ----------

const clients = new Set();
const send = (res, msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);

let timer = null;
function changed() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const msgs = snapshot(false);
    for (const res of clients) for (const m of msgs) send(res, m);
  }, 250);
}
if (existsSync(DIR)) watch(DIR, changed);
// time alone also changes states (a question going stale, fresh output aging)
setInterval(changed, 15e3);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8' };

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ping') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, source: 'grokbot-local', found: existsSync(DIR) }));
  }
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    clients.add(res);
    last = { roster: '', status: new Map(last.status), plan: '', usage: '' };
    for (const m of snapshot(true)) send(res, m);
    const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  const path = resolve(ROOT, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (!path.startsWith(ROOT + sep) || path.includes(`${sep}.`) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(path));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`GrokBot Office: http://127.0.0.1:${PORT}/`);
  console.log(existsSync(DIR) ? `Reading Grok Bot from ${DIR}` : `Grok Bot cache not found at ${DIR} (set GROKBOT_DIR)`);
});
