// The land the living things stand in: layered hills, a ploughed field in
// perspective, a fence along the horizon, a barn and silo, a windmill, and
// weather. Everything here is *structure* — it does not react to transients the
// way the flock and the tree do, it reacts to weather and to silence, which is
// what makes it read as a place rather than another animated system.
//
// Deterministic by construction: every position comes from a seeded hash, never
// Math.random(), so the same landscape is there every night. You can rehearse
// against it, and a scene recalled mid-set looks like the one you left.
//
// Silence behaviour (the contract says every element needs one): the windmill
// coasts to a stop, the clouds stall, and the chimney smoke thins out — the
// farm holds its breath with the room, same as the tree does.

export interface SceneryDrive {
  wind: number
  bass: number
  level: number
  onset: number
  silence: number
  horizonY: number
  /** 0 midnight · 0.25 dawn · 0.5 noon · 0.75 dusk (wraps) */
  daytime: number
}

/**
 * The day, as light on the land. `sun` is elevation −1..1 (below/above the
 * horizon), `light` is 0..1 daylight, and `body` says which disc to draw. The
 * palette does the colouring — 5 fixed stops, so day and night are expressed
 * as how much of the sky wash is laid down and where the disc sits, not by
 * inventing colours outside the ramp.
 */
export function dayCycle(daytime: number): {
  sun: number
  light: number
  body: 'sun' | 'moon'
  arc: number
} {
  const t = ((daytime % 1) + 1) % 1
  // elevation peaks at noon (0.5) and bottoms at midnight
  const sun = -Math.cos(t * Math.PI * 2)
  const light = Math.max(0, Math.min(1, sun * 0.5 + 0.5))
  // horizontal position tracks whichever body is up, rising left, setting right
  const arc = sun >= 0 ? (t - 0.25) * 2 : (t < 0.25 ? t + 0.75 : t - 0.75) * 2
  return { sun, light, body: sun >= 0 ? 'sun' : 'moon', arc: Math.min(1, Math.max(0, arc)) }
}

/** Deterministic 0..1 from an integer — the whole landscape is built on this. */
function h1(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97) >>> 0
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296
}

export type SceneKind = 'bare' | 'hills' | 'farm'

export class Scenery {
  private smoke = 0
  private vane = 0

  /** Behind everything: sky wash + hills. Drawn before the ground. */
  drawBack(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    kind: SceneKind,
    stops: string[],
    d: SceneryDrive
  ): void {
    if (kind === 'bare') return
    const hy = d.horizonY

    const day = dayCycle(d.daytime)

    // sky wash: a little more weight toward the horizon so the land sits down.
    // Daylight lays more of it down; at night it thins toward the bare ground
    // colour so stars and a low moon still read against it.
    const sky = g.createLinearGradient(0, 0, 0, hy)
    sky.addColorStop(0, stops[0])
    sky.addColorStop(1, stops[1])
    g.globalAlpha = 0.12 + day.light * 0.62
    g.fillStyle = sky
    g.fillRect(0, 0, w, hy)
    g.globalAlpha = 1

    // sun or moon, rising left and setting right on an arc over the horizon
    {
      const r = h * (day.body === 'sun' ? 0.042 : 0.034)
      const bx = w * (0.08 + day.arc * 0.84)
      const elev = Math.abs(day.sun)
      const by = hy - (hy * 0.16 + elev * hy * 0.62)
      g.globalAlpha = day.body === 'sun' ? 0.85 : 0.9
      g.fillStyle = stops[day.body === 'sun' ? 4 : 3]
      g.beginPath()
      g.arc(bx, by, r, 0, Math.PI * 2)
      g.fill()
      if (day.body === 'moon') {
        // bite a crescent out of it with the sky colour behind
        g.fillStyle = stops[0]
        g.globalAlpha = 0.75
        g.beginPath()
        g.arc(bx - r * 0.4, by - r * 0.16, r * 0.92, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }

    // three hill ranges, far to near, each a little darker and a little lower
    for (let layer = 0; layer < 3; layer++) {
      const amp = h * (0.055 - layer * 0.012)
      const base = hy - h * (0.075 - layer * 0.03)
      g.fillStyle = stops[1 + layer]
      g.globalAlpha = 0.32 + layer * 0.16
      g.beginPath()
      g.moveTo(0, hy)
      const steps = 26
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = t * w
        const s = layer * 97 + i
        const y =
          base -
          amp * (0.45 + 0.55 * h1(s)) * Math.sin(t * Math.PI * (1.4 + layer * 0.7) + layer * 2.1) -
          amp * 0.35 * h1(s + 613)
        g.lineTo(x, y)
      }
      g.lineTo(w, hy)
      g.closePath()
      g.fill()
    }
    g.globalAlpha = 1
  }

  /**
   * In front of the ground fill: furrows, fence, buildings, weather.
   * Called after the ground is laid down and before the trees and animals.
   */
  drawFront(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    kind: SceneKind,
    stops: string[],
    d: SceneryDrive
  ): void {
    if (kind === 'bare') return
    const u = h / 1080
    const hy = d.horizonY

    this.drawFurrows(g, w, h, stops, d)
    if (kind === 'farm') {
      this.drawFence(g, w, h, stops, d)
      this.drawBarn(g, w, h, time, stops, d)
      this.drawWindmill(g, w, h, time, stops, d)
    }
    this.drawClouds(g, w, h, time, stops, d)

    // grass along the ground line — the join between field and horizon
    g.strokeStyle = stops[3]
    g.lineWidth = Math.max(1, u)
    g.globalAlpha = 0.5
    g.beginPath()
    const tufts = 150
    for (let i = 0; i < tufts; i++) {
      const x = h1(i * 7 + 11) * w
      const len = (3 + h1(i * 13 + 5) * 7) * u
      const lean = Math.sin(time * 1.1 + i) * d.wind * 2.5 * u
      g.moveTo(x, hy + 2 * u)
      g.lineTo(x + lean, hy + 2 * u - len)
    }
    g.stroke()
    g.globalAlpha = 1
  }

  /** Ploughed rows converging on a vanishing point — cheap, convincing depth. */
  private drawFurrows(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const hy = d.horizonY
    if (hy >= h - 4) return
    const vpX = w * 0.5
    g.strokeStyle = stops[2]
    g.lineWidth = Math.max(1, h / 1080)
    g.globalAlpha = 0.35
    g.beginPath()
    const rows = 26
    for (let i = 0; i <= rows; i++) {
      // spread the near ends far wider than the field so the rows fan out
      const t = i / rows
      const nearX = (t - 0.5) * w * 4 + vpX
      g.moveTo(vpX + (nearX - vpX) * 0.02, hy)
      g.lineTo(nearX, h)
    }
    g.stroke()

    // a few cross-contours, spaced by a perspective-ish falloff
    g.globalAlpha = 0.22
    g.beginPath()
    for (let i = 1; i <= 7; i++) {
      const t = i / 8
      const y = hy + (h - hy) * (t * t)
      g.moveTo(0, y)
      g.lineTo(w, y)
    }
    g.stroke()
    g.globalAlpha = 1
  }

  private drawFence(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const u = h / 1080
    const hy = d.horizonY
    const y = hy + (h - hy) * 0.14
    const postH = 26 * u
    g.strokeStyle = stops[3]
    g.lineWidth = 2 * u
    g.globalAlpha = 0.75
    g.beginPath()
    // two rails
    g.moveTo(0, y - postH * 0.72)
    g.lineTo(w, y - postH * 0.72)
    g.moveTo(0, y - postH * 0.34)
    g.lineTo(w, y - postH * 0.34)
    // posts, slightly irregular so it reads as built not printed
    const n = Math.max(6, Math.round(w / (62 * u)))
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w + (h1(i * 31) - 0.5) * 5 * u
      g.moveTo(x, y)
      g.lineTo(x, y - postH * (0.9 + h1(i * 17) * 0.2))
    }
    g.stroke()
    g.globalAlpha = 1
  }

  private drawBarn(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const u = h / 1080
    const hy = d.horizonY
    const bw = 150 * u
    const bh = 88 * u
    const x = w * 0.16
    const y = hy

    g.fillStyle = stops[4]
    g.globalAlpha = 0.9
    // body + gable roof as one silhouette
    g.beginPath()
    g.moveTo(x - bw / 2, y)
    g.lineTo(x - bw / 2, y - bh * 0.62)
    g.lineTo(x - bw * 0.34, y - bh * 0.92)
    g.lineTo(x, y - bh * 1.12)
    g.lineTo(x + bw * 0.34, y - bh * 0.92)
    g.lineTo(x + bw / 2, y - bh * 0.62)
    g.lineTo(x + bw / 2, y)
    g.closePath()
    g.fill()

    // silo beside it
    const sx = x + bw * 0.72
    const sr = 20 * u
    g.beginPath()
    g.moveTo(sx - sr, y)
    g.lineTo(sx - sr, y - bh * 1.05)
    g.arc(sx, y - bh * 1.05, sr, Math.PI, 0)
    g.lineTo(sx + sr, y)
    g.closePath()
    g.fill()

    // barn door, knocked out of the silhouette
    g.fillStyle = stops[1]
    g.globalAlpha = 0.85
    g.fillRect(x - bw * 0.1, y - bh * 0.4, bw * 0.2, bh * 0.4)

    // chimney smoke: rises while there is sound, thins out in silence
    this.smoke += (1 - d.silence) * 0.6 + 0.05
    const puffs = 7
    g.fillStyle = stops[2]
    for (let i = 0; i < puffs; i++) {
      const t = ((this.smoke * 0.02 + i / puffs) % 1)
      const rise = t * bh * 1.5
      const drift = Math.sin(time * 0.4 + i) * 12 * u + d.wind * rise * 0.35
      g.globalAlpha = (1 - t) * 0.3 * (1 - d.silence * 0.8)
      const r = (3 + t * 11) * u
      g.beginPath()
      g.arc(x + bw * 0.3 + drift, y - bh * 1.15 - rise, r, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }

  private drawWindmill(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const u = h / 1080
    const hy = d.horizonY
    const x = w * 0.83
    const towerH = 150 * u
    const y = hy

    // the vane turns on wind and bass, and coasts to a stop in silence — the
    // farm's own version of the birds landing
    const speed = (0.5 + d.wind * 1.6 + d.bass * 3.2) * (1 - d.silence)
    this.vane += speed * 0.02

    g.strokeStyle = stops[4]
    g.lineWidth = 2.4 * u
    g.globalAlpha = 0.9
    // lattice tower
    g.beginPath()
    const halfBase = 16 * u
    g.moveTo(x - halfBase, y)
    g.lineTo(x - 3 * u, y - towerH)
    g.moveTo(x + halfBase, y)
    g.lineTo(x + 3 * u, y - towerH)
    for (let i = 1; i < 6; i++) {
      const t = i / 6
      const yy = y - towerH * t
      const hw = halfBase * (1 - t) + 3 * u * t
      g.moveTo(x - hw, yy)
      g.lineTo(x + hw, yy)
    }
    g.stroke()

    // multi-blade fan
    const hubY = y - towerH
    const R = 26 * u
    g.lineWidth = 1.6 * u
    g.beginPath()
    for (let i = 0; i < 12; i++) {
      const a = this.vane + (i / 12) * Math.PI * 2
      g.moveTo(x, hubY)
      g.lineTo(x + Math.cos(a) * R, hubY + Math.sin(a) * R)
    }
    g.stroke()
    g.beginPath()
    g.arc(x, hubY, R * 0.24, 0, Math.PI * 2)
    g.fillStyle = stops[4]
    g.fill()
    g.globalAlpha = 1
  }

  private drawClouds(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const hy = d.horizonY
    const drift = time * (0.004 + d.wind * 0.01) * (1 - d.silence * 0.9)
    g.fillStyle = stops[1]
    for (let i = 0; i < 6; i++) {
      const band = h1(i * 41 + 3)
      const cy = hy * (0.12 + band * 0.45)
      const cx = ((h1(i * 29 + 7) + drift * (0.5 + band)) % 1.3) * w * 1.2 - w * 0.1
      const cw = (0.09 + h1(i * 53) * 0.13) * w
      const ch = cw * (0.16 + h1(i * 67) * 0.1)
      g.globalAlpha = 0.16 + h1(i * 71) * 0.14
      g.beginPath()
      // three overlapping ellipses read as a cloud at any size
      g.ellipse(cx, cy, cw * 0.5, ch, 0, 0, Math.PI * 2)
      g.ellipse(cx - cw * 0.28, cy + ch * 0.22, cw * 0.32, ch * 0.72, 0, 0, Math.PI * 2)
      g.ellipse(cx + cw * 0.3, cy + ch * 0.18, cw * 0.28, ch * 0.66, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  }
}
