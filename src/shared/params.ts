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

  // ---- layers: every system can render at once ----
  // The `system` selector still picks the BASE layer (opaque ground, and what
  // the setlist/keys switch). These are the overlay opacities for the other
  // two — modulatable, so audio can fade a whole system in and out.
  n('mix.chars', 'Characters Layer', 0, 1, 0, 'mix'),
  n('mix.parts', 'Particles Layer', 0, 1, 0, 'mix'),
  n('mix.flora', 'Flora Layer', 0, 1, 0, 'mix'),
  e('mix.blend', 'Layer Blend', ['add', 'screen', 'normal'], 'add', 'mix'),

  // ---- global FX chain ----
  n('fx.bloom', 'Bloom', 0, 1, 0.4, 'fx'),
  n('fx.sharpen', 'Sharpen', 0, 1, 0, 'fx'),
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
  // Stillness discipline says motion means sound, so with an interface
  // connected and the room quiet the grid nearly stops. That is the contract,
  // not a bug — but it makes the system look dead while you are setting up or
  // playing very sparse material. This is the floor under that gating: 0 keeps
  // the contract exactly, higher values buy ambient motion with no signal.
  n('chars.idle', 'Idle Motion', 0, 1, 0.3, 'chars'),
  // how hard the level/onset term drives the field. 1 is the original mapping;
  // higher makes quiet material read as movement instead of near-stillness,
  // which is what you want with sparse amplified objects.
  n('chars.drive', 'Dynamics', 0, 5, 2.2, 'chars'),
  b('chars.invert', 'Invert', false, 'chars'),

  // ---- system: particles ----
  e('parts.mode', 'Mode', ['nebula', 'shell', 'galaxy', 'lattice', 'strands', 'torus'], 'nebula', 'parts'),
  e('parts.shape', 'Point Shape', ['soft', 'dot', 'ring', 'square', 'cross'], 'soft', 'parts'),
  e('parts.palette', 'Palette', PALETTE_NAMES, 'ice', 'parts'),
  n('parts.density', 'Density', 0.05, 1, 0.7, 'parts', false),
  n('parts.turbulence', 'Turbulence', 0, 2, 0.8, 'parts'),
  n('parts.scale', 'Noise Scale', 0.1, 3, 1, 'parts'),
  n('parts.drift', 'Drift', 0, 2, 0.5, 'parts'),
  n('parts.spread', 'Spread', 0.2, 2, 1, 'parts'),
  n('parts.size', 'Point Size', 0.2, 4, 1, 'parts'),
  n('parts.sharp', 'Edge Sharpness', 0, 1, 0.35, 'parts'),
  n('parts.depth', 'Depth Fade', 0, 1, 0.3, 'parts'),
  n('parts.twist', 'Twist', -2, 2, 0, 'parts'),
  n('parts.hue', 'Hue Cycle', 0, 1, 0, 'parts'),
  n('parts.orbit', 'Orbit', -2, 2, 0.3, 'parts'),
  n('parts.tilt', 'Camera Tilt', -1, 1, 0.12, 'parts'),
  n('parts.fov', 'Field of View', 25, 100, 58, 'parts'),
  n('parts.punch', 'Onset Punch', 0, 1, 0.5, 'parts', false),

  // ---- system: flora & fauna ----
  // `mode` picks the principal inhabitant; the three add-* toggles stack the
  // others on the same ground line, so a tree can grow inside a murmuration
  // under a night sky.
  e('flora.mode', 'Mode', ['tree', 'flock', 'stars'], 'flock', 'flora'),
  e('flora.palette', 'Palette', PALETTE_NAMES, 'ink', 'flora'),
  // a landscape to put the living things in
  e('flora.scene', 'Landscape', ['bare', 'hills', 'farm'], 'bare', 'flora'),
  e('flora.flockKind', 'Flock', ['starlings', 'geese', 'midges'], 'starlings', 'flora'),
  e('flora.treeKind', 'Species', ['mixed', 'oak', 'pine', 'willow', 'birch'], 'mixed', 'flora'),
  // momentary: the renderer clears it as soon as it starts the fell sequence
  b('flora.fell', 'FELL THE TREES', false, 'flora'),
  b('flora.addStars', '+ Sky', false, 'flora'),
  b('flora.addTree', '+ Trees', false, 'flora'),
  b('flora.addFlock', '+ Birds', false, 'flora'),
  b('flora.endless', 'Endless Growth', true, 'flora'),
  // when a tree reaches the node ceiling it is replaced by a sapling in the
  // same ground, so the scene never stops growing even though no single tree
  // can grow without bound
  b('flora.succession', 'Succession', true, 'flora'),
  n('flora.animals', 'Livestock', 0, 14, 0, 'flora', false),
  n('flora.density', 'Density', 0.05, 1, 0.6, 'flora', false),
  n('flora.wind', 'Wind', 0, 2, 0.6, 'flora'),
  n('flora.vigor', 'Vigor', 0, 2, 1, 'flora'),
  n('flora.scatter', 'Scatter', 0, 1, 0.6, 'flora'),
  n('flora.trees', 'Trees', 1, 7, 1, 'flora', false),
  n('flora.reach', 'Crown Reach', 0.6, 2.5, 1.3, 'flora'),
  // dieback: the tree is always shedding its oldest tips, so growth and decay
  // reach an equilibrium instead of the tree filling up and stopping
  n('flora.decay', 'Dieback', 0, 1, 0.12, 'flora'),
  // foliage fills in behind the growing frontier — a tip's leaf swells with
  // its age, so the canopy greens up over minutes rather than appearing whole
  n('flora.leaves', 'Foliage', 0, 1, 0.6, 'flora'),
  // Season and time of day are plain modulatable phases, so a slow LFO routed
  // at either one makes the year or the day pass on its own.
  // 0 spring · 0.25 summer · 0.5 autumn · 0.75 winter · 1 wraps to spring
  n('flora.season', 'Season', 0, 1, 0.15, 'flora'),
  // 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk · 1 wraps to midnight
  n('flora.daytime', 'Time of Day', 0, 1, 0.5, 'flora'),
  n('flora.fit', 'Auto Frame', 0, 1, 0.7, 'flora', false),
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
export type MsaaLevel = 0 | 2 | 4
export const MSAA_LEVELS: MsaaLevel[] = [0, 2, 4]

export interface QualityState {
  preset: QualityPreset
  /** render resolution multiplier 0.5..2 */
  renderScale: number
  /** 0 = uncapped */
  fpsCap: 0 | 30 | 60 | 120
  /**
   * MSAA on the composite target. The strongest sharpness lever for the 3D
   * system — point and line edges get resolved before bloom smears them — but
   * it multiplies fragment cost, so it is an explicit rig choice rather than
   * something a quality tier turns on behind your back. Judge it on the Ally.
   */
  msaa: MsaaLevel
}

export interface QualityTier {
  particleBase: number
  /** hard ceiling on character grid columns */
  maxGridCols: number
  /** birds at flora.density = 1 (CPU-bound: boids run on the main thread) */
  flockBase: number
  /** node ceiling for the endlessly-growing tree, shared across all trunks */
  treeNodeCap: number
  fxFull: boolean
}

export const QUALITY_TIERS: Record<QualityPreset, QualityTier> = {
  // treeNodeCap is bounded by Canvas2D stroke throughput, not memory: every
  // node is a line segment re-stroked each frame because the wind moves it.
  low: { particleBase: 60_000, maxGridCols: 110, flockBase: 3_000, treeNodeCap: 6_000, fxFull: false },
  medium: { particleBase: 150_000, maxGridCols: 160, flockBase: 9_000, treeNodeCap: 14_000, fxFull: true },
  high: { particleBase: 300_000, maxGridCols: 220, flockBase: 20_000, treeNodeCap: 28_000, fxFull: true },
  ultra: { particleBase: 600_000, maxGridCols: 300, flockBase: 45_000, treeNodeCap: 60_000, fxFull: true }
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
    quality: { preset: 'high', renderScale: 1, fpsCap: 0, msaa: 0 }
  }
}

export const SYSTEMS: { id: SystemId; label: string }[] = [
  { id: 'chars', label: 'CHARACTERS' },
  { id: 'parts', label: 'PARTICLES' },
  { id: 'flora', label: 'FLORA' }
]
