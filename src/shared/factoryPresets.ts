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

  // characterglitch/physarum_zalgo, audio-driven: the slime mold's metabolism
  // is the music. Bass feeds the trails, onsets scatter the swarm, silence
  // starves the network back to dust. Ink on paper.
  MYCELIUM: {
    system: 'chars',
    values: {
      'chars.mode': 'physarum',
      'chars.palette': 'ink',
      'chars.density': 0.6,
      'chars.warp': 0.7,
      'chars.zalgo': 0.25,
      'chars.sparkle': 0.6,
      'fx.grain': 0.1,
      'fx.vignette': 0.22
    },
    routes: [{ id: 'r1', source: 'band0', target: 'chars.warp', depth: 0.35 }]
  },

  // characterglitch/dejong_organism: bass and mids bend the map, every onset
  // is a hard jump to a new figure, silence lets the cloud dissolve.
  'DE JONG': {
    system: 'chars',
    values: {
      'chars.mode': 'attractor',
      'chars.palette': 'vapor',
      'chars.density': 0.65,
      'chars.warp': 0.8,
      'chars.contrast': 1.1,
      'fx.bloom': 0.45,
      'fx.trails': 0.2,
      'fx.grain': 0.1
    },
    routes: [{ id: 'r1', source: 'onset', target: 'fx.flash', depth: 0.15 }]
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
  },

  // --- second half of the arc: density, stacking, endless growth -----------

  // A stand of trees that never finishes. Each spent crown seeds the next one
  // higher and wider; the auto-frame pulls back as the canopy outgrows the
  // screen, so an hour-long set is an hour of growth.
  GROVE: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'ink',
      'flora.endless': true,
      'flora.trees': 4,
      'flora.sprout': 0.45,
      'flora.reach': 1.45,
      'flora.fit': 0.85,
      'flora.density': 0.8,
      'flora.wind': 0.7,
      'flora.vigor': 1.4,
      'flora.horizon': 0.86,
      'fx.grain': 0.1,
      'fx.vignette': 0.24,
      'fx.sharpen': 0.35
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.35 },
      { id: 'r2', source: 'level', target: 'flora.vigor', depth: 0.3 }
    ]
  },

  // The luminous-ink references: single trees, white on black, tight bloom.
  // A young sapling with oversized outlined leaves — the opening image.
  LUMEN: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'mono',
      'flora.treeKind': 'sapling',
      'flora.trees': 1,
      'flora.endless': false,
      'flora.leaves': 0.85,
      'flora.season': 0.3,
      'flora.wind': 0.45,
      'flora.vigor': 1.1,
      'flora.horizon': 0.88,
      'fx.bloom': 0.55,
      'fx.grain': 0.06,
      'fx.vignette': 0.3
    },
    routes: [{ id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.3 }]
  },

  // Weeping willow: strand curtains combed by the wind.
  'WILLOW VEIL': {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'mono',
      'flora.treeKind': 'willow',
      'flora.trees': 1,
      'flora.endless': false,
      'flora.leaves': 0.7,
      'flora.season': 0.3,
      'flora.wind': 0.8,
      'flora.vigor': 1.2,
      'flora.horizon': 0.88,
      'fx.bloom': 0.5,
      'fx.grain': 0.07,
      'fx.vignette': 0.32
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.5 },
      { id: 'r2', source: 'band5', target: 'flora.wind', depth: 0.2 }
    ]
  },

  // S-trunk fiber bundle, stepped foliage pads, the outlined vessel.
  BONSAI: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'mono',
      'flora.treeKind': 'bonsai',
      'flora.trees': 1,
      'flora.endless': false,
      'flora.leaves': 0.8,
      'flora.season': 0.3,
      'flora.wind': 0.35,
      'flora.vigor': 1,
      'flora.horizon': 0.8,
      'fx.bloom': 0.45,
      'fx.grain': 0.06,
      'fx.vignette': 0.34
    },
    routes: [{ id: 'r1', source: 'level', target: 'flora.vigor', depth: 0.3 }]
  },

  // Broad dome, fiber trunk, aerial roots creeping to the ground over minutes.
  BANYAN: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.palette': 'mono',
      'flora.treeKind': 'banyan',
      'flora.trees': 1,
      'flora.endless': false,
      'flora.density': 0.85,
      'flora.leaves': 0.75,
      'flora.season': 0.3,
      'flora.wind': 0.5,
      'flora.vigor': 1.3,
      'flora.horizon': 0.86,
      'fx.bloom': 0.32,
      'fx.grain': 0.07,
      'fx.vignette': 0.3
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.35 },
      { id: 'r2', source: 'level', target: 'flora.vigor', depth: 0.3 }
    ]
  },

  // The narrative: grain → sprout → tree → grove → forest alive → storm →
  // autumn → winter → the last leaf becomes the seed. Advanced by cumulative
  // musical energy; ←/→ or Story: Next Act to drive it by hand.
  'THE CYCLE': {
    system: 'flora',
    values: {
      'story.on': true,
      'flora.mode': 'tree',
      'flora.palette': 'mono',
      'flora.horizon': 0.85,
      'master.fade': 2.5,
      'fx.bloom': 0.5,
      'fx.grain': 0.07,
      'fx.vignette': 0.3
    },
    routes: []
  },

  // Everything flora has, at once: night sky behind, a grove growing in it,
  // a full murmuration through the branches.
  'SKY GARDEN': {
    system: 'flora',
    values: {
      'flora.mode': 'flock',
      'flora.palette': 'noto',
      'flora.addStars': true,
      'flora.addTree': true,
      'flora.trees': 3,
      'flora.endless': true,
      'flora.reach': 1.2,
      'flora.fit': 0.8,
      'flora.density': 0.95,
      'flora.wind': 0.7,
      'flora.vigor': 1.3,
      'flora.scatter': 0.8,
      'flora.horizon': 0.84,
      'fx.bloom': 0.3,
      'fx.grain': 0.12,
      'fx.vignette': 0.32,
      'fx.sharpen': 0.3
    },
    routes: [
      { id: 'r1', source: 'lfo0', target: 'flora.wind', depth: 0.2 },
      { id: 'r2', source: 'onset', target: 'fx.flash', depth: 0.16 }
    ]
  },

  'SPIRAL ARMS': {
    system: 'parts',
    values: {
      'parts.mode': 'galaxy',
      'parts.shape': 'dot',
      'parts.palette': 'vapor',
      'parts.density': 0.9,
      'parts.sharp': 0.8,
      'parts.depth': 0.55,
      'parts.size': 0.7,
      'parts.tilt': 0.55,
      'parts.orbit': 0.18,
      'parts.drift': 0.9,
      'fx.bloom': 0.5,
      'fx.sharpen': 0.4
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.turbulence', depth: 0.4 },
      { id: 'r2', source: 'lfo0', target: 'parts.hue', depth: 0.35 },
      { id: 'r3', source: 'band6', target: 'parts.size', depth: 0.3 }
    ]
  },

  // Ikeda's data cube: a rigid grid, hard square points, no glow to hide in.
  'DATA LATTICE': {
    system: 'parts',
    values: {
      'parts.mode': 'lattice',
      'parts.shape': 'square',
      'parts.palette': 'noto',
      'parts.density': 0.85,
      'parts.sharp': 1,
      'parts.depth': 0.7,
      'parts.size': 0.45,
      'parts.spread': 1.2,
      'parts.orbit': 0.22,
      'parts.tilt': 0.2,
      'fx.bloom': 0.12,
      'fx.grain': 0.08,
      'fx.sharpen': 0.6
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.turbulence', depth: 0.5 },
      { id: 'r2', source: 'onset', target: 'fx.flash', depth: 0.2 },
      { id: 'r3', source: 'level', target: 'parts.twist', depth: 0.25 }
    ]
  },

  FILAMENTS: {
    system: 'parts',
    values: {
      'parts.mode': 'strands',
      'parts.shape': 'soft',
      'parts.palette': 'ice',
      'parts.density': 1,
      'parts.sharp': 0.5,
      'parts.depth': 0.45,
      'parts.size': 0.55,
      'parts.turbulence': 1.1,
      'parts.drift': 0.8,
      'parts.twist': 0.35,
      'fx.bloom': 0.55,
      'fx.trails': 0.2
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'parts.turbulence', depth: 0.45 },
      { id: 'r2', source: 'band4', target: 'parts.twist', depth: 0.4 },
      { id: 'r3', source: 'level', target: 'fx.bloom', depth: 0.25 }
    ]
  },

  // A place rather than a system: ploughed field in perspective, fence, barn,
  // silo, a windmill that coasts to a stop in silence, cattle that lift their
  // heads on a transient and lie down when the room goes quiet, geese crossing
  // above, and a stand of trees that replaces itself as each one matures.
  FARM: {
    system: 'flora',
    values: {
      'flora.mode': 'tree',
      'flora.scene': 'farm',
      'flora.palette': 'ink',
      'flora.addFlock': true,
      'flora.flockKind': 'geese',
      'flora.animals': 7,
      'flora.trees': 3,
      'flora.endless': true,
      'flora.succession': true,
      'flora.reach': 1.25,
      'flora.fit': 0.9,
      'flora.density': 0.7,
      'flora.wind': 0.6,
      'flora.vigor': 1.2,
      'flora.scatter': 0.45,
      'flora.horizon': 0.62,
      'fx.bloom': 0,
      'fx.grain': 0.12,
      'fx.vignette': 0.26,
      'fx.sharpen': 0.35
    },
    routes: [
      { id: 'r1', source: 'band0', target: 'flora.wind', depth: 0.3 },
      { id: 'r2', source: 'level', target: 'flora.vigor', depth: 0.3 }
    ]
  },

  // Same farm after dark: night sky over the field, starlings coming in to
  // roost, the windmill still turning while there is sound in the room.
  'FARM AT NIGHT': {
    system: 'flora',
    values: {
      'flora.mode': 'flock',
      'flora.scene': 'farm',
      'flora.palette': 'noto',
      'flora.addStars': true,
      'flora.addTree': true,
      'flora.flockKind': 'starlings',
      'flora.animals': 5,
      'flora.trees': 2,
      'flora.endless': true,
      'flora.succession': true,
      'flora.density': 0.85,
      'flora.wind': 0.5,
      'flora.vigor': 1.1,
      'flora.scatter': 0.75,
      'flora.horizon': 0.68,
      'flora.fit': 0.9,
      'fx.bloom': 0.28,
      'fx.grain': 0.12,
      'fx.vignette': 0.36,
      'fx.sharpen': 0.3
    },
    routes: [
      { id: 'r1', source: 'lfo0', target: 'flora.wind', depth: 0.2 },
      { id: 'r2', source: 'onset', target: 'fx.flash', depth: 0.14 }
    ]
  },

  // Three systems in one frame: the flock is the ground, the particle field
  // sits over it, and the glyph grid rides on top — LEVEL brings the stack in.
  'ALL AT ONCE': {
    system: 'flora',
    values: {
      'flora.mode': 'flock',
      'flora.palette': 'noto',
      'flora.addStars': true,
      'flora.density': 0.9,
      'flora.scatter': 0.8,
      'mix.parts': 0.55,
      'mix.chars': 0.35,
      'mix.blend': 'screen',
      'parts.mode': 'strands',
      'parts.palette': 'ice',
      'parts.size': 0.5,
      'parts.sharp': 0.6,
      'parts.depth': 0.5,
      'chars.mode': 'scope',
      'chars.palette': 'noto',
      'chars.density': 0.5,
      'fx.bloom': 0.35,
      'fx.grain': 0.12,
      'fx.vignette': 0.3,
      'fx.sharpen': 0.35
    },
    routes: [
      { id: 'r1', source: 'level', target: 'mix.parts', depth: 0.35 },
      { id: 'r2', source: 'band6', target: 'mix.chars', depth: 0.4 },
      { id: 'r3', source: 'silence', target: 'mix.chars', depth: -0.3 },
      { id: 'r4', source: 'onset', target: 'fx.flash', depth: 0.15 }
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
