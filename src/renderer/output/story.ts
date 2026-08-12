// The story director. A narrative is a slow automation over the param spine:
// each act snaps a handful of params on entry (through the hub, so every
// client sees the same world) and drives a few continuously (the day's arc,
// the season's turn, the storm's wind). The clock is CUMULATIVE MUSICAL
// ENERGY — level integrated over time — so the world ages by how much sound
// has passed through it, and silence holds time still.
//
// THE CYCLE: grain → sprout → tree → grove → forest alive → storm → autumn →
// winter → return. The return fells the forest, the camera follows the last
// leaf down, and the felled trees replant as saplings: the loop closes.

import type { OutputNet } from './net'
import type { AudioFrame } from './audio'
import type { StoryCtx } from './systems/types'
import type { ParamValue } from '../../shared/params'

interface Act {
  name: string
  /** level-seconds of music to complete the act */
  energy: number
  cam: StoryCtx['cam']
  /** world-day advance per energy-second */
  daySpeed: number
  /** params snapped via the hub on entry */
  set?: Record<string, ParamValue>
  /** momentary flags fired on entry (spring back on their own) */
  pulse?: string[]
  /** season driven across the act, from → to */
  season?: [number, number]
  /** extra wind faded in across the act */
  windBoost?: number
  /** master brightness driven toward this by the END of the act */
  dimTo?: number
  /** wall-clock floor: a loud track cannot blow through this act faster */
  minSec?: number
}

const CYCLE: Act[] = [
  {
    name: 'GRAIN', energy: 5, cam: 'seed', daySpeed: 0,
    set: {
      'flora.mode': 'tree', 'flora.trees': 1, 'flora.treeKind': 'oak',
      'flora.sprout': 0, 'flora.vigor': 0.5, 'flora.endless': true,
      'flora.succession': false, 'flora.addFlock': false, 'flora.addStars': true,
      'flora.animals': 0, 'flora.leaves': 0.7, 'flora.season': 0.06,
      'flora.scene': 'hills', 'flora.fit': 0.9
    }
  },
  { name: 'SPROUT', energy: 18, cam: 'seed', daySpeed: 0.004, set: { 'flora.vigor': 1.2, 'flora.season': 0.12 } },
  { name: 'TREE', energy: 40, cam: 'auto', daySpeed: 0.004, set: { 'flora.vigor': 1.6, 'flora.wind': 0.55, 'flora.season': 0.3 } },
  {
    name: 'GROVE', energy: 45, cam: 'drift', daySpeed: 0.006,
    set: { 'flora.sprout': 0.85, 'flora.succession': true, 'flora.season': 0.35 }
  },
  {
    name: 'ALIVE', energy: 60, cam: 'drift', daySpeed: 0.006,
    set: { 'flora.addFlock': true, 'flora.flockKind': 'starlings', 'flora.animals': 5, 'flora.scatter': 0.7, 'flora.season': 0.4 }
  },
  { name: 'STORM', energy: 25, cam: 'drift', daySpeed: 0.01, windBoost: 1.25, minSec: 20, set: { 'flora.scatter': 0.95, 'flora.season': 0.45 } },
  { name: 'AUTUMN', energy: 30, cam: 'drift', daySpeed: 0.006, season: [0.5, 0.75], windBoost: 0.4 },
  { name: 'WINTER', energy: 25, cam: 'auto', daySpeed: 0.008, season: [0.75, 0.95], set: { 'flora.animals': 0, 'flora.sprout': 0 } },
  {
    // the denouement must be bought with real time — a token payoff after a
    // long rise is the most common pacing mistake (Reagan et al.; Journey)
    name: 'RETURN', energy: 22, cam: 'leaf', daySpeed: 0.006, season: [0.95, 0.99],
    pulse: ['flora.fell'], dimTo: 0.25, minSec: 30, set: { 'flora.vigor': 0.3, 'flora.addFlock': false }
  }
]

export interface StoryOverrides {
  daytime?: number
  season?: number
  windAdd: number
  brightnessMul: number
}

export class Story {
  private actIdx = -1
  private acc = 0
  private actWallT = 0
  private hushT = 0
  private dayT = 0.27
  private wasOn = false
  private lastSkip = false
  readonly overrides: StoryOverrides = { windAdd: 0, brightnessMul: 1 }

  constructor(
    private net: OutputNet,
    private ctx: StoryCtx
  ) {}

  private enter(idx: number): void {
    this.actIdx = ((idx % CYCLE.length) + CYCLE.length) % CYCLE.length
    this.acc = 0
    this.actWallT = 0
    this.hushT = 0
    const act = CYCLE[this.actIdx]
    if (this.actIdx === 0) this.dayT = 0.27 // the cycle begins in the morning
    if (act.set) for (const [id, v] of Object.entries(act.set)) this.net.send({ t: 'set', id, value: v })
    for (const id of act.pulse ?? []) this.net.send({ t: 'set', id, value: true })
    this.ctx.cam = act.cam
  }

  /** Call once per frame. Reads story.* params from base values. */
  frame(dt: number, audio: AudioFrame, values: Record<string, ParamValue>): void {
    const on = values['story.on'] === true
    const o = this.overrides
    if (!on) {
      if (this.wasOn) {
        this.ctx.on = false
        this.ctx.cam = 'auto'
        o.daytime = undefined
        o.season = undefined
        o.windAdd = 0
        o.brightnessMul = 1
      }
      this.wasOn = false
      return
    }
    this.ctx.on = true
    if (!this.wasOn || this.actIdx < 0) this.enter(this.actIdx < 0 ? 0 : this.actIdx)
    this.wasOn = true

    // manual skip: momentary param, spring it back
    const skip = values['story.skip'] === true
    if (skip && !this.lastSkip) {
      this.net.send({ t: 'set', id: 'story.skip', value: false })
      this.enter(this.actIdx + 1)
    }
    this.lastSkip = skip

    const act = CYCLE[this.actIdx]
    const pace = typeof values['story.pace'] === 'number' ? (values['story.pace'] as number) : 1
    // the world's clock: music that actually happened
    const e = (audio.active ? audio.level : 0.15) * dt * pace
    this.acc += e
    this.actWallT += dt
    this.dayT = (this.dayT + e * act.daySpeed * 60) % 1

    const t = Math.min(1, this.acc / act.energy)
    o.daytime = this.dayT
    o.season = act.season ? act.season[0] + (act.season[1] - act.season[0]) * t : undefined
    o.windAdd = (act.windBoost ?? 0) * Math.sin(Math.min(1, t * 1.15) * Math.PI) // in and back out
    o.brightnessMul = act.dimTo !== undefined ? 1 + (act.dimTo - 1) * t * t : 1

    // foreshadowing: two micro-gusts inside ALIVE — the storm at 25% amplitude,
    // one act early, so the peak lands as foretold rather than random
    if (act.name === 'ALIVE') {
      const g1 = Math.exp(-Math.pow((t - 0.45) / 0.015, 2))
      const g2 = Math.exp(-Math.pow((t - 0.63) / 0.015, 2))
      o.windAdd = Math.max(o.windAdd, 0.32 * Math.max(g1, g2))
      if (g1 + g2 > 0.3) o.brightnessMul *= 0.955
    }

    // the hollow before the peak (the Journey rule): when ALIVE has run its
    // course, the world holds its breath on WALL-CLOCK time — wind dies, the
    // light dips — and STORM breaks on the next strong onset
    if (act.name === 'ALIVE' && this.acc >= act.energy) {
      this.hushT += dt
      o.windAdd = -2 // clamped at the wind floor: stillness
      o.brightnessMul = 0.92
      if ((this.hushT > 8 && audio.onset >= 0.99) || this.hushT > 25) this.enter(this.actIdx + 1)
      return
    }

    if (this.acc >= act.energy && this.actWallT >= (act.minSec ?? 0)) this.enter(this.actIdx + 1)
  }

  get info(): { act: number; total: number; name: string; t: number } | null {
    if (!this.wasOn || this.actIdx < 0) return null
    const act = CYCLE[this.actIdx]
    return { act: this.actIdx + 1, total: CYCLE.length, name: act.name, t: Math.min(1, this.acc / act.energy) }
  }
}
