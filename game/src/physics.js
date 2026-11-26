// Basalt Horizon — physics.js
// The flight model: arcade at heart, but throttle, bank and pitch discipline
// decide everything. Speed comes from throttle against drag; lift needs
// speed; banking turns the nose; the wind pushes the airframe sideways; fuel
// burns with throttle; a hard arrival hurts the airframe.

import { CONFIG } from './config.js';
import { clamp, lerp } from './math3.js';
import { heightAt, runwayAt } from './noise.js';

export function makeFlightState(mission) {
  const home = CONFIG.runways[0];
  return {
    // Pose: parked on Home Field's strip, gear on the deck.
    pos: [home.x, heightAt(home.x, home.z) + 0.6, home.z],
    heading: home.heading, // radians, 0 = +Z... see forward()
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    // Resources.
    fuel: mission.fuelStart,
    hull: 100,
    // Flight phase: 'parked' | 'flying' | 'landed' | 'crashed'.
    phase: 'parked',
    onGround: true,
    // Scoring.
    score: 0,
    ringsFlown: 0,
    landings: 0,
    time: 0,
    messages: [],
    // Last impact, for the crash readout.
    lastImpact: 0,
  };
}

// Forward vector from heading/pitch (heading 0 faces +Z, turning left is +).
export function forwardVector(heading, pitch) {
  return [
    Math.sin(heading) * Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(heading) * Math.cos(pitch),
  ];
}

export function stepFlight(state, input, dt, mission) {
  const f = CONFIG.flight;
  const wind = CONFIG.wind;
  state.time += dt;
  const prevPos = [state.pos[0], state.pos[1], state.pos[2]];

  // --- Throttle: Shift (or W) up, Ctrl (or S) down, clamped 0..1. ---
  if (input.throttleUp) state.throttle = clamp(state.throttle + dt * 0.9, 0, 1);
  if (input.throttleDown) state.throttle = clamp(state.throttle - dt * 0.9, 0, 1);
  if (state.fuel <= 0) state.throttle = 0;

  // --- Pitch and roll ease toward the pilot's command. ---
  // ArrowUp / W pulls the nose up (climb); ArrowDown / S pushes it down.
  const pitchTarget = (input.pitchUp ? 1 : 0) + (input.pitchDown ? -1 : 0);
  const rollTarget = (input.rollLeft ? 1 : 0) + (input.rollRight ? -1 : 0);
  state.pitch = lerp(state.pitch, pitchTarget * f.maxPitch, Math.min(1, dt * 3.2));
  state.roll = lerp(state.roll, rollTarget * f.maxBank, Math.min(1, dt * 3.0));

  // --- Speed: throttle pushes, drag pulls, climbing costs speed. ---
  const targetSpeed = state.throttle * f.maxSpeed;
  let accel = (targetSpeed - state.speed) * 0.42;
  accel -= Math.sin(state.pitch) * 14; // climbing bleeds speed
  state.speed = clamp(state.speed + accel * dt - state.speed * f.drag * 0.12 * dt, 0, f.maxSpeed);

  // --- Heading follows the bank; a level turn needs speed. ---
  if (state.speed > 8) {
    state.heading += Math.sin(state.roll) * f.turnRate * (state.speed / f.cruiseSpeed) * dt;
  }

  // --- Vertical speed: lift needs airspeed; below stall the wing quits.
  // On the gear the aircraft sits level: no sinking through the strip.
  const liftFactor = clamp(state.speed / f.stallSpeed, 0, 1.25);
  let vs = Math.sin(state.pitch) * f.climbRate * liftFactor;
  if (state.speed < f.stallSpeed && !state.onGround) vs -= (f.stallSpeed - state.speed) * 0.32;
  if (state.onGround) vs = 0;
  state.verticalSpeed = vs;

  // --- Integrate, with the crosswind shoving the airframe sideways. ---
  const fwd = forwardVector(state.heading, state.pitch);
  state.pos[0] += (fwd[0] * state.speed + wind.x * 0.35) * dt;
  state.pos[1] += vs * dt;
  state.pos[2] += (fwd[2] * state.speed + wind.z * 0.35) * dt;

  // --- Fuel: full throttle burns ~1.8x the idle rate. ---
  const burn = (f.fuelBurnIdle + (f.fuelBurn - f.fuelBurnIdle) * state.throttle) * (state.onGround ? 0.4 : 1);
  state.fuel = Math.max(0, state.fuel - burn * dt);

  // --- Ground contact. ---
  const ground = heightAt(state.pos[0], state.pos[2]);
  const runway = runwayAt(state.pos[0], state.pos[2]);
  const clearance = state.pos[1] - ground;
  if (clearance <= 0.6) {
    state.pos[1] = ground + 0.6;
    const impact = -vs;
    // Rotate and lift off again after a stop: speed, then pitch up.
    const rotating = (state.phase === 'landed' || state.phase === 'parked')
      && state.speed > f.stallSpeed && state.pitch > 0.12;
    if (rotating) {
      state.phase = 'flying';
      state.onGround = false;
      state.pos[1] = ground + 1.4;
      state.messages.push('AIRBORNE');
    } else if (state.phase === 'flying') {
      // Only a flying aircraft can land or crash: a parked one just rolls.
      const aligned = runway !== null;
      const gentle = impact < f.crashSpeed * 0.4 && state.speed < 42 && Math.abs(state.roll) < 0.25;
      if (aligned && gentle && state.speed > 6) {
        // A landing: the sortie pauses on the strip.
        state.phase = 'landed';
        state.onGround = true;
        state.landings++;
        state.score += CONFIG.score.landing + (impact < 4 ? CONFIG.score.softLandingBonus : 0);
        state.messages.push(impact < 4 ? 'SMOOTH LANDING! +' + (CONFIG.score.landing + CONFIG.score.softLandingBonus) : 'LANDED +' + CONFIG.score.landing);
        state.lastImpact = impact;
      } else if (impact > f.crashSpeed || state.speed > 60 || (!aligned && impact > 6)) {
        // A crash: hard arrival, fast into rough ground, or a ditch in the sea.
        state.phase = 'crashed';
        state.onGround = true;
        state.hull = Math.max(0, state.hull - f.damagePerHardHit - impact * 2);
        state.lastImpact = impact;
        state.messages.push(impact > 12 ? 'CRASHED — hard impact' : 'CRASHED — gear up on rough ground');
        if (state.hull <= 0) state.messages.push('AIRFRAME DESTROYED');
      } else {
        // Rough touchdown on rough ground: down, but no landing points, and
        // a hard one still hurts the airframe.
        state.phase = 'landed';
        state.onGround = true;
        state.speed *= 0.85;
        if (impact > 6) {
          state.hull = Math.max(0, state.hull - 8);
          state.messages.push('ROUGH TOUCHDOWN — hull ' + Math.round(state.hull) + '%');
        }
      }
    }
    if (state.phase === 'parked' && state.throttle < 0.1) {
      state.speed = Math.max(0, state.speed - 6 * dt); // rolling friction
    }
    if (state.phase === 'landed' || state.phase === 'crashed') {
      state.speed = Math.max(0, state.speed - 26 * dt);
      state.verticalSpeed = 0;
    }
  } else {
    state.onGround = false;
    if (state.phase === 'parked' && state.speed > f.stallSpeed * 0.9) state.phase = 'flying';
    if (state.phase === 'landed' && state.speed > f.stallSpeed) {
      state.phase = 'flying'; // took off again after a stop
      state.messages.push('AIRBORNE');
    }
  }

  // Keep the aircraft inside the world.
  const half = CONFIG.worldSize / 2 - 40;
  state.pos[0] = clamp(state.pos[0], -half, half);
  state.pos[2] = clamp(state.pos[2], -half, half);
  state.pos[1] = Math.min(state.pos[1], 420);

  return { prevPos, runway, ground, clearance };
}

export function headingDegrees(heading) {
  let d = (heading * 180) / Math.PI;
  d = ((d % 360) + 360) % 360;
  return d;
}

// Airspeed in knots, altitude in metres, for the HUD.
export function knots(speed) { return Math.round(speed * 1.94); }
export function metres(alt) { return Math.round(alt); }
