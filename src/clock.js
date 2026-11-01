// The song's clock on one page: song time as the player hears it, on the audio clock, anchored to the race's own clock
// (the match clock, or the Dream's). The ripples, the judge and the scheduler all read it, so what is seen, heard and
// judged agree. Without running audio it is the race's clock itself.

import { audio } from './audio.js';

/** Re-anchor at once when the audio and the race clock are this far apart (seconds). */
export const JUMP = 0.08;
/** Otherwise slew by at most this much per beat. */
export const SLEW_PER_BEAT = 0.002;

/**
 * source(perfMs): song seconds by the race's clock at that performance.now() moment. Call sync() once a frame, then
 * at(perf) for any moment (a frame, an input event's timeStamp).
 */
export function createSongClock(source) {
  let anchor = null; // context time of song 0
  let last = null;
  return {
    sync(perf, beatDur = 0.6) {
      audio.sampleClock(perf);
      const h = audio.heard(perf);
      if (h === null) {
        anchor = null;
        return;
      }
      const want = h - source(perf);
      const dt = last === null ? 0 : Math.max(0, Math.min(0.25, (perf - last) / 1000));
      last = perf;
      if (anchor === null || !Number.isFinite(anchor) || Math.abs(want - anchor) > JUMP) anchor = want;
      else {
        const step = (SLEW_PER_BEAT * dt) / Math.max(0.2, beatDur);
        anchor += Math.max(-step, Math.min(step, want - anchor));
      }
    },
    /** Song time heard at `perf` (ms). */
    at(perf) {
      const h = anchor === null ? null : audio.heard(perf);
      return h === null ? source(perf) : h - anchor;
    },
    /** The context time a song time is scheduled at (null without audio). */
    ctxOf(song) {
      return anchor === null ? null : anchor + song;
    },
    get anchor() {
      return anchor;
    },
    reset() {
      anchor = null;
      last = null;
    },
  };
}
