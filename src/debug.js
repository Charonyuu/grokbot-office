// ?debug: a panel listing every bot's state and the rule that decided it, so you can
// check the office against the Grok Bot app. Reads /api/debug from bin/office.mjs;
// in the demo it shows the demo's own states.

import { state } from './store.js';

const COLORS = { working: '#2e9d57', waiting: '#d99a1e', error: '#e04848', resting: '#8a8a94' };

export function startDebug() {
  const box = document.createElement('div');
  box.id = 'debug';
  box.style.cssText = 'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:50;max-width:min(760px,90vw);max-height:42vh;overflow:auto;background:rgba(24,24,28,.92);color:#eee;font:12px/1.45 ui-monospace,Menlo,monospace;padding:10px 12px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.25)';
  document.body.appendChild(box);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const draw = (bots, head) => {
    box.innerHTML = `<div style="opacity:.7;margin-bottom:4px">${esc(head)}</div>` + bots.map((b) => `<div><b style="color:${COLORS[b.state] || '#ccc'};display:inline-block;width:64px">${esc(b.state)}</b> <span style="display:inline-block;width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom">${esc(b.name)}</span> ${esc(b.why || '')}</div>`).join('');
  };
  const tick = async () => {
    try {
      const r = await fetch('/api/debug', { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      draw(d.bots, `Grok Bot cache, read ${new Date(d.at).toLocaleTimeString()} · grace ${d.grace}m · turn max ${d.turnMax}m`);
    } catch {
      draw([...state.bots.values()].map((b) => ({ name: b.name, state: b.state, why: b.task })), `${state.source} feed (no /api/debug here)`);
    }
  };
  tick();
  setInterval(tick, 5000);
}
