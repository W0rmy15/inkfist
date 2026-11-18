import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createApp, clientIp } from "../server/index.js";
import { INPUT_DELAY, createMatch, frameIndex, hashState, step } from "../shared/sim.js";

function opened(ws) {
  return new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}

function once(ws, pred, ms = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for a message")), ms);
    const onMsg = (buf) => {
      const msg = JSON.parse(buf.toString());
      if (pred(msg)) {
        clearTimeout(timer);
        ws.off("message", onMsg);
        resolve(msg);
      }
    };
    ws.on("message", onMsg);
  });
}

test("client ip ignores X-Forwarded-For unless TRUST_CF=1", () => {
  const req = {
    headers: { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "9.9.9.9" },
    socket: { remoteAddress: "10.0.0.8" },
  };
  delete process.env.TRUST_CF;
  assert.equal(clientIp(req), "10.0.0.8");
  process.env.TRUST_CF = "1";
  assert.equal(clientIp(req), "9.9.9.9");
  delete process.env.TRUST_CF;
  assert.equal(clientIp(req), "10.0.0.8");
});

test("health, room create/join, input relay, unknown resume", async () => {
  const app = createApp();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const port = app.server.address().port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, { ok: true, version: app.version });

    const a = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const b = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all([opened(a), opened(b)]);

    a.send(JSON.stringify({ t: "create", playerId: "player-a", name: "Red" }));
    const room = await once(a, (m) => m.t === "room");
    assert.equal(room.you, 0);
    assert.match(room.code, /^[A-Z2-9]{4}$/);

    b.send(JSON.stringify({ t: "join", playerId: "player-b", name: "Blue", code: room.code }));
    const [sa, sb] = await Promise.all([
      once(a, (m) => m.t === "start"),
      once(b, (m) => m.t === "start"),
    ]);
    assert.equal(sa.you, 0);
    assert.equal(sb.you, 1);
    assert.equal(sa.startTime, sb.startTime);
    assert.equal(sa.delay, 3);
    assert.equal(sa.room, room.code);

    a.send(JSON.stringify({ t: "input", list: [{ f: 3, m: 16 }] }));
    const relay = await once(b, (m) => m.t === "in");
    assert.equal(relay.p, 0);
    assert.equal(relay.list[0].f, 3);
    assert.equal(relay.list[0].m, 16);

    const stranger = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await opened(stranger);
    stranger.send(JSON.stringify({ t: "join", code: "NOPE", playerId: "player-c", name: "C" }));
    const err = await once(stranger, (m) => m.t === "error");
    assert.match(err.message, /No open room/);

    const resumeSock = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await opened(resumeSock);
    resumeSock.send(JSON.stringify({ t: "resume", playerId: "missing", room: "ZZZZ" }));
    const gone = await once(resumeSock, (m) => m.t === "gone");
    assert.equal(gone.reason, "restarted");

    stranger.close();
    resumeSock.close();
    a.close();
    b.close();
  } finally {
    await new Promise((resolve) => {
      app.close();
      app.server.close(() => resolve());
    });
  }
});

test("two clients relaying inputs stay on the same hash", async () => {
  const app = createApp();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const port = app.server.address().port;
  const sockets = [null, null];
  try {
    sockets[0] = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    sockets[1] = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await Promise.all(sockets.map(opened));
    sockets[0].send(JSON.stringify({ t: "create", playerId: "sync-a", name: "Red" }));
    const room = await once(sockets[0], (m) => m.t === "room");
    sockets[1].send(JSON.stringify({ t: "join", playerId: "sync-b", name: "Blue", code: room.code }));
    const start = await once(sockets[0], (m) => m.t === "start");
    const remote = [new Map(), new Map()];
    const local = [new Map(), new Map()];
    const states = [createMatch(), createMatch()];
    const hashes = [[], []];
    for (const slot of [0, 1]) {
      sockets[slot].on("message", (buf) => {
        const msg = JSON.parse(buf.toString());
        if (msg.t !== "in" || !Array.isArray(msg.list)) return;
        for (const item of msg.list) remote[msg.p].set(item.f, item.m);
      });
    }
    const script = (frame, slot) => {
      if (frame < INPUT_DELAY) return 0;
      if (slot === 0 && frame % 24 === 8) return 16;
      if (slot === 0 && frame % 36 === 14) return 32;
      if (slot === 1 && frame % 30 === 10) return 128;
      return slot === 0 ? 2 : 1;
    };
    const deadline = Date.now() + 7000;
    const sentUpTo = [-1, -1];
    while (Date.now() < deadline && Math.min(states[0].frame, states[1].frame) < 120) {
      const clock = Math.max(0, frameIndex(Date.now(), start.startTime));
      for (const slot of [0, 1]) {
        for (let f = sentUpTo[slot] + 1; f <= clock + INPUT_DELAY; f++) {
          const m = script(f, slot);
          local[slot].set(f, m);
          sockets[slot].send(JSON.stringify({ t: "input", list: [{ f, m }] }));
          sentUpTo[slot] = f;
        }
        while (states[slot].frame < clock) {
          const f = states[slot].frame;
          const mine = local[slot].get(f);
          const theirs = remote[slot ^ 1].get(f);
          const early = f < INPUT_DELAY ? 0 : null;
          const m0 = slot === 0 ? (mine ?? early) : (theirs ?? early);
          const m1 = slot === 1 ? (mine ?? early) : (theirs ?? early);
          if (m0 == null || m1 == null) break;
          step(states[slot], [m0, m1]);
          hashes[slot][states[slot].frame] = hashState(states[slot]);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const n = Math.min(states[0].frame, states[1].frame);
    assert.ok(n >= 90, `only reached frame ${n}`);
    assert.equal(hashes[0][n], hashes[1][n]);
    assert.equal(hashes[0][60], hashes[1][60]);
  } finally {
    for (const sock of sockets) sock?.close();
    await new Promise((resolve) => {
      app.close();
      app.server.close(() => resolve());
    });
  }
});
