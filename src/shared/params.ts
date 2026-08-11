// The parameter spine. Every knob in loovideo is declared here; the control UI
// renders itself from these defs, the output engine reads effective (modulated)
// values, and every client speaks the same ids over the WebSocket protocol.

export type ParamValue = number | boolean | string
export type SystemId = 'chars' | 'parts' | 'flora'
export const SYSTEM_IDS: SystemId[] = ['chars', 'parts', 'flora']

export interface NumberParam {
  kind: 'number'
  id: string
  label: string
  min: number
  max: number
  def: number
  step?: number
  /** true = modulation routes may target this param */
  mod?: boolean
  group: string
}
export interface BoolParam {
  kind: 'bool'
  id: string
  label: string
  def: boolean
  group: string
}
export interface EnumParam {
  kind: 'enum'
  id: string
  label: string
  options: string[]
  def: string
  group: string
}
export type ParamDef = NumberParam | BoolParam | EnumParam

const n = (
  id: string,
  label: string,
  min: number,
  max: number,
  def: number,
  group: string,
  mod = true
): NumberParam => ({ kind: 'number', id, label, min, max, def, mod, group })
const b = (id: string, label: string, def: boolean, group: string): BoolParam => ({
  kind: 'bool',
  id,
  label,
  def,
  group
})
const e = (
  id: string,
  label: string,
  options: string[],
  def: string,
  group: string
): EnumParam => ({ kind: 'enum', id, label, options, def, group })

export const PALETTE_NAMES = ['phosphor', 'amber', 'ice', 'magma', 'mono', 'vapor', 'noto', 'ink']

export const PARAMS: ParamDef[] = [
  // ---- master ----
  n('master.brightness', 'Brightness', 0, 1, 1, 'master'),
  n('master.speed', 'Speed', 0, 3, 1, 'master'),
  n('master.fade', 'Scene Fade (s)', 0, 8, 1.6, 'master', false),
  b('master.blackout', 'Blackout', false, 'master'),
  b('master.hud', 'HUD', false, 'master'),

  // ---- global FX chain ----
  n('fx.bloom', 'Bloom', 0, 1, 0.4, 'fx'),
  n('fx.trails', 'Trails', 0, 1, 0, 'fx'),
  n('fx.rgbshift', 'RGB Shift', 0, 1, 0, 'fx'),
  n('fx.pixelate', 'Pixelate', 0, 1, 0, 'fx'),
  n('fx.grain', 'Grain', 0, 1, 0.15, 'fx'),
  n('fx.vignette', 'Vignette', 0, 1, 0.35, 'fx'),
  n('fx.flash', 'Flash', 0, 1, 0, 'fx'),
  b('fx.invert', 'Invert Frame', false, 'fx'),

  // ---- audio analysis ----
  b('audio.enabled', 'Audio Input', true, 'audio'),
  b('audio.demo', 'Demo Drive', false, 'audio'),
  n('audio.gain', 'Input Gain', 0, 4, 1, 'audio', false),
  n('audio.attack', 'Attack', 0.01, 0.99, 0.55, 'audio', false),
  n('audio.release', 'Release', 0.01, 0.99, 0.35, 'audio', false),
  // 8-band EQ: scales how strongly each analysis band feeds the mod matrix
  ...Array.from({ length: 8 }, (_, i) => n(`audio.eq${i}`, `Band ${i + 1}`, 0, 2, 1, 'eq', false)),

  // ---- system: characters ----
  e('chars.mode', 'Mode', ['flow', 'physarum', 'attractor', 'rain', 'wave', 'scope', 'cam'], 'flow', 'chars'),
  e('chars.charset', 'Charset', ['ascii', 'braille', 'blocks', 'glitch', 'organism'], 'ascii', 'chars'),
  e('chars.palette', 'Palette', PALETTE_NAMES, 'phosphor', 'chars'),
  e('chars.symmetry', 'Symmetry', ['off', 'mirror', 'quad'], 'off', 'chars'),
  n('chars.density', 'Density', 0, 1, 0.55, 'chars', false),
  n('chars.flow', 'Flow Rate', 0, 2, 1, 'chars'),
  n('chars.warp', 'Warp', 0, 2, 0.7, 'chars'),
  n('chars.zalgo', 'Zalgo', 0, 1, 0.45, 'chars'),
  n('chars.sparkle', 'Sparkle', 0, 1, 0.3, 'chars'),
  n('chars.contrast', 'Contrast', 0, 2, 1, 'chars'),
  b('chars.invert', 'Invert', false, 'chars'),

  // ---- system: particles ----
  e('parts.mode', 'Mode', ['nebula', 'shell'], 'nebula', 'parts'),
  e('parts.palette', 'Palette', PALETTE_NAMES, 'ice', 'parts'),
  n('parts.density', 'Density', 0.05, 1, 0.7, 'parts', false),
  n('parts.turbulence', 'Turbulence', 0, 2, 0.8, 'parts'),
  n('parts.scale', 'Noise Scale', 0.1, 3, 1, 'parts'),
  n('parts.drift', 'Drift', 0, 2, 0.5, 'parts'),
  n('parts.spread', 'Spread', 0.2, 2, 1, 'parts'),
  n('parts.size', 'Point Size', 0.2, 4, 1, 'parts'),
  n('parts.hue', 'Hue Cycle', 0, 1, 0, 'parts'),
  n('parts.orbit', 'Orbit', -2, 2, 0.3, 'parts'),
  n('parts.punch', 'Onset Punch', 0, 1, 0.5, 'parts', false),

  // ---- system: flora & fauna ----
  e('flora.mode', 'Mode', ['tree', 'flock', 'stars'], 'flock', 'flora'),
  e('flora.palette', 'Palette', PALETTE_NAMES, 'ink', 'flora'),
  n('flora.density', 'Density', 0.05, 1, 0.6, 'flora', false),
  n('flora.wind', 'Wind', 0, 2, 0.6, 'flora'),
  n('flora.vigor', 'Vigor', 0, 2, 1, 'flora'),
  n('flora.scatter', 'Scatter', 0, 1, 0.6, 'flora'),
  n('flora.horizon', 'Horizon', 0.4, 0.95, 0.78, 'flora', false)
]

export const PARAM_MAP: Record<string, ParamDef> = Object.fromEntries(
  PARAMS.map((p) => [p.id, p])
)

export function defaultValues(): Record<string, ParamValue> {
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.def]))
}

// ---------------------------------------------------------------------------
// Modulation

export type ModSource =
  | 'band0' | 'band1' | 'band2' | 'band3' | 'band4' | 'band5' | 'band6' | 'band7'
  | 'level'
  | 'onset'
  | 'silence'
  | 'lfo0' | 'lfo1' | 'lfo2' | 'lfo3'

export const MOD_SOURCES: ModSource[] = [
  'band0', 'band1', 'band2', 'band3', 'band4', 'band5', 'band6', 'band7',
  'level', 'onset', 'silence', 'lfo0', 'lfo1', 'lfo2', 'lfo3'
]

export interface ModRoute {
  id: string
  source: ModSource
  target: string
  /** -1..1; scaled by the target's full range */
  depth: number
}

export type LfoShape = 'sine' | 'triangle' | 'saw' | 'square' | 'random'
export interface LfoDef {
  shape: LfoShape
  rateHz: number
}

// ---------------------------------------------------------------------------
// Quality

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra'
export interface QualityState {
  preset: QualityPreset
  /** render resolution multiplier 0.5..2 */
  renderScale: number
  /** 0 = uncapped */
  fpsCap: 0 | 30 | 60 | 120
}

export interface QualityTier {
  particleBase: number
  /** hard ceiling on character grid columns */
  maxGridCols: number
  fxFull: boolean
}

export const QUALITY_TIERS: Record<QualityPreset, QualityTier> = {
  low: { particleBase: 60_000, maxGridCols: 110, fxFull: false },
  medium: { particleBase: 150_000, maxGridCols: 160, fxFull: true },
  high: { particleBase: 300_000, maxGridCols: 220, fxFull: true },
  ultra: { particleBase: 600_000, maxGridCols: 300, fxFull: true }
}

// ---------------------------------------------------------------------------
// Whole-instrument state

export interface ParamState {
  values: Record<string, ParamValue>
  routes: ModRoute[]
  lfos: LfoDef[]
  system: SystemId
  audioDeviceId: string | null
  videoDeviceId: string | null
  quality: QualityState
}

export function defaultState(): ParamState {
  return {
    values: defaultValues(),
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.turbulence', depth: 0.5 },
      { id: 'r2', source: 'band6', target: 'parts.size', depth: 0.35 },
      { id: 'r3', source: 'band0', target: 'chars.warp', depth: 0.5 },
      { id: 'r4', source: 'band5', target: 'chars.sparkle', depth: 0.6 },
      { id: 'r5', source: 'level', target: 'fx.bloom', depth: 0.25 },
      { id: 'r6', source: 'onset', target: 'fx.flash', depth: 0.3 }
    ],
    lfos: [
      { shape: 'sine', rateHz: 0.08 },
      { shape: 'triangle', rateHz: 0.25 },
      { shape: 'sine', rateHz: 1.2 },
      { shape: 'random', rateHz: 4 }
    ],
    system: 'chars',
    audioDeviceId: null,
    videoDeviceId: null,
    quality: { preset: 'high', renderScale: 1, fpsCap: 0 }
  }
}

export const SYSTEMS: { id: SystemId; label: string }[] = [
  { id: 'chars', label: 'CHARACTERS' },
  { id: 'parts', label: 'PARTICLES' },
  { id: 'flora', label: 'FLORA' }
]
