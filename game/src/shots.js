// Basalt Horizon — shots.js
// Deterministic screenshot staging: ?shot= picks a scripted moment of the
// real game — a banked run at a golden ring with the runway beyond it, a
// final approach with the PAPI lit, a cockpit view over the volcano, or the
// title screen over a parked aircraft at sunset. The scene is the game's own
// code rendering its own world; only the starting pose is staged.

import { CONFIG } from './config.js';

export function getShotParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || null,
    seed: Number(q.get('seed') || 1),
  };
}

// Staging poses: each one lines the next ring up with a runway beyond it.
const POSES = {
  // Cover: courier ring 4 with the East Isle cliff strip dead ahead. The
  // aircraft sits 30 m left and 8 m below the ring line, 200 m out, so the
  // golden gate shows clear above the nose instead of hiding behind the
  // fuselage, and the strip shows beyond it.
  ring: {
    mission: 'courier',
    pos: [730, 84, -20],
    heading: 0,
    pitch: 0.03,
    roll: 0.38,
    speed: 58,
    throttle: 0.82,
    fuel: 74,
    hull: 100,
    ringsPassed: 3,
    camera: 'chase',
    message: 'RING 4/5 — NEXT RING IS GOLD',
  },
  // Final approach to East Isle: 130 m out, on the glide slope, the short
  // strip and its PAPI lamps ahead.
  landing: {
    mission: 'courier',
    pos: [536, 18, 293],
    heading: 1.2,
    pitch: -0.03,
    roll: 0.05,
    speed: 42,
    throttle: 0.35,
    fuel: 41,
    hull: 96,
    ringsPassed: 5,
    camera: 'chase',
    message: 'FINAL — EAST ISLE, PAPI 2 RED 2 WHITE',
  },
  // Cockpit view over the volcano on the slalom.
  cockpit: {
    mission: 'slalom',
    pos: [-300, 135, -300],
    heading: -2.16,
    pitch: 0.05,
    roll: -0.12,
    speed: 62,
    throttle: 0.85,
    fuel: 81,
    hull: 100,
    ringsPassed: 1,
    camera: 'cockpit',
    message: 'RING 2/6 — CALDERA SLALOM',
  },
  // Title screen: the aircraft parked on Home Field at sunset.
  title: {
    mission: 'slalom',
    pos: [-180, 6.6, 120],
    heading: 0.35,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 100,
    hull: 100,
    ringsPassed: 0,
    camera: 'title',
    message: null,
  },
};

export function shotPose(name) {
  return POSES[name] || null;
}

// Apply a staged pose to a live flight state + mission runner.
export function applyShotPose(pose, state, runner) {
  state.pos = [pose.pos[0], pose.pos[1], pose.pos[2]];
  state.heading = pose.heading;
  state.pitch = pose.pitch;
  state.roll = pose.roll;
  state.speed = pose.speed;
  state.throttle = pose.throttle;
  state.fuel = pose.fuel;
  state.hull = pose.hull;
  state.phase = pose.speed > 0 ? 'flying' : 'parked';
  state.onGround = pose.speed === 0;
  state.score = pose.ringsPassed * 100 + (pose.ringsPassed >= 5 ? 0 : 0);
  state.ringsFlown = pose.ringsPassed;
  state.time = 62 + pose.ringsPassed * 17;
  for (let i = 0; i < pose.ringsPassed; i++) {
    const r = runner.course.rings[i];
    if (r) r.passed = true;
  }
  runner.course.nextIndex = pose.ringsPassed;
  if (pose.message) state.messages.push(pose.message);
}
