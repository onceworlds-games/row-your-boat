// How each boat looks: the rival rowers' own paints and clothes, players dressed from their avatars. Avatars are fetched
// once per player; until one arrives the player wears their paint's colours.

import { PAINTS, ROWERS } from './sim/streams.js';
import { HATS } from './render/boats.js';

// The platform's avatar colour lists (skin tones, then clothes), in its order.
export const SKINS = ['#f6dcc5', '#ebc29f', '#d4a07a', '#b07a55', '#875839', '#5e3d29', '#93c9bb', '#a8c595', '#94bcd3', '#ab9bd9', '#dca3ad', '#b3bccb'];
export const COLORS = ['#c95f56', '#dc8a4f', '#e2bd52', '#9cc27a', '#5a8a5e', '#4f9a8e', '#6fb7c8', '#5b87c5', '#465089', '#8b68a8', '#dc8fae', '#f2eee6', '#a9a8ad', '#5d5c63', '#2b2a30', '#80604d'];

const DRESS = {
  Mabel: { shirt: '#dc8fae', skin: '#f6dcc5', pants: '#465089', hatColor: '#f2eee6' },
  Otis: { shirt: '#5a8a5e', skin: '#b07a55', pants: '#2b2a30', hatColor: '#80604d' },
  Wren: { shirt: '#6fb7c8', skin: '#ebc29f', pants: '#5d5c63', hatColor: '#e2bd52' },
  Barty: { shirt: '#c95f56', skin: '#d4a07a', pants: '#465089', hatColor: '#2b2a30' },
  Juniper: { shirt: '#8b68a8', skin: '#875839', pants: '#2b2a30', hatColor: '#c95f56' },
  Pell: { shirt: '#e2bd52', skin: '#f6dcc5', pants: '#5b87c5', hatColor: '#e2bd52' },
};

const pick = (list, i, dflt) => (Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : dflt);

/** A rival rower's look, by name ("Wren", or "Wren 2"). */
export function rowerLook(name) {
  const base = String(name).split(' ')[0];
  const r = ROWERS[base] ?? ROWERS.Mabel;
  const p = PAINTS[r.paint];
  return { paint: p.color, symbol: p.symbol, hat: r.hat, ...(DRESS[base] ?? DRESS.Mabel) };
}

/** A player's look: their avatar's colours (when known), a paint and a hat. */
export function playerLook(avatar, paint, hat = 'nightcap') {
  const p = PAINTS[((paint % PAINTS.length) + PAINTS.length) % PAINTS.length];
  const a = avatar && typeof avatar === 'object' ? avatar : {};
  const shirt = pick(COLORS, a.shirt, p.color === '#F4EBD0' ? '#5b87c5' : p.color);
  return {
    paint: p.color,
    symbol: p.symbol,
    shirt,
    skin: pick(SKINS, a.skin, '#ebc29f'),
    pants: pick(COLORS, a.pants, '#465089'),
    hat: HATS.includes(hat) ? hat : 'nightcap',
    hatColor: pick(COLORS, Number.isInteger(a.shirt) ? (a.shirt + 5) % COLORS.length : null, '#f2eee6'),
  };
}

/** Paints for a race: rowers keep their own, players take the free ones in seat order. seats: [{ id, name, bot }]. */
export function assignPaints(seats) {
  const out = new Map();
  const used = new Set();
  for (const s of seats) {
    if (!s.bot) continue;
    const r = ROWERS[String(s.name).split(' ')[0]];
    if (r) {
      out.set(s.id, r.paint);
      used.add(r.paint);
    }
  }
  let next = 0;
  for (const s of seats) {
    if (out.has(s.id)) continue;
    while (used.has(next % PAINTS.length) && used.size < PAINTS.length) next++;
    out.set(s.id, next % PAINTS.length);
    used.add(next % PAINTS.length);
    next++;
  }
  return out;
}

/** Avatars, fetched once each. */
export function createAvatars(ow) {
  const looks = new Map();
  const heads = new Map();
  return {
    /** The avatar's colour indices, or null until known (it is fetched the first time it is asked for). */
    get(id) {
      if (!looks.has(id)) {
        looks.set(id, null);
        try {
          const p = ow?.player?.avatar?.(id);
          if (p && p.then) p.then((a) => looks.set(id, a && typeof a === 'object' ? a : null)).catch(() => {});
        } catch {}
      }
      return looks.get(id);
    },
    /** A head picture's URL, or null until known. */
    head(id) {
      if (!heads.has(id)) {
        heads.set(id, null);
        try {
          const p = ow?.player?.avatarUrl?.(id, 'head');
          if (p && p.then) p.then((u) => heads.set(id, typeof u === 'string' ? u : null)).catch(() => {});
        } catch {}
      }
      return heads.get(id);
    },
  };
}
