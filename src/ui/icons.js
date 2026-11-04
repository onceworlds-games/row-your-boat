// Small inline SVG icons (static markup only: never built from player text).

export const ICON = {
  moon: '<svg viewBox="0 0 32 32"><path d="M20.5 4.5a11.5 11.5 0 1 0 7 20.6A12.5 12.5 0 0 1 20.5 4.5z" fill="#F4EBD0" stroke="#141A3A" stroke-width="2"/><circle cx="24" cy="8" r="1.4" fill="#FFB547"/><circle cx="27.5" cy="14" r="1" fill="#FFB547"/></svg>',
  fork: '<svg viewBox="0 0 32 32"><path d="M11 3v11a5 5 0 0 0 10 0V3" fill="none" stroke="#F4EBD0" stroke-width="3.2" stroke-linecap="round"/><path d="M16 19v10" stroke="#F4EBD0" stroke-width="3.2" stroke-linecap="round"/><path d="M4 9c-1.5 2-1.5 5 0 7M28 9c1.5 2 1.5 5 0 7" stroke="#FFB547" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
  pause: '<svg viewBox="0 0 26 26"><rect x="5" y="4" width="5.5" height="18" rx="2" fill="#F4EBD0"/><rect x="15.5" y="4" width="5.5" height="18" rx="2" fill="#F4EBD0"/></svg>',
  back: '<svg viewBox="0 0 32 32"><path d="M19 7l-9 9 9 9" fill="none" stroke="#F4EBD0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  crown: '<svg class="crown" viewBox="0 0 22 16"><path d="M2 14l-1-10 5.5 4.5L11 1l4.5 7.5L21 4l-1 10z" fill="#FFB547" stroke="#141A3A" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  starOn: '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17.3l-6.2 3.6 1.6-6.9L2.1 9.3l7-.7z" fill="#FFB547" stroke="#141A3A" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  starOff: '<svg viewBox="0 0 24 24"><path d="M12 2.2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17.3l-6.2 3.6 1.6-6.9L2.1 9.3l7-.7z" fill="none" stroke="#F4EBD0" stroke-opacity=".55" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2" fill="#F4EBD0"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#F4EBD0" stroke-width="2.4"/></svg>',
  blade: '<svg viewBox="0 0 120 64"><path d="M0 40h58" stroke="#c49a6c" stroke-width="7" stroke-linecap="round"/><rect x="0" y="35" width="14" height="10" rx="3" fill="#3a2418"/><path class="blade" d="M56 40c8-14 30-20 58-14 4 6 4 22 0 28-28 6-50 0-58-14z" fill="#F4EBD0" stroke="#141A3A" stroke-width="3"/></svg>',
  lantern: '<svg class="lan" viewBox="0 0 20 28"><path d="M10 1v4" stroke="#141A3A" stroke-width="2.4" stroke-linecap="round"/><path d="M5 6h10l-1 2H6z" fill="#141A3A"/><path class="paper" d="M4 9.5C4 8 16 8 16 9.5c2.4 3.2 2.4 9.8 0 13 0 1.5-12 1.5-12 0-2.4-3.2-2.4-9.8 0-13z" stroke="#141A3A" stroke-width="1.8"/><path d="M10 9v14.5M6.5 9.4c-1.4 3.6-1.4 9.6 0 13.2M13.5 9.4c1.4 3.6 1.4 9.6 0 13.2" fill="none" stroke="#141A3A" stroke-opacity=".35" stroke-width="1.1"/><path d="M6 24h8l-1 2.5H7z" fill="#141A3A"/></svg>',
  bloom: '<svg class="blm" viewBox="0 0 28 22"><ellipse cx="14" cy="17" rx="12.5" ry="4" fill="#2f6b4a" stroke="#141A3A" stroke-width="1.6"/><path d="M14 3c2.6 3 3 7.2 0 11.5C11 10.2 11.4 6 14 3z" fill="#EAF0FF" stroke="#141A3A" stroke-width="1.5" stroke-linejoin="round"/><path d="M7.5 7.5c3.8.6 6 3.8 6.3 7.2-3.8-.5-6.3-3.2-6.3-7.2zM20.5 7.5c-3.8.6-6 3.8-6.3 7.2 3.8-.5 6.3-3.2 6.3-7.2z" fill="#BFD3FF" stroke="#141A3A" stroke-width="1.5" stroke-linejoin="round"/><circle cx="14" cy="14" r="1.6" fill="#FFE58A"/></svg>',
  boat: '<svg viewBox="0 0 32 32"><path d="M15 4v15M15 5l8 12h-8z" fill="#F4EBD0" stroke="#F4EBD0" stroke-width="1.6" stroke-linejoin="round"/><path d="M3.5 20h25l-3.6 6.2a2 2 0 0 1-1.7 1H8.8a2 2 0 0 1-1.7-1z" fill="#FFB547" stroke="#141A3A" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 23h20" stroke="#141A3A" stroke-opacity=".45" stroke-width="1.4"/></svg>',
  tonight: '<svg viewBox="0 0 32 32"><path d="M16 3.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L16 18.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" fill="#FFB547" stroke="#141A3A" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 25.5c3-2 5-2 8 0s5 2 8 0 5-2 8 0" fill="none" stroke="#F4EBD0" stroke-width="2.4" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#F4EBD0" stroke-width="3" stroke-linecap="round"/></svg>',
};

/** A boat's symbol as SVG markup, in its paint colour. */
export function symbolSvg(symbol, color, cls = 'sym') {
  const s = (d) => `<svg class="${cls}" viewBox="0 0 24 24"><path d="${d}" fill="${color}" stroke="#141A3A" stroke-width="2" stroke-linejoin="round"/></svg>`;
  switch (symbol) {
    case 'dot':
      return `<svg class="${cls}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="${color}" stroke="#141A3A" stroke-width="2"/></svg>`;
    case 'diamond':
      return s('M12 2l8 10-8 10-8-10z');
    case 'square':
      return s('M4 4h16v16H4z');
    case 'chevron':
      return s('M2 17L12 5l10 12-4 2-6-7-6 7z');
    case 'star':
      return s('M12 1.5l3 7 7.5.6-5.7 4.9 1.8 7.4L12 17.5l-6.6 3.9 1.8-7.4L1.5 9.1 9 8.5z');
    default:
      return s('M12 21C4 15 2 11 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 3-2 7-10 13z');
  }
}

/** A moon-phase disc for the Dream chart (phase 0-7: new to full and back). */
export function moonPhase(k, lit = true) {
  const f = (k + 1) / 8;
  const c = lit ? '#F4EBD0' : '#5a6290';
  const shade = '#141A3A';
  // a lit disc with a shadow ellipse sliding across it
  const off = (1 - f) * 56;
  return `<svg class="moon" viewBox="0 0 64 64"><defs><clipPath id="mc${k}${lit ? 1 : 0}"><circle cx="32" cy="32" r="26"/></clipPath></defs><circle cx="32" cy="32" r="28" fill="none" stroke="${lit ? '#FFB547' : '#3a4270'}" stroke-width="2.5"/><circle cx="32" cy="32" r="26" fill="${c}"/><g clip-path="url(#mc${k}${lit ? 1 : 0})"><circle cx="${32 - off}" cy="32" r="26" fill="${shade}" opacity="${f >= 1 ? 0 : 0.92}"/></g><circle cx="26" cy="26" r="3.5" fill="#000" opacity=".08"/><circle cx="37" cy="38" r="2.5" fill="#000" opacity=".08"/></svg>`;
}
