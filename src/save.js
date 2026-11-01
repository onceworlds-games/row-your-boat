// The player's profile (ow.save), Dream ghosts, badges and leaderboards. Every platform call is guarded: outside the
// platform, or when a call fails, the game carries on.

import { STREAMS } from './sim/streams.js';
import { KINDS, owns } from './progress.js';

const ow = () => window.onceworlds;

// The first build unlocked hats with stars; a profile from then keeps the hats it had.
const OLD_HAT_STARS = { nightcap: 0, scarf: 6, beret: 12, souwester: 18, crown: 24 };

const TOTALS = ['races', 'wins', 'perfects', 'pulls', 'rushes', 'blooms', 'shaves'];

export function blankProfile() {
  return {
    v: 2,
    calib: 0,
    hints: {},
    first: 0,
    dream: {},
    best: {},
    totals: Object.fromEntries(TOTALS.map((k) => [k, 0])),
    dot: 0,
    xp: 0,
    blooms: 0,
    bought: [],
    equip: { body: 'rowboat', hat: 'nightcap', lantern: 'amber', wake: 'none', trim: 'cream' },
    night: null,
    moon: null,
    tonight: null,
  };
}

const int = (v, lo, hi) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);

/** A profile read back from storage, with anything odd replaced by the default. */
export function cleanProfile(raw) {
  const p = blankProfile();
  if (!raw || typeof raw !== 'object') return p;
  if (Number.isFinite(raw.calib)) p.calib = Math.max(-0.25, Math.min(0.25, raw.calib));
  if (raw.hints && typeof raw.hints === 'object') for (const [k, v] of Object.entries(raw.hints)) if (typeof k === 'string' && k.length < 24 && v) p.hints[k] = 1;
  p.first = raw.first ? 1 : 0;
  p.dot = raw.dot ? 1 : 0;
  if (raw.dream && typeof raw.dream === 'object') {
    for (const s of STREAMS) {
      const d = raw.dream[s.n];
      if (!d || typeof d !== 'object') continue;
      const best = Number.isFinite(d.best) && d.best > 0 ? d.best : null;
      const stars = Array.isArray(d.stars) ? [0, 1, 2].map((i) => (d.stars[i] ? 1 : 0)) : [0, 0, 0];
      const lilies = d.lilies ? 1 : 0;
      if (best || stars.some(Boolean) || lilies) p.dream[s.n] = { best, stars, lilies };
    }
  }
  if (raw.best && typeof raw.best === 'object') {
    for (const s of STREAMS) if (Number.isFinite(raw.best[s.n]) && raw.best[s.n] > 0) p.best[s.n] = raw.best[s.n];
  }
  if (raw.totals && typeof raw.totals === 'object') for (const k of TOTALS) p.totals[k] = int(raw.totals[k], 0, 1e9);
  p.xp = int(raw.xp, 0, 1e8);
  p.blooms = int(raw.blooms, 0, 1e8);
  if (Array.isArray(raw.bought)) {
    const seen = new Set();
    for (const k of raw.bought.slice(0, 128)) {
      if (typeof k !== 'string' || seen.has(k)) continue;
      const [kind, id] = k.split(':');
      if (KINDS[kind]?.list.includes(id)) seen.add(k);
    }
    p.bought = [...seen];
  }
  // a profile from the first build: its hat stays, and its races count toward a level
  if (raw.v === 1 || raw.v === undefined) {
    const stars = starCount(p);
    if (typeof raw.hat === 'string' && raw.hat in OLD_HAT_STARS && stars >= OLD_HAT_STARS[raw.hat]) {
      if (raw.hat !== 'nightcap' && !p.bought.includes(`hat:${raw.hat}`)) p.bought.push(`hat:${raw.hat}`);
      p.equip.hat = raw.hat;
    }
    p.xp = Math.max(p.xp, Math.min(20000, p.totals.races * 50 + stars * 40));
  }
  if (raw.equip && typeof raw.equip === 'object') {
    for (const kind of Object.keys(KINDS)) {
      const id = raw.equip[kind];
      if (typeof id === 'string' && owns(p, kind, id)) p.equip[kind] = id;
    }
  }
  const n = raw.night;
  if (n && typeof n === 'object' && Number.isInteger(n.day) && Array.isArray(n.got) && Array.isArray(n.paid)) {
    p.night = { day: n.day, got: [0, 1, 2].map((i) => int(n.got[i], 0, 9999)), paid: [0, 1, 2].map((i) => (n.paid[i] ? 1 : 0)), all: n.all ? 1 : 0 };
  }
  const m = raw.moon;
  if (m && typeof m === 'object' && Number.isInteger(m.last)) p.moon = { last: m.last, n: int(m.n, 0, 1e6), best: int(m.best, 0, 1e6), total: int(m.total, 0, 1e6) };
  const t = raw.tonight;
  if (t && typeof t === 'object' && Number.isInteger(t.day)) {
    p.tonight = { day: t.day, best: Number.isFinite(t.best) && t.best > 0 ? t.best : null, score: int(t.score, 0, 1e8), runs: int(t.runs, 0, 1e4) };
  }
  return p;
}

export const starCount = (p) => Object.values(p.dream).reduce((n, d) => n + d.stars.reduce((a, b) => a + b, 0), 0);

let timer = null;
export function createStore() {
  let profile = blankProfile();
  const store = {
    get profile() {
      return profile;
    },
    async load() {
      try {
        profile = cleanProfile(await ow()?.save?.get?.('profile'));
      } catch {
        profile = blankProfile();
      }
      return profile;
    },
    /** Save soon (writes are paced by the platform; this keeps them to a few). */
    save(now = false) {
      clearTimeout(timer);
      const go = () => {
        try {
          const p = ow()?.save?.set?.('profile', profile);
          if (p?.catch) p.catch(() => {});
        } catch {}
      };
      if (now) go();
      else timer = setTimeout(go, 800);
    },
    async ghost(n) {
      try {
        return unpackGhost(await ow()?.save?.get?.(`ghost-${n}`));
      } catch {
        return null;
      }
    },
    saveGhost(n, samples) {
      try {
        const p = ow()?.save?.set?.(`ghost-${n}`, packGhost(samples));
        if (p?.catch) p.catch(() => {});
      } catch {}
    },
    award(id) {
      try {
        const p = ow()?.badges?.award?.(id);
        if (p?.catch) p.catch(() => {});
      } catch {}
    },
    submit(board, score, lower = false) {
      try {
        if (!Number.isFinite(score)) return;
        const p = ow()?.leaderboards?.submit?.(board, Math.round(score * 1000) / 1000, lower ? { lowerIsBetter: true } : undefined);
        if (p?.catch) p.catch(() => {});
      } catch {}
    },
    async top(board, limit = 3) {
      try {
        const r = await ow()?.leaderboards?.top?.(board, { limit });
        return Array.isArray(r?.entries) ? r.entries.slice(0, limit) : [];
      } catch {
        return [];
      }
    },
  };
  return store;
}

// ---------------------------------------------------------------- ghosts: 5 samples a second, packed

export const GHOST_HZ = 5;

/** samples: [[x, z, h], ...] at GHOST_HZ from song time 0. → { v, hz, d (base64 of int16 x*8, z*8, h*1000) } */
export function packGhost(samples) {
  const a = new Int16Array(samples.length * 3);
  samples.forEach(([x, z, h], i) => {
    a[i * 3] = Math.max(-32767, Math.min(32767, Math.round(x * 8)));
    a[i * 3 + 1] = Math.max(-32767, Math.min(32767, Math.round(z * 8)));
    let hh = h % (Math.PI * 2);
    if (hh > Math.PI) hh -= Math.PI * 2;
    if (hh < -Math.PI) hh += Math.PI * 2;
    a[i * 3 + 2] = Math.round(hh * 1000);
  });
  const bytes = new Uint8Array(a.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return { v: 1, hz: GHOST_HZ, d: btoa(s) };
}

export function unpackGhost(raw) {
  try {
    if (!raw || raw.v !== 1 || typeof raw.d !== 'string' || raw.d.length > 60000) return null;
    const s = atob(raw.d);
    const bytes = new Uint8Array(s.length - (s.length % 6));
    for (let i = 0; i < bytes.length; i++) bytes[i] = s.charCodeAt(i);
    const a = new Int16Array(bytes.buffer);
    const out = [];
    for (let i = 0; i + 2 < a.length; i += 3) out.push([a[i] / 8, a[i + 1] / 8, a[i + 2] / 1000]);
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/** Where the ghost was at song time t. */
export function ghostAt(samples, t) {
  if (!samples || !samples.length || t < 0) return samples?.[0] ? { x: samples[0][0], z: samples[0][1], h: samples[0][2] } : null;
  const f = t * GHOST_HZ;
  const i = Math.min(samples.length - 1, Math.floor(f));
  const j = Math.min(samples.length - 1, i + 1);
  const k = Math.min(1, f - i);
  const a = samples[i];
  const b = samples[j];
  let dh = b[2] - a[2];
  if (dh > Math.PI) dh -= Math.PI * 2;
  if (dh < -Math.PI) dh += Math.PI * 2;
  return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, h: a[2] + dh * k, done: i >= samples.length - 1 };
}
