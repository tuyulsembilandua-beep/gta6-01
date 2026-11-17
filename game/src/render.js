// Solmar Heat — drawing only: the city, the cars and people, the HUD with
// its minimap, and the title / briefing / pause / game-over screens.
// Canvas 2D, warm colours, a golden-hour tint that follows the clock.

import { BLOCK, PALETTE, ROAD, ROAD_HALF, WORLD, clamp } from './config.js';
import { missionMarker, missionObjectiveText } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BRIEF = 'briefing';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * ratio);
    canvas.height = Math.round(view.h * ratio);
  }

  function text(str, x, y, size, color, align, bold) {
    ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCity(state) {
    const city = state.city;
    const cam = state.camera;
    const vw = view.w / cam.zoom;
    const vh = view.h / cam.zoom;
    const x0 = Math.max(0, cam.x - vw / 2 - 60);
    const y0 = Math.max(0, cam.y - vh / 2 - 60);
    const x1 = Math.min(WORLD, cam.x + vw / 2 + 60);
    const y1 = Math.min(WORLD, cam.y + vh / 2 + 60);

    // Ground: grass, with the beach in the south-west corner.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, WORLD - BLOCK, BLOCK, BLOCK);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WORLD - BLOCK + 180, BLOCK, BLOCK - 180);

    // Sidewalk slabs: the block interiors, inset from the road edge.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let bx = 0; bx < WORLD / BLOCK; bx += 1) {
      for (let by = 0; by < WORLD / BLOCK; by += 1) {
        const sx = bx * BLOCK + ROAD_HALF;
        const sy = by * BLOCK + ROAD_HALF;
        if (sx + BLOCK - ROAD > x0 && sx < x1 && sy + BLOCK - ROAD > y0 && sy < y1) {
          ctx.fillRect(sx, sy, BLOCK - ROAD, BLOCK - ROAD);
        }
      }
    }

    // Roads: asphalt bands on every grid line, with dashed centre lines.
    ctx.fillStyle = PALETTE.road;
    for (let i = 0; i <= WORLD / BLOCK; i += 1) {
      const c = i * BLOCK;
      if (c > y0 - ROAD && c < y1 + ROAD) ctx.fillRect(x0, c - ROAD_HALF, x1 - x0, ROAD);
      if (c > x0 - ROAD && c < x1 + ROAD) ctx.fillRect(c - ROAD_HALF, y0, ROAD, y1 - y0);
    }
    ctx.fillStyle = PALETTE.roadLine;
    for (let i = 1; i < WORLD / BLOCK; i += 1) {
      const c = i * BLOCK;
      for (let d = 0; d < WORLD; d += 64) {
        if (c > y0 - 40 && c < y1 + 40 && d > x0 && d < x1) ctx.fillRect(d, c - 2, 30, 4);
        if (c > x0 - 40 && c < x1 + 40 && d > y0 && d < y1) ctx.fillRect(c - 2, d, 4, 30);
      }
    }

    // Buildings: wall, roof, a drop shadow for height, windows.
    for (const b of city.buildings) {
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      const sh = b.height * 5;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + sh, b.y + sh, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      const cols = Math.max(1, Math.floor(b.w / 42));
      const rows = Math.max(1, Math.floor(b.h / 42));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 12 + cx * 42, b.y + 12 + cy * 42, 16, 12);
        }
      }
    }

    // Trees and lamps.
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      ctx.fillStyle = PALETTE.treeDark;
      ctx.beginPath();
      ctx.arc(t.x + 3, t.y + 3, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.tree;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3a3a3a';
    for (const l of city.lamps) {
      if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCarShape(car, isPlayer) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(-26 + 3, -12 + 3, 52, 24, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(-27, -13, 54, 26, 8);
    ctx.fill();
    // Windshield and roof.
    ctx.fillStyle = '#1d2733';
    ctx.fillRect(-6, -10, 12, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(14, -9, 6, 18);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(24, -10, 3, 5);
    ctx.fillRect(24, 5, 3, 5);
    if (car.kind === 'police') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-14, -13, 22, 26);
      ctx.fillStyle = '#20242e';
      text('PD', -12, 5, 11, '#fff', 'left', true);
      // Light bar, flashing with the clock.
      const flash = Math.floor(performance.now() / 280) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e6fff';
      ctx.fillRect(-16, -13, 7, 6);
      ctx.fillStyle = flash ? '#2e6fff' : '#ff2e2e';
      ctx.fillRect(-16, 7, 7, 6);
    }
    if (isPlayer) {
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      roundRect(-29, -15, 58, 30, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPed(ped) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down) {
      ctx.rotate(1.2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(12, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(ped.angle);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(6, 0, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCop(cop) {
    ctx.save();
    ctx.translate(cop.x, cop.y);
    ctx.rotate(cop.angle);
    ctx.fillStyle = '#1d2733';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b48f';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2e6fff';
    ctx.fillRect(-4, -4, 5, 8);
    ctx.restore();
  }

  function drawPlayer(state) {
    const p = state.player;
    if (!p.onFoot) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    // Muzzle flash ring while shooting.
    if (p.shootCd > PLAYER_FLASH) {
      ctx.fillStyle = 'rgba(255,215,106,0.9)';
      ctx.beginPath();
      ctx.arc(20, 0, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2e6fc2';
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8b48f';
    ctx.beginPath();
    ctx.arc(6, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    // Pistol.
    ctx.fillStyle = '#222';
    ctx.fillRect(10, -2, 12, 4);
    ctx.restore();
  }

  function drawMarker(state, now) {
    const target = missionMarker(state);
    if (!target) return;
    const bob = Math.sin(now / 300) * 6;
    ctx.save();
    ctx.translate(target.x, target.y + bob);
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(10, -8);
    ctx.lineTo(26, -8);
    ctx.lineTo(14, 2);
    ctx.lineTo(18, 18);
    ctx.lineTo(0, 8);
    ctx.lineTo(-18, 18);
    ctx.lineTo(-14, 2);
    ctx.lineTo(-26, -8);
    ctx.lineTo(-10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // A guiding line from the player to the marker.
    const p = state.player;
    ctx.strokeStyle = 'rgba(255,215,106,0.35)';
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 12]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawWorld(state, now) {
    const cam = state.camera;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#1a120b';
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.save();
    ctx.translate(view.w / 2, view.h / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawCity(state);
    drawMarker(state, now);
    for (const car of state.cars) drawCarShape(car, car.driver === 'player');
    // Ammo crate by the garage (green, with a pulsing outline while stocked).
    for (const pk of state.pickups) {
      if (pk.taken) continue;
      ctx.fillStyle = '#2e7d32';
      ctx.fillRect(pk.x - 12, pk.y - 9, 24, 18);
      ctx.strokeStyle = `rgba(123,227,130,${0.5 + 0.5 * Math.sin(now / 240)})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(pk.x - 12, pk.y - 9, 24, 18);
      text('AMMO', pk.x, pk.y - 14, 11, '#7be382', 'center', true);
    }
    for (const ped of state.peds) drawPed(ped);
    for (const cop of state.cops) drawCop(cop);
    drawPlayer(state);
    // Bullets as bright streaks.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // Particles.
    for (const pt of state.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Golden-hour tint that follows the in-game clock.
    const hour = (state.clock / 60) % 24;
    const warmth = hour >= 15 && hour <= 19 ? 0.10 : hour >= 6 && hour <= 8 ? 0.05 : 0;
    if (warmth > 0) {
      ctx.fillStyle = `rgba(255,150,60,${warmth})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (hour >= 20 || hour < 6) {
      ctx.fillStyle = 'rgba(10,10,40,0.18)';
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  function drawMinimap(state) {
    const size = 190;
    const x = 16;
    const y = view.h - size - 16;
    const scale = size / WORLD;
    ctx.save();
    ctx.fillStyle = 'rgba(12,12,16,0.78)';
    roundRect(x - 6, y - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.fillStyle = '#2f5a2e';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    for (let i = 0; i <= WORLD / BLOCK; i += 1) {
      const c = i * BLOCK * scale;
      ctx.beginPath();
      ctx.moveTo(x + c, y);
      ctx.lineTo(x + c, y + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + c);
      ctx.lineTo(x + size, y + c);
      ctx.stroke();
    }
    const target = missionMarker(state);
    if (target) {
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.arc(x + target.x * scale, y + target.y * scale, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff2e2e';
    for (const car of state.cars) {
      if (car.kind === 'police') {
        ctx.beginPath();
        ctx.arc(x + car.x * scale, y + car.y * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (const cop of state.cops) {
      ctx.beginPath();
      ctx.arc(x + cop.x * scale, y + cop.y * scale, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(x + p.x * scale, y + p.y * scale);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    text('SOLMAR', x + 2, y + size + 22, 11, 'rgba(255,255,255,0.65)', 'left', true);
  }

  function drawHud(state) {
    const p = state.player;
    // Top-left: health bar, cash, ammo.
    ctx.fillStyle = 'rgba(12,12,16,0.72)';
    roundRect(14, 14, 250, 74, 10);
    ctx.fill();
    text(`$${state.cash}`, 26, 44, 26, '#7be382', 'left', true);
    ctx.fillStyle = '#333';
    roundRect(26, 54, 180, 12, 6);
    ctx.fill();
    ctx.fillStyle = p.health > 30 ? '#4fae5a' : '#e5534b';
    roundRect(26, 54, 180 * clamp(p.health / 100, 0, 1), 12, 6);
    ctx.fill();
    text(`${Math.ceil(p.health)}`, 212, 66, 13, '#fff', 'left', true);
    if (p.onFoot) {
      text(`AMMO ${p.ammo}`, 26, 82, 13, '#ffd76a', 'left', true);
    } else if (p.car) {
      const kmh = Math.round(Math.abs(p.car.speed) * 0.18);
      text(`${kmh} km/h`, 26, 82, 15, '#fff', 'left', true);
    }

    // Top-right: wanted stars + clock.
    const hour = Math.floor((state.clock / 60) % 24);
    const min = Math.floor(state.clock % 60);
    const clockStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    text(clockStr, view.w - 20, 44, 24, '#fff', 'right', true);
    for (let i = 0; i < 5; i += 1) {
      const sx = view.w - 20 - (4 - i) * 30;
      const sy = 66;
      ctx.fillStyle = i < state.stars ? '#ffd76a' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(sx, sy - 9);
      ctx.lineTo(sx + 3, sy - 2);
      ctx.lineTo(sx + 10, sy - 2);
      ctx.lineTo(sx + 5, sy + 3);
      ctx.lineTo(sx + 7, sy + 10);
      ctx.lineTo(sx, sy + 6);
      ctx.lineTo(sx - 7, sy + 10);
      ctx.lineTo(sx - 5, sy + 3);
      ctx.lineTo(sx - 10, sy - 2);
      ctx.lineTo(sx - 3, sy - 2);
      ctx.closePath();
      ctx.fill();
    }

    // Bottom-centre: mission objective.
    const obj = missionObjectiveText(state);
    if (obj) {
      ctx.font = `600 15px ${FONT}`;
      const w = Math.min(view.w - 420, ctx.measureText(obj).width + 28);
      ctx.fillStyle = 'rgba(12,12,16,0.72)';
      roundRect((view.w - w) / 2, view.h - 52, w, 34, 9);
      ctx.fill();
      text(obj, view.w / 2, view.h - 29, 15, '#ffd76a', 'center');
    }

    // Toast message under the top bar.
    if (state.toastText && state.toastUntil > state.now) {
      ctx.font = `600 16px ${FONT}`;
      const w = ctx.measureText(state.toastText).width + 28;
      ctx.fillStyle = 'rgba(12,12,16,0.8)';
      roundRect((view.w - w) / 2, 100, w, 32, 9);
      ctx.fill();
      text(state.toastText, view.w / 2, 122, 16, '#fff', 'center');
    }

    // Controls hint, bottom-right.
    const hint = p.onFoot
      ? 'WASD move · mouse aim · click shoot · F punch · E enter car · M mission · P pause'
      : 'W/S drive · A/D steer · Space handbrake · E exit car · P pause';
    text(hint, view.w - 16, view.h - 16, 12, 'rgba(255,255,255,0.6)', 'right');

    // "Press E" prompt when a car is near on foot.
    if (state.nearCar && p.onFoot) {
      ctx.font = `700 18px ${FONT}`;
      const label = '[E] GET IN THE CAR';
      const w = ctx.measureText(label).width + 24;
      ctx.fillStyle = 'rgba(12,12,16,0.8)';
      roundRect((view.w - w) / 2, view.h - 110, w, 34, 9);
      ctx.fill();
      text(label, view.w / 2, view.h - 87, 18, '#ffd76a', 'center');
    }

    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const w = 640;
    const lineH = 30;
    const h = 150 + lines.length * lineH + 70;
    const x = (view.w - w) / 2;
    const y = (view.h - h) / 2;
    ctx.fillStyle = 'rgba(10,10,14,0.88)';
    roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || '#ffd76a';
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 14);
    ctx.stroke();
    text(title, view.w / 2, y + 64, 40, accent || '#ffd76a', 'center', true);
    lines.forEach((line, i) => {
      text(line, view.w / 2, y + 110 + i * lineH, 17, '#e8e2d0', 'center');
    });
    text(prompt, view.w / 2, y + h - 28, 18, '#ffd76a', 'center', true);
  }

  function draw(state, screen) {
    const now = performance.now();
    if (screen === SCREEN_TITLE) {
      drawWorld(state, now);
      ctx.fillStyle = 'rgba(10,8,6,0.45)';
      ctx.fillRect(0, 0, view.w, view.h);
      const lines = [
        'Solmar — a sun-soaked city of fast cars, fast money and faster cops.',
        'You are Rico Alvarez, fresh out and already in debt to the fixer Mara Voss.',
        'Take her jobs, steal what you need, and do not get caught.',
        '',
        'WASD move · mouse aim · click shoot · E enter / steal cars · M jobs · P pause',
        state.save ? `Saved game found: $${state.save.cash}, ${state.save.missionsDone} jobs done.` : '',
      ].filter((l) => l !== '');
      drawPanel('SOLMAR HEAT', lines, state.save ? 'ENTER start new · C continue saved game' : 'Press ENTER to start', '#ff9a3d');
      return;
    }
    drawWorld(state, now);
    if (screen === SCREEN_PLAY || screen === SCREEN_BRIEF) drawHud(state);
    if (screen === SCREEN_BRIEF && state.mission.def) {
      const d = state.mission.def;
      drawPanel(
        `JOB: ${d.name}`,
        [`From: ${d.giver}`, '', d.brief, '', `Reward: $${d.reward}`],
        'Press ENTER to take the job',
        '#ffd76a',
      );
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['Solmar waits for no one — except right now.', '', `Cash $${state.cash} · Jobs done ${state.stats.missionsDone}`], 'Press P to resume · R to restart', '#fff');
    } else if (screen === SCREEN_OVER) {
      drawPanel(
        'BUSTED — FLATLINED',
        [`Rico is down. The Solmar PD impounded the evidence.`, '', `Cash kept: $${state.cash}`, `Jobs completed: ${state.stats.missionsDone}`, `Cars stolen: ${state.stats.carsStolen}`],
        'Press R to start over',
        '#e5534b',
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}

// Muzzle flash shows for a few frames after a shot.
const PLAYER_FLASH = 0.2;
