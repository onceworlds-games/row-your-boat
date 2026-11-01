// Progression, pure: the rower's level and its reward track, what a race pays, the Boathouse's prices, the three
// wishes of a night and the moon calendar. No DOM and no platform: save.js keeps the numbers, game.js calls these.

import { HATS, BODIES, LANTERNS, WAKES, TRIMS } from './cosmetics.js';

// ---------------------------------------------------------------- levels

export const MAX_LEVEL = 30;
/** XP from a level to the next: 100 at first, 800 for the last. */
export const xpToNext = (level) => 100 + 25 * (level - 1);

/** { level, into (XP into this level), need (XP this level takes; 0 at the top) } */
export function levelOf(xp) {
  let level = 1;
  let into = Math.max(0, Math.floor(Number.isFinite(xp) ? xp : 0));
  while (level < MAX_LEVEL && into >= xpToNext(level)) {
    into -= xpToNext(level);
    level++;
  }
  if (level === MAX_LEVEL) into = 0;
  return { level, into, need: level < MAX_LEVEL ? xpToNext(level) : 0 };
}

// ---------------------------------------------------------------- what can be worn

/** The kinds of things, each with its list (cosmetics.js) and what everyone starts with. */
export const KINDS = {
  body: { list: BODIES, free: ['rowboat'] },
  hat: { list: HATS, free: ['nightcap'] },
  lantern: { list: LANTERNS, free: ['amber'] },
  wake: { list: WAKES, free: ['none'] },
  trim: { list: TRIMS, free: ['cream'] },
};

/** The reward track: what reaching each level gives. Boats come only from here. */
export const TRACK = {
  2: { kind: 'hat', id: 'beanie' },
  3: { kind: 'body', id: 'canoe' },
  4: { kind: 'lantern', id: 'rose' },
  5: { kind: 'blooms', n: 60 },
  6: { kind: 'body', id: 'paper' },
  7: { kind: 'wake', id: 'stars' },
  8: { kind: 'hat', id: 'beret' },
  9: { kind: 'trim', id: 'gold' },
  10: { kind: 'body', id: 'swan' },
  11: { kind: 'blooms', n: 80 },
  12: { kind: 'lantern', id: 'moon' },
  13: { kind: 'hat', id: 'flatcap' },
  14: { kind: 'body', id: 'teacup' },
  15: { kind: 'wake', id: 'petals' },
  16: { kind: 'blooms', n: 100 },
  17: { kind: 'hat', id: 'souwester' },
  18: { kind: 'body', id: 'walnut' },
  19: { kind: 'wake', id: 'bubbles' },
  20: { kind: 'lantern', id: 'lilac' },
  21: { kind: 'blooms', n: 120 },
  22: { kind: 'hat', id: 'captain' },
  23: { kind: 'trim', id: 'stripes' },
  24: { kind: 'body', id: 'tub' },
  25: { kind: 'wake', id: 'fireflies' },
  26: { kind: 'hat', id: 'crown' },
  27: { kind: 'lantern', id: 'ember' },
  28: { kind: 'wake', id: 'notes' },
  29: { kind: 'blooms', n: 200 },
  30: { kind: 'hat', id: 'tophat' },
};

/** The Boathouse's prices in moonblooms. Boats aren't sold: they come with levels. */
export const PRICES = {
  hat: { beanie: 80, scarf: 100, beret: 120, flatcap: 120, bowler: 160, souwester: 160, boater: 200, captain: 240, crown: 300, tophat: 360 },
  lantern: { rose: 120, moon: 160, sage: 160, lilac: 200, ember: 240 },
  trim: { gold: 80, navy: 60, rose: 60, mint: 60, stripes: 140 },
  wake: { stars: 200, petals: 220, bubbles: 220, fireflies: 260, notes: 300 },
};

const itemKey = (kind, id) => `${kind}:${id}`;

/** The level that gives this item, or 0. */
export function levelFor(kind, id) {
  for (const [lv, r] of Object.entries(TRACK)) if (r.kind === kind && r.id === id) return Number(lv);
  return 0;
}

/** Whether a profile has an item: everyone's from the start, the track up to its level, or bought. */
export function owns(p, kind, id) {
  const k = KINDS[kind];
  if (!k || !k.list.includes(id)) return false;
  if (k.free.includes(id)) return true;
  const lv = levelFor(kind, id);
  if (lv && levelOf(p.xp).level >= lv) return true;
  return (p.bought ?? []).includes(itemKey(kind, id));
}

/** The price of an item in the Boathouse, or null when it isn't for sale (boats, free things). */
export function priceOf(kind, id) {
  return PRICES[kind]?.[id] ?? null;
}

/** Buy an item: a new profile, or null when it can't be bought (owned, not for sale, too few blooms). */
export function buy(p, kind, id) {
  const price = priceOf(kind, id);
  if (price === null || owns(p, kind, id) || p.blooms < price) return null;
  return { ...p, blooms: p.blooms - price, bought: [...(p.bought ?? []), itemKey(kind, id)] };
}

/** Wear an item (only an owned one). */
export function equip(p, kind, id) {
  if (!owns(p, kind, id)) return p;
  return { ...p, equip: { ...p.equip, [kind]: id } };
}

// ---------------------------------------------------------------- a race's pay

const PLACE_XP = [60, 40, 25, 15, 10, 5];
export const FIRST_OF_NIGHT_XP = 50;

/**
 * What a finished (or unfinished) race pays. r: { finished, place, boats (in the race), score, blooms (taken),
 * firstOfNight, tonight (a Tonight's Dream run, its first finish tonight) }.
 * → { xp, blooms, parts: [{ label, xp }] }
 */
export function racePay(r) {
  const parts = [];
  const add = (label, xp) => {
    if (xp > 0) parts.push({ label, xp: Math.round(xp) });
  };
  add(r.finished ? 'Finished' : 'Rowed', r.finished ? 40 : 15);
  if (r.finished && r.boats >= 2 && r.place >= 1) add(r.place === 1 ? 'Won' : `${ordinalOf(r.place)} place`, PLACE_XP[Math.min(PLACE_XP.length - 1, r.place - 1)]);
  add('Score', Math.min(100, Math.floor((r.score ?? 0) / 500)));
  add('Moonblooms', r.blooms ?? 0);
  if (r.firstOfNight) add('First of the night', FIRST_OF_NIGHT_XP);
  if (r.tonight) add("Tonight's Dream", 100);
  const xp = parts.reduce((a, b) => a + b.xp, 0);
  const blooms = Math.max(0, Math.floor(r.blooms ?? 0)) + (r.finished && r.place === 1 && r.boats >= 2 ? 10 : 0) + (r.tonight ? 30 : 0);
  return { xp, blooms, parts };
}

function ordinalOf(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}

/** Levels gained from adding xp: the track's rewards in order. → [{ level, kind, id?, n? }] */
export function rewardsBetween(xp0, xp1) {
  const a = levelOf(xp0).level;
  const b = levelOf(xp1).level;
  const out = [];
  for (let lv = a + 1; lv <= b; lv++) if (TRACK[lv]) out.push({ level: lv, ...TRACK[lv] });
  return out;
}

/** Add a race's XP and blooms to a profile, with the level rewards it reaches. → { p, rewards } */
export function payInto(p, xp, blooms) {
  const rewards = rewardsBetween(p.xp, p.xp + xp);
  const bonus = rewards.filter((r) => r.kind === 'blooms').reduce((a, r) => a + r.n, 0);
  return { p: { ...p, xp: p.xp + xp, blooms: p.blooms + blooms + bonus }, rewards };
}

// ---------------------------------------------------------------- the three wishes of a night

/** stat: what a race reports (counts from it). Sizes: how many, by difficulty. */
export const WISHES = [
  { id: 'perfect', stat: 'perfect', sizes: [40, 60, 90] },
  { id: 'pull', stat: 'pull', sizes: [6, 10, 16] },
  { id: 'bloom', stat: 'bloom', sizes: [20, 35, 50] },
  { id: 'shave', stat: 'shave', sizes: [2, 4, 6] },
  { id: 'rush', stat: 'rush', sizes: [1, 2, 3] },
  { id: 'race', stat: 'race', sizes: [2, 3, 5] },
  { id: 'win', stat: 'win', sizes: [1, 2, 3] },
  { id: 'clean', stat: 'clean', sizes: [1, 1, 2] },
  { id: 'tonight', stat: 'tonight', sizes: [1, 1, 1] },
];
export const WISH_XP = 100;
export const WISH_BLOOMS = 25;
export const ALL_WISHES_BLOOMS = 50;

/** A wish's label (a short count, never a sentence). */
export function wishLabel(w) {
  const n = w.n;
  switch (w.id) {
    case 'perfect':
      return `${n} perfect strokes`;
    case 'pull':
      return `${n} pulls`;
    case 'bloom':
      return `${n} moonblooms`;
    case 'shave':
      return n === 1 ? 'A close shave' : `${n} close shaves`;
    case 'rush':
      return n === 1 ? 'A merrily rush' : `${n} merrily rushes`;
    case 'race':
      return `Finish ${n} races`;
    case 'win':
      return n === 1 ? 'Win a race' : `Win ${n} races`;
    case 'clean':
      return n === 1 ? 'A race with no bumps' : `${n} races with no bumps`;
    case 'tonight':
      return "Row Tonight's Dream";
    default:
      return w.id;
  }
}

/** The night's three wishes, the same for everyone: one easy, one middling, one hard, never two of a kind. */
export function wishesOf(day) {
  let h = ((Math.floor(day) * 2654435761) >>> 0) ^ 0x9e3779b9;
  const next = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x6d2b79f5) >>> 0;
    return h / 4294967296;
  };
  const pool = [...WISHES];
  const out = [];
  for (let k = 0; k < 3; k++) {
    const i = Math.floor(next() * pool.length);
    const w = pool.splice(i, 1)[0];
    out.push({ id: w.id, stat: w.stat, n: w.sizes[k] });
  }
  return out;
}

/** A night's wish progress, fresh. */
export const freshNight = (day) => ({ day, got: [0, 0, 0], paid: [0, 0, 0], all: 0 });

/**
 * Add a race's counts to tonight's wishes. stats: { perfect, pull, bloom, shave, rush, race, win, clean, tonight }.
 * → { night, done: [indices finished now], xp, blooms }
 */
export function wishProgress(night, day, stats) {
  const n = night && night.day === day ? { ...night, got: [...night.got], paid: [...night.paid] } : freshNight(day);
  const wishes = wishesOf(day);
  const done = [];
  let xp = 0;
  let blooms = 0;
  wishes.forEach((w, i) => {
    const add = Math.max(0, Math.floor(stats[w.stat] ?? 0));
    n.got[i] = Math.min(w.n, n.got[i] + add);
    if (n.got[i] >= w.n && !n.paid[i]) {
      n.paid[i] = 1;
      done.push(i);
      xp += WISH_XP;
      blooms += WISH_BLOOMS;
    }
  });
  if (!n.all && n.paid.every(Boolean)) {
    n.all = 1;
    blooms += ALL_WISHES_BLOOMS;
  }
  return { night: n, done, xp, blooms };
}

// ---------------------------------------------------------------- the moon calendar

export const MOON = 7;
export const FULL_MOON_BLOOMS = 100;
/** Blooms for rowing on the n-th night running. */
export const nightBlooms = (n) => 10 + 5 * Math.min(n - 1, 6);

/**
 * A race rowed on `day`: the calendar's next night (once a night). A missed night starts the moon over.
 * moon: { last, n (nights running), best, total } → { moon, first (the first race tonight), blooms, full }
 */
export function rowNight(moon, day) {
  const m = { last: -1, n: 0, best: 0, total: 0, ...(moon ?? {}) };
  if (m.last === day) return { moon: m, first: false, blooms: 0, full: false };
  const n = m.last === day - 1 ? m.n + 1 : 1;
  const full = n % MOON === 0;
  const out = { last: day, n, best: Math.max(m.best, n), total: m.total + 1 };
  return { moon: out, first: true, blooms: nightBlooms(n) + (full ? FULL_MOON_BLOOMS : 0), full };
}

/** The phase the calendar shows (0-6: which nights of this moon are lit), counting a missed night as a new moon. */
export function moonShown(moon, day) {
  if (!moon || moon.last < day - 1) return { lit: 0, tonight: false };
  const lit = ((moon.n - 1) % MOON) + 1;
  return { lit, tonight: moon.last === day };
}
