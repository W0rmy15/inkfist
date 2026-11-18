# Fight events

The simulation does not play sounds or spawn particles. After each sim step, the client session emits plain objects on a small bus. Audio, hit sparks, and any later renderer subscribe here and never import the sim's internals.

```js
Rite.events.on("hit", (e) => {
  // e.playerId, e.x, e.y, e.frame, plus the fields for that event
});

const view = Rite.getFighterView(0);
// view.move   — current move name, or the state name when no move is active
// view.frame  — frame within that move (or within the state)
```

`Rite` is on `window` once the page has booted. The same bus is the `events` export from `/js/events.js`.

## When an event fires

The session emits an event once, the first time that sim frame is run forward. Rollback resimulates silently and does not emit again. If prediction was wrong, a spark that already played is not rewound.

If the client has to catch up more than four frames in one turn (a stalled tab, a resume), cosmetic events are skipped. These still fire: `ko`, `round_start`, `round_end`, `match_end`, `super_start`.

## Coordinates

Every event includes:

| field | meaning |
| --- | --- |
| `playerId` | Fighter the event is about. `-1` when it belongs to the round, not a body. |
| `x` | Stage pixels, increasing to the right. `0` is the sim origin, not the screen. |
| `y` | Pixels above the ground. `0` is the floor. |
| `frame` | Sim frame (the input frame index) the event happened on. |

`playerId` is the actor for attacks and the body that was launched, bounced, or KO'd. `hit` and `super_hit` also carry `targetId`.

## Events

Weights are `light`, `medium`, `heavy`, `special`, or `super`.

### `attack_start`

A move begins (including throw and super).

`move`, `weight`. `playerId` is the attacker.

### `hit`

Something connected: a strike, a projectile, a throw slam, or two blasts cancelling (`clash: true`, `damage: 0`).

`move`, `weight`, `damage`, `dirX` (`-1` or `1`), `dirY` (`-1`, `0`, or `1`, positive is up), `blocked`, `parried`, `targetId`.

A blocked hit also emits `block`. A parry also emits `parry` and sets `blocked` and `parried` on the hit.

### `block`

`playerId` is the defender. `move`, `weight`.

### `parry`

`playerId` is the defender. `move`, `weight`.

### `dash`

Ground dash, backdash, or air dash. `dir` is `1` forward or `-1` back, relative to facing.

### `land`

Feet reached the floor.

### `launch`

`playerId` is the fighter who left the ground. `move`, `sourceId` (the attacker, or `-1` for a bounce pop).

### `wall_bounce`

`playerId` is the fighter who bounced off the wall.

### `ground_bounce`

`playerId` is the fighter who bounced off the floor. `move` is usually `"spike"`.

### `throw`

The grab connected (damage comes later as a `hit`). `move`, `targetId`. `playerId` is the thrower.

### `projectile_fire`

An energy blast spawned. `move` is `"blast"`. `x`/`y` are the blast, not the feet.

### `super_charge`

Meter was spent and the super started its windup. `move`.

### `super_start`

The ink-wash section of the super begins. `move`.

### `super_hit`

One hit of the super. `move`, `damage`, `targetId`. A normal `hit` is emitted too.

### `ko`

`playerId` is the fighter who fell. `sourceId` is the winner, or `-1` on a double KO.

### `round_start`

`playerId` is `-1`. `round` is the round number.

### `round_end`

`playerId` is the winner, or `-1` on a draw. Also `winner`, `reason` (`"ko"`, `"time"`, or `"draw"`), `round`, `wins` (a pair of integers).

### `match_end`

`playerId` and `winner` are the match winner. `wins` is the pair.

## Read-only fighter view

`Rite.getFighterView(playerId)` returns a frozen object, or `null` if that slot does not exist.

| field | meaning |
| --- | --- |
| `move` | Active move name, or the state name if no move is playing. |
| `frame` | Frame within that move, or within the state. |
| `state` | State machine name (`idle`, `attack`, `hitstun`, …). |
| `moveName` | The move id, or `""`. |
| `moveFrame`, `stateFrame` | The two clocks separately. |
| `hp`, `meter` | Integers. Health is out of 10000, meter out of 1000. |
| `x`, `y` | Pixels. `y` is up, `0` is the floor. |
| `facing` | `1` or `-1`. |
| `airborne`, `crouch` | Booleans. |
| `hitstop`, `stun` | Frames remaining. |
| `react` | `"light"` / `"heavy"` / … pose hint, or `""`. |

Renderers should use `move` and `frame` for pose selection. The built-in canvas renderer does.
