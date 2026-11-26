// Basalt Horizon — aircraft.js
// The aircraft, built from primitives: a tapered twin-boom fuselage, swept
// wings, tail, a spinning propeller, a glass canopy, landing gear, red/green
// wingtip navigation lights and an orange engine glow. It is meant to look
// built, not drawn — every part is a solid with a lit face.

import {
  createMesh, drawMesh, boxGeometry, cylinderGeometry, coneGeometry,
  sphereGeometry, mergeGeometries, translateGeometry, rotateGeometryX, rotateGeometryY, scaleGeometry,
} from './gl.js';
import { mat4Identity, mat4Multiply, mat4Translation, mat4RotationX, mat4RotationY, mat4RotationZ, mat4Scale } from './math3.js';

const BODY = [0.82, 0.78, 0.72]; // warm aluminium
const BODY_DARK = [0.45, 0.38, 0.34];
const ACCENT = [0.95, 0.45, 0.12]; // sunset orange trim
const GLASS = [0.15, 0.28, 0.42];
const PROP_DARK = [0.12, 0.11, 0.10];

export class Aircraft {
  constructor(gl) {
    this.gl = gl;
    // Fuselage: a cylinder laid along Z, wide at the nose (0.85) tapering to
    // the tail (0.62). The aircraft faces -Z in local space.
    const parts = [];
    const fuselage = cylinderGeometry(0.62, 0.85, 4.6, 12, BODY);
    // Cylinder is along Y; rotate to Z.
    rotateGeometryY(fuselage, 0);
    // Rotate around X by 90 degrees to lay it along Z.
    for (let i = 0; i < fuselage.pos.length; i += 3) {
      const y = fuselage.pos[i + 1]; const z = fuselage.pos[i + 2];
      fuselage.pos[i + 1] = -z; fuselage.pos[i + 2] = y;
      const ny = fuselage.nor[i + 1]; const nz = fuselage.nor[i + 2];
      fuselage.nor[i + 1] = -nz; fuselage.nor[i + 2] = ny;
    }
    parts.push(fuselage);
    const nose = coneGeometry(0.85, 1.6, 12, ACCENT);
    for (let i = 0; i < nose.pos.length; i += 3) {
      const y = nose.pos[i + 1]; const z = nose.pos[i + 2];
      nose.pos[i + 1] = -z; nose.pos[i + 2] = y;
      const ny = nose.nor[i + 1]; const nz = nose.nor[i + 2];
      nose.nor[i + 1] = -nz; nose.nor[i + 2] = ny;
    }
    // The cone's apex lands at +Z after the lay-down; flip it to point forward.
    rotateGeometryX(nose, Math.PI);
    translateGeometry(nose, 0, 0, -3.0);
    parts.push(nose);
    const tailCone = coneGeometry(0.62, 1.8, 12, BODY_DARK);
    for (let i = 0; i < tailCone.pos.length; i += 3) {
      const y = tailCone.pos[i + 1]; const z = tailCone.pos[i + 2];
      tailCone.pos[i + 1] = -z; tailCone.pos[i + 2] = y;
      const ny = tailCone.nor[i + 1]; const nz = tailCone.nor[i + 2];
      tailCone.nor[i + 1] = -nz; tailCone.nor[i + 2] = ny;
    }
    translateGeometry(tailCone, 0, 0.1, 3.1);
    parts.push(tailCone);

    // Main wing: a wide, slightly tapered slab with orange tips.
    const wing = boxGeometry([-5.2, -0.12, -0.55], [5.2, 0.12, 0.75], BODY);
    translateGeometry(wing, 0, 0.05, -0.3);
    parts.push(wing);
    const wingTipL = boxGeometry([-5.2, -0.13, -0.55], [-4.4, 0.13, 0.75], ACCENT);
    translateGeometry(wingTipL, 0, 0.05, -0.3);
    parts.push(wingTipL);
    const wingTipR = boxGeometry([4.4, -0.13, -0.55], [5.2, 0.13, 0.75], ACCENT);
    translateGeometry(wingTipR, 0, 0.05, -0.3);
    parts.push(wingTipR);

    // Tailplane + fin.
    const tailplane = boxGeometry([-1.9, -0.09, -0.4], [1.9, 0.09, 0.5], BODY);
    translateGeometry(tailplane, 0, 0.35, 3.6);
    parts.push(tailplane);
    const fin = boxGeometry([-0.09, 0.3, -0.55], [0.09, 1.5, 0.65], ACCENT);
    translateGeometry(fin, 0, 0.35, 3.7);
    parts.push(fin);

    // Canopy: a squashed dark-glass dome over the cockpit.
    const canopy = sphereGeometry(0.62, 10, GLASS, 0.75);
    scaleGeometry(canopy, 1, 1, 1.9);
    translateGeometry(canopy, 0, 0.72, -1.1);
    parts.push(canopy);

    // Landing gear: two struts + wheels, one nose wheel.
    for (const side of [-1, 1]) {
      const strut = cylinderGeometry(0.07, 0.07, 0.9, 6, BODY_DARK);
      translateGeometry(strut, side * 1.1, -0.85, -0.6);
      parts.push(strut);
      const wheel = cylinderGeometry(0.34, 0.34, 0.22, 10, PROP_DARK);
      rotateGeometryY(wheel, Math.PI / 2);
      translateGeometry(wheel, side * 1.1, -1.3, -0.6);
      parts.push(wheel);
    }
    const noseStrut = cylinderGeometry(0.06, 0.06, 0.8, 6, BODY_DARK);
    translateGeometry(noseStrut, 0, -0.8, -2.4);
    parts.push(noseStrut);
    const noseWheel = cylinderGeometry(0.28, 0.28, 0.18, 10, PROP_DARK);
    rotateGeometryY(noseWheel, Math.PI / 2);
    translateGeometry(noseWheel, 0, -1.2, -2.4);
    parts.push(noseWheel);

    const body = mergeGeometries(parts);
    this.bodyMesh = createMesh(gl, body.pos, body.nor, body.col, body.idx);

    // Propeller: two blades + hub, spun around Z at the nose.
    const propParts = [];
    const blade1 = boxGeometry([-0.14, -1.5, -0.08], [0.14, 1.5, 0.08], PROP_DARK);
    const blade2 = boxGeometry([-1.5, -0.14, -0.08], [1.5, 0.14, 0.08], PROP_DARK);
    propParts.push(blade1, blade2);
    const hub = sphereGeometry(0.22, 8, ACCENT);
    propParts.push(hub);
    const prop = mergeGeometries(propParts);
    this.propMesh = createMesh(gl, prop.pos, prop.nor, prop.col, prop.idx);

    // Engine glow: a small emissive cone at the exhaust, subtle so it reads
    // as light, not as a balloon behind the tail.
    const glow = coneGeometry(0.24, 1.0, 8, [1.0, 0.45, 0.08]);
    for (let i = 0; i < glow.pos.length; i += 3) {
      const y = glow.pos[i + 1]; const z = glow.pos[i + 2];
      glow.pos[i + 1] = -z; glow.pos[i + 2] = y;
      const ny = glow.nor[i + 1]; const nz = glow.nor[i + 2];
      glow.nor[i + 1] = -nz; glow.nor[i + 2] = ny;
    }
    translateGeometry(glow, 0, 0, 2.4);
    this.glowMesh = createMesh(gl, glow.pos, glow.nor, glow.col, glow.idx);

    // Navigation lights: left red, right green, tail white strobe.
    const navL = sphereGeometry(0.14, 8, [1.0, 0.05, 0.02]);
    translateGeometry(navL, -5.25, 0.05, -0.3);
    this.navLeftMesh = createMesh(gl, navL.pos, navL.nor, navL.col, navL.idx);
    const navR = sphereGeometry(0.14, 8, [0.05, 1.0, 0.15]);
    translateGeometry(navR, 5.25, 0.05, -0.3);
    this.navRightMesh = createMesh(gl, navR.pos, navR.nor, navR.col, navR.idx);
    const strobe = sphereGeometry(0.12, 8, [1, 1, 1]);
    translateGeometry(strobe, 0, 0.4, 4.0);
    this.strobeMesh = createMesh(gl, strobe.pos, strobe.nor, strobe.col, strobe.idx);

    this.propAngle = 0;
  }

  // modelMatrix: the aircraft's world transform. throttle 0..1 spins the
  // propeller and brightens the exhaust glow; time drives the strobe blink.
  // drawProp is false in the cockpit view, where the blades would fill the
  // frame: the nose and wings stay visible instead.
  draw(program, modelMatrix, shared, throttle, time, drawProp = true) {
    const gl = this.gl;
    drawMesh(gl, program, this.bodyMesh, modelMatrix, shared);
    if (drawProp) {
      this.propAngle += (4 + throttle * 42) * 0.016;
      const propModel = mat4Multiply(
        modelMatrix,
        mat4Multiply(mat4Translation(0, 0, -3.85), mat4RotationZ(this.propAngle)),
      );
      drawMesh(gl, program, this.propMesh, propModel, shared);
    }
    if (throttle > 0.05) {
      const glowModel = mat4Multiply(
        modelMatrix,
        mat4Multiply(mat4Translation(0, -0.1, 2.4), mat4Scale(1, 1, 1 + throttle * 0.6)),
      );
      drawMesh(gl, program, this.glowMesh, glowModel, { ...shared, uEmissive: 0.15 + throttle * 0.35 });
    }
    drawMesh(gl, program, this.navLeftMesh, modelMatrix, { ...shared, uEmissive: 1.4 });
    drawMesh(gl, program, this.navRightMesh, modelMatrix, { ...shared, uEmissive: 1.4 });
    if (Math.sin(time * 6) > 0.2) {
      drawMesh(gl, program, this.strobeMesh, modelMatrix, { ...shared, uEmissive: 2.0 });
    }
  }
}
