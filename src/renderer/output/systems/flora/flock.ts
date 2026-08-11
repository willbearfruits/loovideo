// Murmuration, built on the STARFLAG/StarDisplay findings: ~7 topological
// neighbors, alignment dominant, cohesion deliberately weak, a narrow speed
// band with relaxation toward cruise, roost attraction instead of screen
// edges, and panic *contagion* (copied from neighbors faster than birds fly)
// which produces the traveling dark density waves real flocks show.
//
// Narrative: sound keeps the flock airborne; bass pulls it together; onsets
// are predator strikes whose panic ripples outward; sustained silence lowers
// the roost and the birds funnel down to the ground line — the murmuration's
// real-world ending — until sound returns and they take off in a stagger.

export interface FlockDrive {
  energy: number // vigor param 0..2
  vigor: number // same value; tree/stars name it vigor
  wind: number
  scatter: number
  bass: number
  treble: number
  level: number
  onset: number
  silence: number
  horizonY: number
}

const FLY = 0
const PERCHED = 2

export class Flock {
  n = 0
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private panic = new Float32Array(0)
  private state = new Uint8Array(0)
  private takeoff = new Float32Array(0)
  private rnd = new Float32Array(0)

  private head = new Int32Array(0)
  private next = new Int32Array(0)
  private gw = 0
  private gh = 0
  private cell = 64

  private lastOnset = 0
  private strikeX = 0
  private strikeY = 0
  private strikeT = 1e9

  resize(count: number, w: number, h: number): void {
    if (count === this.n) return
    const old = this.n
    const grow = (a: Float32Array): Float32Array<ArrayBuffer> => {
      const b = new Float32Array(count)
      b.set(a.subarray(0, Math.min(old, count)))
      return b
    }
    this.px = grow(this.px)
    this.py = grow(this.py)
    this.vx = grow(this.vx)
    this.vy = grow(this.vy)
    this.panic = grow(this.panic)
    this.takeoff = grow(this.takeoff)
    this.rnd = grow(this.rnd)
    const st = new Uint8Array(count)
    st.set(this.state.subarray(0, Math.min(old, count)))
    this.state = st
    for (let i = old; i < count; i++) {
      this.px[i] = w * (0.35 + Math.random() * 0.3)
      this.py[i] = h * (0.18 + Math.random() * 0.3)
      const a = Math.random() * Math.PI * 2
      this.vx[i] = Math.cos(a) * 230
      this.vy[i] = Math.sin(a) * 230
      this.rnd[i] = Math.random()
      this.state[i] = FLY
    }
    this.n = count
    this.next = new Int32Array(count)
  }

  update(dt: number, time: number, w: number, h: number, d: FlockDrive): void {
    const u = h / 1080
    const n = this.n
    if (n === 0) return
    dt = Math.min(dt, 0.05)

    // spatial hash
    this.cell = 64 * u
    const gw = Math.max(1, Math.ceil(w / this.cell))
    const gh = Math.max(1, Math.ceil(h / this.cell))
    if (this.head.length !== gw * gh) this.head = new Int32Array(gw * gh)
    this.gw = gw
    this.gh = gh
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      const cx = Math.min(gw - 1, Math.max(0, (this.px[i] / this.cell) | 0))
      const cy = Math.min(gh - 1, Math.max(0, (this.py[i] / this.cell) | 0))
      const c = cy * gw + cx
      this.next[i] = this.head[c]
      this.head[c] = i
    }

    // predator strike on onset edge
    if (d.onset > 0.85 && this.lastOnset <= 0.85 && d.scatter > 0.02) {
      this.strikeT = 0
      // strike near the flock, not at random empty sky
      let cx = 0
      let cy = 0
      for (let i = 0; i < n; i += 16) {
        cx += this.px[i]
        cy += this.py[i]
      }
      const m = Math.ceil(n / 16)
      this.strikeX = cx / m + (Math.random() - 0.5) * 200 * u
      this.strikeY = cy / m + (Math.random() - 0.5) * 160 * u
    }
    this.lastOnset = d.onset
    this.strikeT += dt

    // roost anchor: drifts slowly across the sky; silence sinks it to the
    // ground line (pre-roost descent) and calms the cruise speed
    const anchorX = w * (0.5 + 0.12 * Math.sin(time * 0.033) + 0.06 * Math.sin(time * 0.011 + 2))
    const skyY = h * 0.34
    const anchorY = skyY + (d.horizonY - skyY) * d.silence
    const freeR = Math.min(w, h) * (0.36 - d.silence * 0.16)
    const rampR = Math.min(w, h) * 0.25

    const cruiseBase = (215 + 95 * Math.min(2, d.energy) * (0.4 + d.level)) * u * (1 - d.silence * 0.45)
    const maxSp = cruiseBase * 1.35
    const minSp = cruiseBase * 0.62
    const sepR = 14 * u
    const sepR2 = sepR * sepR
    const R = 88 * u // perception cap; k-nearest-ish via 7-neighbor cap
    const R2 = R * R
    const cohBoost = 1 + d.bass * 2.6
    const groundY = d.horizonY
    const landBase = d.silence > 0.4 ? (d.silence - 0.35) * 0.5 : 0
    const wake = d.silence < 0.2

    for (let i = 0; i < n; i++) {
      if (this.state[i] === PERCHED) {
        if (wake) {
          this.takeoff[i] -= dt
          if (this.takeoff[i] <= 0) {
            this.state[i] = FLY
            const a = -Math.PI * (0.3 + Math.random() * 0.4)
            const s = cruiseBase * (0.8 + Math.random() * 0.4)
            this.vx[i] = Math.cos(a) * s
            this.vy[i] = Math.sin(a) * s
            this.panic[i] = 0.4 // takeoff flurry
          }
        } else {
          this.takeoff[i] = 0.1 + this.rnd[i] * 2.6
        }
        continue
      }

      // neighbor pass — 3×3 cells, first 7 within range (topological-ish)
      let sepX = 0, sepY = 0, alX = 0, alY = 0, cohX = 0, cohY = 0
      let cnt = 0
      let perchedNear = 0
      let panicMax = 0
      const cx = Math.min(gw - 1, Math.max(0, (this.px[i] / this.cell) | 0))
      const cy = Math.min(gh - 1, Math.max(0, (this.py[i] / this.cell) | 0))
      outer: for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy
        if (yy < 0 || yy >= gh) continue
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox
          if (xx < 0 || xx >= gw) continue
          for (let j = this.head[yy * gw + xx]; j !== -1; j = this.next[j]) {
            if (j === i) continue
            const dx = this.px[j] - this.px[i]
            const dy = this.py[j] - this.py[i]
            const d2 = dx * dx + dy * dy
            if (d2 > R2) continue
            if (this.state[j] === PERCHED) {
              perchedNear++
              continue
            }
            cnt++
            alX += this.vx[j]
            alY += this.vy[j]
            cohX += dx
            cohY += dy
            if (this.panic[j] > panicMax) panicMax = this.panic[j]
            if (d2 < sepR2 && d2 > 1e-4) {
              const inv = 1 / Math.sqrt(d2)
              sepX -= dx * inv
              sepY -= dy * inv
            }
            if (cnt >= 7) break outer
          }
        }
      }

      // panic: decay + contagion (copied at 0.7× from the most panicked
      // neighbor — the wave travels faster than the birds do)
      let pn = Math.max(this.panic[i] * Math.exp(-dt / 1.1), 0.7 * panicMax)
      if (this.strikeT < 0.35) {
        const dx = this.px[i] - this.strikeX
        const dy = this.py[i] - this.strikeY
        const dist2 = dx * dx + dy * dy
        const fear = 190 * u * (0.6 + d.scatter)
        if (dist2 < fear * fear) pn = 1
      }
      this.panic[i] = pn

      let ax = 0
      let ay = 0
      if (cnt > 0) {
        const inv = 1 / cnt
        // alignment dominant · separation short+strong · cohesion weak
        ax += (alX * inv - this.vx[i]) * 4.2
        ay += (alY * inv - this.vy[i]) * 4.2
        ax += sepX * 260 * u * (1 + 2 * pn)
        ay += sepY * 260 * u * (1 + 2 * pn)
        ax += cohX * inv * 0.05 * cohBoost
        ay += cohY * inv * 0.05 * cohBoost
      }

      // flee an active strike
      if (this.strikeT < 0.5) {
        const dx = this.px[i] - this.strikeX
        const dy = this.py[i] - this.strikeY
        const dist = Math.hypot(dx, dy) + 1
        const fall = Math.exp(-dist / (240 * u))
        ax += (dx / dist) * 2600 * u * d.scatter * fall
        ay += (dy / dist) * 2600 * u * d.scatter * fall
      }

      // roost attraction: zero inside the free zone, quadratic ramp outside
      {
        const dx = anchorX - this.px[i]
        const dy = anchorY - this.py[i]
        const dist = Math.hypot(dx, dy)
        if (dist > freeR) {
          const t = Math.min(1, (dist - freeR) / rampR)
          const f = 260 * u * t * t
          ax += (dx / dist) * f
          ay += (dy / dist) * f
        }
      }
      // keep off the ground while flying (unless landing narrative is on)
      if (landBase === 0 && this.py[i] > groundY - 30 * u) ay -= (this.py[i] - (groundY - 30 * u)) * 6

      // gust field + per-bird noise (prevents crystallization)
      ax += Math.sin(time * 0.21 + this.py[i] * 0.0021) * 30 * d.wind
      ay += Math.cos(time * 0.17 + this.px[i] * 0.0016) * 14 * d.wind
      ax += (Math.sin(time * 5.1 + i * 1.7) + Math.sin(time * 3.3 + i * 0.71)) * 40 * u
      ay += (Math.cos(time * 4.7 + i * 2.3) + Math.cos(time * 3.9 + i * 1.13)) * 40 * u

      this.vx[i] += ax * dt
      this.vy[i] += ay * dt

      // narrow speed band: relax toward cruise (τ = 0.5 s), panic surges it
      const sp = Math.hypot(this.vx[i], this.vy[i]) || 1
      const cruise = cruiseBase * (1 + 0.45 * pn)
      let k = 1 + ((cruise - sp) / sp) * Math.min(1, dt / 0.5)
      const capped = Math.min(maxSp * (1 + 0.4 * pn), Math.max(minSp, sp * k))
      k = capped / sp
      this.vx[i] *= k
      this.vy[i] *= k

      this.px[i] += this.vx[i] * dt
      this.py[i] += this.vy[i] * dt

      // landing: base trickle + social cascade (the roost funnel)
      if (landBase > 0 && this.py[i] > groundY - 60 * u) {
        const social = perchedNear > 0 ? 1.4 * Math.min(1, perchedNear / 7) : 0
        if (Math.random() < dt * (landBase * (0.4 + this.rnd[i]) + social)) {
          this.state[i] = PERCHED
          this.py[i] = groundY
          this.vx[i] = 0
          this.vy[i] = 0
          this.panic[i] = 0
          this.takeoff[i] = 0.1 + this.rnd[i] * 2.6
        }
      }
      if (this.py[i] > groundY) {
        this.py[i] = groundY
        this.vy[i] = -Math.abs(this.vy[i]) * 0.5
      }
    }
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, stops: string[], d: FlockDrive): void {
    const u = h / 1080
    // ground hairline — the stage the silence narrative lands on
    g.globalAlpha = 0.4
    g.strokeStyle = stops[2]
    g.lineWidth = Math.max(1, u)
    g.beginPath()
    g.moveTo(0, d.horizonY)
    g.lineTo(w, d.horizonY)
    g.stroke()

    // birds are dots — density does the drawing, overlap makes the billows
    const s = Math.max(1.5, 2.2 * u)
    g.fillStyle = stops[4]
    g.globalAlpha = 0.78
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] === PERCHED) continue
      g.fillRect(this.px[i] - s / 2, this.py[i] - s / 2, s, s)
    }
    // perched birds sit on the line
    g.globalAlpha = 0.92
    for (let i = 0; i < this.n; i++) {
      if (this.state[i] !== PERCHED) continue
      g.fillRect(this.px[i] - u, this.py[i] - 2.6 * u, 2.2 * u, 2.6 * u)
    }
    g.globalAlpha = 1
  }
}
