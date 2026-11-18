import { IN } from "../shared/sim.js";

const held = new Set();
const touch = new Set();

const KEY = {
  KeyA: IN.L, ArrowLeft: IN.L,
  KeyD: IN.R, ArrowRight: IN.R,
  KeyW: IN.U, ArrowUp: IN.U,
  KeyS: IN.D, ArrowDown: IN.D,
  KeyJ: IN.LIGHT,
  KeyK: IN.HEAVY,
  KeyL: IN.SPECIAL,
  KeyI: IN.BLOCK,
  ShiftLeft: IN.DASH, ShiftRight: IN.DASH,
};

let listening = false;

export function attachInput(target = window) {
  if (listening) return;
  listening = true;
  target.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (KEY[e.code]) {
      held.add(e.code);
      if (matchActive()) e.preventDefault();
    }
  });
  target.addEventListener("keyup", (e) => {
    if (KEY[e.code]) {
      held.delete(e.code);
      if (matchActive()) e.preventDefault();
    }
  });
  target.addEventListener("blur", () => held.clear());
}

let active = false;
export function setMatchActive(on) {
  active = on;
  if (!on) held.clear();
}
function matchActive() { return active; }

export function setTouch(bit, down) {
  if (down) touch.add(bit);
  else touch.delete(bit);
}

function padMask() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let mask = 0;
  for (const gp of pads) {
    if (!gp) continue;
    const ax = gp.axes || [];
    const b = gp.buttons || [];
    const dead = 0.45;
    if ((ax[0] || 0) < -dead || b[14]?.pressed) mask |= IN.L;
    if ((ax[0] || 0) > dead || b[15]?.pressed) mask |= IN.R;
    if ((ax[1] || 0) < -dead || b[12]?.pressed) mask |= IN.U;
    if ((ax[1] || 0) > dead || b[13]?.pressed) mask |= IN.D;
    if (b[0]?.pressed) mask |= IN.LIGHT;
    if (b[1]?.pressed) mask |= IN.HEAVY;
    if (b[2]?.pressed) mask |= IN.SPECIAL;
    if (b[3]?.pressed || b[4]?.pressed || b[6]?.pressed) mask |= IN.BLOCK;
    if (b[5]?.pressed || b[7]?.pressed) mask |= IN.DASH;
  }
  return mask;
}

export function snapshot() {
  let mask = 0;
  for (const code of held) mask |= KEY[code] || 0;
  for (const bit of touch) mask |= bit;
  mask |= padMask();
  return mask;
}
