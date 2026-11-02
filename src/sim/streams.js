// The eight streams of The Dream, as data. Pure.
//
// segs: [length] is a straight, [degrees, radius] a bend (positive turns right). islands: the river parts around them
// (s0..s1 along the river, w wide); `short` is the side of the shorter line (-1 left, 1 right). rapids: [s0, s1, side]
// (side 0: the whole river). whirls: [s, d]. pendulums: [s]. Scattered obstacles: per 100 m of race.

export const STREAMS = [
  {
    n: 1, id: 'bedtime', name: 'Bedtime', bpm: 84, tonic: 65, ease: 1.25, length: 440, width: 18,
    segs: [[70], [40, 80], [40], [-60, 70], [50], [45, 80], [60], [-30, 90], [40]],
    widths: [[0, 18], [330, 18], [355, 14], [415, 14], [440, 18]],
    islands: [{ s0: 176, s1: 230, w: 8, short: -1 }],
    rapids: [], whirls: [], pendulums: [],
    rocks: 1.4, logs: 0, pads: 0,
    rivals: ['Mabel', 'Barty', 'Juniper'], rivalSkill: [-0.2, -0.1],
  },
  {
    n: 2, id: 'teatime', name: 'Teatime', bpm: 92, tonic: 67, ease: 1.1, length: 500, width: 17,
    segs: [[50], [-35, 70], [40], [70, 60], [30], [-50, 70], [50], [40, 80], [60], [-20, 100], [55]],
    widths: [[0, 17]],
    islands: [{ s0: 140, s1: 200, w: 9, short: 1 }, { s0: 241, s1: 291, w: 8, short: -1 }],
    rapids: [[398, 440, 0]], whirls: [[335, 2.5]], pendulums: [],
    rocks: 1.5, logs: 0.8, pads: 0,
    rivals: ['Otis', 'Mabel', 'Wren'], rivalSkill: [0.02, 0.07],
  },
  {
    n: 3, id: 'staircase', name: 'The Staircase', bpm: 100, tonic: 69, ease: 1, length: 560, width: 15,
    segs: [[45], [50, 60], [35], [-55, 55], [40], [60, 55], [30], [-40, 65], [45], [50, 60], [50], [-35, 70], [60]],
    widths: [[0, 15]],
    islands: [{ s0: 186, s1: 232, w: 7, short: 1 }],
    rapids: [[128, 150, 0], [300, 322, 0], [470, 492, 0]], whirls: [], pendulums: [],
    rocks: 1.4, logs: 1.2, pads: 0,
    rivals: ['Barty', 'Pell', 'Juniper'], rivalSkill: [0.08, 0.11],
  },
  {
    n: 4, id: 'cloudbank', name: 'Cloudbank', bpm: 104, tonic: 70, ease: 1, length: 600, width: 17,
    segs: [[60], [45, 90], [-45, 90], [40], [50, 80], [-50, 80], [40], [35, 90], [-35, 90], [50], [20, 120], [40]],
    widths: [[0, 17]],
    islands: [{ s0: 248, s1: 305, w: 9, short: 1 }, { s0: 318, s1: 375, w: 8, short: -1 }],
    rapids: [], whirls: [[470, -2.5]], pendulums: [],
    rocks: 0.8, logs: 0, pads: 2.4,
    rivals: ['Wren', 'Juniper', 'Otis'], rivalSkill: [0.14, 0.18],
  },
  {
    n: 5, id: 'library', name: 'The Library', bpm: 110, tonic: 72, ease: 1, length: 660, width: 16,
    segs: [[50], [-40, 70], [40], [60, 60], [40], [-70, 55], [45], [40, 75], [50], [-45, 70], [40], [30, 90], [60], [-15, 100], [45]],
    widths: [[0, 16]],
    islands: [{ s0: 145, s1: 196, w: 9, short: 1 }, { s0: 248, s1: 303, w: 10, short: -1 }],
    rapids: [[252, 300, -1]], whirls: [[380, -3], [530, 3]], pendulums: [],
    rocks: 1.5, logs: 1.0, pads: 0,
    rivals: ['Pell', 'Mabel', 'Wren'], rivalSkill: [0.21, 0.26],
  },
  {
    n: 6, id: 'clockwork', name: 'Clockwork', bpm: 116, tonic: 74, ease: 1, length: 700, width: 16,
    segs: [[50], [50, 65], [45], [-55, 60], [40], [45, 70], [50], [-60, 60], [45], [40, 75], [50], [-30, 90], [55], [20, 100], [55]],
    widths: [[0, 16]],
    islands: [{ s0: 360, s1: 412, w: 8, short: -1 }],
    rapids: [], whirls: [[232, 3], [440, -3], [592, 2.5]], pendulums: [128, 330, 540],
    rocks: 1.5, logs: 0.6, pads: 0,
    rivals: ['Juniper', 'Otis', 'Barty'], rivalSkill: [0.26, 0.33],
  },
  {
    n: 7, id: 'stars', name: 'Sea of Stars', bpm: 124, tonic: 75, ease: 1, length: 760, width: 16,
    segs: [[60], [-45, 80], [40], [55, 70], [40], [-50, 75], [50], [60, 65], [45], [-40, 80], [50], [35, 85], [50], [-25, 100], [70]],
    widths: [[0, 16]],
    islands: [{ s0: 170, s1: 224, w: 9, short: 1 }, { s0: 392, s1: 447, w: 10, short: 1 }],
    rapids: [[396, 444, 1]], whirls: [[300, -3], [522, 3], [690, 0]], pendulums: [],
    rocks: 1.0, logs: 1.2, pads: 0,
    rivals: ['Wren', 'Pell', 'Otis'], rivalSkill: [0.4, 0.5],
  },
  {
    n: 8, id: 'morning', name: 'Morning', bpm: 132, tonic: 76, ease: 1, length: 820, width: 17,
    segs: [[50], [40, 75], [40], [-55, 65], [40], [50, 70], [50], [-45, 70], [45], [60, 60], [45], [-40, 75], [55], [30, 90], [60], [-20, 110], [60]],
    widths: [[0, 17]],
    islands: [{ s0: 150, s1: 198, w: 8, short: -1 }, { s0: 462, s1: 512, w: 9, short: 1 }],
    rapids: [[150, 200, -1], [455, 625, 0]], whirls: [[352, 2.5]], pendulums: [],
    rocks: 1.7, logs: 1.0, pads: 0,
    rivals: ['Otis', 'Wren', 'Juniper'], rivalSkill: [0.45, 0.58],
  },
];

/** The six rival rowers: look and habit. */
export const ROWERS = {
  Mabel: { paint: 1, hat: 'nightcap', bias: 0, sigma: 0, slip: 0, sight: 0, short: 'never', overcorrect: 0, streaky: false },
  Otis: { paint: 4, hat: 'flatcap', bias: 0, sigma: 0.01, slip: 0, sight: 0, short: 'always', overcorrect: 0, streaky: false },
  Wren: { paint: 2, hat: 'scarf', bias: 0, sigma: 0, slip: 0, sight: 8, short: 'skill', overcorrect: 0, streaky: false },
  Barty: { paint: 3, hat: 'bowler', bias: 0.025, sigma: 0, slip: 0, sight: 0, short: 'skill', overcorrect: 0, streaky: false },
  Juniper: { paint: 5, hat: 'beret', bias: 0, sigma: -0.012, slip: 0, sight: -4, short: 'skill', overcorrect: 0.25, streaky: false },
  Pell: { paint: 0, hat: 'souwester', bias: 0, sigma: 0, slip: 0.01, sight: 0, short: 'skill', overcorrect: 0, streaky: true },
};
export const ROWER_NAMES = Object.keys(ROWERS);

/** Boat paints: colour and the symbol on the pennant (so colour is never the only cue). */
export const PAINTS = [
  { name: 'cream', color: '#F4EBD0', symbol: 'heart' },
  { name: 'rose', color: '#F2A7B6', symbol: 'dot' },
  { name: 'sage', color: '#9CC5A1', symbol: 'diamond' },
  { name: 'lantern', color: '#FFB547', symbol: 'square' },
  { name: 'ember', color: '#E5533D', symbol: 'chevron' },
  { name: 'lilac', color: '#B7A5E8', symbol: 'star' },
];

export const streamByN = (n) => STREAMS[Math.max(0, Math.min(STREAMS.length - 1, (Math.floor(Number(n)) || 1) - 1))];
/** Par time in seconds (length / 6.5 m/s) and the hard cap of a race. */
export const par = (stream) => stream.length / 6.5;
export const cap = (stream) => par(stream) * 2.2;
