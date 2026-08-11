// System 1 — CHARACTERS. Everything on screen is a typed glyph: a flowing
// noise field, zalgo terminal rain, or the webcam re-drawn as ascii. Drawn on
// a 2D canvas, textured onto a fullscreen quad, graded by the global FX chain.

import * as THREE from 'three'
import { createNoise3D } from 'simplex-noise'
import { PALETTES } from '../../../../shared/palettes'
import type { AudioFrame } from '../../audio'
import { Params, applyBlend, type LayerBlend, type SystemCtx, type VisualSystem } from '../types'
import {
  buildAtlas,
  buildEdgeAtlas,
  zalgoMarks,
  GLYPH_FONT,
  ORGANISM_RANGES,
  type Atlas
} from './glyphs'

interface Drop {
  col: number
  y: number
  speed: number
  len: number
  seed: number
}

const MAX_ZALGO_PER_FRAME = 180

export class CharactersSystem implements VisualSystem {
  readonly id = 'chars' as const
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  readonly bg = new THREE.Color(0x000000)

  private ctx!: SystemCtx
  private canvas = document.createElement('canvas')
  // alpha:true so the grid can be stacked over another system as a layer
  private c2d = this.canvas.getContext('2d', { alpha: true })!
  private texture = new THREE.CanvasTexture(this.canvas)
  private material: THREE.MeshBasicMaterial
  private overlay = false

  private atlas: Atlas | null = null
  private edgeAtlas: Atlas | null = null
  private noise = createNoise3D()
  private noise2 = createNoise3D()
  private flowT = 0
  private scopeHits = new Float32Array(0)

  // physarum (ported from characterglitch/physarum_zalgo.html)
  private phX = new Float32Array(0)
  private phY = new Float32Array(0)
  private phH = new Float32Array(0)
  private pher = new Float32Array(0)
  private pherBuf = new Float32Array(0)
  private phCarry = 0
  private phOnsetPrev = 0

  // de Jong attractor (ported from characterglitch/dejong_organism.html)
  private atGrid = new Float32Array(0)
  private atT = 7.3
  private atOnsetPrev = 0

  private cols = 0
  private rows = 0
  private cell = 16
  private viewW = 1920
  private viewH = 1080

  private drops: Drop[] = []
  private camCanvas = document.createElement('canvas')
  private camCtx = this.camCanvas.getContext('2d', { willReadFrequently: true })!
  private active = false
  /** chars.idle, cached per frame: the floor under the audio-active gating */
  private idle = 0
  /** chars.drive, cached per frame: gain on the level/onset term */
  private drive = 1

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.scene.add(quad)
  }

  setOverlay(on: boolean, opacity: number, blend: LayerBlend): void {
    this.overlay = on
    this.material.opacity = on ? opacity : 1
    applyBlend(this.material, on ? blend : 'normal')
    this.material.depthTest = false
    this.material.depthWrite = !on
  }

  init(ctx: SystemCtx): void {
    this.ctx = ctx
  }

  resize(w: number, h: number): void {
    this.viewW = w
    this.viewH = h
  }

  setActive(on: boolean): void {
    this.active = on
    if (!on) this.ctx.webcam.ensure(false)
  }

  dispose(): void {
    this.texture.dispose()
    this.material.dispose()
  }

  private layout(density: number, palette: string, charset: string): void {
    const q = this.ctx.quality()
    // density 0..1 → 42..maxGridCols columns
    const targetCols = Math.round(42 + density * (q.maxGridCols - 42))
    const cell = Math.max(6, Math.floor(this.viewW / targetCols))
    const cols = Math.floor(this.viewW / cell)
    const rows = Math.floor(this.viewH / cell)
    if (cols !== this.cols || rows !== this.rows || cell !== this.cell) {
      this.cols = cols
      this.rows = rows
      this.cell = cell
      this.canvas.width = cols * cell
      this.canvas.height = rows * cell
      this.drops = []
    }
    const stops = PALETTES[palette] ?? PALETTES.phosphor
    const key = `${charset}|${stops.join()}|${cell}`
    if (!this.atlas || this.atlas.key !== key) {
      this.atlas = buildAtlas(charset, stops, cell)
      this.edgeAtlas = buildEdgeAtlas(stops, cell)
      this.c2d.font = `${Math.floor(cell * 0.95)}px ${GLYPH_FONT}`
      this.c2d.textAlign = 'center'
      this.c2d.textBaseline = 'middle'
    }
  }

  update(dt: number, time: number, p: Params, audio: AudioFrame): void {
    if (!this.active) return
    const mode = p.str('chars.mode')
    this.idle = p.num('chars.idle')
    this.drive = p.num('chars.drive')
    this.ctx.webcam.ensure(mode === 'cam')
    // the organism modes use their own tiered charset — that progression IS the piece
    const charset =
      mode === 'physarum' || mode === 'attractor' ? 'organism' : p.str('chars.charset')
    this.layout(p.num('chars.density'), p.str('chars.palette'), charset)
    if (!this.atlas) return

    const g = this.c2d
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor
    this.bg.set(stops[0]).convertSRGBToLinear()
    g.globalAlpha = 1
    if (this.overlay) {
      g.clearRect(0, 0, this.canvas.width, this.canvas.height)
    } else {
      g.fillStyle = stops[0]
      g.fillRect(0, 0, this.canvas.width, this.canvas.height)
    }

    switch (mode) {
      case 'rain':
        this.drawRain(g, dt, p, audio)
        break
      case 'wave':
        this.drawWave(g, time, p, audio)
        break
      case 'scope':
        this.drawScope(g, time, p, audio)
        break
      case 'cam':
        this.drawCam(g, time, p, audio)
        break
      case 'physarum':
        this.drawPhysarum(g, dt, time, p, audio)
        break
      case 'attractor':
        this.drawAttractor(g, dt, time, p, audio)
        break
      default:
        this.drawFlow(g, dt, time, p, audio)
    }
    this.texture.needsUpdate = true
  }

  /** density 0..1 → glyph index inside the organism tier ramp (seeded pick). */
  private tierGlyph(v: number, seed: number): number {
    const t = v < 0.1 ? 0 : v < 0.32 ? 1 : v < 0.56 ? 2 : v < 0.8 ? 3 : 4
    const [lo, hi] = ORGANISM_RANGES[t]
    return lo + (hashInt(seed) % (hi - lo))
  }

  // ---- mode: physarum ------------------------------------------------------
  // Ported from characterglitch/physarum_zalgo.html: agents sense the
  // pheromone field left/center/right, turn toward the strongest trail,
  // deposit as they move; the field diffuses and decays. Audio drives it:
  // level is metabolic rate, bass feeds the deposit, onsets scramble headings,
  // and silence starves the network back to dust.

  private drawPhysarum(
    g: CanvasRenderingContext2D,
    dt: number,
    time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const size = cols * rows
    const N = Math.max(1200, Math.min(7000, Math.round(size * 0.3)))

    if (this.pher.length !== size || this.phX.length !== N) {
      this.pher = new Float32Array(size)
      this.pherBuf = new Float32Array(size)
      this.phX = new Float32Array(N)
      this.phY = new Float32Array(N)
      this.phH = new Float32Array(N)
      // uniform spawn: the network condenses out of scattered dust and fills
      // the whole frame (the original's ring spawn collapses into a honeypot
      // at concert grid sizes)
      for (let i = 0; i < N; i++) {
        this.phX[i] = Math.random() * cols
        this.phY[i] = Math.random() * rows
        this.phH[i] = Math.random() * Math.PI * 2
      }
    }

    const bass = (audio.bands[0] + audio.bands[1]) / 2
    const metab = audio.active
      ? Math.max((0.35 + audio.level * 1.4) * this.drive, this.idle)
      : 1
    const SENSE_DIST = 4 + p.num('chars.warp') * 5
    const SENSE_ANGLE = 0.6
    const TURN = 0.45
    const DEPOSIT = 0.8 * (0.55 + bass * 0.9) * (1 - audio.silence * 0.85)
    const DECAY = 0.965
    const DIFFUSE = 0.12

    // onset: a fraction of the swarm loses its way (heading scramble)
    if (audio.onset > 0.85 && this.phOnsetPrev <= 0.85) {
      const frac = p.num('chars.sparkle') * 0.5
      for (let i = 0; i < N; i++) {
        if ((hashInt(i * 977 ^ (time * 1000) | 0) & 255) / 256 < frac) {
          this.phH[i] += (Math.random() - 0.5) * 3.2
        }
      }
    }
    this.phOnsetPrev = audio.onset

    const sense = (x: number, y: number, heading: number, offset: number): number => {
      const sx = Math.floor(x + Math.cos(heading + offset) * SENSE_DIST)
      const sy = Math.floor(y + Math.sin(heading + offset) * SENSE_DIST)
      if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) return 0
      return this.pher[sy * cols + sx]
    }

    // fixed-timestep agent steps, rate driven by the music
    this.phCarry += dt * 60 * metab * Math.max(0.05, p.num('chars.flow')) * (1 - audio.silence * 0.92)
    let steps = Math.min(3, Math.floor(this.phCarry))
    this.phCarry -= steps
    while (steps-- > 0) {
      for (let i = 0; i < N; i++) {
        const sL = sense(this.phX[i], this.phY[i], this.phH[i], -SENSE_ANGLE)
        const sC = sense(this.phX[i], this.phY[i], this.phH[i], 0)
        const sR = sense(this.phX[i], this.phY[i], this.phH[i], SENSE_ANGLE)
        if (sC > 9) this.phH[i] += (Math.random() - 0.5) * 2.4 // overcrowded — leave
        else if (sC >= sL && sC >= sR) this.phH[i] += (Math.random() - 0.5) * 0.1
        else if (sL > sR) this.phH[i] -= TURN + Math.random() * 0.1
        else if (sR > sL) this.phH[i] += TURN + Math.random() * 0.1
        else this.phH[i] += (Math.random() - 0.5) * TURN * 2

        this.phX[i] += Math.cos(this.phH[i])
        this.phY[i] += Math.sin(this.phH[i])
        if (this.phX[i] < 0) this.phX[i] += cols
        if (this.phX[i] >= cols) this.phX[i] -= cols
        if (this.phY[i] < 0) this.phY[i] += rows
        if (this.phY[i] >= rows) this.phY[i] -= rows
        const gc = Math.floor(this.phX[i])
        const gr = Math.floor(this.phY[i])
        const di = gr * cols + gc
        this.pher[di] = Math.min(12, this.pher[di] + DEPOSIT)
      }
    }

    // diffuse + decay (3×3, as the original)
    const pher = this.pher
    const buf = this.pherBuf
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        let sum = pher[idx] * (1 - DIFFUSE)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            const nr = r + dy
            const nc = c + dx
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols)
              sum += pher[nr * cols + nc] * (DIFFUSE / 8)
          }
        }
        buf[idx] = sum * DECAY
      }
    }
    this.pher = buf
    this.pherBuf = pher

    // render through the organism tiers
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor
    const contrastExp = Math.pow(2.2, 1 - p.num('chars.contrast'))
    const zalgo = p.num('chars.zalgo')
    let zalgoBudget = Math.floor(zalgo * MAX_ZALGO_PER_FRAME * 0.5)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c
        let v = Math.min(1, this.pher[idx] / 6)
        if (v < 0.03) continue
        v = Math.pow(v, contrastExp)
        const glyph = this.tierGlyph(v, idx * 31 + ((v * 8) | 0))
        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.3 + 0.7 * v
        g.drawImage(a.canvas, glyph * cell, row * cell, cell, cell, c * cell, r * cell, cell, cell)
        if (v > 0.8 && zalgoBudget > 0 && Math.random() < zalgo * 0.25) {
          zalgoBudget--
          g.globalAlpha = 0.85
          g.fillStyle = stops[stops.length - 1]
          g.fillText(zalgoMarks(zalgo, Math.random), c * cell + cell / 2, r * cell + cell * 0.56)
        }
      }
    }
    g.globalAlpha = 1
  }

  // ---- mode: attractor -----------------------------------------------------
  // Ported from characterglitch/dejong_organism.html: the de Jong map
  //   x' = sin(a·y) − cos(b·x) · y' = sin(c·x) − cos(d·y)
  // accumulated into a decaying density grid. The figure morphs while sound
  // plays (bass and mids bend a and b), every onset jumps to a new figure —
  // one event, one figure — and silence freezes the map so the cloud
  // dissolves back to dust.

  private drawAttractor(
    g: CanvasRenderingContext2D,
    dt: number,
    _time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const size = cols * rows
    if (this.atGrid.length !== size) this.atGrid = new Float32Array(size)

    const bass = (audio.bands[0] + audio.bands[1]) / 2
    const mid = (audio.bands[3] + audio.bands[4]) / 2
    const warp = p.num('chars.warp')

    // morph clock: runs with the music, freezes in silence
    const morph = audio.active
      ? Math.max((0.06 + audio.level * 0.45) * this.drive, 0.2 * this.idle)
      : 0.2
    this.atT += dt * morph * Math.max(0.05, p.num('chars.flow'))
    if (audio.onset > 0.85 && this.atOnsetPrev <= 0.85) this.atT += 2 + Math.random() * 6
    this.atOnsetPrev = audio.onset

    const t = this.atT
    const pa = 2.6 * Math.sin(t * 0.9) + 0.8 * Math.cos(t * 0.31) + bass * 1.2 * warp
    const pb = 2.4 * Math.cos(t * 0.73) + 0.6 * Math.sin(t * 0.21) + mid * 1.0 * warp
    const pc = Math.sin(t * 1.7) * 2.5 + Math.cos(t * 0.3) * 0.5
    const pd = Math.cos(t * 1.1) * 2.5 + Math.sin(t * 0.7) * 0.5

    const decay = Math.pow(0.965, dt * 60)
    const grid = this.atGrid
    for (let i = 0; i < size; i++) grid[i] *= decay

    // silence starves the figure — fewer points feed the cloud
    const feed =
      (audio.active ? Math.max((0.35 + audio.level * 0.9) * this.drive, this.idle) : 1) *
      (1 - audio.silence * 0.92)
    const iters = Math.round(size * 1.15 * feed)
    let x = Math.sin(t * 3) * 0.1
    let y = Math.cos(t * 2) * 0.1
    for (let i = 0; i < 50; i++) {
      const nx = Math.sin(pa * y) - Math.cos(pb * x)
      y = Math.sin(pc * x) - Math.cos(pd * y)
      x = nx
    }
    for (let i = 0; i < iters; i++) {
      const nx = Math.sin(pa * y) - Math.cos(pb * x)
      y = Math.sin(pc * x) - Math.cos(pd * y)
      x = nx
      if (x < -2.2 || x > 2.2 || y < -2.2 || y > 2.2) continue
      const gc = ((x + 2.2) / 4.4) * cols | 0
      const gr = ((y + 2.2) / 4.4) * rows | 0
      if (gc < 0 || gc >= cols || gr < 0 || gr >= rows) continue
      grid[gr * cols + gc] += 0.15
    }

    const contrastExp = Math.pow(2.2, 1 - p.num('chars.contrast'))
    const sym = p.str('chars.symmetry')
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sc = c
        let sr = r
        if (sym === 'mirror' || sym === 'quad') sc = Math.min(c, cols - 1 - c)
        if (sym === 'quad') sr = Math.min(r, rows - 1 - r)
        let v = Math.min(1, grid[sr * cols + sc] / 8)
        if (v < 0.03) continue
        v = Math.pow(v, contrastExp)
        const glyph = this.tierGlyph(v, (sr * cols + sc) * 17 + ((v * 8) | 0))
        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.3 + 0.7 * v
        g.drawImage(a.canvas, glyph * cell, row * cell, cell, cell, c * cell, r * cell, cell, cell)
      }
    }
    g.globalAlpha = 1
  }

  // ---- mode: scope ---------------------------------------------------------
  // cyclo.-style phase scope: X = left channel, Y = right channel, quantized
  // to the glyph grid. Mono input draws the 45° correlation diagonal; true
  // silence collapses to a single centered dot. The figure IS the signal.

  private drawScope(
    g: CanvasRenderingContext2D,
    time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor
    if (this.scopeHits.length !== cols * rows) this.scopeHits = new Float32Array(cols * rows)
    const hits = this.scopeHits
    hits.fill(0)

    const L = audio.waveform
    const R = audio.waveformR
    const amp = 0.46 * (0.4 + p.num('chars.contrast') * 0.6) * (0.5 + this.drive * 0.45)
    const cx = cols / 2
    const cy = rows / 2
    let energy = 0
    for (let k = 0; k < L.length; k++) {
      energy += Math.abs(L[k]) + Math.abs(R[k])
      const x = Math.round(cx + L[k] * cols * amp)
      const y = Math.round(cy - R[k] * rows * amp)
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue
      hits[y * cols + x] += 1
    }
    energy /= L.length * 2

    if (energy < 0.006) {
      // the null state: one dot, barely breathing — nothing else
      const v = 0.45 + 0.15 * Math.sin(time * 1.3)
      g.globalAlpha = v
      g.drawImage(
        a.canvas,
        Math.floor(a.glyphCount * 0.75) * cell, 2 * cell, cell, cell,
        Math.floor(cx) * cell, Math.floor(cy) * cell, cell, cell
      )
      g.globalAlpha = 1
      return
    }

    const boost = audio.onset > 0.7 ? 1.6 : 1
    const zalgo = p.num('chars.zalgo')
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const hv = hits[y * cols + x]
        if (hv <= 0) continue
        const v = Math.min(1, (hv / 3) * boost)
        const glyph = Math.min(a.glyphCount - 1, Math.floor(v * a.glyphCount))
        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.4 + 0.6 * v
        g.drawImage(
          a.canvas,
          glyph * cell, row * cell, cell, cell,
          x * cell, y * cell, cell, cell
        )
        if (v > 0.95 && zalgo > 0.05 && Math.random() < zalgo * 0.25) {
          g.globalAlpha = 0.85
          g.fillStyle = stops[stops.length - 1]
          g.fillText(zalgoMarks(zalgo, Math.random), x * cell + cell / 2, y * cell + cell * 0.56)
        }
      }
    }
    g.globalAlpha = 1
  }

  // ---- mode: wave ----------------------------------------------------------
  // The amplified object, made visible: its raw waveform as glyph amplitude
  // bars around a center hairline. Silence reads as a breathing flatline.

  private drawWave(
    g: CanvasRenderingContext2D,
    time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const wf = audio.waveform
    const mid = rows / 2
    // wave/scope read the audio buffer directly, so they never saw the idle
    // gating — but they still need chars.drive, or sparse material barely
    // lifts off the hairline
    const amp =
      rows * 0.42 * (0.35 + p.num('chars.contrast') * 0.65) * (0.5 + this.drive * 0.45)
    const zalgo = p.num('chars.zalgo')
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor

    // center hairline: always present, breathing slightly deeper in silence
    const breathe = 0.22 + audio.silence * 0.1 * (1 + Math.sin(time * 0.8))
    g.globalAlpha = breathe
    for (let x = 0; x < cols; x++) {
      g.drawImage(
        a.canvas,
        1 * cell, 1 * cell, cell, cell,
        x * cell, Math.floor(mid) * cell, cell, cell
      )
    }

    for (let x = 0; x < cols; x++) {
      const s = wf[Math.floor((x / cols) * wf.length)]
      if (Math.abs(s) < 0.012) continue
      const yHead = mid + s * amp
      const y0 = Math.min(mid, yHead)
      const y1 = Math.max(mid, yHead)
      const span = Math.max(1, y1 - y0)
      for (let yy = Math.floor(y0); yy <= Math.floor(y1); yy++) {
        if (yy < 0 || yy >= rows) continue
        const rel = 1 - Math.abs(yy - yHead) / span // 1 at the tip
        const v = 0.3 + 0.7 * rel
        const glyph = Math.min(a.glyphCount - 1, Math.floor(v * a.glyphCount))
        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.35 + 0.65 * v
        g.drawImage(
          a.canvas,
          glyph * cell, row * cell, cell, cell,
          x * cell, yy * cell, cell, cell
        )
      }
      // zalgo fray on strong peaks
      if (zalgo > 0.05 && Math.abs(s) > 0.65 && Math.random() < zalgo * 0.5) {
        g.globalAlpha = 0.9
        g.fillStyle = stops[stops.length - 1]
        g.fillText(
          zalgoMarks(zalgo, Math.random),
          x * cell + cell / 2,
          Math.floor(yHead) * cell + cell * 0.56
        )
      }
    }
    g.globalAlpha = 1
  }

  // ---- mode: flow ----------------------------------------------------------

  private drawFlow(
    g: CanvasRenderingContext2D,
    dt: number,
    time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const warp = p.num('chars.warp')
    const flowRate = p.num('chars.flow')
    const contrastExp = Math.pow(2.2, 1 - p.num('chars.contrast'))
    const sparkle = p.num('chars.sparkle')
    const zalgo = p.num('chars.zalgo')
    const sym = p.str('chars.symmetry')
    const invert = p.bool('chars.invert')
    const treble = (audio.bands[5] + audio.bands[6] + audio.bands[7]) / 3
    const bass = (audio.bands[0] + audio.bands[1]) / 2

    // stillness discipline: when sound drives the show, the field only truly
    // moves when there IS sound; with audio off it flows autonomously
    // chars.idle raises the floor so the field still breathes with no signal;
    // chars.drive is the gain on the dynamics on top of that floor
    const evolve = audio.active
      ? Math.max((0.1 + audio.level * 1.9 + audio.onset * 0.5) * this.drive, this.idle)
      : 1
    this.flowT += dt * evolve * flowRate
    const dim = 1 - audio.silence * 0.55 // sustained quiet fades toward threshold

    const s = 0.055 * (0.5 + warp)
    const t1 = this.flowT * 0.28
    const sparkleP = sparkle * 0.035 * (0.25 + treble * 1.6)
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor
    let zalgoBudget = Math.floor(zalgo * MAX_ZALGO_PER_FRAME)
    const zalgoStyle = stops[stops.length - 1]
    const q = Math.floor(time * 7) // deterministic sparkle clock

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let sx = x
        let sy = y
        if (sym === 'mirror' || sym === 'quad') sx = Math.min(x, cols - 1 - x)
        if (sym === 'quad') sy = Math.min(y, rows - 1 - y)

        const n =
          this.noise(sx * s, sy * s * 1.35, t1) * 0.68 +
          this.noise2(sx * s * 2.3 + 37, sy * s * 3.1, t1 * 1.7 + bass * 2.2) * 0.32
        let v = Math.min(1, Math.max(0, n * 0.5 + 0.5))
        v = Math.pow(v, contrastExp)
        if (invert) v = 1 - v
        // deterministic sparkle: same audio, same cells, every night
        if ((hashInt(x * 73856093 ^ y * 19349663 ^ q) & 1023) / 1024 < sparkleP) v = 1

        // protect the blank space — a bimodal frame reads, a grey field doesn't
        v = (v - 0.16) / 0.84
        if (v <= 0) continue
        v *= dim
        const glyph = Math.min(a.glyphCount - 1, Math.floor(v * a.glyphCount))
        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.35 + 0.65 * v
        g.drawImage(
          a.canvas,
          glyph * cell, row * cell, cell, cell,
          x * cell, y * cell, cell, cell
        )

        if (v > 0.86 && zalgoBudget > 0 && Math.random() < zalgo * 0.3) {
          zalgoBudget--
          g.globalAlpha = 0.85
          g.fillStyle = zalgoStyle
          g.fillText(zalgoMarks(zalgo, Math.random), x * cell + cell / 2, y * cell + cell * 0.56)
        }
      }
    }
    g.globalAlpha = 1
  }

  // ---- mode: rain ----------------------------------------------------------

  private drawRain(
    g: CanvasRenderingContext2D,
    dt: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const flowRate = Math.max(0.05, p.num('chars.flow'))
    const zalgo = p.num('chars.zalgo')
    const sparkle = p.num('chars.sparkle')
    const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor

    // population target breathes with the overall level
    const target = Math.floor(cols * (0.5 + audio.level * 0.9))
    const spawnBurst = audio.onset > 0.8 ? Math.floor(6 + audio.onset * 14) : 0
    for (let i = 0; i < spawnBurst; i++) this.spawnDrop(cols)
    while (this.drops.length < target && Math.random() < 0.4) this.spawnDrop(cols)

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i]
      const band = Math.min(7, Math.floor((d.col / cols) * 8))
      const energy = audio.bands[band]
      d.y += d.speed * (0.35 + energy * 1.9) * flowRate * dt

      const head = Math.floor(d.y)
      if (head - d.len > rows) {
        this.drops.splice(i, 1)
        continue
      }
      for (let k = 0; k < d.len; k++) {
        const yy = head - k
        if (yy < 0 || yy >= rows) continue
        const fade = 1 - k / d.len
        // glyph is stable per cell but flickers near the head
        const flick = k < 2 ? Math.floor(d.y * 7) : 0
        const gi = hashInt(d.seed + yy * 31 + flick) % a.glyphCount
        const bright = k === 0 ? 1 : fade * (0.45 + energy * 0.55)
        const row = Math.min(a.stopCount - 1, Math.floor(bright * a.stopCount))
        g.globalAlpha = 0.25 + 0.75 * bright
        g.drawImage(
          a.canvas,
          Math.max(1, gi) * cell, row * cell, cell, cell,
          d.col * cell, yy * cell, cell, cell
        )
      }
      // zalgo trails hang off the head, deeper when its band is loud
      const stack = zalgo * (0.35 + energy)
      if (stack > 0.12 && head >= 0 && head < rows) {
        g.globalAlpha = 0.9
        g.fillStyle = stops[stops.length - 1]
        g.fillText(
          zalgoMarks(Math.min(1, stack), Math.random),
          d.col * cell + cell / 2,
          head * cell + cell * 0.56
        )
      }
    }

    // sparkle: brief bright glyphs anywhere, driven by treble
    const treble = (audio.bands[6] + audio.bands[7]) / 2
    const n = Math.floor(sparkle * treble * cols * 0.6)
    for (let i = 0; i < n; i++) {
      const x = Math.floor(Math.random() * cols)
      const y = Math.floor(Math.random() * rows)
      g.globalAlpha = 0.5 + Math.random() * 0.5
      g.drawImage(
        a.canvas,
        (a.glyphCount - 1) * cell, (a.stopCount - 1) * cell, cell, cell,
        x * cell, y * cell, cell, cell
      )
    }
    g.globalAlpha = 1
  }

  private spawnDrop(cols: number): void {
    this.drops.push({
      col: Math.floor(Math.random() * cols),
      y: -Math.random() * 6,
      speed: 5 + Math.random() * 11,
      len: 5 + Math.floor(Math.random() * 14),
      seed: Math.floor(Math.random() * 1e9)
    })
  }

  // ---- mode: cam -----------------------------------------------------------

  private drawCam(
    g: CanvasRenderingContext2D,
    time: number,
    p: Params,
    audio: AudioFrame
  ): void {
    const a = this.atlas!
    const { cols, rows, cell } = this
    const cam = this.ctx.webcam
    if (!cam.active || cam.video.readyState < 2) {
      const stops = PALETTES[p.str('chars.palette')] ?? PALETTES.phosphor
      g.globalAlpha = 1
      g.fillStyle = stops[3]
      g.font = `${cell * 2}px ${GLYPH_FONT}`
      g.textAlign = 'center'
      g.fillText('· NO CAMERA ·', this.canvas.width / 2, this.canvas.height / 2)
      g.font = `${Math.floor(cell * 0.95)}px ${GLYPH_FONT}`
      return
    }

    if (this.camCanvas.width !== cols || this.camCanvas.height !== rows) {
      this.camCanvas.width = cols
      this.camCanvas.height = rows
    }
    const cc = this.camCtx
    cc.save()
    cc.scale(-1, 1) // mirror
    cc.drawImage(cam.video, -cols, 0, cols, rows)
    cc.restore()
    const img = cc.getImageData(0, 0, cols, rows).data

    const contrastExp = Math.pow(2.2, 1 - p.num('chars.contrast'))
    const invert = p.bool('chars.invert')
    const sparkle = p.num('chars.sparkle')
    const treble = (audio.bands[5] + audio.bands[6] + audio.bands[7]) / 3
    const sparkleP = sparkle * 0.03 * (0.2 + treble * 1.6)
    const q = Math.floor(time * 7)
    const ea = this.edgeAtlas!

    // luminance field first, so edge detection can look at neighbors
    const lum = new Float32Array(cols * rows)
    for (let i = 0; i < cols * rows; i++) {
      const o = i * 4
      let v = (img[o] * 0.3 + img[o + 1] * 0.59 + img[o + 2] * 0.11) / 255
      v = Math.pow(v, contrastExp)
      lum[i] = invert ? 1 - v : v
    }

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let v = lum[y * cols + x]
        if ((hashInt(x * 73856093 ^ y * 19349663 ^ q) & 1023) / 1024 < sparkleP) v = 1
        if (v < 0.05) continue

        // edge-aware glyph choice: contours get directional strokes,
        // fills get the density ramp — characters are not pixels
        const xl = lum[y * cols + Math.max(0, x - 1)]
        const xr = lum[y * cols + Math.min(cols - 1, x + 1)]
        const yu = lum[Math.max(0, y - 1) * cols + x]
        const yd = lum[Math.min(rows - 1, y + 1) * cols + x]
        const gx = xr - xl
        const gy = yd - yu
        const mag = Math.hypot(gx, gy)

        const row = Math.min(a.stopCount - 1, Math.floor(v * a.stopCount))
        g.globalAlpha = 0.3 + 0.7 * v
        if (mag > 0.28) {
          // edge direction is perpendicular to the gradient
          const ang = Math.atan2(gy, gx) + Math.PI / 2
          const bin = ((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4
          g.drawImage(
            ea.canvas,
            bin * cell, row * cell, cell, cell,
            x * cell, y * cell, cell, cell
          )
        } else {
          const glyph = Math.min(a.glyphCount - 1, Math.floor(v * a.glyphCount))
          g.drawImage(
            a.canvas,
            glyph * cell, row * cell, cell, cell,
            x * cell, y * cell, cell, cell
          )
        }
      }
    }
    g.globalAlpha = 1
  }
}

function hashInt(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = (n + (n << 3)) | 0
  n = n ^ (n >>> 4)
  n = Math.imul(n, 0x27d4eb2d)
  n = n ^ (n >>> 15)
  return n >>> 0
}
