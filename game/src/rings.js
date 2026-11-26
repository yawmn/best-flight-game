// Basalt Horizon — rings.js
// The golden gates: torus rings that hang in the air, face the course, pulse
// while they are the next target, and turn green once flown. A ring counts
// when the aircraft enters its disc from outside, near the centre.

import { CONFIG } from './config.js';
import { createMesh, drawMesh, torusGeometry, rotateGeometryX } from './gl.js';
import {
  mat4Identity, mat4Multiply, mat4Translation, mat4RotationY, mat4Scale,
} from './math3.js';

export class RingCourse {
  constructor(gl, ringDefs, startPos) {
    this.gl = gl;
    const p = CONFIG.palette;
    // Each ring faces the direction the pilot arrives from.
    this.rings = ringDefs.map((def, i) => {
      const from = i === 0 ? startPos : ringDefs[i - 1];
      const dx = def.x - from.x; const dz = def.z - from.z;
      return {
        ...def,
        index: i,
        passed: false,
        facing: Math.atan2(dx, dz),
      };
    });
    this.nextIndex = 0;
    // torusGeometry builds a ring flat around Y; tip it upright (hole axis
    // Z) so each gate stands vertical, facing the course.
    const mk = (color) => {
      const geo = torusGeometry(CONFIG.ringRadius, 1.1, 10, 28, color);
      rotateGeometryX(geo, Math.PI / 2);
      return createMesh(gl, geo.pos, geo.nor, geo.col, geo.idx);
    };
    this.meshNext = mk(p.ringNext);
    this.meshLater = mk([0.85, 0.55, 0.25]);
    this.meshDone = mk(p.ringDone);
    const discGeo = torusGeometry(CONFIG.ringRadius * 0.55, 0.7, 8, 20, p.ringNext);
    rotateGeometryX(discGeo, Math.PI / 2);
    this.discMesh = createMesh(gl, discGeo.pos, discGeo.nor, discGeo.col, discGeo.idx);
  }

  get next() { return this.rings[this.nextIndex] || null; }
  get passedCount() { return this.rings.filter((r) => r.passed).length; }
  get done() { return this.nextIndex >= this.rings.length; }

  reset() {
    this.rings.forEach((r) => { r.passed = false; });
    this.nextIndex = 0;
  }

  // A ring counts when the aircraft enters the disc sphere from outside.
  checkPass(prevPos, pos) {
    const ring = this.next;
    if (!ring) return null;
    const R = CONFIG.ringRadius;
    const dist = Math.hypot(pos[0] - ring.x, pos[1] - ring.y, pos[2] - ring.z);
    const prevDist = Math.hypot(prevPos[0] - ring.x, prevPos[1] - ring.y, prevPos[2] - ring.z);
    if (prevDist > R && dist <= R * 0.92) {
      ring.passed = true;
      this.nextIndex++;
      return ring;
    }
    return null;
  }

  draw(program, shared, time) {
    for (const ring of this.rings) {
      const isNext = ring === this.next;
      const scale = isNext ? 1 + Math.sin(time * 3.2) * 0.05 : 1;
      const mesh = ring.passed ? this.meshDone : isNext ? this.meshNext : this.meshLater;
      const model = mat4Multiply(
        mat4Translation(ring.x, ring.y, ring.z),
        mat4Multiply(
          mat4RotationY(ring.facing),
          mat4Scale(scale, scale, scale),
        ),
      );
      drawMesh(this.gl, program, mesh, model, {
        ...shared,
        uEmissive: ring.passed ? 0.15 : isNext ? 0.85 : 0.35,
      });
      if (isNext) {
        drawMesh(this.gl, program, this.discMesh, model, { ...shared, uEmissive: 0.5 });
      }
    }
  }
}
