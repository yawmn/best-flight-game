// Basalt Horizon — terrain.js
// The archipelago itself: a heightmap mesh coloured by height and slope, a
// glassy sunset sea, the runway strips with their markings and PAPI lights,
// and the pine forest that makes the islands read as land from the air.

import { CONFIG } from './config.js';
import { heightAt, terrainColor, runwayAt } from './noise.js';
import {
  createMesh, drawMesh, MESH_VERT, MESH_FRAG, compileProgram,
  boxGeometry, coneGeometry, cylinderGeometry, sphereGeometry, mergeGeometries,
  translateGeometry, rotateGeometryY, scaleGeometry,
} from './gl.js';
import { mat4Identity, mat4Multiply, mat4Translation, mat4RotationY, mat4Scale, mulberry32 } from './math3.js';

const SEA_VERT = `
attribute vec3 aPos;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj; uniform highp float uTime;
varying vec3 vWorld; varying float vDepth;
void main() {
  vec3 p = aPos;
  p.y += sin(p.x * 0.02 + uTime * 0.7) * 0.35 + cos(p.z * 0.017 + uTime * 0.5) * 0.35;
  vec4 world = uModel * vec4(p, 1.0);
  vec4 view = uView * world;
  vWorld = world.xyz; vDepth = -view.z;
  gl_Position = uProj * view;
}`;
const SEA_FRAG = `
precision mediump float;
uniform vec3 uSunDir; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFogColor;
uniform float uFogNear; uniform float uFogFar; uniform highp float uTime;
varying vec3 vWorld; varying float vDepth;
void main() {
  float sparkle = sin(vWorld.x * 0.35 + uTime * 1.4) * sin(vWorld.z * 0.31 - uTime * 1.1);
  vec3 col = mix(uDeep, uShallow, 0.35 + 0.25 * sin(vWorld.x * 0.01 + vWorld.z * 0.013));
  float sun = max(dot(normalize(vec3(0.0, 1.0, 0.0)), normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.55, 0.22) * pow(sun, 3.0) * 0.35;
  col += vec3(1.0, 0.75, 0.45) * max(sparkle, 0.0) * 0.06;
  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f * 0.85);
  gl_FragColor = vec4(col, 0.94);
}`;

export class Terrain {
  constructor(gl) {
    this.gl = gl;
    const p = CONFIG.palette;
    this.meshProg = compileProgram(gl, MESH_VERT, MESH_FRAG);
    this.seaProg = compileProgram(gl, SEA_VERT, SEA_FRAG);
    this.sunDir = [-CONFIG.sunDirection[0], CONFIG.sunDirection[1], -CONFIG.sunDirection[2]];
    // The sun lights the scene from the west; the shader wants the direction
    // *toward* the sun, which is the configured vector as written.
    this.sunDir = CONFIG.sunDirection.slice();

    // --- Heightmap mesh (121 x 121 vertices over the world square). ---
    const N = 120;
    const size = CONFIG.worldSize;
    const pos = []; const nor = []; const col = []; const idx = [];
    const heights = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const x = (i / N - 0.5) * size;
        const z = (j / N - 0.5) * size;
        const h = heightAt(x, z);
        heights.push(h);
        pos.push(x, h, z);
        const c = terrainColor(x, z, h);
        // Sunset tint: warm the grass toward gold on the sun side.
        const warm = x < 0 ? 1.12 : 1.0;
        col.push(Math.min(1, c[0] * warm), c[1], c[2]);
        nor.push(0, 1, 0); // filled in below
      }
    }
    const at = (i, j) => heights[j * (N + 1) + i];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const step = size / N;
        const hx = at(Math.min(i + 1, N), j) - at(Math.max(i - 1, 0), j);
        const hz = at(i, Math.min(j + 1, N)) - at(i, Math.max(j - 1, 0));
        const n = [-hx / (2 * step), 1, -hz / (2 * step)];
        const l = Math.hypot(n[0], n[1], n[2]);
        const k = (j * (N + 1) + i) * 3;
        nor[k] = n[0] / l; nor[k + 1] = n[1] / l; nor[k + 2] = n[2] / l;
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i;
        const b = a + 1;
        const c = a + N + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    this.terrainMesh = createMesh(gl, pos, nor, col, idx);

    // --- Sea plane: far wider than the islands so the horizon melts into
    // the fog instead of ending in a hard line. ---
    const seaSize = 8000;
    const seaPos = [-seaSize, 0, -seaSize, seaSize, 0, -seaSize, seaSize, 0, seaSize, -seaSize, 0, seaSize];
    const seaNor = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    const seaCol = [0.1, 0.4, 0.5, 0.1, 0.4, 0.5, 0.1, 0.4, 0.5, 0.1, 0.4, 0.5];
    this.seaMesh = createMesh(gl, seaPos, seaNor, seaCol, [0, 1, 2, 0, 2, 3]);

    // --- Runway strips: asphalt slab, centre dashes, threshold bars. ---
    this.runwayMeshes = [];
    for (const r of CONFIG.runways) {
      const parts = [];
      const slab = boxGeometry([-r.length / 2, 0, -r.width / 2], [r.length / 2, 0.4, r.width / 2], p.runway);
      parts.push(slab);
      const dashCount = Math.floor(r.length / 24);
      for (let i = 0; i < dashCount; i++) {
        const x = -r.length / 2 + 12 + i * 24;
        const dash = boxGeometry([x - 5, 0.42, -0.9], [x + 5, 0.46, 0.9], p.runwayMark);
        parts.push(dash);
      }
      for (const side of [-1, 1]) {
        const x = side * (r.length / 2 - 8);
        for (let k = -2; k <= 2; k++) {
          const bar = boxGeometry(
            [x - 4, 0.42, k * 4 - 1.1], [x + 4, 0.46, k * 4 + 1.1], p.runwayMark,
          );
          parts.push(bar);
        }
      }
      const merged = mergeGeometries(parts);
      const mesh = createMesh(gl, merged.pos, merged.nor, merged.col, merged.idx);
      // The slab is built along X; rotate it onto the flight-heading axis.
      const model = mat4Multiply(
        mat4Translation(r.x, 6.1, r.z),
        mat4RotationY(r.heading - Math.PI / 2),
      );
      this.runwayMeshes.push({ mesh, model });
    }

    // --- PAPI lights: four small lamps beside each threshold, red/white by
    // glide slope. Built as one mesh per runway; colours are rewritten each
    // frame from the aircraft's approach angle. ---
    this.papi = [];
    for (const r of CONFIG.runways) {
      const parts = [];
      for (let k = 0; k < 4; k++) {
        const box = boxGeometry([-1.1, 0, -1.1], [1.1, 1.4, 1.1], [1, 1, 1]);
        translateGeometry(box, 0, 0, 0);
        parts.push(box);
      }
      const merged = mergeGeometries(parts);
      // Store per-lamp offsets along the runway's across axis.
      const lamps = [];
      for (let k = 0; k < 4; k++) {
        const across = r.width / 2 + 8 + k * 4.5;
        const along = -r.length / 2 + 18;
        const dx = along * Math.sin(r.heading) + across * Math.cos(r.heading);
        const dz = along * Math.cos(r.heading) - across * Math.sin(r.heading);
        lamps.push([r.x + dx, 6.6, r.z + dz]);
      }
      this.papi.push({ lamps, mesh: null, base: merged });
    }
    // One lamp mesh per colour: the PAPI lamps read white above the glide
    // slope and red below it, and glow through the emissive channel.
    const lampGeo = boxGeometry([-1.1, 0, -1.1], [1.1, 1.4, 1.1], [1, 1, 1]);
    this.lampWhiteMesh = createMesh(gl, lampGeo.pos, lampGeo.nor, lampGeo.col, lampGeo.idx);
    const lampRedGeo = boxGeometry([-1.1, 0, -1.1], [1.1, 1.4, 1.1], [1, 0.05, 0.03]);
    this.lampRedMesh = createMesh(gl, lampRedGeo.pos, lampRedGeo.nor, lampRedGeo.col, lampRedGeo.idx);

    // --- Pine forest: instanced-looking cones + trunks, seeded placement on
    // flat grass below the tree line, never on a runway. ---
    const rng = mulberry32(CONFIG.seed + 77);
    const treeParts = [];
    let placed = 0; let tries = 0;
    while (placed < 260 && tries < 4000) {
      tries++;
      const x = (rng() - 0.5) * (size - 100);
      const z = (rng() - 0.5) * (size - 100);
      const h = heightAt(x, z);
      if (h < 4 || h > 60) continue;
      if (runwayAt(x, z)) continue;
      const s = 0.8 + rng() * 0.9;
      const trunk = cylinderGeometry(0.5 * s, 0.7 * s, 3 * s, 5, [0.25, 0.16, 0.10]);
      translateGeometry(trunk, x, h + 1.5 * s, z);
      const crown = coneGeometry(3.2 * s, 9 * s, 6, p.forest);
      translateGeometry(crown, x, h + (3 + 4.5) * s, z);
      treeParts.push(trunk, crown);
      placed++;
    }
    const trees = mergeGeometries(treeParts);
    this.treeMesh = createMesh(gl, trees.pos, trees.nor, trees.col, trees.idx);

    // --- Volcano glow: a faint ember ring on the peak, visible at dusk. ---
    const ember = sphereGeometry(26, 10, [1.0, 0.32, 0.08], 0.35);
    translateGeometry(ember, -420, heightAt(-420, -380) + 2, -380);
    this.emberMesh = createMesh(gl, ember.pos, ember.nor, ember.col, ember.idx);
  }

  // PAPI state for one runway given the aircraft position: how many of the
  // four lamps read white (too high) vs red (too low) on a 3-degree slope.
  papiWhites(runway, planePos) {
    const dx = planePos[0] - runway.x;
    const dz = planePos[2] - runway.z;
    const along = dx * Math.sin(runway.heading) + dz * Math.cos(runway.heading);
    const dist = Math.abs(along) + runway.length / 2;
    if (dist > 700 || along > 0) return 2; // not on approach: neutral 2/2
    const ideal = 6 + Math.tan(0.0524) * dist; // 3-degree glide path
    const err = planePos[1] - ideal;
    if (err > 12) return 4;
    if (err > 4) return 3;
    if (err > -4) return 2;
    if (err > -12) return 1;
    return 0;
  }

  draw(gl, view, proj, time, planePos) {
    const p = CONFIG.palette;
    const shared = {
      uView: view, uProj: proj, uSunDir: this.sunDir,
      uFogColor: p.fog, uFogNear: 350, uFogFar: 2400, uTime: time, uEmissive: 0,
    };
    drawMesh(gl, this.meshProg, this.terrainMesh, mat4Identity(), shared);
    drawMesh(gl, this.meshProg, this.treeMesh, mat4Identity(), shared);
    // Ember glow on the volcanic peak.
    drawMesh(gl, this.meshProg, this.emberMesh, mat4Identity(), { ...shared, uEmissive: 0.9 });
    for (const r of this.runwayMeshes) {
      drawMesh(gl, this.meshProg, r.mesh, r.model, shared);
    }
    // PAPI lamps: white for "above slope", red for "below slope".
    CONFIG.runways.forEach((runway, ri) => {
      const whites = this.papiWhites(runway, planePos);
      const lamps = this.papi[ri].lamps;
      lamps.forEach((lamp, i) => {
        const mesh = i < whites ? this.lampWhiteMesh : this.lampRedMesh;
        drawMesh(gl, this.meshProg, mesh,
          mat4Translation(lamp[0], lamp[1], lamp[2]),
          { ...shared, uEmissive: 0.85 });
      });
    });
    // Sea, drawn last so its transparency blends over the terrain skirt.
    gl.useProgram(this.seaProg.prog);
    const sp = this.seaProg.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seaMesh.vbo);
    gl.enableVertexAttribArray(sp.aPos);
    gl.vertexAttribPointer(sp.aPos, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(sp.aNormal);
    gl.vertexAttribPointer(sp.aNormal, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(sp.aColor);
    gl.vertexAttribPointer(sp.aColor, 3, gl.FLOAT, false, 36, 24);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.seaMesh.ibo);
    gl.uniformMatrix4fv(sp.uModel, false, mat4Identity());
    gl.uniformMatrix4fv(sp.uView, false, view);
    gl.uniformMatrix4fv(sp.uProj, false, proj);
    gl.uniform1f(sp.uTime, time);
    gl.uniform3fv(sp.uSunDir, this.sunDir);
    gl.uniform3fv(sp.uDeep, p.seaDeep);
    gl.uniform3fv(sp.uShallow, p.seaShallow);
    gl.uniform3fv(sp.uFogColor, p.fog);
    gl.uniform1f(sp.uFogNear, 350);
    gl.uniform1f(sp.uFogFar, 2400);
    gl.drawElements(gl.TRIANGLES, this.seaMesh.count, gl.UNSIGNED_SHORT, 0);
  }
}
