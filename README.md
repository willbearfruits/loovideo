# loovideo

Realtime audio-reactive visual instrument. Built for live performance on an
ASUS ROG Ally (Windows 11) with a Zoom F4 as audio input, developed on Linux —
one codebase, both platforms.

Two windows, one protocol:

- **output** — the picture. three.js/WebGL2 + a post chain (bloom, trails,
  RGB shift, pixelate, grain, vignette). Fullscreen on HDMI, or windowed.
- **control** — a touch-first surface (real multi-touch: two faders at once
  works). Sliders, toggles, an 8-band EQ→modulation matrix, 4 LFOs, scenes.

Everything is a **parameter**; parameters are modulated by **sources** —
8 EQ bands, overall level, onset detection, 4 LFOs — through a route matrix.
The control window, the CLI, and later a phone / MCP server / ESP32 are all
just WebSocket clients of the same hub (`ws://127.0.0.1:7770`).

## Visual systems

| id      | name       | status | what                                                       |
| ------- | ---------- | ------ | ---------------------------------------------------------- |
| `chars` | CHARACTERS | ✅     | glyph grid: noise flow, physarum swarm, de Jong attractor, zalgo rain, waveform bars, Lissajous phase scope, edge-aware webcam-ascii |
| `parts` | PARTICLES  | ✅     | stateless GPU field, 60k–600k points: curl nebula, breathing shell, spiral galaxy, data lattice, curl filaments, torus — with soft/dot/ring/square/cross point shapes, edge sharpness, depth fade, twist, tilt and FOV |
| `flora` | FLORA      | ✅     | murmuration up to 45k birds (silence lands them), an **endlessly growing** grove of up to 7 space-colonization trees, night sky — all three stackable in one frame |
| images  | IMAGES     | 🔜     | early-Flash-style cutout animation                         |

## Layers — everything at once

`system` picks the **base** layer (opaque, its palette stop 0 is the frame's
ground). `mix.chars` / `mix.parts` / `mix.flora` fade the other two in over it,
blended `add` / `screen` / `normal`. They are ordinary modulatable parameters,
so `LEVEL → mix.parts` brings a whole system in with the room, and
`SILENCE → mix.chars` at negative depth takes one away when the room drops out.
Inside FLORA the same idea applies one level down: `+ Sky`, `+ Trees` and
`+ Birds` stack the other inhabitants onto the mode you selected.

Cost is roughly additive — three layers is three systems' work — so the layer
faders are also the first place to look when the frame rate drops.

## The landscape

`Landscape` puts the living things in a place instead of on a blank ground:

- **hills** — three ranges receding to the horizon, plus a sky wash and a
  ploughed field drawn in perspective (rows converging on a vanishing point).
- **farm** — all of that plus a fence line, a barn and silo, a multi-blade
  windmill, chimney smoke, drifting clouds and grass along the ground line.

Every position comes from a seeded hash rather than `Math.random()`, so the
same landscape is there every night and a recalled scene looks like the one you
left. The structures have silence behaviours like everything else: the windmill
coasts to a stop, the clouds stall, the smoke thins.

`Livestock` (0–14) adds grazing quadrupeds, scaled and faded by how far up the
field they stand. They are the slow layer — the flock reacts in milliseconds
and the tree grows over minutes, but the herd works in seconds: heads come up
on a transient, they amble between patches, they bunch when startled, and in
long silence they lie down.

`Flock` picks the species, and they are the same solver with different
constants rather than scripted formations — skeins are what strong alignment
plus weak cohesion plus low noise actually produces:

| kind | what it does |
| --- | --- |
| `starlings` | the murmuration: balanced, noisy, panics as a wave |
| `geese` | migration — few birds, alignment way up, noise near zero, a steady heading, so they string out into skeins |
| `midges` | a low tight column just above the field: tiny perception, strong separation, high jitter, slow |

## Endless growth

The tree no longer finishes. When a crown envelope is used up it seeds the next
one above and around its own canopy (`Crown Reach` sets how far), and `Auto
Frame` scales the grove down about the ground line as the silhouette outgrows
the viewport — so an hour-long set is an hour of growth rather than a tree that
completed in ninety seconds. Growth is still audio-driven: it advances with
level and vigor, spurts on onsets, and stops dead in silence.

The node ceiling from the quality tier (6k/14k/28k/60k across the stand) is a
memory and stroke-cost limit, not a life expectancy. On reaching it the tree
**sheds its oldest tips and recycles their slots**, so growth continues
indefinitely and the canopy erodes inward behind the frontier — a growth/decay
equilibrium rather than a tree that fills up and freezes. Only tips are ever
shed, so nothing is orphaned, and the shed threshold is found by bisection on
the birth stamp: a few counting passes, no sorting, no allocation, because this
runs for as long as the set does.

**`Dieback`** sets the background rate independent of the ceiling, so the tree
is always losing a little of its oldest growth; silence accelerates it, the same
gesture as the falling leaves one level deeper into the structure. **`Succession`**
handles the other end — a tree that genuinely cannot grow any further fades over
six seconds and a sapling takes its ground.

Turn `Endless Growth`, `Dieback` and `Succession` all off for the original
grow-once-and-stop behaviour.

## The concert language

Built for amplified objects and real silences, on the research of raster-noton
(Alva Noto / Ryoji Ikeda / cyclo.), netart (Nick Briz, JODI, Vuk Ćosić), and
the murmuration literature (STARFLAG / StarDisplay):

- **Silence is a modulation source.** Sustained quiet ramps `SILENCE` 0→1 over
  ~5s; sound snaps it back. Route it to anything. Systems also respond
  natively: birds descend and perch one by one, the tree stops growing and
  sheds leaves, the flow field freezes toward a ghost, the scope collapses to
  a single breathing dot, the wave flatlines.
- **Onsets are events, not decoration.** Route `ONSET → Flash` for full-frame
  raster-noton punctuation. A strobe limiter in the render path caps
  full-field flashes at 3/second (WCAG 2.3.1) no matter how fast the object
  rattles — the material can't accidentally strobe the room.
- **Signal identity.** `scope` mode plots left vs right channel (cyclo.-style
  phase figures — each object draws its own signature); `wave` mode draws the
  raw waveform as glyph bars. If an oscilloscope would disagree, it's wrong.
- **noto / ink palettes.** Black-white-red discipline, or ink on paper (light
  backgrounds handled across all systems; bloom auto-disabled on paper).
- **characterglitch lineage.** The `physarum` and `attractor` modes and the
  `organism` charset (dust → braille → thread → weave → organic nodes) are
  ported from the author's character-only browser pieces
  ([characterglitch](https://willbearfruits.github.io/characterglitch/)),
  rewired so the music is the metabolism: level drives the swarm, bass feeds
  the trails, onsets jump to new figures, silence starves the organism.
- **Scene fade.** Any preset load or system switch freeze-frames the outgoing
  scene and dissolves it over the incoming one — `Scene Fade` in MIX, 0 for
  hard cuts, up to 8s.
- **Setlist**: factory presets are ordered as a concert arc — walk them live
  with ←/→ in the output window or `ctl next` / `ctl prev`:
  PHASE SCOPE → WAVEFORM → RAIN TERMINAL → PHOSPHOR STORM → MYCELIUM →
  DE JONG → CAM ASCII → MURMURATION → GROWTH → NIGHT → NEBULA DRIFT →
  SHELL PULSE → GROVE → SKY GARDEN → SPIRAL ARMS → DATA LATTICE →
  FILAMENTS → ALL AT ONCE. The second half is the dense end of the arc:
  endless groves, stacked systems, and the 3D modes.

## Dev

```sh
npm install
npm run dev          # launches both windows with HMR
npm run typecheck
```

Keys in the output window: `F` fullscreen · `H` HUD · `1`/`2`/`3` switch
system · `←`/`→` walk the preset setlist · `Esc` exit fullscreen. No audio
interface handy? AUDIO → **Demo Drive** generates fake bands — including
periodic quiet passages so the silence narratives can be rehearsed.

## CLI

```sh
npm run ctl -- state
npm run ctl -- set fx.bloom 0.8
npm run ctl -- system parts
npm run ctl -- preset "NEBULA DRIFT"
npm run ctl -- watch
```

App flags: `--fullscreen --display=1 --preset=NAME --quality=low|medium|high|ultra
--no-audio --ws-port=7770 --ws-host=0.0.0.0` (that last one opens the hub to
the network for phone/ESP32 control — trusted networks only).

## Zoom F4 setup

MENU → USB → Audio Interface → **Stereo Mix** — class-compliant on Windows
*and* Linux, no driver, 2ch 44.1/48k. The F4's own mixer rides the six inputs
into that stereo feed, which is the better performance surface anyway.
Multitrack (6-in) mode needs Zoom's ASIO driver on Windows — not needed here.
The F4 can't run on USB bus power: AA batteries or 9–16V DC at gigs.

## ROG Ally notes

- Original Ally: one USB-C — you need a dock for HDMI + the F4 at once
  (ASUS Charger Dock / JSAUX etc.). Ally X: two ports, no dock needed.
- Plug in / set Turbo when performing docked; battery mode throttles the GPU.
- The 7" screen is a normal 10-point Windows touch digitizer — the control
  window gets full multi-touch.
- Start with `--quality=medium`, raise until frames drop.
- Sharpness, cheapest first: `fx.sharpen` (one pass, four taps) → render scale
  → **Anti-aliasing** in SETUP (MSAA 2×/4×, off by default because it
  multiplies fragment cost — raise it until the frame rate moves, then back off
  a step). Bloom works against all three; on the noto/ink palettes keep it low.

## Building

```sh
npm run package:linux   # AppImage in release/
npm run package:win     # NSIS installer + portable exe (cross-built from Linux)
```

Windows packages build from Linux (electron-builder). Test the result in the
tiny11 VM, run it for real on the Ally.

## Architecture

```
src/shared/     params (the spine), protocol, mod math, palettes, presets
src/main/       Electron main: windows, ParamStore (persist), WS Hub, CLI
src/renderer/
  output/       engine (three + post chain), audio analysis, systems/
  control/      React touch UI (net store → panels → components)
scripts/ctl.mjs WebSocket CLI
```

State lives in the main process, persists to `userData/state.json`, presets to
`userData/presets/*.json`. Scenes save everything except device choices and
quality (those are rig config).

## Roadmap

- images system (early-Flash cutout animation) · automation recorder
- more netart modes: "View Source" (hidden schematic resolving in silence),
  "Typist" (onsets type glyphs one by one), "Codec Rot" (glyph datamoshing)
- MCP server (thin Node bridge over the same WS protocol)
- ESP32 companion controller (WS or OSC-over-UDP)
- WebGPU/TSL renderer upgrade once Linux support settles
