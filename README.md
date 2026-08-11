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
| `chars` | CHARACTERS | ✅     | glyph grid: noise flow, zalgo rain, waveform bars, Lissajous phase scope, edge-aware webcam-ascii |
| `parts` | PARTICLES  | ✅     | stateless GPU curl-noise field + breathing shell, 60k–600k points |
| `flora` | FLORA      | ✅     | murmuration (silence lands the birds), space-colonization tree growth, night sky |
| images  | IMAGES     | 🔜     | early-Flash-style cutout animation                         |

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
- **Setlist**: factory presets are ordered as a concert arc — walk them live
  with ←/→ in the output window or `ctl next` / `ctl prev`:
  PHASE SCOPE → WAVEFORM → RAIN TERMINAL → PHOSPHOR STORM → CAM ASCII →
  MURMURATION → GROWTH → NIGHT → NEBULA DRIFT → SHELL PULSE.

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
