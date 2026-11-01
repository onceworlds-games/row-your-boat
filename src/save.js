// The player's profile (ow.save), Dream ghosts, badges and leaderboards. Every platform call is guarded: outside the
// platform, or when a call fails, the game carries on.

import { STREAMS } from './sim/streams.js';

const ow = () => window.onceworlds;

export const HAT_UNLOCK = { nightcap: 0, scarf: 6, beret: 12, souwester: 18, crown: 24 };

export function blankProfile() {
  return { v: 1, calib: 0, hints: {}, first: 0, dream: {}, best: {}, totals: { races: 0, wins: 0, perfects: 0 }, hat: 'nightcap', dot: 0 };
}

/** A profile read back from storage, with anything odd replaced by the default. */
export function cleanProfile(raw) {
  const p = blankProfile();
  if (!raw || typeof raw !== 'object') return p;
  if (Number.isFinite(raw.calib)) p.calib = Math.max(-0.25, Math.min(0.25, raw.calib));
  if (raw.hints && typeof raw.hints === 'object') for (const [k, v] of Object.entries(raw.hints)) if (typeof k === 'string' && k.length < 24 && v) p.hints[k] = 1;
  p.first = raw.first ? 1 : 0;
  p.dot = raw.dot ? 1 : 0;
  if (typeof raw.hat === 'string' && raw.hat in HAT_UNLOCK) p.hat = raw.hat;
  if (raw.dream && typeof raw.dream === 'object') {
    for (const s of STREAMS) {
      const d = raw.dream[s.n];
      if (!d || typeof d !== 'object') continue;
      const best = Number.isFinite(d.best) && d.best > 0 ? d.best : null;
      const stars = Array.isArray(d.stars) ? [0, 1, 2].map((i) => (d.stars[i] ? 1 : 0)) : [0, 0, 0];
      if (best || stars.some(Boolean)) p.dream[s.n] = { best, stars };
    }
  }
  if (raw.best && typeof raw.best === 'object') {
    for (const s of STREAMS) if (Number.isFinite(raw.best[s.n]) && raw.best[s.n] > 0) p.best[s.n] = raw.best[s.n];
  }
  if (raw.totals && typeof raw.totals === 'object') {
    for (const k of ['races', 'wins', 'perfects']) if (Number.isFinite(raw.totals[k])) p.totals[k] = Math.max(0, Math.floor(raw.totals[k]));
  }
  return p;
}

export const starCount = (p) => Object.values(p.dream).reduce((n, d) => n + d.stars.reduce((a, b) => a + b, 0), 0);
export const hatsOpen = (p) => Object.entries(HAT_UNLOCK).filter(([, need]) => starCount(p) >= need).map(([k]) => k);

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
