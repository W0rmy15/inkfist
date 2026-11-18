import test from "node:test";
import assert from "node:assert/strict";
import {
  IN, MAX_HP, MAX_METER, SUB, LEFT, RIGHT,
  createMatch, step, cloneState, hashState, fighterView,
} from "../shared/sim.js";

function boot() {
  const s = createMatch();
  let guard = 0;
  while (s.phase === "intro" && guard++ < 500) step(s, [0, 0]);
  assert.equal(s.phase, "fight");
  return s;
}

function place(s, x0, x1) {
  s.fighters[0].x = x0 * SUB;
  s.fighters[1].x = x1 * SUB;
  s.fighters[0].facing = 1;
  s.fighters[1].facing = -1;
}

test("intro emits round_start and reaches fight", () => {
  const s = createMatch();
  const ev = step(s, [0, 0]);
  assert.ok(ev.some((e) => e.type === "round_start" && e.playerId === -1 && e.frame === 0));
  assert.equal(typeof ev[0].x, "number");
  assert.equal(typeof ev[0].y, "number");
  const done = boot();
  assert.equal(done.roundTime, 60 * 60);
});

test("hash is stable across clone and replay", () => {
  const a = boot();
  const b = cloneState(a);
  assert.equal(hashState(a), hashState(b));
  assert.match(hashState(a), /^[0-9a-f]{8}$/);
  const script = (i, side) => {
    const k = (i * (side + 3) * 17) % 97;
    if (k === 0) return IN.LIGHT;
    if (k === 1) return IN.HEAVY;
    if (k === 2) return IN.SPECIAL;
    if (k === 3) return IN.DASH;
    if (k === 4) return IN.BLOCK;
    if (k < 20) return side === 0 ? IN.R : IN.L;
    if (k < 28) return side === 0 ? IN.L : IN.R;
    if (k === 30) return IN.U;
    if (k === 31) return IN.D | IN.HEAVY;
    if (k === 32) return IN.U | IN.DASH;
    if (k === 33) return IN.D | IN.SPECIAL;
    return 0;
  };
  for (let i = 0; i < 500; i++) {
    const m = [script(i, 0), script(i, 1)];
    step(a, m);
    step(b, m);
    assert.equal(hashState(a), hashState(b), `diverge at ${i} phase ${a.phase}`);
    for (const f of a.fighters) {
      assert.ok(f.hp >= 0 && f.hp <= MAX_HP);
      assert.ok(f.meter >= 0 && f.meter <= MAX_METER);
      assert.ok(f.x >= LEFT && f.x <= RIGHT);
      assert.ok(f.y >= 0 && f.y < 400 * SUB);
    }
  }
});

test("rollback replay matches a straight run", () => {
  const full = boot();
  const branch = boot();
  const inputs = [];
  for (let i = 0; i < 80; i++) {
    const m = [i % 11 === 0 ? IN.LIGHT : IN.R, i % 17 === 0 ? IN.BLOCK : IN.L];
    inputs.push(m);
    step(full, m);
  }
  for (let i = 0; i < 40; i++) step(branch, inputs[i]);
  const snap = cloneState(branch);
  for (let i = 40; i < 80; i++) step(branch, [IN.DASH, IN.HEAVY]);
  const restored = cloneState(snap);
  for (let i = 40; i < 80; i++) step(restored, inputs[i]);
  assert.equal(hashState(restored), hashState(full));
  assert.equal(restored.frame, full.frame);
});

test("jab damages and reports a hit", () => {
  const s = boot();
  place(s, 500, 570);
  let hit = null;
  let started = false;
  for (let i = 0; i < 20; i++) {
    const input = started ? 0 : IN.LIGHT;
    if (s.fighters[0].move === "jab") started = true;
    const ev = step(s, [input, 0]);
    const h = ev.find((e) => e.type === "hit" && !e.blocked);
    if (h) hit = h;
  }
  assert.ok(hit, "expected a connecting jab");
  assert.equal(hit.move, "jab");
  assert.equal(hit.weight, "light");
  assert.equal(hit.blocked, false);
  assert.equal(hit.parried, false);
  assert.ok(hit.damage > 0);
  assert.equal(typeof hit.dirX, "number");
  assert.equal(typeof hit.dirY, "number");
  assert.ok(s.fighters[1].hp < MAX_HP);
  const view = fighterView(s, 0);
  assert.equal(typeof view.move, "string");
  assert.equal(typeof view.frame, "number");
  assert.ok(Object.isFrozen(view));
});

test("crouch block stops a jab, standing block loses to sweep", () => {
  const blocked = boot();
  place(blocked, 500, 560);
  let started = false;
  for (let i = 0; i < 16; i++) {
    const p1 = started ? 0 : IN.LIGHT;
    if (blocked.fighters[0].move === "jab") started = true;
    step(blocked, [p1, IN.BLOCK | IN.D]);
  }
  assert.equal(blocked.fighters[1].hp, MAX_HP);

  const swept = boot();
  place(swept, 500, 560);
  started = false;
  let saw = false;
  for (let i = 0; i < 24; i++) {
    const p1 = started ? 0 : (IN.D | IN.HEAVY);
    if (swept.fighters[0].move === "sweep") started = true;
    const ev = step(swept, [p1, IN.BLOCK]);
    if (ev.some((e) => e.type === "hit" && !e.blocked)) saw = true;
  }
  assert.ok(saw);
  assert.ok(swept.fighters[1].hp < MAX_HP);
});

test("parry negates damage and stuns the attacker", () => {
  const s = boot();
  place(s, 500, 565);
  let started = false;
  let parried = false;
  for (let i = 0; i < 20; i++) {
    const f = s.fighters[0];
    if (f.move === "jab") started = true;
    const p1 = started ? 0 : IN.LIGHT;
    const p2 = f.move === "jab" && f.moveFrame === 3 ? IN.BLOCK : 0;
    const ev = step(s, [p1, p2]);
    if (ev.some((e) => e.type === "parry")) parried = true;
  }
  assert.ok(parried, "parry should land on the active frame");
  assert.equal(s.fighters[1].hp, MAX_HP);
  assert.equal(s.fighters[0].state, "parry_stun");
});

test("launcher sends the opponent up", () => {
  const s = boot();
  place(s, 500, 560);
  let started = false;
  let launched = false;
  for (let i = 0; i < 30; i++) {
    if (s.fighters[0].move === "upper") started = true;
    const p1 = started ? 0 : IN.HEAVY;
    const ev = step(s, [p1, 0]);
    if (ev.some((e) => e.type === "launch")) launched = true;
  }
  assert.ok(launched);
  assert.ok(s.fighters[1].y > 0 || s.fighters[1].airborne || s.fighters[1].state === "knockdown" || s.fighters[1].state === "hitstun");
});

test("projectile hits a standing fighter and whiffs on a crouch", () => {
  function fire(crouch) {
    const s = boot();
    place(s, 280, 980);
    let shot = false;
    let hp = MAX_HP;
    for (let i = 0; i < 140; i++) {
      const p1 = shot ? 0 : IN.SPECIAL;
      if (s.fighters[0].move === "blast") shot = true;
      const p2 = crouch ? IN.D : 0;
      step(s, [p1, p2]);
      hp = s.fighters[1].hp;
      if (s.phase !== "fight") break;
    }
    return { hp, shot, projectiles: s.projectiles.length, phase: s.phase };
  }
  const stand = fire(false);
  const duck = fire(true);
  assert.ok(stand.shot);
  assert.ok(stand.hp < MAX_HP, `standing fighter should eat the blast, hp ${stand.hp}`);
  assert.equal(duck.hp, MAX_HP);
});

test("throw grabs in range and deals damage", () => {
  const s = boot();
  place(s, 500, 560);
  let threw = false;
  for (let i = 0; i < 50; i++) {
    const p1 = i === 0 ? (IN.R | IN.SPECIAL) : 0;
    const ev = step(s, [p1, 0]);
    if (ev.some((e) => e.type === "throw")) threw = true;
  }
  assert.ok(threw);
  assert.ok(s.fighters[1].hp < MAX_HP);
});

test("spike ground-bounces an airborne body", () => {
  const s = boot();
  const d = s.fighters[1];
  d.state = "hitstun";
  d.airborne = true;
  d.y = 90 * SUB;
  d.vy = -30;
  d.stun = 50;
  d.bounceOnLand = true;
  d.groundBounced = false;
  let saw = false;
  for (let i = 0; i < 50; i++) {
    const ev = step(s, [0, 0]);
    if (ev.some((e) => e.type === "ground_bounce")) saw = true;
  }
  assert.ok(saw);
  assert.equal(d.groundBounced, true);
});

test("wall bounce reverses a launched body", () => {
  const s = boot();
  const d = s.fighters[1];
  d.x = RIGHT - 2 * SUB;
  d.vx = 10 * SUB;
  d.y = 40 * SUB;
  d.vy = 20;
  d.state = "hitstun";
  d.airborne = true;
  d.stun = 40;
  d.pendingWall = true;
  d.juggle = 1;
  d.wallBounced = false;
  let saw = false;
  for (let i = 0; i < 5; i++) {
    const ev = step(s, [0, 0]);
    if (ev.some((e) => e.type === "wall_bounce")) saw = true;
  }
  assert.ok(saw);
  assert.equal(d.wallBounced, true);
  assert.ok(d.vx < 0);
});

test("super spends the meter", () => {
  const s = boot();
  place(s, 500, 620);
  s.fighters[0].meter = MAX_METER;
  let started = false;
  let charge = false;
  for (let i = 0; i < 20; i++) {
    if (s.fighters[0].move === "super") started = true;
    const p1 = started ? 0 : (IN.D | IN.SPECIAL);
    const ev = step(s, [p1, 0]);
    if (ev.some((e) => e.type === "super_charge")) charge = true;
  }
  assert.ok(charge);
  assert.equal(s.fighters[0].meter, 0);
  assert.equal(s.fighters[0].move, "super");
});

test("a KO wins the round and a second KO ends the match", () => {
  const s = boot();
  place(s, 500, 560);
  s.fighters[1].hp = 1;
  let started = false;
  for (let i = 0; i < 30 && s.phase === "fight"; i++) {
    if (s.fighters[0].move === "jab") started = true;
    step(s, [started ? 0 : IN.LIGHT, 0]);
  }
  assert.notEqual(s.phase, "fight");
  assert.equal(s.wins[0], 1);
  // Play out the round break back into fight, then KO again.
  let guard = 0;
  while (s.phase !== "fight" && s.phase !== "match_end" && guard++ < 800) step(s, [0, 0]);
  if (s.phase === "fight") {
    place(s, 500, 560);
    s.fighters[1].hp = 1;
    started = false;
    for (let i = 0; i < 40 && s.wins[0] < 2; i++) {
      if (s.fighters[0].move === "jab") started = true;
      step(s, [started ? 0 : IN.LIGHT, 0]);
    }
    guard = 0;
    while (s.phase !== "match_end" && guard++ < 800) step(s, [0, 0]);
  }
  assert.equal(s.phase, "match_end");
  assert.ok(s.wins[0] >= 2);
});

test("fighter view reports move name and frame within the move", () => {
  const s = boot();
  place(s, 500, 700);
  step(s, [IN.LIGHT, 0]);
  const view = fighterView(s, 0);
  assert.equal(view.move, "jab");
  assert.equal(view.frame, 0);
  assert.equal(view.playerId, 0);
});
