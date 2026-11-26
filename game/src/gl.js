// Golden Hour: Island Circuit — gl.js
// The game's own WebGL renderer: context setup, shader compile, a tiny mesh
// builder (boxes, cylinders, cones, spheres, tori from primitives) and the
// draw call every 3D object goes through. No engine, no downloaded code.

import { mat3FromMat4 } from './math3.js';

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0.13, 0.18, 0.38, 1);
  return gl;
}

export function compileProgram(gl, vertexSrc, fragmentSrc) {
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program: ' + gl.getProgramInfoLog(prog));
  }
  const locations = {};
  const nAttrib = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < nAttrib; i++) {
    const a = gl.getActiveAttrib(prog, i);
    locations[a.name] = gl.getAttribLocation(prog, a.name);
  }
  const nUniform = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < nUniform; i++) {
    const u = gl.getActiveUniform(prog, i);
    locations[u.name] = gl.getUniformLocation(prog, u.name);
  }
  return { prog, loc: locations };
}

// A mesh: interleaved positions, normals and vertex colours, indexed.
export function createMesh(gl, positions, normals, colors, indices) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  const interleaved = new Float32Array(positions.length * 3 + normals.length * 3 + colors.length * 3);
  // Layout per vertex: pos(3) normal(3) colour(3).
  const verts = positions.length / 3;
  const data = new Float32Array(verts * 9);
  for (let i = 0; i < verts; i++) {
    data[i * 9] = positions[i * 3];
    data[i * 9 + 1] = positions[i * 3 + 1];
    data[i * 9 + 2] = positions[i * 3 + 2];
    data[i * 9 + 3] = normals[i * 3];
    data[i * 9 + 4] = normals[i * 3 + 1];
    data[i * 9 + 5] = normals[i * 3 + 2];
    data[i * 9 + 6] = colors[i * 3];
    data[i * 9 + 7] = colors[i * 3 + 1];
    data[i * 9 + 8] = colors[i * 3 + 2];
  }
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  return { vbo, ibo, count: indices.length };
}

export function drawMesh(gl, program, mesh, modelMatrix, uniforms) {
  gl.useProgram(program.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
  const stride = 9 * 4;
  gl.enableVertexAttribArray(program.loc.aPos);
  gl.vertexAttribPointer(program.loc.aPos, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(program.loc.aNormal);
  gl.vertexAttribPointer(program.loc.aNormal, 3, gl.FLOAT, false, stride, 12);
  gl.enableVertexAttribArray(program.loc.aColor);
  gl.vertexAttribPointer(program.loc.aColor, 3, gl.FLOAT, false, stride, 24);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
  gl.uniformMatrix4fv(program.loc.uModel, false, modelMatrix);
  gl.uniformMatrix3fv(program.loc.uNormalMat, false, mat3FromMat4(modelMatrix));
  for (const key of Object.keys(uniforms)) {
    const loc = program.loc[key];
    if (loc === null || loc === undefined) continue;
    const v = uniforms[key];
    if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (v.length === 3) gl.uniform3fv(loc, v);
    else if (v.length === 16) gl.uniformMatrix4fv(loc, false, v);
    else if (v.length === 4) gl.uniform4fv(loc, v);
  }
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

// Shared lambert + fog + emissive shader for every solid object.
export const MESH_VERT = `
attribute vec3 aPos; attribute vec3 aNormal; attribute vec3 aColor;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj; uniform mat3 uNormalMat;
varying vec3 vNormal; varying vec3 vColor; varying float vDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 view = uView * world;
  vNormal = uNormalMat * aNormal;
  vColor = aColor;
  vDepth = -view.z;
  gl_Position = uProj * view;
}`;
export const MESH_FRAG = `
precision mediump float;
uniform vec3 uSunDir; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uEmissive; uniform float uTime;
varying vec3 vNormal; varying vec3 vColor; varying float vDepth;
void main() {
  vec3 n = normalize(vNormal);
  float diff = max(dot(n, normalize(uSunDir)), 0.0);
  float amb = 0.42;
  vec3 col = vColor * (amb + diff * 0.85);
  col += vColor * uEmissive;
  float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  col = mix(col, uFogColor, f * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

// --- Primitive builders: every vertex is computed here, by hand. ---
function pushQuad(pos, nor, col, idx, a, b, c, d, na, nb, nc, nd, ca, cb, cc, cd) {
  const base = pos.length / 3;
  pos.push(...a, ...b, ...c, ...d);
  nor.push(...na, ...nb, ...nc, ...nd);
  col.push(...ca, ...cb, ...cc, ...cd);
  idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function quadFaces(box, color) {
  // box: {min:[x,y,z], max:[x,y,z]} — returns positions/normals/colors/indices.
  const pos = []; const nor = []; const col = []; const idx = [];
  const [x0, y0, z0] = box.min; const [x1, y1, z1] = box.max;
  const c = color;
  const F = (a, b, cc, d, n) => pushQuad(pos, nor, col, idx, a, b, cc, d, n, n, n, n, c, c, c, c);
  F([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]); // front
  F([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]); // back
  F([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0]); // top
  F([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]); // bottom
  F([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]); // right
  F([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]); // left
  return { pos, nor, col, idx };
}
export function boxGeometry(min, max, color) {
  return quadFaces({ min, max }, color);
}
// Cylinder along Y, capped, with per-ring colour (for fuselage tapering use rings).
export function cylinderGeometry(radiusTop, radiusBottom, height, segments, color, yOffset = 0) {
  const pos = []; const nor = []; const col = []; const idx = [];
  const half = height / 2;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a); const sa = Math.sin(a);
    pos.push(ca * radiusBottom, -half + yOffset, sa * radiusBottom);
    nor.push(ca, 0, sa); col.push(...color);
    pos.push(ca * radiusTop, half + yOffset, sa * radiusTop);
    nor.push(ca, 0, sa); col.push(...color);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  // Caps.
  const topBase = pos.length / 3;
  pos.push(0, half + yOffset, 0); nor.push(0, 1, 0); col.push(...color);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pos.push(Math.cos(a) * radiusTop, half + yOffset, Math.sin(a) * radiusTop);
    nor.push(0, 1, 0); col.push(...color);
  }
  for (let i = 0; i < segments; i++) {
    idx.push(topBase, topBase + 1 + i, topBase + 1 + ((i + 1) % segments));
  }
  const botBase = pos.length / 3;
  pos.push(0, -half + yOffset, 0); nor.push(0, -1, 0); col.push(...color);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pos.push(Math.cos(a) * radiusBottom, -half + yOffset, Math.sin(a) * radiusBottom);
    nor.push(0, -1, 0); col.push(...color);
  }
  for (let i = 0; i < segments; i++) {
    idx.push(botBase, botBase + 1 + ((i + 1) % segments), botBase + 1 + i);
  }
  return { pos, nor, col, idx };
}
export function coneGeometry(radius, height, segments, color) {
  const pos = []; const nor = []; const col = []; const idx = [];
  pos.push(0, height / 2, 0); nor.push(0, 1, 0); col.push(...color);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const ca = Math.cos(a); const sa = Math.sin(a);
    pos.push(ca * radius, -height / 2, sa * radius);
    const n = [ca * 0.8, 0.6, sa * 0.8];
    nor.push(...n); col.push(...color);
  }
  for (let i = 0; i < segments; i++) {
    idx.push(0, 1 + i, 2 + i);
  }
  return { pos, nor, col, idx };
}
export function sphereGeometry(radius, segments, color, squashY = 1) {
  const pos = []; const nor = []; const col = []; const idx = [];
  for (let lat = 0; lat <= segments; lat++) {
    const theta = (lat / segments) * Math.PI;
    const st = Math.sin(theta); const ct = Math.cos(theta);
    for (let lon = 0; lon <= segments; lon++) {
      const phi = (lon / segments) * Math.PI * 2;
      const sp = Math.sin(phi); const cp = Math.cos(phi);
      const n = [st * cp, ct, st * sp];
      pos.push(n[0] * radius, n[1] * radius * squashY, n[2] * radius);
      nor.push(...n); col.push(...color);
    }
  }
  for (let lat = 0; lat < segments; lat++) {
    for (let lon = 0; lon < segments; lon++) {
      const a = lat * (segments + 1) + lon;
      const b = a + segments + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos, nor, col, idx };
}
export function torusGeometry(radius, tube, radialSeg, tubularSeg, color) {
  const pos = []; const nor = []; const col = []; const idx = [];
  for (let i = 0; i <= tubularSeg; i++) {
    const u = (i / tubularSeg) * Math.PI * 2;
    const cu = Math.cos(u); const su = Math.sin(u);
    for (let j = 0; j <= radialSeg; j++) {
      const v = (j / radialSeg) * Math.PI * 2;
      const cv = Math.cos(v); const sv = Math.sin(v);
      const n = [cu * cv, sv, su * cv];
      pos.push((radius + tube * cv) * cu, tube * sv, (radius + tube * cv) * su);
      nor.push(...n); col.push(...color);
    }
  }
  for (let i = 0; i < tubularSeg; i++) {
    for (let j = 0; j < radialSeg; j++) {
      const a = i * (radialSeg + 1) + j;
      const b = a + radialSeg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos, nor, col, idx };
}
// Merge several primitive geometries into one mesh's arrays.
export function mergeGeometries(parts) {
  const pos = []; const nor = []; const col = []; const idx = [];
  for (const g of parts) {
    const base = pos.length / 3;
    pos.push(...g.pos); nor.push(...g.nor); col.push(...g.col);
    for (const i of g.idx) idx.push(i + base);
  }
  return { pos, nor, col, idx };
}
// Translate a geometry in place (for assembling parts at offsets).
export function translateGeometry(g, dx, dy, dz) {
  for (let i = 0; i < g.pos.length; i += 3) {
    g.pos[i] += dx; g.pos[i + 1] += dy; g.pos[i + 2] += dz;
  }
  return g;
}
export function rotateGeometryX(g, angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  for (let i = 0; i < g.pos.length; i += 3) {
    const y = g.pos[i + 1]; const z = g.pos[i + 2];
    g.pos[i + 1] = y * c - z * s;
    g.pos[i + 2] = y * s + z * c;
    const ny = g.nor[i + 1]; const nz = g.nor[i + 2];
    g.nor[i + 1] = ny * c - nz * s;
    g.nor[i + 2] = ny * s + nz * c;
  }
  return g;
}
export function rotateGeometryY(g, angle) {
  const c = Math.cos(angle); const s = Math.sin(angle);
  for (let i = 0; i < g.pos.length; i += 3) {
    const x = g.pos[i]; const z = g.pos[i + 2];
    g.pos[i] = x * c + z * s;
    g.pos[i + 2] = -x * s + z * c;
    const nx = g.nor[i]; const nz = g.nor[i + 2];
    g.nor[i] = nx * c + nz * s;
    g.nor[i + 2] = -nx * s + nz * c;
  }
  return g;
}
export function scaleGeometry(g, sx, sy, sz) {
  for (let i = 0; i < g.pos.length; i += 3) {
    g.pos[i] *= sx; g.pos[i + 1] *= sy; g.pos[i + 2] *= sz;
  }
  return g;
}
