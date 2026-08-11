// Factory scenes, ordered as a concert arc — ArrowLeft/ArrowRight in the
// output window (or `ctl next`/`ctl prev`) walk this list as a setlist.
// User presets saved from the UI live in userData and shadow these names.

import { defaultState, type ParamState, type ParamValue } from './params'

export interface PresetPatch {
  values?: Record<string, ParamValue>
  routes?: ParamState['routes']
  lfos?: ParamState['lfos']
  system?: ParamState['system']
}

export const FACTORY_PRESETS: Record<string, PresetPatch> = {
  INIT: {},

  // The object's voice made visible, nothing else: X = left, Y = right.
  // Silence collapses to a single centered dot (the designed null state).
  'PHASE SCOPE': {
    system: 'chars',
    values: {
      'chars.mode': 'scope',
      'chars.charset': 'ascii',
      'chars.palette': 'noto',
      'chars.contrast': 1.1,
      'chars.zalgo': 0.12,
      'fx.trails': 0.12,
      'fx.grain': 0.07,
      'fx.vignette': 0.2,
      'fx.bloom': 0.25
    },
    routes: [{ id: 'r1', source: 'onset', target: 'fx.flash', depth: 0.2 }]
  },

  // Amplitude bars around a center hairline; silence is a breathing flatline.
  WAVEFORM: {
    system: 'chars',
    values: {
      'chars.mode': 'wave',
      'chars.charset': 'blocks',
      'chars.palette': 'noto',
      'chars.zalgo': 0.35,
      'fx.grain': 0.1,
      'fx.vignette': 0.25,
      'fx.bloom': 0.3
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'chars.contrast', depth: 0.3 },
      { id: 'r2', source: 'silence', target: 'master.brightness', depth: -0.2 },
      { id: 'r3', source: 'onset', target: 'fx.flash', depth: 0.18 }
    ]
  },

  'RAIN TERMINAL': {
    system: 'chars',
    values: {
      'chars.mode': 'rain',
      'chars.charset': 'glitch',
      'chars.palette': 'amber',
      'chars.zalgo': 0.6,
      'fx.trails': 0.3,
      'fx.rgbshift': 0.1,
      'fx.grain': 0.22
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'chars.zalgo', depth: 0.5 },
      { id: 'r2', source: 'band6', target: 'chars.sparkle', depth: 0.8 },
      { id: 'r3', source: 'level', target: 'fx.bloom', depth: 0.25 }
    ]
  },

  'PHOSPHOR STORM': {
    system: 'chars',
    values: {
      'chars.mode': 'flow',
      'chars.charset': 'braille',
      'chars.palette': 'phosphor',
      'chars.warp': 1.1,
      'chars.zalgo': 0.3,
      'fx.trails': 0.5,
      'fx.bloom': 0.5
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'chars.warp', depth: 0.6 },
      { id: 'r2', source: 'band5', target: 'chars.sparkle', depth: 0.7 },
      { id: 'r3', source: 'level', target: 'fx.bloom', depth: 0.3 },
      { id: 'r4', source: 'lfo1', target: 'chars.flow', depth: 0.25 }
    ]
  },

  // The room itself, transcoded: edge-aware webcam ascii.
  'CAM ASCII': {
    system: 'chars',
    values: {
      'chars.mode': 'cam',
      'chars.charset': 'ascii',
      'chars.palette': 'mono',
      'chars.contrast': 1.3,
      'fx.grain': 0.18,
      'fx.vignette': 0.3
    },
    routes: [
      { id: 'r1', source: 'band5', target: 'chars.sparkle', depth: 0.6 },
      { id: 'r2', source: 'level', target: 'chars.contrast', depth: 0.2 }
    ]
  },

  // Ink on paper. Sound keeps them airborne; onsets are the falcon;
  // long silence brings them down to the wire, one by one.
  MURMURATION: {
    system: 'flora',
    values: {
      'flora.mode': 'flock',
      'flora.palette': 'ink',
      'flora.density': 0.75,
      'flora.wind': 0.6,
      'flora.vigor': 1.1,
      'flora.scatter': 0.75,
      'fx.grain': 0.12,
      'fx.vignette': 0.28,
      'fx.trails': 0
    },
    routes: [{ id: 'r1', source: 'lfo0', target: 'flora.wind', depth: 0.2 }]
  },

  // A tree that grows only while music plays, and sheds leaves in silence.
  GROWTH: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'ink',
      'flora.density': 0.7,
      'flora.wind': 0.55,
      'flora.vigor': 1.2,
      'flora.scatter': 0.5,
      'fx.grain': 0.1,
      'fx.vignette': 0.24
    },
    routes: [{ id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.35 }]
  },

  // Black sky, white stars, red shooting stars on the transients.
  NIGHT: {
    system: 'flora',
    values: {
      'flora.mode': 'stars',
      'flora.palette': 'noto',
      'flora.density': 0.7,
      'flora.scatter': 0.8,
      'flora.wind': 0.4,
      'fx.grain': 0.12,
      'fx.vignette': 0.4,
      'fx.bloom': 0.3
    },
    routes: []
  },

  'NEBULA DRIFT': {
    system: 'parts',
    values: {
      'parts.mode': 'nebula',
      'parts.palette': 'ice',
      'fx.bloom': 0.55,
      'fx.trails': 0.25
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.turbulence', depth: 0.6 },
      { id: 'r2', source: 'band3', target: 'parts.spread', depth: 0.3 },
      { id: 'r3', source: 'band6', target: 'parts.size', depth: 0.4 },
      { id: 'r4', source: 'lfo0', target: 'parts.hue', depth: 0.4 }
    ]
  },

  'SHELL PULSE': {
    system: 'parts',
    values: {
      'parts.mode': 'shell',
      'parts.palette': 'magma',
      'parts.orbit': 0.6,
      'parts.punch': 0.8,
      'fx.bloom': 0.7
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.spread', depth: 0.55 },
      { id: 'r2', source: 'band6', target: 'parts.size', depth: 0.5 },
      { id: 'r3', source: 'onset', target: 'fx.rgbshift', depth: 0.3 }
    ]
  }
}

/** Materialize a factory preset into a full ParamState. */
export function factoryState(name: string): ParamState | null {
  const patch = FACTORY_PRESETS[name]
  if (!patch) return null
  const s = defaultState()
  if (patch.values) Object.assign(s.values, patch.values)
  if (patch.routes) s.routes = patch.routes.map((r) => ({ ...r }))
  if (patch.lfos) s.lfos = patch.lfos.map((l) => ({ ...l }))
  if (patch.system) s.system = patch.system
  return s
}
