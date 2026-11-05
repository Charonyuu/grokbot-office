// The panels around the office: lift buttons for floors, a "needs you" inbox,
// one card on the right that follows what you are looking at.

import { workedMs } from './store.js';

const STATE_LABEL = { working: 'Busy', waiting: 'Needs you', error: 'Stuck', resting: 'On a break' };
const STATES = ['working', 'waiting', 'error', 'resting'];
const COLOR = { working: '#5fd38a', waiting: '#f5b544', error: '#ff5d5d', resting: '#8b8b94' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ago = (ms) => {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
};
const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n)));

const ICON = {
  logo: '<svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="4" width="26" height="25" rx="9" fill="#ff6b57"/><rect x="11" y="12" width="3.4" height="7" rx="1.7" fill="#fff"/><rect x="17.6" y="12" width="3.4" height="7" rx="1.7" fill="#fff"/></svg>',
  everyone: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2"/><rect x="9" y="2" width="5" height="5" rx="1.2"/><rect x="2" y="9" width="5" height="5" rx="1.2"/><rect x="9" y="9" width="5" height="5" rx="1.2"/></svg>',
  building: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 14V3.5L8 2l5 1.5V14M3 14h10M6 6h1M9 6h1M6 9h1M9 9h1M7 14v-2h2v2"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6"/></svg>',
  minus: '<svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 6h7"/></svg>',
  plus: '<svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7"/></svg>',
  chat: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>',
  arrow: '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg>',
};

const BODY = {
  blob: '<ellipse cx="16" cy="17" rx="12.5" ry="11.5"/>',
  pebble: '<ellipse cx="16" cy="18" rx="13.5" ry="9.5"/>',
  bean: '<rect x="9" y="3" width="14" height="26" rx="7" transform="rotate(-30 16 16)"/>',
  egg: '<ellipse cx="16" cy="17" rx="10.5" ry="13"/>',
  capsule: '<rect x="8" y="3" width="16" height="26" rx="8"/>',
  cylinder: '<rect x="6" y="4" width="20" height="24" rx="6"/>',
  dome: '<path d="M4 27c0-11 5.4-20 12-20s12 9 12 20z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  teardrop: '<path d="M16 3c4 6 10 11 10 17a10 10 0 0 1-20 0c0-6 6-11 10-17z"/>',
  squircle: '<rect x="4" y="4" width="24" height="24" rx="10"/>',
  tablet: '<rect x="8" y="3" width="16" height="26" rx="6"/>',
  square: '<rect x="5" y="5" width="22" height="22" rx="5"/>',
  hex: '<path d="M10 4.5h12l6 11.5-6 11.5H10L4 16z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  gem: '<path d="M9 6h14l5 7-12 15L4 13z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  crystal: '<path d="M16 3l7 9-3 16h-8L9 12z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  wedge: '<path d="M16 5l12 21H4z" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/>',
  shield: '<path d="M5 5h22v10c0 6-5 10-11 13C10 25 5 21 5 15z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  arch: '<path d="M6 28V15a10 10 0 0 1 20 0v13z"/>',
  cloud: '<path d="M9 26a6 6 0 0 1-1-12 8 8 0 0 1 15-3 7 7 0 0 1 1 15z"/>',
  leaf: '<path d="M16 3c7 5 9 11 9 14s-3 11-9 12c-6-1-9-9-9-12s2-9 9-14z"/>',
  sparkle: '<path d="M16 3l3.2 9.8L29 16l-9.8 3.2L16 29l-3.2-9.8L3 16l9.8-3.2z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  clover: '<circle cx="11" cy="11" r="6.5"/><circle cx="21" cy="11" r="6.5"/><circle cx="11" cy="21" r="6.5"/><circle cx="21" cy="21" r="6.5"/>',
  flower: '<circle cx="16" cy="9" r="6"/><circle cx="22.7" cy="13.9" r="6"/><circle cx="20.1" cy="21.8" r="6"/><circle cx="11.9" cy="21.8" r="6"/><circle cx="9.3" cy="13.9" r="6"/>',
  heart: '<path d="M16 28C6 21 3 15.5 3 11a6.5 6.5 0 0 1 13-1 6.5 6.5 0 0 1 13 1c0 4.5-3 10-13 17z"/>',
  house: '<path d="M16 4l11 9v14H5V13z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  pumpkin: '<ellipse cx="16" cy="18" rx="13" ry="10.5"/><path d="M15 8c0-2 1-4 3-5" stroke="#3b2a1c" stroke-width="2.4" stroke-linecap="round" fill="none"/>',
  drop: '<path d="M5 25.5C5 12 9.5 4 16 4s11 8 11 21.5c0 1.4-1.1 2.5-2.5 2.5h-17C6.1 28 5 26.9 5 25.5z"/>',
  cube: '<rect x="4" y="5" width="24" height="23" rx="8"/>',
  tri: '<path d="M16 4c1.3 0 2.3.7 3 1.9l9.3 17.4c1.1 2.1-.4 4.7-2.8 4.7H6.5c-2.4 0-3.9-2.6-2.8-4.7L13 5.9C13.7 4.7 14.7 4 16 4z"/>',
  star: '<path d="M16 4.5l3.5 7.2 7.9 1.1-5.7 5.6 1.3 7.9L16 22.6l-7 3.7 1.3-7.9-5.7-5.6 7.9-1.1z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  ghost: '<rect x="7" y="3" width="18" height="26" rx="9"/>',
};

export function avatar(shape, color, size = 28) {
  const ey = { tri: 16.5, wedge: 15.5, star: 13, pumpkin: 15, pebble: 15, heart: 11 }[shape] ?? 12.5;
  // the pets' eyes lean a little, like in the app
  const eye = (x) => `<rect x="${x}" y="${ey}" width="3.2" height="6" rx="1.6" fill="#fff" transform="rotate(14 ${x + 1.6} ${ey + 3})"/>`;
  return `<svg class="av" width="${size}" height="${size}" viewBox="0 0 32 32" style="color:${esc(color)}" fill="currentColor" aria-hidden="true">${BODY[shape] || BODY.blob}${eye(11.2)}${eye(17.6)}</svg>`;
}

// Ring around a lift button: one arc per state, sized by how many bots are in it.
function ring(list) {
  if (!list.length) return 'conic-gradient(#3a3a40 0 100%)';
  let at = 0;
  const stops = [];
  for (const s of STATES) {
    const n = list.filter((b) => b.state === s).length;
    if (!n) continue;
    const to = at + (n / list.length) * 100;
    stops.push(`${COLOR[s]} ${at}% ${to}%`);
    at = to;
  }
  return `conic-gradient(${stops.join(',')})`;
}

const PLACE = { desk: 'At desks', cafe: 'Café', gym: 'Gym', lounge: 'Lounge' };

export function createUI(root, { state, onFloor, onSpread, onSelect, onZoom, activityOf = () => null, places = () => null }) {
  let focus = null, spread = false, selected = null, queued = false, cardKey = '', swapTimer = 0, lastInbox = null;

  root.innerHTML = `
    <div id="brand" class="panel pill">${ICON.logo}<b>GrokBot Office</b><span class="live"><i></i><span id="live-text">Live</span><span class="sep">·</span><span id="clock"></span></span></div>
    <div id="pulse" class="panel pill"></div>
    <nav id="lift" class="panel" aria-label="Floors"></nav>
    <section id="card" class="panel"></section>
    <section id="inbox"></section>
    <div id="hint">Drag to move · Right-drag or ⇧-drag to rotate · Scroll or pinch to zoom · Double-click to reset</div><div id="zoom" class="panel pill"><button data-zoom="0" aria-label="Reset view" title="Reset view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg></button><button data-zoom="-1" aria-label="Zoom out">${ICON.minus}</button><button data-zoom="1" aria-label="Zoom in">${ICON.plus}</button></div>`;
  const $ = (id) => root.querySelector(id);

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-floor],[data-overview],[data-spread],[data-bot],[data-zoom],[data-close]');
    if (!t) return;
    if (t.dataset.floor != null) onFloor(t.dataset.floor);
    else if (t.hasAttribute('data-overview')) onFloor(null);
    else if (t.hasAttribute('data-spread')) onSpread?.();
    else if (t.dataset.bot) onSelect(t.dataset.bot);
    else if (t.dataset.zoom) onZoom(+t.dataset.zoom);
    else if (t.hasAttribute('data-close')) onSelect(null);
  });

  const bots = () => [...state.bots.values()];
  const floorNo = (team) => state.teams.length - state.teams.indexOf(team);
  const count = (list, s) => list.filter((b) => b.state === s).length;

  function feed(lines) {
    return `<ol class="feed">${lines
      .map((a) => { const b = state.bots.get(a.id); return b ? `<li class="d-${a.state}"><time>${hhmm(a.at)}</time><span><b>${esc(b.name)}</b> ${esc(a.text)}</span></li>` : ''; })
      .join('') || '<li class="empty"><span>Nothing yet</span></li>'}</ol>`;
  }

  function botCard(b, now) {
    const hours = (workedMs(b, now) / 3600e3).toFixed(1);
    return `<div class="id-top" style="--c:${esc(b.color)}">
        <button class="x" data-close aria-label="Close">${ICON.x}</button>
        <span class="id-av">${avatar(b.shape, b.color, 46)}</span>
        <div class="id-name">${esc(b.name)}</div>
        <div class="id-sub">${esc(b.team)} · floor ${floorNo(b.team)}</div>
        <div class="state d-${b.state}"><i></i>${STATE_LABEL[b.state]} · ${ago(now - b.since)}</div>
        ${(() => { const a = activityOf(b.id); return a && b.state === 'resting' ? `<div class="where">${esc(a.label)}${a.zone !== 'desk' ? ` · ${esc(PLACE[a.zone])}` : ''}</div>` : ''; })()}
      </div>
      <div class="now"><span>${b.state === 'waiting' ? 'Asking you' : b.state === 'error' ? 'Stuck on' : b.state === 'resting' ? 'Last task' : 'Now'}</span><p>${esc(b.task || 'Nothing yet')}</p></div>
      <div class="nums"><div><b>${b.steps}</b>updates</div><div><b>${b.tasks}</b>done</div><div><b>${hours}h</b>busy</div><div><b>${kfmt(b.usage)}</b>${esc(state.usageUnit)}</div></div>
      <div class="sub-h">Timeline</div>
      ${feed(b.recent.map((r) => ({ ...r, id: b.id })))}
      ${b.chat ? `<a class="btn" href="${esc(b.chat)}"${b.chat.startsWith('http') ? ' target="_blank" rel="noopener"' : ''}>${ICON.chat}${b.chat.startsWith('grokbot:') ? (b.state === 'waiting' ? 'Answer in Grok Bot' : 'Open in Grok Bot') : 'Open chat'}</a>` : `<button class="btn" disabled>${ICON.chat}No chat link yet</button>`}`;
  }

  function floorCard(team) {
    const list = bots().filter((b) => b.team === team);
    return `<div class="fl-top"><span class="fl-no">${floorNo(team)}</span><div><div class="fl-name">${esc(team)}</div><div class="fl-meta">${list.length} bots · ${count(list, 'working')} busy${count(list, 'waiting') ? ` · <em>${count(list, 'waiting')} need you</em>` : ''}${count(list, 'error') ? ` · <em class="e">${count(list, 'error')} stuck</em>` : ''}</div></div></div>
      ${(() => { const p = places(team); return p ? `<div class="places">${Object.entries(PLACE).map(([k, v]) => `<span class="pc pc-${k}"><b>${p[k]}</b>${v}</span>`).join('')}</div>` : ''; })()}
      <div class="tiles">${list.map((b) => `<button class="tile d-${b.state}" data-bot="${esc(b.id)}">${avatar(b.shape, b.color, 34)}<span>${esc(b.name)}</span><i></i></button>`).join('')}</div>
      <div class="sub-h">Latest on this floor</div>
      ${feed(state.activity.filter((a) => state.bots.get(a.id)?.team === team).slice(0, 4))}`;
  }

  function todayCard(now) {
    const list = bots().sort((a, b) => b.usage - a.usage);
    const max = list[0]?.usage || 1;
    const total = list.reduce((s, b) => s + b.usage, 0);
    const plan = state.plan;
    return `<div class="fl-top"><div><div class="fl-name">Today</div><div class="fl-meta">${list.length} bots on ${state.teams.length} floor${state.teams.length === 1 ? '' : 's'}</div></div><div class="total"><b>${kfmt(total)}</b>${esc(state.usageUnit)}</div></div>
      ${plan ? `<div class="plan"><div class="plan-row"><span>${esc(plan.label || 'Plan')} this week</span><b>${plan.percent.toFixed(0)}%</b></div><span class="u-bar"><i style="width:${Math.min(100, Math.max(2, plan.percent)).toFixed(1)}%;background:${plan.percent > 85 ? 'var(--error)' : plan.percent > 60 ? 'var(--waiting)' : 'var(--working)'}"></i></span>${plan.resetAt ? `<div class="plan-reset">resets in ${ago(plan.resetAt - now)}</div>` : ''}</div>` : ''}
      <div class="sub-h">${state.usageUnit === 'tokens' ? 'Who uses the most' : 'Most active this week'}</div>
      <ul class="usage">${list.slice(0, 6).map((b) => `<li><button class="row" data-bot="${esc(b.id)}">${avatar(b.shape, b.color, 20)}<span class="u-name">${esc(b.name)}</span><span class="u-bar"><i style="width:${Math.max(3, (b.usage / max) * 100).toFixed(1)}%;background:${esc(b.color)}"></i></span><span class="u-val">${kfmt(b.usage)}</span></button></li>`).join('')}</ul>
      <div class="sub-h">Every bot <span class="sub-n">${list.length}</span></div>
      ${state.teams.map((team) => { const fb = bots().filter((b) => b.team === team); return `<div class="every"><div class="every-h">${floorNo(team)} · ${esc(team)}</div><div class="mini">${fb.map((b) => `<button class="mb d-${b.state}" data-bot="${esc(b.id)}" title="${esc(b.name)} · ${STATE_LABEL[b.state]}">${avatar(b.shape, b.color, 22)}<i></i></button>`).join('')}</div></div>`; }).join('')}
      <div class="sub-h">Latest</div>
      ${feed(state.activity.slice(0, 4))}`;
  }

  function render() {
    queued = false;
    const now = Date.now();
    const list = bots();
    $('#clock').textContent = hhmm(now);
    $('#live-text').textContent = state.source === 'demo' ? 'Demo' : state.conn === 'live' ? 'Live' : 'Reconnecting';
    $('#brand').classList.toggle('off', state.source !== 'demo' && state.conn !== 'live');

    const n = Object.fromEntries(STATES.map((s) => [s, count(list, s)]));
    $('#pulse').innerHTML = `<span class="bar">${STATES.map((s) => (n[s] ? `<i class="d-${s}" style="flex:${n[s]}"></i>` : '')).join('')}</span>
      <span class="pl d-working"><b>${n.working}</b> busy</span><span class="pl d-waiting${n.waiting ? ' on' : ''}"><b>${n.waiting}</b> need you</span><span class="pl d-error${n.error ? ' on' : ''}"><b>${n.error}</b> stuck</span><span class="pl d-resting"><b>${n.resting}</b> on a break</span>`;

    $('#lift').innerHTML = `<button class="lb all${spread ? ' on' : ''}" data-spread title="Every floor side by side: all your bots at once"><span class="lb-btn">${ICON.everyone}</span><span class="lb-name">All bots<em class="n">${list.length}</em></span></button><button class="lb all${focus || spread ? '' : ' on'}" data-overview title="Whole building"><span class="lb-btn">${ICON.building}</span><span class="lb-name">Building</span></button>${state.teams
      .map((team) => {
        const fb = list.filter((b) => b.team === team);
        const hot = count(fb, 'waiting') + count(fb, 'error');
        return `<button class="lb${focus === team ? ' on' : ''}" data-floor="${esc(team)}"><span class="lb-btn" style="--ring:${ring(fb)}"><span>${floorNo(team)}</span></span><span class="lb-name">${esc(team)}${hot ? `<em>${hot}</em>` : ''}</span></button>`;
      })
      .join('')}`;

    const asks = list.filter((b) => b.state === 'waiting' || b.state === 'error').sort((a, b) => a.since - b.since);
    // only touch the inbox when it changes, so its cards don't replay their slide-in
    const inbox = asks.length
      ? `<div class="ib-h"><span>Needs you</span><b>${asks.length}</b></div>${asks
          .slice(0, 3)
          .map((b) => `<button class="ask panel d-${b.state}" data-bot="${esc(b.id)}">${avatar(b.shape, b.color, 30)}<span class="ask-main"><span class="ask-who"><b>${esc(b.name)}</b><time>${ago(now - b.since)}</time></span><span class="ask-q">${esc(b.task || STATE_LABEL[b.state])}</span></span>${ICON.arrow}</button>`)
          .join('')}${asks.length > 3 ? `<div class="ib-more">and ${asks.length - 3} more</div>` : ''}`
      : '';
    if (inbox !== lastInbox) $('#inbox').innerHTML = lastInbox = inbox;

    const sel = selected && state.bots.get(selected);
    const card = $('#card');
    const key = sel ? `bot:${sel.id}` : focus ? `floor:${focus}` : 'today';
    card.innerHTML = sel ? botCard(sel, now) : focus ? floorCard(focus) : todayCard(now);
    if (key !== cardKey) {
      // restart the slide-in when the card shows something else
      cardKey = key;
      card.classList.remove('swap');
      void card.offsetWidth;
      card.classList.add('swap');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => card.classList.remove('swap'), 600);
    }
  }

  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };
  setInterval(schedule, 1000);

  return {
    render: schedule,
    setFocus(f, s = false) { focus = f; spread = s; schedule(); },
    setSelected(id) { selected = id; schedule(); },
  };
}
