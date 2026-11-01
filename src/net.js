// The room: the match (createMatch), the host's decisions (finish times, the bots' boats) and every value read from
// other pages, checked. No DOM.

import { createMatch } from '@onceworlds/sdk/match';
import { createHost, t } from '@onceworlds/sdk/host';
import { createBots } from '@onceworlds/sdk/bots';
import { STREAMS, ROWER_NAMES, streamByN } from './sim/streams.js';
import { CUP_POINTS, outcome, plausibleFinish, raceOver } from './sim/race.js';
import { courseOf } from './race.js';
import { KINDS, MAX_LEVEL } from './progress.js';

/** The count-in before the first beat of every stream (seconds). */
export const INTRO = 4;
export const SETTINGS = [
  { id: 'stream', label: 'Stream', options: STREAMS.map((s) => ({ value: s.n, label: s.name })), default: 1 },
  { id: 'race', label: 'Race', options: [{ value: 1, label: 'One stream' }, { value: 3, label: 'Cup of three' }], default: 1 },
];
export const JOIN = { maxPlayers: 6, minPlayers: 1, lobby: 'bar', countdown: 0, settings: SETTINGS };
/** Bots in races: their skill range, and the range when a newcomer is in the race. */
export const BOT_SKILL = [0.0, 0.6];
export const NEWBIE_SKILL = [-0.4, -0.1];

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const inRange = (v, lo, hi) => fin(v) && v >= lo && v <= hi;

/** The stream a round races: the host's pick, then the next ones in a cup. */
export function streamForRound(setting, round) {
  const first = Math.max(1, Math.min(STREAMS.length, Math.floor(Number(setting)) || 1));
  return ((first - 1 + Math.max(0, round - 1)) % STREAMS.length) + 1;
}

/** A newcomer in the race eases the bots: their skill mapped into the newcomer range. */
export function easedSkill(skill, newbie) {
  if (!newbie) return skill;
  const k = (Math.max(BOT_SKILL[0], Math.min(BOT_SKILL[1], skill)) - BOT_SKILL[0]) / (BOT_SKILL[1] - BOT_SKILL[0]);
  return NEWBIE_SKILL[0] + k * (NEWBIE_SKILL[1] - NEWBIE_SKILL[0]);
}

/**
 * A boat as another page reported it (presence, or the host's state for a bot), checked: a number out of range is
 * dropped and the last good value stays. `prev`: the last good state. `len`: the course's length.
 */
export function cleanBoat(raw, prev = null, total = 2000) {
  if (!raw || typeof raw !== 'object') return prev;
  const out = { ...(prev ?? { s: 0, x: 0, z: 0, h: 0, v: 0, c: 0, k: 0, ls: 0, lq: 0, f: 0, ft: 0, y: 0 }) };
  if (inRange(raw.s, -10, total + 60)) out.s = raw.s;
  if (inRange(raw.x, -5000, 5000)) out.x = raw.x;
  if (inRange(raw.z, -5000, 5000)) out.z = raw.z;
  if (inRange(raw.h, -1000, 1000)) out.h = raw.h;
  if (inRange(raw.v, 0, 14)) out.v = raw.v;
  if (inRange(raw.y, -10, 10)) out.y = raw.y;
  if (Number.isInteger(raw.c) && raw.c >= 0 && raw.c <= 3) out.c = raw.c;
  if (Number.isInteger(raw.k) && raw.k >= 0 && raw.k < 1e6) out.k = raw.k;
  if (raw.ls === -1 || raw.ls === 0 || raw.ls === 1) out.ls = raw.ls;
  if (Number.isInteger(raw.lq) && raw.lq >= 0 && raw.lq <= 7) out.lq = raw.lq;
  if (raw.f === 0 || raw.f === 1) out.f = raw.f;
  if (inRange(raw.ft, 0, 100000)) out.ft = raw.ft;
  return out;
}

/** What a player's presence says beyond their boat: a newcomer flag and what they wear (only known items). */
export function cleanExtras(raw) {
  const out = { nb: 0, hat: 'nightcap', body: 'rowboat', lantern: 'amber', wake: 'none', trim: 'cream', lv: 1, r: '' };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.nb === 1) out.nb = 1;
  for (const kind of ['hat', 'body', 'lantern', 'wake', 'trim']) if (typeof raw[kind] === 'string' && KINDS[kind].list.includes(raw[kind])) out[kind] = raw[kind];
  if (Number.isInteger(raw.lv) && raw.lv >= 1 && raw.lv <= MAX_LEVEL) out.lv = raw.lv;
  if (typeof raw.r === 'string' && raw.r.length <= 80) out.r = raw.r;
  return out;
}

/** The finish order for the host: seats with their distance and finish time. */
export function rankRound(seats, finTimes, distanceOf) {
  const boats = seats.map((s) => ({ id: s.id, s: distanceOf(s.id) ?? 0, ft: fin(finTimes?.[s.id]) ? finTimes[s.id] : null, left: !!s.left }));
  return outcome(boats);
}

/** Shuffled start slots for a round, the same on every page (the match's own random stream). */
export function slotsFor(ids, random) {
  const order = random.shuffle([...ids]);
  const out = {};
  order.forEach((id, i) => (out[id] = i));
  return out;
}

/** Is a round record (match.data) usable? */
export function cleanRound(d) {
  if (!d || typeof d !== 'object') return null;
  if (!Number.isInteger(d.n) || d.n < 1 || d.n > STREAMS.length) return null;
  if (!fin(d.t0)) return null;
  const slots = {};
  if (d.slots && typeof d.slots === 'object') for (const [k, v] of Object.entries(d.slots)) if (Number.isInteger(v) && v >= 0 && v < 30) slots[k] = v;
  const finT = {};
  if (d.fin && typeof d.fin === 'object') for (const [k, v] of Object.entries(d.fin)) if (fin(v) && v > 0) finT[k] = v;
  const bs = {};
  if (d.bs && typeof d.bs === 'object') for (const [k, v] of Object.entries(d.bs)) if (inRange(v, -1, 1)) bs[k] = v;
  return { n: d.n, t0: d.t0, slots, fin: finT, nb: d.nb === 1 ? 1 : 0, bs };
}

/**
 * The game's match. hooks: { distanceOf(id) (the host's view of a boat's distance), onResults(standings, mine) }.
 */
export function createNet(room, hooks = {}) {
  const host = createHost(room);
  const match = createMatch(room, {
    rounds: 'race',
    introSeconds: 0,
    roundEndSeconds: 6,
    resultsSeconds: room.kind === 'private' ? 0 : 14,
    points: CUP_POINTS,
    admit: 'round',
    startRound(m) {
      const n = streamForRound(m.settings.stream, m.round);
      const newbie = m.seats.some((s) => !s.bot && cleanExtras(room.players.get(s.id)?.presence).nb === 1);
      const bs = {};
      for (const s of m.seats) if (s.bot) bs[s.id] = Math.round(easedSkill(s.skill, newbie) * 100) / 100;
      return { n, t0: room.matchNow() + INTRO * 1000, slots: slotsFor(m.seats.map((s) => s.id), m.random(`slots:${m.roundId}`)), fin: {}, nb: newbie ? 1 : 0, bs };
    },
    onTick(m) {
      const d = cleanRound(m.data);
      if (!d) return;
      const stream = streamByN(d.n);
      const now = (room.matchNow() - d.t0) / 1000;
      const racing = m.seats.filter((s) => !s.left && !s.away).map((s) => s.id);
      if (raceOver(stream, d.fin, racing, now)) m.endRound(rankRound(m.seats, d.fin, (id) => net.distanceOf(id)));
    },
  });
  const bots = createBots(match, { host, fill: 6, names: ROWER_NAMES, skill: BOT_SKILL, think: () => null });

  const boatsState = host.state('boats', { schema: (v) => v === null || (typeof v === 'object' && !Array.isArray(v)), initial: null });

  const finish = host.rpc('finish', {
    args: { r: t.string(80), t: t.number(0, 100000) },
    rate: 2,
    validate(from, a) {
      const d = cleanRound(match.data);
      if (!d || a.r !== match.roundId) return 'stale';
      if (fin(d.fin[from.id])) return 'done';
      const stream = streamByN(d.n);
      const course = courseOf(stream);
      const now = (room.matchNow() - d.t0) / 1000;
      const p = cleanBoat(room.players.get(from.id)?.presence, null, course.total);
      return plausibleFinish(stream, course, a.t, now, p ? p.s : null) || 'implausible';
    },
    run(from, a) {
      match.setData((d) => {
        d.fin = { ...(d.fin ?? {}), [from.id]: a.t };
      });
    },
  });

  match.on('results', (standings, mine) => hooks.onResults?.(standings, mine));

  const net = {
    room,
    match,
    host,
    bots,
    /** The current round's record, checked (null outside a round). */
    get round() {
      if (!['round', 'roundEnd', 'results'].includes(match.phase)) return null;
      return cleanRound(match.data);
    },
    get roundKey() {
      return match.roundId;
    },
    /** Song time by the match clock, for this round. */
    songTime(d = net.round) {
      return d ? (room.matchNow() - d.t0) / 1000 : 0;
    },
    finish(ft) {
      return finish({ r: match.roundId, t: ft });
    },
    /** Host: a bot's finish. */
    botFinish(id, ft) {
      if (!match.isHost) return;
      const d = cleanRound(match.data);
      if (!d || fin(d.fin[id])) return;
      match.setData((x) => {
        x.fin = { ...(x.fin ?? {}), [id]: ft };
      });
    },
    /** Host: the bots' boats for everyone else (10 Hz). */
    publishBots(snaps, songT) {
      if (!match.isHost) return;
      boatsState.set({ r: match.roundId, t: Math.round(songT * 1000) / 1000, b: snaps });
    },
    /** The host's latest bot boats for this round: { t, b: { id: snapshot } } or null. */
    botStates() {
      const v = boatsState.get();
      if (!v || v.r !== match.roundId || !fin(v.t) || !v.b || typeof v.b !== 'object') return null;
      return v;
    },
    onBots(fn) {
      return boatsState.on(fn);
    },
    /** The host's view of how far a boat has come (set by the game each frame). */
    distanceOf(id) {
      return hooks.distanceOf ? hooks.distanceOf(id) : null;
    },
    dispose() {
      try {
        bots.dispose();
        match.dispose();
        host.dispose();
      } catch {}
    },
  };
  return net;
}
