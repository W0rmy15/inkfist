# Dust Rite

A best-of-three stick fight in the browser. Two people on different computers share a room code and play the same match. The server is one Node process: it serves this page and the WebSocket on the same port.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000 . The port is `PORT` if that is set, otherwise 3000. The process binds `0.0.0.0`.

- **Create room** — you get a 4-character code and a link. The other player opens the link or joins with the code.
- **Quick match** — pairs you with the next person waiting.
- **Practice vs CPU** — same match, no server required. Useful while a host is cold-starting.

A round is 60 seconds. First to win two rounds takes the match.

## Controls

| Input | Action |
| --- | --- |
| A / D or arrows | Walk |
| W | Jump. Tap for a short hop, hold for a full jump |
| S | Crouch. Crouch blocks lows and ducks the energy blast |
| Shift | Dash. Back + Shift backdashes. In the air, dash toward the stick; Up+Shift rises to chase a launch |
| J | Light. J, J, J is a string. Forward+J is a kick |
| K | Launcher uppercut. Down+K sweep. Forward+K sends them toward the wall |
| L | Energy blast. Forward+L up close is a throw. Down+L with a full meter is the super |
| K+L | Super, when the meter is full |
| I | Block. Tap it as a hit connects to parry |

After the launcher connects, press W to jump-cancel, then air J / K, then Down+K to spike. The spike bounces them off the ground. A heavy horizontal hit near the edge wall-bounces.

Gamepad: stick or d-pad to move, A light, B heavy, X special, Y or LB block, RB dash.

There is a Controls screen in the lobby with the same list.

## How sync works

Both browsers and the server run the same deterministic sim (`shared/sim.js`). Positions are integer subpixels. The sim does not call `Math.random` or read the clock.

Each player’s input is delayed 3 frames (50ms) and sent to the server, which relays it. Until the remote input arrives the game predicts “they kept doing what they were doing,” then rolls the sim back and replays if that guess was wrong. The server also steps an authoritative copy and sends a hash every 30 frames. A mismatch pulls a state snapshot and heals the client.

Hits, sparks, and sounds are not inside the sim. The client emits them on an event bus after a frame is first simulated, and does not emit them again when that frame is resimulated. The event list and the read-only fighter view (`move` name and frame-within-move) are in [docs/events.md](docs/events.md).

```js
Rite.events.on("hit", (e) => { /* e.playerId, e.x, e.y, e.frame, ... */ });
Rite.getFighterView(0); // { move, frame, hp, meter, x, y, ... }
```

## Debug overlay

Add `?debug=1` to the page URL. It is off otherwise. The overlay shows the sim frame, a short hash of the whole sim state, and for each fighter the state, move, frame within the move, hp, meter, and position. Two browsers on the same frame should show the same hash. `pred yes` means the latest step guessed the other player’s input.

There is no server debug flag and no test endpoint. `npm test` runs the sim and a local two-client sync check; it is not part of `npm start`.

## WebSocket and health

The socket is on the same host and port as the page:

```js
const url = (location.protocol === "https:" ? "wss:" : "ws:") + "//" + location.host + "/ws";
```

The path is `/ws`. Nothing in the client hardcodes a host or port.

`GET /health` returns `200` and JSON:

```json
{"ok":true,"version":"1.0.0"}
```

`version` is the `version` field in `package.json`.

## Environment

| Variable | Local | Production (Render + Cloudflare) |
| --- | --- | --- |
| `PORT` | unset, so the server uses **3000** | set by Render to the port it routes |
| `TRUST_CF` | unset or `0` | **`1`** |

`TRUST_CF=1` is the only time the server reads `CF-Connecting-IP`, and only for the per-IP rate limit. It never trusts `X-Forwarded-For`. Leave `TRUST_CF` unset when you are not behind Cloudflare, or every visitor will share the socket’s address and that is what the limit will use.

No other environment variables change the server.

## Hosting

`render.yaml` is a Render web service: Node runtime, free plan, `npm install`, `npm start`, health check `/health`. It sets `TRUST_CF` to `1`.

Put Cloudflare in front of that URL (proxied, HTTPS). The page will open a `wss://` socket to the same host on `/ws`. Cloudflare’s free proxy supports WebSockets. Render’s free instance sleeps; the first request after idle can take about a minute. The lobby still loads practice mode without a socket. If the process restarts mid-match, the room is gone — matches are only in memory — and the page says the server restarted instead of pretending the round is still there. A dropped socket with the process still up tries to resume for a few seconds.

There is no Dockerfile. Node 20 or newer (`engines` in `package.json`). One process, one port, static files and the WebSocket upgrade together.
