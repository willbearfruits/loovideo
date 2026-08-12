// The output engine: owns the renderer, the post chain, audio analysis, the
// modulation resolution, and the active visual system.

import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js'

import { QUALITY_TIERS, SYSTEM_IDS, type ParamValue, type SystemId } from '../../shared/params'
import { PALETTES, isPaper } from '../../shared/palettes'
import { computeEffective, emptySources, lfoValue, type ModSources } from '../../shared/mod'
import type { OutputNet } from './net'
import { AudioEngine } from './audio'
import { Webcam } from './webcam'
import { GradeShader } from './fx'
import { SceneFade } from './fade'
import { GlitchPass } from './glitchpass'
import { Recorder } from './record'
import { LayersPass } from './layers'
import {
  Params,
  type LayerBlend,
  type StageInput,
  type StoryCtx,
  type VisualSystem
} from './systems/types'
import { Story } from './story'
import { CharactersSystem } from './systems/characters'
import { ParticlesSystem } from './systems/particles'
import { FloraSystem } from './systems/flora'

const TELEMETRY_MS = 66

export class Engine {
  private renderer: THREE.WebGLRenderer
  private composer: EffectComposer
  private layersPass: LayersPass
  private fade: SceneFade
  private afterimage: AfterimagePass
  private bloom: UnrealBloomPass
  private rgbShift: ShaderPass
  private grade: ShaderPass

  private systems: Record<SystemId, VisualSystem>
  private activeId: SystemId | null = null
  private liveLayers = new Set<SystemId>()
  private lastMsaa = -1

  private params = new Params()
  private audio = new AudioEngine()
  private webcam = new Webcam()

  private lastT = performance.now()
  private lastRenderT = 0
  private scaledTime = 0
  private fpsEma = 60
  private lastTelemetry = 0
  private lastQualityKey = ''
  private lastAudioAttempt = 0
  private appliedAudioDevice: string | null | undefined = undefined
  private devicesSent = false
  private seenEpoch = -1
  private flashStamps: number[] = []
  private prevFlashRaw = 0
  private storyCtx: StoryCtx = { on: false, cam: 'auto' }
  private story!: Story
  private glitch = new GlitchPass()
  private recorder = new Recorder()
  private prevRecord = false
  private stageInput: StageInput = { place: null, cam: null }
  private previewCanvas: HTMLCanvasElement | null = null
  private lastPreview = 0

  constructor(
    private net: OutputNet,
    private hud: HTMLElement
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      // scene crossfade snapshots the canvas outside the render tick
      preserveDrawingBuffer: true
    })
    document.body.appendChild(this.renderer.domElement)
    this.fade = new SceneFade(this.renderer.domElement)
    this.net.onSceneChange = (duration) => this.fade.freeze(duration)

    const size = new THREE.Vector2(window.innerWidth, window.innerHeight)
    this.layersPass = new LayersPass()
    this.afterimage = new AfterimagePass(0.9)
    // threshold 0.72: mid-tone wood must not bloom, only the true lights —
    // the soft-knee discipline from the glow research
    this.bloom = new UnrealBloomPass(size, 0.6, 0.55, 0.72)
    this.rgbShift = new ShaderPass(RGBShiftShader)
    this.grade = new ShaderPass(GradeShader)

    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(this.layersPass)
    this.composer.addPass(this.afterimage)
    this.composer.addPass(this.bloom)
    this.composer.addPass(this.rgbShift)
    this.composer.addPass(this.glitch)
    this.composer.addPass(this.grade)
    this.composer.addPass(new OutputPass())

    const ctx = {
      renderer: this.renderer,
      webcam: this.webcam,
      quality: () => ({ ...this.net.state.quality, ...QUALITY_TIERS[this.net.state.quality.preset] }),
      story: this.storyCtx,
      input: this.stageInput,
      setParam: (id: string, value: ParamValue) => this.net.send({ t: 'set', id, value })
    }
    this.story = new Story(this.net, this.storyCtx)

    // stage interaction arriving over the wire (control preview, phone, CLI)
    this.net.onPlace = (kind, x, y) => {
      this.stageInput.place = { kind, x, y }
    }
    this.net.onCam = (m) => {
      const c = this.stageInput.cam ?? { panX: 0, panY: 0, zoom: 1, reset: false }
      c.panX += m.panX ?? 0
      c.panY += m.panY ?? 0
      c.zoom *= m.zoom ?? 1
      c.reset = c.reset || !!m.reset
      this.stageInput.cam = c
    }
    this.bindGestures()
    this.systems = {
      chars: new CharactersSystem(),
      parts: new ParticlesSystem(),
      flora: new FloraSystem()
    }
    for (const s of Object.values(this.systems)) s.init(ctx)

    window.addEventListener('resize', () => this.resize())
    navigator.mediaDevices.addEventListener?.('devicechange', () => {
      this.devicesSent = false
    })
    this.resize()
    requestAnimationFrame((t) => this.loop(t))
  }

  /**
   * The output window is itself a stage: drag pans, wheel/pinch zooms,
   * a clean tap plants a tree under your finger, double-tap resets the
   * camera to the auto-frame. (Full multi-touch on the Ally screen.)
   */
  private bindGestures(): void {
    const el = this.renderer.domElement
    const pts = new Map<number, { x: number; y: number }>()
    let moved = 0
    let downT = 0
    const camAcc = (): NonNullable<StageInput['cam']> => {
      const c = this.stageInput.cam ?? { panX: 0, panY: 0, zoom: 1, reset: false }
      this.stageInput.cam = c
      return c
    }
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pts.size === 1) {
        moved = 0
        downT = performance.now()
      }
    })
    el.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      if (pts.size === 1) {
        const c = camAcc()
        c.panX += dx / window.innerWidth
        c.panY += dy / window.innerHeight
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const before = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const ax = e.pointerId === [...pts.keys()][0] ? e.clientX : a.x
        // recompute with this pointer moved
        p.x = e.clientX
        p.y = e.clientY
        const [a2, b2] = [...pts.values()]
        const after = Math.hypot(a2.x - b2.x, a2.y - b2.y) || 1
        camAcc().zoom *= after / before
        moved += Math.abs(dx) + Math.abs(dy)
        void ax
        return
      }
      p.x = e.clientX
      p.y = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
    })
    const up = (e: PointerEvent): void => {
      pts.delete(e.pointerId)
      if (pts.size === 0 && moved < 8 && performance.now() - downT < 350) {
        this.stageInput.place = {
          kind: 'tree',
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight
        }
      }
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', (e) => pts.delete(e.pointerId))
    el.addEventListener('wheel', (e) => {
      camAcc().zoom *= Math.pow(1.1, -e.deltaY / 100)
      e.preventDefault()
    })
    el.addEventListener('dblclick', () => {
      camAcc().reset = true
    })
  }

  private resize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    const scale = this.net.state.quality.renderScale
    this.renderer.setPixelRatio(scale)
    this.renderer.setSize(w, h)
    this.composer.setPixelRatio(scale)
    this.composer.setSize(w, h)
    const u = this.grade.uniforms as typeof GradeShader.uniforms
    u.uRes.value = [w * scale, h * scale]

    // MSAA on the composite target: point and line edges get resolved before
    // bloom smears them. Disposing forces three to rebuild at the new count.
    const msaa = this.net.state.quality.msaa ?? 0
    if (msaa !== this.lastMsaa) {
      this.lastMsaa = msaa
      for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
        rt.samples = msaa
        rt.dispose()
      }
    }

    for (const s of Object.values(this.systems)) s.resize(w, h)
  }

  /**
   * Decide which systems are live this frame and in what order. The `system`
   * selector is the base (opaque); `mix.<id>` fades the other two in over it.
   */
  private setLayers(base: SystemId, p: Params): void {
    if (base !== this.activeId) {
      this.activeId = base
      // stale trails from the previous base would smear across the switch
      ;(this.afterimage as unknown as { reset?: () => void }).reset?.()
    }

    const blend = (p.str('mix.blend') || 'add') as LayerBlend
    const order: SystemId[] = [base, ...SYSTEM_IDS.filter((id) => id !== base)]
    const wanted = new Set<SystemId>([base])
    const list: VisualSystem[] = []

    for (const id of order) {
      const sys = this.systems[id]
      if (id === base) {
        sys.setOverlay(false, 1, blend)
        list.push(sys)
        continue
      }
      const amount = p.num(`mix.${id}`)
      if (amount <= 0.004) continue
      wanted.add(id)
      sys.setOverlay(true, Math.min(1, amount), blend)
      list.push(sys)
    }

    // setActive is a transition, not a per-frame flag: flora regrows its grove
    // on entry and chars releases the webcam on exit
    for (const id of SYSTEM_IDS) {
      const on = wanted.has(id)
      if (on === this.liveLayers.has(id)) continue
      this.systems[id].setActive(on)
      if (on) this.liveLayers.add(id)
      else this.liveLayers.delete(id)
    }

    this.layersPass.layers = list
  }

  private manageAudio(now: number): void {
    const st = this.net.state
    const enabled = st.values['audio.enabled'] === true
    if (!enabled) return
    const deviceChanged = st.audioDeviceId !== this.appliedAudioDevice
    if ((!this.audio.running && now - this.lastAudioAttempt > 3000) || deviceChanged) {
      this.lastAudioAttempt = now
      this.appliedAudioDevice = st.audioDeviceId
      void this.audio.setDevice(st.audioDeviceId).then(() => {
        if (this.audio.running && !this.devicesSent) void this.sendDevices()
      })
    }
  }

  private async sendDevices(): Promise<void> {
    this.devicesSent = true
    const d = await this.audio.listDevices()
    const lite = (arr: MediaDeviceInfo[]): { deviceId: string; label: string }[] =>
      arr.map((x, i) => ({ deviceId: x.deviceId, label: x.label || `Device ${i + 1}` }))
    this.net.send({ t: 'devices', audio: lite(d.audio), video: lite(d.video) })
  }

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t))
    const st = this.net.state

    const cap = st.quality.fpsCap
    if (cap > 0 && now - this.lastRenderT < 1000 / cap - 1) return
    const renderDt = (now - this.lastRenderT) / 1000
    this.lastRenderT = now
    const dt = Math.min(0.1, Math.max(0.0001, (now - this.lastT) / 1000))
    this.lastT = now
    this.fpsEma += (1 / Math.max(renderDt, 1e-4) - this.fpsEma) * 0.05

    // react to preset loads / quality changes
    if (this.net.stateEpoch !== this.seenEpoch) {
      this.seenEpoch = this.net.stateEpoch
      this.appliedAudioDevice = undefined
    }
    const qKey = JSON.stringify(st.quality)
    if (qKey !== this.lastQualityKey) {
      this.lastQualityKey = qKey
      this.resize()
    }

    // audio + webcam device management
    this.manageAudio(now)
    this.webcam.setDevice(st.videoDeviceId)

    // time: master.speed from last frame's effective values (1-frame lag is fine)
    const speed = this.params.eff['master.speed'] as number | undefined
    const sdt = dt * (typeof speed === 'number' ? speed : 1)
    this.scaledTime += sdt

    const audioFrame = this.audio.update(dt, this.scaledTime, {
      enabled: st.values['audio.enabled'] === true,
      demo: st.values['audio.demo'] === true,
      gain: Number(st.values['audio.gain']) || 1,
      attack: Number(st.values['audio.attack']) || 0.5,
      release: Number(st.values['audio.release']) || 0.35,
      eq: Array.from({ length: 8 }, (_, i) => Number(st.values[`audio.eq${i}`]) || 1)
    })

    // modulation sources → effective params
    const sources: ModSources = emptySources()
    for (let i = 0; i < 8; i++) sources[`band${i}` as keyof ModSources] = audioFrame.bands[i]
    sources.level = audioFrame.level
    sources.onset = audioFrame.onset
    sources.silence = audioFrame.silence
    for (let i = 0; i < 4; i++)
      sources[`lfo${i}` as keyof ModSources] = lfoValue(st.lfos[i], this.scaledTime)
    this.params.eff = computeEffective(st.values, st.routes, sources)

    // story director: the narrative is a slow automation over the same spine.
    // It overrides its continuous drives AFTER modulation, so the world's day
    // and season belong to the story while it runs; user faders still own
    // everything the current act doesn't drive.
    this.story.frame(dt, audioFrame, st.values)
    const so = this.story.overrides
    if (this.storyCtx.on) {
      if (so.daytime !== undefined) this.params.eff['flora.daytime'] = so.daytime
      if (so.season !== undefined) this.params.eff['flora.season'] = so.season
      if (Math.abs(so.windAdd) > 0.001)
        this.params.eff['flora.wind'] = Math.max(
          0,
          Math.min(2, (this.params.eff['flora.wind'] as number) + so.windAdd)
        )
    }
    const p = this.params

    // layer stack: base system + any faded-in overlays
    this.setLayers(st.system, p)
    for (const s of this.layersPass.layers) s.update(sdt, this.scaledTime, p, audioFrame)
    this.layersPass.clearColor.copy(this.systems[st.system].bg)

    // FX chain
    const trails = p.num('fx.trails')
    this.afterimage.enabled = trails > 0.004
    ;(this.afterimage.uniforms as { damp: { value: number } }).damp.value =
      0.55 + Math.min(trails, 1) * 0.43

    // paper palettes (light background) would bloom the whole frame — damp it
    const pal = PALETTES[p.str(`${st.system}.palette`)]
    const paper = pal ? isPaper(pal) : false
    const bloomAmt = p.num('fx.bloom')
    this.bloom.enabled = bloomAmt > 0.003 && !paper
    this.bloom.strength = bloomAmt * 1.7

    const shift = p.num('fx.rgbshift')
    this.rgbShift.enabled = shift > 0.002
    this.rgbShift.uniforms['amount'].value = shift * 0.014
    this.rgbShift.uniforms['angle'].value = 0.6 + Math.sin(this.scaledTime * 0.31) * 0.5

    // glitch rack: mosh / sort / corrupt — pass disabled entirely when idle
    const gm = p.num('fx.mosh')
    const gs = p.num('fx.sort')
    const gc = p.num('fx.corrupt')
    this.glitch.enabled = gm + gs + gc > 0.004
    this.glitch.uniforms.uMosh.value = gm
    this.glitch.uniforms.uSort.value = gs
    this.glitch.uniforms.uCorrupt.value = gc
    this.glitch.uniforms.uTime.value = this.scaledTime

    const gu = this.grade.uniforms as typeof GradeShader.uniforms
    gu.uBrightness.value =
      (p.bool('master.blackout') ? 0 : p.num('master.brightness')) * this.story.overrides.brightnessMul
    gu.uVignette.value = p.num('fx.vignette')
    gu.uGrain.value = p.num('fx.grain')
    gu.uPixelate.value = p.num('fx.pixelate')
    gu.uSharpen.value = p.num('fx.sharpen')
    // strobe limiter (WCAG 2.3.1): max 3 full-field flash events per rolling
    // second — a fast rattle on a contact mic must not strobe the room
    let flash = p.num('fx.flash')
    const nowSec = now / 1000
    if (flash > 0.3 && this.prevFlashRaw <= 0.3) this.flashStamps.push(nowSec)
    this.prevFlashRaw = flash
    while (this.flashStamps.length > 0 && nowSec - this.flashStamps[0] > 1) this.flashStamps.shift()
    if (this.flashStamps.length > 3) flash = Math.min(flash, 0.18)
    gu.uFlash.value = flash
    gu.uInvert.value = p.bool('fx.invert') ? 1 : 0
    gu.uHue.value = p.num('fx.hue') * Math.PI
    gu.uSat.value = p.num('fx.saturation')
    gu.uContrast.value = p.num('fx.contrast')
    gu.uTime.value = this.scaledTime

    // recording follows the param edge, so any client can start a take
    const wantRec = st.values['master.record'] === true
    if (wantRec && !this.prevRecord) {
      this.recorder.start(this.renderer.domElement, this.audio.mediaStream)
    } else if (!wantRec && this.prevRecord) {
      this.recorder.stop()
    }
    this.prevRecord = wantRec

    this.fade.update(renderDt)
    this.composer.render()

    // HUD + telemetry
    if (now - this.lastTelemetry > TELEMETRY_MS) {
      this.lastTelemetry = now
      this.net.send({
        t: 'telemetry',
        fps: Math.round(this.fpsEma),
        level: round3(audioFrame.level),
        bands: Array.from(audioFrame.bands, round3),
        onset: round3(audioFrame.onset),
        spectrum: Array.from(audioFrame.spectrum, round3),
        story: this.story.info
      })
      this.updateHud(audioFrame.level)
    }

    // stage preview: a small JPEG of the live frame for the control surface
    if (now - this.lastPreview > 160) {
      this.lastPreview = now
      const src = this.renderer.domElement
      if (src.width > 0) {
        if (!this.previewCanvas) this.previewCanvas = document.createElement('canvas')
        const pw = 384
        const ph = Math.max(1, Math.round((src.height / src.width) * pw))
        if (this.previewCanvas.width !== pw || this.previewCanvas.height !== ph) {
          this.previewCanvas.width = pw
          this.previewCanvas.height = ph
        }
        const pctx = this.previewCanvas.getContext('2d')
        if (pctx) {
          pctx.drawImage(src, 0, 0, pw, ph)
          this.net.send({ t: 'preview', data: this.previewCanvas.toDataURL('image/jpeg', 0.55) })
        }
      }
    }
  }

  private updateHud(level: number): void {
    const on = this.net.state.values['master.hud'] === true
    this.hud.style.display = on ? 'block' : 'none'
    if (!on) return
    const st = this.net.state
    const audioState = this.audio.running
      ? 'live'
      : st.values['audio.demo'] === true
        ? 'demo'
        : (this.audio.error ?? 'off')
    const meter = '▮'.repeat(Math.round(level * 12)).padEnd(12, '·')
    const stack = this.layersPass.layers.map((s) => s.id).join('+')
    this.hud.textContent =
      `${Math.round(this.fpsEma)} fps  ${window.innerWidth}×${window.innerHeight} @${st.quality.renderScale}x ${st.quality.preset}\n` +
      `sys ${st.system}  layers ${stack}  audio ${audioState}\n` +
      `lvl ${meter}  ${this.net.connected ? 'hub ok' : 'HUB DOWN'}`
  }
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000
}
