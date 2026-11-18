// Deterministic fight sim shared by the browser and the server.
// Rules: integer subpixels, no Math.random, no Date, no wall-clock.
// Both sides must import this file. A desync means an input disagreement
// or a bug — the hash in the debug overlay is this state.

export const SUB = 16;
export const MAX_HP = 10000;
export const MAX_METER = 1000;
export const WINS_NEEDED = 2;
export const ROUND_TIME = 60 * 60;
export const INPUT_DELAY = 3;
export const LEFT_PX = 80;
export const RIGHT_PX = 1200;
export const LEFT = LEFT_PX * SUB;
export const RIGHT = RIGHT_PX * SUB;

const GRAVITY = 9;
const WALK = 72;
const AIR_X = 56;
const JUMP_V = 220;
const SHORT_V = 168;
const INTRO_LEN = 100;
const KO_HOLD = 22;
const TIME_HOLD = 26;
const ROUND_HOLD = 130;
const GRAB_RANGE = 96 * SUB;

export const IN = {
  L: 1,
  R: 2,
  U: 4,
  D: 8,
  LIGHT: 16,
  HEAVY: 32,
  SPECIAL: 64,
  BLOCK: 128,
  DASH: 256,
};

const ATTACK_BITS = IN.LIGHT | IN.HEAVY | IN.SPECIAL | IN.DASH;
const HS = { light: 5, medium: 7, heavy: 11, special: 8, super: 12 };

function hb(x, y, w, h) {
  return { x, y, w, h };
}

export const MOVES = {
  jab: {
    weight: "light", startup: 4, active: 3, recovery: 10,
    damage: 500, hitstun: 16, blockstun: 11, meter: 80, chip: 0,
    knockX: 22, knockY: 0, blockPush: 24, level: "mid", lunge: 18,
    cancel: ["jab2", "kick", "upper", "sweep", "fheavy", "blast", "super"],
    hitbox: hb(26, 38, 54, 40),
  },
  jab2: {
    weight: "light", startup: 3, active: 3, recovery: 11,
    damage: 540, hitstun: 16, blockstun: 11, meter: 80, chip: 0,
    knockX: 24, knockY: 0, blockPush: 24, level: "mid", lunge: 22,
    cancel: ["jab3", "kick", "upper", "sweep", "fheavy", "blast", "super"],
    hitbox: hb(28, 38, 56, 40),
  },
  jab3: {
    weight: "medium", startup: 5, active: 3, recovery: 15,
    damage: 860, hitstun: 22, blockstun: 14, meter: 120, chip: 0,
    knockX: 36, knockY: 0, blockPush: 32, level: "mid", lunge: 28,
    cancel: ["upper", "fheavy", "blast", "super"],
    hitbox: hb(24, 36, 68, 42),
  },
  kick: {
    weight: "medium", startup: 7, active: 4, recovery: 14,
    damage: 780, hitstun: 20, blockstun: 13, meter: 120, chip: 0,
    knockX: 48, knockY: 0, blockPush: 36, level: "mid", lunge: 40,
    cancel: ["upper", "fheavy", "blast", "super"],
    hitbox: hb(22, 24, 72, 36),
  },
  upper: {
    weight: "heavy", startup: 9, active: 5, recovery: 16,
    damage: 1400, hitstun: 50, blockstun: 16, meter: 180, chip: 60,
    knockX: 28, knockY: 220, blockPush: 36, level: "mid", lunge: 64,
    launcher: true, jumpCancel: true,
    cancel: ["super"],
    hitbox: hb(-8, 20, 86, 96),
  },
  sweep: {
    weight: "heavy", startup: 9, active: 4, recovery: 18,
    damage: 1080, hitstun: 22, blockstun: 14, meter: 150, chip: 60,
    knockX: 100, knockY: 100, blockPush: 36, level: "low",
    knockdown: true,
    cancel: ["super"],
    hitbox: hb(16, 0, 78, 36),
  },
  fheavy: {
    weight: "heavy", startup: 11, active: 4, recovery: 18,
    damage: 1200, hitstun: 30, blockstun: 15, meter: 170, chip: 60,
    knockX: 360, knockY: 90, blockPush: 50, level: "mid", lunge: 70,
    wallBounce: true,
    cancel: ["super"],
    hitbox: hb(16, 32, 84, 48),
  },
  airjab: {
    weight: "light", startup: 4, active: 5, recovery: 10,
    damage: 460, hitstun: 18, blockstun: 10, meter: 70, chip: 0,
    knockX: 16, knockY: 120, blockPush: 20, level: "overhead",
    air: true, landLag: 6,
    cancel: ["airkick", "spike"],
    hitbox: hb(24, 36, 50, 32),
  },
  airkick: {
    weight: "medium", startup: 6, active: 4, recovery: 12,
    damage: 680, hitstun: 18, blockstun: 12, meter: 110, chip: 0,
    knockX: 18, knockY: 100, blockPush: 24, level: "overhead",
    air: true, landLag: 8,
    cancel: ["spike"],
    hitbox: hb(18, 20, 64, 36),
  },
  spike: {
    weight: "heavy", startup: 8, active: 6, recovery: 12,
    damage: 1200, hitstun: 22, blockstun: 14, meter: 160, chip: 60,
    knockX: 24, knockY: -1, blockPush: 20, level: "overhead",
    air: true, spike: true, landLag: 16,
    cancel: [],
    hitbox: hb(-20, -48, 84, 96),
  },
  blast: {
    weight: "special", startup: 12, active: 0, recovery: 51,
    damage: 0, hitstun: 0, blockstun: 0, meter: 40, chip: 0,
    knockX: 0, knockY: 0, blockPush: 0, level: "high",
    spawn: 11,
    cancel: ["super"],
    hitbox: hb(0, 0, 0, 0),
  },
  throw: {
    weight: "special", startup: 5, active: 2, recovery: 20,
    damage: 1700, hitstun: 20, blockstun: 0, meter: 140, chip: 0,
    knockX: 70, knockY: 110, blockPush: 0, level: "throw",
    unblockable: true, throw: true,
    cancel: [],
    hitbox: hb(0, 0, 0, 0),
  },
  super: {
    weight: "super", startup: 12, active: 46, recovery: 18,
    damage: 650, hitstun: 20, blockstun: 14, meter: 0, chip: 80,
    knockX: 40, knockY: 220, blockPush: 36, level: "mid",
    unblockable: false, launcher: true,
    cancel: [],
    hitbox: hb(-20, 0, 180, 160),
  },
};

const BLAST_HIT = {
  move: "blast", weight: "special", damage: 1000, hitstun: 20, blockstun: 8,
  meter: 90, chip: 90, knockX: 70, knockY: 0, blockPush: 56, level: "high",
  unblockable: false,
};

const SUPER_WINDOWS = [14, 22, 30, 44];

export function frameIndex(now, startTime) {
  return Math.floor((now - startTime) * 60 / 1000);
}

function i(n) {
  return n | 0;
}

export function px(sub) {
  return Math.round(sub / SUB);
}

function createFighter(id) {
  return {
    id,
    x: (id === 0 ? 360 : 920) * SUB,
    y: 0,
    vx: 0,
    vy: 0,
    facing: id === 0 ? 1 : -1,
    hp: MAX_HP,
    meter: 0,
    state: "idle",
    stateFrame: 0,
    move: "",
    moveFrame: 0,
    hitstop: 0,
    stun: 0,
    airborne: false,
    crouch: false,
    blocking: false,
    parryWindow: 0,
    invuln: 0,
    airOptions: 1,
    juggle: 0,
    wallBounced: false,
    groundBounced: false,
    bounceOnLand: false,
    pendingWall: false,
    forceKD: false,
    hitThisAttack: false,
    contact: "none",
    prevInput: 0,
    buffer: 0,
    bufferTimer: 0,
    locked: false,
    throwPhase: 0,
    hitWindow: -1,
    dashDir: 1,
    dashTimer: 0,
    react: "",
  };
}

export function createMatch() {
  return {
    frame: 0,
    phase: "intro",
    phaseFrame: 0,
    round: 1,
    roundTime: ROUND_TIME,
    wins: [0, 0],
    roundWinner: -1,
    reason: "",
    combo: null,
    ink: 0,
    fighters: [createFighter(0), createFighter(1)],
    projectiles: [],
    nextId: 1,
  };
}

export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function bit(v) {
  return v ? 1 : 0;
}

function fighterKey(f) {
  return [
    f.id, f.x, f.y, f.vx, f.vy, f.facing, f.hp, f.meter, f.state, f.stateFrame,
    f.move, f.moveFrame, f.hitstop, f.stun, bit(f.airborne), bit(f.crouch),
    bit(f.blocking), f.parryWindow, f.invuln, f.airOptions, f.juggle,
    bit(f.wallBounced), bit(f.groundBounced), bit(f.bounceOnLand), bit(f.pendingWall),
    bit(f.forceKD), bit(f.hitThisAttack), f.contact, f.prevInput, f.buffer,
    f.bufferTimer, bit(f.locked), f.throwPhase, f.hitWindow, f.dashDir, f.dashTimer,
    f.react,
  ].join(":");
}

function fnv(s) {
  let h = 2166136261;
  for (let n = 0; n < s.length; n++) {
    h ^= s.charCodeAt(n);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashState(state) {
  const p = [
    state.frame, state.phase, state.phaseFrame, state.round, state.roundTime,
    state.roundWinner, state.reason, state.ink, state.nextId,
    state.wins[0], state.wins[1],
  ];
  if (state.combo) {
    p.push("c", state.combo.owner, state.combo.hits, state.combo.damage, state.combo.timer);
  } else {
    p.push("nc");
  }
  for (const f of state.fighters) p.push(fighterKey(f));
  for (const pr of state.projectiles) {
    p.push(pr.id, pr.owner, pr.x, pr.y, pr.vx, pr.life);
  }
  return fnv(p.join("|"));
}

export function fighterView(state, playerId) {
  const f = state.fighters[playerId];
  if (!f) return null;
  return Object.freeze({
    playerId: f.id,
    move: f.move || f.state,
    frame: f.move ? f.moveFrame : f.stateFrame,
    state: f.state,
    moveName: f.move,
    moveFrame: f.moveFrame,
    stateFrame: f.stateFrame,
    hp: f.hp,
    meter: f.meter,
    x: f.x / SUB,
    y: f.y / SUB,
    facing: f.facing,
    airborne: f.airborne,
    crouch: f.crouch,
    hitstop: f.hitstop,
    stun: f.stun,
    react: f.react,
  });
}

function makeEvent(state, type, playerId, x, y, extra) {
  return Object.assign({
    type,
    playerId,
    x,
    y,
    frame: state.frame,
  }, extra || {});
}

function bodyPoint(f) {
  return { x: px(f.x), y: px(f.y) + 70 };
}

function addMeter(f, n) {
  f.meter += n;
  if (f.meter > MAX_METER) f.meter = MAX_METER;
  if (f.meter < 0) f.meter = 0;
}

function soak(f, input, freezing) {
  const mask = input & 0x1ff;
  const pressed = (mask & ~f.prevInput) & 0x1ff;
  f.prevInput = mask;
  if (pressed & (ATTACK_BITS | IN.U)) {
    f.buffer = (pressed & (ATTACK_BITS | IN.U)) | (mask & (IN.L | IN.R | IN.U | IN.D));
    f.bufferTimer = 12;
  } else if (!freezing && f.bufferTimer > 0) {
    f.bufferTimer--;
    if (f.bufferTimer <= 0) f.buffer = 0;
  }
  return pressed;
}

function dirs(f, foe, bits) {
  const toward = foe.x >= f.x ? IN.R : IN.L;
  return {
    fwd: (bits & toward) !== 0,
    down: (bits & IN.D) !== 0,
    up: (bits & IN.U) !== 0,
  };
}

function pickMove(f, foe, buffer) {
  if (!buffer) return null;
  const air = f.y > 0 || f.airborne;
  const d = dirs(f, foe, buffer);
  if (!air && f.meter >= MAX_METER && (buffer & IN.SPECIAL) && ((buffer & IN.HEAVY) || d.down)) {
    return "super";
  }
  // Forward+special is always a throw. Out of range it whiffs; it does not turn into a blast.
  if (!air && (buffer & IN.SPECIAL) && d.fwd && !d.down && !(buffer & IN.HEAVY)) {
    return "throw";
  }
  if (air) {
    if ((buffer & IN.HEAVY) && d.down) return "spike";
    if (buffer & IN.HEAVY) return "airkick";
    if (buffer & IN.LIGHT) {
      if (f.move === "airjab") return "airkick";
      return "airjab";
    }
    return null;
  }
  if (buffer & IN.LIGHT) {
    if (!d.fwd && f.move === "jab") return "jab2";
    if (!d.fwd && f.move === "jab2") return "jab3";
    if (d.fwd) return "kick";
    return "jab";
  }
  if (buffer & IN.HEAVY) {
    if (d.down) return "sweep";
    if (d.fwd) return "fheavy";
    return "upper";
  }
  if (buffer & IN.SPECIAL) return "blast";
  return null;
}

function startMove(state, f, foe, name, events, started) {
  const mv = MOVES[name];
  if (!mv) return;
  started.add(f.id);
  f.facing = f.x <= foe.x ? 1 : -1;
  f.state = name === "super" ? "super" : name === "throw" ? "throw" : "attack";
  f.move = name;
  f.moveFrame = 0;
  f.stateFrame = 0;
  f.hitThisAttack = false;
  f.contact = "none";
  f.hitWindow = -1;
  f.throwPhase = 0;
  f.buffer = 0;
  f.bufferTimer = 0;
  f.blocking = false;
  f.crouch = false;
  f.react = "";
  f.vx = 0;
  f.locked = name === "super";
  f.parryWindow = 0;
  if (name === "super") {
    f.meter = 0;
    f.invuln = 8;
    state.ink = 110;
    const b = bodyPoint(f);
    events.push(makeEvent(state, "super_charge", f.id, b.x, b.y, { move: "super" }));
  }
  const b = bodyPoint(f);
  events.push(makeEvent(state, "attack_start", f.id, b.x, b.y, { move: name, weight: mv.weight }));
}

function endMove(f) {
  const air = f.y > 0 || f.airborne;
  f.move = "";
  f.moveFrame = 0;
  f.hitThisAttack = false;
  f.contact = "none";
  f.hitWindow = -1;
  f.throwPhase = 0;
  f.locked = false;
  f.vx = 0;
  f.state = air ? "air" : "idle";
  f.stateFrame = 0;
}

function tryUseBuffer(state, f, foe, events, started) {
  if (!(f.buffer & (IN.LIGHT | IN.HEAVY | IN.SPECIAL))) return false;
  const want = pickMove(f, foe, f.buffer);
  if (!want) return false;
  const air = f.y > 0 || f.airborne;
  if (air !== !!MOVES[want].air) return false;
  startMove(state, f, foe, want, events, started);
  return true;
}

function tryCancel(state, f, foe, events, started) {
  const mv = MOVES[f.move];
  if (!mv) return false;
  if (!(f.buffer & (IN.LIGHT | IN.HEAVY | IN.SPECIAL | IN.U))) return false;
  const open = f.moveFrame >= mv.startup && f.moveFrame <= mv.startup + mv.active + 4;
  if (!open) return false;
  if (f.contact !== "hit" && f.contact !== "block") return false;
  if (f.buffer & (IN.LIGHT | IN.HEAVY | IN.SPECIAL)) {
    const want = pickMove(f, foe, f.buffer);
    if (want && want !== f.move && mv.cancel && mv.cancel.includes(want)) {
      if ((f.y > 0 || f.airborne) && !MOVES[want].air) return false;
      if (!(f.y > 0 || f.airborne) && MOVES[want].air) return false;
      startMove(state, f, foe, want, events, started);
      return true;
    }
  }
  if ((f.buffer & IN.U) && mv.jumpCancel && f.contact === "hit" && f.y <= 0) {
    f.state = "air";
    f.airborne = true;
    f.y = Math.max(f.y, SUB);
    f.vy = 200;
    f.move = "";
    f.moveFrame = 0;
    f.buffer = 0;
    f.bufferTimer = 0;
    f.airOptions = 1;
    f.locked = false;
    f.hitThisAttack = false;
    f.contact = "none";
    f.crouch = false;
    return true;
  }
  return false;
}

function startDash(state, f, foe, bits, events) {
  f.facing = f.x <= foe.x ? 1 : -1;
  const d = dirs(f, foe, bits);
  f.dashDir = d.fwd || !((bits & IN.L) || (bits & IN.R)) ? 1 : -1;
  // If holding away and not toward, backdash. dirs.fwd covers toward.
  if (!d.fwd && ((bits & IN.L) || (bits & IN.R))) f.dashDir = -1;
  else f.dashDir = 1;
  f.state = "dash";
  f.move = "";
  f.moveFrame = 0;
  f.stateFrame = 0;
  f.invuln = f.dashDir < 0 ? 8 : 4;
  f.buffer = 0;
  f.bufferTimer = 0;
  f.blocking = false;
  f.crouch = false;
  f.locked = false;
  const spd = (f.dashDir < 0 ? 11 : 18) * SUB;
  f.vx = f.facing * f.dashDir * spd;
  const p = { x: px(f.x), y: px(f.y) };
  events.push(makeEvent(state, "dash", f.id, p.x, p.y, { dir: f.dashDir }));
}

function airDash(state, f, input, events) {
  f.airOptions = 0;
  f.dashTimer = 10;
  f.buffer = 0;
  f.bufferTimer = 0;
  let dir = 0;
  if (input & IN.L) dir -= 1;
  if (input & IN.R) dir += 1;
  if (dir === 0) dir = f.facing;
  if (input & IN.U) {
    f.vy = 214;
    f.vx = dir * 80;
  } else if (input & IN.D) {
    f.vy = -160;
    f.vx = dir * 100;
  } else {
    f.vx = dir * 250;
    if (f.vy < 40) f.vy = 40;
  }
  const rel = dir === f.facing ? 1 : -1;
  events.push(makeEvent(state, "dash", f.id, px(f.x), px(f.y), { dir: rel }));
}

function tickThrow(state, f, foe, events, started, clash) {
  if (!started.has(f.id)) f.moveFrame++;
  const mv = MOVES.throw;
  if (f.throwPhase === 0 && f.moveFrame === mv.startup) {
    // Same-frame (or still-in-startup) throws tech. Both whiff. Update order must not give it to P0.
    const foeThrowing = foe.state === "throw" && foe.throwPhase === 0;
    if (foeThrowing || clash.throw) {
      f.throwPhase = -1;
      clash.throw = true;
    }
    const legal = f.throwPhase === 0 && foe.invuln <= 0
      && foe.state !== "hitstun" && foe.state !== "knockdown" && foe.state !== "tumble"
      && foe.state !== "thrown" && foe.state !== "ko" && foe.state !== "parry_stun"
      && foe.state !== "super" && foe.state !== "throw" && foe.y < 28 * SUB
      && Math.abs(f.x - foe.x) <= GRAB_RANGE;
    if (legal) {
      f.throwPhase = 1;
      f.locked = true;
      foe.locked = true;
      foe.state = "thrown";
      foe.move = "";
      foe.vx = 0;
      foe.vy = 0;
      foe.airborne = false;
      foe.y = 0;
      foe.hitstop = 0;
      f.hitstop = 0;
      const b = bodyPoint(f);
      events.push(makeEvent(state, "throw", f.id, b.x, b.y, { move: "throw", targetId: foe.id }));
    } else {
      f.throwPhase = -1;
    }
  }
  if (f.throwPhase === 1) {
    f.vx = f.facing * 3 * SUB;
    f.x += f.vx;
    if (f.x < LEFT) f.x = LEFT;
    if (f.x > RIGHT) f.x = RIGHT;
    const lift = f.moveFrame < mv.startup + 12 ? 0 : 40 * SUB;
    foe.x = f.x + f.facing * 52 * SUB;
    if (foe.x < LEFT) foe.x = LEFT;
    if (foe.x > RIGHT) foe.x = RIGHT;
    foe.y = lift;
    foe.airborne = lift > 0;
    foe.facing = -f.facing;
    foe.stateFrame = f.moveFrame;
    foe.invuln = 2;
    if (f.moveFrame >= mv.startup + 18) {
      foe.locked = false;
      f.locked = false;
      foe.invuln = 0;
      foe.state = "idle";
      foe.y = lift;
      f.throwPhase = 2;
      f.vx = 0;
      dealDamage(state, f, foe, {
        move: "throw", weight: "special", damage: mv.damage, hitstun: 18,
        blockstun: 0, meter: mv.meter, chip: 0, knockX: 60, knockY: 120,
        blockPush: 0, level: "throw", unblockable: true, slam: true, knockdown: true,
      }, events);
      foe.forceKD = true;
      foe.bounceOnLand = false;
      foe.vy = 96;
      foe.vx = f.facing * 50;
      foe.airborne = true;
      if (foe.y < SUB) foe.y = SUB;
    }
    return true;
  }
  const endAt = f.throwPhase === 2 ? mv.startup + 30 : mv.startup + mv.recovery;
  if (f.moveFrame >= endAt) {
    endMove(f);
    return false;
  }
  return true;
}

function spawnBlast(state, f, events) {
  state.projectiles = state.projectiles.filter((p) => p.owner !== f.id);
  const x = f.x + f.facing * 58 * SUB;
  const y = 84 * SUB;
  state.projectiles.push({
    id: state.nextId++,
    owner: f.id,
    x,
    y,
    vx: f.facing * 9 * SUB,
    life: 75,
  });
  events.push(makeEvent(state, "projectile_fire", f.id, px(x), px(y), { move: "blast" }));
}

function tickAttack(state, f, foe, events, started) {
  const wasSuper = f.state === "super";
  if (!started.has(f.id)) {
    f.moveFrame++;
    const mv0 = MOVES[f.move];
    if (mv0) {
      const total = mv0.startup + mv0.active + mv0.recovery;
      if (f.moveFrame >= total) {
        endMove(f);
        return false;
      }
    }
  }
  if (!f.move || (f.state !== "attack" && f.state !== "super")) return false;
  if (tryCancel(state, f, foe, events, started)) {
    return f.state === "attack" || f.state === "super";
  }
  const mv = MOVES[f.move];
  if (!mv) return false;
  if (f.y <= 0 && !f.airborne) {
    f.vx = mv.lunge && f.moveFrame < mv.startup ? f.facing * mv.lunge : 0;
  }
  if (mv.spawn != null && f.moveFrame === mv.spawn) spawnBlast(state, f, events);
  if (f.move === "super" && f.moveFrame === 8) {
    const b = bodyPoint(f);
    events.push(makeEvent(state, "super_start", f.id, b.x, b.y, { move: "super" }));
  }
  if (f.move === "super" && f.moveFrame === 12) {
    if (Math.abs(foe.x - f.x) <= 140 * SUB && foe.state !== "ko") {
      const face = foe.x >= f.x ? 1 : -1;
      f.facing = face;
      f.x = foe.x - face * 70 * SUB;
      if (f.x < LEFT) f.x = LEFT;
      if (f.x > RIGHT) f.x = RIGHT;
      f.vx = 0;
    }
  }
  if (wasSuper) f.locked = f.state === "super";
  return true;
}

function tickStun(f) {
  f.stun--;
  f.stateFrame++;
  if (f.y === 0 && !f.airborne) f.vx = i(f.vx * 5 / 6);
  else f.vx = i(f.vx * 15 / 16);
  if (f.stun <= 0) {
    f.react = "";
    if (f.y > 0 || f.airborne) f.state = "tumble";
    else {
      f.state = "idle";
      f.vx = 0;
    }
  }
}

function updateFighter(state, f, foe, input, pressed, events, started, clash) {
  if (f.invuln > 0) f.invuln--;
  if (f.dashTimer > 0) f.dashTimer--;
  const canParry = (f.state === "idle" || f.state === "walk" || f.state === "crouch" || f.state === "block") && f.parryWindow === 0;
  if ((pressed & IN.BLOCK) && canParry && f.y <= 0) {
    f.parryWindow = 4;
  } else if (f.parryWindow > 0) {
    f.parryWindow--;
    if (f.parryWindow === 0 && (f.state === "idle" || f.state === "walk" || f.state === "crouch" || f.state === "block")) {
      f.state = "parry_recover";
      f.stun = 15;
      f.stateFrame = 0;
      f.vx = 0;
      f.blocking = false;
    }
  }

  if (f.state === "ko" || f.state === "win") {
    f.stateFrame++;
    f.vx = 0;
    return;
  }
  if (f.state === "thrown") {
    f.stateFrame++;
    return;
  }
  if (f.state === "parry_recover") {
    f.stateFrame++;
    f.stun--;
    f.vx = 0;
    f.parryWindow = 0;
    // A whiffed parry cannot be refreshed or cancelled into a button, but holding block still blocks.
    f.blocking = (input & IN.BLOCK) !== 0 && f.y <= 0;
    f.crouch = (input & IN.D) !== 0 && f.y <= 0;
    if (f.stun <= 0) f.state = f.blocking ? "block" : (f.crouch ? "crouch" : "idle");
    else return;
  }
  if (f.state === "throw") {
    if (tickThrow(state, f, foe, events, started, clash)) return;
  }
  if (f.state === "attack" || f.state === "super") {
    if (tickAttack(state, f, foe, events, started)) return;
  }
  if (f.state === "hitstun" || f.state === "parry_stun") {
    tickStun(f);
    return;
  }
  if (f.state === "tumble") {
    f.stateFrame++;
    f.vx = i(f.vx * 15 / 16);
    return;
  }
  if (f.state === "knockdown") {
    f.stun--;
    f.stateFrame++;
    f.vx = i(f.vx * 4 / 5);
    if (f.stun <= 0) {
      f.state = "idle";
      f.invuln = 7;
      f.vx = 0;
      f.juggle = 0;
      f.forceKD = false;
      f.wallBounced = false;
      f.groundBounced = false;
      f.bounceOnLand = false;
    }
    return;
  }
  if (f.state === "blockstun") {
    if (f.y === 0) f.crouch = (input & IN.D) !== 0;
    f.blocking = true;
    f.stun--;
    f.stateFrame++;
    f.vx = i(f.vx * 3 / 4);
    if (f.stun <= 0) {
      f.state = f.crouch ? "crouch" : "idle";
      f.vx = 0;
    }
    return;
  }
  if (f.state === "landlag") {
    f.stun--;
    f.stateFrame++;
    f.vx = 0;
    if (f.stun <= 0) f.state = "idle";
    return;
  }
  if (f.state === "parry") {
    if (tryUseBuffer(state, f, foe, events, started)) return;
    if (pressed & IN.DASH) {
      startDash(state, f, foe, input | f.buffer, events);
      return;
    }
    f.stateFrame++;
    f.vx = 0;
    if (f.stateFrame > 12) f.state = "idle";
    return;
  }
  if (f.state === "jumpsquat") {
    if (tryUseBuffer(state, f, foe, events, started)) return;
    f.stateFrame++;
    f.crouch = true;
    f.blocking = false;
    if (f.stateFrame >= 3) {
      f.state = "air";
      f.airborne = true;
      f.y = SUB;
      f.vy = (input & IN.U) ? JUMP_V : SHORT_V;
      f.airOptions = 1;
      f.crouch = false;
    }
    return;
  }
  if (f.state === "dash") {
    const gate = f.dashDir < 0 ? 8 : 2;
    if (f.stateFrame >= gate && tryUseBuffer(state, f, foe, events, started)) return;
    const spd = (f.dashDir < 0 ? 11 : 18) * SUB;
    f.vx = f.facing * f.dashDir * spd;
    f.stateFrame++;
    const dur = f.dashDir < 0 ? 14 : 9;
    if (f.stateFrame >= dur) {
      f.state = "idle";
      f.vx = 0;
    }
    return;
  }
  if (f.state === "air" || f.airborne || f.y > 0) {
    if (tryUseBuffer(state, f, foe, events, started)) return;
    if ((pressed & IN.DASH) && f.airOptions > 0) {
      airDash(state, f, input, events);
    }
    f.blocking = (input & IN.BLOCK) !== 0;
    f.crouch = false;
    f.state = "air";
    let dir = 0;
    if (input & IN.L) dir -= 1;
    if (input & IN.R) dir += 1;
    if (dir) f.vx = dir * AIR_X;
    else f.vx = i(f.vx * 7 / 8);
    f.stateFrame++;
    return;
  }

  // Ground neutral.
  if (tryUseBuffer(state, f, foe, events, started)) return;
  if ((pressed & IN.DASH) || (f.buffer & IN.DASH)) {
    startDash(state, f, foe, input | f.buffer, events);
    return;
  }
  f.facing = f.x <= foe.x ? 1 : -1;
  const down = (input & IN.D) !== 0;
  const up = (input & IN.U) !== 0;
  const block = (input & IN.BLOCK) !== 0;
  let dir = 0;
  if (input & IN.L) dir -= 1;
  if (input & IN.R) dir += 1;
  f.crouch = down;
  f.blocking = block;
  if (block) {
    f.vx = 0;
    f.state = "block";
    f.stateFrame++;
    return;
  }
  if (down) {
    f.vx = 0;
    f.state = "crouch";
    f.stateFrame++;
    return;
  }
  if (up) {
    f.state = "jumpsquat";
    f.stateFrame = 0;
    f.vx = dir * i(WALK / 2);
    f.crouch = true;
    return;
  }
  if (dir) {
    f.vx = dir * WALK;
    f.state = "walk";
    f.stateFrame++;
  } else {
    f.vx = 0;
    f.state = "idle";
    f.stateFrame++;
  }
}

function hurtbox(f) {
  const h = f.crouch ? 56 * SUB : 122 * SUB;
  const half = 22 * SUB;
  return { l: f.x - half, r: f.x + half, b: f.y, t: f.y + h };
}

function hitboxOf(f, box) {
  const x = box.x * SUB;
  const y = box.y * SUB;
  const w = box.w * SUB;
  const h = box.h * SUB;
  const l = f.facing === 1 ? f.x + x : f.x - x - w;
  return { l, r: l + w, b: f.y + y, t: f.y + y + h };
}

function overlap(a, b) {
  return a.l < b.r && a.r > b.l && a.b < b.t && a.t > b.b;
}

function immune(f) {
  return f.invuln > 0 || f.state === "ko" || f.state === "thrown" || f.state === "knockdown";
}

function checkBlock(def, spec) {
  if (spec.unblockable || spec.level === "throw") return false;
  if (def.state === "hitstun" || def.state === "tumble" || def.state === "knockdown" || def.state === "ko" || def.state === "thrown" || def.state === "parry_stun" || def.state === "landlag" || def.state === "attack" || def.state === "super" || def.state === "throw" || def.state === "dash") {
    return false;
  }
  const holding = def.blocking || def.state === "blockstun";
  if (!holding) return false;
  if (spec.level === "low" && !def.crouch) return false;
  if ((spec.level === "overhead" || spec.level === "high") && def.crouch && def.y <= 0) return false;
  if (spec.level === "low" && def.y > 0) return false;
  return true;
}

function impactPoint(a, b) {
  return {
    x: px(i((a.x + b.x) / 2)),
    y: px(i((a.y + b.y) / 2)) + 64,
  };
}

function noteCombo(state, atk, def, dmg) {
  const fresh = !state.combo || state.combo.owner !== atk.id || state.combo.timer <= 0;
  if (fresh) {
    state.combo = { owner: atk.id, hits: 0, damage: 0, timer: 0 };
    def.juggle = 0;
    def.wallBounced = false;
    def.groundBounced = false;
  }
  state.combo.hits += 1;
  state.combo.damage += dmg;
  state.combo.timer = 80;
}

function dealDamage(state, atk, def, spec, events) {
  if (immune(def)) return "miss";
  const point = impactPoint(atk, def);
  const dirX = atk.facing;
  const dirY = spec.spike ? -1 : (spec.knockY > 0 || spec.launcher ? 1 : 0);

  if (def.parryWindow > 0 && !spec.unblockable && spec.move !== "throw") {
    def.parryWindow = 0;
    atk.state = "parry_stun";
    atk.stun = 30;
    atk.stateFrame = 0;
    atk.move = "";
    atk.moveFrame = 0;
    atk.vx = -atk.facing * 100;
    atk.vy = 0;
    atk.locked = false;
    atk.hitstop = 9;
    atk.contact = "block";
    atk.hitThisAttack = true;
    def.hitstop = 9;
    def.locked = false;
    def.state = "parry";
    def.stateFrame = 0;
    def.react = "parry";
    def.move = "";
    addMeter(def, 300);
    addMeter(atk, 40);
    events.push(makeEvent(state, "parry", def.id, point.x, point.y, { move: spec.move, weight: spec.weight }));
    events.push(makeEvent(state, "hit", atk.id, point.x, point.y, {
      move: spec.move, weight: spec.weight, damage: 0, dirX, dirY, blocked: true, parried: true, targetId: def.id,
    }));
    return "parry";
  }

  if (checkBlock(def, spec)) {
    const chip = spec.chip || 0;
    def.hp = Math.max(0, def.hp - chip);
    def.state = "blockstun";
    def.stun = spec.blockstun || 8;
    def.stateFrame = 0;
    def.move = "";
    def.vx = atk.facing * (spec.blockPush || 30);
    def.blocking = true;
    def.hitstop = 4;
    atk.hitstop = Math.max(atk.hitstop, 4);
    atk.contact = "block";
    atk.hitThisAttack = true;
    if (spec.weight === "super") atk.hitWindow = atk.hitWindow;
    addMeter(atk, 20);
    addMeter(def, 30);
    if ((def.x <= LEFT + 4 * SUB && atk.facing < 0) || (def.x >= RIGHT - 4 * SUB && atk.facing > 0)) {
      atk.vx = -atk.facing * (spec.blockPush || 30);
    }
    events.push(makeEvent(state, "block", def.id, point.x, point.y, { move: spec.move, weight: spec.weight }));
    events.push(makeEvent(state, "hit", atk.id, point.x, point.y, {
      move: spec.move, weight: spec.weight, damage: chip, dirX, dirY: 0, blocked: true, parried: false, targetId: def.id,
    }));
    return "block";
  }

  const hitsSoFar = state.combo && state.combo.owner === atk.id && state.combo.timer > 0 ? state.combo.hits : 0;
  const scale = Math.max(45, 100 - hitsSoFar * 12);
  const dmg = Math.max(1, i(spec.damage * scale / 100));
  def.hp = Math.max(0, def.hp - dmg);
  noteCombo(state, atk, def, dmg);
  addMeter(atk, spec.meter || 0);
  addMeter(def, i((spec.meter || 0) * 5 / 10) + 20);
  const hs = spec.weight === "super" && spec.finisher ? 14 : (HS[spec.weight] || 6);
  def.hitstop = hs;
  atk.hitstop = Math.max(atk.hitstop, hs);
  atk.contact = "hit";
  if (spec.weight !== "super") atk.hitThisAttack = true;
  def.react = spec.weight;
  def.move = "";
  def.moveFrame = 0;
  def.locked = false;
  def.blocking = false;
  def.parryWindow = 0;
  def.stun = spec.hitstun || 14;
  def.stateFrame = 0;
  def.facing = -atk.facing;

  const wasAir = def.airborne || def.y > 0;
  if (spec.cinematic && !spec.finisher) {
    def.x = atk.x + atk.facing * 68 * SUB;
    if (def.x < LEFT) def.x = LEFT;
    if (def.x > RIGHT) def.x = RIGHT;
    def.y = 0;
    def.vx = 0;
    def.vy = 0;
    def.airborne = false;
    def.state = "hitstun";
  } else if (spec.spike && (wasAir || def.y > 0)) {
    def.vy = -12 * SUB;
    def.vx = atk.facing * 2 * SUB;
    def.bounceOnLand = !def.groundBounced;
    def.airborne = true;
    def.pendingWall = false;
    def.state = "hitstun";
    if (def.y < SUB) def.y = SUB;
  } else if (spec.slam || (spec.knockdown && !wasAir && def.juggle <= 0)) {
    def.state = "hitstun";
    def.forceKD = true;
    def.bounceOnLand = false;
    def.vy = spec.knockY > 0 ? spec.knockY : 90;
    def.vx = atk.facing * (spec.knockX || 60);
    def.airborne = true;
    if (def.y < SUB) def.y = SUB;
    def.pendingWall = false;
    def.juggle = 1;
  } else if (spec.knockdown || spec.launcher || wasAir) {
    def.juggle += 1;
    if (def.juggle > 4) {
      def.vy = -8 * SUB;
      def.vx = atk.facing * 30;
      def.bounceOnLand = false;
      def.pendingWall = false;
      def.forceKD = true;
      def.airborne = true;
      def.state = "hitstun";
      def.stun = Math.min(def.stun, 14);
    } else {
      def.vy = spec.knockY > 0 ? spec.knockY : 6 * SUB;
      def.vx = atk.facing * (spec.knockX || 40);
      def.airborne = true;
      if (def.y < SUB) def.y = SUB;
      def.state = "hitstun";
      def.pendingWall = !!(spec.wallBounce || (spec.knockX || 0) >= 140);
      if (spec.launcher || !wasAir) {
        events.push(makeEvent(state, "launch", def.id, px(def.x), px(def.y), { move: spec.move, sourceId: atk.id }));
      }
    }
  } else {
    def.state = "hitstun";
    def.vx = atk.facing * (spec.knockX || 40);
    def.pendingWall = !!spec.wallBounce;
    if (spec.knockY > 0) {
      def.vy = spec.knockY;
      def.airborne = true;
      if (def.y < SUB) def.y = SUB;
    } else {
      def.vy = 0;
      def.airborne = false;
    }
  }

  events.push(makeEvent(state, "hit", atk.id, point.x, point.y, {
    move: spec.move,
    weight: spec.weight,
    damage: dmg,
    dirX,
    dirY,
    blocked: false,
    parried: false,
    targetId: def.id,
  }));
  if (spec.weight === "super") {
    events.push(makeEvent(state, "super_hit", atk.id, point.x, point.y, {
      move: "super", damage: dmg, targetId: def.id,
    }));
    if (spec.finisher) {
      events.push(makeEvent(state, "launch", def.id, px(def.x), px(def.y), { move: "super", sourceId: atk.id }));
    }
  }
  return "hit";
}

function resolveHits(state, events) {
  const fs = state.fighters;
  const pending = [];
  for (const f of fs) {
    if (f.state !== "attack" && f.state !== "super") continue;
    if (!f.move || f.move === "throw" || f.move === "blast") continue;
    const foe = fs[f.id ^ 1];
    if (f.move === "super") {
      const w = SUPER_WINDOWS.findIndex((start) => f.moveFrame >= start && f.moveFrame < start + 2);
      if (w < 0 || f.hitWindow === w) continue;
      const box = hitboxOf(f, MOVES.super.hitbox);
      if (!overlap(box, hurtbox(foe))) continue;
      if (immune(foe)) {
        f.hitWindow = w;
        continue;
      }
      const finisher = w === SUPER_WINDOWS.length - 1;
      pending.push({
        atk: f,
        def: foe,
        window: w,
        spec: {
          move: "super",
          weight: "super",
          damage: 650,
          hitstun: finisher ? 44 : 18,
          blockstun: 14,
          meter: 0,
          chip: 80,
          knockX: 48,
          knockY: finisher ? 220 : 0,
          blockPush: 36,
          level: "mid",
          unblockable: false,
          cinematic: !finisher,
          finisher,
          launcher: finisher,
        },
      });
      continue;
    }
    const mv = MOVES[f.move];
    if (!mv || f.hitThisAttack) continue;
    if (f.moveFrame < mv.startup || f.moveFrame >= mv.startup + mv.active) continue;
    const box = hitboxOf(f, mv.hitbox);
    if (!overlap(box, hurtbox(foe))) continue;
    if (immune(foe)) {
      f.hitThisAttack = true;
      continue;
    }
    pending.push({
      atk: f,
      def: foe,
      spec: {
        move: f.move,
        weight: mv.weight,
        damage: mv.damage,
        hitstun: mv.hitstun,
        blockstun: mv.blockstun,
        meter: mv.meter,
        chip: mv.chip || 0,
        knockX: mv.knockX || 0,
        knockY: mv.knockY || 0,
        blockPush: mv.blockPush || 0,
        level: mv.level,
        unblockable: !!mv.unblockable,
        launcher: !!mv.launcher,
        spike: !!mv.spike,
        wallBounce: !!mv.wallBounce,
        knockdown: !!mv.knockdown,
      },
    });
  }
  for (const p of pending) {
    if (p.window != null) p.atk.hitWindow = p.window;
    dealDamage(state, p.atk, p.def, p.spec, events);
  }
}

function projBox(p) {
  const hw = 18 * SUB;
  const hh = 16 * SUB;
  return { l: p.x - hw, r: p.x + hw, b: p.y - hh, t: p.y + hh };
}

function stepProjectiles(state, events) {
  const list = state.projectiles;
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      if (list[a].dead || list[b].dead) continue;
      if (list[a].owner === list[b].owner) continue;
      if (!overlap(projBox(list[a]), projBox(list[b]))) continue;
      list[a].dead = true;
      list[b].dead = true;
      const x = px(i((list[a].x + list[b].x) / 2));
      const y = px(i((list[a].y + list[b].y) / 2));
      events.push(makeEvent(state, "hit", list[a].owner, x, y, {
        move: "blast", weight: "special", damage: 0, dirX: 1, dirY: 0,
        blocked: false, parried: false, targetId: list[b].owner, clash: true,
      }));
    }
  }
  for (const p of list) {
    if (p.dead) continue;
    p.x += p.vx;
    p.life--;
    if (p.life <= 0 || p.x < -40 * SUB || p.x > 1320 * SUB) {
      p.dead = true;
      continue;
    }
    const foe = state.fighters[p.owner ^ 1];
    if (immune(foe)) continue;
    if (!overlap(projBox(p), hurtbox(foe))) continue;
    p.dead = true;
    dealDamage(state, state.fighters[p.owner], foe, BLAST_HIT, events);
  }
  state.projectiles = list.filter((p) => !p.dead);
}

function onLand(state, f, events) {
  if (f.state === "hitstun" || f.state === "tumble" || f.state === "parry_stun" || f.forceKD) {
    if (f.bounceOnLand && !f.groundBounced && f.state !== "parry_stun") {
      f.groundBounced = true;
      f.bounceOnLand = false;
      f.airborne = true;
      f.y = SUB;
      f.vy = 11 * SUB;
      f.vx = i(f.vx / 2);
      f.stun = Math.max(f.stun, 20);
      f.state = "hitstun";
      f.juggle += 1;
      f.forceKD = false;
      events.push(makeEvent(state, "ground_bounce", f.id, px(f.x), 0, { move: "spike" }));
      events.push(makeEvent(state, "launch", f.id, px(f.x), 0, { move: "bounce", sourceId: -1 }));
      return;
    }
    f.state = "knockdown";
    f.stun = 28;
    f.stateFrame = 0;
    f.vx = i(f.vx / 3);
    f.vy = 0;
    f.bounceOnLand = false;
    f.forceKD = false;
    f.airborne = false;
    f.y = 0;
    return;
  }
  if (f.state === "attack" && f.move && MOVES[f.move] && MOVES[f.move].air) {
    f.state = "landlag";
    f.stun = MOVES[f.move].landLag || 8;
    f.move = "";
    f.moveFrame = 0;
    f.vx = 0;
    f.airborne = false;
    return;
  }
  if (f.state === "air" || f.state === "dash" || f.state === "attack" || f.state === "jumpsquat") {
    f.state = "idle";
    f.vx = 0;
    f.move = "";
    f.airborne = false;
  }
}

function integrateY(state, f, events) {
  const rising = f.airborne || f.y > 0 || f.vy > 0;
  if (!rising) {
    f.y = 0;
    f.vy = 0;
    f.airborne = false;
    return;
  }
  f.y += f.vy;
  f.vy -= GRAVITY;
  if (f.y <= 0 && f.vy <= 0) {
    f.y = 0;
    f.vy = 0;
    const was = f.airborne || true;
    f.airborne = false;
    f.airOptions = 1;
    if (was) events.push(makeEvent(state, "land", f.id, px(f.x), 0, {}));
    onLand(state, f, events);
  } else {
    f.airborne = true;
  }
}

function wallBounce(state, f, events) {
  if (f.locked) return;
  const hitL = f.x < LEFT && f.vx < 0;
  const hitR = f.x > RIGHT && f.vx > 0;
  if (!hitL && !hitR) return;
  const strong = Math.abs(f.vx) > 5 * SUB;
  const st = f.state === "hitstun" || f.state === "tumble";
  if ((f.pendingWall || (f.juggle > 0 && strong)) && !f.wallBounced && st) {
    f.vx = -i(f.vx * 3 / 5);
    if (f.vx === 0) f.vx = hitL ? 4 * SUB : -4 * SUB;
    if (f.vy < 7 * SUB) f.vy = 7 * SUB;
    if (f.y < SUB) f.y = SUB;
    f.airborne = true;
    f.stun += 16;
    f.state = "hitstun";
    f.wallBounced = true;
    f.pendingWall = false;
    f.juggle += 1;
    f.x = hitL ? LEFT : RIGHT;
    events.push(makeEvent(state, "wall_bounce", f.id, px(f.x), px(f.y), {}));
  }
}

function separate(a, b) {
  if (a.locked || b.locked) return;
  if (a.state === "dash" || b.state === "dash") return;
  const MIN = 48 * SUB;
  let dx = b.x - a.x;
  if (dx === 0) {
    a.x -= MIN >> 1;
    b.x += MIN - (MIN >> 1);
    return;
  }
  const ad = Math.abs(dx);
  if (ad >= MIN) return;
  const push = MIN - ad;
  const sign = dx > 0 ? 1 : -1;
  const half = push >> 1;
  a.x -= sign * (push - half);
  b.x += sign * half;
}

function clampWall(f, other) {
  if (f.x < LEFT) {
    const over = LEFT - f.x;
    f.x = LEFT;
    if (f.vx < 0 && !f.wallBounced) f.vx = 0;
    if (other && !other.locked && other.state !== "dash") other.x += over;
  } else if (f.x > RIGHT) {
    const over = f.x - RIGHT;
    f.x = RIGHT;
    if (f.vx > 0 && !f.wallBounced) f.vx = 0;
    if (other && !other.locked && other.state !== "dash") other.x -= over;
  }
}

function physics(state, events) {
  const fs = state.fighters;
  for (const f of fs) {
    if (f.locked) continue;
    f.x += f.vx;
    integrateY(state, f, events);
  }
  for (const f of fs) wallBounce(state, f, events);
  separate(fs[0], fs[1]);
  clampWall(fs[0], fs[1]);
  clampWall(fs[1], fs[0]);
  for (const f of fs) {
    if (f.x < LEFT) f.x = LEFT;
    if (f.x > RIGHT) f.x = RIGHT;
    if (f.y < 0) f.y = 0;
    if (f.y > 340 * SUB) {
      f.y = 340 * SUB;
      if (f.vy > 0) f.vy = 0;
    }
  }
}

function endRound(state, events, winner, reason) {
  if (state.phase !== "fight") return;
  state.roundWinner = winner;
  state.reason = reason;
  if (winner === 0 || winner === 1) state.wins[winner] += 1;
  state.phase = "ko_freeze";
  state.phaseFrame = 0;
  state.projectiles = [];
  state.ink = 0;
  for (const f of state.fighters) {
    f.hitstop = 0;
    f.locked = false;
    f.vx = 0;
    f.invuln = 0;
    f.move = "";
    f.buffer = 0;
  }
  if (reason === "ko" || (reason === "draw" && state.fighters.some((f) => f.hp <= 0))) {
    for (const f of state.fighters) {
      if (f.hp <= 0) {
        f.state = "ko";
        events.push(makeEvent(state, "ko", f.id, px(f.x), px(f.y) + 70, {
          sourceId: winner,
        }));
      } else if (winner === f.id) {
        f.state = "win";
        f.y = 0;
        f.vy = 0;
        f.airborne = false;
      }
    }
  } else {
    for (const f of state.fighters) {
      f.y = 0;
      f.vy = 0;
      f.airborne = false;
      f.state = winner === f.id ? "win" : "idle";
    }
  }
  events.push(makeEvent(state, "round_end", winner, 640, 0, {
    winner,
    reason,
    round: state.round,
    wins: [state.wins[0], state.wins[1]],
  }));
}

function resolveKOs(state, events) {
  if (state.phase !== "fight") return;
  const dead = state.fighters.filter((f) => f.hp <= 0);
  if (dead.length === 0) return;
  if (dead.length >= 2) endRound(state, events, -1, "draw");
  else endRound(state, events, dead[0].id ^ 1, "ko");
}

function timeOver(state, events) {
  const a = state.fighters[0].hp;
  const b = state.fighters[1].hp;
  if (a > b) endRound(state, events, 0, "time");
  else if (b > a) endRound(state, events, 1, "time");
  else endRound(state, events, -1, "draw");
}

function doIntro(state, events) {
  if (state.phaseFrame === 0) {
    events.push(makeEvent(state, "round_start", -1, 640, 0, { round: state.round }));
  }
  state.phaseFrame++;
  for (const f of state.fighters) {
    f.state = "idle";
    f.stateFrame++;
    f.vx = 0;
    f.vy = 0;
    f.airborne = false;
    f.y = 0;
  }
  if (state.phaseFrame >= INTRO_LEN) {
    state.phase = "fight";
    state.phaseFrame = 0;
    state.roundTime = ROUND_TIME;
  }
}

function doKoFreeze(state) {
  state.phaseFrame++;
  for (const f of state.fighters) f.stateFrame++;
  const limit = state.reason === "time" ? TIME_HOLD : KO_HOLD;
  if (state.phaseFrame >= limit) {
    state.phase = "round_end";
    state.phaseFrame = 0;
  }
}

function doRoundEnd(state, events) {
  state.phaseFrame++;
  for (const f of state.fighters) f.stateFrame++;
  if (state.phaseFrame < ROUND_HOLD) return;
  if (state.wins[0] >= WINS_NEEDED || state.wins[1] >= WINS_NEEDED) {
    state.phase = "match_end";
    state.phaseFrame = 0;
    const winner = state.wins[0] >= WINS_NEEDED ? 0 : 1;
    const w = state.fighters[winner];
    events.push(makeEvent(state, "match_end", winner, px(w.x), px(w.y), {
      winner,
      wins: [state.wins[0], state.wins[1]],
    }));
    return;
  }
  state.fighters = [createFighter(0), createFighter(1)];
  state.projectiles = [];
  state.combo = null;
  state.ink = 0;
  state.reason = "";
  state.roundWinner = -1;
  state.phase = "intro";
  state.phaseFrame = 0;
  state.round = state.wins[0] + state.wins[1] + 1;
}

function doMatchEnd(state) {
  state.phaseFrame++;
  for (const f of state.fighters) f.stateFrame++;
}

export function step(state, inputs) {
  const events = [];
  const masks = [((inputs && inputs[0]) || 0) | 0, ((inputs && inputs[1]) || 0) | 0];
  const started = new Set();

  if (state.phase === "intro") {
    doIntro(state, events);
    state.frame++;
    return events;
  }
  if (state.phase === "ko_freeze") {
    doKoFreeze(state);
    state.frame++;
    return events;
  }
  if (state.phase === "round_end") {
    doRoundEnd(state, events);
    state.frame++;
    return events;
  }
  if (state.phase === "match_end") {
    doMatchEnd(state);
    state.frame++;
    return events;
  }

  const A = state.fighters[0];
  const B = state.fighters[1];
  const freezing = A.hitstop > 0 || B.hitstop > 0;
  const pressed0 = soak(A, masks[0], freezing);
  const pressed1 = soak(B, masks[1], freezing);
  if (freezing) {
    if (A.hitstop > 0) A.hitstop--;
    if (B.hitstop > 0) B.hitstop--;
    if (state.phase === "fight") {
      state.roundTime--;
      if (state.roundTime <= 0) timeOver(state, events);
    }
    state.frame++;
    return events;
  }

  if (state.ink > 0) state.ink--;
  if (state.combo) {
    state.combo.timer--;
    if (state.combo.timer <= 0) state.combo = null;
  }

  const clash = { throw: false };
  updateFighter(state, A, B, masks[0], pressed0, events, started, clash);
  updateFighter(state, B, A, masks[1], pressed1, events, started, clash);
  physics(state, events);
  if (state.phase === "fight") resolveHits(state, events);
  if (state.phase === "fight") stepProjectiles(state, events);
  if (state.phase === "fight") resolveKOs(state, events);
  if (state.phase === "fight") {
    state.roundTime--;
    if (state.roundTime <= 0) timeOver(state, events);
  }
  state.frame++;
  return events;
}
