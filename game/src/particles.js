// Basalt Horizon — particles.js
// One small billboard particle pool for everything that moves and fades:
// engine exhaust, wingtip vortices in a hard bank, the gold burst of a ring,
// the grey smoke of a crash and the dust of a touchdown.

import { compileProgram } from './gl.js';
import { mat4Identity, mat4Multiply, mat4Translation, mat4Scale } from './math3.js';

const PART_VERT = `
attribute vec3 aPos; attribute vec2 aUv;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 view = uView * uModel * vec4(aPos, 1.0);
  vUv = aUv; vDepth = -view.z;
  gl_Position = uProj * view;
}`;
const PART_FRAG = `
precision mediump float;
uniform sampler2D uTex; uniform vec4 uColor; uniform vec3 uFogColor;
uniform float uFogNear; uniform float uFogFar;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 t = texture2D(uTex, vUv);
  vec3 col = uColor.rgb;
  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f * 0.7);
  gl_FragColor = vec4(col, t.a * uColor.a);
}`;

// A soft round sprite, painted once at boot.
function paintSpriteTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export class Particles {
  constructor(gl) {
    this.gl = gl;
    this.prog = compileProgram(gl, PART_VERT, PART_FRAG);
    this.tex = paintSpriteTexture(gl);
    const q = new Float32Array([
      -1, -1, 0, 0, 0, -1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1, -1, 0, 1, 0,
    ]);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    this.pool = [];
    for (let i = 0; i < 320; i++) {
      this.pool.push({ alive: false, pos: [0, 0, 0], vel: [0, 0, 0], life: 0, maxLife: 1, size: 1, color: [1, 1, 1, 1], grow: 0 });
    }
    this.cursor = 0;
  }

  spawn(pos, vel, life, size, color, grow = 0) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.pool.length;
    p.alive = true;
    p.pos = [pos[0], pos[1], pos[2]];
    p.vel = [vel[0], vel[1], vel[2]];
    p.life = life; p.maxLife = life;
    p.size = size; p.color = color; p.grow = grow;
  }

  burst(pos, count, color, speed = 12, life = 0.9, size = 2.2) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(pos,
        [Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 2, Math.sin(a) * Math.cos(b) * s],
        life * (0.6 + Math.random() * 0.7), size * (0.7 + Math.random() * 0.6), color, 1.5);
    }
  }

  smoke(pos, count, big = false) {
    for (let i = 0; i < count; i++) {
      this.spawn(
        [pos[0] + (Math.random() - 0.5) * 3, pos[1] + Math.random() * 2, pos[2] + (Math.random() - 0.5) * 3],
        [(Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2],
        1.6 + Math.random() * 1.4,
        big ? 5 + Math.random() * 4 : 2 + Math.random() * 2,
        [0.25, 0.23, 0.22, 0.55], 3.5,
      );
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; continue; }
      p.pos[0] += p.vel[0] * dt;
      p.pos[1] += p.vel[1] * dt;
      p.pos[2] += p.vel[2] * dt;
      p.vel[1] += 0.4 * dt; // smoke rises, sparks settle slowly
      p.size += p.grow * dt;
    }
  }

  draw(view, proj, fogColor) {
    const gl = this.gl;
    gl.useProgram(this.prog.prog);
    const loc = this.prog.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(loc.aUv);
    gl.vertexAttribPointer(loc.aUv, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc.uTex, 0);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniform3fv(loc.uFogColor, fogColor);
    gl.uniform1f(loc.uFogNear, 350);
    gl.uniform1f(loc.uFogFar, 2400);
    gl.depthMask(false);
    for (const p of this.pool) {
      if (!p.alive) continue;
      const fade = p.life / p.maxLife;
      const model = mat4Multiply(
        mat4Translation(p.pos[0], p.pos[1], p.pos[2]),
        mat4Multiply(
          // Billboard: face the camera using the view rotation.
          (() => {
            const m = mat4Identity();
            m[0] = view[0]; m[1] = view[4]; m[2] = view[8];
            m[4] = view[1]; m[5] = view[5]; m[6] = view[9];
            m[8] = view[2]; m[9] = view[6]; m[10] = view[10];
            return m;
          })(),
          mat4Scale(p.size, p.size, 1),
        ),
      );
      gl.uniformMatrix4fv(loc.uModel, false, model);
      gl.uniform4fv(loc.uColor, [p.color[0], p.color[1], p.color[2], p.color[3] * fade]);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.depthMask(true);
  }
}
