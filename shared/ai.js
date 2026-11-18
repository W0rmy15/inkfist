// Practice / attract opponent. Pure function of the sim state so a match
// can be replayed. Not used by the online server — online players send inputs.

import { IN, MOVES, SUB, MAX_METER, LEFT, RIGHT } from "./sim.js";

function roll(state, salt) {
  let x = Math.imul(state.frame + 1, 374761393) ^ Math.imul(salt + 1, 668265263);
  x ^= state.fighters[0].x + Math.imul(state.fighters[1].hp | 0, 17);
  x ^= (state.fighters[0].meter | 0) << 3;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return (x >>> 0) % 100;
}

function toward(me, foe) {
  return foe.x >= me.x ? IN.R : IN.L;
}

function dist(me, foe) {
  const d = me.x - foe.x;
  return d < 0 ? -d : d;
}

function nextButton(me) {
  switch (me.move) {
    case "jab":
    case "jab2":
      return IN.LIGHT;
    case "jab3":
    case "kick":
      return IN.HEAVY;
    case "upper":
      return IN.U;
    case "airjab":
      return IN.HEAVY;
    case "airkick":
      return 0;
    default:
      return 0;
  }
}

function cancelInput(state, me, foe, convert) {
  if (me.contact !== "hit" && me.contact !== "block") return 0;
  const mv = MOVES[me.move];
  if (!mv) return 0;
  if (me.moveFrame < mv.startup || me.moveFrame > mv.startup + mv.active + 4) return 0;
  if (me.contact === "hit" && roll(state, me.id + 3) >= convert) return 0;
  if (me.contact === "block" && roll(state, me.id + 9) > 30) return 0;
  return nextButton(me, foe);
}

function neutral(state, me, foe, blockChance) {
  const gap = dist(me, foe);
  const dir = toward(me, foe);
  const r = roll(state, me.id + 11);

  if (foe.state === "attack" || foe.state === "super") {
    const mv = MOVES[foe.move];
    const threatening = mv && foe.moveFrame + 2 >= mv.startup && gap < 150 * SUB;
    if (threatening && r < blockChance) {
      let mask = IN.BLOCK;
      if (mv.level === "low" || r < blockChance / 2) mask |= IN.D;
      if (r < 18 && foe.moveFrame + 1 >= mv.startup) return IN.BLOCK;
      return mask;
    }
  }

  if (me.state === "air" || me.y > 0) {
    const foeAir = foe.y > 12 * SUB || foe.state === "hitstun" || foe.state === "tumble";
    if (me.airOptions > 0 && foe.y > me.y + 28 * SUB && gap < 190 * SUB) {
      return IN.U | IN.DASH | dir;
    }
    if (foeAir && gap > 72 * SUB && gap < 220 * SUB) return dir;
    if (foeAir && gap <= 84 * SUB && me.y > foe.y + 8 * SUB) return IN.D | IN.HEAVY;
    if (foeAir && gap < 120 * SUB && me.y + 24 * SUB < foe.y) return IN.LIGHT;
    if (gap < 110 * SUB) return IN.LIGHT;
    return dir;
  }

  if (me.meter >= MAX_METER && gap < 220 * SUB && (foe.state === "hitstun" || foe.state === "tumble" || foe.state === "knockdown" || r < 8)) {
    return IN.D | IN.SPECIAL;
  }

  if (foe.y > 70 * SUB && gap < 120 * SUB) return IN.HEAVY;

  const foeNearWall = foe.x < LEFT + 280 * SUB || foe.x > RIGHT - 280 * SUB;
  if (foeNearWall && gap < 120 * SUB && r < 70) return dir | IN.HEAVY;

  if (gap > 112 * SUB) {
    if (gap > 320 * SUB && r < 14) return IN.SPECIAL;
    if (gap > 150 * SUB && r < 45) return dir | IN.DASH;
    return dir;
  }
  if (r < 7) return dir | IN.SPECIAL;
  if (r < 14) return IN.D | IN.HEAVY;
  if (r < 22) return IN.HEAVY;
  if (r < 30) return dir | IN.LIGHT;
  return IN.LIGHT;
}

export function createAi(id, opts = {}) {
  const convert = opts.convert ?? 75;
  const blockChance = opts.block ?? 30;
  let hold = 0;
  return {
    input(state) {
      const me = state.fighters[id];
      const foe = state.fighters[id ^ 1];
      if (!me || !foe || state.phase !== "fight") return 0;
      if (me.state === "hitstun" || me.state === "tumble" || me.state === "knockdown" || me.state === "thrown" || me.state === "ko" || me.state === "parry_stun" || me.state === "landlag" || me.state === "win") {
        return 0;
      }
      if (me.state === "blockstun") return IN.BLOCK | ((roll(state, 5) < 40) ? IN.D : 0);
      if (me.state === "jumpsquat") return IN.U;
      if (me.state === "attack" || me.state === "super" || me.state === "throw" || me.state === "dash") {
        if (me.state === "attack") return cancelInput(state, me, foe, convert);
        return 0;
      }
      if (me.state === "parry") return gapClose(me, foe) ? IN.LIGHT : 0;
      if (hold > 0) {
        hold--;
        return 0;
      }
      const mask = neutral(state, me, foe, blockChance);
      if (mask & (IN.LIGHT | IN.HEAVY | IN.SPECIAL)) hold = 5;
      return mask;
    },
  };
}

function gapClose(me, foe) {
  return dist(me, foe) < 110 * SUB;
}
