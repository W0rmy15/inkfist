// In-memory rooms. A process restart drops every match; clients are told.

import {
  INPUT_DELAY,
  cloneState,
  createMatch,
  frameIndex,
  hashState,
  step,
} from "../shared/sim.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_ROOMS = 100;
const RESUME_MS = 8000;

function send(ws, msg) {
  if (!ws || ws.readyState !== 1) return;
  try { ws.send(JSON.stringify(msg)); } catch { /* socket closing */ }
}

function sanitizeName(raw, fallback) {
  const clean = String(raw || "").replace(/[^a-zA-Z0-9 _'.-]/g, "").trim().slice(0, 14);
  return clean || fallback;
}

export function attachLobby({ allow }) {
  const rooms = new Map();
  const queue = [];
  const resumeTimers = new Set();

  function makeCode() {
    for (let n = 0; n < 30; n++) {
      let s = "";
      for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(s)) return s;
    }
    return null;
  }

  function namesOf(room) {
    return [
      room.players[0] ? room.players[0].name : null,
      room.players[1] ? room.players[1].name : null,
    ];
  }

  function tellRoom(room, extra = {}) {
    for (let s = 0; s < 2; s++) {
      const p = room.players[s];
      if (!p) continue;
      send(p.ws, { t: "room", code: room.code, you: s, names: namesOf(room), status: room.status, ...extra });
    }
  }

  function syncPayload(room) {
    const frame = room.auth.frame;
    const inputs = { 0: [], 1: [] };
    for (let s = 0; s < 2; s++) {
      const arr = room.inputs[s];
      const start = Math.max(0, frame);
      const end = Math.min(arr.length, frame + 120);
      for (let f = start; f < end; f++) {
        if (arr[f] != null) inputs[s].push([f, arr[f]]);
      }
    }
    return { t: "sync", frame, state: room.auth, inputs };
  }

  function begin(room) {
    room.status = "fight";
    room.auth = createMatch();
    room.snaps = new Map([[0, cloneState(room.auth)]]);
    room.inputs = [[], []];
    room.startTime = Date.now() + 800;
    room.rematch = [false, false];
    room.disconnected = [0, 0];
    const names = namesOf(room);
    for (let s = 0; s < 2; s++) {
      send(room.players[s].ws, {
        t: "start",
        you: s,
        names,
        startTime: room.startTime,
        delay: INPUT_DELAY,
        room: room.code,
      });
    }
    console.log(`match ${room.code} started`);
  }

  function endRoom(room, reason, staySlot) {
    if (!room || room.status === "dead") return;
    room.status = "dead";
    for (let s = 0; s < 2; s++) {
      const p = room.players[s];
      if (!p) continue;
      p.room = null;
      p.slot = -1;
      if (reason === "opponent_left" && s === staySlot) send(p.ws, { t: "opponent_left" });
    }
    rooms.delete(room.code);
    console.log(`room ${room.code} closed (${reason})`);
  }

  function inputAt(room, slot, idx) {
    const v = room.inputs[slot][idx];
    if (v != null) return v;
    if (idx < INPUT_DELAY) return 0;
    return null;
  }

  function tickRoom(room, now) {
    if (room.status !== "fight") return;
    const clock = frameIndex(now, room.startTime);
    if (clock < 0) return;
    let guard = 0;
    while (room.auth.frame < clock && guard++ < 8) {
      const idx = room.auth.frame;
      const a = inputAt(room, 0, idx);
      const b = inputAt(room, 1, idx);
      if (a == null || b == null) break;
      step(room.auth, [a, b]);
      room.snaps.set(room.auth.frame, cloneState(room.auth));
      room.snaps.delete(room.auth.frame - 48);
      if (room.auth.frame % 30 === 0) {
        const hash = hashState(room.auth);
        for (const p of room.players) send(p && p.ws, { t: "auth", frame: room.auth.frame, hash });
      }
    }
    for (let s = 0; s < 2; s++) {
      const since = room.disconnected[s];
      if (since && now - since > RESUME_MS) {
        endRoom(room, "opponent_left", s ^ 1);
        return;
      }
    }
  }

  function unqueue(player) {
    const idx = queue.indexOf(player);
    if (idx >= 0) queue.splice(idx, 1);
    player.queued = false;
  }

  // Socket dropped. Keep the seat for a few seconds so a refresh can resume.
  function suspend(player) {
    unqueue(player);
    const room = player.room;
    if (!room || player.slot < 0) return;
    if (room.status !== "fight") {
      room.players[player.slot] = null;
      player.room = null;
      player.slot = -1;
      if (!room.players[0] && !room.players[1]) rooms.delete(room.code);
      else tellRoom(room);
      return;
    }
    room.disconnected[player.slot] = Date.now();
    const other = room.players[player.slot ^ 1];
    if (other) send(other.ws, { t: "opponent_dc" });
  }

  // Player chose to leave. The seat is gone and the opponent wins the walkover.
  function leave(player) {
    unqueue(player);
    const room = player.room;
    if (!room || player.slot < 0) return;
    const slot = player.slot;
    if (room.status === "fight") {
      room.players[slot] = null;
      player.room = null;
      player.slot = -1;
      endRoom(room, "opponent_left", slot ^ 1);
      return;
    }
    room.players[slot] = null;
    player.room = null;
    player.slot = -1;
    if (!room.players[0] && !room.players[1]) rooms.delete(room.code);
    else tellRoom(room);
  }

  function seat(room, player, slot) {
    room.players[slot] = player;
    player.room = room;
    player.slot = slot;
    player.queued = false;
    const q = queue.indexOf(player);
    if (q >= 0) queue.splice(q, 1);
  }

  function handle(player, msg) {
    player.lastSeen = Date.now();
    switch (msg.t) {
      case "ping":
        send(player.ws, { t: "pong", c: msg.c, s: Date.now() });
        return;
      case "create": {
        if (!allow(player.ip, 1, "room")) {
          send(player.ws, { t: "error", message: "Too many room requests. Wait a moment." });
          return;
        }
        if (rooms.size >= MAX_ROOMS) {
          send(player.ws, { t: "error", message: "The server is full of rooms. Try again shortly." });
          return;
        }
        leave(player);
        const code = makeCode();
        if (!code) {
          send(player.ws, { t: "error", message: "Could not mint a room code." });
          return;
        }
        player.name = sanitizeName(msg.name, "Ember");
        const room = {
          code,
          players: [null, null],
          status: "wait",
          created: Date.now(),
          disconnected: [0, 0],
          inputs: [[], []],
          auth: null,
          snaps: new Map(),
          startTime: 0,
          rematch: [false, false],
        };
        rooms.set(code, room);
        seat(room, player, 0);
        if (!player.name) player.name = "Ember";
        tellRoom(room);
        console.log(`room ${code} created`);
        return;
      }
      case "join": {
        if (!allow(player.ip, 1, "room")) {
          send(player.ws, { t: "error", message: "Too many join requests. Wait a moment." });
          return;
        }
        const code = String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const room = rooms.get(code);
        if (!room || room.status === "dead") {
          send(player.ws, { t: "error", message: "No open room with that code." });
          return;
        }
        if (room.status !== "wait" || (room.players[0] && room.players[1])) {
          send(player.ws, { t: "error", message: "That room is already fighting." });
          return;
        }
        if (room.players[0] && room.players[0].id === player.id) {
          send(player.ws, { t: "error", message: "You're already in that room." });
          return;
        }
        leave(player);
        player.name = sanitizeName(msg.name, "Marrow");
        const slot = room.players[0] ? 1 : 0;
        seat(room, player, slot);
        if (room.players[0] && !room.players[0].name) room.players[0].name = "Ember";
        tellRoom(room);
        if (room.players[0] && room.players[1]) begin(room);
        return;
      }
      case "quick": {
        if (!allow(player.ip, 1, "room")) {
          send(player.ws, { t: "error", message: "Too many matchmaking requests." });
          return;
        }
        leave(player);
        player.name = sanitizeName(msg.name, "Ember");
        const waiting = queue.find((p) => p !== player && p.ws && p.ws.readyState === 1);
        if (!waiting) {
          player.queued = true;
          queue.push(player);
          send(player.ws, { t: "queued" });
          return;
        }
        const qi = queue.indexOf(waiting);
        if (qi >= 0) queue.splice(qi, 1);
        if (rooms.size >= MAX_ROOMS) {
          send(player.ws, { t: "error", message: "The server is full of rooms." });
          return;
        }
        const code = makeCode();
        const room = {
          code,
          players: [null, null],
          status: "wait",
          created: Date.now(),
          disconnected: [0, 0],
          inputs: [[], []],
          auth: null,
          snaps: new Map(),
          startTime: 0,
          rematch: [false, false],
        };
        rooms.set(code, room);
        waiting.name = waiting.name || "Ember";
        player.name = player.name || "Marrow";
        seat(room, waiting, 0);
        seat(room, player, 1);
        tellRoom(room);
        begin(room);
        return;
      }
      case "cancel_quick":
        leave(player);
        send(player.ws, { t: "left" });
        return;
      case "input": {
        const room = player.room;
        if (!room || room.status !== "fight" || player.slot < 0) return;
        const clock = Math.max(0, frameIndex(Date.now(), room.startTime));
        const list = Array.isArray(msg.list) ? msg.list.slice(0, 12) : [];
        const fresh = [];
        for (const item of list) {
          if (!item) continue;
          const f = item.f | 0;
          const m = (item.m | 0) & 0x1ff;
          if (f < 0 || f > clock + INPUT_DELAY + 30) continue;
          if (room.inputs[player.slot][f] == null) {
            room.inputs[player.slot][f] = m;
            fresh.push({ f, m });
          }
        }
        const other = room.players[player.slot ^ 1];
        if (other && fresh.length) send(other.ws, { t: "in", p: player.slot, list: fresh });
        return;
      }
      case "hash": {
        const room = player.room;
        if (!room || room.status !== "fight") return;
        const frame = msg.frame | 0;
        const snap = room.snaps.get(frame);
        if (!snap) return;
        if (hashState(snap) !== msg.hash) send(player.ws, syncPayload(room));
        return;
      }
      case "need": {
        const room = player.room;
        if (!room || room.status !== "fight" || !room.auth) return;
        send(player.ws, syncPayload(room));
        return;
      }
      case "rematch": {
        const room = player.room;
        if (!room) return;
        if (room.status !== "fight" && room.status !== "dead") return;
        // Rematch is offered after the sim reaches match_end; the room is still "fight"
        // from the server's point of view until both ask to reset.
        if (player.slot < 0) return;
        room.rematch[player.slot] = true;
        const other = room.players[player.slot ^ 1];
        if (other) send(other.ws, { t: "rematch_ask", from: player.slot });
        if (room.rematch[0] && room.rematch[1] && room.players[0] && room.players[1]) begin(room);
        return;
      }
      case "leave":
        leave(player);
        send(player.ws, { t: "left" });
        return;
      default:
        return;
    }
  }

  function connect(ws, req, ip) {
    let player = null;
    const rateIp = ip;

    ws.on("message", (buf) => {
      if (!allow(rateIp, 1)) return;
      const text = typeof buf === "string" ? buf : buf.toString();
      if (text.length > 8000) return;
      let msg;
      try { msg = JSON.parse(text); } catch { return; }
      if (!msg || typeof msg.t !== "string") return;

      if (!player && msg.t === "resume") {
        const code = String(msg.room || "").toUpperCase();
        const room = rooms.get(code);
        const id = String(msg.playerId || "");
        if (!room || !id) {
          send(ws, { t: "gone", reason: "restarted" });
          return;
        }
        const slot = room.players.findIndex((p) => p && p.id === id);
        if (slot < 0) {
          send(ws, { t: "gone", reason: "restarted" });
          return;
        }
        player = room.players[slot];
        player.ws = ws;
        player.alive = true;
        player.ip = ip;
        player.lastSeen = Date.now();
        room.disconnected[slot] = 0;
        send(ws, {
          t: "resumed",
          you: slot,
          names: namesOf(room),
          startTime: room.startTime,
          delay: INPUT_DELAY,
          room: room.code,
          status: room.status,
        });
        if (room.status === "fight" && room.auth) send(ws, syncPayload(room));
        const other = room.players[slot ^ 1];
        if (other) send(other.ws, { t: "opponent_back" });
        return;
      }

      if (!player) {
        player = {
          ws,
          ip,
          id: String(msg.playerId || "").slice(0, 40),
          name: "",
          room: null,
          slot: -1,
          lastSeen: Date.now(),
          queued: false,
          alive: true,
        };
        if (!player.id) player.id = `p_${Math.random().toString(36).slice(2, 10)}`;
      }
      if (msg.playerId && !player.room) player.id = String(msg.playerId).slice(0, 40);
      handle(player, msg);
    });

    ws.on("close", () => {
      if (player && player.ws === ws) {
        player.alive = false;
        suspend(player);
      }
    });
    ws.on("error", () => {});
  }

  function tick(now) {
    for (const room of rooms.values()) {
      if (room.status === "wait" && now - room.created > 15 * 60 * 1000) {
        for (const p of room.players) if (p) send(p.ws, { t: "error", message: "Room expired." });
        rooms.delete(room.code);
        continue;
      }
      tickRoom(room, now);
    }
    if (bucketsSweep) bucketsSweep(now);
  }

  // Placeholder so a forgotten reference doesn't throw; rate buckets live in index.
  function bucketsSweep() {}

  function close() {
    for (const t of resumeTimers) clearTimeout(t);
    rooms.clear();
    queue.length = 0;
  }

  return { connect, tick, close };
}
