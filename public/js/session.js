// Drives the shared sim. Online play predicts the remote fighter and
// rolls back when their real input arrives. Events fire once per frame.

import {
  INPUT_DELAY,
  cloneState,
  createMatch,
  hashState,
  step,
} from "../shared/sim.js";
import { createAi } from "../shared/ai.js";

const KEEP = new Set(["ko", "round_start", "round_end", "match_end", "super_start"]);

function emitFrame(bus, evts, quiet) {
  for (const e of evts) {
    if (quiet && !KEEP.has(e.type)) continue;
    bus.emit(e.type, e);
  }
}

export function createLocalSession({ bus, aiFor = [null, null] }) {
  let state = createMatch();
  let emitted = -1;
  const ais = aiFor.map((opts, id) => (opts ? createAi(id, opts) : null));
  return {
    kind: "local",
    you: 0,
    predicted: false,
    get state() { return state; },
    advance(mask) {
      const idx = state.frame;
      const m0 = ais[0] ? ais[0].input(state) : (mask | 0);
      const m1 = ais[1] ? ais[1].input(state) : 0;
      const evts = step(state, [m0, m1]);
      if (idx > emitted) {
        emitFrame(bus, evts, false);
        emitted = idx;
      }
    },
    hash() { return hashState(state); },
  };
}

export function createNetSession({ you, startTime, bus, send }) {
  let state = createMatch();
  const snaps = new Map([[0, cloneState(state)]]);
  const inputs = [[], []];
  const used = [[], []];
  const recent = [];
  let emitted = -1;
  let predicted = false;
  let lastCap = -1;
  const remote = you ^ 1;

  function remember(frame, mask) {
    if (inputs[you][frame] != null) return;
    inputs[you][frame] = mask;
    recent.push({ f: frame, m: mask });
    if (recent.length > 8) recent.shift();
    send({ t: "input", list: recent.slice() });
  }

  function predict(slot, idx) {
    if (inputs[slot][idx] != null) return inputs[slot][idx];
    if (idx < INPUT_DELAY) return 0;
    for (let f = idx - 1; f >= 0; f--) {
      if (inputs[slot][f] != null) return inputs[slot][f];
    }
    return 0;
  }

  function advanceTo(target) {
    let steps = 0;
    while (state.frame < target && steps < 20) {
      const idx = state.frame;
      const remoteKnown = inputs[remote][idx] != null || idx < INPUT_DELAY;
      const m0 = predict(0, idx);
      const m1 = predict(1, idx);
      used[0][idx] = m0;
      used[1][idx] = m1;
      const evts = step(state, [m0, m1]);
      snaps.set(state.frame, cloneState(state));
      snaps.delete(state.frame - 72);
      if (idx > emitted) {
        emitFrame(bus, evts, target - idx > 4);
        emitted = idx;
      }
      predicted = !remoteKnown;
      steps++;
    }
  }

  function rewind(frame, clock) {
    const snap = snaps.get(frame);
    if (!snap) {
      send({ t: "need", frame });
      return;
    }
    state = cloneState(snap);
    advanceTo(Math.max(clock, frame));
  }

  return {
    kind: "net",
    you,
    startTime,
    get state() { return state; },
    get predicted() { return predicted; },
    hash() { return hashState(state); },
    capture(mask, clock) {
      if (clock < 0) return;
      for (let g = lastCap + 1; g <= clock; g++) remember(g + INPUT_DELAY, mask | 0);
      if (clock > lastCap) lastCap = clock;
    },
    advance(clock) {
      if (clock < 0) return;
      advanceTo(clock);
      if (state.frame > 40 && state.frame % 30 === 0) {
        const f = state.frame - 12;
        const snap = snaps.get(f);
        if (snap) send({ t: "hash", frame: f, hash: hashState(snap) });
      }
    },
    onInputs(slot, list, clock) {
      let rewindTo = null;
      for (const item of list) {
        const f = item.f | 0;
        const m = item.m | 0;
        if (inputs[slot][f] === m) continue;
        inputs[slot][f] = m;
        if (f < state.frame && used[slot][f] !== undefined && used[slot][f] !== m) {
          rewindTo = rewindTo == null ? f : Math.min(rewindTo, f);
        }
      }
      if (rewindTo != null) rewind(rewindTo, clock);
    },
    onAuth(frame, hash) {
      const snap = snaps.get(frame);
      if (!snap) return;
      if (hashState(snap) !== hash) send({ t: "need", frame });
    },
    applySync(msg, clock) {
      state = cloneState(msg.state);
      snaps.clear();
      snaps.set(state.frame, cloneState(state));
      used[0] = [];
      used[1] = [];
      if (emitted > state.frame) {
        /* keep emitted so rolled-back frames stay quiet */
      } else {
        emitted = state.frame - 1;
      }
      for (const slot of [0, 1]) {
        const list = (msg.inputs && (msg.inputs[slot] || msg.inputs[String(slot)])) || [];
        for (const pair of list) inputs[slot][pair[0]] = pair[1];
      }
      if (clock >= 0) advanceTo(clock);
    },
  };
}
