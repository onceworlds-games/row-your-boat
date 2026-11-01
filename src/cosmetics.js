// What a boat and its rower can wear: hats, boats, paints' trims, lantern colours and wake trails. Plain data (the
// renderer draws them, the save unlocks them).

export const HATS = ['nightcap', 'beanie', 'scarf', 'beret', 'flatcap', 'bowler', 'souwester', 'boater', 'captain', 'crown', 'tophat'];
export const HAT_NAMES = {
  nightcap: 'Nightcap', beanie: 'Bobble hat', scarf: 'Long scarf', beret: 'Beret', flatcap: 'Flat cap', bowler: 'Bowler',
  souwester: "Sou'wester", boater: 'Straw boater', captain: "Captain's cap", crown: 'Moonflowers', tophat: 'Top hat',
};

export const BODIES = ['rowboat', 'canoe', 'swan', 'teacup', 'paper', 'walnut', 'tub'];
export const BODY_NAMES = { rowboat: 'Rowboat', canoe: 'Canoe', swan: 'Swan boat', teacup: 'Teacup', paper: 'Paper boat', walnut: 'Walnut shell', tub: 'Bathtub' };

/** Lantern colours: the four lanterns over the bow (the combo). */
export const LANTERNS = ['amber', 'rose', 'moon', 'sage', 'lilac', 'ember'];
export const LANTERN_NAMES = { amber: 'Amber', rose: 'Rose', moon: 'Moonlight', sage: 'Firefly', lilac: 'Lilac', ember: 'Ember' };
export const LANTERN_COLORS = { amber: '#FFB547', rose: '#FF8FA8', moon: '#CFDBFF', sage: '#B8F08A', lilac: '#C3A6FF', ember: '#FF6A3D' };

/** Wake trails: what the boat leaves on the water. */
export const WAKES = ['none', 'stars', 'petals', 'bubbles', 'fireflies', 'notes'];
export const WAKE_NAMES = { none: 'Plain water', stars: 'Stardust', petals: 'Petals', bubbles: 'Bubbles', fireflies: 'Fireflies', notes: 'Music notes' };

/** Hull trims: the sheer strake and the stripe. */
export const TRIMS = ['cream', 'gold', 'navy', 'rose', 'mint', 'stripes'];
export const TRIM_NAMES = { cream: 'Cream', gold: 'Gilt', navy: 'Navy', rose: 'Rose', mint: 'Mint', stripes: 'Candy stripes' };
export const TRIM_COLORS = { cream: '#F4EBD0', gold: '#D9A441', navy: '#2B3F7C', rose: '#F2A7B6', mint: '#9CC5A1', stripes: '#F4EBD0' };

export const HAIRS = ['short', 'bob', 'buns', 'curly', 'braids'];
export const HAIR_COLORS = ['#2a1d18', '#4a3020', '#7a4a2a', '#c26a3a', '#e8d08a', '#1a1418', '#8a8a96', '#d97a9a'];
