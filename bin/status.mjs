// Works out what each bot is doing from the Grok Bot app's local cache.
//
// The cache has no "turn running" flag. A transcript holds the messages: yours
// (`message`, role user), other bots' (`message`, role user, `fromAgent`), the bot's
// replies to you (`send-message`) and its messages to other bots (`message`, role
// assistant, `toAgent`). Tool calls, browsing, subagents and other long work leave no
// entries. So a bot that says "On it" and then works for 20 minutes has a transcript
// that goes quiet. These rules read that quiet stretch as work, within limits:
//
//   waiting  the app flags it, or its last word asks you something (a choice card, a
//            permission, a form, an email draft, a question)
//   error    its last turn was cut off ("A background task was stopped ...")
//   working  - a reply is streaming
//            - a message to it (from you or another bot) has no answer yet (TURN_MAX)
//            - its last reply is a short "on it / let me check / 正在處理" (TURN_MAX)
//            - it handed work to another bot that hasn't answered back (TURN_MAX)
//            - a bot it asked for help is still working on it
//            - it said something in the last GRACE minutes
//   resting  anything else (it's on a break)
//
// GROKBOT_GRACE_MIN and GROKBOT_TURN_MAX_MIN change the two windows.

const min = (env, d) => (Number(process.env[env]) > 0 ? Number(process.env[env]) : d) * 60e3;
export const GRACE = min('GROKBOT_GRACE_MIN', 8);
export const TURN_MAX = min('GROKBOT_TURN_MAX_MIN', 50); // the app stops background tasks after 50 minutes
const ASKING_FOR = 24 * 3600e3; // an unanswered question from the bot counts as waiting for this long
const STUCK_FOR = 30 * 60e3;

const snippet = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
const ago = (ms) => (ms < 90e3 ? `${Math.round(ms / 1e3)}s` : `${Math.round(ms / 60e3)}m`);

// "I'm on it" in English and Chinese: a short reply that acknowledges, not the result.
// (Long replies are taken as the answer, whatever they say.)
const INTERIM = /\b(on it|i'?ll (get|start|look|check|dig|work|run|go|do|try|find|take|handle|build|write|fix|set)|i'?m (now )?(going to|working|starting|looking|checking|running|on it|digging|setting|building|writing|fixing)|let me (check|look|try|start|get|run|dig|see|find|work|take|pull|go)|working on (it|this|that)|starting (now|on)|one (moment|sec)|give me (a|\d)|be right back|in progress|stand by|will (report|update you|get back))\b|稍等|馬上|正在|開始(處理|做|進行|研究|找|執行|動工)|我來(處理|看|做|找|查|跑)|我先(看|查|跑|處理|找|試)|處理中|進行中|執行中|等我|晚點回報|完成後(回報|告訴|通知)/i;
const interim = (m) => { const c = String(m?.content || ''); return c.length > 0 && c.length < 500 && INTERIM.test(c); };

const inbound = (e) => (e.kind === 'message' && e.role === 'user') || e.kind === 'user-attachment';
const output = (e) => e.kind === 'send-message' || (e.kind === 'message' && e.role === 'assistant');
const agentOf = (x) => (x && typeof x === 'object' ? x.id || x.agentId : x) || null;

function askOf(m) {
  return {
    widget: () => m.widget?.prompt || 'Pick an option',
    'local-tool-permission': () => m.ask?.title || m.ask?.description || 'Asks permission to use a tool',
    'user-form': () => m.formRequest?.title || 'Fill in a form',
    'email-draft': () => `Approve email${m.draft?.subject ? `: ${m.draft.subject}` : ''}`,
    text: () => (/[?？]\s*$/.test(String(m.content || '')) ? m.content : null),
  }[m.type]?.() || null;
}

// One bot on its own. `why` says which rule decided, for GROKBOT_DEBUG and /api/debug.
export function statusOf(row, entries, now) {
  const lastAt = Math.max(row.lastActivityAt || 0, entries.at(-1)?.timestampMs || 0) || row.updatedAt || now;
  const lastText = snippet(row.lastEntry?.text);
  const S = (state, task, why, at = lastAt, extra = {}) => ({ state, task, why, at, ...extra });
  if (row.awaitingUserResponse) return S('waiting', lastText, 'app: awaiting your response');
  const talk = entries.filter((e) => inbound(e) || output(e) || e.kind === 'notice');
  if (talk.some((e) => e.isStreaming)) return S('working', 'Writing a reply', 'a reply is streaming');

  // the current turn: the last message to it, and everything it has said since
  let i = talk.length - 1;
  while (i >= 0 && !inbound(talk[i])) i--;
  const ask = i >= 0 ? talk[i] : null;
  const after = talk.slice(i + 1);
  const outs = after.filter(output);
  const lastOut = outs.at(-1);
  const notice = after.filter((e) => e.kind === 'notice').at(-1);
  const from = agentOf(ask?.fromAgent);

  if (notice && (!lastOut || notice.timestampMs >= lastOut.timestampMs) && /stopped|failed|error|timed out|interrupted/i.test(notice.text || '') && now - notice.timestampMs < STUCK_FOR) {
    return S('error', snippet(notice.text), 'its task was stopped', notice.timestampMs);
  }
  if (lastOut?.kind === 'send-message' && now - lastOut.timestampMs < ASKING_FOR) {
    const q = askOf(lastOut.message || {});
    if (q) return S('waiting', snippet(q), `asked you ${ago(now - lastOut.timestampMs)} ago`, lastOut.timestampMs);
  }
  if (ask && !lastOut && now - ask.timestampMs < TURN_MAX) {
    return S('working', `On it: ${snippet(ask.content) || 'a new message'}`, `${from ? 'a bot' : 'you'} messaged it ${ago(now - ask.timestampMs)} ago, no reply yet`, ask.timestampMs, { from });
  }
  // work handed to other bots that hasn't come back yet
  const waitsOn = [];
  talk.forEach((e, k) => {
    const to = e.kind === 'message' && e.role === 'assistant' && agentOf(e.toAgent);
    if (!to || now - e.timestampMs > TURN_MAX) return;
    const back = talk.slice(k + 1).some((x) => inbound(x) && agentOf(x.fromAgent) === to);
    if (!back && !waitsOn.includes(to)) waitsOn.push(to);
  });
  if (waitsOn.length) {
    const t = Math.max(...talk.filter((e) => waitsOn.includes(agentOf(e.toAgent))).map((e) => e.timestampMs));
    return S('working', 'Working with other bots', `handed work to ${waitsOn.length} other bot${waitsOn.length > 1 ? 's' : ''} ${ago(now - t)} ago, not back yet`, t, { from, waitsOn });
  }
  if (lastOut?.kind === 'send-message' && now - lastOut.timestampMs < TURN_MAX && interim(lastOut.message)) {
    return S('working', snippet(ask?.content ? `On it: ${ask.content}` : lastOut.message.content), `said it's on it ${ago(now - lastOut.timestampMs)} ago`, lastOut.timestampMs, { from });
  }
  if (now - lastAt < GRACE) return S('working', lastText, `active ${ago(now - lastAt)} ago (grace ${GRACE / 60e3}m)`, lastAt, { from });
  return S('resting', lastText, `quiet for ${ago(now - lastAt)}`, lastAt);
}

// Every bot, then the links between them: a bot waiting on a teammate that is still
// busy with its request is busy too (and so is the bot that asked the busy one).
export function statusAll(rows, transcriptOf, now) {
  const out = new Map(rows.map((r) => [r.id, statusOf(r, transcriptOf(r.id), now)]));
  for (let pass = 0; pass < 2; pass++) {
    for (const [id, s] of out) {
      if (s.state !== 'working') continue;
      for (const up of [s.from].filter(Boolean)) {
        const u = out.get(up);
        if (u && u.state === 'resting' && now - u.at < TURN_MAX) {
          const name = rows.find((r) => r.id === id)?.name || 'a teammate';
          out.set(up, { ...u, state: 'working', task: `Waiting on ${name}`, why: `${name} is still working on its request` });
        }
      }
    }
  }
  return out;
}

// Detect both recorded shell calls and explicit assistant hand-offs.
export function codexOf(entries, now, botState = null) {
  entries = Array.isArray(entries) ? entries.filter((e) => e && typeof e === 'object') : [];
  const matches = [];
  for (const e of entries) {
    let payload = '';
    try { payload = JSON.stringify(e); } catch { continue; }
    const tool = /tool|shell|command|exec|bash/i.test(`${e.kind || ''} ${e.type || ''}`) || ['command', 'args', 'input'].some((k) => k in e);
    const text = String(e.message?.content || e.content || e.text || '');
    const hand = output(e) && /\bcodex\b/i.test(text) && (/\b(hand|delegat|ask|run|send|let|have|using|use|kick|start)\w*/i.test(text) || /(?:交給|請|用|讓|叫).*codex/i.test(text));
    if ((tool && /\bcodex(\s+(exec|e|run|apply|resume)\b|\s+["'\-]|(?=["\\]|$))/i.test(payload)) || hand) matches.push({ e, tool, at: Number(e.timestampMs || e.at || 0), text });
  }
  const handoffs = [];
  for (const h of matches.sort((a, b) => a.at - b.at)) if (h.at && (!handoffs.length || h.at - handoffs.at(-1) >= 120e3)) handoffs.push(h.at);
  const h = matches.at(-1);
  if (!h || !h.at) return { state: null, at: null, task: '', why: 'no hand-off', handoffs };
  const after = entries.filter((e) => (e.timestampMs || 0) > h.at);
  const finished = h.tool && (['result', 'output', 'exitCode', 'endedAt'].some((k) => eHas(h.e, k)) || /^(done|completed|finished|success|failed)$/i.test(String(h.e.status || '')));
  const reply = after.find((e) => output(e) && !interim(e.message || e) && !(/\bcodex\b/i.test(String(e.message?.content || e.content || '')) && /hand|delegat|using/i.test(String(e.message?.content || e.content || ''))));
  const lastInbound = entries.filter(inbound).at(-1)?.timestampMs || 0;
  const state = finished || reply || (botState && botState !== 'working') ? 'done' : ((h.at >= lastInbound || botState === 'working') && now - h.at < TURN_MAX ? 'running' : null);
  const at = reply?.timestampMs || Number(h.e.endedAt) || h.at;
  return { state: state === 'done' && now - at > 15 * 60e3 ? null : state, at, task: snippet(h.e.command || h.e.input || h.text || 'Codex task'), why: finished ? 'tool finished' : reply ? 'assistant replied' : state === 'done' ? 'bot stopped working' : state === 'running' ? 'hand-off in current turn' : 'hand-off expired', handoffs };
}
const eHas = (e, k) => Object.prototype.hasOwnProperty.call(e, k) && e[k] != null;
