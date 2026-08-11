// Five-stop color ramps shared by all systems and shown as swatches in the UI.

export const PALETTES: Record<string, string[]> = {
  phosphor: ['#020803', '#0a2f14', '#1a7a3c', '#43d977', '#c9ffe0'],
  amber: ['#0a0400', '#3a1c00', '#8a4a05', '#e6961c', '#ffedbb'],
  ice: ['#02040a', '#0a1e3f', '#15628f', '#41c4e0', '#eafcff'],
  magma: ['#050103', '#3d0a1e', '#8f1536', '#e84a2b', '#ffd985'],
  mono: ['#000000', '#2a2a2e', '#6d6d75', '#c6c6ce', '#ffffff'],
  vapor: ['#080312', '#341b60', '#8a2f92', '#e75fa4', '#a8f6ff'],
  // raster-noton: black field, grey structure, white signal, red accent at peak
  noto: ['#050505', '#2e2e2e', '#7a7a7a', '#f2f2f2', '#ff1e1e'],
  // ink on paper: light background, marks get darker as they get "brighter"
  ink: ['#f2efe6', '#c9c3b2', '#8c8578', '#403c34', '#0f0e0b']
}

/** Perceived luminance 0..1 of a hex color. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb01(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Palettes whose stop[0] is light are "paper" palettes: bg light, marks dark. */
export function isPaper(stops: string[]): boolean {
  return luminance(stops[0]) > 0.5
}

export function hexToRgb01(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/** Sample a palette ramp at t∈[0,1] with linear interpolation between stops. */
export function samplePalette(stops: string[], t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(x))
  const f = x - i
  const a = hexToRgb01(stops[i])
  const b = hexToRgb01(stops[i + 1])
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}
