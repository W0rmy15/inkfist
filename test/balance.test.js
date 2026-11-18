import test from "node:test";
import assert from "node:assert/strict";
import { IN, MAX_HP, MAX_METER, SUB, createMatch, step } from "../shared/sim.js";

function boot() {
  const s = createMatch();
  while (s.phase === "intro") step(s, [0, 0]);
  return s;
}

function place(s, a, b) {
  s.fighters[0].x = a * SUB;
  s.fighters[1].x = b * SUB;
  s.fighters[0].facing = 1;
  s.fighters[1].facing = -1;
}

function gap(s) {
  return Math.abs(s.fighters[0].x - s.fighters[1].x) / SUB;
}

test("knockdown cannot be hit, so K or Down+K on every idle frame is not a combo to death", () => {
  for (const button of [IN.HEAVY, IN.D | IN.HEAVY]) {
    const s = boot();
    place(s, 500, 560);
    let maxCombo = 0;
    let damagedWhileDown = 0;
    let actionable = 0;
    for (let i = 0; i < 1000 && s.phase === "fight"; i++) {
      const me = s.fighters[0];
      const foe = s.fighters[1];
      const before = foe.hp;
      const down = foe.state === "knockdown";
      let m = 0;
      if (me.state === "idle" || me.state === "walk" || me.state === "crouch" || me.state === "block") {
        m = gap(s) > 105 ? IN.R : button;
      }
      step(s, [m, 0]);
      if (down && s.fighters[1].hp < before) damagedWhileDown++;
      if (s.combo && s.combo.hits > maxCombo) maxCombo = s.combo.hits;
      const v = s.fighters[1];
      if ((v.state === "idle" || v.state === "walk" || v.state === "crouch" || v.state === "block") && v.hitstop === 0 && v.stun === 0) {
        actionable++;
      }
    }
    assert.equal(damagedWhileDown, 0);
    assert.ok(maxCombo < 8, `combo ran to ${maxCombo}`);
    assert.ok(actionable > 40, `only ${actionable} actionable frames`);
  }

  const blocking = boot();
  place(blocking, 500, 560);
  for (let i = 0; i < 500 && blocking.phase === "fight"; i++) {
    const me = blocking.fighters[0];
    const m = (me.state === "idle" || me.state === "walk" || me.state === "crouch" || me.state === "block")
      ? (gap(blocking) > 105 ? IN.R : IN.HEAVY)
      : 0;
    step(blocking, [m, IN.BLOCK]);
  }
  assert.ok(blocking.fighters[1].hp > 8000, `blocker died to ${blocking.fighters[1].hp}`);
  assert.equal(blocking.phase, "fight");
});

test("super inside warp range can be blocked, parried, and traded", () => {
  const blocked = boot();
  place(blocked, 500, 600);
  blocked.fighters[0].meter = MAX_METER;
  let blocks = 0;
  let raw = 0;
  let started = false;
  for (let i = 0; i < 90 && blocked.phase === "fight"; i++) {
    if (blocked.fighters[0].move === "super") started = true;
    const ev = step(blocked, [started ? 0 : (IN.D | IN.SPECIAL), IN.BLOCK]);
    for (const e of ev) {
      if (e.type === "block" && e.move === "super") blocks++;
      if (e.type === "hit" && e.move === "super" && !e.blocked && !e.parried && e.damage > 0) raw++;
    }
  }
  assert.equal(blocks, 4);
  assert.equal(raw, 0);
  assert.ok(MAX_HP - blocked.fighters[1].hp <= 400);

  const parry = boot();
  place(parry, 500, 620);
  parry.fighters[0].meter = MAX_METER;
  let parried = false;
  started = false;
  for (let i = 0; i < 40 && parry.phase === "fight"; i++) {
    const f = parry.fighters[0];
    if (f.move === "super") started = true;
    const tap = f.move === "super" && f.moveFrame === 13 ? IN.BLOCK : 0;
    const ev = step(parry, [started ? 0 : (IN.D | IN.SPECIAL), tap]);
    if (ev.some((e) => e.type === "parry")) parried = true;
  }
  assert.equal(parried, true);
  assert.equal(parry.fighters[1].hp, MAX_HP);
  assert.equal(parry.fighters[0].state, "parry_stun");

  const trade = boot();
  place(trade, 500, 560);
  trade.fighters[0].meter = MAX_METER;
  let struck = false;
  for (let i = 0; i < 24; i++) {
    const ev = step(trade, [i === 0 ? (IN.D | IN.SPECIAL) : 0, i === 0 ? IN.HEAVY : 0]);
    if (ev.some((e) => e.type === "hit" && e.targetId === 0 && e.damage > 0)) struck = true;
  }
  assert.equal(struck, true);
  assert.ok(trade.fighters[0].hp < MAX_HP);

  function warp(dist) {
    const s = boot();
    place(s, 500, 500 + dist);
    s.fighters[0].meter = MAX_METER;
    const x0 = s.fighters[0].x;
    for (let i = 0; i < 20; i++) step(s, [i === 0 ? (IN.D | IN.SPECIAL) : 0, 0]);
    return Math.abs(s.fighters[0].x - x0) > 30 * SUB;
  }
  assert.equal(warp(140), true);
  assert.equal(warp(200), false);

  const rawSuper = boot();
  place(rawSuper, 500, 580);
  rawSuper.fighters[0].meter = MAX_METER;
  const hits = [];
  started = false;
  for (let i = 0; i < 100 && rawSuper.phase === "fight"; i++) {
    if (rawSuper.fighters[0].move === "super") started = true;
    const ev = step(rawSuper, [started ? 0 : (IN.D | IN.SPECIAL), 0]);
    for (const e of ev) if (e.type === "super_hit") hits.push(e.damage);
  }
  assert.deepEqual(hits, [650, 572, 494, 416]);
});

test("parry window is short, whiffs into recovery, and dies if an attack starts", () => {
  const once = boot();
  const windows = [];
  let recovery = 0;
  let sawRecovery = false;
  for (let i = 0; i < 30; i++) {
    step(once, [0, i === 0 ? IN.BLOCK : 0]);
    const f = once.fighters[1];
    if (f.parryWindow > 0) windows.push(f.parryWindow);
    if (f.state === "parry_recover") {
      recovery++;
      sawRecovery = true;
    } else if (sawRecovery) break;
  }
  assert.deepEqual(windows, [4, 3, 2, 1]);
  assert.equal(recovery, 14);

  const spam = boot();
  let up = 0;
  let recover = 0;
  for (let i = 0; i < 120; i++) {
    step(spam, [0, i % 2 === 0 ? IN.BLOCK : 0]);
    const f = spam.fighters[1];
    if (f.parryWindow > 0) up++;
    if (f.state === "parry_recover") recover++;
  }
  assert.ok(up < 40, `parry was up for ${up}/120 frames`);
  assert.ok(recover > 50, `recovery only lasted ${recover} frames`);

  const os = boot();
  place(os, 500, 560);
  step(os, [IN.LIGHT, IN.BLOCK | IN.LIGHT]);
  assert.equal(os.fighters[1].move, "jab");
  assert.equal(os.fighters[1].parryWindow, 0);
  assert.notEqual(os.fighters[1].state, "parry_recover");
});

test("simultaneous throws whiff both ways, and a far forward+special is not a blast", () => {
  const clash = boot();
  place(clash, 500, 560);
  let threw = false;
  for (let i = 0; i < 40; i++) {
    const press = i === 0;
    const ev = step(clash, [
      press ? (IN.R | IN.SPECIAL) : 0,
      press ? (IN.L | IN.SPECIAL) : 0,
    ]);
    if (ev.some((e) => e.type === "throw")) threw = true;
  }
  assert.equal(threw, false);
  assert.equal(clash.fighters[0].hp, MAX_HP);
  assert.equal(clash.fighters[1].hp, MAX_HP);

  const far = boot();
  place(far, 300, 800);
  let fire = false;
  let sawThrow = false;
  for (let i = 0; i < 40; i++) {
    const ev = step(far, [i === 0 ? (IN.R | IN.SPECIAL) : 0, 0]);
    if (ev.some((e) => e.type === "projectile_fire")) fire = true;
    if (far.fighters[0].state === "throw" || far.fighters[0].move === "throw") sawThrow = true;
  }
  assert.equal(fire, false);
  assert.equal(far.projectiles.length, 0);
  assert.equal(sawThrow, true);
  assert.equal(far.fighters[1].hp, MAX_HP);
});

test("a blocked blast is not plus at range", () => {
  function advantage(dist) {
    const s = boot();
    place(s, 400, 400 + dist);
    let started = false;
    let hitFrame = -1;
    let atkFree = -1;
    let defFree = -1;
    for (let i = 0; i < 160 && s.phase === "fight"; i++) {
      if (s.fighters[0].move === "blast") started = true;
      const ev = step(s, [started ? 0 : IN.SPECIAL, IN.BLOCK]);
      if (hitFrame < 0 && ev.some((e) => e.type === "block" && e.move === "blast")) hitFrame = s.frame;
      const a = s.fighters[0];
      const d = s.fighters[1];
      const aCan = (a.state === "idle" || a.state === "walk" || a.state === "crouch" || a.state === "block") && a.hitstop === 0;
      const dCan = (d.state === "idle" || d.state === "walk" || d.state === "crouch" || d.state === "block") && d.hitstop === 0 && d.stun <= 0;
      if (hitFrame > 0 && atkFree < 0 && aCan) atkFree = s.frame;
      if (hitFrame > 0 && defFree < 0 && dCan) defFree = s.frame;
    }
    assert.ok(hitFrame > 0, `blast never blocked at ${dist}`);
    return defFree - atkFree;
  }
  assert.ok(advantage(320) <= 0);
  assert.ok(advantage(480) <= 0);
  assert.ok(advantage(80) < 0);
});

test("hitstop does not pause the round clock", () => {
  const s = boot();
  s.fighters[0].hitstop = 10;
  s.fighters[1].hitstop = 10;
  const before = s.roundTime;
  step(s, [0, 0]);
  assert.equal(s.roundTime, before - 1);
  assert.equal(s.fighters[0].hitstop, 9);
});
