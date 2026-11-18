import { fighterView, frameIndex } from "../shared/sim.js";
import { events } from "./events.js";
import { attachInput, setMatchActive, setTouch, snapshot } from "./input.js";
import { createLocalSession, createNetSession } from "./session.js";
import { connectNet } from "./net.js";
import { createFx, bindFx } from "./fx.js";
import { createAudio } from "./audio.js";
import { render } from "./render.js";

const DEBUG = new URLSearchParams(location.search).get("debug") === "1";
const presetRoom = (new URLSearchParams(location.search).get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

const $ = (id) => document.getElementById(id);
const canvas = $("view");
const fx = createFx();
bindFx(fx);
const audio = createAudio();
attachInput();

let playerId = sessionStorage.getItem("rite-id");
if (!playerId) {
  playerId = Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem("rite-id", playerId);
}

function touchLayout() {
  $("touch").hidden = !(document.body.classList.contains("fighting") && window.innerWidth < 860);
}

function attract() {
  return createLocalSession({
    bus: events,
    aiFor: [
      { convert: 100, block: 16 },
      { convert: 92, block: 22 },
    ],
  });
}

let mode = "attract";
let session = attract();
let names = ["EMBER", "MARROW"];
let you = -1;
let roomCode = "";
let autoJoined = false;
let rematchSent = false;
let acc = 0;
let last = performance.now();

const net = connectNet({
  status(s) {
    const el = $("status");
    if (s === "online") el.textContent = el.dataset.base || "Server online";
    else if (s === "connecting") el.textContent = "Connecting to server…";
    else el.textContent = "Server offline — practice still works.";
  },
  open() {
    if (mode === "net" && roomCode) {
      net.send({ t: "resume", playerId, room: roomCode });
      return;
    }
    if (presetRoom && !autoJoined) {
      autoJoined = true;
      $("code").value = presetRoom;
      sendJoin(presetRoom);
    }
  },
  close() {
    if (mode === "net") {
      showBanner(
        "Reconnecting",
        "The socket dropped. If the server restarted or woke from a cold start, this match is gone — rooms live only in memory.",
        false,
      );
    }
  },
  message: onNet,
});

fetch("/health")
  .then((r) => r.json())
  .then((body) => {
    const text = body.ok ? `Server online · v${body.version}` : "Server offline — practice still works.";
    $("status").dataset.base = text;
    if (!presetRoom) $("status").textContent = text;
  })
  .catch(() => {
    $("status").textContent = "Server offline — practice still works.";
  });

function nameValue() {
  return $("name").value.replace(/[^a-zA-Z0-9 _'.-]/g, "").trim().slice(0, 14);
}

function showScreen(which) {
  for (const id of ["screen-home", "screen-room", "screen-controls"]) {
    $(id).hidden = id !== which;
  }
  $("panel").hidden = !which;
}

function setFighting(on) {
  document.body.classList.toggle("fighting", on);
  setMatchActive(on);
  fx.menu = !on;
  audio.setLive(on);
  $("dock").hidden = !on;
  touchLayout();
}

function showBanner(title, body, lobbyButton) {
  $("banner-title").textContent = title;
  $("banner-body").textContent = body;
  $("banner-lobby").hidden = !lobbyButton;
  $("banner").hidden = false;
}

function hideBanner() {
  $("banner").hidden = true;
}

function backToLobby() {
  roomCode = "";
  you = -1;
  rematchSent = false;
  session = attract();
  mode = "attract";
  names = ["EMBER", "MARROW"];
  setFighting(false);
  showScreen("screen-home");
  hideBanner();
  $("rematch").hidden = true;
}

function beginMatch(msg) {
  audio.unlock();
  names = (msg.names || []).map((n, i) => n || (i === 0 ? "EMBER" : "MARROW"));
  you = msg.you;
  roomCode = msg.room;
  rematchSent = false;
  session = createNetSession({
    you: msg.you,
    startTime: msg.startTime,
    bus: events,
    send: (m) => net.send(m),
  });
  mode = "net";
  setFighting(true);
  showScreen(null);
  hideBanner();
  $("rematch").hidden = true;
  $("rematch").textContent = "Rematch";
}

function sendJoin(code) {
  const ok = net.send({ t: "join", code, playerId, name: nameValue() });
  if (!ok) $("status").textContent = "Can't reach the server. Practice still works.";
}

function onNet(msg) {
  if (msg.t === "room" && msg.status === "wait") {
    roomCode = msg.code;
    const link = `${location.origin}/?room=${msg.code}`;
    $("room-code").textContent = msg.code;
    $("room-link").value = link;
    const other = msg.names && msg.names[msg.you ^ 1];
    $("room-status").textContent = other ? `${other} is here. Starting…` : "Waiting for an opponent…";
    showScreen("screen-room");
    return;
  }
  if (msg.t === "start" || (msg.t === "resumed" && msg.startTime)) {
    beginMatch(msg);
    return;
  }
  if (msg.t === "queued") {
    $("status").textContent = "Searching for an opponent…";
    return;
  }
  if (msg.t === "error") {
    $("status").textContent = msg.message;
    $("room-status").textContent = msg.message;
    return;
  }
  if (msg.t === "in" && session.kind === "net") {
    session.onInputs(msg.p, msg.list || [], frameIndex(net.serverNow(), session.startTime));
    return;
  }
  if (msg.t === "auth" && session.kind === "net") {
    session.onAuth(msg.frame, msg.hash);
    return;
  }
  if (msg.t === "sync" && session.kind === "net") {
    session.applySync(msg, frameIndex(net.serverNow(), session.startTime));
    hideBanner();
    return;
  }
  if (msg.t === "gone") {
    showBanner(
      "Server restarted",
      "This match was dropped. The server keeps rooms in memory, so a restart or a cold start ends them. Practice mode still runs on this page.",
      true,
    );
    roomCode = "";
    mode = "attract";
    session = attract();
    setFighting(false);
    showScreen("screen-home");
    return;
  }
  if (msg.t === "opponent_dc" && mode === "net") {
    showBanner(
      "Opponent reconnecting",
      "They have a few seconds to rejoin. If the server itself restarted, the match will not come back.",
      false,
    );
    return;
  }
  if (msg.t === "opponent_back") {
    hideBanner();
    return;
  }
  if (msg.t === "opponent_left") {
    showBanner("Opponent left", "The other player is gone, so this match is over.", true);
    mode = "frozen";
    roomCode = "";
    return;
  }
  if (msg.t === "rematch_ask" && mode === "net") {
    $("rematch").hidden = false;
    if (!rematchSent) $("rematch").textContent = "Accept rematch";
  }
}

$("create").onclick = () => {
  audio.unlock();
  const ok = net.send({ t: "create", playerId, name: nameValue() });
  if (!ok) $("status").textContent = "Can't reach the server. Practice still works.";
};

$("quick").onclick = () => {
  audio.unlock();
  const ok = net.send({ t: "quick", playerId, name: nameValue() });
  if (!ok) $("status").textContent = "Can't reach the server. Practice still works.";
  else $("status").textContent = "Searching for an opponent…";
};

$("join-form").onsubmit = (e) => {
  e.preventDefault();
  audio.unlock();
  const code = $("code").value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  if (code.length < 4) {
    $("status").textContent = "Enter the 4-character room code.";
    return;
  }
  sendJoin(code);
};

$("practice").onclick = () => {
  audio.unlock();
  names = [nameValue() || "EMBER", "MARROW"];
  you = 0;
  roomCode = "";
  session = createLocalSession({
    bus: events,
    aiFor: [null, { convert: 68, block: 36 }],
  });
  mode = "local";
  setFighting(true);
  showScreen(null);
  hideBanner();
  $("rematch").hidden = true;
  $("rematch").textContent = "Rematch";
};

$("show-controls").onclick = () => showScreen("screen-controls");
$("controls-back").onclick = () => showScreen("screen-home");

$("copy").onclick = async () => {
  const link = $("room-link").value;
  try {
    await navigator.clipboard.writeText(link);
    $("room-status").textContent = "Link copied.";
  } catch {
    $("room-link").focus();
    $("room-link").select();
    $("room-status").textContent = "Select the link and copy it.";
  }
};

$("room-leave").onclick = () => {
  net.send({ t: "leave", playerId });
  backToLobby();
};

$("leave").onclick = () => {
  if (mode === "net") net.send({ t: "leave", playerId });
  backToLobby();
};

$("mute").onclick = () => {
  audio.unlock();
  const on = audio.toggle();
  $("mute").textContent = on ? "Sound on" : "Sound off";
};

$("rematch").onclick = () => {
  rematchSent = true;
  $("rematch").textContent = "Waiting…";
  if (mode === "net") net.send({ t: "rematch" });
  else if (mode === "local") {
    session = createLocalSession({
      bus: events,
      aiFor: [null, { convert: 68, block: 36 }],
    });
    $("rematch").hidden = true;
    $("rematch").textContent = "Rematch";
    rematchSent = false;
  }
};

$("banner-lobby").onclick = () => backToLobby();

for (const button of $("touch").querySelectorAll("button")) {
  const bit = Number(button.dataset.bit);
  const down = (e) => {
    e.preventDefault();
    setTouch(bit, true);
    button.setPointerCapture?.(e.pointerId);
  };
  const up = (e) => {
    e.preventDefault();
    setTouch(bit, false);
  };
  button.addEventListener("pointerdown", down);
  button.addEventListener("pointerup", up);
  button.addEventListener("pointercancel", up);
  button.addEventListener("pointerleave", (e) => {
    if (e.pressure === 0) setTouch(bit, false);
  });
}

document.body.addEventListener("pointerdown", () => audio.unlock(), { once: true });

function paintDebug(state) {
  const el = $("debug");
  el.hidden = false;
  const lines = [
    `frame ${state.frame}`,
    `hash ${session.hash()}`,
    `pred ${session.predicted ? "yes" : "no"}`,
  ];
  for (const id of [0, 1]) {
    const v = fighterView(state, id);
    lines.push(
      `P${id} ${v.state}${v.moveName ? "/" + v.moveName : ""} f${v.frame} hp ${v.hp} meter ${v.meter} pos ${v.x.toFixed(0)},${v.y.toFixed(0)}`,
    );
  }
  el.textContent = lines.join("\n");
}

function loop(t) {
  const dt = Math.min(100, t - last);
  last = t;
  const mask = snapshot();
  if (mode === "frozen") {
    /* hold the last frame under the banner */
  } else if (mode === "net" && session.kind === "net") {
    const clock = frameIndex(net.serverNow(), session.startTime);
    session.capture(mask, clock);
    session.advance(clock);
  } else if (session) {
    acc += dt;
    if (acc > 120) acc = 120;
    let guard = 0;
    while (acc >= 1000 / 60 && guard++ < 6) {
      acc -= 1000 / 60;
      session.advance(mask);
    }
  }
  const state = session.state;
  fx.update(state);
  render(canvas, state, fx, { names, you });
  if (state.phase === "match_end") $("rematch").hidden = false;
  if (DEBUG) paintDebug(state);
  requestAnimationFrame(loop);
}

window.addEventListener("resize", touchLayout);

window.Rite = {
  events,
  getFighterView(id) {
    const state = session && session.state;
    return state ? fighterView(state, id) : null;
  },
};

requestAnimationFrame(loop);
