// The game on one page: the title, the Dock (lobby), room races, watching, The Dream, the timing test. It reads the room
// and the match, runs the race simulation on the song clock, takes input, and hands the scene one plain frame a frame.

import { audio, VOICES } from './audio.js';
import { createSongClock } from './clock.js';
import { createRaceSim, courseOf } from './race.js';
import { STREAMS, ROWER_NAMES, streamByN, cap } from './sim/streams.js';
import { startSlot, clock as fmt, stars as starsOf, FINISH_WINDOW } from './sim/race.js';
import { beatPos } from './sim/racer.js';
import { makeSong } from './sim/song.js';
import { createScore } from './sim/score.js';
import { wrap } from './sim/course.js';
import { INTRO, JOIN, createNet, cleanBoat, cleanExtras, streamForRound } from './net.js';
import { rowerLook, playerLook, assignPaints, createAvatars } from './looks.js';
import { starCount, GHOST_HZ, ghostAt } from './save.js';
import { ICON } from './ui/icons.js';
import { levelOf, racePay, payInto, wishProgress, wishesOf, wishLabel, rowNight, moonShown, MOON, owns, buy, equip, priceOf, levelFor, KINDS } from './progress.js';
import { tonight as tonightOf, nightOf, TWIST_NAMES, TWIST_LINES } from './sim/tonight.js';
import { HAT_NAMES, BODY_NAMES, LANTERN_NAMES, LANTERN_COLORS, WAKE_NAMES, TRIM_NAMES, TRIM_COLORS } from './cosmetics.js';

/** Metres between beat ripples on the water. */
const SPACING = 7.5;
/** How many beats ahead the ripples show. */
const AHEAD = 4.2;
/** How long a passed ripple lingers (s). */
const LINGER = 0.35;
/** The round: the other boats' voices, so many beats behind the tune, and their octave. */
const LAGS = [
  { lag: 4, oct: 0 },
  { lag: 8, oct: 0 },
  { lag: 12, oct: 0 },
  { lag: 0, oct: -1 },
  { lag: 4, oct: -1 },
];
const KIND_RIPPLE = { perfect: 1, good: 2, splash: 3, pull: 1 };
/** Swell types on the water (water.js SWELL). */
const SWELL_GOLD = 1;
const SWELL_DROP = 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

export function createGame({ ow, scene, ui, store, flags = {} }) {
  const avatars = createAvatars(ow);
  const coarse = (() => {
    try {
      return matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  })();
  const P = () => store.profile;
  /** What this player wears (their profile's, every item owned), and their level, for the boat and presence. */
  const myWear = () => ({ ...P().equip, lv: levelOf(P().xp).level });
  /** Tonight's night number, from the platform's clock. */
  const nightNow = () => {
    try {
      const t = ow.now?.();
      if (finite(t) && t > 0) return nightOf(t);
    } catch {}
    return nightOf(Date.now());
  };
  const loadPerf = performance.now();
  let W = innerWidth;
  let H = innerHeight;
  let room = null;
  let net = null;
  let closed = null;
  let screen = 'title'; // title | dock | chart | dream | timing | boathouse | tonight
  let shop = null; // the Boathouse open: { tab, try (an item tried on, not owned) }
  let run = null; // the race on screen (a room round, a Dream run)
  let attract = null; // the title's race of rival rowers
  let primary = null; // what Space / Enter does on this screen
  let lobbyHidden = null;
  let dockSig = '';
  let dockStream = 0;
  let dockPlayers = [];
  let timing = null;
  let reserved = null;
  let berthSig = '';
  let lastPerf = performance.now();
  let hintClearAt = 0;
  let menuAnchor = null;
  const menuSong = makeSong(64);
  const awarded = new Set();
  const ap = { at: 0, dreamed: false, readied: false };

  // ---------------------------------------------------------------- the room

  function attach(r) {
    try {
      net?.dispose();
    } catch {}
    room = r;
    closed = null;
    ui.closed(null);
    net = createNet(room, { distanceOf: (id) => run?.dist?.get(id) ?? null });
    room.on('close', (reason) => onClose(reason));
    room.on('match', () => {
      lobbyHidden = null;
      dockSig = '';
    });
    room.on('host', () => (dockSig = ''));
    lobbyHidden = null;
    applyLobby();
    lobbyPresence();
  }

  function onClose(reason) {
    const say = {
      kicked: ['You were removed', 'Row'],
      disconnected: ['Connection lost', 'Rejoin'],
      replaced: ['Playing in another tab', 'Play here'],
    }[reason];
    if (!say) return;
    closed = reason;
    endRun();
    ui.modal(null);
    ui.chart(null);
    ui.dock(false);
    ui.start(false);
    ui.title(false);
    ui.closed(say[0], say[1], rejoin);
    primary = rejoin;
  }

  async function rejoin() {
    ui.closed(null);
    primary = null;
    try {
      const r = await ow.rooms.join(JOIN);
      attach(r);
      toDock();
    } catch {
      ui.closed('Connection lost', 'Rejoin', rejoin);
      primary = rejoin;
    }
  }

  function lobbyPresence() {
    try {
      room?.setPresence({ r: '', nb: P().first ? 0 : 1, ...myWear() });
    } catch {}
  }

  /** The platform's Ready strip shows on the Dock only (not on the title, the Dream or the timing test). */
  function applyLobby() {
    if (!room) return;
    const hide = screen !== 'dock';
    if (hide === lobbyHidden) return;
    lobbyHidden = hide;
    try {
      if (hide) room.hideLobby();
      else room.hideLobby(false);
    } catch {}
    applyInsets();
  }

  // ---------------------------------------------------------------- layout around the platform

  function applyInsets() {
    const ins = { top: 0, left: 0, right: 0, bottom: 0 };
    const lobbyScreen = screen === 'dock' && (!net || net.match.phase === 'lobby');
    if (!Array.isArray(reserved)) ins.bottom = lobbyScreen ? 88 : 0;
    else {
      for (const a of reserved) {
        if (!a || !finite(a.y) || !finite(a.h)) continue;
        if (a.kind === 'lobby') ins.bottom = Math.max(ins.bottom, H - a.y);
        else if (a.y < 140 && finite(a.x) && finite(a.w) && a.x + a.w > W * 0.55) ins.top = Math.max(ins.top, a.y + a.h);
      }
    }
    ui.setInsets(ins);
  }

  // ---------------------------------------------------------------- screens

  function showTitle() {
    screen = 'title';
    ui.title(true, { stars: starCount(P()), onRow: row });
    primary = row;
    applyLobby();
  }

  function row() {
    audio.start();
    audio.fx.tap();
    attract = null;
    toDock();
  }

  function toDock() {
    endRun();
    screen = 'dock';
    ui.title(false);
    ui.chart(null);
    ui.modal(null);
    timing = null;
    dockSig = '';
    dockStream = 0;
    primary = null;
    menuAnchor = null;
    applyLobby();
    applyInsets();
    lobbyPresence();
    audio.setMusic(0.32);
  }

  /** A match took this player in: whatever they were doing alone ends. */
  function leaveSolo() {
    if (run && run.kind === 'dream') endRun();
    ui.title(false);
    ui.chart(null);
    ui.modal(null);
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    timing = null;
    attract = null;
    screen = 'dock';
    applyLobby();
  }

  function endRun() {
    if (!run) return;
    run = null;
    ui.hud(false);
    ui.band(null);
    ui.stamp(0);
    ui.hint(null);
    ui.watching(null);
    ui.oarHints(false);
    ui.tapToRow(false);
    ui.tags([]);
    scene.hidePodium();
    scene.setGhost(false);
    audio.setBeds({ water: 0.4, rapids: 0, whirl: 0, wake: 0 });
    audio.reset();
  }

  // ---------------------------------------------------------------- a race on screen

  function lookOf(r, seat) {
    if (seat.bot) return rowerLook(seat.name);
    const wear = seat.id === r.meId ? myWear() : cleanExtras(room?.players.get(seat.id)?.presence);
    return playerLook(avatars.get(seat.id), r.paints.get(seat.id) ?? 0, wear);
  }

  function refreshLooks(r, first = false) {
    let changed = false;
    for (const s of r.seats) {
      const lk = lookOf(r, s);
      const old = r.looks.get(s.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(lk)) {
        r.looks.set(s.id, lk);
        changed = true;
      }
    }
    if (changed && !first) scene.setBoats(r.seats.map((s) => ({ id: s.id, look: r.looks.get(s.id) })));
  }

  /** o: { kind, key, n, seats, meId, ease, pilot, source } */
  function makeRun(o) {
    const stream = streamByN(o.n);
    const sim = createRaceSim({ n: o.n, seats: o.seats, me: o.meId, key: o.key, ease: o.ease ?? 1, calib: P().calib, pilot: o.pilot ?? null, twist: o.twist ?? null });
    const r = {
      ...o,
      stream,
      course: sim.course,
      song: sim.song,
      sim,
      clock: createSongClock(o.source),
      t: -INTRO,
      marks: new Map(),
      names: new Map(o.seats.map((s) => [s.id, s.name])),
      looks: new Map(),
      paints: assignPaints(o.seats),
      dist: new Map(),
      lastLevel: 1,
      place: 0,
      myFin: null,
      myPlace: 0,
      bumps: 0,
      splashRun: 0,
      outFor: 0,
      hintAt: {},
      presAt: 0,
      pubAt: 0,
      sentFin: 0,
      bufT: null,
      botBuf: [],
      ghostRec: [],
      ghost: null,
      paused: false,
      focusIdx: 0,
      lookAt: 0,
      phaseShown: '',
      calm: 0,
      deltas: [],
      score: createScore(),
      dropMarks: new Map(),
      bloomLine: -1,
      bloomRun: 0,
      wasPad: false,
      rivalFin: new Map(),
      done: false,
    };
    refreshLooks(r, true);
    scene.load(stream, sim.course);
    scene.resetBlooms();
    scene.setBoats(o.seats.map((s) => ({ id: s.id, look: r.looks.get(s.id) })));
    scene.hidePodium();
    scene.setGhost(false);
    scene.snapCamera();
    ui.hud(false);
    ui.band(null);
    ui.stamp(0);
    ui.hint(null);
    ui.watching(null);
    ui.tags([]);
    audio.reset();
    return r;
  }

  function myName() {
    return room?.me?.name || 'You';
  }

  function startRoomRun(d) {
    endRun();
    const m = net.match;
    const seats = m.seats.map((s, i) => ({ id: s.id, name: s.name, bot: s.bot, skill: finite(d.bs[s.id]) ? d.bs[s.id] : s.skill, slot: Number.isInteger(d.slots[s.id]) ? d.slots[s.id] % 6 : i % 6 }));
    const meId = m.me ? m.me.id : null;
    const stream = streamByN(d.n);
    const ease = meId ? (P().first ? stream.ease : Math.max(1.35, stream.ease)) : 1;
    const source = (perf) => (room.matchNow() - (performance.now() - perf) - d.t0) / 1000;
    run = makeRun({ kind: 'room', key: m.roundId, n: d.n, seats, meId, ease, pilot: flags.autoplay ? flags.pilot : null, source });
    run.d = d;
    run.round = m.round;
    run.rounds = m.rounds;
    run.humans = seats.filter((s) => !s.bot).length;
    const t = source(performance.now());
    // A page that reloaded mid-race carries on from its own presence.
    const pres = room.me?.presence;
    if (meId && run.sim.me && pres && pres.r === run.key && t > 0) {
      const st = cleanBoat(pres, null, run.course.total);
      if (st) run.sim.me.restore(st, t);
      if (finite(d.fin[meId])) run.myFin = d.fin[meId];
    }
    if (t < 0) ui.streamName(stream.name, m.rounds > 1 ? `Stream ${m.round} of ${m.rounds}` : '');
    if (meId && !audio.running()) ui.tapToRow(true);
    screen = 'dock';
    ui.title(false);
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    ui.chart(null);
    ui.modal(null);
    primary = null;
    applyLobby();
    applyInsets();
  }

  /** A Dream stream (opts.twist and opts.tonight: Tonight's Dream). */
  function startDream(n, opts = {}) {
    endRun();
    ui.modal(null);
    ui.chart(null);
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    const stream = streamByN(n);
    const rs = stream.rivalSkill;
    const seats = [{ id: 'me', name: myName(), bot: false, slot: 2 }];
    stream.rivals.forEach((name, i) => seats.push({ id: `rival${i}`, name, bot: true, skill: rs[0] + ((rs[1] - rs[0]) * i) / Math.max(1, stream.rivals.length - 1), slot: [1, 3, 4][i] ?? i }));
    const dc = { start: performance.now(), pausedMs: 0, pausedAt: null };
    const source = (perf) => ((dc.pausedAt ?? perf) - dc.start - dc.pausedMs) / 1000 - INTRO;
    const ease = P().first ? stream.ease : Math.max(1.35, stream.ease);
    const twist = opts.twist ?? null;
    run = makeRun({ kind: 'dream', key: `dream:${n}${twist ? `:${twist}` : ''}`, n, seats, meId: 'me', ease, pilot: flags.autoplay ? flags.pilot : null, source, twist, tonight: opts.tonight ?? null });
    run.dc = dc;
    for (const s of seats) if (s.bot) run.sim.simulate(s.id);
    screen = 'dream';
    primary = null;
    applyLobby();
    applyInsets();
    ui.streamName(stream.name, twist ? `Tonight's Dream · ${TWIST_NAMES[twist]}` : `The Dream · ${n} of ${STREAMS.length}`);
    if (!audio.running()) ui.tapToRow(true);
    const key = run.key;
    if (!twist && P().dream[n]?.best) {
      store.ghost(n).then((g) => {
        if (run && run.key === key && g) {
          run.ghost = g;
          scene.setGhost(true);
        }
      });
    }
  }

  function makeAttract() {
    const seats = ROWER_NAMES.map((name, i) => ({ id: `a${i}`, name, bot: true, skill: 0.45 + i * 0.08, slot: i }));
    const start = performance.now();
    const r = makeRun({ kind: 'attract', key: `attract:${Math.floor(start)}`, n: 1, seats, meId: null, source: (perf) => (perf - start) / 1000 - 1 });
    for (const s of seats) r.sim.simulate(s.id);
    return r;
  }

  // ---------------------------------------------------------------- the frame

  function frame(perf) {
    const dt = Math.min(0.1, Math.max(0, (perf - lastPerf) / 1000));
    lastPerf = perf;
    const now = perf / 1000;
    audio.sampleClock(perf);
    if (flags.autoplay || flags.autoplayTo) autoplayStep(perf);
    route();
    let f = null;
    if (run) f = runFrame(run, perf, dt, now);
    else if (screen === 'title' && !closed) {
      if (!attract || attract.t > 78) attract = makeAttract();
      f = runFrame(attract, perf, dt, now);
    } else f = dockFrame(perf, dt, now);
    if (perf > hintClearAt && hintClearAt) {
      hintClearAt = 0;
      ui.hint(null);
    }
    if (f) scene.frame(f);
    document.body.dataset.flow = flowName();
  }

  function flowName() {
    if (screen === 'title' && !run) return 'title';
    if (run && run.kind === 'room') {
      const ph = net.match.phase;
      if (ph === 'roundEnd') return 'roundEnd';
      if (ph === 'results') return 'results';
      return run.t < 0 ? 'countdown' : 'playing';
    }
    if (run && run.kind === 'dream') return run.t < 0 ? 'countdown' : 'playing';
    return 'lobby';
  }

  /** What the room says should be on screen. */
  function route() {
    if (!room || !net || closed) return;
    const m = net.match;
    const d = net.round;
    const mine = !!m.me;
    const want = !!d && (mine || (screen === 'dock' && !timing));
    if (want) {
      if (mine && screen !== 'dock') leaveSolo();
      if (mine && timing) {
        timing = null;
        ui.modal(null);
      }
      if (!run || run.kind !== 'room' || run.key !== m.roundId) startRoomRun(d);
    } else if (run && run.kind === 'room') toDock();
  }

  // ---------------------------------------------------------------- the race frame

  function runFrame(r, perf, dt, now) {
    const sim = r.sim;
    const beatDur = r.song.phase(Math.max(0, r.t)).dur;
    if (!r.paused) r.clock.sync(perf, beatDur);
    const t = r.paused ? r.t : r.clock.at(perf);
    r.t = t;
    const isRoom = r.kind === 'room';
    const m = isRoom ? net.match : null;
    const d = isRoom ? net.round ?? r.d : null;
    if (d) r.d = d;
    const phase = m ? m.phase : 'round';
    if (isRoom) syncRoom(r, t, perf, d, m);
    if (!r.paused) for (const { id, ev } of sim.step(t)) onEvent(r, id, ev, perf);
    if (perf - r.lookAt > 1000) {
      r.lookAt = perf;
      refreshLooks(r);
    }
    const me = sim.me;
    const meB = me ? me.boat : null;
    const boats = sim.boats();
    for (const b of boats) r.dist.set(b.id, b.s);
    // places
    const fin = finishTimes(r, d);
    const left = new Set(isRoom ? m.seats.filter((s) => s.left).map((s) => s.id) : []);
    const order = sim.places(fin, left);
    const tv = t - (P().calib || 0);
    // focus: the player's boat, or (watching) the leader and the boats after it
    let focusId = r.meId;
    if (!me) {
      const live = order.filter((id) => !left.has(id));
      const k = live.length ? (((r.focusIdx % live.length) + live.length) % live.length) : 0;
      focusId = live[k] ?? order[0];
    }
    const focus = boats.find((b) => b.id === focusId) ?? boats[0];
    if (me && r.kind !== 'attract') {
      const place = order.indexOf(r.meId) + 1;
      if (r.place && place && phase === 'round' && t > 3 && r.myFin === null) {
        if (place < r.place) audio.fx.overtake(r.stream.tonic);
        else if (place > r.place) audio.fx.dropped(r.stream.tonic);
      }
      r.place = place;
      levelStep(r);
      if (!r.paused && r.myFin === null) hintStep(r, t, perf, dt);
      if (meB.pad && !r.wasPad) audio.fx.pad();
      r.wasPad = !!meB.pad;
      // the Dream's ghost: record this run, show the best
      if (r.kind === 'dream' && t >= 0 && r.myFin === null) {
        while (r.ghostRec.length <= t * GHOST_HZ) r.ghostRec.push([meB.x, meB.z, meB.h]);
      }
    }
    // the race's moments
    if (isRoom) phaseStep(r, m, d, perf);
    if (r.kind === 'dream') dreamStep(r, t, perf);
    // ripples onto the oars
    const racing = me && r.myFin === null && phase === 'round' && !r.paused && r.kind !== 'attract';
    const rip = racing ? ripples(r, tv, meB) : null;
    // the song
    if (r.kind !== 'attract') soundStep(r, t, phase, boats, focus, me);
    // first finisher: the arch's lanterns go out over the window
    const firstFin = Object.values(fin).filter(finite).reduce((a, b) => Math.min(a, b), Infinity);
    let finishLit = 9;
    let sign = '';
    if (isRoom && Number.isFinite(firstFin)) {
      const left2 = firstFin + FINISH_WINDOW - t;
      finishLit = clamp(Math.ceil((left2 / FINISH_WINDOW) * 9), 0, 9);
      if (phase === 'round' && left2 > 0) sign = fmt(left2).replace(/\.\d$/, '');
    }
    const countLit = t < 0 ? r.song.count.filter((c, i) => i > 0 && c <= tv).length : 3;
    // HUD, tags
    if (r.kind !== 'attract') hudStep(r, t, phase, boats, order, focus, perf);
    // the camera
    const portrait = H > W;
    let cam;
    if (r.kind === 'attract') cam = { mode: 'title', portrait };
    else if (phase === 'results') cam = { mode: 'results', portrait };
    else if (t < 0) cam = { mode: 'intro', k: (t + INTRO) / INTRO, portrait, boat: focus };
    else if ((me && r.myFin !== null && t > r.myFin + 0.8) || phase === 'roundEnd') cam = { mode: 'finish', portrait, boat: focus };
    else if (!me) cam = { mode: 'spectate', portrait, boat: focus };
    else cam = { mode: 'race', portrait, boat: focus, push: me.judge.state.level >= 4 ? 1 : 0, beat: r.song.phase(Math.max(0, tv)).f };
    const ph = r.song.phase(tv);
    const pulse = tv < 0 || (ph.beat && !ph.beat.rest) ? Math.exp(-ph.f * 5) : 0;
    r.calm += ((r.song.resting(tv) ? 1 : 0) - r.calm) * Math.min(1, dt * 2);
    let ghost = null;
    if (r.ghost) {
      const g = ghostAt(r.ghost, Math.max(0, tv));
      if (g) ghost = { x: g.x, z: g.z, h: g.h };
    }
    const drawn = boats.map((b) => ({ ...b, hidden: !!b.hidden }));
    return {
      now,
      dt,
      t: tv,
      B: beatPos(r.song, tv),
      pulse,
      boats: drawn,
      meId: r.meId,
      focusId: focus?.id,
      focusS: focus ? focus.s : r.course.start,
      focus: focus ? { x: focus.x, z: focus.z } : null,
      ripples: rip ? rip.list : [],
      oar: rip ? rip.oar : null,
      ghost,
      calm: r.calm,
      got: meB ? meB.got : null,
      beam: true,
      camera: cam,
      arch: { count: countLit, finishLit, sign },
    };
  }

  /** Finish times known on this page: the host's record, this page's own, the Dream's rivals. */
  function finishTimes(r, d) {
    const fin = {};
    if (d) Object.assign(fin, d.fin);
    if (r.myFin !== null && r.meId) fin[r.meId] = r.myFin;
    if (r.kind !== 'room') for (const [id, racer] of r.sim.racers) if (racer.boat.finished && finite(racer.boat.ft)) fin[id] = racer.boat.ft;
    return fin;
  }

  /** The room's side of a race: other players' boats from presence, the bots from the host, this page's presence. */
  function syncRoom(r, t, perf, d, m) {
    const hosting = m.isHost;
    const live = new Map(m.seats.map((s) => [s.id, s]));
    const st = net.botStates();
    if (st && st.t !== r.bufT) {
      r.bufT = st.t;
      r.botBuf.push(st);
      if (r.botBuf.length > 8) r.botBuf.shift();
    }
    for (const s of r.seats) {
      if (s.id === r.meId) continue;
      const seat = live.get(s.id);
      const away = !!seat?.away;
      const gone = !seat || !!seat.left;
      if (s.bot) {
        if (hosting) {
          if (!r.sim.racers.has(s.id)) {
            const snap = st?.b?.[s.id] ? cleanBoat(st.b[s.id], null, r.course.total) : null;
            r.sim.simulate(s.id, snap, snap ? st.t : null);
          }
        } else {
          if (r.sim.racers.has(s.id)) r.sim.release(s.id);
          const v = botView(r, s.id, t);
          if (v) r.sim.setView(s.id, v);
        }
      } else {
        const p = room.players.get(s.id);
        const raw = p?.presence;
        if (raw && typeof raw === 'object' && raw.r === r.key) {
          let at = null;
          try {
            at = room.presenceAt(s.id, { angles: ['h'], snap: 20 });
          } catch {}
          const mix = at && typeof at === 'object' ? { ...raw, x: at.x, z: at.z, h: at.h, s: at.s, v: at.v } : raw;
          const v = cleanBoat(mix, r.sim.views.get(s.id) ?? null, r.course.total);
          r.sim.setView(s.id, { ...v, away, hidden: gone });
        } else r.sim.setView(s.id, { away, hidden: gone });
      }
    }
    if (hosting && perf - r.pubAt > 100) {
      r.pubAt = perf;
      const out = {};
      for (const s of r.seats) {
        const racer = s.bot ? r.sim.racers.get(s.id) : null;
        if (!racer) continue;
        out[s.id] = racer.snapshot();
        if (racer.boat.finished && d && !finite(d.fin[s.id]) && finite(racer.boat.ft)) net.botFinish(s.id, racer.boat.ft);
      }
      net.publishBots(out, t);
    }
    if (r.meId && r.sim.me && perf - r.presAt > 66) {
      r.presAt = perf;
      try {
        room.setPresence({ r: r.key, ...r.sim.me.snapshot(), nb: P().first ? 0 : 1, ...myWear() });
      } catch {}
    }
    // this page's finish, until the host has written it down
    if (r.myFin !== null && d && !finite(d.fin[r.meId]) && perf - r.sentFin > 1500 && m.phase === 'round') {
      r.sentFin = perf;
      net.finish(r.myFin);
    }
  }

  /** A bot's boat between the host's last two reports (a tenth of a second behind), or carried on a little past them. */
  function botView(r, id, t) {
    const buf = r.botBuf;
    if (!buf.length) return null;
    const rt = t - 0.12;
    let a = null;
    let b = null;
    for (const e of buf) {
      if (!e.b[id]) continue;
      if (e.t <= rt) a = e;
      else if (!b) b = e;
    }
    const total = r.course.total;
    const prev = r.sim.views.get(id) ?? null;
    if (a && b) {
      const A = cleanBoat(a.b[id], prev, total);
      const B = cleanBoat(b.b[id], A, total);
      const k = clamp((rt - a.t) / Math.max(0.001, b.t - a.t), 0, 1);
      const base = k > 0.5 ? B : A;
      return { ...base, x: A.x + (B.x - A.x) * k, z: A.z + (B.z - A.z) * k, s: A.s + (B.s - A.s) * k, v: A.v + (B.v - A.v) * k, h: A.h + wrap(B.h - A.h) * k };
    }
    const e = a ?? b;
    const A = cleanBoat(e.b[id], prev, total);
    if (a && !A.f) {
      const lead = clamp(rt - a.t, 0, 0.3);
      return { ...A, x: A.x + Math.sin(A.h) * A.v * lead, z: A.z - Math.cos(A.h) * A.v * lead, s: A.s + A.v * lead };
    }
    return A;
  }

  // ---------------------------------------------------------------- events, strokes, feedback

  function onEvent(r, id, ev, perf) {
    const mine = id === r.meId && r.kind !== 'attract';
    switch (ev.type) {
      case 'stroke':
        if (mine) {
          r.score.events([ev]);
          if (r.pilot != null) feedback(r, ev.res, ev.t);
        }
        break;
      case 'bloom':
        if (mine) {
          r.score.add('bloom');
          const m = r.course.blooms[ev.i];
          r.bloomRun = m && m.line === r.bloomLine ? r.bloomRun + 1 : 0;
          r.bloomLine = m?.line ?? -1;
          const b = r.sim.me.boat;
          const pan = clamp((m ? m.d - b.d : 0) * 0.2, -0.6, 0.6);
          audio.fx.bloom(r.bloomRun, r.stream.tonic, pan);
          if (r.bloomRun >= 4) award('bouquet');
          scene.bloom(ev.i, r.bloomRun);
          ui.blooms(b.blooms);
        }
        break;
      case 'shave':
        if (mine) {
          r.score.add('shave');
          audio.fx.shave(0);
          award('close-shave');
          judgeWord(r, 'shave', 0);
          scene.punch(0.35);
        }
        break;
      case 'miss':
        if (mine && ev.res?.beat) {
          r.marks.set(ev.res.beat.i, 3);
          audio.fx.miss(0);
          judgeWord(r, 'miss', 0);
        }
        break;
      case 'bump':
        if (mine) {
          r.score.add('bump');
          r.bumps++;
          audio.fx.bump(ev.kind, 1);
          scene.shake(0.45);
        }
        break;
      case 'touch':
        if (mine) audio.fx.touch();
        break;
      case 'wave':
        if (mine) audio.fx.wave();
        break;
      case 'unstuck':
        if (mine) audio.fx.unstuck();
        break;
      case 'finish':
        if (mine) myFinish(r, ev.t, perf);
        else if (r.kind === 'room' && net.match.isHost && r.seats.find((s) => s.id === id)?.bot) net.botFinish(id, ev.t);
        break;
    }
  }

  function feedback(r, res, t) {
    const kind = res.kind;
    if (kind === 'early') return;
    const side = res.side === 0 ? 0 : res.side;
    if (res.beat && KIND_RIPPLE[kind]) {
      if (kind !== 'splash' || !r.marks.has(res.beat.i)) r.marks.set(res.beat.i, KIND_RIPPLE[kind]);
    }
    if (kind === 'drop' && res.drop) r.dropMarks.set(res.drop.n, 1);
    const beatCtx = res.beat ? r.clock.ctxOf(res.beat.t) : null;
    audio.stroke(res, { beatCtx: beatCtx ?? audio.now, strokeCtx: audio.now, tonic: r.stream.tonic, side });
    if (kind === 'perfect' || kind === 'good' || kind === 'splash') judgeWord(r, kind, side);
    if (kind === 'pull') {
      judgeWord(r, 'pull', 0);
      scene.punch(0.55);
      scene.flash('#FFC94D', 0.1);
      scene.pull();
    }
    if (res.rush) {
      ui.rush();
      scene.flash('#FFE7A8', 0.16);
      scene.punch(0.8);
      scene.rush();
      award('merrily-rush');
    }
    if (kind === 'splash') r.splashRun++;
    if (kind === 'perfect' || kind === 'good') {
      r.splashRun = 0;
      if (finite(res.delta)) r.deltas.push(res.delta);
    }
    if (kind === 'perfect') award('first-stroke');
    void t;
  }

  function judgeWord(r, kind, side) {
    const b = r.sim.me?.boat;
    if (!b) return;
    const off = side === 0 ? 0 : side * 1.9;
    const p = scene.project(b.x + Math.cos(b.h) * off, 1.3, b.z + Math.sin(b.h) * off, W, H);
    if (p) ui.judge(kind, p.x, p.y);
  }

  /** A stroke from a key or a touch, at the moment the event happened. */
  function stroke(side, perf) {
    if (!audio.running()) audio.start();
    ui.tapToRow(false);
    const r = run;
    if (!r || r.paused) return false;
    if (!r.meId || !r.sim.me) {
      if (r.kind === 'room') {
        r.focusIdx += side;
        scene.snapCamera();
      }
      return true;
    }
    if (r.myFin !== null || r.pilot != null) return true;
    if (r.kind === 'room' && net.match.phase !== 'round') return true;
    const t = r.clock.at(perf);
    const res = r.sim.input(side, t);
    if (res) feedback(r, res, t);
    ui.dipOar(side);
    return true;
  }

  function levelStep(r) {
    const js = r.sim.me.judge.state;
    const lvl = js.level;
    if (lvl > r.lastLevel) {
      audio.fx.lanternUp(lvl, r.stream.tonic);
      if (lvl >= 4) award('merrily-x4');
    } else if (lvl < r.lastLevel) audio.fx.lanternOut();
    r.lastLevel = lvl;
    if (js.bestRun >= 16) award('perfect-verse');
  }

  function award(id) {
    if (awarded.has(id) || run?.pilot != null) return;
    awarded.add(id);
    store.award(id);
  }

  // ---------------------------------------------------------------- the beat ripples

  function ripples(r, tv, b) {
    const song = r.song;
    const list = [];
    let glow = 0;
    const i0 = Math.max(0, song.indexAt(tv) - 1);
    for (let i = i0; i < song.beats.length && list.length < 9; i++) {
      const beat = song.beats[i];
      const dtb = beat.t - tv;
      if (dtb > beat.dur * AHEAD) break;
      if (beat.rest || dtb < -LINGER) continue;
      const speed = SPACING / beat.dur;
      const mark = r.marks.get(beat.i) ?? 0;
      const type = beat.gold ? SWELL_GOLD : 0;
      if (dtb >= 0) {
        const k = dtb / (beat.dur * AHEAD);
        list.push({ s: b.s + dtb * speed, strength: Math.pow(1 - k, 0.7) * (mark ? 1.2 : 1) * (beat.gold ? 1.15 : 1), kind: mark, type, grow: 0 });
        glow = Math.max(glow, Math.exp(-((dtb / 0.09) ** 2)));
      } else {
        const k = -dtb / LINGER;
        list.push({ s: b.s + dtb * speed * 0.35, strength: (1 - k) * (mark ? 1.25 : 0.6), kind: mark, type, grow: k });
        if (!mark) glow = Math.max(glow, Math.exp(-((dtb / 0.09) ** 2)));
      }
    }
    // the merrily bar's droplets: small dotted ripples between the beats
    const drops = song.drops;
    for (let i = r.dropAt ?? 0; i < drops.length && list.length < 15; i++) {
      const dp = drops[i];
      const dtb = dp.t - tv;
      const dur = song.beats[dp.beat].dur;
      if (dtb < -LINGER) {
        r.dropAt = i + 1;
        continue;
      }
      if (dtb > dur * AHEAD) break;
      const speed = SPACING / dur;
      const mark = r.dropMarks.get(dp.n) ? 1 : 0;
      if (dtb >= 0) list.push({ s: b.s + dtb * speed, strength: 0.75 * Math.pow(1 - dtb / (dur * AHEAD), 0.7), kind: mark, type: SWELL_DROP, grow: 0 });
      else list.push({ s: b.s + dtb * speed * 0.35, strength: (1 + dtb / LINGER) * (mark ? 0.9 : 0.4), kind: mark, type: SWELL_DROP, grow: -dtb / LINGER });
    }
    return { list, oar: { s: b.s, d: b.d, glow } };
  }

  // ---------------------------------------------------------------- sound

  function soundStep(r, t, phase, boats, focus, me) {
    if (!audio.running()) return;
    const anchor = r.clock.ctxOf(0);
    if (phase === 'round' && !r.paused && anchor !== null) {
      const meS = focus ? focus.s : 0;
      const others = boats.filter((b) => b.id !== r.meId && !b.hidden && !b.away).sort((a, b) => r.seats.findIndex((s) => s.id === a.id) - r.seats.findIndex((s) => s.id === b.id));
      const voices = others.slice(0, LAGS.length).map((b, i) => {
        const near = Math.exp(-Math.abs(b.s - meS) / 35);
        const alive = b.lq === 3 ? 0.15 : 1;
        let pan = 0;
        if (focus) pan = clamp(((b.x - focus.x) * Math.cos(focus.h) + (b.z - focus.z) * Math.sin(focus.h)) / 9, -0.8, 0.8);
        return { ...LAGS[i], timbre: VOICES[1 + i], vol: near * alive * (0.22 + 0.16 * (b.c | 0)), pan };
      });
      audio.schedule({ key: r.key, song: r.song, anchor, tonic: r.stream.tonic, level: me ? me.judge.state.level : 2, voices });
      audio.setMusic(0.5);
    }
    const b = me?.boat ?? focus;
    audio.setBeds({ water: 0.8, rapids: b?.rapids ?? 0, whirl: b?.whirl ? 1 : 0, wake: b?.slip ? 1 : 0 });
    audio.ambience(r.calm > 0.5 ? 1 : 0.4);
  }

  // ---------------------------------------------------------------- hints

  function hint(key, text, perf, { again = 0 } = {}) {
    const seen = !!P().hints[key];
    const last = run?.hintAt[key];
    if (seen && !again) return;
    if (seen && last !== undefined && perf - last < again * 1000) return;
    if (hintClearAt && perf < hintClearAt) return;
    ui.hint(text);
    hintClearAt = perf + 2600;
    if (run) run.hintAt[key] = perf;
    if (!seen) {
      P().hints[key] = 1;
      store.save();
    }
  }

  function hintStep(r, t, perf, dt) {
    if (r.pilot != null) return;
    const racer = r.sim.me;
    const b = racer.boat;
    const js = racer.judge.state;
    if (t > -2.6 && t < 0) hint('tap', 'Tap when it reaches you', perf);
    else if (t > 0 && js.perfect + js.good >= 1 && js.strokes < 10) hint('alt', 'Left · right · left · right', perf);
    const a = r.course.at(b.s);
    const rel = wrap(b.h - a.h);
    const out = (b.d > a.hw - 4 && rel > 0.12) || (b.d < -(a.hw - 4) && rel < -0.12);
    r.outFor = out ? r.outFor + dt : 0;
    if (r.outFor > (P().hints.turn ? 6 : 1)) hint('turn', b.d > 0 ? 'Left, left: turn left' : 'Right, right: turn right', perf, { again: 20 });
    if (r.splashRun >= 3) {
      r.splashRun = 0;
      hint('wait', 'Wait for the ripple', perf, { again: 15 });
    }
    for (const isl of r.course.islands ?? []) {
      if (b.s > isl.s0 - 40 && b.s < isl.s0 - 8) hint('short', `Short way ${isl.short < 0 ? '←' : '→'}`, perf);
    }
    if (t > 0 && r.song.resting(t)) hint('glide', 'Glide…', perf);
    if (b.slip) hint('wake', 'Ride the wake', perf);
  }

  // ---------------------------------------------------------------- the HUD and name tags

  function hudStep(r, t, phase, boats, order, focus, perf) {
    const me = r.sim.me;
    const showHud = me && phase === 'round' && !r.done && flags.hud !== false;
    if (showHud) {
      const c = r.course;
      const len = Math.max(1, c.finish - c.start);
      let gap = '';
      let gapAhead = false;
      if (r.ghost && t > 0 && r.myFin === null) {
        const g = ghostAt(r.ghost, t);
        if (g && !g.done) {
          const gs = c.locate(g.x, g.z).s;
          const sec = (gs - me.boat.s) / Math.max(2.5, me.boat.v);
          gapAhead = sec < 0;
          gap = `${sec < 0 ? '−' : '+'}${Math.abs(sec).toFixed(1)}`;
        }
      }
      ui.hud(true, {
        place: r.place,
        time: t >= 0 ? fmt(r.myFin ?? t) : '',
        gap,
        gapAhead,
        tally: { score: r.score.state.total, level: me.judge.state.level, blooms: me.boat.blooms },
        progress: boats
          .filter((b) => !b.hidden)
          .map((b) => {
            const lk = r.looks.get(b.id) ?? {};
            return { id: b.id, f: (b.s - c.start) / len, me: b.id === r.meId, symbol: lk.symbol, color: lk.paint, dim: !!b.away };
          }),
        onPause: r.kind === 'dream' ? () => pauseDream(true) : null,
      });
      if (coarse) ui.oarHints(r.myFin === null, 0);
    } else {
      ui.hud(false);
      ui.oarHints(false);
    }
    // name tags over the other boats (and over every boat for a watcher)
    const tags = [];
    if (phase !== 'results') {
      const fs = focus ? focus.s : 0;
      for (const b of boats) {
        if (b.id === r.meId || b.hidden) continue;
        const ds = Math.abs(b.s - fs);
        if (ds > 70) continue;
        const p = scene.project(b.x, 2.5, b.z, W, H);
        const lk = r.looks.get(b.id) ?? {};
        tags.push({ id: b.id, x: p?.x ?? -999, y: p?.y ?? -999, name: r.names.get(b.id) ?? '', zz: !!b.away, small: ds > 25, symbol: lk.symbol, color: lk.paint, hidden: !p || p.x < -60 || p.x > W + 60 || p.y < 0 || p.y > H });
      }
    }
    ui.tags(tags);
    if (!me && r.kind === 'room' && phase === 'round') ui.watching(`‹ ${r.names.get(focus?.id) ?? ''} ›`);
    else ui.watching(null);
    void perf;
  }

  // ---------------------------------------------------------------- finishing, the round's end, results

  function myFinish(r, ft, perf) {
    if (r.myFin !== null) return;
    r.myFin = ft;
    const fin = finishTimes(r, r.d);
    const before = Object.entries(fin).filter(([id, v]) => id !== r.meId && finite(v) && v < ft).length;
    r.myPlace = before + 1;
    ui.stamp(r.myPlace);
    audio.fx.finish(r.stream.tonic, r.myPlace === 1);
    const a = r.course.point(r.course.finish, 0);
    scene.fx.finish(a.x, 3.5, a.z);
    if (r.kind === 'room') {
      net.finish(ft);
      r.sentFin = perf;
    }
    if (r.pilot != null) return;
    const p = P();
    const js = r.sim.me.judge.state;
    p.totals.races++;
    p.totals.perfects += js.perfect;
    p.first = 1;
    const n = r.n;
    const prevBest = p.best[n];
    r.newBest = !prevBest || ft < prevBest;
    if (r.newBest) p.best[n] = Math.round(ft * 1000) / 1000;
    if (r.bumps === 0) award('gently');
    if (r.deltas.length >= 8) {
      const s = [...r.deltas].sort((x, y) => x - y);
      const med = s[Math.floor(s.length / 2)];
      if (Math.abs(med) > 0.025) p.dot = 1;
    }
    store.submit(`stream-${n}`, ft, true);
    store.save();
  }

  function phaseStep(r, m, d, perf) {
    const phase = m.phase;
    if (phase === r.phaseShown) {
      if (phase === 'results') resultsFoot(r, m);
      return;
    }
    r.phaseShown = phase;
    if (phase === 'roundEnd') {
      ui.stamp(0);
      ui.hint(null);
      roundEndBand(r, m, d);
      roundBadges(r, m, d);
    } else if (phase === 'results') {
      ui.stamp(0);
      resultsBand(r, m, d);
    }
    void perf;
  }

  function rowOf(r, id, place, d, extra = {}) {
    const lk = r.looks.get(id) ?? {};
    const seat = r.seats.find((s) => s.id === id);
    const ft = d?.fin?.[id];
    const s = r.dist.get(id) ?? 0;
    return {
      id,
      place,
      name: r.names.get(id) ?? '',
      me: id === r.meId,
      time: finite(ft) ? fmt(ft) : `${Math.max(0, Math.round(r.course.finish - s))} m`,
      avatar: seat && !seat.bot ? avatars.head(id) : null,
      symbol: lk.symbol,
      color: lk.paint,
      ...extra,
    };
  }

  function roundEndBand(r, m, d) {
    const last = m.last;
    if (!last) return;
    const rows = [];
    let place = 1;
    for (const g of last.ranking) {
      for (const id of g) rows.push(rowOf(r, id, place, d, { pts: m.rounds > 1 ? `+${last.points[id] ?? 0}` : null, best: id === r.meId && r.newBest && m.rounds === 1 }));
      place += g.length;
    }
    ui.band({ title: r.stream.name, sub: m.rounds > 1 ? `Stream ${m.round} of ${m.rounds}` : '', rows, foot: [] });
  }

  function roundBadges(r, m, d) {
    if (!r.meId || r.pilot != null || !m.last) return;
    const first = m.last.ranking[0] ?? [];
    const mine = d?.fin?.[r.meId];
    let place = 1;
    for (const g of m.last.ranking) {
      if (g.includes(r.meId)) break;
      place += g.length;
    }
    const got = settle(r, { finished: finite(mine), place, boats: r.seats.length });
    if (got) setTimeout(() => run === r && ui.ledger(got, audio), 900);
    if (first.includes(r.meId) && finite(mine) && r.seats.length > 1) {
      P().totals.wins++;
      award('first-win');
      store.submit('wins', P().totals.wins);
      const second = m.last.ranking[1]?.[0];
      const ft2 = second ? d.fin[second] : null;
      if (first.length > 1 || (finite(ft2) && ft2 - mine < 0.1)) award('photo-finish');
      store.save();
    }
    if (finite(mine) && r.humans >= 4) award('choir');
  }

  function resultsBand(r, m, d) {
    const st = m.results ?? m.standings;
    const rows = st.map((s) => rowOf(r, s.id, s.place, d, { pts: m.rounds > 1 ? `${s.points}` : null, time: m.rounds > 1 ? null : rowOf(r, s.id, 0, d).time, best: s.id === r.meId && r.newBest && m.rounds === 1 }));
    r.footKey = '';
    ui.band({ title: m.rounds > 1 ? 'The cup' : r.stream.name, sub: '', rows, foot: footFor(r, m) });
    const top = st.slice(0, 3).map((s) => s.id);
    scene.showPodium(top, r.looks);
  }

  function footFor(r, m) {
    if (room.kind !== 'public' && m.isHost) {
      const b = ui.button('oar small amber', 'To the dock', () => net.match.endMatch(), 'Enter');
      primary = () => net.match.endMatch();
      return [b];
    }
    primary = null;
    return [room.kind === 'public' ? 'Back to the dock soon' : 'Waiting for the host'];
  }

  function resultsFoot(r, m) {
    const key = `${room.kind !== 'public' && m.isHost}`;
    if (r.footKey === key) return;
    if (r.footKey) resultsBand(r, m, r.d);
    r.footKey = key;
  }

  // ---------------------------------------------------------------- The Dream

  function dreamStep(r, t, perf) {
    if (r.done || r.paused) return;
    if (r.myFin !== null && t > r.myFin + 1.6) {
      r.done = true;
      dreamDone(r, true);
    } else if (r.myFin === null && t > cap(r.stream)) {
      r.done = true;
      dreamDone(r, false);
    }
    void perf;
  }

  function dreamDone(r, finished) {
    const n = r.n;
    const p = P();
    const racer = r.sim.me;
    const rhythm = racer.judge.rhythm();
    const ft = r.myFin;
    const twisted = r.tonight != null;
    const st = starsOf({ finished, place: r.myPlace, rhythm });
    const prev = p.dream[n] ?? { best: null, stars: [0, 0, 0], lilies: 0 };
    const prevTonight = p.tonight?.day === r.tonight ? p.tonight.best : null;
    const newBest = finished && (twisted ? !prevTonight || ft < prevTonight : !prev.best || ft < prev.best);
    const had = prev.stars.slice();
    const allBlooms = racer.boat.blooms >= r.course.blooms.length && r.course.blooms.length > 0;
    if (r.pilot == null && !twisted) {
      p.dream[n] = { best: newBest ? Math.round(ft * 1000) / 1000 : prev.best, stars: prev.stars.map((v, i) => (v || st[i] ? 1 : 0)), lilies: prev.lilies || allBlooms ? 1 : 0 };
      if (newBest) store.saveGhost(n, r.ghostRec);
      if (STREAMS.every((s) => p.dream[s.n]?.best)) award('dreamer');
      if (starCount(p) >= STREAMS.length * 3) award('life-is-but-a-dream');
      store.save();
    }
    const got = settle(r, { finished, place: r.myPlace, boats: r.seats.length });
    ui.hud(false);
    ui.oarHints(false);
    ui.stamp(0);
    const next = !twisted && n < STREAMS.length && (p.dream[n]?.best || finished) ? n + 1 : null;
    const again = () => (twisted ? startDream(n, { twist: r.twist, tonight: r.tonight }) : startDream(n));
    ui.modal((el) => {
      el.classList.add('done');
      el.append(ui.h('h2', 'display', twisted ? "Tonight's Dream" : r.stream.name));
      if (twisted) el.append(ui.h('div', 'sub', `${r.stream.name} · ${TWIST_NAMES[r.twist]}`));
      else {
        const s3 = ui.h('div', 'stars3');
        st.forEach((on, i) => {
          const e = ui.svgEl(on || had[i] ? ICON.starOn : ICON.starOff, on ? 'on' : '');
          if (on) {
            e.style.animationDelay = `${0.35 + i * 0.35}s`;
            setTimeout(() => audio.fx.star(i, r.stream.tonic), 350 + i * 350);
          }
          s3.append(e);
        });
        el.append(s3);
        const why = ui.h('div', 'why');
        why.append(ui.h('span', '', 'Finish'), ui.h('span', '', 'First'), ui.h('span', '', 'Rhythm 85%'));
        el.append(why);
      }
      el.append(ui.h('div', 'big', finished ? fmt(ft) : 'Out of time'));
      const lines = [];
      if (newBest) lines.push(twisted ? 'Best tonight!' : 'New best!');
      else if (twisted ? prevTonight : prev.best) lines.push(`Best ${fmt(twisted ? prevTonight : prev.best)}`);
      lines.push(`Rhythm ${Math.round(rhythm * 100)}%`);
      el.append(ui.h('div', 'best', lines.join(' · ')));
      if (got) el.append(ui.ledgerEl(got, audio));
      const row2 = ui.h('div', 'plank');
      row2.append(ui.button('oar small', 'Again', again, 'R'));
      if (next) row2.append(ui.button('btn amber', 'Next stream', () => startDream(next)));
      row2.append(
        ui.button('btn ghost', twisted ? 'The dock' : 'The Dream', () => {
          endRun();
          if (twisted) toDock();
          else openChart();
        }),
      );
      el.append(row2);
    });
    primary = again;
    if (flags.autoplay && flags.dream) setTimeout(() => run === r && again(), 4000);
  }

  function pauseDream(on) {
    const r = run;
    if (!r || r.kind !== 'dream' || r.done) return;
    if (on && !r.paused) {
      r.paused = true;
      r.dc.pausedAt = performance.now();
      audio.setMusic(0.05);
      audio.setBeds({ water: 0.3, rapids: 0, whirl: 0, wake: 0 });
      ui.modal((el) => {
        el.append(ui.h('h2', 'display', 'Paused'));
        const row2 = ui.h('div', 'plank');
        row2.append(ui.button('oar small', 'Resume', () => pauseDream(false), 'Esc'));
        row2.append(ui.button('btn', 'Again', () => startDream(r.n)));
        row2.append(ui.button('btn ghost', 'Leave the dream', () => {
          endRun();
          toDock();
        }));
        el.append(row2);
      });
      primary = () => pauseDream(false);
    } else if (!on && r.paused) {
      r.dc.pausedMs += performance.now() - r.dc.pausedAt;
      r.dc.pausedAt = null;
      r.paused = false;
      ui.modal(null);
      primary = null;
      audio.reset();
    }
  }

  function openChart() {
    screen = 'chart';
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    ui.tags([]);
    ui.modal(null);
    applyLobby();
    audio.fx.page();
    const p = P();
    const nodes = STREAMS.map((s) => {
      const d = p.dream[s.n];
      return { n: s.n, name: s.name, stars: d?.stars ?? [0, 0, 0], best: d?.best ? fmt(d.best) : '', locked: s.n > 1 && !p.dream[s.n - 1]?.best, next: false };
    });
    const nxt = nodes.find((nd) => !nd.locked && !p.dream[nd.n]?.best);
    if (nxt) nxt.next = true;
    ui.chart({
      nodes,
      total: starCount(p),
      reached: nodes.filter((nd) => p.dream[nd.n]?.best).length,
      onNode: (nd) => !nd.locked && pickDream(nd.n),
      onBack: () => {
        ui.chart(null);
        toDock();
      },
    });
    primary = nxt ? () => pickDream(nxt.n) : null;
  }

  function pickDream(n) {
    const s = streamByN(n);
    audio.fx.tap();
    const go = () => startDream(n);
    ui.modal((el) => {
      el.append(ui.h('h2', 'display', s.name));
      const best = P().dream[n]?.best;
      el.append(ui.h('div', 'best', best ? `Best ${fmt(best)}` : `Stream ${n} of ${STREAMS.length}`));
      const lb = ui.h('div', 'lb');
      el.append(lb);
      store.top(`stream-${n}`, 3).then((rows) => {
        rows.forEach((e, i) => {
          const name = typeof e?.player?.name === 'string' ? e.player.name : '';
          lb.append(ui.h('span', '', `${i + 1}`), ui.h('span', '', name), ui.h('span', 'tm', finite(e?.score) ? fmt(e.score) : ''));
        });
      });
      const row2 = ui.h('div', 'plank');
      row2.append(ui.button('oar small', 'Row', go, 'Enter'));
      row2.append(ui.button('btn ghost', 'Back', () => {
        ui.modal(null);
        primary = null;
      }));
      el.append(row2);
    });
    primary = go;
  }

  // ---------------------------------------------------------------- the timing test

  const TOCKS = 8;
  const PERIOD = 0.6;

  function openTiming() {
    audio.start();
    screen = 'timing';
    applyLobby();
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    timing = { taps: [], start: null, shown: -1, done: false, value: P().calib, ring: null, ms: null };
    drawTiming();
    setTimeout(() => {
      if (!timing || !audio.running()) return;
      timing.start = audio.now + 0.4;
      for (let k = 0; k < TOCKS; k++) audio.fx.tockAt(timing.start + k * PERIOD, k % 4 === 0);
    }, 500);
  }

  function drawTiming() {
    const tm = timing;
    ui.modal((el) => {
      el.classList.add('tuning');
      el.append(ui.h('h2', 'display', 'Timing'));
      const pad = ui.h('div', 'pad', tm.done ? '' : 'Tap');
      const ring = ui.h('div', 'ring');
      pad.append(ring);
      tm.ring = ring;
      if (!tm.done) {
        el.append(ui.h('div', 'best', 'Tap with the tock'));
        el.append(pad);
      } else {
        el.append(ui.h('div', 'best', tm.taps.length >= 4 ? 'Your timing' : 'Tap along with each tock'));
        const row1 = ui.h('div', 'row');
        const ms = ui.h('div', 'ms', msText(tm.value));
        tm.ms = ms;
        row1.append(ui.button('arrow', '−', () => nudge(-0.005)), ms, ui.button('arrow', '+', () => nudge(0.005)));
        el.append(row1);
        const row2 = ui.h('div', 'plank');
        row2.append(ui.button('oar small', 'Done', timingDone, 'Enter'));
        row2.append(ui.button('btn ghost', 'Again', openTiming));
        el.append(row2);
      }
    });
    primary = tm.done ? timingDone : null;
  }

  const msText = (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 1000)} ms`;

  function nudge(dv) {
    if (!timing) return;
    timing.value = clamp(Math.round((timing.value + dv) * 1000) / 1000, -0.25, 0.25);
    if (timing.ms) timing.ms.textContent = msText(timing.value);
  }

  function timingTap(perf) {
    const tm = timing;
    if (!tm || tm.done || tm.start === null) return;
    const h = audio.heard(perf);
    if (h === null) return;
    const k = Math.round((h - tm.start) / PERIOD);
    if (k < 0 || k >= TOCKS) return;
    const off = h - (tm.start + k * PERIOD);
    if (Math.abs(off) < 0.3) tm.taps.push(off);
  }

  function timingStep(perf) {
    const tm = timing;
    if (!tm || tm.done || tm.start === null) return;
    const h = audio.heard(perf);
    if (h === null) return;
    const k = Math.floor((h - tm.start) / PERIOD + 0.02);
    if (k >= 0 && k < TOCKS && k !== tm.shown && tm.ring) {
      tm.shown = k;
      tm.ring.classList.remove('go');
      void tm.ring.offsetWidth;
      tm.ring.classList.add('go');
    }
    if (h > tm.start + TOCKS * PERIOD + 0.2) {
      tm.done = true;
      if (tm.taps.length >= 4) {
        const s = [...tm.taps].sort((a, b) => a - b);
        tm.value = clamp(Math.round(s[Math.floor(s.length / 2)] * 1000) / 1000, -0.25, 0.25);
      }
      drawTiming();
    }
  }

  function timingDone() {
    if (timing) {
      P().calib = timing.value;
      P().dot = 0;
      store.save();
    }
    timing = null;
    ui.modal(null);
    toDock();
  }

  // ---------------------------------------------------------------- the Dock

  // the Dock's berths, yours first: just right of the middle (the signpost stands on the left), the left edge last
  const DOCK_BERTHS = [3, 4, 2, 5, 1, 0];

  function dockFrame(perf, dt, now) {
    if (screen === 'timing') timingStep(perf);
    const settings = room?.settings ?? {};
    const n = streamForRound(settings.stream ?? 1, 1);
    const stream = streamByN(n);
    const course = courseOf(stream);
    if (dockStream !== n) {
      dockStream = n;
      scene.load(stream, course);
      scene.snapCamera();
      dockSig = '';
    }
    const players = room ? [...room.players.values()].filter((p) => p.connected !== false).slice(0, 6) : [];
    const meFirst = players.sort((a, b) => (a.id === room?.me?.id ? -1 : b.id === room?.me?.id ? 1 : 0));
    const wears = meFirst.map((p) => (p.id === room?.me?.id ? { ...myWear(), ...(shop?.try ?? {}) } : cleanExtras(p.presence)));
    const wearSig = (w) => `${w.hat}.${w.body}.${w.lantern}.${w.wake}.${w.trim}`;
    const isHost = !!room?.isHost;
    const race = Number(settings.race) === 3 ? 3 : 1;
    const watching = !!net?.round && !net.match.me;
    const solo = room?.kind === 'solo';
    const night = nightNow();
    const sig = [n, race, isHost, solo, screen, watching, P().dot, P().xp, P().blooms, night, P().best[n] ?? '', room?.kind, meFirst.map((p, i) => `${p.id}:${p.ready ? 1 : 0}:${wearSig(wears[i])}:${p.name}`).join(','), Object.keys(avatarsSeen(meFirst)).length].join('|');
    if (sig !== dockSig) {
      dockSig = sig;
      dockPlayers = meFirst.map((p, i) => ({ id: p.id, look: playerLook(avatars.get(p.id), i, wears[i]) }));
      scene.setBoats(dockPlayers);
      if ((screen === 'dock' || screen === 'tonight') && !closed) {
        const crewWaiting = room?.kind === 'private' && isHost && players.length > 1;
        const lv = levelOf(P().xp);
        ui.dock(true, {
          level: lv.level,
          into: lv.into,
          need: lv.need,
          blooms: P().blooms,
          onBoathouse: openBoathouse,
          onTonight: openTonight,
          tonightDot: tonightDot(night),
          stream: stream.name,
          race: race === 3 ? 'Cup of three' : 'One stream',
          isHost,
          onStream: (dir) => setSetting('stream', ((n - 1 + dir + STREAMS.length) % STREAMS.length) + 1),
          onRace: () => setSetting('race', race === 3 ? 1 : 3),
          best: P().best[n] ? fmt(P().best[n]) : null,
          dreamDim: crewWaiting,
          onDream: openChart,
          onTiming: openTiming,
          timingDot: !!P().dot,
        });
        if (screen !== 'dock') ui.start(false);
        else if (solo) {
          ui.start(true, 'Race', startSolo);
          primary = startSolo;
        } else {
          ui.start(false);
          primary = null;
        }
      } else if (screen === 'boathouse') {
        ui.start(false);
      } else {
        ui.dock(false);
        ui.start(false);
      }
    }
    // the boats at their berths
    const boats = dockPlayers.map((p, i) => {
      const slot = startSlot(course, DOCK_BERTHS[i], 6);
      const pt = course.point(slot.s, slot.d);
      return { id: p.id, x: pt.x, z: pt.z, h: pt.h, s: slot.s, v: 0, c: 0, k: 0, ls: 0, lq: 0, f: 0, ft: 0 };
    });
    // name tags, ready lanterns, the host's crown (private servers); empty berths invite a friend
    if (screen === 'dock') {
      const tags = boats.map((b, i) => {
        const p = meFirst[i];
        const pr = scene.project(b.x, 2.4, b.z, W, H);
        return { id: b.id, x: pr?.x ?? -999, y: pr?.y ?? -999, name: p.name, me: p.id === room?.me?.id, ready: solo ? null : !!p.ready || (room.kind !== 'public' && p.id === room.host), host: room.kind !== 'public' && room.kind !== 'solo' && p.id === room.host, hidden: !pr };
      });
      ui.tags(tags);
      const invite = room && (room.kind === 'private' || room.kind === 'named');
      const berths = [];
      if (invite) {
        for (let i = boats.length; i < 6; i++) {
          const slot = startSlot(course, DOCK_BERTHS[i], 6);
          const pt = course.point(slot.s, slot.d);
          const pr = scene.project(pt.x, 1.2, pt.z, W, H);
          if (pr) berths.push({ x: pr.x, y: pr.y });
        }
      }
      const bsig = berths.map((b) => `${Math.round(b.x / 4)},${Math.round(b.y / 4)}`).join(';');
      if (bsig !== berthSig) {
        berthSig = bsig;
        ui.berths(berths, () => {
          try {
            ow.ui.showInvite();
          } catch {}
        });
      }
    } else {
      ui.tags([]);
      if (berthSig) {
        berthSig = '';
        ui.berths([]);
      }
    }
    // the menu tune
    if (audio.running() && screen !== 'timing') {
      if (menuAnchor === null || audio.now - menuAnchor > 560) menuAnchor = audio.now + 0.3;
      audio.schedule({ key: `menu:${menuAnchor}`, song: menuSong, anchor: menuAnchor, tonic: stream.tonic, menu: true });
      audio.setBeds({ water: 0.5, rapids: 0, whirl: 0, wake: 0 });
      audio.ambience(0.8);
    }
    const B = audio.running() && menuAnchor !== null ? Math.max(0, (audio.now - menuAnchor) / menuSong.base) : now * 1.2;
    return {
      now,
      dt,
      t: 0,
      B,
      pulse: Math.exp(-(B % 1) * 5) * 0.6,
      boats,
      meId: room?.me?.id,
      focusId: room?.me?.id,
      focusS: course.start - 4,
      focus: boats[0] ? { x: boats[0].x, z: boats[0].z } : null,
      ripples: [],
      oar: null,
      ghost: null,
      calm: 0.6,
      beam: screen === 'boathouse',
      camera: screen === 'boathouse' && boats[0] ? { mode: 'boathouse', portrait: H > W, boat: boats[0] } : { mode: 'dock', portrait: H > W },
      arch: { count: 0, finishLit: 9, sign: '' },
    };
  }

  function avatarsSeen(players) {
    const o = {};
    for (const p of players) if (avatars.get(p.id)) o[p.id] = 1;
    return o;
  }

  function setSetting(id, v) {
    audio.fx.tap();
    try {
      room.setSetting(id, v);
    } catch {}
  }


  // ---------------------------------------------------------------- the Boathouse

  const SHOP_TABS = [
    { id: 'body', label: 'Boat', names: BODY_NAMES },
    { id: 'hat', label: 'Hat', names: HAT_NAMES },
    { id: 'lantern', label: 'Lanterns', names: LANTERN_NAMES, colors: LANTERN_COLORS },
    { id: 'wake', label: 'Wake', names: WAKE_NAMES },
    { id: 'trim', label: 'Trim', names: TRIM_NAMES, colors: TRIM_COLORS },
  ];

  function openBoathouse() {
    audio.fx.tap();
    screen = 'boathouse';
    shop = { tab: 'body', try: null };
    ui.dock(false);
    ui.start(false);
    ui.berths([]);
    ui.tags([]);
    dockSig = '';
    applyLobby();
    showShop();
    primary = closeBoathouse;
  }

  function closeBoathouse() {
    audio.fx.tap();
    shop = null;
    ui.boathouse(null);
    screen = 'dock';
    dockSig = '';
    applyLobby();
    primary = null;
  }

  function showShop() {
    if (!shop) return;
    const p = P();
    const tab = SHOP_TABS.find((t) => t.id === shop.tab) ?? SHOP_TABS[0];
    const cost = (id) => (KINDS[tab.id].free.includes(id) ? -1 : levelFor(tab.id, id) * 20 || priceOf(tab.id, id) || 0);
    const items = [...KINDS[tab.id].list].sort((a, b) => cost(a) - cost(b)).map((id) => {
      const own = owns(p, tab.id, id);
      const on = (shop.try?.[tab.id] ?? p.equip[tab.id]) === id;
      return { id, name: tab.names[id] ?? id, own, on, worn: p.equip[tab.id] === id, price: own ? null : priceOf(tab.id, id), level: own ? 0 : levelFor(tab.id, id), swatch: tab.colors?.[id] ?? null };
    });
    const tried = shop.try?.[tab.id];
    let action = null;
    if (tried && !owns(p, tab.id, tried)) {
      const price = priceOf(tab.id, tried);
      const lv = levelFor(tab.id, tried);
      action = price !== null ? { label: `Buy · ${price}`, bloom: true, enabled: p.blooms >= price, onClick: () => buyTried(tab.id, tried) } : { label: `Level ${lv}`, enabled: false };
    }
    const lv = levelOf(p.xp);
    ui.boathouse({
      tabs: SHOP_TABS.map((t) => ({ id: t.id, label: t.label })),
      tab: tab.id,
      items,
      blooms: p.blooms,
      level: lv.level,
      action,
      onTab: (id) => {
        audio.fx.tap();
        shop.tab = id;
        showShop();
      },
      onItem: (id) => pickItem(tab.id, id),
      onClose: closeBoathouse,
    });
  }

  function pickItem(kind, id) {
    const p = P();
    audio.fx.tap();
    if (owns(p, kind, id)) {
      Object.assign(p, equip(p, kind, id));
      if (shop.try) delete shop.try[kind];
      store.save();
      lobbyPresence();
    } else shop.try = { ...(shop.try ?? {}), [kind]: id };
    dockSig = '';
    showShop();
  }

  function buyTried(kind, id) {
    const p = P();
    const next = buy(p, kind, id);
    if (!next) return;
    Object.assign(p, equip(next, kind, id));
    delete shop.try[kind];
    audio.fx.buy?.();
    store.save();
    lobbyPresence();
    dockSig = '';
    showShop();
  }

  // ---------------------------------------------------------------- Tonight's Dream, the wishes, the moon

  function tonightDot(day) {
    const p = P();
    const rowed = p.tonight?.day === day && p.tonight.runs > 0;
    const paid = p.night?.day === day ? p.night.paid.filter(Boolean).length : 0;
    return !rowed || paid < 3;
  }

  /** Everyone's moonblooms tonight (shared), fetched when the card opens. */
  let everyone = { day: -1, blooms: null, runs: [] };
  function fetchEveryone(day) {
    const g = ow.data?.game;
    if (!g) return;
    try {
      const a = g.get?.('tonight-blooms');
      if (a?.then) a.then((v) => {
        if (finite(v)) everyone = { ...everyone, day, blooms: v };
        if (screen === 'tonight') showTonight();
      }).catch(() => {});
      const b = g.get?.('tonight-runs');
      if (b?.then) b.then((list) => {
        everyone = { ...everyone, day, runs: tonightBoard(list, day) };
        if (screen === 'tonight') showTonight();
      }).catch(() => {});
    } catch {}
  }

  /** Tonight's best times from the shared list: [{ name, t }], best first, one per player. */
  function tonightBoard(list, day) {
    if (!Array.isArray(list)) return [];
    const best = new Map();
    for (const it of list) {
      const v = it?.value;
      if (!v || v.d !== day || !finite(v.t) || v.t < 20 || v.t > 600) continue;
      const id = it.by?.id;
      const name = typeof it.by?.name === 'string' ? it.by.name.slice(0, 24) : '';
      if (!id || !name) continue;
      if (!best.has(id) || best.get(id).t > v.t) best.set(id, { name, t: v.t });
    }
    return [...best.values()].sort((a, b) => a.t - b.t).slice(0, 3);
  }

  function openTonight() {
    audio.fx.tap();
    screen = 'tonight';
    ui.start(false);
    fetchEveryone(nightNow());
    showTonight();
    primary = () => startTonight();
  }

  function closeTonight() {
    ui.modal(null);
    screen = 'dock';
    dockSig = '';
    primary = null;
  }

  function showTonight() {
    const day = nightNow();
    const t = tonightOf(day);
    const st = streamByN(t.n);
    const p = P();
    const mine = p.tonight?.day === day ? p.tonight : null;
    const wishes = wishesOf(day);
    const night = p.night?.day === day ? p.night : null;
    const moon = moonShown(p.moon, day);
    ui.tonight({
      stream: st.name,
      twist: TWIST_NAMES[t.twist],
      twistLine: TWIST_LINES[t.twist],
      best: mine?.best ? fmt(mine.best) : null,
      everyone: everyone.day === day ? everyone.blooms : null,
      board: everyone.day === day ? everyone.runs.map((x) => ({ name: x.name, time: fmt(x.t) })) : [],
      wishes: wishes.map((w, i) => ({ label: wishLabel(w), got: night ? night.got[i] : 0, n: w.n, done: !!night?.paid[i] })),
      moon: { lit: moon.lit, tonight: moon.tonight, of: MOON },
      onRow: () => startTonight(),
      onClose: closeTonight,
    });
  }

  function startTonight() {
    const day = nightNow();
    const t = tonightOf(day);
    startDream(t.n, { twist: t.twist, tonight: day });
  }

  // ---------------------------------------------------------------- what a race pays

  /** A run is over for this player: pay XP and blooms, count the wishes and the night. Once a run. */
  function settle(r, o) {
    if (r.settled || r.pilot != null || !r.meId || !r.sim.me || r.kind === 'attract') return null;
    r.settled = true;
    const p = P();
    const day = nightNow();
    const js = r.sim.me.judge.state;
    const b = r.sim.me.boat;
    const won = o.finished && o.place === 1 && o.boats >= 2;
    const stats = { perfect: js.perfect ?? 0, pull: js.pulls ?? 0, bloom: b.blooms ?? 0, shave: b.shaves ?? 0, rush: js.rushes ?? 0, race: o.finished ? 1 : 0, win: won ? 1 : 0, clean: o.finished && r.bumps === 0 ? 1 : 0, tonight: r.tonight != null && o.finished ? 1 : 0 };
    const night = rowNight(p.moon, day);
    const tonightFirst = r.tonight === day && o.finished && !(p.tonight?.day === day && p.tonight.best);
    const pay = racePay({ ...o, score: r.score.state.total, blooms: b.blooms ?? 0, firstOfNight: night.first, tonight: tonightFirst });
    const wish = wishProgress(p.night, day, stats);
    const before = { xp: p.xp, blooms: p.blooms };
    const res = payInto(p, pay.xp + wish.xp, pay.blooms + wish.blooms + night.blooms);
    Object.assign(p, res.p);
    p.night = wish.night;
    p.moon = night.moon;
    p.totals.pulls += stats.pull;
    p.totals.rushes += stats.rush;
    p.totals.blooms += stats.bloom;
    p.totals.shaves += stats.shave;
    if (r.tonight === day) {
      const tn = p.tonight?.day === day ? { ...p.tonight } : { day, best: null, score: 0, runs: 0 };
      tn.runs++;
      if (o.finished && (!tn.best || r.myFin < tn.best)) tn.best = Math.round(r.myFin * 1000) / 1000;
      tn.score = Math.max(tn.score, Math.round(r.score.state.total));
      p.tonight = tn;
      try {
        if (stats.bloom > 0) ow.data?.game?.add?.('tonight-blooms', Math.min(120, stats.bloom))?.catch?.(() => {});
        if (o.finished && finite(r.myFin)) ow.data?.game?.push?.('tonight-runs', { d: day, t: Math.round(r.myFin * 100) / 100 })?.catch?.(() => {});
      } catch {}
    }
    if (levelOf(p.xp).level >= 10) award('level-10');
    if (night.full) award('full-moon');
    if (wish.night.all) award('three-wishes');
    store.submit('moonblooms', p.totals.blooms);
    store.save();
    lobbyPresence();
    return {
      xp0: before.xp,
      xp1: p.xp,
      blooms0: before.blooms,
      blooms1: p.blooms,
      parts: [...pay.parts, ...wish.done.map((i) => ({ label: wishLabel(wishesOf(day)[i]), xp: 100, wish: true }))],
      night: night.first ? { n: night.moon.n, blooms: night.blooms, full: night.full } : null,
      rewards: res.rewards.map((rw) => ({ level: rw.level, label: rewardLabel(rw) })),
      score: Math.round(r.score.state.total),
    };
  }

  function rewardLabel(rw) {
    if (rw.kind === 'blooms') return `${rw.n} moonblooms`;
    const names = { body: BODY_NAMES, hat: HAT_NAMES, lantern: LANTERN_NAMES, wake: WAKE_NAMES, trim: TRIM_NAMES }[rw.kind] ?? {};
    const what = { body: '', hat: '', lantern: ' lanterns', wake: ' wake', trim: ' trim' }[rw.kind] ?? '';
    return `${names[rw.id] ?? rw.id}${what}`;
  }

  function startSolo() {
    audio.start();
    audio.fx.tap();
    try {
      room.startMatch();
    } catch {}
  }

  // ---------------------------------------------------------------- input

  function stampOf(e) {
    const now = performance.now();
    const ts = e.timeStamp;
    return finite(ts) && ts > 0 && ts <= now + 5 && now - ts < 500 ? ts : now;
  }

  function onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    const perf = stampOf(e);
    const left = k === 'a' || k === 'A' || k === 'ArrowLeft' || k === 'j' || k === 'J';
    const right = k === 'd' || k === 'D' || k === 'ArrowRight' || k === 'k' || k === 'K';
    // both oars at once (a pull on a gold beat): Space, W / S, the up and down arrows
    const both = k === 'w' || k === 'W' || k === 's' || k === 'S' || k === 'ArrowUp' || k === 'ArrowDown' || (k === ' ' && racingNow());
    if (both && screen !== 'timing' && racingNow()) {
      stroke(-1, perf);
      stroke(1, perf + 1);
      e.preventDefault();
      return;
    }
    if (left || right) {
      if (screen === 'timing') timingTap(perf);
      else stroke(left ? -1 : 1, perf);
      e.preventDefault();
      return;
    }
    if (k === ' ' || k === 'Enter') {
      if (screen === 'timing' && timing && !timing.done) {
        timingTap(perf);
        e.preventDefault();
        return;
      }
      if (primary) {
        e.preventDefault();
        audio.start();
        primary();
      }
      return;
    }
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (run?.kind === 'dream') pauseDream(!run.paused);
      return;
    }
    if ((k === 'r' || k === 'R') && run?.kind === 'dream') startDream(run.n);
  }

  /** Is the player rowing a race right now (so Space rows instead of pressing a button)? */
  function racingNow() {
    const r = run;
    if (!r || r.kind === 'attract' || r.paused || !r.sim?.me || r.myFin !== null || r.pilot != null) return false;
    return r.kind !== 'room' || net.match.phase === 'round';
  }

  function onPointer(e) {
    if (e.button > 0) return;
    const perf = stampOf(e);
    if (screen === 'timing') {
      audio.start();
      timingTap(perf);
      return;
    }
    if (run && run.kind !== 'attract') {
      stroke(e.clientX < W / 2 ? -1 : 1, perf);
      return;
    }
    if (screen !== 'title') audio.start();
  }

  // ---------------------------------------------------------------- autoplay (local copies only: shots and the trailer)

  function autoplayStep(perf) {
    if (closed || !room) return;
    if (screen === 'title' && !run) {
      if (flags.autoplayTo === 'title') return;
      if (perf - loadPerf > 1500) row();
      return;
    }
    if (flags.autoplayTo === 'lobby') return;
    if (flags.dream && !ap.dreamed && screen === 'dock' && !run) {
      ap.dreamed = true;
      startDream(flags.dream);
      return;
    }
    if (screen !== 'dock' || run || net.match.phase !== 'lobby' || perf - ap.at < 1200) return;
    ap.at = perf;
    if (room.isHost && flags.stream && Number(room.settings?.stream) !== flags.stream) return room.setSetting('stream', flags.stream);
    if (room.isHost && flags.race && Number(room.settings?.race) !== flags.race) return room.setSetting('race', flags.race);
    if (room.kind === 'solo' || (room.isHost && room.kind !== 'public' && room.canStart)) room.startMatch();
    else room.setReady(true);
  }

  // ---------------------------------------------------------------- setup

  return {
    attach,
    start() {
      showTitle();
      addEventListener('keydown', onKey);
      addEventListener('pointerdown', onPointer);
    },
    frame,
    resize(w, h) {
      W = w;
      H = h;
      dockSig = '';
      applyInsets();
    },
    setReserved(areas) {
      reserved = Array.isArray(areas) ? areas : null;
      applyInsets();
    },
    pause() {
      if (run?.kind === 'dream') pauseDream(true);
    },
    /** The room could not be joined. */
    lost() {
      onClose('disconnected');
    },
    get screen() {
      return screen;
    },
  };
}
