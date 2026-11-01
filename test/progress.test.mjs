// Levels, the reward track, the Boathouse, a race's pay, the night's wishes, the moon calendar, Tonight's Dream and
// the saved profile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_LEVEL, xpToNext, levelOf, TRACK, KINDS, PRICES, owns, buy, equip, priceOf, levelFor, racePay, rewardsBetween, payInto,
  WISHES, wishesOf, wishLabel, wishProgress, WISH_XP, WISH_BLOOMS, ALL_WISHES_BLOOMS, rowNight, moonShown, MOON, FULL_MOON_BLOOMS, nightBlooms,
} from '../src/progress.js';
import { BODIES, HATS, LANTERNS, WAKES, TRIMS } from '../src/cosmetics.js';
import { blankProfile, cleanProfile } from '../src/save.js';
import { tonight, twistDef, TWISTS, nightOf, DAY_MS, SWIFT } from '../src/sim/tonight.js';
import { STREAMS } from '../src/sim/streams.js';
import { buildCourse } from '../src/sim/course.js';
import { makeSong, RUSH_VB } from '../src/sim/song.js';
import { createRaceSim } from '../src/race.js';

const xpAt = (level) => {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += xpToNext(l);
  return xp;
};

test('levels: 100 XP to the second, more each level, thirty at most', () => {
  assert.deepEqual(levelOf(0), { level: 1, into: 0, need: 100 });
  assert.equal(levelOf(99).level, 1);
  assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(xpAt(10)).level, 10);
  assert.equal(levelOf(xpAt(10) - 1).level, 9);
  assert.equal(levelOf(xpAt(MAX_LEVEL)).level, MAX_LEVEL);
  assert.equal(levelOf(1e9).level, MAX_LEVEL);
  assert.equal(levelOf(1e9).need, 0);
  assert.equal(levelOf(NaN).level, 1);
  assert.equal(levelOf(-50).level, 1);
  for (let l = 2; l < MAX_LEVEL; l++) assert.ok(xpToNext(l) > xpToNext(l - 1));
});

test('the reward track: a reward at every level, real items, every boat on it and none sold', () => {
  for (let l = 2; l <= MAX_LEVEL; l++) {
    const r = TRACK[l];
    assert.ok(r, `level ${l} gives something`);
    if (r.kind === 'blooms') assert.ok(r.n > 0);
    else assert.ok(KINDS[r.kind].list.includes(r.id), `${r.kind}:${r.id}`);
  }
  for (const b of BODIES) {
    if (b === 'rowboat') continue;
    assert.ok(levelFor('body', b) > 0, `${b} comes with a level`);
    assert.equal(priceOf('body', b), null);
  }
  // every hat, lantern, wake and trim is either free, on the track or for sale
  for (const [kind, list] of [['hat', HATS], ['lantern', LANTERNS], ['wake', WAKES], ['trim', TRIMS]]) {
    for (const id of list) assert.ok(KINDS[kind].free.includes(id) || levelFor(kind, id) || PRICES[kind][id], `${kind}:${id} can be had`);
  }
  // the first rewards come fast
  assert.ok(xpAt(3) <= 260, 'the canoe within a few races');
});

test('the Boathouse: buy with blooms once, wear only what you own', () => {
  let p = { ...blankProfile(), blooms: 150 };
  assert.equal(owns(p, 'hat', 'beret'), false);
  assert.equal(equip(p, 'hat', 'beret').equip.hat, 'nightcap', "can't wear what you don't own");
  const b = buy(p, 'hat', 'beret');
  assert.ok(b);
  assert.equal(b.blooms, 150 - PRICES.hat.beret);
  assert.ok(owns(b, 'hat', 'beret'));
  assert.equal(buy(b, 'hat', 'beret'), null, 'not twice');
  assert.equal(buy(b, 'hat', 'tophat'), null, 'not without the blooms');
  assert.equal(buy({ ...p, blooms: 1e6 }, 'body', 'swan'), null, 'boats are not for sale');
  assert.equal(buy(p, 'hat', 'nightcap'), null, 'free things are not sold');
  p = equip(b, 'hat', 'beret');
  assert.equal(p.equip.hat, 'beret');
  // the track: the swan comes at its level
  const lv = levelFor('body', 'swan');
  assert.equal(owns({ ...p, xp: xpAt(lv) - 1 }, 'body', 'swan'), false);
  assert.equal(owns({ ...p, xp: xpAt(lv) }, 'body', 'swan'), true);
  assert.equal(owns(p, 'body', 'yacht'), false);
  assert.equal(owns(p, 'nope', 'rowboat'), false);
});

test("a race's pay: finishing, the place, the score, blooms, the night's first; levels reached pay their rewards", () => {
  const base = { finished: true, place: 2, boats: 4, score: 30000, blooms: 18 };
  const second = racePay(base);
  const first = racePay({ ...base, place: 1 });
  const dnf = racePay({ ...base, finished: false });
  const solo = racePay({ ...base, boats: 1 });
  assert.ok(first.xp > second.xp && second.xp > dnf.xp);
  assert.ok(solo.xp < second.xp, 'no place pay alone');
  assert.equal(second.blooms, 18);
  assert.equal(first.blooms, 28, 'a win adds ten blooms');
  assert.ok(racePay({ ...base, firstOfNight: true }).xp > second.xp);
  assert.ok(racePay({ ...base, tonight: true }).blooms > second.blooms);
  assert.equal(second.parts.reduce((a, b) => a + b.xp, 0), second.xp);
  assert.ok(racePay({ finished: true, place: 1, boats: 4, score: 1e9, blooms: 0 }).parts.find((x) => x.label === 'Score').xp <= 100, 'the score part is capped');
  // a typical race pays 150-300 XP: level 30 takes a few months of nights, not a week and not a year
  assert.ok(second.xp >= 150 && second.xp <= 300, `${second.xp}`);
  const perNight = 3 * second.xp + 3 * WISH_XP + 50;
  const nights = xpAt(MAX_LEVEL) / perNight;
  assert.ok(nights > 8 && nights < 40, `${nights.toFixed(1)} nights of three races`);
  // crossing levels: their rewards in order, blooms bundles paid
  const r = rewardsBetween(0, xpAt(6));
  assert.deepEqual(r.map((x) => x.level), [2, 3, 4, 5, 6]);
  const paid = payInto({ ...blankProfile() }, xpAt(6), 10);
  assert.equal(paid.p.blooms, 10 + TRACK[5].n);
  assert.equal(paid.rewards.length, 5);
});

test("the night's wishes: three different ones, easy to hard, the same for everyone, each pays once", () => {
  const seen = new Set();
  for (let d = 20000; d < 20200; d++) {
    const w = wishesOf(d);
    assert.equal(w.length, 3);
    assert.equal(new Set(w.map((x) => x.id)).size, 3);
    assert.deepEqual(wishesOf(d), w, 'deterministic');
    w.forEach((x, i) => {
      const def = WISHES.find((y) => y.id === x.id);
      assert.equal(x.n, def.sizes[i]);
      assert.ok(wishLabel(x).length > 3 && wishLabel(x).length < 28, wishLabel(x));
      seen.add(x.id);
    });
  }
  assert.equal(seen.size, WISHES.length, 'every wish comes up');
  const day = 20410;
  const w = wishesOf(day);
  const stats = Object.fromEntries(WISHES.map((x) => [x.stat, 0]));
  // half of the first wish
  let r = wishProgress(null, day, { ...stats, [w[0].stat]: Math.ceil(w[0].n / 2) });
  assert.equal(r.done.length, w[0].n === 1 ? 1 : 0);
  // all three, twice: pays once, with the all-three bonus once
  r = wishProgress(r.night, day, { ...stats, [w[0].stat]: 999, [w[1].stat]: 999, [w[2].stat]: 999 });
  const paidNow = r.done.length;
  assert.ok(paidNow >= 2);
  assert.equal(r.blooms, paidNow * WISH_BLOOMS + ALL_WISHES_BLOOMS);
  assert.equal(r.xp, paidNow * WISH_XP);
  const again = wishProgress(r.night, day, { ...stats, [w[0].stat]: 999 });
  assert.equal(again.xp + again.blooms, 0);
  // a new night starts over
  const next = wishProgress(r.night, day + 1, stats);
  assert.equal(next.night.day, day + 1);
  assert.deepEqual(next.night.paid, [0, 0, 0]);
});

test('the moon calendar: a night counts once, nights running grow the pay, the seventh is a full moon, a gap starts over', () => {
  let m = null;
  let r = rowNight(m, 100);
  assert.equal(r.first, true);
  assert.equal(r.moon.n, 1);
  assert.equal(r.blooms, nightBlooms(1));
  assert.equal(rowNight(r.moon, 100).first, false, 'once a night');
  m = r.moon;
  let total = 0;
  for (let d = 101; d < 100 + MOON; d++) {
    r = rowNight(m, d);
    m = r.moon;
    total += r.blooms;
  }
  assert.equal(m.n, MOON);
  assert.equal(r.full, true);
  assert.equal(r.blooms, nightBlooms(MOON) + FULL_MOON_BLOOMS);
  assert.ok(total > 0);
  assert.deepEqual(moonShown(m, 100 + MOON - 1), { lit: MOON, tonight: true });
  assert.deepEqual(moonShown(m, 100 + MOON), { lit: MOON, tonight: false }, 'yesterday still counts');
  assert.deepEqual(moonShown(m, 100 + MOON + 1), { lit: 0, tonight: false }, 'a missed night');
  r = rowNight(m, 100 + MOON);
  assert.equal(r.moon.n, MOON + 1);
  assert.equal(moonShown(r.moon, 100 + MOON).lit, 1, 'a new moon');
  r = rowNight(r.moon, 100 + MOON + 3);
  assert.equal(r.moon.n, 1, 'a gap starts over');
  assert.equal(r.moon.best, MOON + 1);
  assert.equal(r.moon.total, MOON + 2);
});

test("Tonight's Dream: the same for everyone, never the same stream or twist two nights running, every pairing comes round", () => {
  assert.equal(nightOf(DAY_MS * 3 + 5), 3);
  const pairs = new Set();
  let prev = tonight(19999);
  for (let d = 20000; d < 21000; d++) {
    const t = tonight(d);
    assert.deepEqual(tonight(d), t);
    assert.ok(t.n >= 1 && t.n <= STREAMS.length);
    assert.ok(TWISTS.includes(t.twist));
    assert.notEqual(t.n, prev.n, `night ${d}`);
    assert.notEqual(t.twist, prev.twist, `night ${d}`);
    pairs.add(`${t.n}:${t.twist}`);
    prev = t;
  }
  assert.equal(pairs.size, STREAMS.length * TWISTS.length);
});

test('twists: a mirrored river, a swift song, a golden night, twice the blooms', () => {
  const def = STREAMS[2];
  const a = buildCourse(def);
  const m = buildCourse(twistDef(def, 'mirror'));
  assert.equal(m.total, a.total);
  for (const s of [40, 150, 300, 500]) {
    const p = a.point(s, 2);
    const q = m.point(s, -2);
    assert.ok(Math.abs(p.x + q.x) < 1e-6 && Math.abs(p.z - q.z) < 1e-6, `mirror at ${s}`);
  }
  assert.deepEqual(m.islands.map((i) => i.short), a.islands.map((i) => -i.short));
  assert.equal(def.segs[1][0] > 0, true, 'the original is untouched');
  const swift = twistDef(def, 'swift');
  assert.equal(swift.bpm, Math.round(def.bpm * SWIFT));
  const g = makeSong(def.bpm, { golden: true });
  for (const b of g.beats.slice(0, 64)) if (!b.rest) assert.equal(b.gold, !RUSH_VB.includes(b.vb));
  const bloom = buildCourse(twistDef(def, 'blooming'));
  assert.ok(bloom.blooms.length >= a.blooms.length * 1.6, `${bloom.blooms.length} vs ${a.blooms.length}`);
  // a race on a twisted river runs and finishes
  const sim = createRaceSim({ n: def.n, seats: [{ id: 'a', name: 'Wren', bot: true, skill: 0.6 }], key: 't', twist: 'mirror' });
  sim.simulate('a', null, null);
  let fin = false;
  for (let t = 0; t < 400 && !fin; t += 0.05) for (const { ev } of sim.step(t)) if (ev.type === 'finish') fin = true;
  assert.ok(fin, 'a rower finishes a mirrored river');
});

test('the saved profile: anything odd falls back, worn things must be owned, a first-build profile keeps its hat', () => {
  assert.deepEqual(cleanProfile(null), blankProfile());
  assert.deepEqual(cleanProfile('x'), blankProfile());
  const p = cleanProfile({ v: 2, xp: -5, blooms: 'lots', bought: ['hat:beret', 'hat:beret', 'hat:<b>', 'boat:x', 5], equip: { hat: 'beret', body: 'swan', lantern: 'neon' }, night: { day: 5, got: [3, 'x'], paid: [1] }, moon: { last: 4, n: 3 }, tonight: { day: 4, best: -2, score: 50 } });
  assert.equal(p.xp, 0);
  assert.equal(p.blooms, 0);
  assert.deepEqual(p.bought, ['hat:beret']);
  assert.equal(p.equip.hat, 'beret');
  assert.equal(p.equip.body, 'rowboat', 'the swan needs its level');
  assert.equal(p.equip.lantern, 'amber');
  assert.deepEqual(p.night, { day: 5, got: [3, 0, 0], paid: [1, 0, 0], all: 0 });
  assert.deepEqual(p.moon, { last: 4, n: 3, best: 0, total: 0 });
  assert.deepEqual(p.tonight, { day: 4, best: null, score: 50, runs: 0 });
  const old = cleanProfile({ v: 1, hat: 'beret', totals: { races: 12 }, dream: { 1: { best: 60, stars: [1, 1, 1] }, 2: { best: 70, stars: [1, 1, 1] }, 3: { best: 80, stars: [1, 1, 1] }, 4: { best: 80, stars: [1, 1, 1] } } });
  assert.equal(old.equip.hat, 'beret');
  assert.ok(old.bought.includes('hat:beret'));
  assert.ok(old.xp >= 12 * 50);
  const cheat = cleanProfile({ v: 1, hat: 'crown', dream: {} });
  assert.equal(cheat.equip.hat, 'nightcap', 'a first-build hat it never earned stays locked');
});
