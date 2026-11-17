// Solmar Heat — the story jobs. Three missions in a loop, each with a
// briefing, a map marker, a timer where it matters and a cash reward.
// Missions are data + small step functions; the main loop drives them.

import { BLOCK, MISSION_REWARDS, WORLD, dist } from './config.js';

export const MISSION_DEFS = [
  {
    id: 'borrowed-wheels',
    name: 'Borrowed Wheels',
    giver: 'Mara Voss — fixer, Solmar Marina',
    brief: 'Mara needs a ride, no questions asked. Grab any car on the street — the city owes you one — then bring it to the garage on Coral Row. Watch the cops: a fresh theft draws eyes.',
    reward: MISSION_REWARDS[0],
  },
  {
    id: 'sunset-delivery',
    name: 'Sunset Delivery',
    giver: 'Mara Voss — fixer, Solmar Marina',
    brief: 'A sealed case is waiting at the marina kiosk. Pick it up, then get it to the drop on Palm Court before the sun is gone — 90 seconds, and the buyer does not wait twice.',
    reward: MISSION_REWARDS[1],
  },
  {
    id: 'heat-run',
    name: 'Heat Run',
    giver: 'Dario Fontaine — driver, retired (allegedly)',
    brief: 'Dario stashed a package at the old arcade on 5th. The PD is already sniffing around, so expect company. Lift the package, lose the tail or outrun it, and deliver it to the safehouse on Breaker Avenue.',
    reward: MISSION_REWARDS[2],
  },
];

function garagePoint() {
  return { x: 5 * BLOCK + 0, y: 3 * BLOCK, label: 'Garage — Coral Row' };
}

export function startMission(state, index) {
  const def = MISSION_DEFS[index % MISSION_DEFS.length];
  const m = state.mission;
  m.index = index;
  m.phase = 'brief';
  m.step = 0;
  m.timer = 0;
  m.def = def;
  m.text = def.brief;
  if (index % 3 === 0) {
    m.target = garagePoint();
    m.text = def.brief;
  } else if (index % 3 === 1) {
    m.target = { x: 2 * BLOCK, y: 6 * BLOCK, label: 'Pickup — Marina Kiosk' };
  } else {
    m.target = { x: 5 * BLOCK, y: 2 * BLOCK, label: 'Pickup — Old Arcade, 5th' };
  }
  state.mode = 'briefing';
  state.audio?.missionStart();
}

export function acceptMission(state) {
  const m = state.mission;
  m.phase = 'active';
  state.mode = 'playing';
  if (m.index % 3 === 2) {
    // The Heat Run starts hot: the PD is already looking for the package.
    state.heat = Math.max(state.heat, 210);
    state.stars = Math.max(state.stars, 2);
    state.toast('The cops are already on this one. Move!', 3);
  }
  state.toast(`Job started: ${m.def.name}`, 3);
}

// Returns 'done' | 'fail' | null. Called every step while a mission is active.
export function updateMission(state, dt) {
  const m = state.mission;
  if (m.phase !== 'active') return null;
  const p = state.player;
  const kind = m.index % 3;

  if (kind === 0) {
    // Step 0: get in a car. Step 1: drive it to the garage.
    if (m.step === 0) {
      m.text = 'Steal a car — press E near one on the street.';
      if (!p.onFoot) {
        m.step = 1;
        m.text = 'Drive to the garage on Coral Row.';
        state.toast('Now get it to the garage.', 3);
      }
      return null;
    }
    m.text = 'Drive to the garage on Coral Row.';
    if (!p.onFoot && dist(p.x, p.y, m.target.x, m.target.y) < 110) {
      return completeMission(state);
    }
    return null;
  }

  if (kind === 1) {
    if (m.step === 0) {
      m.text = 'Pick up the case at the marina kiosk.';
      if (dist(p.x, p.y, m.target.x, m.target.y) < 70) {
        m.step = 1;
        m.timer = 90;
        m.target = { x: 6 * BLOCK, y: 5 * BLOCK, label: 'Drop — Palm Court' };
        state.audio?.pickup();
        state.toast('Case grabbed. 90 seconds to Palm Court!', 3);
      }
      return null;
    }
    m.timer -= dt;
    m.text = `Deliver the case to Palm Court — ${Math.ceil(m.timer)}s left.`;
    if (m.timer <= 0) {
      state.audio?.fail();
      state.toast('Too slow — the buyer walked away.', 3);
      return 'fail';
    }
    if (dist(p.x, p.y, m.target.x, m.target.y) < 80) {
      return completeMission(state);
    }
    return null;
  }

  // kind === 2: Heat Run.
  if (m.step === 0) {
    m.text = 'Grab the package at the old arcade on 5th.';
    if (dist(p.x, p.y, m.target.x, m.target.y) < 70) {
      m.step = 1;
      m.target = { x: 1 * BLOCK, y: 1 * BLOCK, label: 'Safehouse — Breaker Avenue' };
      state.audio?.pickup();
      state.toast('Package secured. Get to the safehouse!', 3);
    }
    return null;
  }
  m.text = 'Deliver the package to the safehouse — lose the cops if you can.';
  if (dist(p.x, p.y, m.target.x, m.target.y) < 80) {
    return completeMission(state);
  }
  return null;
}

function completeMission(state) {
  const m = state.mission;
  const reward = m.def.reward + Math.floor(state.mission.index / 3) * 150;
  state.cash += reward;
  state.stats.missionsDone += 1;
  state.audio?.cash();
  state.toast(`Job done! +$${reward}`, 4);
  state.saveGame?.();
  m.phase = 'done';
  m.text = `${m.def.name} complete — +$${reward}.`;
  // The next job opens after a breather; the loop then repeats, richer.
  m.nextTimer = 3;
  return 'done';
}

// After a completed job, wait out the breather then brief the next one.
// After a failed job, wait out the breather then re-brief the same one.
export function updateMissionFlow(state, dt) {
  const m = state.mission;
  if ((m.phase === 'done' || m.phase === 'failed') && m.nextTimer > 0) {
    m.nextTimer -= dt;
    if (m.nextTimer <= 0) {
      startMission(state, m.phase === 'failed' ? m.index : m.index + 1);
    }
  }
}

export function missionMarker(state) {
  const m = state.mission;
  if (m.phase !== 'active') return null;
  return m.target;
}

export function missionObjectiveText(state) {
  const m = state.mission;
  if (m.phase === 'brief') return m.def ? `${m.def.name}: ${m.def.brief}` : '';
  if (m.phase === 'active') return m.text;
  if (m.phase === 'done') return m.text;
  return 'No job right now — drive around Solmar, or wait for Mara to call.';
}

export function startFirstMission(state) {
  startMission(state, 0);
}
