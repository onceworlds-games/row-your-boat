// A room server in memory, like the platform's, for tests: pages join it, the first connected page hosts, a public-style
// room starts its match once everyone is ready.

import { SETTINGS } from '../src/net.js';

/**
 * A server that keeps one room in memory, like the platform does: pages join it, the first connected page hosts, a
 * public-style room starts its match once everyone is ready. now(): milliseconds.
 */
export function createLocalServer({ now = () => Date.now(), kind = 'solo', settings = SETTINGS } = {}) {
  const pages = new Map();
  const state = {};
  const defaults = Object.fromEntries(settings.map((s) => [s.id, s.default]));
  const srv = {
    state,
    players: new Map(),
    host: null,
    settings: { ...defaults },
    match: { phase: 'lobby', n: 0, id: '', seed: 0, participants: [] },
    clockAt: 0, // match ms when the clock last stood
    since: null, // now() when it started running
    paused: false,
    pages,
  };
  let seq = 0;
  const matchNow = () => (srv.match.phase !== 'playing' ? 0 : srv.since === null ? srv.clockAt : srv.clockAt + (now() - srv.since));
  const emitAll = (ev, ...args) => {
    for (const p of pages.values()) p._emit(ev, ...args);
  };
  const emitOthers = (from, ev, ...args) => {
    for (const p of pages.values()) if (p.me.id !== from) p._emit(ev, ...args);
  };
  function pickHost() {
    const prev = srv.host;
    const online = [...srv.players.values()].filter((p) => p.connected);
    if (prev && srv.players.get(prev)?.connected) return;
    const parts = online.filter((p) => srv.match.participants.includes(p.id));
    srv.host = (parts[0] ?? online[0])?.id ?? null;
    if (srv.host !== prev && srv.host) emitAll('host', srv.host);
  }
  function setMatch(m) {
    const prev = srv.match;
    srv.match = m;
    emitAll('match', m, prev);
  }
  function maybeStart() {
    if (srv.match.phase !== 'lobby') return;
    const online = [...srv.players.values()].filter((p) => p.connected);
    if (online.length === 0 || !online.every((p) => p.ready)) return;
    startMatch();
  }
  function startMatch() {
    const online = [...srv.players.values()].filter((p) => p.connected);
    seq++;
    srv.clockAt = 0;
    srv.since = now();
    const m = { phase: 'playing', n: seq, id: `m${seq}x${Math.floor(now()) % 100000}`, seed: (seq * 7919 + 13) % 2147483647, participants: online.map((p) => p.id), startedAt: now(), paused: false };
    for (const p of srv.players.values()) p.ready = false;
    setMatch(m);
    emitAll('matchstart', m);
  }
  function endMatch() {
    if (srv.match.phase === 'lobby') return;
    const prev = srv.match;
    srv.since = null;
    srv.match = { phase: 'lobby', n: prev.n, id: '', seed: 0, participants: [] };
    for (const p of srv.players.values()) p.ready = false;
    emitAll('match', srv.match, prev);
    emitAll('matchend', srv.match, prev);
  }

  srv.matchNow = matchNow;
  /** A page joins (or comes back as the same id). */
  srv.join = (id, name = 'You') => {
    const handlers = new Map();
    let player = srv.players.get(id);
    const back = !!player;
    if (!player) {
      player = { id, name, presence: null, connected: true, ready: false, idle: false, team: 0 };
      srv.players.set(id, player);
    } else player.connected = true;
    const priv = (srv.priv ??= new Map());
    if (!priv.has(id)) priv.set(id, {});
    const room = {
      id: 'local',
      kind,
      ranked: false,
      get me() {
        return player;
      },
      players: srv.players,
      state,
      get host() {
        return srv.host;
      },
      get isHost() {
        return srv.host === id && player.connected;
      },
      get connected() {
        return player.connected;
      },
      closed: false,
      get match() {
        return srv.match;
      },
      get running() {
        return srv.match.phase === 'playing' && !srv.paused;
      },
      get participants() {
        return srv.match.phase === 'playing' ? srv.match.participants : [];
      },
      get spectating() {
        return srv.match.phase === 'playing' && !srv.match.participants.includes(id);
      },
      get spectators() {
        return srv.match.phase === 'playing' ? [...srv.players.values()].filter((p) => p.connected && !srv.match.participants.includes(p.id)) : [];
      },
      get settings() {
        return srv.settings;
      },
      get online() {
        return [...srv.players.values()].filter((p) => p.connected);
      },
      get canStart() {
        return room.online.every((p) => p.id === srv.host || p.ready);
      },
      get notReady() {
        return room.online.filter((p) => p.id !== srv.host && !p.ready);
      },
      get allReady() {
        return room.notReady.length === 0;
      },
      get private() {
        return priv.get(id);
      },
      isParticipant: (pid) => srv.match.phase === 'playing' && srv.match.participants.includes(pid),
      matchNow,
      on(ev, fn) {
        if (!handlers.has(ev)) handlers.set(ev, new Set());
        handlers.get(ev).add(fn);
        return () => handlers.get(ev)?.delete(fn);
      },
      _emit(ev, ...args) {
        for (const fn of [...(handlers.get(ev) ?? [])]) {
          try {
            fn(...args);
          } catch (err) {
            console.error(err);
          }
        }
      },
      send(data, opts = {}) {
        const at = now();
        const mt = room.running ? matchNow() : undefined;
        const msg = JSON.parse(JSON.stringify(data));
        for (const p of pages.values()) {
          if (p.me.id === id) continue;
          if (opts.to && p.me.id !== opts.to) continue;
          p._emit('message', msg, player, at, mt);
        }
      },
      setState(k, v) {
        if (k.startsWith('host:') && !room.isHost) return;
        const val = v === null ? undefined : JSON.parse(JSON.stringify(v));
        if (val === undefined) delete state[k];
        else state[k] = val;
        emitOthers(id, 'state', k, val ?? null, id);
      },
      setPresence(p) {
        player.presence = JSON.parse(JSON.stringify(p));
        emitOthers(id, 'presence', player);
      },
      presenceAt(pid) {
        return srv.players.get(pid)?.presence ?? null;
      },
      setReady(on) {
        player.ready = !!on;
        emitOthers(id, 'ready', player);
        if (kind !== 'private') maybeStart();
      },
      clearReady() {},
      startMatch() {
        if (srv.match.phase !== 'lobby') return;
        if (!room.isHost || !room.canStart) return;
        startMatch();
      },
      endMatch() {
        if (!room.isHost) return;
        endMatch();
      },
      pauseMatch() {},
      admit(ids) {
        if (!room.isHost || srv.match.phase !== 'playing') return;
        const add = ids.filter((x) => !srv.match.participants.includes(x));
        if (!add.length) return;
        setMatch({ ...srv.match, participants: [...srv.match.participants, ...add] });
      },
      setOpen() {},
      reportResult() {},
      setPrivate(k, v) {
        priv.get(id)[k] = v;
      },
      setSetting(k, v) {
        if (!room.isHost || srv.match.phase !== 'lobby') return;
        srv.settings = { ...srv.settings, [k]: v };
        emitAll('settings', srv.settings);
      },
      hideLobby() {},
      leave() {
        srv.drop(id, true);
      },
    };
    pages.set(id, room);
    if (back) emitOthers(id, 'back', player, true);
    else emitOthers(id, 'join', player);
    pickHost();
    return room;
  };
  /** A page goes away: `gone` for good (a leave), else its seat is held (away). */
  srv.drop = (id, gone = false) => {
    const p = srv.players.get(id);
    if (!p) return;
    pages.delete(id);
    p.connected = false;
    if (gone) {
      srv.players.delete(id);
      emitAll('leave', p, false);
    } else emitAll('away', p);
    pickHost();
  };
  return srv;
}
