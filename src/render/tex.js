// The few photographed textures (Poly Haven, CC0; see CREDITS.md), loaded once and shared. texturesReady() resolves
// when every texture asked for so far is on the GPU's side of the fence (posters wait for it).

import * as THREE from 'three';
import floor from '../assets/tex/floor.jpg';
import floorN from '../assets/tex/floor_n.jpg';
import tablecloth from '../assets/tex/tablecloth.jpg';
import tableclothN from '../assets/tex/tablecloth_n.jpg';
import marble from '../assets/tex/marble.jpg';
import marbleN from '../assets/tex/marble_n.jpg';
import carpet from '../assets/tex/carpet.jpg';
import carpetN from '../assets/tex/carpet_n.jpg';
import plate from '../assets/tex/plate.jpg';
import plateN from '../assets/tex/plate_n.jpg';
import blanket from '../assets/tex/blanket.jpg';
import blanketN from '../assets/tex/blanket_n.jpg';

const URLS = {
  floor: [floor, floorN],
  tablecloth: [tablecloth, tableclothN],
  marble: [marble, marbleN],
  carpet: [carpet, carpetN],
  plate: [plate, plateN],
  blanket: [blanket, blanketN],
};

const loader = new THREE.TextureLoader();
const cache = new Map();
const pending = new Set();

/** A repeating texture: kind 0 = colour, 1 = normal map. */
export function texture(name, kind = 0) {
  const key = `${name}:${kind}`;
  if (cache.has(key)) return cache.get(key);
  const url = URLS[name]?.[kind];
  if (!url) return null;
  let done;
  const p = new Promise((r) => (done = r));
  pending.add(p);
  const t = loader.load(
    url,
    () => done(),
    undefined,
    () => done(),
  );
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (kind === 0) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

export const texturesReady = () => Promise.race([Promise.all([...pending]), new Promise((r) => setTimeout(r, 4000))]);
