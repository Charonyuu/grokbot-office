// How pretty the office can afford to be on this machine. It starts in the middle,
// watches how long frames take, steps down when they get slow and up when there is
// room. Once it has stepped down it never climbs again, so it can't flip back and forth.
// ?quality=high|medium|low (or ?lite) fixes the tier and turns the watching off.

export const TIERS = {
  high: { dpr: 2, shadow: 2048, soft: true, gloss: true, fps: 30, busyFps: 60 },
  medium: { dpr: 1.5, shadow: 1024, soft: true, gloss: true, fps: 30, busyFps: 60 },
  low: { dpr: 1, shadow: 0, soft: false, gloss: false, fps: 20, busyFps: 30 },
};
const ORDER = ['low', 'medium', 'high'];
const WINDOW = 3000; // ms of frames per verdict
const GRACE = 1500; // ms to ignore after a change (shaders recompile)

function guess() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  return cores <= 4 || mem <= 4 ? 'low' : 'medium';
}

export function createQuality(apply) {
  const q = new URLSearchParams(location.search);
  const asked = q.has('lite') ? 'low' : TIERS[q.get('quality')] ? q.get('quality') : null;
  let tier = asked || guess();
  let steppedDown = false, smooth = 0;
  let n = 0, work = 0, late = 0, from = performance.now() + GRACE;

  const set = (next) => {
    tier = next;
    apply(TIERS[tier], tier);
    n = work = late = 0;
    from = performance.now() + GRACE;
  };
  apply(TIERS[tier], tier);

  return {
    get tier() { return tier; },
    get cfg() { return TIERS[tier]; },
    fixed: !!asked,
    // After each drawn frame: ms spent updating + drawing, ms since the previous
    // drawn frame, and the ms the frame was meant to take.
    sample(ms, gap, budget) {
      if (asked) return;
      const now = performance.now();
      if (now < from) return;
      n++;
      work += ms;
      if (gap > budget * 1.6) late++;
      if (now - from < WINDOW) return;
      const avg = work / n, lateShare = late / n, i = ORDER.indexOf(tier);
      n = work = late = 0;
      from = now;
      if ((avg > 14 || lateShare > 0.25) && i > 0) {
        steppedDown = true;
        smooth = 0;
        set(ORDER[i - 1]);
      } else if (!steppedDown && i < ORDER.length - 1 && avg < 5 && lateShare < 0.05) {
        // two smooth windows in a row before climbing
        if (++smooth >= 2) { smooth = 0; set(ORDER[i + 1]); }
      } else smooth = 0;
    },
  };
}
