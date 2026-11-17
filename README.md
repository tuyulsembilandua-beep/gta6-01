# Solmar Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/tuyulsembilandua-beep/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/tuyulsembilandua-beep/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game for [make.fun](https://make.fun/bounty/gta6-01)'s gta6-01 bounty: explore the sun-soaked city of Solmar on foot and by car, steal what you need, take jobs from the fixer Mara Voss, and outrun the Solmar PD under a 1–5 star wanted level. You are Rico Alvarez, fresh out and already in debt — three story jobs loop with rising rewards, traffic and pedestrians fill the streets, and every crime you commit draws the cops closer.

## What is in the game

- **A city to explore** — an 8×8 street grid with blocks of buildings, sidewalks, trees, a beach and a park, all drawn in a warm golden-hour palette with a clock that moves the light.
- **On foot and by car** — walk with WASD and mouse aim, or press E to get into (steal) any parked or traffic car. Arcade driving with steering, handbrake and crashes.
- **Traffic and pedestrians** — cars follow the roads and turn at intersections; pedestrians walk the sidewalks and flee gunfire and speeding cars.
- **Wanted system** — 1–5 stars for car theft, hitting pedestrians, shooting and killing cops. Police cars chase and ram; foot cops chase and shoot back. Lose them and the heat cools off.
- **Missions and story** — three jobs in a loop with briefings, map markers, timers and cash rewards: *Borrowed Wheels* (steal a car, deliver it to the garage), *Sunset Delivery* (a 90-second case run) and *Heat Run* (a pickup under police attention).
- **Combat** — pistol with ammo (restock at the ammo crate by the garage) and a melee punch. Health, game over and restart.
- **HUD** — health, cash, wanted stars, clock, speed, mission objective, and a live minimap with player, police and mission markers.
- **Sound** — everything synthesised with the Web Audio API: engine hum, police sirens, gunshots, crashes and cash.
- **Save / continue** — progress autosaves to localStorage; continue a saved game from the title screen.

## Controls

- WASD / arrow keys — walk (on foot) or drive (in a car)
- Mouse — aim, click — shoot (on foot)
- Shift — sprint · F — punch · E — enter / exit a car · Space — handbrake (in a car)
- M — mission briefing · P — pause · R — restart after game over

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

Plain static files under `game/` — no build step, no network request, no library. All sound is synthesised with the Web Audio API. Screenshots in `screenshots/` are deterministic renders of the game itself (`?shot=start|drive|chase|mission&seed=1`).

## Files

- `game/index.html` — the page and canvas
- `game/src/main.js` — boot, the loop, save/continue, the state machine
- `game/src/config.js` — all tuning and the palette in one place
- `game/src/city.js` — Solmar: street grid, buildings, roads, collision
- `game/src/entities.js` — traffic, pedestrians, police, bullets, particles, cars
- `game/src/wanted.js` — heat, stars, police spawns, cooldown
- `game/src/missions.js` — the three story jobs and their flow
- `game/src/render.js` — everything drawn: city, HUD, minimap, screens
- `game/src/input.js`, `game/src/audio.js`, `game/src/random.js`, `game/src/shots.js` — devices, synth SFX, seeded RNG, screenshot mode
- `main.ts` — hands the game in (copies `game/` + `screenshots/`, writes `dossier.json`)

---

<sub>Entered on [make.fun](https://make.fun/?ref=h914r6pd&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
