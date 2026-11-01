// A run's score: rhythm, pulls, droplets, rushes, moonblooms and close shaves, with the combo (the bow lanterns lit)
// multiplying the rhythm. Pure.

/** Points for each thing; rhythm kinds are multiplied by the lanterns lit (1-4). */
export const POINTS = { perfect: 100, good: 50, pull: 150, drop: 40, rush: 600, bloom: 60, shave: 150, bump: -40 };
const BY_LEVEL = new Set(['perfect', 'good', 'pull', 'drop']);

export function createScore() {
  const s = { total: 0, perfect: 0, good: 0, pull: 0, drop: 0, rush: 0, bloom: 0, shave: 0, bump: 0 };
  return {
    state: s,
    /** Count one thing at combo level `level`. Returns the points it was worth. */
    add(kind, level = 1) {
      if (!(kind in POINTS)) return 0;
      const pts = POINTS[kind] * (BY_LEVEL.has(kind) ? Math.max(1, Math.min(4, level | 0)) : 1);
      s[kind]++;
      s.total = Math.max(0, s.total + pts);
      return pts;
    },
    /** Score a racer's events (racer.update's list). */
    events(list) {
      let got = 0;
      for (const ev of list) {
        if (ev.type === 'stroke') {
          const r = ev.res;
          if (r.kind === 'perfect' || r.kind === 'good' || r.kind === 'pull' || r.kind === 'drop') got += this.add(r.kind, r.level);
          if (r.rush) got += this.add('rush');
        } else if (ev.type === 'bloom' || ev.type === 'shave' || ev.type === 'bump') got += this.add(ev.type);
      }
      return got;
    },
  };
}
