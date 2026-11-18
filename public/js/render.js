import { MAX_HP, MAX_METER, SUB } from "../shared/sim.js";
import { poseOf } from "./anim.js";
import { GROUND } from "./fx.js";

const VIEW_W = 960;
const VIEW_H = 540;
const COLORS = [
  { body: "#f0a020", edge: "#8a4e08", eye: "#fff6d2" },
  { body: "#7a1424", edge: "#2c060c", eye: "#ffd0d0" },
];

const trails = [[], []];
let farPath = null;
let cityPath = null;
let nearPath = null;

function buildScenery() {
  farPath = new Path2D();
  let x = -400;
  farPath.moveTo(x, GROUND);
  while (x < 2000) {
    const h = 70 + ((x * 13) % 80);
    farPath.lineTo(x + 30, GROUND - h);
    farPath.lineTo(x + 70, GROUND - h * 0.4);
    x += 90;
  }
  farPath.lineTo(2000, GROUND);
  farPath.closePath();

  cityPath = new Path2D();
  cityPath.moveTo(-200, GROUND);
  const blocks = [40, 90, 50, 130, 70, 160, 40, 110, 80, 150, 60, 100, 140, 50, 120, 70];
  x = -180;
  for (const h of blocks) {
    const w = 36 + (h % 28);
    cityPath.lineTo(x, GROUND - h);
    cityPath.lineTo(x + w * 0.6, GROUND - h - (h % 17));
    cityPath.lineTo(x + w, GROUND - h * 0.72);
    x += w + 8;
  }
  cityPath.lineTo(1600, GROUND);
  cityPath.closePath();

  nearPath = new Path2D();
  nearPath.moveTo(-300, GROUND + 8);
  x = -300;
  while (x < 1800) {
    const h = 26 + ((x * 7) % 48);
    nearPath.lineTo(x + 16, GROUND - h);
    nearPath.lineTo(x + 46, GROUND + 8);
    x += 54;
  }
  nearPath.closePath();
}

function resize(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(2, canvas.clientWidth);
  const h = Math.max(2, canvas.clientHeight);
  const pw = Math.floor(w * dpr);
  const ph = Math.floor(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  return dpr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function traceLimb(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
}

function drawFigure(ctx, pts, color, eye, alpha, width) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pairs = [
    [pts.hip, pts.kL], [pts.kL, pts.fL],
    [pts.chest, pts.eL], [pts.eL, pts.hL],
    [pts.hip, pts.chest], [pts.chest, pts.head],
    [pts.hip, pts.kR], [pts.kR, pts.fR],
    [pts.chest, pts.eR], [pts.eR, pts.hR],
  ];
  ctx.strokeStyle = color.edge;
  ctx.lineWidth = width + 6;
  for (const [a, b] of pairs) { traceLimb(ctx, a, b); ctx.stroke(); }
  ctx.beginPath();
  ctx.arc(pts.head[0], pts.head[1], 16, 0, Math.PI * 2);
  ctx.fillStyle = color.edge;
  ctx.fill();
  ctx.strokeStyle = color.body;
  ctx.lineWidth = width;
  for (const [a, b] of pairs) { traceLimb(ctx, a, b); ctx.stroke(); }
  ctx.beginPath();
  ctx.arc(pts.head[0], pts.head[1], 13.5, 0, Math.PI * 2);
  ctx.fillStyle = color.body;
  ctx.fill();
  const fx = pts.facing || 1;
  ctx.fillStyle = eye;
  ctx.shadowColor = eye;
  ctx.shadowBlur = 10;
  for (const ox of [3, 11]) {
    roundRect(ctx, pts.head[0] + fx * ox - 3, pts.head[1] - 3, 7, 3.2, 1.4);
    ctx.fill();
  }
  ctx.restore();
}

function pointsFor(f, pose) {
  const feetX = f.x / SUB;
  const feetY = GROUND - f.y / SUB;
  const hip = pose.joints.hip || [0, 0];
  const lean = pose.rot ? 0 : Math.max(-12, Math.min(12, f.vx / SUB));
  const hipX = feetX + hip[0] * f.facing + lean * 0.45;
  const hipY = feetY - 70 + hip[1];
  const pts = { hip: [hipX, hipY], facing: f.facing };
  for (const key of ["chest", "head", "eL", "hL", "eR", "hR", "kL", "fL", "kR", "fR"]) {
    const p = pose.joints[key] || [0, 0];
    pts[key] = [hipX + p[0] * f.facing, hipY + p[1]];
  }
  return pts;
}

function smear(ctx, prev, curr, color) {
  if (!prev) return;
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = color.body;
  for (const key of ["hL", "hR", "fL", "fR"]) {
    const a = prev[key];
    const b = curr[key];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    if (d < 18) continue;
    const nx = (-dy / d) * 5;
    const ny = (dx / d) * 5;
    ctx.beginPath();
    ctx.moveTo(a[0] + nx, a[1] + ny);
    ctx.lineTo(a[0] - nx, a[1] - ny);
    ctx.lineTo(b[0], b[1]);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(ctx, p, color) {
  const x = p.x / SUB;
  const y = GROUND - p.y / SUB;
  const g = ctx.createRadialGradient(x, y, 2, x, y, 22);
  g.addColorStop(0, "#fff");
  g.addColorStop(0.35, color.body);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(x - Math.sign(p.vx) * 16, y, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function bannerFor(state, names) {
  if (state.phase === "intro") {
    if (state.phaseFrame < 64) return { text: `ROUND ${state.round}`, sub: "BEST OF THREE" };
    return { text: "FIGHT", sub: "" };
  }
  if (state.phase === "ko_freeze" || state.phase === "round_end") {
    if (state.reason === "draw") return { text: "DRAW", sub: "ROUND AGAIN" };
    if (state.reason === "time") return { text: "TIME", sub: "" };
    return { text: "K.O.", sub: "" };
  }
  if (state.phase === "match_end") {
    const w = state.wins[0] >= state.wins[1] ? 0 : 1;
    return { text: (names[w] || "FIGHTER").toUpperCase(), sub: "WINS" };
  }
  return null;
}

function drawHud(ctx, state, names, you, fx) {
  ctx.save();
  ctx.font = "700 13px Impact, Haettenschweiler, sans-serif";
  const bars = [
    { x: 36, y: 28, w: 360, side: 0 },
    { x: 564, y: 28, w: 360, side: 1 },
  ];
  for (const bar of bars) {
    const f = state.fighters[bar.side];
    const pct = Math.max(0, f.hp / MAX_HP);
    const shown = bar.shown == null ? pct : bar.shown;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bar.x - 3, bar.y - 3, bar.w + 6, 22);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    if (bar.side === 0) ctx.fillRect(bar.x, bar.y, bar.w * Math.max(pct, shown), 16);
    else ctx.fillRect(bar.x + bar.w * (1 - Math.max(pct, shown)), bar.y, bar.w * Math.max(pct, shown), 16);
    ctx.fillStyle = COLORS[bar.side].body;
    if (bar.side === 0) ctx.fillRect(bar.x, bar.y, bar.w * pct, 16);
    else ctx.fillRect(bar.x + bar.w * (1 - pct), bar.y, bar.w * pct, 16);
    const meter = f.meter / MAX_METER;
    const my = bar.y + 20;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bar.x, my, bar.w, 6);
    ctx.fillStyle = meter >= 1 ? "#ffe08a" : COLORS[bar.side].body;
    ctx.globalAlpha = meter >= 1 ? 0.75 + Math.sin(state.frame / 6) * 0.25 : 1;
    if (bar.side === 0) ctx.fillRect(bar.x, my, bar.w * meter, 6);
    else ctx.fillRect(bar.x + bar.w * (1 - meter), my, bar.w * meter, 6);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#f6efe2";
    ctx.textAlign = bar.side === 0 ? "left" : "right";
    const label = (names[bar.side] || (bar.side === 0 ? "EMBER" : "MARROW")).toUpperCase();
    ctx.fillText(label, bar.side === 0 ? bar.x : bar.x + bar.w, bar.y - 8);
    if (you === bar.side) {
      ctx.fillStyle = COLORS[bar.side].body;
      ctx.fillText("YOU", bar.side === 0 ? bar.x + ctx.measureText(label).width + 10 : bar.x + bar.w - ctx.measureText(label).width - 10, bar.y - 8);
    }
    for (let i = 0; i < 2; i++) {
      const px = bar.side === 0 ? bar.x + bar.w - 28 + i * 14 : bar.x + 8 + i * 14;
      ctx.strokeStyle = "#f6efe2";
      ctx.strokeRect(px, bar.y + 30, 9, 9);
      if (state.wins[bar.side] > (bar.side === 0 ? 1 - i : i)) {
        ctx.fillStyle = COLORS[bar.side].body;
        ctx.fillRect(px, bar.y + 30, 9, 9);
      }
    }
    bar._pct = pct;
  }
  // trailing chips stored on the function
  ctx.textAlign = "center";
  ctx.fillStyle = "#f6efe2";
  ctx.font = "900 28px Impact, Haettenschweiler, sans-serif";
  const secs = state.phase === "fight" ? Math.ceil(state.roundTime / 60) : 60;
  ctx.fillText(String(Math.max(0, secs)).padStart(2, "0"), VIEW_W / 2, 46);

  if (state.combo && state.combo.timer > 0 && state.combo.hits > 1) {
    const owner = state.combo.owner;
    const x = owner === 0 ? 760 : 200;
    ctx.save();
    ctx.translate(x, 180);
    ctx.scale(fx.comboPop, fx.comboPop);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.font = "900 64px Impact, Haettenschweiler, sans-serif";
    ctx.fillText(String(state.combo.hits), 0, 0);
    ctx.font = "700 18px Impact, Haettenschweiler, sans-serif";
    ctx.fillStyle = COLORS[owner].body;
    ctx.fillText("HITS", 0, 22);
    ctx.fillStyle = "#f6efe2";
    ctx.fillText(String(state.combo.damage), 0, 44);
    ctx.restore();
  }

  const banner = bannerFor(state, names);
  if (banner) {
    const age = state.phaseFrame;
    const pop = state.phase === "intro" && state.phaseFrame > 64 ? 1 : Math.max(1, 1.4 - age * 0.03);
    ctx.save();
    ctx.translate(VIEW_W / 2, 250);
    ctx.scale(pop, pop);
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "900 92px Impact, Haettenschweiler, sans-serif";
    ctx.fillText(banner.text, 4, 6);
    ctx.fillStyle = "#f7f1e6";
    ctx.fillText(banner.text, 0, 0);
    if (banner.sub) {
      ctx.font = "700 18px Impact, Haettenschweiler, sans-serif";
      ctx.fillStyle = "#ffb057";
      ctx.fillText(banner.sub, 0, 36);
    }
    ctx.restore();
  }

  if (state.phase === "intro" && state.phaseFrame > 70) {
    ctx.globalAlpha = Math.max(0, 1 - (state.phaseFrame - 78) / 22);
    ctx.font = "600 14px ui-monospace, monospace";
    ctx.fillStyle = "#f6efe2";
    ctx.textAlign = "center";
    ctx.fillText("J LIGHT   K HEAVY   L SPECIAL   I BLOCK   SHIFT DASH", VIEW_W / 2, 500);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// Persist displayed health so the white chip trails the true bar.
const shownHp = [1, 1];

export function render(canvas, state, fx, meta) {
  if (!farPath) buildScenery();
  const ctx = canvas.getContext("2d");
  resize(canvas);
  const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
  const ox = (canvas.width - VIEW_W * scale) / 2;
  const oy = (canvas.height - VIEW_H * scale) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#07060a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);

  const ink = state.ink > 0;
  const mid = (state.fighters[0].x + state.fighters[1].x) / 2 / SUB;
  if (!render.cam) render.cam = { x: 640, zoom: 1 };
  const cam = render.cam;
  cam.x += (mid - cam.x) * 0.12;
  cam.x = Math.max(500, Math.min(780, cam.x));
  const zTarget = 1 + (fx.menu ? 0 : fx.zoom);
  cam.zoom += (zTarget - cam.zoom) * 0.15;

  const sky = ctx.createLinearGradient(0, 0, 0, GROUND + 40);
  if (ink) {
    sky.addColorStop(0, "#f7f1e4");
    sky.addColorStop(1, "#d9d2c4");
  } else {
    sky.addColorStop(0, "#140e22");
    sky.addColorStop(0.42, "#5c2a52");
    sky.addColorStop(0.72, "#e07a3d");
    sky.addColorStop(1, "#24140f");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const parallax = (cam.x - 640);
  ctx.save();
  ctx.translate(-parallax * 0.15, 0);
  ctx.fillStyle = ink ? "#2a241c" : "#120a16";
  ctx.fill(farPath);
  ctx.restore();
  ctx.save();
  ctx.translate(-parallax * 0.32, 0);
  ctx.fillStyle = ink ? "#1c1814" : "#0e0a12";
  ctx.fill(cityPath);
  ctx.restore();
  ctx.save();
  ctx.translate(-parallax * 0.55, 0);
  ctx.fillStyle = ink ? "#14110e" : "#07060c";
  ctx.fill(nearPath);
  ctx.restore();

  const shx = (Math.sin(state.frame * 1.7) + Math.sin(state.frame * 2.9)) * fx.shake * 0.45;
  const shy = Math.cos(state.frame * 2.1) * fx.shake * 0.3;

  ctx.save();
  ctx.translate(VIEW_W / 2 + shx, 300 + shy);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -300);

  ctx.fillStyle = ink ? "#cfc6b6" : "#120c0e";
  ctx.fillRect(-400, GROUND, 2200, 400);
  ctx.fillStyle = ink ? "#1a1612" : "#5c4036";
  ctx.fillRect(-400, GROUND, 2200, ink ? 3 : 2);

  for (const f of state.fighters) {
    const feetX = f.x / SUB;
    const feetY = GROUND - f.y / SUB;
    const h = f.y / SUB;
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.35 - Math.min(0.25, h / 500)})`;
    ctx.beginPath();
    ctx.ellipse(feetX, GROUND + 4, Math.max(10, 34 - h / 10), 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of state.projectiles) drawProjectile(ctx, p, COLORS[p.owner] || COLORS[0]);

  if (state.phase === "intro" && state.phaseFrame < 2) {
    trails[0].length = 0;
    trails[1].length = 0;
  }
  const order = [...state.fighters].sort((a, b) => a.y - b.y);
  for (const f of order) {
    const pose = poseOf(f);
    const pts = pointsFor(f, pose);
    const color = ink ? { body: "#14110e", edge: "#14110e", eye: "#f7f3ea" } : COLORS[f.id];
    const eye = ink ? "#f7f3ea" : color.eye;
    const hist = trails[f.id];
    const prev = hist.length ? hist[hist.length - 1].pts : null;
    const fast = Math.abs(f.vx) > 90 || f.state === "dash" || f.dashTimer > 0;
    if (fast) {
      hist.push({ pts, life: 8 });
      if (hist.length > 5) hist.shift();
    } else if (hist.length) hist.shift();
    for (const ghost of hist) {
      if (ghost.pts === pts) continue;
      drawFigure(ctx, ghost.pts, color, eye, 0.16, 12);
    }
    smear(ctx, prev, pts, color);
    if (f.meter >= MAX_METER && !ink && state.phase === "fight") {
      ctx.save();
      ctx.globalAlpha = 0.35 + Math.sin(state.frame / 5) * 0.15;
      ctx.strokeStyle = color.body;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pts.hip[0], pts.hip[1] - 10, 54 + Math.sin(state.frame / 4) * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawFigure(ctx, pts, color, eye, 1, 12);
    hist._last = pts;
  }

  for (const p of fx.particles) {
    const t = p.life / (p.max || p.life);
    ctx.globalAlpha = Math.max(0, t);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (p.kind === "dust" ? (1.4 - t) : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const s of fx.sparks) {
    const u = 1 - s.life / s.max;
    const r = 8 + u * 46 * s.scale;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.38;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + u * 50 * s.scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.font = "700 16px Impact, Haettenschweiler, sans-serif";
  ctx.textAlign = "center";
  for (const fl of fx.floaters) {
    ctx.globalAlpha = Math.max(0, fl.life / 28);
    ctx.fillStyle = fl.color;
    ctx.fillText(fl.text, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  if (fx.flash > 0.02 && !fx.menu) {
    ctx.fillStyle = `rgba(255,255,255,${fx.flash})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (!ink) {
    const vig = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 180, VIEW_W / 2, VIEW_H / 2, 520);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  for (let i = 0; i < 2; i++) {
    const target = state.fighters[i].hp / MAX_HP;
    shownHp[i] += (target - shownHp[i]) * 0.18;
    if (shownHp[i] < target) shownHp[i] = target;
  }
  drawHud(ctx, state, meta.names, meta.you, fx);
  // white damage chip using shownHp — redraw a thin remnant by painting inside drawHud next frame.
  // The chip is the gap between shownHp and true hp, painted here over the bars.
  ctx.save();
  const specs = [
    { x: 36, side: 0 },
    { x: 564, side: 1 },
  ];
  for (const spec of specs) {
    const pct = state.fighters[spec.side].hp / MAX_HP;
    const ghost = shownHp[spec.side];
    if (ghost - pct < 0.004) continue;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    const w = 360;
    if (spec.side === 0) ctx.fillRect(spec.x + w * pct, 28, w * (ghost - pct), 16);
    else ctx.fillRect(spec.x + w * (1 - ghost), 28, w * (ghost - pct), 16);
  }
  ctx.restore();
}
