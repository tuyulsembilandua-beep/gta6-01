// Solmar Heat — the wanted system: heat builds with crimes, stars follow
// heat, police cars and foot cops spawn to match the stars, and the heat
// cools off once nobody has seen the player for a while.

import { WANTED, clamp } from './config.js';
import { makeCar } from './entities.js';

export function starsFromHeat(heat) {
  return clamp(Math.floor(heat / WANTED.heatPerStar), 0, WANTED.maxStars);
}

export function addHeat(state, amount) {
  if (amount <= 0) return;
  const before = state.stars;
  state.heat = Math.min(WANTED.maxStars * WANTED.heatPerStar + 99, state.heat + amount);
  state.stars = starsFromHeat(state.heat);
  state.unseenTimer = 0;
  if (state.stars > before) {
    state.audio?.wantedUp();
    state.toast(`Wanted level ${state.stars} — the Solmar PD is on you!`, 3);
  }
}

function spawnPoliceCar(state) {
  const p = state.player;
  // Appear a little way off, on a street, driving toward the player.
  const a = state.rng.range(0, Math.PI * 2);
  const d = state.rng.range(520, 700);
  let x = p.x + Math.cos(a) * d;
  let y = p.y + Math.sin(a) * d;
  x = clamp(x, 80, 3120);
  y = clamp(y, 80, 3120);
  const spot = state.city.randomRoadPoint();
  // Prefer the road point nearest the spawn ring so the car starts on a street.
  const car = makeCar(state, spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'police', 'ai');
  car.speed = 300;
  state.cars.push(car);
}

function spawnFootCop(state) {
  const p = state.player;
  const a = state.rng.range(0, Math.PI * 2);
  const d = state.rng.range(260, 380);
  const x = clamp(p.x + Math.cos(a) * d, 60, 3140);
  const y = clamp(p.y + Math.sin(a) * d, 60, 3140);
  state.cops.push({
    x, y, angle: 0, hp: 60, shootCd: state.rng.range(0.4, 1.2), gone: false,
  });
}

export function updateWanted(state, dt) {
  // Seen when any police unit is close to the player.
  let seen = false;
  for (const car of state.cars) {
    if (car.kind === 'police' && Math.hypot(car.x - state.player.x, car.y - state.player.y) < 560) {
      seen = true;
      break;
    }
  }
  if (!seen) {
    for (const cop of state.cops) {
      if (Math.hypot(cop.x - state.player.x, cop.y - state.player.y) < 420) {
        seen = true;
        break;
      }
    }
  }
  if (seen) state.unseenTimer = 0;
  else {
    state.unseenTimer += dt;
    if (state.unseenTimer > WANTED.decayDelay && state.heat > 0) {
      state.heat = Math.max(0, state.heat - (WANTED.heatPerStar / WANTED.decayInterval) * dt);
      const s = starsFromHeat(state.heat);
      if (s < state.stars) {
        state.stars = s;
        if (s === 0) state.toast('You lost the cops. Stay clean.', 3);
      }
    }
  }
  // Keep the police presence matched to the stars.
  const wantCars = Math.min(4, state.stars);
  const policeCars = state.cars.filter((c) => c.kind === 'police').length;
  if (policeCars < wantCars && state.spawnTimer <= 0) {
    spawnPoliceCar(state);
    state.spawnTimer = 2.2;
  }
  const wantCops = state.player.onFoot && state.stars >= 2 ? Math.min(3, state.stars - 1) : 0;
  if (state.cops.length < wantCops && state.spawnTimer <= 0) {
    spawnFootCop(state);
    state.spawnTimer = 2.2;
  }
  state.spawnTimer -= dt;
  // When the heat is gone, the police give up and drive away.
  if (state.stars === 0) {
    for (const car of state.cars) {
      if (car.kind === 'police') car.gone = true;
    }
    state.cars = state.cars.filter((c) => !c.gone);
    state.cops = [];
  }
}
