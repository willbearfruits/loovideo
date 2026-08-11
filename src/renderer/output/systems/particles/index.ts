// System 3 — PARTICLES. A stateless GPU particle field: every frame the vertex
// shader re-derives each point from its seed, the curl field, and the audio
// uniforms. Count scales with the quality tier × density param.

import * as THREE from 'three'
import { PALETTES, isPaper } from '../../../../shared/palettes'
import type { AudioFrame } from '../../audio'
import { Params, type SystemCtx, type VisualSystem } from '../types'
import { particleVertex, particleFragment } from './shaders'

export class ParticlesSystem implements VisualSystem {
  readonly id = 'parts' as const
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 60)

  private ctx!: SystemCtx
  private points: THREE.Points | null = null
  private material: THREE.ShaderMaterial
  private currentCount = 0
  private lastRebuild = 0
  private orbitAngle = 0
  private punchEnv = 0
  private paletteKey = ''
  private active = false
  private heightPx = 1080

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: 0 },
        uTurb: { value: 0.8 },
        uScale: { value: 1 },
        uDrift: { value: 0.5 },
        uSpread: { value: 1 },
        uSize: { value: 1 },
        uHue: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uLevel: { value: 0 },
        uPxScale: { value: 700 },
        uPal0: { value: new THREE.Color() },
        uPal1: { value: new THREE.Color() },
        uPal2: { value: new THREE.Color() },
        uPal3: { value: new THREE.Color() },
        uPal4: { value: new THREE.Color() }
      }
    })
    this.camera.position.set(0, 0.4, 3.1)
  }

  init(ctx: SystemCtx): void {
    this.ctx = ctx
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.heightPx = h
    this.material.uniforms.uPxScale.value = h * 0.62
  }

  setActive(on: boolean): void {
    this.active = on
  }

  dispose(): void {
    this.points?.geometry.dispose()
    this.material.dispose()
  }

  private rebuild(count: number): void {
    if (this.points) {
      this.scene.remove(this.points)
      this.points.geometry.dispose()
    }
    const pos = new Float32Array(count * 3)
    const rand = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // uniform-ish ball: random cube points pulled toward the origin
      const x = Math.random() * 2 - 1
      const y = Math.random() * 2 - 1
      const z = Math.random() * 2 - 1
      const k = Math.cbrt(Math.random()) / Math.max(0.35, Math.hypot(x, y, z))
      pos[i * 3] = x * k
      pos[i * 3 + 1] = y * k
      pos[i * 3 + 2] = z * k
      rand[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100) // never cull
    this.points = new THREE.Points(geo, this.material)
    this.points.frustumCulled = false
    this.scene.add(this.points)
    this.currentCount = count
  }

  private applyPalette(name: string): void {
    if (name === this.paletteKey) return
    this.paletteKey = name
    const stops = PALETTES[name] ?? PALETTES.ice
    for (let i = 0; i < 5; i++) {
      const u = this.material.uniforms[`uPal${i}`].value as THREE.Color
      u.set(stops[i]).convertSRGBToLinear()
    }
    // paper palettes: normal blending (dark marks on light ground); dark
    // palettes: additive glow on black
    this.scene.background = new THREE.Color(stops[0]).convertSRGBToLinear()
    const blending = isPaper(stops) ? THREE.NormalBlending : THREE.AdditiveBlending
    if (blending !== this.material.blending) {
      this.material.blending = blending
      this.material.needsUpdate = true
    }
  }

  update(dt: number, time: number, p: Params, audio: AudioFrame): void {
    if (!this.active) return
    const q = this.ctx.quality()
    const wanted = Math.max(2000, Math.round(q.particleBase * p.num('parts.density')))
    const now = performance.now()
    if (
      this.currentCount === 0 ||
      (Math.abs(wanted - this.currentCount) / this.currentCount > 0.08 &&
        now - this.lastRebuild > 350)
    ) {
      this.lastRebuild = now
      this.rebuild(wanted)
    }

    this.applyPalette(p.str('parts.palette'))

    const u = this.material.uniforms
    u.uTime.value = time
    u.uMode.value = p.str('parts.mode') === 'shell' ? 1 : 0
    u.uTurb.value = p.num('parts.turbulence')
    u.uScale.value = p.num('parts.scale')
    u.uDrift.value = p.num('parts.drift')
    u.uSpread.value = p.num('parts.spread')
    u.uSize.value = p.num('parts.size')
    u.uHue.value = p.num('parts.hue')
    u.uBass.value = (audio.bands[0] + audio.bands[1]) / 2
    u.uMid.value = (audio.bands[3] + audio.bands[4]) / 2
    u.uTreble.value = (audio.bands[6] + audio.bands[7]) / 2
    u.uLevel.value = audio.level

    // camera: slow orbit + onset punch (fov snap that relaxes back)
    this.orbitAngle += p.num('parts.orbit') * dt * 0.5
    this.punchEnv = Math.max(this.punchEnv * Math.exp(-dt * 6), audio.onset * p.num('parts.punch'))
    const r = 3.1
    this.camera.position.set(
      Math.sin(this.orbitAngle) * r,
      0.42 + Math.sin(time * 0.11) * 0.5,
      Math.cos(this.orbitAngle) * r
    )
    this.camera.lookAt(0, 0, 0)
    const fov = 58 - this.punchEnv * 14
    if (Math.abs(fov - this.camera.fov) > 0.05) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }
}
