// Golden Hour: Island Circuit — math3.js
// The game's own small 3D math: vectors, 4x4 matrices and a seeded random
// source. No library: every transform the renderer and the flight model use
// comes from here.

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function degToRad(d) { return (d * Math.PI) / 180; }
export function radToDeg(r) { return (r * 180) / Math.PI; }

// Seeded random (mulberry32): the world is identical for a given seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- vec3 (plain [x, y, z] arrays) ---
export function v3(x = 0, y = 0, z = 0) { return [x, y, z]; }
export function v3Add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
export function v3Sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
export function v3Scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function v3Dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
export function v3Cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
export function v3Length(a) { return Math.hypot(a[0], a[1], a[2]); }
export function v3Normalize(a) {
  const l = v3Length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export function v3Lerp(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// --- mat4 (column-major Float32Array(16), WebGL style) ---
export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
export function mat4Multiply(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
}
export function mat4Translation(x, y, z) {
  const m = mat4Identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}
export function mat4Scale(x, y, z) {
  const m = mat4Identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}
export function mat4RotationX(a) {
  const m = mat4Identity(); const c = Math.cos(a); const s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}
export function mat4RotationY(a) {
  const m = mat4Identity(); const c = Math.cos(a); const s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}
export function mat4RotationZ(a) {
  const m = mat4Identity(); const c = Math.cos(a); const s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}
// Yaw (heading) then pitch then roll, the order a pilot thinks in.
export function mat4FromEuler(yaw, pitch, roll) {
  return mat4Multiply(
    mat4RotationY(yaw),
    mat4Multiply(mat4RotationX(pitch), mat4RotationZ(roll)),
  );
}
export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}
export function mat4LookAt(eye, target, up) {
  const z = v3Normalize(v3Sub(eye, target));
  const x = v3Normalize(v3Cross(up, z));
  const y = v3Cross(z, x);
  const m = mat4Identity();
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0];
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1];
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2];
  m[12] = -v3Dot(x, eye); m[13] = -v3Dot(y, eye); m[14] = -v3Dot(z, eye);
  return m;
}
// Normal matrix (upper 3x3 of a model matrix, for a rotation-only model).
export function mat3FromMat4(m) {
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}
export function mat4TransformPoint(m, p) {
  const x = p[0]; const y = p[1]; const z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}
