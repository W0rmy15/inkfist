// Juice driven only by the event bus (and a couple of render-side trails).
// Hitstop freezes particles so the impact frame holds.

import { events } from "./events.js";

export const GROUND = 460;

function world(e, lift = 0) {
  return { x: e.x, y: GROUND - e.y - lift };
}

export function createFx() {
  const particles = [];
  const floaters = [];
  const sparks = [];
  return {
    particles,
    floaters,
    sparks,
    shake: 0,
    flash: 0,
    zoom: 0,
    menu: true,
    comboPop: 1,
    lastHits: 0,
    spawn(p) {
      particles.push(p);
      if (particles.length > 220) particles.splice(0, particles.length - 220);
    },
    update(state) {
      const frozen = state.fighters.some((f) => f.hitstop > 0) || state.phase === "ko_freeze";
      const damp = this.menu ? 0.25 : 1;
      this.shake *= frozen ? 0.92 : 0.82;
      this.flash *= 0.72;
      this.zoom *= frozen ? 0.96 : 0.9;
      this.comboPop += (1 - this.comboPop) * 0.2;
      if (state.combo && state.combo.hits !== this.lastHits) {
        if (state.combo.hits > this.lastHits) this.comboPop = 1.45;
        this.lastHits = state.combo.hits;
      }
      if (!state.combo) this.lastHits = 0;
      if (frozen) return;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g || 0;
        p.life--;
      }
      for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
      for (const f of floaters) {
        f.y += f.vy;
        f.life--;
      }
      for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
      for (const s of sparks) s.life--;
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].life <= 0) sparks.splice(i, 1);
      this._damp = damp;
    },
  };
}

const WEIGHT_SHAKE = { light: 3, medium: 5, heavy: 9, special: 7, super: 14 };

export function bindFx(fx) {
  const shake = (n) => { fx.shake = Math.max(fx.shake, n * (fx.menu ? 0.2 : 1)); };
  const zoom = (n) => { fx.zoom = Math.max(fx.zoom, n * (fx.menu ? 0 : 1)); };

  function dust(e, big) {
    const p = world(e);
    const n = big ? 14 : 8;
    for (let i = 0; i < n; i++) {
      fx.spawn({
        kind: "dust",
        x: p.x + (Math.random() - 0.5) * 28,
        y: GROUND - 2,
        vx: (Math.random() - 0.5) * (big ? 3.2 : 1.8),
        vy: -Math.random() * (big ? 2.4 : 1.2),
        g: 0.05,
        life: 16 + (Math.random() * 10) | 0,
        max: 26,
        size: 4 + Math.random() * (big ? 8 : 5),
        color: "rgba(90,70,58,0.45)",
      });
    }
  }

  function burst(e, scale, color) {
    const p = world(e);
    fx.sparks.push({
      kind: "star",
      x: p.x,
      y: p.y,
      life: 10,
      max: 10,
      scale,
      color: color || "#fff",
    });
    const n = 8 + scale * 8;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      const sp = 1.2 + Math.random() * 3.4 * scale;
      fx.spawn({
        kind: "spark",
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 0.08,
        life: 12 + (Math.random() * 10) | 0,
        max: 22,
        size: 2 + Math.random() * 2.5,
        color: Math.random() > 0.45 ? "#6e1420" : "#f4efe6",
      });
    }
  }

  events.on("hit", (e) => {
    if (e.clash) {
      burst(e, 0.7, "#ffe1a8");
      return;
    }
    const w = WEIGHT_SHAKE[e.weight] || 4;
    if (!e.blocked && !e.parried) {
      shake(w);
      zoom(e.weight === "heavy" || e.weight === "super" ? 0.16 : 0.06);
      fx.flash = e.weight === "super" ? 0.75 : e.weight === "heavy" ? 0.45 : 0.22;
      burst(e, e.weight === "light" ? 0.55 : e.weight === "super" ? 1.6 : 1);
      if (e.damage > 0) {
        const p = world(e);
        fx.floaters.push({
          x: p.x,
          y: p.y,
          vy: -0.7,
          life: 28,
          text: String(e.damage),
          color: e.weight === "super" ? "#fff" : "#f6efe2",
        });
      }
    } else if (!e.parried) {
      shake(1.5);
    }
  });
  events.on("block", (e) => {
    const p = world(e);
    for (let i = 0; i < 6; i++) {
      fx.spawn({
        kind: "spark",
        x: p.x, y: p.y,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        life: 8, max: 8, size: 2, color: "#f0e2c4",
      });
    }
  });
  events.on("parry", (e) => {
    shake(7);
    zoom(0.12);
    fx.flash = 0.35;
    burst(e, 1.3, "#fff4c8");
  });
  events.on("dash", (e) => dust(e, false));
  events.on("land", (e) => dust(e, false));
  events.on("launch", (e) => { dust(e, true); shake(4); });
  events.on("wall_bounce", (e) => { dust(e, true); shake(8); fx.flash = 0.2; });
  events.on("ground_bounce", (e) => { dust(e, true); shake(8); fx.flash = 0.25; });
  events.on("throw", () => shake(5));
  events.on("projectile_fire", (e) => {
    const p = world(e);
    fx.spawn({ kind: "muzzle", x: p.x, y: p.y, vx: 0, vy: 0, life: 6, max: 6, size: 18, color: "#fff" });
  });
  events.on("super_start", () => { shake(12); zoom(0.2); fx.flash = 0.55; });
  events.on("super_hit", (e) => { shake(11); zoom(0.18); burst(e, 1.8, "#16130f"); });
  events.on("ko", () => { shake(16); zoom(0.24); fx.flash = 0.85; });
}
