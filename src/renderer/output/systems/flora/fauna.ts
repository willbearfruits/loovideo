// Livestock. Quadruped silhouettes grazing the field, drawn in perspective —
// the further up the field an animal stands, the smaller and paler it is.
//
// They are the slow layer. The flock reacts in milliseconds and the tree grows
// over minutes; the herd works in seconds — heads come up on a transient, they
// amble between grazing spots, and they bunch when something startles them.
//
// Silence: heads down, walking stops, and after a long quiet they lie down.
// Sound brings them back to their feet.

export interface FaunaDrive {
  wind: number
  scatter: number
  level: number
  onset: number
  silence: number
  horizonY: number
}

interface Beast {
  /** 0..1 across the field, 0..1 up the field (0 = nearest the camera) */
  x: number
  depth: number
  dir: number
  speed: number
  /** 0 grazing (head down) · 1 head up · 2 lying down */
  head: number
  alert: number
  gait: number
  seed: number
  targetX: number
}

export class Fauna {
  private herd: Beast[] = []
  private lastOnset = 0
  private key = ''

  resize(count: number): void {
    const k = String(count)
    if (k === this.key) return
    this.key = k
    const old = this.herd
    this.herd = []
    for (let i = 0; i < count; i++) {
      if (i < old.length) {
        this.herd.push(old[i])
        continue
      }
      const r = (n: number): number => {
        const s = Math.sin(i * 91.7 + n * 13.3) * 43758.5453
        return s - Math.floor(s)
      }
      this.herd.push({
        x: 0.08 + r(1) * 0.84,
        depth: r(2),
        dir: r(3) < 0.5 ? -1 : 1,
        speed: 0.004 + r(4) * 0.008,
        head: 0,
        alert: 0,
        gait: r(5) * Math.PI * 2,
        seed: r(6),
        targetX: 0.08 + r(7) * 0.84
      })
    }
  }

  update(dt: number, w: number, h: number, d: FaunaDrive): void {
    const onsetEdge = d.onset > 0.85 && this.lastOnset <= 0.85
    this.lastOnset = d.onset

    for (const b of this.herd) {
      // a transient lifts every head; a big one with scatter behind it moves them
      if (onsetEdge) {
        b.alert = Math.min(1, b.alert + 0.5 + d.scatter * 0.5)
        if (d.scatter > 0.5 && b.seed < d.scatter) {
          b.targetX = Math.min(0.95, Math.max(0.05, b.targetX + (Math.random() - 0.5) * 0.3))
        }
      }
      b.alert = Math.max(0, b.alert - dt * 0.45)

      if (d.silence > 0.75) {
        b.head = 2 // lying down
      } else if (b.alert > 0.25) {
        b.head = 1 // head up, watching
      } else {
        b.head = 0 // grazing
      }

      // amble toward the target patch, but only while there is something to hear
      if (b.head !== 2) {
        const dx = b.targetX - b.x
        if (Math.abs(dx) > 0.004) {
          const move = b.speed * dt * 60 * (0.3 + d.level * 2 + b.alert) * (1 - d.silence * 0.8)
          b.x += Math.sign(dx) * Math.min(Math.abs(dx), move * 0.01)
          b.dir = Math.sign(dx)
          b.gait += move * 0.6
        } else if (Math.random() < dt * 0.12) {
          b.targetX = Math.min(0.95, Math.max(0.05, b.x + (Math.random() - 0.5) * 0.4))
        }
      }
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, stops: string[], d: FaunaDrive): void {
    if (this.herd.length === 0) return
    const u = h / 1080
    const hy = d.horizonY
    const fieldH = Math.max(1, h - hy)

    // far animals first so near ones overlap them correctly
    const sorted = [...this.herd].sort((a, b) => b.depth - a.depth)
    for (const b of sorted) {
      // perspective: depth 1 sits at the horizon, depth 0 at the bottom edge
      const y = hy + fieldH * (1 - b.depth) * 0.92 + fieldH * 0.04
      const scale = (0.35 + (1 - b.depth) * 0.85) * u
      const bw = 42 * scale
      const bh = 22 * scale
      const legH = 15 * scale

      g.fillStyle = stops[4]
      g.globalAlpha = (0.55 + (1 - b.depth) * 0.4) * (1 - d.silence * 0.15)

      if (b.head === 2) {
        // lying down: body on the ground, no legs, head tucked
        g.beginPath()
        g.ellipse(b.x * w, y - bh * 0.4, bw * 0.55, bh * 0.42, 0, 0, Math.PI * 2)
        g.fill()
        continue
      }

      const cx = b.x * w
      const bodyY = y - legH - bh * 0.5
      // body
      g.beginPath()
      g.ellipse(cx, bodyY, bw * 0.5, bh * 0.5, 0, 0, Math.PI * 2)
      g.fill()

      // legs — a simple two-phase gait, enough at this size
      g.strokeStyle = stops[4]
      g.lineWidth = Math.max(1, 2.4 * scale)
      g.beginPath()
      for (let i = 0; i < 4; i++) {
        const lx = cx + (i < 2 ? -1 : 1) * bw * 0.3 + (i % 2 === 0 ? -1 : 1) * bw * 0.06
        const swing = Math.sin(b.gait + i * 1.7) * legH * 0.28
        g.moveTo(lx, bodyY + bh * 0.35)
        g.lineTo(lx + swing, y)
      }
      g.stroke()

      // neck + head: down to the grass when grazing, up and forward when alert
      const hx = cx + b.dir * bw * 0.52
      const headY = b.head === 1 ? bodyY - bh * 0.85 : y - legH * 0.15
      g.lineWidth = Math.max(1, 3.4 * scale)
      g.beginPath()
      g.moveTo(cx + b.dir * bw * 0.34, bodyY - bh * 0.1)
      g.lineTo(hx, headY)
      g.stroke()
      g.beginPath()
      g.ellipse(hx, headY, bw * 0.11, bh * 0.17, 0, 0, Math.PI * 2)
      g.fill()

      // tail
      g.lineWidth = Math.max(1, 1.6 * scale)
      g.beginPath()
      g.moveTo(cx - b.dir * bw * 0.46, bodyY - bh * 0.15)
      g.lineTo(
        cx - b.dir * bw * 0.56 + Math.sin(b.gait * 0.7) * 3 * scale,
        bodyY + bh * 0.5
      )
      g.stroke()
    }
    g.globalAlpha = 1
  }
}
