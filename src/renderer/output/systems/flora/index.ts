// System 4 — FLORA & FAUNA. Living things with narrative arcs: a murmuration
// that sound keeps airborne and silence brings to ground; a tree that grows
// while music plays and sheds leaves when it stops; a night sky where onsets
// throw shooting stars. Canvas-drawn, palette-grounded, textured onto a quad.

import * as THREE from 'three'
import { PALETTES } from '../../../../shared/palettes'
import type { AudioFrame } from '../../audio'
import { Params, type SystemCtx, type VisualSystem } from '../types'
import { Flock, type FlockDrive } from './flock'
import { Tree } from './tree'
import { Stars } from './stars'

export class FloraSystem implements VisualSystem {
  readonly id = 'flora' as const
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  private ctx!: SystemCtx
  private canvas = document.createElement('canvas')
  private c2d = this.canvas.getContext('2d', { alpha: false })!
  private texture = new THREE.CanvasTexture(this.canvas)
  private material: THREE.MeshBasicMaterial

  private flock = new Flock()
  private tree = new Tree()
  private stars = new Stars()
  private lastMode = ''
  private lastTreeKey = ''
  private viewW = 1920
  private viewH = 1080
  private active = false

  constructor() {
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.generateMipmaps = false
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.material = new THREE.MeshBasicMaterial({ map: this.texture })
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
    if (on) this.lastTreeKey = '' // regrow the tree on each return to the system
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
    }

    const mode = p.str('flora.mode')
    const stops = PALETTES[p.str('flora.palette')] ?? PALETTES.ink
    const density = p.num('flora.density')
    const horizonY = h * p.num('flora.horizon')
    const drive: FlockDrive = {
      energy: p.num('flora.vigor'),
      vigor: p.num('flora.vigor'),
      wind: p.num('flora.wind'),
      scatter: p.num('flora.scatter'),
      bass: (audio.bands[0] + audio.bands[1]) / 2,
      treble: (audio.bands[6] + audio.bands[7]) / 2,
      level: audio.level,
      onset: audio.onset,
      silence: audio.silence,
      horizonY
    }

    const g = this.c2d
    g.globalAlpha = 1
    g.fillStyle = stops[0]
    g.fillRect(0, 0, w, h)

    switch (mode) {
      case 'tree': {
        const key = `${w}x${h}|${density.toFixed(2)}|${horizonY.toFixed(0)}`
        if (key !== this.lastTreeKey || this.lastMode !== 'tree') {
          this.lastTreeKey = key
          this.tree.reset(w, h, density, horizonY)
        }
        this.tree.update(dt, time, w, h, drive)
        this.tree.draw(g, w, h, stops, drive)
        break
      }
      case 'stars':
        this.stars.update(dt, time, w, h, density, stops, drive)
        this.stars.draw(g, w, h, time, stops, drive)
        break
      default: {
        // bird count is a screen-area budget so a windowed preview isn't packed
        const area = Math.min(1, (w * h) / (1920 * 1080))
        this.flock.resize(Math.round((400 + density * 3600) * (0.35 + 0.65 * area)), w, h)
        this.flock.update(dt, time, w, h, drive)
        this.flock.draw(g, w, h, stops, drive)
      }
    }
    this.lastMode = mode
    this.texture.needsUpdate = true
  }
}
