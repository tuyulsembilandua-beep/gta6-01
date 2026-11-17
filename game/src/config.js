// Solmar Heat — shared constants: world size, palette, tuning.
// One file, one job: every number the rest of the game agrees on lives here.

// World: a square city, 3200 x 3200 world units. Streets run on a 400-unit
// grid; each street is 80 units wide, so blocks are 320 units of buildings.
export const WORLD = 3200;
export const BLOCK = 400;
export const ROAD = 80;
export const ROAD_HALF = ROAD / 2;
export const STEP = 1 / 60;

export const SAVE_KEY = 'solmar-heat-save-v1';

// Sun-soaked Solmar palette: warm asphalt, pale sidewalks, terracotta roofs.
export const PALETTE = {
  grass: '#7fae5a',
  sidewalk: '#cbb98f',
  road: '#3d3a38',
  roadLine: '#e8d27a',
  curb: '#a89a72',
  buildingRoof: ['#b5673f', '#8f5a72', '#5a7d8f', '#a3803f', '#6f8f5a', '#94524a'],
  buildingWall: ['#d9c49a', '#e0b48f', '#c9d4cf', '#e6d3a8', '#d3a58f'],
  tree: '#3f7d3a',
  treeDark: '#2f6130',
  water: '#4f8fb5',
  sand: '#e0c98f',
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  pistolAmmo: 24,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  meleeDamage: 45,
  meleeRange: 46,
  meleeCooldown: 0.5,
};

export const CAR = {
  length: 54,
  width: 26,
  radius: 26,
  accel: 420,
  brake: 620,
  reverseAccel: 220,
  maxSpeed: 520,
  maxReverse: 160,
  turnRate: 2.6,
  grip: 6.5,
  trafficSpeed: 150,
  policeSpeed: 560,
  health: 100,
};

export const WANTED = {
  maxStars: 5,
  decayDelay: 9, // seconds unseen before stars start falling
  decayInterval: 4, // seconds per star lost while unseen
  heatPerStar: 100,
  crimeCarTheft: 55,
  crimeHitPed: 45,
  crimeShoot: 30,
  crimeKillCop: 80,
  crimeHitCopCar: 25,
};

export const MISSION_REWARDS = [300, 450, 650];

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

// Shortest signed angle difference, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
