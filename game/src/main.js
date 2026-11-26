// Basalt Horizon — main.js
// Boot, game loop, camera and screen state. The game is a single page that
// plays offline: WebGL for the world, a 2D canvas for the instruments, and
// procedural WebAudio for the sound. No fetch, no external file, no library.

import { CONFIG, MISSIONS } from './config.js';
import { createGL, compileProgram, MESH_VERT, MESH_FRAG } from './gl.js';
import {
  mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt, mat4Translation,
  mat4FromEuler, clamp, lerp, degToRad, v3Normalize, v3Sub, v3Cross, v3Add, v3Scale, mulberry32,
} from './math3.js';
import { Sky } from './sky.js';
import { Terrain } from './terrain.js';
import { Aircraft } from './aircraft.js';
import { Particles } from './particles.js';
import { makeFlightState, stepFlight, forwardVector } from './physics.js';
import { missionById, MissionRunner } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { createInput } from './input.js';
import { getShotParams, shotPose, applyShotPose } from './shots.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const fallback = document.getElementById('nogl');

const gl = createGL(glCanvas);
if (!gl) {
  fallback.style.display = 'flex';
  throw new Error('WebGL unavailable');
}

const rng = mulberry32(CONFIG.seed);
const sky = new Sky(gl, rng);
const terrain = new Terrain(gl);
const aircraft = new Aircraft(gl);
const particles = new Particles(gl);
const meshProg = compileProgram(gl, MESH_VERT, MESH_FRAG);
const hud = new HUD(hudCanvas);
const audio = new AudioEngine();
const input = createInput(glCanvas);

// --- Game state ---
let screen = 'title'; // 'title' | 'flying' | 'paused' | 'over'
let selectedMission = 0;
let mission = missionById(MISSIONS[0].id);
let state = makeFlightState(mission);
let runner = new MissionRunner(gl, mission, state.pos);
let cameraMode = 'chase'; // 'chase' | 'cockpit'
let camPos = [0, 40, 0];
let camTarget = [0, 10, 0];
let endTimer = -1;
let endCrashed = false;
let startTime = performance.now();
let elapsed = 0;
let frameCount = 0;
let exhaustAcc = 0;

// --- Screenshot staging (?shot=...) ---
const shotParams = getShotParams();
const pose = shotParams.shot ? shotPose(shotParams.shot) : null;
let staging = false;
if (pose) {
  staging = true;
  mission = missionById(pose.mission);
  state = makeFlightState(mission);
  runner = new MissionRunner(gl, mission, state.pos);
  applyShotPose(pose, state, runner);
  cameraMode = pose.camera === 'title' ? 'title' : pose.camera;
  screen = pose.camera === 'title' ? 'title' : 'flying';
  selectedMission = MISSIONS.findIndex((m) => m.id === pose.mission);
  if (pose.message) hud.pushMessage(pose.message, 0);
}

function startMission(index) {
  selectedMission = index;
  mission = missionById(MISSIONS[index].id);
  state = makeFlightState(mission);
  runner = new MissionRunner(gl, mission, state.pos);
  screen = 'flying';
  endTimer = -1;
  audio.ensure();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  glCanvas.width = Math.round(w * dpr);
  glCanvas.height = Math.round(h * dpr);
  glCanvas.style.width = w + 'px';
  glCanvas.style.height = h + 'px';
  gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  hud.resize(w, h, dpr);
}
window.addEventListener('resize', resize);
resize();

function drainMessages() {
  while (state.messages.length) {
    hud.pushMessage(state.messages.shift(), elapsed);
  }
}

function updateCamera(dt) {
  const fwd = forwardVector(state.heading, state.pitch);
  const up = [0, 1, 0];
  if (cameraMode === 'cockpit') {
    // Just above the fuselage and ahead of the canopy, so the nose and the
    // wingtips read in the lower frame and the windscreen stays clear.
    const eye = v3Add(v3Add(state.pos, v3Scale(fwd, 1.6)), [0, 1.05, 0]);
    const target = v3Add(v3Add(state.pos, v3Scale(fwd, 60)), [0, 0.2, 0]);
    camPos = eye;
    camTarget = target;
    return;
  }
  if (cameraMode === 'title') {
    // Cinematic orbit around the parked aircraft on Home Field.
    const t = elapsed * 0.05;
    const cx = state.pos[0] + Math.sin(t) * 55;
    const cz = state.pos[2] + Math.cos(t) * 55;
    camPos = [cx, 16, cz];
    camTarget = [state.pos[0], state.pos[1] + 2, state.pos[2]];
    return;
  }
  // Chase: behind and above, smoothed; the camera banks a little with the
  // aircraft so the horizon tilts but never fights the pilot.
  const dist = CONFIG.camera.chaseDistance;
  const height = CONFIG.camera.chaseHeight;
  const desired = [
    state.pos[0] - fwd[0] * dist,
    state.pos[1] - fwd[1] * dist + height,
    state.pos[2] - fwd[2] * dist,
  ];
  const k = Math.min(1, dt * CONFIG.camera.smoothing);
  camPos = [lerp(camPos[0], desired[0], k), lerp(camPos[1], desired[1], k), lerp(camPos[2], desired[2], k)];
  camTarget = [
    state.pos[0] + fwd[0] * 12,
    state.pos[1] + fwd[1] * 12 + 1,
    state.pos[2] + fwd[2] * 12,
  ];
}

function cameraUp() {
  // Roll the camera a third of the aircraft's bank.
  const fwd = forwardVector(state.heading, state.pitch);
  const roll = cameraMode === 'chase' ? state.roll * 0.35 : 0;
  const worldUp = [0, 1, 0];
  const right = v3Normalize(v3Cross(fwd, worldUp));
  let up = v3Normalize(v3Cross(right, fwd));
  const c = Math.cos(-roll);
  const s = Math.sin(-roll);
  const cross = v3Cross(fwd, up);
  up = [
    up[0] * c + cross[0] * s,
    up[1] * c + cross[1] * s,
    up[2] * c + cross[2] * s,
  ];
  return up;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - startTime) / 1000 || 0.016);
  startTime = now;
  elapsed += dt;
  frameCount++;

  // --- Input edges ---
  const p = input.pressed;
  if (p.KeyM) audio.setMuted(!audio.muted);
  if (screen === 'title') {
    if (p.Enter || p.Space) startMission(selectedMission);
    if (p.Digit1) startMission(0);
    if (p.Digit2) startMission(1);
    if (p.Digit3) startMission(2);
    if (input.mouse.clicked) {
      for (const card of hud.titleCards) {
        if (
          input.mouse.clickX >= card.x && input.mouse.clickX <= card.x + card.w &&
          input.mouse.clickY >= card.y && input.mouse.clickY <= card.y + card.h
        ) {
          audio.ensure();
          startMission(card.mission);
        }
      }
    }
  } else if (screen === 'flying') {
    if (p.KeyP) screen = 'paused';
    if (p.KeyC) cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    if (p.KeyR) startMission(selectedMission);
    if (p.KeyT) screen = 'title';
  } else if (screen === 'paused') {
    if (p.KeyP || p.Enter) screen = 'flying';
    if (p.KeyR) startMission(selectedMission);
    if (p.KeyT) screen = 'title';
  } else if (screen === 'over') {
    if (p.KeyR) startMission(selectedMission);
    if (p.KeyT) screen = 'title';
    if (p.Digit1) startMission(0);
    if (p.Digit2) startMission(1);
    if (p.Digit3) startMission(2);
  }

  // --- Simulation ---
  if (screen === 'flying') {
    if (staging) {
      // Scripted drift: hold the pose and glide forward for the shot.
      const fwd = forwardVector(state.heading, state.pitch);
      state.pos[0] += fwd[0] * state.speed * dt;
      state.pos[1] += fwd[1] * state.speed * dt;
      state.pos[2] += fwd[2] * state.speed * dt;
      state.time += dt;
    } else {
      const { prevPos, runway } = stepFlight(state, input, dt, mission);
      const ring = runner.course.checkPass(prevPos, state.pos);
      const events = { ringFlown: !!ring, landedOn: null };
      if (state.phase === 'landed' && runway) events.landedOn = runway;
      const missionEvents = runner.update(state, events);
      if (ring) {
        particles.burst([ring.x, ring.y, ring.z], 26, [1.0, 0.75, 0.2, 1]);
        audio.ring();
      }
      if (missionEvents.includes('complete')) {
        audio.complete();
        endCrashed = false;
        endTimer = 1.0;
      }
      if (missionEvents.includes('warn')) audio.warn();
      if (state.phase === 'crashed' && endTimer < 0) {
        audio.crash();
        particles.smoke(state.pos, 24, true);
        endCrashed = true;
        endTimer = 1.4;
      }
      if (state.phase === 'landed' && runway && state.speed < 2 && !runner.complete) {
        // Parked on a strip: a short dust puff as the wheels settle.
        particles.smoke(state.pos, 3);
      }
      drainMessages();
      // Engine exhaust + wingtip vortices.
      exhaustAcc += dt;
      if (state.throttle > 0.25 && state.phase === 'flying' && exhaustAcc > 0.05) {
        exhaustAcc = 0;
        const fwd = forwardVector(state.heading, state.pitch);
        const tail = [
          state.pos[0] - fwd[0] * 4.5,
          state.pos[1] - fwd[1] * 4.5,
          state.pos[2] - fwd[2] * 4.5,
        ];
        particles.spawn(tail, [-fwd[0] * 6, 0.5, -fwd[2] * 6], 0.5, 0.9, [1.0, 0.55, 0.15, 0.5], 1.2);
      }
      if (Math.abs(state.roll) > 0.7 && state.phase === 'flying') {
        const fwd = forwardVector(state.heading, state.pitch);
        const right = v3Normalize(v3Cross(fwd, [0, 1, 0]));
        for (const side of [-1, 1]) {
          particles.spawn(
            [state.pos[0] + right[0] * side * 5.2, state.pos[1], state.pos[2] + right[2] * side * 5.2],
            [0, 0, 0], 0.6, 0.7, [0.9, 0.95, 1.0, 0.35], 0.8,
          );
        }
      }
      audio.update(state.throttle, state.speed, state.phase === 'flying');
    }
    if (endTimer > 0) {
      endTimer -= dt;
      if (endTimer <= 0) screen = 'over';
    }
  }

  if (screen === 'over') {
    // Keep the world alive behind the end panel.
    particles.update(dt);
  }
  particles.update(dt);
  updateCamera(dt);
  input.endFrame();

  // --- Render ---
  const w = glCanvas.width;
  const h = glCanvas.height;
  const aspect = w / h;
  const proj = mat4Perspective(degToRad(62), aspect, 0.5, 9000);
  const view = mat4LookAt(camPos, camTarget, cameraUp());
  gl.clearColor(0.13, 0.18, 0.38, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Sky dome sits at depth 1.0: draw it with LEQUAL, then restore LESS.
  gl.depthFunc(gl.LEQUAL);
  sky.draw(view, proj, elapsed, camPos);
  gl.depthFunc(gl.LESS);

  const shared = {
    uView: view, uProj: proj, uSunDir: CONFIG.sunDirection,
    uFogColor: CONFIG.palette.fog, uFogNear: 350, uFogFar: 2400,
    uTime: elapsed, uEmissive: 0,
  };
  terrain.draw(gl, view, proj, elapsed, state.pos);
  runner.course.draw(meshProg, shared, elapsed);

  if (cameraMode !== 'cockpit') {
    // The model faces -Z locally; heading + PI turns its nose onto the
    // flight direction.
    const model = mat4Multiply(
      mat4Translation(state.pos[0], state.pos[1], state.pos[2]),
      mat4FromEuler(state.heading + Math.PI, state.pitch, state.roll),
    );
    aircraft.draw(meshProg, model, shared, state.throttle, elapsed, true);
  } else {
    // Cockpit view: the nose and wings show in the lower frame, the blades
    // are hidden so they cannot fill the windscreen.
    const model = mat4Multiply(
      mat4Translation(state.pos[0], state.pos[1], state.pos[2]),
      mat4FromEuler(state.heading + Math.PI, state.pitch, state.roll),
    );
    aircraft.draw(meshProg, model, shared, state.throttle, elapsed, false);
  }
  particles.draw(view, proj, CONFIG.palette.fog);

  // --- HUD ---
  hud.clear();
  if (screen === 'title') {
    hud.drawTitle(selectedMission);
  } else if (screen === 'flying') {
    hud.drawFlying(state, runner, elapsed);
  } else if (screen === 'paused') {
    hud.drawFlying(state, runner, elapsed);
    hud.drawPaused();
  } else if (screen === 'over') {
    hud.drawEnd(state, runner, endCrashed);
  }

  // --- Driver hooks for screenshots and playtests ---
  window.__world = {
    screen, state, mission, cameraMode,
    ringsDone: runner.course.passedCount,
    ringsTotal: runner.ringsTotal,
    nextRing: runner.course.next,
    complete: runner.complete,
  };
  if (staging && frameCount > 45) window.__shotReady = true;
  window.__shotReady = window.__shotReady || false;
}

// Title screen renders the world behind the menu, so boot straight into it.
requestAnimationFrame(frame);
