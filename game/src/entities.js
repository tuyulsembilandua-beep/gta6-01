// Solmar Heat — everything that moves: traffic cars, parked cars, the
// player's car, pedestrians, foot cops, bullets and particles. Pure
// simulation: it reads state and the virtual input, it never draws.

import { BLOCK, CAR, PLAYER, WANTED, WORLD, angleDiff, clamp, dist } from './config.js';
import { isOnRoad, roadCenter } from './city.js';
import { addHeat } from './wanted.js';

const CAR_COLORS = ['#c23b2e', '#2e6fc2', '#e0a52e', '#3fae6a', '#7a4fb5', '#d8d8d8', '#222831', '#e07a2e'];
const PED_COLORS = ['#e8b48f', '#8f5a3f', '#d8a05a', '#c98f6a', '#a06a45'];
const PED_SHIRTS = ['#3f6fb5', '#b53f5a', '#4fae5a', '#e0d23f', '#8f5ab5', '#e07a3f', '#d8d8d8'];

export function makeCar(state, x, y, angle, kind, driver) {
  return {
    x, y, angle, speed: 0,
    kind, // 'traffic' | 'police' | 'parked' | 'player'
    driver, // 'ai' | 'player' | 'none'
    color: kind === 'police' ? '#20242e' : state.rng.pick(CAR_COLORS),
    hp: CAR.health,
    axis: state.rng.chance(0.5) ? 'h' : 'v',
    dir: state.rng.chance(0.5) ? 1 : -1,
    lane: 18,
    turnCooldown: 0,
    smoke: 0,
    honkTimer: state.rng.range(4, 20),
  };
}

export function spawnTraffic(state, count) {
  for (let i = 0; i < count; i += 1) {
    const p = state.city.randomRoadPoint();
    const car = makeCar(state, p.x, p.y, 0, 'traffic', 'ai');
    car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.speed = CAR.trafficSpeed * state.rng.range(0.8, 1.15);
    state.cars.push(car);
  }
}

export function spawnParked(state) {
  for (const spot of state.city.parkedSpots) {
    const car = makeCar(state, spot.x, spot.y, spot.angle, 'parked', 'none');
    state.cars.push(car);
  }
}

export function spawnPeds(state, count) {
  for (let i = 0; i < count; i += 1) {
    const p = state.city.randomSidewalkPoint();
    state.peds.push({
      x: p.x, y: p.y,
      angle: state.rng.range(0, Math.PI * 2),
      speed: state.rng.range(28, 55),
      state: 'walk',
      color: state.rng.pick(PED_COLORS),
      shirt: state.rng.pick(PED_SHIRTS),
      walkTimer: state.rng.range(2, 6),
      fleeTimer: 0,
      down: false,
    });
  }
}

export function addParticles(state, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = state.rng.range(0, Math.PI * 2);
    const s = state.rng.range(speed * 0.3, speed);
    state.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: state.rng.range(0.3, 0.8), maxLife: 0.8,
      color, size: state.rng.range(2, 5),
    });
  }
}

function carAhead(state, car, look) {
  let best = null;
  let bestD = look;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  for (const other of state.cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along < 10 || along > look) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 34 && along < bestD) {
      best = other;
      bestD = along;
    }
  }
  return best;
}

function updateTrafficCar(state, car, dt) {
  car.turnCooldown -= dt;
  car.honkTimer -= dt;
  // Follow the road: hold the lane offset, slow for the car ahead.
  const targetSpeed = CAR.trafficSpeed;
  const ahead = carAhead(state, car, 90);
  let want = targetSpeed;
  if (ahead) want = Math.min(want, Math.max(0, ahead.speed * 0.9));
  car.speed += clamp(want - car.speed, -500 * dt, 260 * dt);
  // At an intersection, sometimes turn onto the crossing street.
  const perp = car.axis === 'h' ? car.y : car.x;
  const centre = roadCenter(perp);
  if (car.turnCooldown <= 0 && Math.abs(perp - centre) < 26 && state.rng.chance(0.012)) {
    car.axis = car.axis === 'h' ? 'v' : 'h';
    car.dir = state.rng.chance(0.5) ? 1 : -1;
    car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    // Snap onto the new street's centre line so the turn looks clean.
    if (car.axis === 'h') car.y = centre + (car.dir > 0 ? 18 : -18);
    else car.x = centre + (car.dir > 0 ? -18 : 18);
    car.turnCooldown = 4;
  }
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  car.x += fx * car.speed * dt;
  car.y += fy * car.speed * dt;
  // Wrap around the city edge so traffic never runs out.
  if (car.x < -80) car.x = WORLD + 60;
  if (car.x > WORLD + 80) car.x = -60;
  if (car.y < -80) car.y = WORLD + 60;
  if (car.y > WORLD + 80) car.y = -60;
  const fixed = state.city.resolveBuildings(car.x, car.y, 20);
  if (fixed.x !== car.x || fixed.y !== car.y) {
    car.x = fixed.x;
    car.y = fixed.y;
    car.speed *= 0.4;
  }
}

// The player's car: arcade handling — throttle, steering that bites harder
// the faster you go, and a handbrake that lets the tail slide.
export function updatePlayerCar(state, car, vin, dt) {
  const steer = vin.mx; // -1 left, 1 right
  const throttle = vin.my < 0 ? 1 : vin.my > 0 ? -0.6 : 0; // W = forward
  const handbrake = vin.handbrake;
  if (throttle > 0) car.speed += CAR.accel * dt;
  else if (throttle < 0) {
    // S brakes while moving forward, then reverses once stopped.
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
    car.speed = Math.max(car.speed, -CAR.maxReverse);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
  }
  if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 500 * dt);
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  const grip = handbrake ? 0.45 : 1;
  const steerAuthority = clamp(Math.abs(car.speed) / 160, 0, 1) * grip;
  car.angle += steer * CAR.turnRate * steerAuthority * dt * (car.speed >= 0 ? 1 : -1);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const nx = car.x + fx * car.speed * dt;
  const ny = car.y + fy * car.speed * dt;
  const fixed = state.city.resolveBuildings(nx, ny, 20);
  if (fixed.x !== nx || fixed.y !== ny) {
    if (Math.abs(car.speed) > 120) {
      state.audio?.crash(Math.abs(car.speed) / CAR.maxSpeed);
      addParticles(state, nx, ny, '#ffcf5a', 10, 160);
      addHeat(state, 0); // bumping a wall is not a crime
    }
    car.speed *= -0.25;
    car.x = fixed.x;
    car.y = fixed.y;
  } else {
    car.x = nx;
    car.y = ny;
  }
  if (car.hp < 40) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      state.particles.push({ x: car.x, y: car.y - 8, vx: state.rng.range(-12, 12), vy: state.rng.range(-40, -14), life: 0.9, maxLife: 0.9, color: '#555', size: 5 });
    }
  }
}

export function updateCars(state, dt) {
  for (const car of state.cars) {
    if (car.driver === 'player') continue; // main loop drives it
    if (car.kind === 'traffic') updateTrafficCar(state, car, dt);
    else if (car.kind === 'police') updatePoliceCar(state, car, dt);
  }
  // Car-vs-car bumps: push apart, trade a little speed, spark on hard hits.
  for (let i = 0; i < state.cars.length; i += 1) {
    for (let j = i + 1; j < state.cars.length; j += 1) {
      const a = state.cars[i];
      const b = state.cars[j];
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 44;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        // The player's car shoves traffic aside; two AI cars share the push.
        const aPlayer = a.driver === 'player';
        const bPlayer = b.driver === 'player';
        const wa = aPlayer ? 0.1 : bPlayer ? 0.9 : 0.5;
        const wb = 1 - wa;
        a.x -= nx * push * 2 * wa;
        a.y -= ny * push * 2 * wa;
        b.x += nx * push * 2 * wb;
        b.y += ny * push * 2 * wb;
        // Slide sideways a little too, so a head-on meeting slips past
        // instead of grinding nose-to-nose until both cars stop.
        const slide = push * 0.5;
        a.x -= -ny * slide * wa * 2;
        a.y -= nx * slide * wa * 2;
        b.x += -ny * slide * wb * 2;
        b.y += nx * slide * wb * 2;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 140) {
          state.audio?.crash(impact / CAR.maxSpeed);
          addParticles(state, (a.x + b.x) / 2, (a.y + b.y) / 2, '#ffcf5a', 6, 120);
          if ((a.driver === 'player' || b.driver === 'player') && (a.kind === 'police' || b.kind === 'police')) {
            addHeat(state, WANTED.crimeHitCopCar);
          }
        }
        a.speed *= aPlayer ? 0.97 : 0.85;
        b.speed *= bPlayer ? 0.97 : 0.85;
      }
    }
  }
}

function updatePoliceCar(state, car, dt) {
  const p = state.player;
  const targetAngle = Math.atan2(p.y - car.y, p.x - car.x);
  const diff = angleDiff(car.angle, targetAngle);
  car.angle += clamp(diff, -2.8 * dt, 2.8 * dt);
  const d = dist(car.x, car.y, p.x, p.y);
  const want = d > 90 ? CAR.policeSpeed : CAR.policeSpeed * 0.45;
  car.speed += clamp(want - car.speed, -700 * dt, 500 * dt);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const nx = car.x + fx * car.speed * dt;
  const ny = car.y + fy * car.speed * dt;
  const fixed = state.city.resolveBuildings(nx, ny, 20);
  car.x = fixed.x;
  car.y = fixed.y;
  if ((fixed.x !== nx || fixed.y !== ny) && Math.abs(car.speed) > 150) {
    car.speed *= 0.3;
    addParticles(state, nx, ny, '#ffcf5a', 8, 140);
  }
  // Ramming the player hurts them (or their car).
  if (d < 40) {
    if (p.onFoot) damagePlayer(state, 18 * dt * 4);
    else if (p.car) {
      p.car.hp -= 22 * dt;
      if (p.car.hp <= 0) {
        state.audio?.crash(1);
        addParticles(state, p.car.x, p.car.y, '#ff8a3d', 24, 260);
        exitCar(state, true);
      }
    }
  }
}

export function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.down) continue;
    ped.walkTimer -= dt;
    // Flee from gunfire, fast cars and the player when wanted.
    let threat = null;
    let threatD = 170;
    for (const car of state.cars) {
      if (car.driver === 'player' && Math.abs(car.speed) > 90) {
        const d = dist(ped.x, ped.y, car.x, car.y);
        if (d < threatD) { threat = car; threatD = d; }
      }
    }
    if (state.recentShotTimer > 0) {
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d < 320) { threat = p; threatD = d; }
    }
    if (threat) {
      ped.state = 'flee';
      ped.fleeTimer = 1.2;
    } else if (ped.fleeTimer > 0) {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
    if (ped.state === 'flee') {
      const away = Math.atan2(ped.y - (threat ? threat.y : p.y), ped.x - (threat ? threat.x : p.x));
      ped.angle = away;
      ped.speed = 150;
    } else {
      if (ped.walkTimer <= 0) {
        ped.walkTimer = state.rng.range(2, 7);
        ped.angle = state.rng.range(0, Math.PI * 2);
      }
      ped.speed = 42;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    // Peds stay on sidewalks: steer back toward a street edge when lost.
    if (isOnRoad(ped.x, ped.y) && ped.state === 'walk') {
      ped.angle += Math.PI / 2 * dt * 3;
    }
    const fixed = state.city.resolveBuildings(ped.x, ped.y, 9);
    ped.x = fixed.x;
    ped.y = fixed.y;
    ped.x = clamp(ped.x, 16, WORLD - 16);
    ped.y = clamp(ped.y, 16, WORLD - 16);
    // Run over by the player's car: a crime, and the ped goes down.
    if (p.car && Math.abs(p.car.speed) > 60 && dist(ped.x, ped.y, p.car.x, p.car.y) < 30) {
      ped.down = true;
      addHeat(state, WANTED.crimeHitPed);
      addParticles(state, ped.x, ped.y, '#c23b2e', 14, 180);
      state.audio?.crash(0.5);
      state.toast('A pedestrian was hit! The police are coming.', 3);
    }
  }
}

export function updatePolice(state, dt) {
  // Foot cops chase on foot and shoot when close enough.
  for (const cop of state.cops) {
    const p = state.player;
    const d = dist(cop.x, cop.y, p.x, p.y);
    const targetAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
    cop.angle = targetAngle;
    cop.shootCd -= dt;
    if (d > 46) {
      const sp = 185;
      cop.x += Math.cos(targetAngle) * sp * dt;
      cop.y += Math.sin(targetAngle) * sp * dt;
      const fixed = state.city.resolveBuildings(cop.x, cop.y, 10);
      cop.x = fixed.x;
      cop.y = fixed.y;
    }
    if (d < 340 && cop.shootCd <= 0) {
      cop.shootCd = state.rng.range(0.7, 1.4);
      const spread = state.rng.range(-0.12, 0.12);
      state.bullets.push({
        x: cop.x, y: cop.y,
        vx: Math.cos(targetAngle + spread) * 620,
        vy: Math.sin(targetAngle + spread) * 620,
        life: 0.7, from: 'cop', damage: 7,
      });
      state.audio?.enemyShoot();
    }
    if (d > 1400) cop.gone = true; // lost the trail
  }
  state.cops = state.cops.filter((c) => !c.gone && c.hp > 0);
}

export function updateBullets(state, dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (state.city.pointInBuilding(b.x, b.y, 0)) {
      b.life = 0;
      addParticles(state, b.x, b.y, '#d8c9a0', 4, 90);
      continue;
    }
    const p = state.player;
    if (b.from === 'cop') {
      const hitR = p.onFoot ? 14 : 26;
      const tx = p.onFoot ? p.x : p.car.x;
      const ty = p.onFoot ? p.y : p.car.y;
      if (dist(b.x, b.y, tx, ty) < hitR) {
        b.life = 0;
        if (p.onFoot) damagePlayer(state, b.damage);
        else if (p.car) p.car.hp -= b.damage * 0.5;
        addParticles(state, b.x, b.y, '#ff5a3d', 5, 120);
      }
    } else {
      // Player bullet: cops, peds, then cars.
      for (const cop of state.cops) {
        if (dist(b.x, b.y, cop.x, cop.y) < 14) {
          b.life = 0;
          cop.hp -= b.damage;
          addParticles(state, cop.x, cop.y, '#c23b2e', 8, 140);
          if (cop.hp <= 0) {
            addHeat(state, WANTED.crimeKillCop);
            state.toast('A cop is down! Wanted level rising.', 3);
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const ped of state.peds) {
        if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 12) {
          b.life = 0;
          ped.down = true;
          addHeat(state, WANTED.crimeHitPed);
          addParticles(state, ped.x, ped.y, '#c23b2e', 10, 150);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of state.cars) {
        if (car.driver !== 'player' && dist(b.x, b.y, car.x, car.y) < 26) {
          b.life = 0;
          car.hp -= b.damage;
          addParticles(state, b.x, b.y, '#ffcf5a', 6, 130);
          if (car.hp <= 0) {
            addParticles(state, car.x, car.y, '#ff8a3d', 26, 280);
            state.audio?.crash(1);
            if (car.kind === 'police') addHeat(state, WANTED.crimeKillCop);
            state.cars.splice(state.cars.indexOf(car), 1);
          }
          break;
        }
      }
    }
  }
  state.bullets = state.bullets.filter((b) => b.life > 0);
}

export function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
}

export function damagePlayer(state, amount) {
  if (state.player.invuln > 0 || state.mode !== 'playing') return;
  state.player.health -= amount;
  state.player.invuln = 0.25;
  if (state.player.health <= 0) {
    state.player.health = 0;
    state.mode = 'over';
    state.audio?.fail();
    state.saveGame?.();
  }
}

export function playerShoot(state, wx, wy) {
  const p = state.player;
  if (!p.onFoot || p.shootCd > 0) return false;
  if (p.ammo <= 0) {
    state.toast('Out of ammo — find the green ammo crate by the garage.', 2.5);
    return false;
  }
  p.shootCd = PLAYER.pistolCooldown;
  p.ammo -= 1;
  state.stats.shotsFired += 1;
  const a = Math.atan2(wy - p.y, wx - p.x);
  const muzzleX = p.x + Math.cos(a) * 18;
  const muzzleY = p.y + Math.sin(a) * 18;
  state.bullets.push({
    x: muzzleX, y: muzzleY,
    vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
    life: PLAYER.pistolRange / 780, from: 'player', damage: PLAYER.pistolDamage,
  });
  addParticles(state, muzzleX, muzzleY, '#ffd76a', 5, 120);
  state.audio?.shoot();
  state.recentShotTimer = 1.5;
  if (state.stars === 0) addHeat(state, WANTED.crimeShoot);
  return true;
}

export function playerMelee(state) {
  const p = state.player;
  if (!p.onFoot || p.meleeCd > 0) return;
  p.meleeCd = PLAYER.meleeCooldown;
  state.audio?.melee();
  const a = p.angle;
  const hx = p.x + Math.cos(a) * 30;
  const hy = p.y + Math.sin(a) * 30;
  for (const cop of state.cops) {
    if (dist(hx, hy, cop.x, cop.y) < 30) {
      cop.hp -= PLAYER.meleeDamage;
      addParticles(state, cop.x, cop.y, '#c23b2e', 8, 140);
      if (cop.hp <= 0) addHeat(state, WANTED.crimeKillCop);
    }
  }
  for (const ped of state.peds) {
    if (!ped.down && dist(hx, hy, ped.x, ped.y) < 30) {
      ped.down = true;
      addHeat(state, WANTED.crimeHitPed);
    }
  }
}

export function nearestCar(state, maxD) {
  let best = null;
  let bestD = maxD;
  for (const car of state.cars) {
    const d = dist(state.player.x, state.player.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  p.car = car;
  p.onFoot = false;
  car.driver = 'player';
  car.kind = 'player';
  if (car.kind !== 'police' && state.stars === 0) {
    // Stealing a car the player does not own is a crime — unless it is the
    // mission's own getaway car, which the fixer already paid for.
    if (!(state.mission.phase === 'active' && state.mission.index === 0 && state.mission.step === 0)) {
      addHeat(state, WANTED.crimeCarTheft);
      state.stats.carsStolen += 1;
      state.toast('Car stolen! Someone called the police.', 3);
    }
  }
  state.audio?.pickup();
}

export function exitCar(state, wrecked) {
  const p = state.player;
  const car = p.car;
  if (!car) return;
  car.driver = 'none';
  car.kind = car.kind === 'police' ? 'police' : 'parked';
  car.speed = 0;
  const side = p.angle + Math.PI / 2;
  const nx = car.x + Math.cos(side) * 34;
  const ny = car.y + Math.sin(side) * 34;
  const fixed = state.city.resolveBuildings(nx, ny, 14);
  p.x = fixed.x;
  p.y = fixed.y;
  p.onFoot = true;
  p.car = null;
  if (wrecked) state.toast('Your car is wrecked!', 3);
}
