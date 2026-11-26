// Basalt Horizon — missions.js
// The three sorties. Each one owns its ring course, its landing strip, its
// fuel and its altitude ceiling, and turns flight events (ring flown, wheels
// down, fuel out) into objectives, points and a finish line.

import { CONFIG, MISSIONS } from './config.js';
import { RingCourse } from './rings.js';

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

export class MissionRunner {
  constructor(gl, mission, startPos) {
    this.mission = mission;
    this.course = new RingCourse(gl, CONFIG.rings[mission.rings], startPos);
    this.landTarget = mission.land
      ? CONFIG.runways.find((r) => r.id === mission.land)
      : null;
    this.complete = false;
    this.failed = false;
    this.bonusPaid = false;
    this.landedAtTarget = false;
  }

  get ringsTotal() { return this.course.rings.length; }
  get ringsDone() { return this.course.passedCount; }

  objectiveText(state) {
    if (this.complete) return 'MISSION COMPLETE — well flown.';
    if (this.mission.land && this.course.done) {
      return `Land at ${this.landTarget.name} — watch the PAPI.`;
    }
    if (this.mission.maxAlt) {
      return `Rings ${this.course.passedCount}/${this.ringsTotal} — stay under MAX ALT ${this.mission.maxAlt}m.`;
    }
    return `Rings ${this.course.passedCount}/${this.ringsTotal} — next ring is gold.`;
  }

  // Called every frame with the flight state: returns event strings for the
  // HUD and the sound engine ('ring', 'landed', 'complete', 'fuel', ...).
  update(state, events) {
    const out = [];
    if (this.complete || this.failed) return out;
    const ring = this.course.next;
    if (ring && events.ringFlown) {
      state.score += CONFIG.score.ring;
      const timeBonus = Math.max(0, CONFIG.score.ringTimeBonus - Math.floor(state.time / 30) * 5);
      state.score += timeBonus;
      state.ringsFlown++;
      out.push('ring');
      state.messages.push(
        `RING ${this.course.passedCount}/${this.ringsTotal}  +${CONFIG.score.ring + timeBonus}`,
      );
    }
    // Altitude ceiling breach on the low-deck run: a warning, not a fail —
    // the pilot loses the time bonus for that ring.
    if (this.mission.maxAlt && state.pos[1] > this.mission.maxAlt && state.phase === 'flying') {
      if (!state._altWarned || state.time - state._altWarned > 5) {
        state._altWarned = state.time;
        state.messages.push(`ABOVE MAX ALT ${this.mission.maxAlt}m — descend!`);
        out.push('warn');
      }
    }
    // Landing on the mission strip finishes the sortie.
    if (this.landTarget && events.landedOn && events.landedOn.id === this.landTarget.id) {
      this.landedAtTarget = true;
    }
    if (this.course.done && (!this.landTarget || this.landedAtTarget)) {
      this.complete = true;
      if (!this.bonusPaid) {
        this.bonusPaid = true;
        state.score += CONFIG.score.mission;
        state.messages.push(`MISSION COMPLETE  +${CONFIG.score.mission}`);
      }
      out.push('complete');
    }
    // Out of fuel with no strip under the wheels: the sortie is over.
    if (state.fuel <= 0 && state.phase === 'crashed') {
      this.failed = true;
      out.push('failed');
    }
    return out;
  }
}
