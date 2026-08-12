// System 4 — FLORA & FAUNA. Living things with narrative arcs: a murmuration
// that sound keeps airborne and silence brings to ground; trees that grow while
// music plays and shed leaves when it stops; a night sky where onsets throw
// shooting stars. Canvas-drawn, palette-grounded, textured onto a quad.
//
// `flora.mode` names the principal inhabitant, but the add-* toggles stack the
// others into the same frame — a grove growing inside a murmuration under a
// night sky is one scene, not three. Growth is endless (see tree.ts), so the
// auto-frame shrinks the drawing as the canopy outgrows the viewport.

import * as THREE from 'three'
import { PALETTES } from '../../../../shared/palettes'
import type { AudioFrame } from '../../audio'
import { Params, applyBlend, type SystemCtx, type VisualSystem, type LayerBlend } from '../types'
import { Flock, flockCountScale, type FlockDrive, type FlockKind } from './flock'
import { Tree, type TreeDrive, type TreeKind } from './tree'
import { FloraCamera, type CamTarget } from './camera'
import { Stars } from './stars'
import { Scenery, dayCycle, type SceneKind, type SceneryDrive } from './scenery'
import { Fauna, type FaunaDrive } from './fauna'

/** hard perf ceiling on the whole stand; margin colonization may use it all */
const MAX_TREES = 12
/** ceiling for the planted grove + regular sprouting (margins get the rest) */
const CORE_TREES = 7
/** seconds a matured tree takes to fade out before its sapling replaces it */
const SUCCESSION_FADE = 6

export class FloraSystem implements VisualSystem {
  readonly id = 'flora' as const
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  readonly bg = new THREE.Color(0x000000)

  private ctx!: SystemCtx
  private canvas = document.createElement('canvas')
  private c2d = this.canvas.getContext('2d', { alpha: true })!
  private texture = new THREE.CanvasTexture(this.canvas)
  private material: THREE.MeshBasicMaterial

  private flock = new Flock()
  private trees: Tree[] = []
  private treeFade: number[] = []
  private treeScales: number[] = []
  private sproutClock = 0
  private lastRevealW = 0
  private marginFlip = false
  private stars = new Stars()
  private scenery = new Scenery()
  private fauna = new Fauna()
  private lastMode = ''
  private lastTreeKey = ''
  private treeSpec: {
    w: number
    h: number
    density: number
    horizonY: number
    share: number
    kind: TreeKind | 'mixed'
  } | null = null
  private viewW = 1920
  private viewH = 1080
  private active = false
  private overlay = false
  private fitScale = 1
  private cam = new FloraCamera()
  private ffX = new Float32Array(0)
  private ffY = new Float32Array(0)
  private ffP = new Float32Array(0)
  private perchScratch: { x: number; y: number }[] = []

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true })
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material))
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
    if (on) this.lastTreeKey = '' // regrow on each return to the system
  }

  setOverlay(on: boolean, opacity: number, blend: LayerBlend): void {
    this.overlay = on
    this.material.opacity = on ? opacity : 1
    applyBlend(this.material, on ? blend : 'normal')
    this.material.depthTest = false
    this.material.depthWrite = !on
  }

  dispose(): void {
    this.texture.dispose()
    this.material.dispose()
  }

  update(dt: number, time: number, p: Params, audio: AudioFrame): void {
    if (!this.active) return
    const w = Math.min(this.viewW, 1920)
    const h = Math.round((w / this.viewW) * this.viewH)
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.lastTreeKey = ''
    }

    const mode = p.str('flora.mode')
    const stops = PALETTES[p.str('flora.palette')] ?? PALETTES.ink
    this.bg.set(stops[0]).convertSRGBToLinear()
    const density = p.num('flora.density')
    const horizonY = h * p.num('flora.horizon')
    const q = this.ctx.quality()

    const wantStars = mode === 'stars' || p.bool('flora.addStars')
    const wantTree = mode === 'tree' || p.bool('flora.addTree')
    const wantFlock = mode === 'flock' || p.bool('flora.addFlock')

    const drive: FlockDrive & TreeDrive & SceneryDrive & FaunaDrive = {
      energy: p.num('flora.vigor'),
      vigor: p.num('flora.vigor'),
      wind: p.num('flora.wind'),
      scatter: p.num('flora.scatter'),
      bass: (audio.bands[0] + audio.bands[1]) / 2,
      treble: (audio.bands[6] + audio.bands[7]) / 2,
      level: audio.level,
      onset: audio.onset,
      silence: audio.silence,
      horizonY,
      endless: p.bool('flora.endless'),
      reach: p.num('flora.reach'),
      decay: p.num('flora.decay'),
      season: p.num('flora.season'),
      daytime: p.num('flora.daytime'),
      leaves: p.num('flora.leaves'),
      leafSize: p.num('flora.leafSize') || 1,
      birdSize: p.num('flora.birdSize') || 1,
      stroke: p.str('flora.stroke') || 'ink',
      kind: (p.str('flora.flockKind') || 'starlings') as FlockKind
    }
    const scene = (p.str('flora.scene') || 'bare') as SceneKind

    const g = this.c2d
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalAlpha = 1
    if (this.overlay) {
      g.clearRect(0, 0, w, h)
    } else {
      g.fillStyle = stops[0]
      g.fillRect(0, 0, w, h)
    }

    // Night has to reach the whole frame, not just the sky, or day and night
    // are indistinguishable from each other and from the seasons. This is the
    // ground darkening: a wash of stop 0 laid over everything after drawing,
    // strongest at midnight. Applied at the end of update().
    const day = dayCycle(drive.daytime)

    // --- back to front: sky, hills, ground, built structures ---------------
    if (wantStars) {
      this.stars.update(dt, time, w, h, density, stops, drive)
      // scenery skies own the sun/moon arc; stars only bring the moon on bare
      this.stars.draw(g, w, h, time, stops, drive, scene === 'bare')
    }
    this.scenery.drawBack(g, w, h, scene, stops, drive)

    if (scene !== 'bare' && !wantStars) {
      // the field itself (stars already lays a ground silhouette of its own)
      g.globalAlpha = 1
      g.fillStyle = stops[1]
      g.fillRect(0, horizonY, w, h - horizonY)
    }
    if (!wantStars) {
      // ground hairline — the stage the silence narratives land on
      g.globalAlpha = 0.42
      g.strokeStyle = stops[2]
      g.lineWidth = Math.max(1, h / 1080)
      g.beginPath()
      g.moveTo(0, horizonY)
      g.lineTo(w, horizonY)
      g.stroke()
      g.globalAlpha = 1
    }
    this.scenery.drawFront(g, w, h, time, scene, stops, drive)

    // --- the grove ----------------------------------------------------------
    if (wantTree) {
      const nTrees = Math.max(1, Math.min(CORE_TREES, Math.round(p.num('flora.trees'))))
      const kind = (p.str('flora.treeKind') || 'mixed') as TreeKind | 'mixed'
      const key = `${w}x${h}|${density.toFixed(2)}|${horizonY.toFixed(0)}|${nTrees}|${q.treeNodeCap}|${kind}`
      if (key !== this.lastTreeKey) {
        this.lastTreeKey = key
        this.trees = []
        this.treeFade = []
        this.treeScales = []
        this.lastRevealW = 0
        // a grove, not a row of clones: staggered feet, alternating sizes, and
        // the node budget split so the whole stand stays inside the tier
        const share = Math.max(1200, Math.floor(q.treeNodeCap / nTrees))
        this.treeSpec = { w, h, density, horizonY, share, kind }
        for (let i = 0; i < nTrees; i++) {
          const t = new Tree()
          this.plantTree(t, i, nTrees)
          this.trees.push(t)
          this.treeFade.push(0)
        }
      }
      // FELL: momentary. The button sets the flag, we start the sequence on the
      // rising edge and immediately clear it so the control springs back.
      if (p.bool('flora.fell')) {
        this.ctx.setParam('flora.fell', false)
        for (const t of this.trees) t.fell()
      }

      for (const t of this.trees) t.update(dt, time, w, h, drive)

      // Sprouting: sometimes a new tree simply takes root. The clock only
      // advances while music plays (a sprout is a growth event, and growth
      // stops with the room), and the seedling appears on the next strong
      // onset once enough music has passed — so new trees arrive ON a hit,
      // never mid-nothing. Grove cap still applies.
      const sprout = p.num('flora.sprout')
      if (sprout > 0.01 && this.trees.length < CORE_TREES && this.treeSpec) {
        this.sproutClock += dt * sprout * (0.15 + drive.level * 1.6) * (1 - drive.silence)
        if (this.sproutClock > 14 && drive.onset > 0.85) {
          this.sproutClock = 0
          const t = new Tree()
          this.treeScales.push(this.plantSprout(t))
          this.trees.push(t)
          this.treeFade.push(0)
        }
      }

      // a felled tree is replanted where it stood, and grows back from nothing
      for (let i = 0; i < this.trees.length; i++) {
        if (this.trees[i].felled) {
          this.treeFade[i] = 0
          this.plantTree(this.trees[i], i, this.trees.length)
        }
      }

      // Succession: a tree that has hit its node ceiling cannot keep growing,
      // but the *stand* can. The matured tree fades and a sapling takes its
      // ground, so the scene is always growing something — forever, without
      // any single tree needing unbounded memory or stroke cost.
      if (p.bool('flora.succession')) {
        for (let i = 0; i < this.trees.length; i++) {
          if (!this.trees[i].done) continue
          this.treeFade[i] += dt
          if (this.treeFade[i] >= SUCCESSION_FADE) {
            this.treeFade[i] = 0
            this.plantTree(this.trees[i], i, this.trees.length)
          }
        }
      }

      // auto-frame: as the canopy outgrows the viewport, scale the grove down
      // about the ground line so endless growth stays watchable
      const fit = p.num('flora.fit')
      let minX = Infinity
      let maxX = -Infinity
      let minY = Infinity
      for (const t of this.trees) {
        const b = t.bounds()
        if (b.minX < minX) minX = b.minX
        if (b.maxX > maxX) maxX = b.maxX
        if (b.minY < minY) minY = b.minY
      }
      let target = 1
      if (Number.isFinite(minX) && maxX > minX) {
        const spanX = maxX - minX
        const spanY = Math.max(1, horizonY - minY)
        // the lake composition needs the WHOLE tree above the shoreline —
        // crown to trunk — so the mirror has something complete to hold;
        // it also keeps pulling back as the tree grows, no fit fader needed
        const mX = scene === 'lake' ? 0.84 : 0.92
        const mY = scene === 'lake' ? 0.8 : 0.94
        target = Math.min(1, (w * mX) / spanX, (horizonY * mY) / spanY)
      }
      const eff = 1 + (target - 1) * (scene === 'lake' ? 1 : fit)
      // ease toward the target so a growth spurt does not snap the framing
      this.fitScale += (eff - this.fitScale) * Math.min(1, dt * 1.6)
      const cxTree = Number.isFinite(minX) ? (minX + maxX) / 2 : w / 2

      // colonize revealed ground: as the frame pulls back, world beyond the
      // original planting strip comes into view — and the empty margins are
      // an invitation. Each significant reveal lets one volunteer take root
      // out there, so a long zoom-out becomes a widening woodland.
      const visHalf = w / 2 / Math.max(0.05, this.fitScale)
      if (this.lastRevealW === 0) this.lastRevealW = visHalf * 2
      if (
        visHalf * 2 > this.lastRevealW * 1.12 &&
        this.trees.length < MAX_TREES &&
        this.treeSpec &&
        drive.silence < 0.6
      ) {
        const groveHalf = Number.isFinite(minX) ? Math.max(1, (maxX - minX) / 2) : w * 0.1
        const margin = visHalf * 0.85 - groveHalf
        if (margin > w * 0.04) {
          this.lastRevealW = visHalf * 2
          const t = new Tree()
          // alternate sides so the woodland widens symmetrically
          this.marginFlip = !this.marginFlip
          const side = this.marginFlip ? -1 : 1
          const x = cxTree + side * (groveHalf + w * 0.03 + Math.random() * margin)
          this.treeScales.push(this.plantSprout(t, x))
          this.trees.push(t)
          this.treeFade.push(0)
        }
      }

      // the camera sits on top of the auto-frame: same fit, but the story can
      // choose the focus — wide, seed push-in, a slow drift, or one leaf down
      const mode = this.ctx.story.on ? this.ctx.story.cam : 'auto'
      const camT: CamTarget = { fx: cxTree, fy: horizonY, zoom: 1 }
      let anchorY = horizonY
      if (mode === 'drift') {
        camT.fx += this.cam.driftOffset(Math.max(80, (maxX - minX) * 0.5))
        camT.zoom = 1.06
      } else if (mode === 'seed' && this.trees[0]) {
        const o = this.trees[0].origin
        camT.fx = o.x
        camT.fy = o.y - h * 0.04
        camT.zoom = 4
        anchorY = h * 0.6
      } else if (mode === 'leaf') {
        let leaf: { x: number; y: number } | null = null
        for (const t of this.trees) {
          leaf = t.trackFalling()
          if (leaf) break
        }
        if (leaf) {
          camT.fx = leaf.x
          camT.fy = leaf.y
          camT.zoom = 2.6
          anchorY = h * 0.5
        }
      }
      this.cam.update(dt, camT, drive.onset)

      g.save()
      this.cam.apply(g, w / 2, anchorY, this.fitScale)
      // trees get the TRUE on-screen scale (fit × camera zoom) so both the
      // sub-pixel cull and the glow discipline see what the audience sees
      const screenScale = this.fitScale * this.cam.currentZoom
      // atmospheric depth: far (small) trees draw first and paler, near trees
      // last and full — value compression is the primary depth cue in mono
      const drawOrder = this.trees.map((_, i) => i)
      drawOrder.sort((a, b) => (this.treeScales[a] ?? 1) - (this.treeScales[b] ?? 1))
      for (const i of drawOrder) {
        const fade = this.treeFade[i] > 0 ? 1 - this.treeFade[i] / SUCCESSION_FADE : 1
        const s = this.treeScales[i] ?? 1
        const depthMul = 0.55 + 0.45 * Math.min(1, Math.max(0, (s - 0.4) / 0.7))
        this.trees[i].draw(g, w, h, stops, drive, screenScale, Math.max(0, fade) * depthMul)
      }
      this.drawFireflies(g, dt, time, w, h, stops, drive)
      g.restore()

      // roosting: living tree tips become the flock's perches, transformed to
      // the flock's screen space through the same camera
      this.perchScratch.length = 0
      if (wantFlock && this.trees.length > 0 && drive.silence > 0.25) {
        const per = Math.max(6, Math.floor(48 / this.trees.length))
        const world: { x: number; y: number }[] = []
        for (const t of this.trees) t.perchTips(world, world.length + per)
        const Z = this.fitScale * this.cam.currentZoom
        for (const a of world) {
          this.perchScratch.push({
            x: w / 2 + (a.x - this.cam.focusX) * Z,
            y: anchorY + (a.y - this.cam.focusY) * Z
          })
        }
      }
      drive.perches = this.perchScratch.length > 0 ? this.perchScratch : undefined
    }

    // --- livestock: in front of the field, behind nothing (not in the lake) --
    const animals = scene === 'lake' ? 0 : Math.round(p.num('flora.animals'))
    if (animals > 0) {
      this.fauna.resize(animals)
      this.fauna.update(dt, w, h, drive)
      this.fauna.draw(g, w, h, stops, drive)
    }

    // --- the birds ----------------------------------------------------------
    if (wantFlock) {
      // bird count is a screen-area budget so a windowed preview isn't packed
      const area = Math.min(1, (w * h) / (1920 * 1080))
      const want = Math.round(
        (300 + density * (q.flockBase - 300)) *
          (0.4 + 0.6 * area) *
          flockCountScale(drive.kind) *
          Math.max(0.05, p.num('flora.birds') || 1)
      )
      this.flock.resize(Math.max(24, want), w, h)
      this.flock.update(dt, time, w, h, drive)
      this.flock.draw(g, w, h, time, stops, drive)
    }

    // --- the lake: the finished world reflected below the shoreline ----------
    if (scene === 'lake') {
      this.scenery.drawWater(g, this.canvas, w, h, dt, time, stops, drive)
    }

    // night wash over the finished frame — the single strongest cue that the
    // day has turned, and it costs one rect
    if (day.light < 0.98) {
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalAlpha = (1 - day.light) * 0.62
      g.fillStyle = stops[0]
      g.fillRect(0, 0, w, h)
      g.globalAlpha = 1
    }

    this.lastMode = mode
    this.texture.needsUpdate = true
  }

  /** (Re)seed one slot of the grove — used at build time and by succession. */
  /**
   * Fireflies: only in the twilight window, only outside late autumn/winter.
   * Drawn inside the camera transform, so they inhabit the grove.
   */
  private drawFireflies(
    g: CanvasRenderingContext2D,
    dt: number,
    time: number,
    w: number,
    h: number,
    stops: string[],
    drive: FlockDrive & { daytime: number; season: number }
  ): void {
    const day = dayCycle(drive.daytime)
    const dusk = Math.max(0, 1 - Math.abs(day.light - 0.16) / 0.16)
    if (dusk < 0.03 || drive.season > 0.7) return
    const u = h / 1080
    const N = 110
    if (this.ffX.length !== N) {
      this.ffX = new Float32Array(N)
      this.ffY = new Float32Array(N)
      this.ffP = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        this.ffX[i] = Math.random() * w
        this.ffY[i] = drive.horizonY - Math.random() * h * 0.32
        this.ffP[i] = Math.random() * Math.PI * 2
      }
    }
    g.fillStyle = stops[4]
    for (let i = 0; i < N; i++) {
      this.ffX[i] += Math.sin(time * 0.4 + this.ffP[i] * 3) * 14 * u * dt
      this.ffY[i] += Math.cos(time * 0.31 + this.ffP[i] * 2) * 9 * u * dt
      // slow blink, each on its own clock, lifted by treble
      const blink = Math.max(0, Math.sin(time * (1.1 + (i % 7) * 0.23) + this.ffP[i]))
      const a = dusk * Math.pow(blink, 3) * (0.5 + drive.treble * 0.6) * (1 - drive.silence * 0.3)
      if (a < 0.02) continue
      g.globalAlpha = a
      const s = 2.2 * u
      g.fillRect(this.ffX[i] - s / 2, this.ffY[i] - s / 2, s, s)
      g.globalAlpha = a * 0.28
      g.fillRect(this.ffX[i] - s * 1.4, this.ffY[i] - s * 1.4, s * 2.8, s * 2.8)
    }
    g.globalAlpha = 1
  }

  /** A volunteer seedling: random ground (or exactly `atX`), small stature,
   * its own species. */
  private plantSprout(t: Tree, atX?: number): number {
    const s = this.treeSpec
    if (!s) return 1
    const f = 0.08 + Math.random() * 0.84
    const scale = 0.4 + Math.random() * 0.35
    const species: TreeKind[] = ['oak', 'pine', 'willow', 'birch', 'sapling']
    const kind: TreeKind =
      s.kind === 'mixed' || Math.random() < 0.5
        ? species[(Math.random() * species.length) | 0]
        : (s.kind as TreeKind)
    const share = Math.max(1200, Math.floor(s.share * 0.45))
    t.reset(s.w, s.h, s.density, s.horizonY, atX ?? s.w * f, scale, share, kind)
    return scale
  }

  private plantTree(t: Tree, i: number, nTrees: number): void {
    const s = this.treeSpec
    if (!s) return
    const f = nTrees === 1 ? 0.5 : (i + 0.5) / nTrees
    // jitter within the trunk's own slot, never across the frame: at nTrees=1
    // the unclamped version was ±35% of the screen, which planted a lone tree
    // hard against an edge
    const jitter = (Math.random() - 0.5) * Math.min(0.14, 0.7 / nTrees)
    const scale = nTrees === 1 ? 1 : 0.62 + ((i * 37) % 11) / 22
    // 'mixed' gives each slot its own species, so a stand reads as woodland
    // rather than an orchard of one clone repeated
    const species: TreeKind[] = ['oak', 'pine', 'willow', 'birch']
    const kind: TreeKind =
      s.kind === 'mixed' ? species[(i * 3 + (Math.random() * 4) | 0) % species.length] : s.kind
    t.reset(s.w, s.h, s.density, s.horizonY, s.w * (f + jitter), scale, s.share, kind)
    this.treeScales[i] = scale
  }
}
