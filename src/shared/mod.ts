// LFO evaluation and base→effective parameter resolution. Runs every frame in
// the output renderer; kept dependency-free so any client can reuse it.

import { PARAM_MAP, type LfoDef, type ModRoute, type ModSource, type ParamValue } from './params'

function hash01(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Bipolar -1..1 LFO value at time t seconds. */
export function lfoValue(def: LfoDef, t: number): number {
  const ph = t * def.rateHz
  const f = ph - Math.floor(ph)
  switch (def.shape) {
    case 'sine':
      return Math.sin(ph * Math.PI * 2)
    case 'triangle':
      return 4 * Math.abs(f - 0.5) - 1
    case 'saw':
      return f * 2 - 1
    case 'square':
      return f < 0.5 ? 1 : -1
    case 'random':
      return hash01(Math.floor(ph)) * 2 - 1
  }
}

export type ModSources = Record<ModSource, number>

export function emptySources(): ModSources {
  return {
    band0: 0, band1: 0, band2: 0, band3: 0, band4: 0, band5: 0, band6: 0, band7: 0,
    level: 0, onset: 0, silence: 0, lfo0: 0, lfo1: 0, lfo2: 0, lfo3: 0
  }
}

/**
 * Resolve effective values: base + Σ(depth × source × range), clamped.
 * Only number params flagged modulatable are affected.
 */
export function computeEffective(
  base: Record<string, ParamValue>,
  routes: ModRoute[],
  sources: ModSources
): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = { ...base }
  for (const r of routes) {
    const def = PARAM_MAP[r.target]
    if (!def || def.kind !== 'number' || !def.mod) continue
    const src = sources[r.source]
    if (src === undefined || src === 0) continue
    const cur = out[r.target]
    const span = def.max - def.min
    const next = (typeof cur === 'number' ? cur : def.def) + r.depth * src * span
    out[r.target] = Math.min(def.max, Math.max(def.min, next))
  }
  return out
}
