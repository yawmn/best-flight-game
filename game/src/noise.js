// Golden Hour: Island Circuit — noise.js
// Seeded value noise and the island heightmap. The same heightAt() drives the
// terrain mesh, the ground collision, the runway flattening and the tree
// placement, so the world the pilot sees is the world the pilot flies over.

import { CONFIG } from './config.js';
import { mulberry32, clamp } from './math3.js';

const rng = mulberry32(CONFIG.seed);
const PERM = new Uint8Array(512);
{
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function hash2(ix, iz) { return PERM[(PERM[ix & 255] + iz) & 255] / 255; }

// Smooth value noise in [-1, 1].
export function valueNoise(x, z) {
  const ix = Math.floor(x); const iz = Math.floor(z);
  const fx = x - ix; const fz = z - iz;
  const a = hash2(ix, iz); const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1); const d = hash2(ix + 1, iz + 1);
  const u = fade(fx); const v = fade(fz);
  const top = a + (b - a) * u;
  const bot = c + (d - c) * u;
  return (top + (bot - top) * v) * 2 - 1;
}

export function fbm(x, z, octaves = 4) {
  let sum = 0; let amp = 1; let freq = 1; let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.03;
  }
  return sum / norm;
}

// Raw island height before runway flattening: a big island south-west, two
// smaller ones north and east, mountains rising toward the middle of each.
function rawHeight(x, z) {
  const d = Math.hypot(x, z) / (CONFIG.worldSize * 0.5);
  const falloff = Math.max(0, 1 - d * d * 1.15);
  const base = fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.9, 4);
  const ridge = Math.abs(fbm(x * 0.004 + 13.1, z * 0.004 + 5.7, 3));
  let h = (base * 0.55 + ridge * 0.75) * 95 * falloff - 14;
  // A tall volcanic peak on the big island, for a landmark the pilot can read.
  const peak = Math.hypot(x + 420, z + 380);
  h += Math.max(0, 120 - peak * 0.28) * 0.9;
  // Second ridge on the east island.
  const peak2 = Math.hypot(x - 760, z - 380);
  h += Math.max(0, 70 - peak2 * 0.3) * 0.8;
  return h;
}

// Flatten the ground under each runway so a strip is landable. The strip's
// long axis is the flight-heading axis (sin h, cos h), so a pilot flying the
// runway's heading travels along the strip. A clear approach corridor extends
// 260 m beyond each end so a final approach is never blocked by a hill.
export function runwayFlatten(x, z) {
  let flat = null;
  for (const r of CONFIG.runways) {
    const dx = x - r.x; const dz = z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    const target = 6; // runway deck height, just above the sea
    let w = 0;
    if (Math.abs(along) < r.length / 2 + 40 && Math.abs(across) < r.width / 2 + 40) {
      const edge = clamp(
        (Math.abs(along) - r.length / 2) / 40 + (Math.abs(across) - r.width / 2) / 40,
        0, 1,
      );
      w = 1 - Math.min(1, Math.max(0, edge));
    }
    // Approach corridor: fades quadratically over 260 m beyond each end.
    const beyond = Math.abs(along) - (r.length / 2 + 40);
    if (beyond > 0 && beyond < 260 && Math.abs(across) < r.width / 2 + 10) {
      let corridor = 1 - (beyond / 260) ** 2;
      corridor *= 1 - Math.max(0, (Math.abs(across) - (r.width / 2 + 2)) / 8);
      w = Math.max(w, corridor);
    }
    if (w > 0) flat = flat === null ? { h: target, w } : { h: target, w: Math.max(flat.w, w) };
  }
  return flat;
}

export function heightAt(x, z) {
  const h = rawHeight(x, z);
  const flat = runwayFlatten(x, z);
  if (!flat) return h;
  return h * (1 - flat.w) + flat.h * flat.w;
}

// Is this point on a runway strip (for landing detection)?
export function runwayAt(x, z) {
  for (const r of CONFIG.runways) {
    const dx = x - r.x; const dz = z - r.z;
    const along = dx * Math.sin(r.heading) + dz * Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) - dz * Math.sin(r.heading);
    if (Math.abs(along) < r.length / 2 && Math.abs(across) < r.width / 2) return r;
  }
  return null;
}

// Slope-aware colour for one terrain point: sand at the waterline, grass,
// dark forest on the flats, rock on steep ground, snow on the peak.
export function terrainColor(x, z, h) {
  const p = CONFIG.palette;
  const slope = Math.abs(fbm(x * 0.01 + 3, z * 0.01 + 9, 2));
  if (h < 2.5) return p.sand;
  if (h > 105) return p.snow;
  if (slope > 0.55 || h > 78) return p.rock;
  if (fbm(x * 0.004 + 21, z * 0.004 + 4, 2) > 0.12) return p.forest;
  return p.grass;
}
