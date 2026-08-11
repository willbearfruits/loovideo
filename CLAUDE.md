# CLAUDE.md — loovideo

Realtime audio-reactive visual instrument for an **experimental concert
amplifying objects** (contact mics → Zoom F4 → this app). Sparse,
transient-rich material with real silences. Performance machine is an **ASUS
ROG Ally (Windows 11)**; development happens on Linux or on the Ally itself —
same commands both places.

## Commands

```sh
npm install          # first time. If deps conflict: vite must stay ^7 and
                     # @vitejs/plugin-react ^5 (electron-vite 5 rejects vite 8)
npm run dev          # both windows, HMR
npm run typecheck    # tsc over web + node configs — keep green
npm run build        # electron-vite production build into out/
npm run package:win  # NSIS installer + portable exe (works FROM Linux too)
npm run ctl -- ...   # CLI client, e.g.: state · set fx.bloom 0.8 · preset NIGHT
                     #   · next / prev · watch · fullscreen on · display 1
```

There are no tests; verification = typecheck green + launch + eyes on the
output. **Demo Drive** (AUDIO tab, or `ctl set audio.demo true` with
`audio.enabled false`) generates fake bands *including periodic quiet
passages* so silence behaviors can be rehearsed with no interface attached.

## Architecture (read this before touching anything)

One Electron app, two windows, one protocol:

- `src/main/` — windows, `ParamStore` (state owner, persists to userData),
  WebSocket **Hub** on `ws://127.0.0.1:7770`. Every client (control window,
  output window, CLI, future phone/MCP/ESP32) speaks the same JSON protocol
  (`src/shared/protocol.ts`) to the Hub; the Hub mutates the store and echoes.
- `src/shared/params.ts` — **the spine**. Every knob is a declared param.
  Adding a param here is ALL that's needed: the control UI auto-renders from
  the defs, presets/persistence/validation follow. Never invent a side-channel
  for a new setting.
- `src/renderer/output/` — engine (three.js WebGL2 + post chain), audio
  analysis (`audio.ts`: 8 log bands, onset via spectral flux, **silence
  detector**, stereo waveforms), systems in `systems/{characters,particles,flora}/`.
- `src/renderer/control/` — React touch UI. Custom pointer-event controls
  (real multi-touch). `net.ts` is the store; panels read `PARAMS` defs.
- Modulation: routes `{source, target, depth}` where source ∈ 8 EQ bands,
  `level`, `onset`, `silence`, 4 LFOs. Resolved per-frame in
  `shared/mod.ts::computeEffective` — systems read effective values via
  `Params` (`p.num/str/bool`), never raw state.

Systems implement `VisualSystem` (`systems/types.ts`). chars and flora draw on
a 2D canvas textured onto a quad; particles is a stateless vertex-shader field.

## The aesthetic contract (researched, deliberate — don't regress it)

Built on raster-noton (Alva Noto, Ryoji Ikeda, cyclo.), netart (Nick Briz,
JODI, Vuk Ćosić), and the murmuration literature (STARFLAG/StarDisplay):

1. **The strobe limiter in `engine.ts` (max 3 full-field flashes per rolling
   second, WCAG 2.3.1) must never be removed or raised.** Audio-triggered
   flashes from a rattling contact mic would otherwise strobe the audience.
2. **Silence is content.** `silence` ramps 0→1 over ~5s of quiet. Each system
   has a designed null state (birds land, tree stops/sheds, scope collapses to
   a dot, wave flatlines). New modes must define what nothing looks like.
3. **Stillness discipline**: when audio is active, idle animation is
   suppressed (see `audio.active` gating in chars flow). Motion means sound.
4. **Grid discipline** in chars: glyphs live on the cell grid; leaving it
   (zalgo overflow) is a rare audio-triggered event.
5. **Deterministic glitch**: sparkle/corruption uses `hashInt(cell, time-step)`,
   not `Math.random()` — same input, same picture, every night (rehearsable).
6. **Palettes are 5-stop ramps** (`shared/palettes.ts`); `noto` reserves red
   for the top stop only; `ink` is light-background — all systems must respect
   `isPaper()` (bg = stop 0; engine disables bloom on paper).
7. Factory presets (`shared/factoryPresets.ts`) are ordered as the concert
   setlist; ←/→ in the output window walks them. Keep the order intentional.

## On the ROG Ally

- Output goes fullscreen on HDMI: `--fullscreen --display=1` (or SETUP tab /
  `F` key). Control window stays on the touchscreen — full 10-point
  multi-touch works (it's Chromium; two faders at once is expected to work).
- **Zoom F4**: MENU → USB → Audio Interface → **Stereo Mix** — class-compliant
  on Windows, no driver. Multitrack mode would need Zoom's ASIO driver — the
  app doesn't use it. The F4 cannot bus-power: AA batteries or 9–16V DC.
- Original Ally has one USB-C → a dock is required for HDMI + F4 together.
  Set Armoury Crate to Turbo when docked; battery mode throttles the GPU hard.
- Start point for quality on the Ally: `--quality=high`, renderScale 1.0 at
  1080p output; drop to medium if a preset dips below 60.

## Current status / roadmap

Working: chars (flow, physarum swarm, de Jong attractor, zalgo rain, waveform
bars, Lissajous phase scope, edge-aware webcam ascii), particles (curl nebula,
shell), flora (murmuration with landing narrative, space-colonization tree,
night sky), 13 factory presets as a setlist, scene crossfade (freeze-frame
dissolve on preset/system change), quality tiers, CLI.

**Provenance**: `physarum`/`attractor` modes + the `organism` charset tiers are
ports from the owner's own character-art practice — source pieces live in
`~/Projects/characterglitch/` (physarum_zalgo.html, dejong_organism.html; live
at willbearfruits.github.io/characterglitch) and the wider practice in
`~/Projects/characterworld/`, `zalgo_ascii_studio`, `text-glitch-tool` (on the
Linux box). When extending character modes, mine those first — keep the tier
progression dust→braille→thread→weave→organic intact.

Next (agreed): images system (early-Flash cutout animation); netart modes —
"View Source" (hidden glyph schematic that resolves in silence), "Typist"
(each onset types one glyph, no undo), "Codec Rot" (glyph-domain datamoshing);
automation recorder; MCP server as a thin Node bridge over the WS protocol;
ESP32 companion controller; WebGPU/TSL upgrade later.

## Gotchas

- electron-vite 5 requires `vite@^7` (not 8) and `@vitejs/plugin-react@^5`.
- Closing either window quits the whole app (by design — it's an instrument).
- Scenes (presets) exclude device choices and quality — those are rig config.
- The space-colonization tree needs its trunk bootstrap (in `tree.ts::reset`);
  without it growth stalls at the root. Don't "simplify" it away.
- On Linux dev sandboxes without GPU access Electron falls back to SwiftShader
  — fps numbers there are meaningless, judge on real hardware.
