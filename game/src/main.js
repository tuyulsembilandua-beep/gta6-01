// Solmar Heat — boot and the one loop. Builds the state, reads input into a
// virtual input each frame, steps the simulation in fixed 1/60 s steps and
// paints it. Screens: title, playing, briefing, paused, game over.
// ?shot=start|drive|chase|mission&seed=N runs a fixed scripted scene instead.

import { BLOCK, CAR, PLAYER, SAVE_KEY, STEP, WORLD, clamp } from './config.js';
import { makeRng } from './random.js';
import { buildCity } from './city.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  damagePlayer,
  enterCar,
  exitCar,
  nearestCar,
  playerMelee,
  playerShoot,
  spawnParked,
  spawnPeds,
  spawnTraffic,
  updateBullets,
  updateCars,
  updateParticles,
  updatePeds,
  updatePlayerCar,
  updatePolice,
} from './entities.js';
import { updateWanted } from './wanted.js';
import { acceptMission, missionObjectiveText, startFirstMission, startMission, updateMission, updateMissionFlow } from './missions.js';
import { createRenderer } from './render.js';
import { driveAutopilot, parseShot, setupShot, shotFrameCount } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = parseShot();
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

function createState(seedValue) {
  const rng = makeRng(seedValue);
  const city = buildCity(rng);
  const state = {
    rng,
    city,
    audio,
    mode: 'title',
    now: 0,
    clock: 16 * 60, // 16:00 — golden hour over Solmar
    cash: 120,
    heat: 0,
    stars: 0,
    unseenTimer: 0,
    spawnTimer: 0,
    recentShotTimer: 0,
    player: {
      x: 4 * BLOCK - 60, y: 4 * BLOCK + 20,
      angle: 0, onFoot: true, car: null,
      health: PLAYER.health, ammo: PLAYER.pistolAmmo,
      shootCd: 0, meleeCd: 0, invuln: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    bullets: [],
    particles: [],
    pickups: [{ x: 5 * BLOCK - 40, y: 3 * BLOCK + 60, kind: 'ammo', taken: false }],
    mission: { index: -1, phase: 'none', step: 0, timer: 0, target: null, def: null, text: '', nextTimer: 0 },
    camera: { x: 4 * BLOCK - 60, y: 4 * BLOCK + 20, zoom: 1 },
    stats: { missionsDone: 0, carsStolen: 0, shotsFired: 0 },
    toastText: '',
    toastUntil: 0,
    nearCar: null,
    shot: null,
    shotTarget: null,
    shotFrames: 0,
    save: null,
  };
  spawnTraffic(state, 14);
  spawnParked(state);
  spawnPeds(state, 26);
  // A toast the simulation modules can call: text + seconds on screen.
  state.toast = (text, seconds) => {
    state.toastText = text;
    state.toastUntil = state.now + seconds;
    status.textContent = text;
  };
  // A save the simulation modules can trigger (mission done, game over).
  state.saveGame = () => saveGame(state);
  return state;
}

function toast(state, text, seconds) {
  state.toast(text, seconds);
}

function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: state.cash,
      missionsDone: state.stats.missionsDone,
      health: state.player.health,
      ammo: state.player.ammo,
      x: state.player.x,
      y: state.player.y,
      clock: state.clock,
      missionIndex: Math.max(0, state.mission.index),
    }));
  } catch {
    // Storage off: the save lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function applySave(state, save) {
  state.cash = save.cash;
  state.stats.missionsDone = save.missionsDone || 0;
  state.player.health = save.health || PLAYER.health;
  state.player.ammo = save.ammo ?? PLAYER.pistolAmmo;
  state.player.x = save.x;
  state.player.y = save.y;
  state.clock = save.clock || 16 * 60;
  state.camera.x = save.x;
  state.camera.y = save.y;
  startMission(state, save.missionIndex || 0);
  state.mode = 'playing';
  state.mission.phase = 'active';
}

// One fixed simulation step. `vin` is the virtual input for this step.
function stepGame(state, vin, dt) {
  const p = state.player;
  state.now += dt;
  state.clock += dt * 0.5; // one game hour every two real minutes
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.meleeCd = Math.max(0, p.meleeCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  state.recentShotTimer = Math.max(0, state.recentShotTimer - dt);

  if (state.mode === 'playing') {
    if (p.onFoot) {
      // Aim at the mouse; move with WASD.
      p.angle = Math.atan2(vin.aimY - p.y, vin.aimX - p.x);
      const len = Math.hypot(vin.mx, vin.my) || 1;
      const speed = vin.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const nx = p.x + (vin.mx / len) * speed * dt * (vin.mx || vin.my ? 1 : 0);
      const ny = p.y + (vin.my / len) * speed * dt * (vin.mx || vin.my ? 1 : 0);
      const fixed = state.city.resolveBuildings(nx, ny, PLAYER.radius);
      p.x = fixed.x;
      p.y = fixed.y;
      state.nearCar = nearestCar(state, 64);
      if (vin.fire) playerShoot(state, vin.aimX, vin.aimY);
      if (vin.melee) playerMelee(state);
    } else if (p.car) {
      updatePlayerCar(state, p.car, vin, dt);
      p.x = p.car.x;
      p.y = p.car.y;
      p.angle = p.car.angle;
      state.nearCar = null;
    }

    // Ammo crate by the garage restocks the pistol.
    for (const pk of state.pickups) {
      if (!pk.taken && Math.hypot(p.x - pk.x, p.y - pk.y) < 40) {
        pk.taken = true;
        p.ammo += 24;
        audio.pickup();
        toast(state, 'Ammo restocked (+24).', 2.5);
      }
    }

    updateCars(state, dt);
    updatePeds(state, dt);
    updatePolice(state, dt);
    updateBullets(state, dt);
    updateParticles(state, dt);
    updateWanted(state, dt);
    const result = updateMission(state, dt);
    if (result === 'fail') {
      state.mission.phase = 'failed';
      state.mission.nextTimer = 3;
    }
    updateMissionFlow(state, dt);

    // Keep traffic and pedestrians topped up.
    if (state.cars.filter((c) => c.kind === 'traffic').length < 10) spawnTraffic(state, 2);
    if (state.peds.filter((pd) => !pd.down).length < 16) spawnPeds(state, 4);

    // Autosave every 15 seconds of play.
    if (Math.floor(state.now) % 15 === 0 && Math.floor(state.now - dt) % 15 !== 0) saveGame(state);
  } else {
    // Title backdrop: the city lives on without the player.
    updateCars(state, dt);
    updatePeds(state, dt);
    updateParticles(state, dt);
  }

  // Camera chases the player, gently.
  const cam = state.camera;
  cam.x += (p.x - cam.x) * Math.min(1, dt * 4);
  cam.y += (p.y - cam.y) * Math.min(1, dt * 4);
  cam.zoom = p.onFoot ? 1 : 0.92;
}

// Build the virtual input from the real keyboard/mouse for one frame.
function readRealInput(input, state) {
  const p = state.player;
  const view = renderer.view;
  const aimX = state.camera.x + (input.mouse.x - view.w / 2) / state.camera.zoom;
  const aimY = state.camera.y + (input.mouse.y - view.h / 2) / state.camera.zoom;
  if (p.onFoot) {
    const mx = (input.isDown('d', 'ArrowRight') ? 1 : 0) - (input.isDown('a', 'ArrowLeft') ? 1 : 0);
    const my = (input.isDown('s', 'ArrowDown') ? 1 : 0) - (input.isDown('w', 'ArrowUp') ? 1 : 0);
    return {
      mx, my, aimX, aimY,
      fire: input.mouse.down,
      melee: input.wasPressed('f'),
      sprint: input.isDown('Shift'),
      handbrake: false,
    };
  }
  return {
    mx: (input.isDown('d', 'ArrowRight') ? 1 : 0) - (input.isDown('a', 'ArrowLeft') ? 1 : 0),
    my: (input.isDown('w', 'ArrowUp') ? -1 : 0) + (input.isDown('s', 'ArrowDown') ? 1 : 0),
    aimX, aimY,
    fire: false,
    melee: false,
    sprint: false,
    handbrake: input.isDown(' '),
  };
}

function runShotMode() {
  const state = createState(shot.seed);
  state.save = null;
  setupShot(state, shot);
  const frames = shotFrameCount(state);
  // Debug hook: lets a playtest sample the scripted run frame by frame.
  window.__solmar = {
    get state() {
      return state;
    },
    frame: 0,
  };
  for (let i = 0; i < frames; i += 1) {
    const vin = state.mode === 'title'
      ? { mx: 0, my: 0, aimX: 0, aimY: 0, fire: false, melee: false, sprint: false, handbrake: false }
      : driveAutopilot(state);
    stepGame(state, vin, STEP);
    window.__solmar.frame = i;
    if (state.mode === 'over') break;
    // Freeze the frame once the car has nearly reached its target, while
    // it is still rolling, instead of grinding on past it.
    if (state.shotTarget && state.shotBreakDist) {
      const p = state.player;
      if (Math.hypot(p.x - state.shotTarget.x, p.y - state.shotTarget.y) < state.shotBreakDist) break;
    }
  }
  // Paint twice (fonts settle), then flag the frame ready for the screenshot.
  let painted = 0;
  function paint() {
    renderer.draw(state, state.mode === 'title' ? 'title' : 'play');
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotDone = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let state = createState(seed);
  state.save = readSave();
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  function startNew() {
    // A fresh state object entirely: merging with Object.assign would leave
    // the toast/save closures pointing at the old object's numbers.
    state = createState(Math.floor(Math.random() * 4294967296));
    state.save = readSave();
    state.mode = 'playing';
    startFirstMission(state);
    audio.unlock();
    toast(state, 'Welcome to Solmar. Mara has a job for you.', 4);
    status.textContent = 'Playing Solmar Heat.';
  }

  function handleKeys() {
    const p = state.player;
    if (state.mode === 'title') {
      if (input.wasPressed('Enter', ' ')) startNew();
      else if (input.wasPressed('c') && state.save) {
        state = createState(Math.floor(Math.random() * 4294967296));
        state.save = readSave();
        applySave(state, state.save);
        audio.unlock();
        toast(state, 'Welcome back to Solmar.', 3);
      }
      return;
    }
    if (state.mode === 'briefing') {
      if (input.wasPressed('Enter', ' ')) {
        acceptMission(state);
        audio.unlock();
      }
      return;
    }
    if (state.mode === 'over') {
      if (input.wasPressed('r', 'Enter', ' ')) startNew();
      return;
    }
    if (state.mode === 'paused') {
      if (input.wasPressed('p', 'Escape', 'Enter')) state.mode = 'playing';
      else if (input.wasPressed('r')) startNew();
      return;
    }
    // Playing.
    if (input.wasPressed('p', 'Escape')) {
      state.mode = 'paused';
      saveGame(state);
      return;
    }
    if (input.wasPressed('m')) {
      state.mode = 'briefing';
      return;
    }
    if (input.wasPressed('e')) {
      if (p.onFoot && state.nearCar) enterCar(state, state.nearCar);
      else if (!p.onFoot) exitCar(state, false);
    }
    if (input.wasPressed('r') && p.health <= 0) startNew();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleKeys();
    if (state.mode === 'playing' || state.mode === 'title') {
      while (accumulator >= STEP && (state.mode === 'playing' || state.mode === 'title')) {
        stepGame(state, readRealInput(input, state), STEP);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(state, state.mode);
    const speedRatio = state.player.car ? Math.abs(state.player.car.speed) / CAR.maxSpeed : 0;
    audio.update(STEP, speedRatio, state.stars);
    input.endFrame();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.mode === 'playing') {
      state.mode = 'paused';
      saveGame(state);
    }
  });

  status.textContent = 'Solmar Heat. Press Enter to start.';
  // Debug hook for automated playtests (not part of the game itself).
  window.__solmar = {
    get state() {
      return state;
    },
    teleport(x, y) {
      state.player.x = x;
      state.player.y = y;
      if (state.player.car) {
        state.player.car.x = x;
        state.player.car.y = y;
      }
      state.camera.x = x;
      state.camera.y = y;
    },
    setHeat(h) {
      state.heat = h;
      state.stars = Math.min(5, Math.floor(h / 100));
    },
    hurt(amount) {
      state.player.health -= amount;
      if (state.player.health <= 0) {
        state.player.health = 0;
        state.mode = 'over';
      }
    },
  };
  requestAnimationFrame(frame);
}

if (shot) runShotMode();
else runGame();
