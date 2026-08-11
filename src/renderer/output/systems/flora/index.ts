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
import { Stars } from './stars'
import { Scenery, type SceneKind, type SceneryDrive } from './scenery'
import { Fauna, type FaunaDrive } from './fauna'

const MAX_TREES = 7
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
    kind: TreeKind
  } | null = null
  private viewW = 1920
  private viewH = 1080
  private active = false
  private overlay = false
  private fitScale = 1

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
      leaves: p.num('flora.leaves'),
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

    // --- back to front: sky, hills, ground, built structures ---------------
    if (wantStars) {
      this.stars.update(dt, time, w, h, density, stops, drive)
      this.stars.draw(g, w, h, time, stops, drive)
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
      const nTrees = Math.max(1, Math.min(MAX_TREES, Math.round(p.num('flora.trees'))))
      const kind = (p.str('flora.treeKind') || 'oak') as TreeKind
      const key = `${w}x${h}|${density.toFixed(2)}|${horizonY.toFixed(0)}|${nTrees}|${q.treeNodeCap}|${kind}`
      if (key !== this.lastTreeKey) {
        this.lastTreeKey = key
        this.trees = []
        this.treeFade = []
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
        target = Math.min(1, (w * 0.92) / spanX, (horizonY * 0.94) / spanY)
      }
      const eff = 1 + (target - 1) * fit
      // ease toward the target so a growth spurt does not snap the framing
      this.fitScale += (eff - this.fitScale) * Math.min(1, dt * 1.6)
      const cxTree = Number.isFinite(minX) ? (minX + maxX) / 2 : w / 2

      g.save()
      g.translate(w / 2, horizonY)
      g.scale(this.fitScale, this.fitScale)
      g.translate(-cxTree, -horizonY)
      for (let i = 0; i < this.trees.length; i++) {
        const fade = this.treeFade[i] > 0 ? 1 - this.treeFade[i] / SUCCESSION_FADE : 1
        this.trees[i].draw(g, w, h, stops, drive, this.fitScale, Math.max(0, fade))
      }
      g.restore()
    }

    // --- livestock: in front of the field, behind nothing -------------------
    const animals = Math.round(p.num('flora.animals'))
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
        (300 + density * (q.flockBase - 300)) * (0.4 + 0.6 * area) * flockCountScale(drive.kind)
      )
      this.flock.resize(Math.max(24, want), w, h)
      this.flock.update(dt, time, w, h, drive)
      this.flock.draw(g, w, h, stops, drive)
    }

    this.lastMode = mode
    this.texture.needsUpdate = true
  }

  /** (Re)seed one slot of the grove — used at build time and by succession. */
  private plantTree(t: Tree, i: number, nTrees: number): void {
    const s = this.treeSpec
    if (!s) return
    const f = nTrees === 1 ? 0.5 : (i + 0.5) / nTrees
    // jitter within the trunk's own slot, never across the frame: at nTrees=1
    // the unclamped version was ±35% of the screen, which planted a lone tree
    // hard against an edge
    const jitter = (Math.random() - 0.5) * Math.min(0.14, 0.7 / nTrees)
    const scale = nTrees === 1 ? 1 : 0.62 + ((i * 37) % 11) / 22
    t.reset(s.w, s.h, s.density, s.horizonY, s.w * (f + jitter), scale, s.share, s.kind)
  }
}
