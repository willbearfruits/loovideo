// Glyph ramps (ordered dark → bright) and the pre-tinted atlas. Drawing from
// an atlas with drawImage is ~10× faster than per-cell fillText, which is what
// lets a 200×110 grid run at 60 fps on an iGPU.

// The organism tiers are ported from the owner's characterglitch pieces
// (physarum_zalgo.html, dejong_organism.html) — dust → braille densification
// → thread → weave → organic nodes. That progression is the practice's
// signature; keep the tier ORDER and boundaries stable.
export const ORGANISM_TIERS: string[][] = [
  ['·', '‧', '∙', '•', '․'], // dust
  ['⠁', '⠃', '⠇', '⠏', '⠟', '⠿', '⡿', '⣿'], // braille fill-in
  ['─', '│', '╱', '╲', '╳', '╎', '╏', '╭', '╮', '╯', '╰'], // thread
  ['░', '▒', '▓', '■', '◆', '█'], // weave
  ['๏', '۞', '❀', '✻', '✵', '❉', '❋', '✦', '✳', '✹'] // organic nodes
]
export const ORGANISM_RAMP = ORGANISM_TIERS.flat()
/** [start, end) index of each tier inside ORGANISM_RAMP */
export const ORGANISM_RANGES: [number, number][] = (() => {
  const out: [number, number][] = []
  let o = 0
  for (const t of ORGANISM_TIERS) {
    out.push([o, o + t.length])
    o += t.length
  }
  return out
})()

export const RAMPS: Record<string, string[]> = {
  ascii: [' ', '.', ':', '-', '=', '+', '*', 'l', 't', 'x', 'z', 'v', 'X', 'O', '0', '#', '%', '@'],
  braille: ['⠀', '⠂', '⠒', '⠓', '⠛', '⠟', '⠿', '⡿', '⣿'],
  blocks: [' ', '░', '▖', '▒', '▞', '▓', '▛', '█'],
  glitch: [' ', '·', '∴', '∷', '≠', '≡', '⌁', '▒', '▚', '▓', '█'],
  organism: ORGANISM_RAMP
}

/** Directional glyphs for edge-aware rendering: 0°, 45°, 90°, 135°. */
export const EDGE_GLYPHS = ['-', '/', '|', '\\']

export const ZALGO_UP = ['̀', '́', '̂', '̃', '̆', '̌', '̐', '̒']
export const ZALGO_DOWN = ['̖', '̗', '̣', '̥', '̬', '̰', '̱', '͓']

export const GLYPH_FONT =
  "ui-monospace, 'Cascadia Mono', 'DejaVu Sans Mono', 'Segoe UI Symbol', monospace"

export interface Atlas {
  canvas: HTMLCanvasElement
  cell: number
  glyphCount: number
  stopCount: number
  key: string
}

/**
 * Build an atlas: one row per palette stop, one column per ramp glyph,
 * each glyph pre-tinted with its row's color.
 */
export function buildAtlas(charset: string, paletteStops: string[], cell: number): Atlas {
  const ramp = RAMPS[charset] ?? RAMPS.ascii
  const canvas = document.createElement('canvas')
  canvas.width = ramp.length * cell
  canvas.height = paletteStops.length * cell
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('atlas 2d context')
  ctx.font = `${Math.floor(cell * 0.95)}px ${GLYPH_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < paletteStops.length; row++) {
    ctx.fillStyle = paletteStops[row]
    for (let col = 0; col < ramp.length; col++) {
      ctx.fillText(ramp[col], col * cell + cell / 2, row * cell + cell * 0.56)
    }
  }
  return {
    canvas,
    cell,
    glyphCount: ramp.length,
    stopCount: paletteStops.length,
    key: `${charset}|${paletteStops.join()}|${cell}`
  }
}

/** Atlas of the four directional edge glyphs, one row per palette stop. */
export function buildEdgeAtlas(paletteStops: string[], cell: number): Atlas {
  const canvas = document.createElement('canvas')
  canvas.width = EDGE_GLYPHS.length * cell
  canvas.height = paletteStops.length * cell
  const ctx = canvas.getContext('2d')!
  ctx.font = `${Math.floor(cell * 0.95)}px ${GLYPH_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let row = 0; row < paletteStops.length; row++) {
    ctx.fillStyle = paletteStops[row]
    for (let col = 0; col < EDGE_GLYPHS.length; col++) {
      ctx.fillText(EDGE_GLYPHS[col], col * cell + cell / 2, row * cell + cell * 0.56)
    }
  }
  return {
    canvas,
    cell,
    glyphCount: EDGE_GLYPHS.length,
    stopCount: paletteStops.length,
    key: `edges|${paletteStops.join()}|${cell}`
  }
}

/** A short zalgo combining-mark string; intensity 0..1 controls stack depth. */
export function zalgoMarks(intensity: number, rng: () => number): string {
  const up = Math.floor(intensity * 4 * rng())
  const down = Math.floor(intensity * 4 * rng())
  let s = ''
  for (let i = 0; i < up; i++) s += ZALGO_UP[Math.floor(rng() * ZALGO_UP.length)]
  for (let i = 0; i < down; i++) s += ZALGO_DOWN[Math.floor(rng() * ZALGO_DOWN.length)]
  return s
}
