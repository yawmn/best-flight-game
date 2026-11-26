// Basalt Horizon — hud.js
// Every instrument the pilot reads, drawn on a 2D canvas over the 3D view:
// compass tape, attitude indicator, airspeed/altitude block, fuel and hull
// bars with the burn rate, the wind, the mission objective and the messages.
// The title, pause and end screens live here too. System fonts only.

import { CONFIG, GAME_TITLE, GAME_SUBTITLE, MISSIONS } from './config.js';
import { headingDegrees, knots } from './physics.js';
import { clamp } from './math3.js';

const AMBER = '#ffb347';
const AMBER_DIM = 'rgba(255,179,71,0.55)';
const CYAN = '#7fe3ff';
const WHITE = '#f4f1e8';
const RED = '#ff5a4e';
const GREEN = '#58d68d';

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 1280;
    this.H = 720;
    this.titleCards = []; // clickable mission cards, in canvas pixels
    this.messageLog = []; // {text, at}
  }

  resize(w, h, dpr) {
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  pushMessage(text, now) {
    this.messageLog.push({ text, at: now });
    if (this.messageLog.length > 4) this.messageLog.shift();
  }

  pill(x, y, w, h, r = 10) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fillStyle = 'rgba(8,10,18,0.58)';
    c.fill();
    c.strokeStyle = AMBER_DIM;
    c.lineWidth = 1;
    c.stroke();
  }

  // A line of text on a strong dark chip, so it stays readable even when
  // the sunset is right behind it (the centre messages and warnings sit
  // over bright sky, not over a panel). `y` is the text baseline.
  chip(str, x, y, size, color = WHITE, weight = 700, align = 'center') {
    const c = this.ctx;
    c.font = `${weight} ${size}px system-ui, sans-serif`;
    const w = c.measureText(str).width;
    const padX = 12, padY = 7;
    let rx;
    if (align === 'center') rx = x - w / 2 - padX;
    else if (align === 'right') rx = x - w - padX;
    else rx = x - padX;
    c.beginPath();
    c.moveTo(rx + 8, y - size - padY + 2);
    c.arcTo(rx + w + padX * 2, y - size - padY + 2, rx + w + padX * 2, y + padY, 8);
    c.arcTo(rx + w + padX * 2, y + padY, rx, y + padY, 8);
    c.arcTo(rx, y + padY, rx, y - size - padY + 2, 8);
    c.arcTo(rx, y - size - padY + 2, rx + w + padX * 2, y - size - padY + 2, 8);
    c.closePath();
    c.fillStyle = 'rgba(10,15,25,0.72)';
    c.fill();
    this.text(str, x, y, size, color, weight, align);
  }

  text(str, x, y, size, color = WHITE, weight = 600, align = 'left', font = 'system-ui, sans-serif') {
    const c = this.ctx;
    c.font = `${weight} ${size}px ${font}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = 'alphabetic';
    c.fillText(str, x, y);
  }

  bar(x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.14)') {
    const c = this.ctx;
    c.fillStyle = bg;
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, w * clamp(frac, 0, 1), h);
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  compass(cx, y, headingDeg) {
    const c = this.ctx;
    const w = 460; const h = 40;
    this.pill(cx - w / 2, y, w, h, 8);
    c.save();
    c.beginPath();
    c.rect(cx - w / 2, y, w, h);
    c.clip();
    const pxPerDeg = 4.2;
    const labels = [[0, 'N'], [45, '045'], [90, 'E'], [135, '135'], [180, 'S'], [225, '225'], [270, 'W'], [315, '315']];
    for (let d = -180; d <= 180; d += 5) {
      let deg = Math.round(headingDeg + d);
      deg = ((deg % 360) + 360) % 360;
      const x = cx + d * pxPerDeg;
      const isMajor = deg % 45 === 0;
      const isMid = deg % 15 === 0;
      c.strokeStyle = isMajor ? AMBER : 'rgba(244,241,232,0.5)';
      c.lineWidth = isMajor ? 2 : 1;
      c.beginPath();
      c.moveTo(x, y + h - 6);
      c.lineTo(x, y + h - (isMajor ? 18 : isMid ? 13 : 9));
      c.stroke();
      if (isMajor) {
        const lab = labels.find(([v]) => v === deg);
        this.text(lab ? lab[1] : String(deg).padStart(3, '0'), x, y + 15, 12, isMajor ? AMBER : WHITE, 700, 'center');
      }
    }
    c.restore();
    // Centre caret + readout below the tape, never clipped by the top edge.
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(cx - 7, y + h - 2);
    c.lineTo(cx + 7, y + h - 2);
    c.lineTo(cx, y + h - 12);
    c.closePath();
    c.fill();
    this.chip(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, y + h + 16, 13, AMBER, 700, 'center');
  }

  attitude(cx, cy, r, pitch, roll) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    c.translate(cx, cy);
    c.rotate(-roll);
    const pitchPx = clamp(pitch * 2.2, -1, 1) * r;
    // Sky above the horizon line, ground below it.
    c.fillStyle = '#3a6ea8';
    c.fillRect(-r, -r - pitchPx, r * 2, r + pitchPx);
    const g = c.createLinearGradient(0, pitchPx, 0, r);
    g.addColorStop(0, '#7a5230');
    g.addColorStop(1, '#3a2a1a');
    c.fillStyle = g;
    c.fillRect(-r, pitchPx, r * 2, r - pitchPx + 2);
    // Pitch ladder.
    c.strokeStyle = 'rgba(244,241,232,0.75)';
    c.lineWidth = 1;
    for (const deg of [-20, -10, 10, 20]) {
      const yy = pitchPx - (deg * Math.PI / 180) * r * 2.2;
      const wdt = deg % 20 === 0 ? 34 : 20;
      c.beginPath();
      c.moveTo(-wdt, yy);
      c.lineTo(wdt, yy);
      c.stroke();
    }
    c.strokeStyle = WHITE;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-r, pitchPx);
    c.lineTo(r, pitchPx);
    c.stroke();
    c.restore();
    // Fixed wings marker + rim.
    c.strokeStyle = AMBER;
    c.lineWidth = 2.5;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(cx - 26, cy);
    c.lineTo(cx - 8, cy);
    c.lineTo(cx, cy + 5);
    c.lineTo(cx + 8, cy);
    c.lineTo(cx + 26, cy);
    c.lineTo(cx + 8, cy + 3);
    c.lineTo(cx, cy + 7);
    c.lineTo(cx - 8, cy + 3);
    c.closePath();
    c.fill();
    this.text('ATT', cx, cy + r + 16, 11, 'rgba(244,241,232,0.7)', 600, 'center');
  }

  drawFlying(state, mission, now) {
    const c = this.ctx;
    const W = this.W; const H = this.H;
    const hdg = headingDegrees(state.heading);
    this.compass(W / 2, 14, hdg);

    // Mission panel, top left.
    this.pill(16, 14, 348, 96, 10);
    this.text(mission.mission.name.toUpperCase(), 30, 38, 17, AMBER, 800);
    this.text(mission.objectiveText(state), 30, 60, 13.5, WHITE, 500);
    this.text(
      `SCORE ${state.score}   •   RINGS ${mission.ringsDone}/${mission.ringsTotal}   •   ${fmtTime(state.time)}`,
      30, 84, 13, CYAN, 600,
    );
    if (mission.mission.maxAlt) {
      this.text(`MAX ALT ${mission.mission.maxAlt}m`, 30, 102, 12, state.pos[1] > mission.mission.maxAlt ? RED : 'rgba(244,241,232,0.65)', 700);
    }

    // Fuel / hull / wind panel, top right: label, bar and value on one row,
    // burn rate on its own row so nothing is ever clipped.
    this.pill(W - 286, 14, 270, 116, 10);
    const burn = 0.12 + (0.55 - 0.12) * state.throttle;
    const fuelColor = state.fuel < 20 ? RED : AMBER;
    this.text('FUEL', W - 270, 38, 13, WHITE, 700);
    this.bar(W - 222, 28, 130, 10, state.fuel / 100, fuelColor);
    this.text(`${Math.round(state.fuel)}%`, W - 32, 38, 13, fuelColor, 700, 'right');
    this.text(`BURN ×${(burn / 0.12).toFixed(1)}`, W - 270, 58, 12, fuelColor, 600);
    this.text('HULL', W - 270, 78, 13, WHITE, 700);
    this.bar(W - 222, 68, 130, 10, state.hull / 100, state.hull < 40 ? RED : GREEN);
    this.text(`${Math.round(state.hull)}%`, W - 32, 78, 13, state.hull < 40 ? RED : GREEN, 700, 'right');
    const wind = CONFIG.wind;
    this.text(`WIND ${wind.knots} KT ◀ ${wind.from}`, W - 270, 104, 12.5, CYAN, 600);

    // Attitude indicator, bottom left.
    this.attitude(108, H - 108, 76, state.pitch, state.roll);

    // Instrument block, bottom right.
    this.pill(W - 316, H - 124, 300, 108, 10);
    this.text('SPD', W - 300, H - 92, 12, 'rgba(244,241,232,0.65)', 700);
    this.text(String(knots(state.speed)), W - 300, H - 52, 34, WHITE, 800);
    this.text('KT', W - 216, H - 52, 13, CYAN, 700);
    this.text('ALT', W - 196, H - 92, 12, 'rgba(244,241,232,0.65)', 700);
    this.text(String(Math.max(0, Math.round(state.pos[1]))), W - 196, H - 52, 34, WHITE, 800);
    this.text('M', W - 118, H - 52, 13, CYAN, 700);
    this.text(`V/S ${state.verticalSpeed >= 0 ? '+' : ''}${Math.round(state.verticalSpeed)} m/s`, W - 300, H - 30, 12.5, WHITE, 600);
    this.text(`THR ${Math.round(state.throttle * 100)}%`, W - 196, H - 30, 12.5, WHITE, 600);
    this.bar(W - 92, H - 40, 60, 8, state.throttle, AMBER);

    // Centre flight-path marker.
    c.strokeStyle = 'rgba(127,227,255,0.85)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(W / 2, H / 2, 14, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(W / 2 - 22, H / 2);
    c.lineTo(W / 2 - 14, H / 2);
    c.moveTo(W / 2 + 14, H / 2);
    c.lineTo(W / 2 + 22, H / 2);
    c.moveTo(W / 2, H / 2 - 22);
    c.lineTo(W / 2, H / 2 - 14);
    c.stroke();

    // Warnings, on dark chips: bare red text over bright sky washes out.
    if (state.speed < CONFIG.flight.stallSpeed && state.phase === 'flying') {
      this.chip('⚠ STALL — NOSE DOWN, THROTTLE UP', W / 2, H / 2 + 90, 16, RED, 800, 'center');
    }
    if (state.fuel < 20 && state.fuel > 0) {
      this.chip('LOW FUEL', W - 151, 146, 14, RED, 800, 'center');
    }
    if (state.fuel <= 0) {
      this.chip('FUEL EMPTY — GLIDE TO A STRIP', W / 2, H / 2 + 116, 16, RED, 800, 'center');
    }

    // Messages, centre top under the compass (below its heading readout),
    // each on its own dark chip so the sun never eats the text.
    let my = 100;
    for (const m of this.messageLog) {
      const age = now - m.at;
      if (age > 4) continue;
      c.globalAlpha = age > 3 ? 4 - age : 1;
      this.chip(m.text, W / 2, my, 17, AMBER, 800, 'center');
      c.globalAlpha = 1;
      my += 32; // a chip is 29 px tall; leave a gap between stacked ones
    }
  }

  drawTitle(selectedMission) {
    const c = this.ctx;
    const W = this.W; const H = this.H;
    c.fillStyle = 'rgba(6,8,16,0.42)';
    c.fillRect(0, 0, W, H);
    this.text(GAME_TITLE, W / 2, 132, 66, AMBER, 900, 'center');
    this.text(GAME_SUBTITLE.toUpperCase(), W / 2, 164, 17, WHITE, 600, 'center');
    this.text('A complete 3D flight game — raw WebGL, no engine, no network.', W / 2, 192, 14, 'rgba(244,241,232,0.8)', 500, 'center');

    this.titleCards = [];
    const cardW = 360; const cardH = 118; const gap = 24;
    const totalW = cardW * 3 + gap * 2;
    let x = (W - totalW) / 2;
    const y = 236;
    MISSIONS.forEach((m, i) => {
      const selected = selectedMission === i;
      c.save();
      if (selected) {
        c.shadowColor = AMBER;
        c.shadowBlur = 18;
      }
      this.pill(x, y, cardW, cardH, 12);
      c.restore();
      if (selected) {
        c.strokeStyle = AMBER;
        c.lineWidth = 2;
        c.strokeRect(x + 1, y + 1, cardW - 2, cardH - 2);
      }
      this.text(`${i + 1} — ${m.name.toUpperCase()}`, x + 18, y + 30, 16, selected ? AMBER : WHITE, 800);
      wrapText(this, m.brief, x + 18, y + 54, cardW - 36, 13.5, 'rgba(244,241,232,0.85)');
      this.text('CLICK TO FLY', x + 18, y + cardH - 14, 12, CYAN, 700);
      this.titleCards.push({ x, y, w: cardW, h: cardH, mission: i });
      x += cardW + gap;
    });

    this.text('FLY   ↑↓ pitch    ←→ bank    SHIFT throttle up    CTRL throttle down    C camera    P pause    M sound', W / 2, H - 96, 14, WHITE, 600, 'center');
    this.text('Land gently on a strip to score. Mind the fuel, the hull and the crosswind.', W / 2, H - 70, 13.5, 'rgba(244,241,232,0.75)', 500, 'center');
    this.text('Press 1, 2 or 3 to pick a sortie — or click a card.', W / 2, H - 44, 13.5, AMBER, 700, 'center');
  }

  drawPaused() {
    const c = this.ctx;
    c.fillStyle = 'rgba(6,8,16,0.55)';
    c.fillRect(0, 0, this.W, this.H);
    this.text('PAUSED', this.W / 2, this.H / 2 - 10, 44, AMBER, 900, 'center');
    this.text('P — resume      R — restart sortie      T — title', this.W / 2, this.H / 2 + 30, 15, WHITE, 600, 'center');
  }

  drawEnd(state, mission, crashed) {
    const c = this.ctx;
    const W = this.W; const H = this.H;
    c.fillStyle = 'rgba(6,8,16,0.55)';
    c.fillRect(0, 0, W, H);
    this.pill(W / 2 - 260, H / 2 - 130, 520, 260, 14);
    if (crashed) {
      this.text('CRASHED', W / 2, H / 2 - 78, 40, RED, 900, 'center');
      this.text(state.messages[state.messages.length - 1] || 'The airframe gave up.', W / 2, H / 2 - 46, 15, WHITE, 600, 'center');
    } else {
      this.text('MISSION COMPLETE', W / 2, H / 2 - 78, 34, AMBER, 900, 'center');
      this.text(mission.mission.name, W / 2, H / 2 - 46, 15, WHITE, 600, 'center');
    }
    this.text(`SCORE  ${state.score}`, W / 2, H / 2 - 4, 22, CYAN, 800, 'center');
    this.text(
      `Rings ${mission.ringsDone}/${mission.ringsTotal}   •   Landings ${state.landings}   •   Time ${fmtTime(state.time)}   •   Hull ${Math.round(state.hull)}%`,
      W / 2, H / 2 + 28, 14, WHITE, 600, 'center',
    );
    this.text('R — fly again      T — title      1/2/3 — another sortie', W / 2, H / 2 + 72, 14, AMBER, 700, 'center');
  }

  clear() {
    this.ctx.clearRect(0, 0, this.W, this.H);
  }
}

function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function wrapText(hud, str, x, y, maxW, size, color) {
  const c = hud.ctx;
  c.font = `500 ${size}px system-ui, sans-serif`;
  const words = str.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (c.measureText(test).width > maxW && line) {
      hud.text(line, x, yy, size, color, 500);
      line = w;
      yy += size + 5;
    } else {
      line = test;
    }
  }
  if (line) hud.text(line, x, yy, size, color, 500);
}
