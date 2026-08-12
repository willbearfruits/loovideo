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
  /** mirror strength of the lake, 0..1 — modulatable */
  reflection: number
  /** visible world-x range inside the overscan backdrop, for culling */
  viewL?: number
  viewR?: number
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

export type SceneKind = 'bare' | 'hills' | 'farm' | 'lake'

interface Ripple {
  x: number
  y: number
  r: number
  life: number
}

export class Scenery {
  private ripples: Ripple[] = []
  private rippleOnsetPrev = 0

  /**
   * Still water below the ground line: the finished frame above the shoreline
   * is copied back in, flipped, in thin strips displaced sideways — deeper
   * strips wander more and fade further. Everything reflects: trees, birds,
   * fireflies, the moon. Onsets ring the surface.
   */
  drawWater(
    g: CanvasRenderingContext2D,
    src: HTMLCanvasElement,
    w: number,
    h: number,
    dt: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const hy = Math.round(d.horizonY)
    const depth = h - hy
    if (depth < 8) return
    const u = h / 1080

    // water base: darker than land — a mirror loses light
    g.globalAlpha = 0.62
    g.fillStyle = stops[0]
    g.fillRect(0, hy, w, depth)

    // flipped strips; compression 0.92 so the reflection is slightly foreshortened
    const strip = Math.max(2, Math.round(3 * u))
    for (let y = 0; y < depth; y += strip) {
      const srcY = hy - Math.round(y * 0.92) - strip
      if (srcY < 0) break
      const df = y / depth
      const amp = (0.6 + df * 4.2) * u
      const shift =
        Math.sin(y * 0.052 + time * 1.35) * amp + Math.sin(y * 0.019 - time * 0.6) * amp * 0.6
      g.globalAlpha = 0.38 * (1 - df * 0.75) * Math.min(1.8, d.reflection * 1.8)
      g.drawImage(src, 0, srcY, w, strip, shift, hy + y, w, strip)
    }

    // ripple rings: onsets strike the surface; the rest is occasional stillness
    if (d.onset > 0.85 && this.rippleOnsetPrev <= 0.85) {
      this.ripples.push({ x: Math.random() * w, y: hy + Math.random() * depth * 0.5, r: 2, life: 1 })
    }
    this.rippleOnsetPrev = d.onset
    if (Math.random() < dt * 5 * (1 - d.silence)) {
      // small ambient rings while sound plays
      if (this.ripples.length < 14)
        this.ripples.push({ x: Math.random() * w, y: hy + Math.random() * depth * 0.6, r: 1, life: 0.7 })
    }
    g.lineWidth = Math.max(1, u)
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const R = this.ripples[i]
      R.r += 62 * u * dt
      R.life -= dt * 0.55
      if (R.life <= 0) {
        this.ripples.splice(i, 1)
        continue
      }
      g.strokeStyle = stops[3]
      g.globalAlpha = 0.28 * R.life
      g.beginPath()
      g.ellipse(R.x, R.y, R.r, R.r * 0.32, 0, 0, Math.PI * 2)
      g.stroke()
      g.globalAlpha = 0.16 * R.life
      g.beginPath()
      g.ellipse(R.x, R.y, R.r * 0.62, R.r * 0.2, 0, 0, Math.PI * 2)
      g.stroke()
    }

    // the shoreline: one bright hairline where world meets mirror
    g.globalAlpha = 0.5
    g.strokeStyle = stops[3]
    g.beginPath()
    g.moveTo(0, hy)
    g.lineTo(w, hy)
    g.stroke()
    g.globalAlpha = 1
  }
  private smoke = 0
  private vane = 0

  /**
   * The far world: points of interest scattered across the overscan, one per
   * ~zone, decided by hash — a mountain ridge, a cabin with a window that
   * lights at night and a thread of chimney smoke, a pair of wild deer.
   * Zoomed in you never see them; pull back and the world has neighbours.
   */
  drawFarPoints(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const u = h / 1080
    const hy = d.horizonY
    const day = dayCycle(d.daytime)
    const zone = h * 1.4
    const vL = d.viewL ?? 0
    const vR = d.viewR ?? w
    const z0 = Math.max(0, Math.floor(vL / zone))
    const z1 = Math.min(Math.ceil(w / zone), Math.ceil(vR / zone))
    for (let z = z0; z <= z1; z++) {
      const hh = Math.sin(z * 971.3) * 43758.5453
      const r = hh - Math.floor(hh)
      const cx = (z + 0.5) * zone + (r - 0.5) * zone * 0.5
      if (cx < vL - 200 || cx > vR + 200) continue
      const kind = Math.floor(r * 10)
      if (kind < 4) continue // most zones are just land

      if (kind < 6) {
        // mountain ridge, pale — tone says far
        g.fillStyle = stops[1]
        g.globalAlpha = 0.5
        g.beginPath()
        g.moveTo(cx - zone * 0.45, hy)
        for (let k = 0; k <= 8; k++) {
          const t = k / 8
          const hh2 = Math.sin((z * 13 + k) * 77.7) * 4375.5
          const rr = hh2 - Math.floor(hh2)
          g.lineTo(cx - zone * 0.45 + t * zone * 0.9, hy - h * (0.1 + rr * 0.16) * (1 - Math.abs(t - 0.5) * 1.6))
        }
        g.lineTo(cx + zone * 0.45, hy)
        g.closePath()
        g.fill()
      } else if (kind < 8) {
        // a cabin: gable silhouette, lit window at night, chimney smoke
        const cw = 54 * u
        const ch = 34 * u
        g.globalAlpha = 0.85
        g.fillStyle = stops[3]
        g.fillRect(cx - cw / 2, hy - ch, cw, ch)
        g.beginPath()
        g.moveTo(cx - cw * 0.62, hy - ch)
        g.lineTo(cx, hy - ch - cw * 0.42)
        g.lineTo(cx + cw * 0.62, hy - ch)
        g.closePath()
        g.fill()
        if (day.light < 0.45) {
          g.fillStyle = stops[4]
          g.globalAlpha = 0.9
          g.fillRect(cx + cw * 0.12, hy - ch * 0.62, cw * 0.18, ch * 0.28)
        }
        // smoke: a wavering dotted thread, thinning in silence
        g.fillStyle = stops[2]
        for (let s = 0; s < 7; s++) {
          const sy = hy - ch - cw * 0.42 - s * 9 * u
          const sx = cx - cw * 0.28 + Math.sin(time * 0.7 + s * 0.9 + z) * (2 + s * 1.6) * u
          g.globalAlpha = (0.4 - s * 0.05) * (1 - d.silence * 0.6)
          g.fillRect(sx, sy, (2 + s * 0.5) * u, (2 + s * 0.5) * u)
        }
      } else {
        // wild deer, far off: two slim silhouettes, heads down, one lookout
        g.fillStyle = stops[3]
        for (let a = 0; a < 2; a++) {
          const ax = cx + a * 30 * u
          const lift = a === 1 && Math.sin(time * 0.23 + z) > 0.6 ? 6 * u : 0
          g.globalAlpha = 0.7
          g.fillRect(ax, hy - 12 * u, 16 * u, 7 * u)
          g.fillRect(ax + 13 * u, hy - 17 * u - lift, 3 * u, 7 * u)
          g.fillRect(ax + 2 * u, hy - 6 * u, 2 * u, 6 * u)
          g.fillRect(ax + 12 * u, hy - 6 * u, 2 * u, 6 * u)
        }
      }
    }
    g.globalAlpha = 1
  }

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

    if (kind === 'lake') {
      // the water is drawn later, over the finished world (drawWater);
      // here only the drifting sky belongs to the shore
      this.drawClouds(g, w, h, time, stops, d)
      return
    }

    this.drawFurrows(g, w, h, time, stops, d)
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
    const tufts = Math.round(w / 7.5) // density holds under backdrop overscan
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

  /**
   * A meadow, not a wireframe: a dark settling band under the horizon, then
   * scattered grass tufts — sparser and larger toward the viewer, leaning
   * with the wind. Deterministic (seeded hash), so the same field is there
   * every night. Replaces the ploughed-grid look that read as synthwave.
   */
  private drawFurrows(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: SceneryDrive
  ): void {
    const hy = d.horizonY
    if (hy >= h - 4) return
    const u = h / 1080

    // the land settles: a band of tone right under the horizon, fading near
    const band = g.createLinearGradient(0, hy, 0, h)
    band.addColorStop(0, stops[1])
    band.addColorStop(0.35, stops[1])
    band.addColorStop(1, stops[0])
    g.globalAlpha = 0.5
    g.fillStyle = band
    g.fillRect(0, hy, w, h - hy)

    // grass tufts with perspective: far = small, dense, pale · near = tall,
    // sparse, darker; all of them leaning into the gusts
    g.lineCap = 'round'
    const N = Math.round(w / 6.5) // density holds under backdrop overscan
    const vL = (d.viewL ?? 0) - 40
    const vR = (d.viewR ?? w) + 40
    const lean = Math.sin(time * 0.9) * 0.35 + Math.sin(time * 0.37 + 1.7) * 0.25
    for (let i = 0; i < N; i++) {
      const hh = Math.sin(i * 127.1) * 43758.5453
      const r1 = hh - Math.floor(hh)
      const hh2 = Math.sin(i * 311.7) * 27183.31
      const r2 = hh2 - Math.floor(hh2)
      const depth = Math.pow(r1, 1.6) // bias toward the far field
      const x = r2 * w
      if (x < vL || x > vR) continue // outside the camera's window
      const y = hy + (h - hy) * depth
      const size = (2.5 + depth * 13) * u
      const sway = lean * d.wind * size * 0.45 * (0.6 + r2 * 0.8)
      g.strokeStyle = stops[2]
      g.globalAlpha = 0.1 + depth * 0.3
      g.lineWidth = Math.max(0.8, u * (0.7 + depth))
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + sway * 0.4, y - size * 0.6, x + sway, y - size)
      g.moveTo(x - size * 0.18, y)
      g.quadraticCurveTo(x - size * 0.2 + sway * 0.3, y - size * 0.45, x + sway * 0.7 - size * 0.1, y - size * 0.78)
      g.stroke()
    }
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
