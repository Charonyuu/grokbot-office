// A fake Grok Bot cache with one bot per working/waiting/stuck/resting rule in
// bin/status.mjs, including bots that are busy in the app but used to show as on a
// break (an "on it" reply, a hand-off to another bot, a long-running request).
//
//   node dev/fake-cache.mjs /tmp/fake            # write it, then
//   GROKBOT_DIR=/tmp/fake GROKBOT_DEBUG=1 node bin/office.mjs
//   node dev/fake-cache.mjs /tmp/fake --check    # check the rules without the server
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '/tmp/grokbot-fake-cache';
rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
const A = 'sand.client.slice.account.grok%7Cuser_TEST';
const b32 = (s) => { const bytes = Buffer.from(s); let bits = ''; for (const x of bytes) bits += x.toString(2).padStart(8, '0'); while (bits.length % 5) bits += '0'; let o = ''; for (let i = 0; i < bits.length; i += 5) o += 'abcdefghijklmnopqrstuvwxyz234567'[parseInt(bits.slice(i, i + 5), 2)]; return o; };
const put = (name, value) => writeFileSync(`${dir}/${b32(name)}.blob`, JSON.stringify({ schemaVersion: 1, value }));
const now = Date.now(), m = (x) => now - x * 60e3;
let seq = 0;
const user = (t, content, fromAgent) => ({ kind: 'message', id: `e${seq}`, seq: seq++, role: 'user', content, isStreaming: false, timestampMs: m(t), requestId: `r${t}`, ...(fromAgent ? { fromAgent: { id: fromAgent } } : {}) });
const say = (t, content) => ({ kind: 'send-message', id: `e${seq}`, seq: seq++, message: { type: 'text', content }, timestampMs: m(t), requestId: `r${t}` });
const toBot = (t, to) => ({ kind: 'message', id: `e${seq}`, seq: seq++, role: 'assistant', content: 'please look into it', isStreaming: false, toAgent: { id: to }, timestampMs: m(t) });
const widget = (t) => ({ kind: 'send-message', id: `e${seq}`, seq: seq++, message: { type: 'widget', widget: { prompt: 'Which headline?' } }, timestampMs: m(t) });
const notice = (t, text) => ({ kind: 'notice', id: `e${seq}`, seq: seq++, text, timestampMs: m(t) });
const long = 'Here is the full write-up. '.repeat(30);
const bots = [
  ['ack', 'Ack Then Work', 'blob', 'blue', [user(21, 'Fix the login bug'), say(20, "On it, I'll dig through the logs and report back.")], 'working'],
  ['zh', 'Chinese Ack', 'egg', 'red', [user(26, '幫我整理報表'), say(25, '好的，我正在處理，完成後回報')], 'working'],
  ['coord', 'Coordinator', 'house', 'violet', [user(16, 'Ship the release notes'), toBot(15, 'worker'), say(14.5, 'I asked Worker to draft them.')], 'working'],
  ['worker', 'Worker', 'star', 'orange', [user(35, 'Draft release notes', 'coord')], 'working'],
  ['done', 'Done Bot', 'heart', 'magenta', [user(40, 'Summarise the doc'), say(30, long)], 'resting'],
  ['asks', 'Asks You', 'cloud', 'cyan', [user(9, 'Pick a headline'), widget(5)], 'waiting'],
  ['recent', 'Just Replied', 'leaf', 'green', [user(6, 'Status?'), say(5, 'All good, nothing new.')], 'working'],
  ['stopped', 'Stopped Task', 'gem', 'gray', [user(55, 'Crawl the site'), say(54, 'Starting now.'), notice(3, 'A background task was stopped after 50 minutes so it could not finish.')], 'error'],
  ['old', 'Old Quiet', 'pebble', 'brown', [user(300, 'hi'), say(299, 'Hello! How can I help today, anything you need from me?!')], 'resting'],
  ['routine', 'Routine Run', 'square', 'yellow', [say(3, 'Weekly digest sent to your inbox.')], 'working'],
];
put(`${A}.roster.last-roster`, { rows: bots.map(([id, name, shape, color, ents]) => ({ id, name, avatarShape: shape, avatarColor: color, lastActivityAt: ents.at(-1).timestampMs, updatedAt: ents.at(-1).timestampMs, lastEntry: { kind: 'text', text: ents.at(-1).content || ents.at(-1).message?.content || ents.at(-1).text || '' }, awaitingUserResponse: false, isGroup: false })) });
put(`${A}.sidebar.last-sections`, { sections: [] });
for (const [id, , , , ents] of bots) put(`${A}.transcript.replicas.${id}`, { entries: ents, persistedAt: now });
writeFileSync(`${dir}/expected.json`, JSON.stringify(Object.fromEntries(bots.map((b) => [b[1], b[5]]))));
console.log('wrote', dir, bots.length, 'bots');

if (process.argv.includes('--check')) {
  const { statusAll } = await import('../bin/status.mjs');
  const rows = bots.map(([id, name, , , ents]) => ({ id, name, lastActivityAt: ents.at(-1).timestampMs }));
  const states = statusAll(rows, (id) => bots.find((b) => b[0] === id)[4], Date.now());
  let bad = 0;
  for (const [id, name, , , , want] of bots) {
    const s = states.get(id);
    if (s.state !== want) bad++;
    console.log(`${s.state === want ? 'ok ' : 'BAD'} ${name.padEnd(14)} ${s.state.padEnd(8)} ${s.why}`);
  }
  if (bad) { console.log(`${bad} wrong`); process.exit(1); }
  console.log('all as expected');
}
