// Every screen's type and buttons, as DOM over the 3D world. Player names are only ever set with textContent.

import { ICON, symbolSvg, moonPhase } from './icons.js';
import { clock, ordinal } from '../sim/race.js';

function h(tag, cls = '', text = null) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== null && text !== undefined) e.textContent = String(text);
  return e;
}
function svgEl(markup, cls = '') {
  const w = document.createElement('span');
  if (cls) w.className = cls;
  w.innerHTML = markup; // static icon markup only
  return w;
}
function button(cls, label, onClick, key = null) {
  const b = h('button', `${cls} hit`);
  b.type = 'button';
  if (label instanceof Node) b.append(label);
  else if (label !== null) b.append(document.createTextNode(label));
  if (key) b.append(h('span', 'key', key));
  b.addEventListener('pointerdown', (e) => e.stopPropagation());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick?.(e);
  });
  return b;
}
function placeText(el, n) {
  el.textContent = '';
  el.append(document.createTextNode(String(n)));
  const sup = h('sup', '', ordinal(n));
  el.append(sup);
}

export function createUI(root, tagRoot) {
  const layers = {};
  const layer = (name) => {
    if (!layers[name]) {
      const e = h('div', `layer layer-${name}`);
      e.style.position = 'absolute';
      e.style.inset = '0';
      root.append(e);
      layers[name] = e;
    }
    return layers[name];
  };
  const clear = (name) => {
    if (layers[name]) layers[name].textContent = '';
  };
  let insets = { top: 0, left: 0, right: 0, bottom: 0, menu: null };

  const ui = {
    h,
    button,
    setInsets(v) {
      insets = v;
      document.documentElement.style.setProperty('--safe-top', `${Math.max(0, v.top)}px`);
      document.documentElement.style.setProperty('--safe-bottom', `${Math.max(0, v.bottom)}px`);
    },
    get insets() {
      return insets;
    },
    clear,

    // ------------------------------------------------------------ title
    title(show, { stars = 0, onRow } = {}) {
      clear('title');
      if (!show) return null;
      const L = layer('title');
      const box = h('div', 'title');
      const h1 = h('h1', 'display outlined');
      h1.append(h('span', '', 'Row Your'), h('span', '', 'Boat'));
      const reflect = h('div', 'reflect display');
      reflect.append(h('div', '', 'Boat'));
      reflect.setAttribute('aria-hidden', 'true');
      // without onRow (the world still loading) the title shows without its button
      const row = onRow ? button('oar', 'Row', onRow, 'Space') : null;
      box.append(h1, reflect);
      if (row) box.append(row);
      if (stars > 0) {
        const s = h('div', 'stars outlined');
        s.append(svgEl(ICON.starOn, 'inl'), document.createTextNode(` ${stars}`));
        s.querySelector('svg').style.cssText = 'width:20px;height:20px;vertical-align:-3px';
        box.append(s);
      }
      L.append(box);
      return { row };
    },

    // ------------------------------------------------------------ the dock
    dock(show, m = {}) {
      clear('dock');
      if (!show) return;
      const L = layer('dock');
      if (m.watching) {
        L.append(h('div', 'watching display outlined', 'Watching · next race soon'));
      }
      const post = h('div', 'signpost');
      const sign = h('div', 'sign');
      for (const [x, y] of [[8, 8], [282, 8]]) {
        const n = h('span', 'nail');
        n.style.left = `${x}px`;
        n.style.top = `${y}px`;
        sign.append(n);
      }
      const r1 = h('div', 'row');
      const v1 = h('div', 'val', m.stream);
      if (m.isHost) r1.append(button('arrow', '‹', () => m.onStream?.(-1)), v1, button('arrow', '›', () => m.onStream?.(1)));
      else r1.append(v1);
      const r2 = h('div', 'row');
      const v2 = h('div', 'val', m.race);
      if (m.isHost) r2.append(button('arrow', '‹', () => m.onRace?.()), v2, button('arrow', '›', () => m.onRace?.()));
      else r2.append(v2);
      sign.append(r1, r2);
      if (m.best) sign.append(h('div', 'best', `Best ${m.best}`));
      post.append(sign);
      if (m.hat) {
        const hs = h('div', 'sign hatsign');
        const r = h('div', 'row');
        r.append(button('arrow', '‹', () => m.onHat?.(-1)), h('div', 'val', m.hat), button('arrow', '›', () => m.onHat?.(1)));
        hs.append(r);
        post.append(hs);
      }
      post.append(h('div', 'post'));
      L.append(post);
      const btns = h('div', 'dockbtns');
      btns.style.right = `${14 + (insets.right || 0)}px`;
      const moon = button(`disc${m.dreamDim ? ' dim' : ''}`, svgEl(ICON.moon), m.onDream);
      moon.setAttribute('aria-label', 'The Dream');
      moon.append(h('span', 'lab', m.dreamDim ? 'Crew waiting' : 'Dream'));
      const fork = button('disc', svgEl(ICON.fork), m.onTiming);
      fork.setAttribute('aria-label', 'Timing');
      fork.append(h('span', 'lab', 'Timing'));
      if (m.timingDot) fork.append(h('span', 'dot'));
      btns.append(fork, moon);
      L.append(btns);
    },

    // ------------------------------------------------------------ name tags (projected every frame)
    tags(list) {
      const seen = new Set();
      for (const t of list) {
        seen.add(t.id);
        let e = tagRoot.querySelector(`[data-id="${CSS.escape(t.id)}"]`);
        const key = `${t.name}|${t.me}|${t.ready}|${t.host}|${t.zz}|${t.small}|${t.symbol}|${t.color}|${t.watch}`;
        if (!e) {
          e = h('div', 'tag');
          e.dataset.id = t.id;
          tagRoot.append(e);
        }
        if (e.dataset.key !== key) {
          e.dataset.key = key;
          e.className = `tag${t.me ? ' me' : ''}${t.small ? ' small' : ''}`;
          e.textContent = '';
          if (t.symbol) e.append(svgEl(symbolSvg(t.symbol, t.color)));
          if (t.host) e.append(svgEl(ICON.crown));
          e.append(h('span', '', t.name));
          if (t.zz) e.append(h('span', 'zz', 'zZ'));
          if (t.ready !== undefined && t.ready !== null) e.append(svgEl(t.ready ? ICON.readyOn : ICON.readyOff));
        }
        e.style.left = `${t.x}px`;
        e.style.top = `${t.y}px`;
        e.style.display = t.hidden ? 'none' : '';
      }
      for (const e of [...tagRoot.children]) if (!seen.has(e.dataset.id)) e.remove();
    },

    berths(list, onInvite) {
      clear('berths');
      if (!list.length) return;
      const L = layer('berths');
      for (const b of list) {
        const e = button('berth', svgEl(ICON.plus), onInvite);
        e.setAttribute('aria-label', 'Invite a friend');
        e.style.left = `${b.x}px`;
        e.style.top = `${b.y}px`;
        L.append(e);
      }
    },

    // ------------------------------------------------------------ the race HUD
    hud(show, d = {}) {
      if (!show) {
        clear('hud');
        ui._hud = null;
        return;
      }
      const L = layer('hud');
      let H = ui._hud;
      if (!H) {
        L.textContent = '';
        const box = h('div', 'hud');
        const place = h('div', 'place');
        const n = h('div', 'n display outlined');
        const t = h('div', 't outlined');
        const gap = h('div', 'gap outlined');
        place.append(n, t, gap);
        const prog = h('div', 'progress');
        prog.append(h('div', 'line'), h('div', 'arch'));
        // the score, the bow lanterns lit and the moonblooms taken
        const tally = h('div', 'tally');
        const pts = h('div', 'pts display outlined', '0');
        const row2 = h('div', 'row2');
        const lans = h('span', 'lans');
        for (let i = 0; i < 4; i++) lans.append(svgEl(ICON.lantern, 'l'));
        const blm = h('span', 'blms outlined');
        const blmN = h('span', 'n', '0');
        blm.append(svgEl(ICON.bloom, 'ic'), blmN);
        row2.append(lans, blm);
        tally.append(pts, row2);
        box.append(place, prog, tally);
        let pause = null;
        if (d.onPause) {
          pause = button('disc pausebtn', svgEl(ICON.pause), d.onPause);
          pause.setAttribute('aria-label', 'Pause');
          box.append(pause);
        }
        L.append(box);
        H = ui._hud = { box, place, n, t, gap, prog, pause, tally, pts, lans, blm, blmN, marks: new Map(), shown: { place: 0, time: '', gap: '', pts: 0, lvl: 0, blm: 0 } };
      }
      H.tally.style.left = `${16 + (insets.left || 0)}px`;
      H.tally.hidden = !d.tally;
      if (d.tally) {
        const sc = Math.round(d.tally.score ?? 0);
        if (sc !== H.shown.pts) {
          // count up towards the score rather than jumping
          const step = Math.max(1, Math.ceil(Math.abs(sc - H.shown.pts) * 0.18));
          H.shown.pts += Math.sign(sc - H.shown.pts) * Math.min(step, Math.abs(sc - H.shown.pts));
          H.pts.textContent = H.shown.pts.toLocaleString('en-US');
        }
        const lvl = d.tally.level ?? 1;
        if (lvl !== H.shown.lvl) {
          [...H.lans.children].forEach((e, i) => {
            const on = i < lvl;
            const was = e.classList.contains('on');
            e.classList.toggle('on', on);
            if (on && !was && H.shown.lvl) {
              e.classList.remove('pop');
              void e.offsetWidth;
              e.classList.add('pop');
            }
          });
          H.lans.classList.toggle('full', lvl >= 4);
          H.shown.lvl = lvl;
        }
        const bn = d.tally.blooms ?? 0;
        if (bn !== H.shown.blm) {
          H.shown.blm = bn;
          H.blmN.textContent = String(bn);
        }
      }
      const right = 18 + (insets.right || 0);
      if (H.pause) {
        H.pause.style.right = `${right}px`;
        H.place.style.right = `${right + 66}px`;
      } else H.place.style.right = `${right}px`;
      if (d.place && d.place !== H.shown.place) {
        const better = H.shown.place && d.place < H.shown.place;
        H.shown.place = d.place;
        placeText(H.n, d.place);
        if (better) {
          H.n.classList.remove('bump');
          void H.n.offsetWidth;
          H.n.classList.add('bump');
        }
      }
      if (!d.place) {
        H.n.textContent = '';
        H.shown.place = 0;
      }
      if (d.time !== H.shown.time) {
        H.shown.time = d.time;
        H.t.textContent = d.time;
      }
      const gapText = d.gap ?? '';
      if (gapText !== H.shown.gap) {
        H.shown.gap = gapText;
        H.gap.textContent = gapText;
        H.gap.className = `gap outlined${d.gapAhead ? ' ahead' : gapText ? ' behind' : ''}`;
      }
      // the little river of boats
      const seen = new Set();
      for (const m of d.progress ?? []) {
        seen.add(m.id);
        let e = H.marks.get(m.id);
        if (!e) {
          e = svgEl(symbolSvg(m.symbol, m.color, ''), `mark${m.me ? ' me' : ''}`);
          H.prog.append(e);
          H.marks.set(m.id, e);
        }
        e.style.bottom = `${Math.max(0, Math.min(1, m.f)) * 100}%`;
        e.style.opacity = m.dim ? '0.45' : '1';
      }
      for (const [id, e] of H.marks) {
        if (!seen.has(id)) {
          e.remove();
          H.marks.delete(id);
        }
      }
    },

    hint(text) {
      const L = layer('hint');
      if (!text) {
        L.textContent = '';
        ui._hint = '';
        return;
      }
      if (ui._hint === text) return;
      ui._hint = text;
      L.textContent = '';
      L.append(h('div', 'hint go display outlined', text));
    },

    judge(kind, x, y) {
      const L = layer('judge');
      const words = { perfect: 'perfect', good: 'good', splash: 'splash', miss: 'miss', both: 'both oars', pull: 'pull!', shave: 'close shave' };
      const e = h('div', `judge outlined ${kind}`, words[kind] ?? kind);
      e.style.left = `${x}px`;
      e.style.top = `${y}px`;
      L.append(e);
      setTimeout(() => e.remove(), 600);
      while (L.children.length > 6) L.firstChild.remove();
    },

    /** The merrily bar rowed clean: twelve notes. */
    rush() {
      const L = layer('merrily');
      L.textContent = '';
      const e = h('div', 'merrily display outlined', 'Merrily!');
      L.append(e);
      setTimeout(() => e.remove(), 1300);
    },

    /** A moonbloom taken: the count in the tally bobs. */
    blooms(n) {
      const H = ui._hud;
      if (!H) return;
      H.shown.blm = n;
      H.blmN.textContent = String(n);
      H.blm.classList.remove('pop');
      void H.blm.offsetWidth;
      H.blm.classList.add('pop');
    },

    streamName(name, sub) {
      const L = layer('streamname');
      L.textContent = '';
      if (!name) return;
      const e = h('div', 'streamname');
      e.append(h('div', 'nm display outlined', name));
      if (sub) e.append(h('div', 'of outlined', sub));
      L.append(e);
      setTimeout(() => e.remove(), 3900);
    },

    stamp(place) {
      const L = layer('stamp');
      L.textContent = '';
      if (!place) return;
      const e = h('div', `stamp display outlined${place === 1 ? ' first' : ''}`);
      placeText(e, place);
      L.append(e);
    },

    tapToRow(show) {
      const L = layer('tap');
      if (!show) {
        L.textContent = '';
        return;
      }
      if (L.firstChild) return;
      L.append(h('div', 'tapgo display outlined', 'Tap to row'));
    },

    oarHints(show, glowSide = 0) {
      const L = layer('oars');
      if (!show) {
        L.textContent = '';
        ui._oars = null;
        return;
      }
      if (!ui._oars) {
        const l = svgEl(ICON.blade, 'oarhint l');
        const r = svgEl(ICON.blade, 'oarhint r');
        L.append(l, r);
        ui._oars = { l, r };
      }
      ui._oars.l.classList.toggle('glow', glowSide < 0);
      ui._oars.r.classList.toggle('glow', glowSide > 0);
    },
    dipOar(side) {
      const o = ui._oars;
      if (!o) return;
      const e = side < 0 ? o.l : o.r;
      e.classList.add('dip');
      setTimeout(() => e.classList.remove('dip'), 110);
    },

    // ------------------------------------------------------------ bands
    /**
     * A ranking band. d: { title, sub, rows: [{ id, place, name, me, time, pts, total, avatar, best, symbol, color,
     * rhythm }], foot: [buttons/text], top (true: at the top) }
     */
    band(d) {
      clear('band');
      if (!d) return;
      const L = layer('band');
      const b = h('div', 'band');
      if (d.top) b.style.top = `calc(${12 + (insets.top || 0)}px + var(--safe-top))`;
      else b.style.bottom = `${Math.max(12, (insets.bottom || 0) + 8)}px`;
      const head = h('div', 'head');
      head.append(h('span', 'nm', d.title));
      if (d.sub) head.append(h('span', 'sub', d.sub));
      b.append(head);
      const rows = h('div', 'rows');
      d.rows.forEach((r, i) => {
        const e = h('div', `rank${r.me ? ' me' : ''}`);
        e.style.animationDelay = `${i * 0.08}s`;
        const pl = h('span', 'pl');
        placeText(pl, r.place);
        const av = h('span', 'av');
        if (r.avatar) {
          const img = new Image();
          img.alt = '';
          img.crossOrigin = 'anonymous';
          img.src = r.avatar;
          av.append(img);
        } else av.append(svgEl(symbolSvg(r.symbol, r.color, '')));
        const who = h('span', 'who', r.name);
        if (r.best) who.append(h('span', 'new', 'New best!'));
        e.append(pl, av, who);
        if (r.time) e.append(h('span', 'tm', r.time));
        if (r.pts !== undefined && r.pts !== null) e.append(h('span', 'pts', r.pts));
        rows.append(e);
      });
      b.append(rows);
      if (d.foot?.length) {
        const f = h('div', 'foot');
        for (const x of d.foot) f.append(typeof x === 'string' ? h('span', '', x) : x);
        b.append(f);
      }
      L.append(b);
    },

    // ------------------------------------------------------------ signs and modals
    modal(build) {
      clear('modal');
      if (!build) return null;
      const L = layer('modal');
      const scrim = h('div', 'scrim');
      L.append(scrim);
      const s = h('div', 'sign modal');
      build(s);
      L.append(s);
      return s;
    },

    /** The Dream chart. d: { nodes: [{ n, name, stars: [b,b,b], best, locked, next }], total, onNode, onBack } */
    chart(d) {
      clear('chart');
      if (!d) return;
      const L = layer('chart');
      const c = h('div', 'chart');
      const cv = document.createElement('canvas');
      c.append(cv);
      c.append(h('div', 'head display outlined', 'The Dream'));
      const tot = h('div', 'total outlined');
      tot.append(svgEl(ICON.starOn), document.createTextNode(` ${d.total} / 24`));
      tot.querySelector('svg').style.cssText = 'width:22px;height:22px;vertical-align:-3px';
      c.append(tot);
      const back = button('disc back', svgEl(ICON.back), d.onBack);
      back.setAttribute('aria-label', 'Back');
      back.style.right = `${14 + (insets.right || 0)}px`;
      c.append(back);
      L.append(c);
      const W = c.clientWidth || innerWidth;
      const H = c.clientHeight || innerHeight;
      const portrait = H > W;
      const pts = d.nodes.map((nd, i) => {
        const k = i / 7;
        if (portrait) return { x: W * (0.5 + 0.28 * Math.sin(k * Math.PI * 2.2)), y: H * (0.88 - k * 0.72) };
        return { x: W * (0.09 + k * 0.82), y: H * (0.66 - 0.2 * Math.sin(k * Math.PI * 1.6) - k * 0.06) };
      });
      // the river of stars between them
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = W * dpr;
      cv.height = H * dpr;
      const g = cv.getContext('2d');
      g.scale(dpr, dpr);
      let seed = 7;
      const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 220; i++) {
        g.fillStyle = `rgba(244,235,208,${0.15 + R() * 0.6})`;
        g.beginPath();
        g.arc(R() * W, R() * H, R() * 1.4 + 0.3, 0, Math.PI * 2);
        g.fill();
      }
      g.strokeStyle = 'rgba(244,235,208,0.18)';
      g.lineWidth = 26;
      g.lineCap = 'round';
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.stroke();
      for (let i = 0; i < pts.length - 1; i++) {
        for (let k = 0; k < 14; k++) {
          const u = R();
          const x = pts[i].x + (pts[i + 1].x - pts[i].x) * u + (R() - 0.5) * 18;
          const y = pts[i].y + (pts[i + 1].y - pts[i].y) * u + (R() - 0.5) * 18;
          g.fillStyle = i < d.reached ? 'rgba(255,181,71,0.85)' : 'rgba(244,235,208,0.5)';
          g.beginPath();
          g.arc(x, y, 1 + R() * 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }
      d.nodes.forEach((nd, i) => {
        const e = button(`node${nd.locked ? ' locked' : ''}${nd.next ? ' next' : ''}`, null, () => d.onNode?.(nd));
        e.append(svgEl(nd.locked ? `<span style="display:grid;place-items:center;width:58px;height:58px">${ICON.lock.replace('<svg', '<svg style="width:30px;height:30px"')}</span>` : moonPhase(i, true)));
        e.append(h('span', 'nm', nd.name));
        const st = h('span', 'st');
        st.textContent = nd.stars.map((s) => (s ? '★' : '☆')).join('');
        e.append(st);
        if (nd.best) e.append(h('span', 'bt', nd.best));
        e.style.left = `${pts[i].x}px`;
        e.style.top = `${pts[i].y}px`;
        c.append(e);
      });
    },

    /** Who a watcher is following: "‹ Wren ›" low on the screen. */
    watching(text) {
      const L = layer('watching');
      if (!text) {
        L.textContent = '';
        ui._watch = '';
        return;
      }
      if (ui._watch === text) return;
      ui._watch = text;
      L.textContent = '';
      L.append(h('div', 'follow display outlined', text));
    },

    /** A start button of the game's own (a page on its own has no platform Ready strip). */
    start(show, label = 'Race', onClick = null) {
      clear('start');
      if (!show) return null;
      const L = layer('start');
      const box = h('div', 'startbox');
      const b = button('oar amber', label, onClick, 'Enter');
      box.append(b);
      L.append(box);
      return b;
    },

    closed(text, label, onClick) {
      clear('closed');
      if (!text) return;
      const L = layer('closed');
      const box = h('div', 'closed');
      box.append(h('div', 'msg display outlined', text));
      box.append(button('oar', label, onClick, 'Enter'));
      L.append(box);
    },

    icons: ICON,
    svgEl,
    placeText,
    clock,
  };
  return ui;
}
