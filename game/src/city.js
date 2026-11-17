// Solmar Heat — the city of Solmar: a street grid, blocks of buildings,
// sidewalks, trees, lamps, a beach corner and parked cars. Also the road
// helpers and the circle-vs-building collision the rest of the game uses.

import { BLOCK, PALETTE, ROAD, ROAD_HALF, WORLD } from './config.js';

export function roadCenter(v) {
  return Math.round(v / BLOCK) * BLOCK;
}

// True when the point sits on a street (within the road band of either axis).
export function isOnRoad(x, y) {
  const dx = Math.abs(x - roadCenter(x));
  const dy = Math.abs(y - roadCenter(y));
  return dx < ROAD_HALF || dy < ROAD_HALF;
}

// Distance from the point to the nearest street centre line on each axis.
export function roadOffset(x, y) {
  return { ox: x - roadCenter(x), oy: y - roadCenter(y) };
}

export function buildCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const parkedSpots = [];
  const blocksX = WORLD / BLOCK;
  const blocksY = WORLD / BLOCK;

  for (let bx = 0; bx < blocksX; bx += 1) {
    for (let by = 0; by < blocksY; by += 1) {
      const x0 = bx * BLOCK + ROAD_HALF + 14;
      const y0 = by * BLOCK + ROAD_HALF + 14;
      const x1 = (bx + 1) * BLOCK - ROAD_HALF - 14;
      const y1 = (by + 1) * BLOCK - ROAD_HALF - 14;
      // The south-west corner block is the beach; the south-east is the park.
      if (bx === 0 && by === blocksY - 1) continue;
      if (bx === blocksX - 1 && by === blocksY - 1) {
        for (let i = 0; i < 9; i += 1) {
          trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(12, 20) });
        }
        continue;
      }
      // One or two buildings per block, leaving a courtyard gap.
      const split = rng.chance(0.55);
      if (split) {
        const mid = x0 + (x1 - x0) * rng.range(0.42, 0.58);
        buildings.push(makeBuilding(x0, y0, mid - 8, y1));
        buildings.push(makeBuilding(mid + 8, y0, x1, y1));
      } else {
        buildings.push(makeBuilding(x0, y0, x1, y1));
      }
      // Street trees along the block's north sidewalk.
      const treeCount = rng.int(1, 3);
      for (let i = 0; i < treeCount; i += 1) {
        trees.push({ x: rng.range(x0, x1), y: y0 - 8, r: rng.range(9, 14) });
      }
      // A lamp at the block's north-west corner.
      lamps.push({ x: x0 - 6, y: y0 - 6 });
      // Parked cars along the block's east curb, sometimes.
      if (rng.chance(0.35)) {
        const n = rng.int(1, 2);
        for (let i = 0; i < n; i += 1) {
          parkedSpots.push({
            x: (bx + 1) * BLOCK - 22,
            y: y0 + 30 + i * 62,
            angle: Math.PI / 2,
          });
        }
      }
    }
  }

  function makeBuilding(bx0, by0, bx1, by1) {
    const w = bx1 - bx0;
    const h = by1 - by0;
    return {
      x: bx0,
      y: by0,
      w,
      h,
      roof: rng.pick(PALETTE.buildingRoof),
      wall: rng.pick(PALETTE.buildingWall),
      height: rng.int(1, 4), // storeys, drawn as a shadow offset
      windows: rng.int(2, 5),
    };
  }

  // Push a circle out of every building it overlaps; returns the fixed point.
  function resolveBuildings(x, y, r) {
    let px = x;
    let py = y;
    for (const b of buildings) {
      const cx = Math.max(b.x, Math.min(px, b.x + b.w));
      const cy = Math.max(b.y, Math.min(py, b.y + b.h));
      const dx = px - cx;
      const dy = py - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 > 0.001) {
          const d = Math.sqrt(d2);
          px = cx + (dx / d) * r;
          py = cy + (dy / d) * r;
        } else {
          // Dead centre: push out along the shortest side.
          const left = px - b.x;
          const right = b.x + b.w - px;
          const top = py - b.y;
          const bottom = b.y + b.h - py;
          const m = Math.min(left, right, top, bottom);
          if (m === left) px = b.x - r;
          else if (m === right) px = b.x + b.w + r;
          else if (m === top) py = b.y - r;
          else py = b.y + b.h + r;
        }
      }
    }
    return { x: Math.max(20, Math.min(WORLD - 20, px)), y: Math.max(20, Math.min(WORLD - 20, py)) };
  }

  function pointInBuilding(x, y, pad) {
    for (const b of buildings) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }

  // A random point on a street, biased to the middle of the city.
  function randomRoadPoint() {
    const axis = rng.chance(0.5) ? 'h' : 'v';
    const line = rng.int(1, 7) * BLOCK;
    const along = rng.range(120, WORLD - 120);
    if (axis === 'h') return { x: along, y: line + rng.range(-14, 14) };
    return { x: line + rng.range(-14, 14), y: along };
  }

  // A random point on a sidewalk (just off a street, inside a block edge).
  function randomSidewalkPoint() {
    const line = rng.int(1, 7) * BLOCK;
    const along = rng.range(120, WORLD - 120);
    if (rng.chance(0.5)) return { x: along, y: line + ROAD_HALF + 12 };
    return { x: line + ROAD_HALF + 12, y: along };
  }

  return { buildings, trees, lamps, parkedSpots, resolveBuildings, pointInBuilding, randomRoadPoint, randomSidewalkPoint };
}
