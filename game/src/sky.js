// Basalt Horizon — sky.js
// The sunset sky: a gradient dome with a low sun disc, and drifting billboard
// clouds whose soft texture is painted once at boot on an offscreen canvas —
// generated art, never a downloaded image.

import { CONFIG } from './config.js';
import { compileProgram } from './gl.js';
import { mat4Identity, mat4Multiply, mat4Translation, mat4Scale, v3Normalize } from './math3.js';

const SKY_VERT = `
attribute vec3 aPos;
uniform mat4 uView; uniform mat4 uProj;
varying vec3 vDir;
void main() {
  vDir = aPos;
  vec4 p = uProj * uView * vec4(aPos, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunCore;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.08, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.28, h));
  col = mix(col, uZenith, smoothstep(0.22, 0.85, h));
  float sun = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCore * pow(sun, 220.0) * 1.6;   // the disc itself
  col += vec3(1.0, 0.55, 0.20) * pow(sun, 7.0) * 0.55; // the glow around it
  col = mix(col, uHorizon * 0.85, smoothstep(-0.02, -0.08, d.y));
  gl_FragColor = vec4(col, 1.0);
}`;

const CLOUD_VERT = `
attribute vec3 aPos; attribute vec2 aUv;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 view = uView * uModel * vec4(aPos, 1.0);
  vUv = aUv; vDepth = -view.z;
  gl_Position = uProj * view;
}`;
const CLOUD_FRAG = `
precision mediump float;
uniform sampler2D uTex; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uLit;
varying vec2 vUv; varying float vDepth;
void main() {
  vec4 t = texture2D(uTex, vUv);
  vec3 warm = mix(vec3(0.98, 0.72, 0.55), vec3(1.0, 0.62, 0.35), uLit);
  vec3 col = mix(vec3(0.55, 0.48, 0.55), warm, uLit);
  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f * 0.7);
  gl_FragColor = vec4(col, t.a * 0.85);
}`;

// One soft cloud puff, painted procedurally: several blurred blobs.
function paintCloudTexture(gl) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 128);
  const blobs = [
    [70, 80, 46], [120, 62, 58], [175, 78, 50], [100, 88, 40], [150, 92, 42], [205, 88, 30],
  ];
  for (const [x, y, r] of blobs) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export class Sky {
  constructor(gl, rng) {
    this.gl = gl;
    const p = CONFIG.palette;
    this.sunDir = v3Normalize(CONFIG.sunDirection);
    this.skyProg = compileProgram(gl, SKY_VERT, SKY_FRAG);
    this.cloudProg = compileProgram(gl, CLOUD_VERT, CLOUD_FRAG);
    this.cloudTex = paintCloudTexture(gl);
    // Dome: a big sphere shell rendered inside-out (depth trick in the shader).
    const dome = [];
    const latSegs = 12; const lonSegs = 24; const R = 4200;
    for (let lat = 0; lat <= latSegs; lat++) {
      const theta = (lat / latSegs) * Math.PI * 0.5;
      for (let lon = 0; lon <= lonSegs; lon++) {
        const phi = (lon / lonSegs) * Math.PI * 2;
        dome.push(
          Math.cos(theta) * Math.cos(phi) * R,
          Math.sin(theta) * R,
          Math.cos(theta) * Math.sin(phi) * R,
        );
      }
    }
    const domeIdx = [];
    for (let lat = 0; lat < latSegs; lat++) {
      for (let lon = 0; lon < lonSegs; lon++) {
        const a = lat * (lonSegs + 1) + lon;
        const b = a + lonSegs + 1;
        domeIdx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    this.domeVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.domeVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dome), gl.STATIC_DRAW);
    this.domeIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.domeIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(domeIdx), gl.STATIC_DRAW);
    this.domeCount = domeIdx.length;

    // Cloud quad (unit, centred).
    const q = new Float32Array([
      -1, -0.5, 0, 0, 0, -1, 0.5, 0, 0, 1, 1, 0.5, 0, 1, 1, 1, -0.5, 0, 1, 0,
    ]);
    this.cloudVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudVbo);
    gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
    this.cloudIbo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cloudIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    // Cloud field: seeded positions high over the archipelago.
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      this.clouds.push({
        x: (rng() - 0.5) * 2600,
        y: 190 + rng() * 130,
        z: (rng() - 0.5) * 2600,
        w: 220 + rng() * 260,
        speed: 1.2 + rng() * 1.6,
        lit: 0.35 + rng() * 0.65,
      });
    }
  }

  draw(view, proj, time, camPos) {
    const gl = this.gl;
    const p = CONFIG.palette;
    gl.depthMask(false);
    gl.useProgram(this.skyProg.prog);
    const sl = this.skyProg.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.domeVbo);
    gl.enableVertexAttribArray(sl.aPos);
    gl.vertexAttribPointer(sl.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.domeIbo);
    // Dome follows the camera so it never clips.
    const domeView = new Float32Array(view);
    domeView[12] = 0; domeView[13] = 0; domeView[14] = 0;
    gl.uniformMatrix4fv(sl.uView, false, domeView);
    gl.uniformMatrix4fv(sl.uProj, false, proj);
    gl.uniform3fv(sl.uSunDir, this.sunDir);
    gl.uniform3fv(sl.uZenith, p.skyZenith);
    gl.uniform3fv(sl.uMid, p.skyMid);
    gl.uniform3fv(sl.uHorizon, p.skyHorizon);
    gl.uniform3fv(sl.uSunCore, p.sunCore);
    gl.drawElements(gl.TRIANGLES, this.domeCount, gl.UNSIGNED_SHORT, 0);

    // Clouds: billboards that always face the camera, drifting east.
    gl.useProgram(this.cloudProg.prog);
    const cl = this.cloudProg.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cloudVbo);
    gl.enableVertexAttribArray(cl.aPos);
    gl.vertexAttribPointer(cl.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(cl.aUv);
    gl.vertexAttribPointer(cl.aUv, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.cloudIbo);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
    gl.uniform1i(cl.uTex, 0);
    gl.uniformMatrix4fv(cl.uView, false, view);
    gl.uniformMatrix4fv(cl.uProj, false, proj);
    gl.uniform3fv(cl.uFogColor, p.fog);
    gl.uniform1f(cl.uFogNear, 500);
    gl.uniform1f(cl.uFogFar, 2600);
    for (const c of this.clouds) {
      const cx = c.x + time * c.speed;
      const wrapped = ((cx + 1400) % 2800 + 2800) % 2800 - 1400;
      // Billboard: copy the camera rotation out of the view matrix.
      const m = mat4Identity();
      m[0] = view[0]; m[1] = view[4]; m[2] = view[8];
      m[4] = view[1]; m[5] = view[5]; m[6] = view[9];
      m[8] = view[2]; m[9] = view[6]; m[10] = view[10];
      const model = mat4Multiply(
        mat4Multiply(mat4Translation(wrapped, c.y, c.z), m),
        mat4Scale(c.w, c.w * 0.42, 1),
      );
      gl.uniformMatrix4fv(cl.uModel, false, model);
      gl.uniform1f(cl.uLit, c.lit);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.depthMask(true);
  }
}
