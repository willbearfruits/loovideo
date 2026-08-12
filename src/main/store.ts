// State owner. All mutations funnel through here (validated + clamped), and
// the store persists to userData so the instrument wakes up how you left it.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MSAA_LEVELS,
  PARAM_MAP,
  SYSTEM_IDS,
  defaultState,
  type LfoDef,
  type ModRoute,
  type ParamState,
  type ParamValue,
  type QualityState,
  type SystemId
} from '../shared/params'
import { FACTORY_PRESETS, factoryState } from '../shared/factoryPresets'

const SAFE_NAME = /[^\p{L}\p{N} _\-.]/gu

export class ParamStore {
  state: ParamState
  lastPreset: string | null = null
  private file: string
  private presetsDir: string
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'state.json')
    this.presetsDir = join(userDataDir, 'presets')
    mkdirSync(this.presetsDir, { recursive: true })
    this.state = this.loadFile(this.file) ?? defaultState()
  }

  private loadFile(path: string): ParamState | null {
    try {
      if (!existsSync(path)) return null
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as Partial<ParamState>
      // merge over defaults so schema growth never breaks an old state file
      const s = defaultState()
      if (raw.values)
        for (const [id, v] of Object.entries(raw.values)) if (PARAM_MAP[id]) s.values[id] = v
      if (Array.isArray(raw.routes)) s.routes = raw.routes
      if (Array.isArray(raw.lfos) && raw.lfos.length === 4) s.lfos = raw.lfos
      if (raw.system && SYSTEM_IDS.includes(raw.system)) s.system = raw.system
      if (raw.audioDeviceId !== undefined) s.audioDeviceId = raw.audioDeviceId
      if (raw.videoDeviceId !== undefined) s.videoDeviceId = raw.videoDeviceId
      if (raw.quality) s.quality = { ...s.quality, ...raw.quality }
      if (Array.isArray(raw.customPalette) && raw.customPalette.length === 5)
        s.customPalette = raw.customPalette
      return s
    } catch (err) {
      console.error(`[store] failed to load ${path}:`, err)
      return null
    }
  }

  private persist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      try {
        writeFileSync(this.file, JSON.stringify(this.state, null, 2))
      } catch (err) {
        console.error('[store] persist failed:', err)
      }
    }, 400)
  }

  /** Validate + apply a single param change. Returns the accepted value or null. */
  set(id: string, value: ParamValue): ParamValue | null {
    const def = PARAM_MAP[id]
    if (!def) return null
    let v: ParamValue
    switch (def.kind) {
      case 'number': {
        const num = Number(value)
        if (!Number.isFinite(num)) return null
        v = Math.min(def.max, Math.max(def.min, num))
        break
      }
      case 'bool':
        v = Boolean(value)
        break
      case 'enum':
        if (typeof value !== 'string' || !def.options.includes(value)) return null
        v = value
        break
    }
    this.state.values[id] = v
    this.persist()
    return v
  }

  setRoutes(routes: ModRoute[]): void {
    this.state.routes = routes.filter(
      (r) => PARAM_MAP[r.target] && typeof r.depth === 'number'
    )
    this.persist()
  }

  setLfo(index: number, def: LfoDef): boolean {
    if (index < 0 || index > 3) return false
    this.state.lfos[index] = def
    this.persist()
    return true
  }

  setSystem(id: SystemId): void {
    this.state.system = id
    this.persist()
  }

  setPalette(stops: string[]): boolean {
    if (!Array.isArray(stops) || stops.length !== 5) return false
    if (!stops.every((s) => /^#[0-9a-fA-F]{6}$/.test(s))) return false
    this.state.customPalette = [...stops]
    this.persist()
    return true
  }

  setDevice(kind: 'audio' | 'video', deviceId: string | null): void {
    if (kind === 'audio') this.state.audioDeviceId = deviceId
    else this.state.videoDeviceId = deviceId
    this.persist()
  }

  setQuality(q: Partial<QualityState>): QualityState {
    const next = { ...this.state.quality, ...q }
    // a bogus sample count would make three rebuild the composite target with
    // an invalid format, so pin it to what WebGL2 actually accepts here
    if (!MSAA_LEVELS.includes(next.msaa)) next.msaa = 0
    next.renderScale = Math.min(2, Math.max(0.5, Number(next.renderScale) || 1))
    this.state.quality = next
    this.persist()
    return this.state.quality
  }

  // ---- presets -------------------------------------------------------------

  listPresets(): string[] {
    const user = readdirSync(this.presetsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
    return [...new Set([...Object.keys(FACTORY_PRESETS), ...user])]
  }

  savePreset(name: string): void {
    const clean = name.replace(SAFE_NAME, '').trim()
    if (!clean) return
    writeFileSync(join(this.presetsDir, `${clean}.json`), JSON.stringify(this.state, null, 2))
  }

  loadPreset(name: string): ParamState | null {
    const clean = name.replace(SAFE_NAME, '').trim()
    const userFile = join(this.presetsDir, `${clean}.json`)
    const loaded = this.loadFile(userFile) ?? factoryState(name)
    if (!loaded) return null
    // device choices + quality are rig config, not scene content — keep current
    loaded.audioDeviceId = this.state.audioDeviceId
    loaded.videoDeviceId = this.state.videoDeviceId
    loaded.quality = this.state.quality
    this.state = loaded
    this.lastPreset = name
    this.persist()
    return this.state
  }

  /** Walk the preset list relative to the last loaded one (concert setlist). */
  cyclePreset(dir: number): ParamState | null {
    const names = this.listPresets()
    if (names.length === 0) return null
    const idx = this.lastPreset ? names.indexOf(this.lastPreset) : -1
    const next = names[(idx + dir + names.length) % names.length]
    return this.loadPreset(next)
  }

  deletePreset(name: string): void {
    const clean = name.replace(SAFE_NAME, '').trim()
    try {
      rmSync(join(this.presetsDir, `${clean}.json`))
    } catch {
      /* factory or missing — nothing to delete */
    }
  }
}
