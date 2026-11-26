# Basalt Horizon — Volcanic airlift over the Ember Isles

[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/yawmn/best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/yawmn/best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057)

An entry for the [Make.fun bounty "Make the best flight game"](https://make.fun/bounty/best-flight-game-20261126-0057) (best-flight-game-20261126-0057).

A 3D flight game written from scratch in raw WebGL — own shaders, own math,
own renderer, no engine, no library, no network. A sunset archipelago of
volcanic islands, three runways, golden rings, and a little bush plane that
actually has to be flown: throttle, bank, pitch, stall, fuel, hull, and an
11-knot crosswind that never stops shoving you sideways.

## How to play

Serve the game and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

Pick a mission on the title screen (click a card, or press `1` / `2` / `3`),
then press `Enter` to fly.

| Key | Action |
| --- | --- |
| `Shift` / `Ctrl` (or `E` / `Q`) | Throttle up / down |
| `ArrowUp` / `W` | Climb |
| `ArrowDown` / `S` | Descend |
| `ArrowLeft` / `ArrowRight` (or `A` / `D`) | Bank left / right — banking turns the nose |
| `C` | Chase / cockpit camera |
| `P` | Pause |
| `M` | Mute |
| `R` | Restart the mission |
| `T` | Back to the title screen |

## The three missions

- **Caldera Slalom** — thread 6 golden rings around the volcanic peak.
  Fast, clean lines pay a time bonus.
- **Low-Deck Run** — stay under MAX ALT 80 through 4 low strait gates,
  then put her down on North Isle.
- **Crosswind Landing** — fly 5 courier rings, then land on the short cliff
  strip at East Isle in an 11 kt crosswind. Watch the PAPI: 2 red 2 white
  is on the glide path.

## What the HUD tells you

Compass tape with heading, attitude indicator, airspeed / altitude /
vertical speed / throttle, fuel with burn rate, hull integrity, wind, and
the mission objective. Below 24 m/s the wing quits and the plane sinks —
keep the speed up, keep the fuel for the landing, and mind the hull: a hard
arrival hurts, and a crash ends the sortie.

## The game

- `game/index.html` — the page: two canvases (WebGL + 2D HUD overlay).
- `game/src/config.js` — palette, sunset, wind, runways, ring courses, scoring.
- `game/src/math3.js` — vectors, matrices, seeded RNG.
- `game/src/noise.js` — value-noise heightmap, runway flattening, terrain colour.
- `game/src/gl.js` — WebGL setup, shaders, mesh builder.
- `game/src/sky.js` — sky dome, sun, drifting clouds.
- `game/src/terrain.js` — islands, sea, runways with PAPI lamps, forest, ember glow.
- `game/src/aircraft.js` — the plane, built from primitives: nav lights,
  strobe, engine glow, spinning prop.
- `game/src/rings.js` — golden ring gates, next ring pulses gold.
- `game/src/particles.js` — exhaust, wingtip vortices, ring bursts, crash smoke.
- `game/src/physics.js` — the flight model: throttle, bank, pitch, stall,
  crosswind, fuel, hull, landing and crash.
- `game/src/missions.js` — the three sorties and their rules.
- `game/src/hud.js` — compass, attitude, instruments, fuel/hull/wind, messages.
- `game/src/audio.js` — procedural WebAudio: engine, wind, ring, landing, crash.
- `game/src/input.js` — keyboard state and mouse clicks.
- `game/src/shots.js` — deterministic staging for the screenshots.
- `game/src/main.js` — boot, game loop, cameras, screens.

## Screenshots

`1-ring.jpg` — chase view through a golden ring, runway below.
`2-landing.jpg` — final approach to East Isle, PAPI 2 red 2 white.
`3-cockpit.jpg` — cockpit view, ring and sun ahead.
`4-title.jpg` — title screen, three missions, plane parked on Home Field.

## Hand-in

`main.ts` copies `game/` and `screenshots/` to `/output` (or
`MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored make.fun
library. Run it twice and the two dossiers are byte-identical.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
