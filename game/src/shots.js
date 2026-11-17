// Solmar Heat — deterministic screenshot scenes behind ?shot=start|drive|
// chase|mission (&seed=N). Each one sets up the real game from a fixed seed,
// steers it with a simple autopilot for a fixed number of steps, then the
// main loop paints one frame and sets window.__shotDone = true.

import { BLOCK, STEP } from './config.js';
import { isOnRoad, roadCenter } from './city.js';
import { makeCar } from './entities.js';
import { startMission } from './missions.js';
import { addHeat } from './wanted.js';

export const SHOT_NAMES = ['start', 'drive', 'chase', 'mission'];

export function parseShot() {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('shot');
  if (!kind || !SHOT_NAMES.includes(kind)) return null;
  const seed = Number(params.get('seed') || '1') || 1;
  return { kind, seed };
}

// The autopilot: drives toward a point, steering and throttling like a
// player would, and aims the pistol at the nearest cop when on foot.
// It follows the streets: the waypoint is always on a road centre line,
// so the car turns at intersections instead of cutting across blocks.
export function driveAutopilot(state) {
  const p = state.player;
  const target = state.shotTarget || { x: 1600, y: 1600 };
  if (!p.onFoot && p.car) {
    const car = p.car;
    const cx = roadCenter(car.x);
    const cy = roadCenter(car.y);
    let wp;
    if (!isOnRoad(car.x, car.y)) {
      // Off the streets (a parked car on a curb): head for the nearest corner.
      wp = { x: cx, y: cy };
    } else if (Math.abs(target.x - car.x) > Math.abs(target.y - car.y)) {
      wp = { x: car.x + Math.sign(target.x - car.x) * 400, y: cy };
    } else {
      wp = { x: cx, y: car.y + Math.sign(target.y - car.y) * 400 };
    }
    const want = Math.atan2(wp.y - car.y, wp.x - car.x);
    const diff = ((want - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));
    // Stuck against a wall at low speed: reverse out for a second.
    const auto = state.auto || (state.auto = { stuckFrames: 0, reversingFrames: 0 });
    if (auto.reversingFrames > 0) {
      auto.reversingFrames -= 1;
      return { mx: -steer, my: 1, aimX: target.x, aimY: target.y, fire: false, handbrake: false, sprint: false };
    }
    if (Math.abs(car.speed) < 25) {
      auto.stuckFrames += 1;
      if (auto.stuckFrames > 60) {
        auto.stuckFrames = 0;
        auto.reversingFrames = 60;
        return { mx: -steer, my: 1, aimX: target.x, aimY: target.y, fire: false, handbrake: false, sprint: false };
      }
    } else if (Math.abs(car.speed) > 80) {
      auto.stuckFrames = 0;
    }
    // Facing the wrong way at low speed: reverse out instead of grinding.
    const reverse = Math.abs(diff) > 1.7 && Math.abs(car.speed) < 80;
    // Coast through sharp turns so the turning circle stays tight.
    const throttle = reverse ? 1 : Math.abs(diff) > 0.7 ? 0 : -1;
    return {
      mx: reverse ? -steer : steer,
      my: throttle,
      aimX: target.x, aimY: target.y, fire: false, handbrake: false, sprint: false,
    };
  }
  // On foot: walk toward the target, aim at it.
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  return { mx: dx / d, my: dy / d, aimX: target.x, aimY: target.y, fire: false, handbrake: false, sprint: false };
}

export function setupShot(state, shot) {
  state.shot = shot;
  state.mode = 'playing';
  const p = state.player;

  if (shot.kind === 'start') {
    state.mode = 'title';
    state.shotFrames = 240;
    return;
  }

  if (shot.kind === 'drive') {
    // Player driving east down Coral Row in traffic, HUD and minimap on.
    // The car starts on the road centre line, already rolling, so the shot
    // shows the drive instead of a parking manoeuvre.
    const car = nearestParkedTo(state, 4 * BLOCK, 4 * BLOCK);
    p.x = 600;
    p.y = 3 * BLOCK;
    state.player.car = car;
    state.player.onFoot = false;
    car.driver = 'player';
    car.kind = 'player';
    car.x = p.x;
    car.y = p.y;
    car.angle = 0;
    car.speed = 300;
    state.shotTarget = { x: 6 * BLOCK, y: 3 * BLOCK };
    state.shotBreakDist = 150;
    state.shotFrames = 300;
    // Two traffic cars ahead on the same street, so the frame shows the
    // player weaving through traffic instead of an empty road.
    for (const [tx, ty] of [[1900, 3 * BLOCK], [2150, 3 * BLOCK + 18]]) {
      const t = makeCar(state, tx, ty, 0, 'traffic', 'ai');
      t.axis = 'h';
      t.dir = 1;
      t.speed = 150;
      state.cars.push(t);
    }
    return;
  }

  if (shot.kind === 'chase') {
    const car = nearestParkedTo(state, 4 * BLOCK, 4 * BLOCK);
    p.x = 600;
    p.y = 3 * BLOCK;
    state.player.car = car;
    state.player.onFoot = false;
    car.driver = 'player';
    car.kind = 'player';
    car.x = p.x;
    car.y = p.y;
    car.angle = 0;
    car.speed = 320;
    addHeat(state, 310); // three stars, police already rolling
    state.shotTarget = { x: 6 * BLOCK, y: 3 * BLOCK };
    state.shotBreakDist = 150;
    state.shotFrames = 360;
    // Two police cars right behind the player, in frame, lights flashing.
    for (const [px, py] of [[350, 3 * BLOCK], [200, 3 * BLOCK - 18]]) {
      const pc = makeCar(state, px, py, 0, 'police', 'ai');
      pc.axis = 'h';
      pc.dir = 1;
      pc.speed = 420;
      state.cars.push(pc);
    }
    return;
  }

  // mission: the Sunset Delivery mid-run, marker and timer on the HUD.
  const car = nearestParkedTo(state, 4 * BLOCK, 4 * BLOCK);
  p.x = 800;
  p.y = 5 * BLOCK;
  state.player.car = car;
  state.player.onFoot = false;
  car.driver = 'player';
  car.kind = 'player';
  car.x = p.x;
  car.y = p.y;
  car.angle = 0;
  car.speed = 300;
  startMission(state, 1);
  state.mode = 'playing';
  state.mission.phase = 'active';
  state.mission.step = 1;
  state.mission.timer = 62;
  state.mission.target = { x: 6 * BLOCK, y: 5 * BLOCK, label: 'Drop — Palm Court' };
  state.shotTarget = state.mission.target;
  state.shotBreakDist = 260;
  state.shotFrames = 300;
}

export function shotFrameCount(state) {
  return state.shotFrames || 300;
}

// The parked car nearest a point: shots start in the middle of the city,
// not wedged against the world edge.
function nearestParkedTo(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const car of state.cars) {
    if (car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best || state.cars[0];
}
