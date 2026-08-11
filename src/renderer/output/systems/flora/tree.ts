// Space-colonization tree (Runions, Lane & Prusinkiewicz 2007). Attraction
// points fill a crown envelope; nodes grow toward whichever attractors they
// influence; attractors die when reached. Branching is emergent. Growth ticks
// are driven by the music — the tree grows while sound plays, holds its breath
// in silence, and sheds leaves if the silence goes on.
//
// Thickness: pipe model (Leonardo's rule, exponent 2) accumulated from tips.
// Sway: per-node rotation accumulated down the parent chain (rigid trunk,
// flexible tips, phase accruing along each branch → a traveling wave).

interface TreeDrive {
  wind: number
  vigor: number
  scatter: number
  level: number
  bass: number
  treble: number
  onset: number
  silence: number
  horizonY: number
}

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  phase: number
}

export class Tree {
  done = false
  private nodesX = new Float32Array(4096)
  private nodesY = new Float32Array(4096)
  private parent = new Int32Array(4096)
  private depth = new Int32Array(4096)
  private radius = new Float32Array(4096)
  private phase = new Float32Array(4096)
  private childCount = new Int32Array(4096)
  private swayX = new Float32Array(4096)
  private swayY = new Float32Array(4096)
  private swayA = new Float32Array(4096)
  private nNodes = 0

  private attrX = new Float32Array(0)
  private attrY = new Float32Array(0)
  private attrAlive = new Uint8Array(0)
  private attrLeft = 0

  private segLen = 10
  private tickBudget = 0
  private stall = 0
  private lastOnset = 0
  private maxDepth = 1
  private falling: Leaf[] = []
  private leafShed = 0

  reset(w: number, h: number, density: number, horizonY: number): void {
    this.nNodes = 0
    this.done = false
    this.stall = 0
    this.tickBudget = 0
    this.falling = []
    this.maxDepth = 1

    const u = h / 1080
    this.segLen = 11 * u

    // crown envelope: ellipse, surface-weighted sampling for a full crown edge
    const count = Math.round(260 + density * 900)
    this.attrX = new Float32Array(count)
    this.attrY = new Float32Array(count)
    this.attrAlive = new Uint8Array(count)
    const cx = w / 2
    const cy = horizonY - h * 0.46
    const rx = Math.min(w * 0.34, h * 0.42)
    const ry = h * 0.3
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.pow(Math.sin((Math.random() * Math.PI) / 2), 0.8)
      this.attrX[i] = cx + Math.cos(a) * rx * r
      this.attrY[i] = cy + Math.sin(a) * ry * r * (0.85 + Math.random() * 0.3)
      this.attrAlive[i] = 1
    }
    this.attrLeft = count

    // root node at the ground line, then a trunk bootstrap: climb straight
    // up (with a wander) until the crown's influence field can see the tip —
    // without this the algorithm stalls before it ever starts
    let tip = this.addNode(cx, horizonY, -1)
    const di = this.segLen * 6
    let guard = 120
    while (guard-- > 0 && tip >= 0) {
      let nearest = Infinity
      for (let a = 0; a < this.attrX.length; a++) {
        const dx = this.attrX[a] - this.nodesX[tip]
        const dy = this.attrY[a] - this.nodesY[tip]
        const d2 = dx * dx + dy * dy
        if (d2 < nearest) nearest = d2
      }
      if (nearest < di * di) break
      tip = this.addNode(
        this.nodesX[tip] + (Math.random() - 0.5) * this.segLen * 0.35,
        this.nodesY[tip] - this.segLen,
        tip
      )
    }
  }

  private addNode(x: number, y: number, parent: number): number {
    const i = this.nNodes
    if (i >= this.nodesX.length) return -1 // hard cap, tree is finished
    this.nodesX[i] = x
    this.nodesY[i] = y
    this.parent[i] = parent
    this.depth[i] = parent < 0 ? 0 : this.depth[parent] + 1
    if (this.depth[i] > this.maxDepth) this.maxDepth = this.depth[i]
    this.phase[i] = (parent < 0 ? 0 : this.phase[parent]) + 0.35 + Math.random() * 0.4
    this.childCount[i] = 0
    this.radius[i] = 1
    this.nNodes++
    // pipe model: every ancestor gains cross-section
    let p = parent
    while (p >= 0) {
      this.childCount[p]++
      p = this.parent[p]
    }
    return i
  }

  /** One space-colonization iteration. Returns true if anything grew. */
  private grow(diMul: number): boolean {
    const D = this.segLen
    const di = D * (4.5 + diMul * 2.5)
    const dk = D * 1.9
    const n = this.nNodes
    if (n === 0 || this.attrLeft === 0) return false

    // accumulate directions per node from attractors that see it as nearest
    const accX = new Float32Array(n)
    const accY = new Float32Array(n)
    const accN = new Int32Array(n)
    for (let a = 0; a < this.attrX.length; a++) {
      if (!this.attrAlive[a]) continue
      let best = -1
      let bestD2 = di * di
      for (let i = 0; i < n; i++) {
        const dx = this.attrX[a] - this.nodesX[i]
        const dy = this.attrY[a] - this.nodesY[i]
        const d2 = dx * dx + dy * dy
        if (d2 < bestD2) {
          bestD2 = d2
          best = i
        }
      }
      if (best >= 0) {
        const inv = 1 / Math.sqrt(bestD2 || 1)
        accX[best] += (this.attrX[a] - this.nodesX[best]) * inv
        accY[best] += (this.attrY[a] - this.nodesY[best]) * inv
        accN[best]++
      }
    }

    let grew = false
    for (let i = 0; i < n; i++) {
      if (accN[i] === 0) continue
      // jitter breaks the opposed-attractor deadlock; slight upward tropism
      let dx = accX[i] + (Math.random() - 0.5) * 0.24
      let dy = accY[i] + (Math.random() - 0.5) * 0.24 - 0.1
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      if (this.addNode(this.nodesX[i] + dx * D, this.nodesY[i] + dy * D, i) >= 0) grew = true
    }

    // kill reached attractors
    if (grew) {
      for (let a = 0; a < this.attrX.length; a++) {
        if (!this.attrAlive[a]) continue
        for (let i = 0; i < this.nNodes; i++) {
          const dx = this.attrX[a] - this.nodesX[i]
          const dy = this.attrY[a] - this.nodesY[i]
          if (dx * dx + dy * dy < dk * dk) {
            this.attrAlive[a] = 0
            this.attrLeft--
            break
          }
        }
      }
    }
    return grew
  }

  update(dt: number, time: number, w: number, h: number, d: TreeDrive): void {
    const u = h / 1080
    if (this.nNodes === 0) this.reset(w, h, 0.6, d.horizonY)

    // audio-driven growth: ticks accrue with level & vigor; onsets spurt;
    // silence halts growth entirely (the tree waits with the room)
    if (!this.done) {
      const rate = d.vigor * (0.35 + d.level * 3.2) * (1 - d.silence)
      this.tickBudget += dt * rate * 3.2
      if (d.onset > 0.85 && this.lastOnset <= 0.85) this.tickBudget += 1.5 + d.scatter * 2
      let guard = 6
      while (this.tickBudget >= 1 && guard-- > 0) {
        this.tickBudget -= 1
        const grew = this.grow(d.scatter)
        this.stall = grew ? 0 : this.stall + 1
        if (this.stall > 5 || this.attrLeft === 0 || this.nNodes >= this.nodesX.length - 2) {
          this.done = true
          break
        }
      }
    }
    this.lastOnset = d.onset

    // radii from pipe model (cheap enough to refresh every frame at ≤4k nodes)
    const tipR = 1.1 * u
    const trunkCap = h / 42
    for (let i = 0; i < this.nNodes; i++) {
      this.radius[i] = Math.min(trunkCap, tipR * Math.sqrt(this.childCount[i] + 1))
    }

    // sway: accumulate rotations down the parent chain
    const gust = 0.5 + 0.5 * Math.sin(time * 0.31 + Math.sin(time * 0.13) * 2)
    const amp = d.wind * (0.028 + d.bass * 0.02) * gust
    const md = Math.max(1, this.maxDepth)
    for (let i = 0; i < this.nNodes; i++) {
      const p = this.parent[i]
      if (p < 0) {
        this.swayX[i] = this.nodesX[i]
        this.swayY[i] = this.nodesY[i]
        this.swayA[i] = 0
        continue
      }
      const dfrac = this.depth[i] / md
      const theta =
        amp * Math.pow(dfrac, 1.7) * Math.sin(time * 1.9 + this.phase[i]) +
        amp * 0.3 * (dfrac > 0.6 ? Math.sin(time * 7.1 + this.phase[i] * 2.3) * d.treble : 0)
      const a = this.swayA[p] + theta
      const ox = this.nodesX[i] - this.nodesX[p]
      const oy = this.nodesY[i] - this.nodesY[p]
      const c = Math.cos(a)
      const s = Math.sin(a)
      this.swayX[i] = this.swayX[p] + ox * c - oy * s
      this.swayY[i] = this.swayY[p] + ox * s + oy * c
      this.swayA[i] = a
    }

    // deep silence sheds leaves
    if (this.done && d.silence > 0.5) {
      this.leafShed += dt * d.silence * 2.2
      while (this.leafShed >= 1 && this.falling.length < 90) {
        this.leafShed -= 1
        const tip = this.pickTip()
        if (tip >= 0) {
          this.falling.push({
            x: this.swayX[tip],
            y: this.swayY[tip],
            vx: (Math.random() - 0.5) * 14 * u,
            vy: (8 + Math.random() * 14) * u,
            life: 1,
            phase: Math.random() * Math.PI * 2
          })
        }
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const L = this.falling[i]
      L.phase += dt * 2.2
      L.x += (L.vx + Math.sin(L.phase) * 26 * u * (0.4 + d.wind)) * dt
      L.y += L.vy * dt
      if (L.y > d.horizonY) L.life -= dt * 2.5
      if (L.life <= 0) this.falling.splice(i, 1)
    }
  }

  private pickTip(): number {
    if (this.nNodes < 10) return -1
    for (let t = 0; t < 12; t++) {
      const i = 1 + Math.floor(Math.random() * (this.nNodes - 1))
      if (this.childCount[i] === 0 && this.depth[i] > 3) return i
    }
    return -1
  }

  draw(g: CanvasRenderingContext2D, w: number, h: number, stops: string[], d: TreeDrive): void {
    const u = h / 1080
    // ground line
    g.globalAlpha = 0.45
    g.strokeStyle = stops[2]
    g.lineWidth = Math.max(1, u)
    g.beginPath()
    g.moveTo(0, d.horizonY)
    g.lineTo(w, d.horizonY)
    g.stroke()

    // branches, thick to thin; round caps hide the joints
    g.lineCap = 'round'
    g.globalAlpha = 0.92
    // bucket segments by width so we stroke in a few passes, not per segment
    const buckets: number[][] = [[], [], [], []]
    for (let i = 1; i < this.nNodes; i++) {
      const r = this.radius[i]
      const b = r > 6 * u ? 0 : r > 3 * u ? 1 : r > 1.6 * u ? 2 : 3
      buckets[b].push(i)
    }
    const widths = [11 * u, 5.2 * u, 2.6 * u, 1.2 * u]
    const cols = [stops[4], stops[4], stops[3], stops[3]]
    for (let b = 0; b < 4; b++) {
      if (buckets[b].length === 0) continue
      g.lineWidth = widths[b]
      g.strokeStyle = cols[b]
      g.beginPath()
      for (const i of buckets[b]) {
        const p = this.parent[i]
        g.moveTo(this.swayX[p], this.swayY[p])
        g.lineTo(this.swayX[i], this.swayY[i])
      }
      g.stroke()
    }

    // leaves at the tips once the tree is established; flicker with treble
    if (this.nNodes > 40) {
      const s = 2.4 * u
      g.fillStyle = stops[3]
      for (let i = 1; i < this.nNodes; i++) {
        if (this.childCount[i] !== 0 || this.depth[i] < 4) continue
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.93 + d.treble * 9))
        g.globalAlpha = (0.3 + 0.5 * tw) * (1 - d.silence * 0.45)
        g.fillRect(this.swayX[i] - s / 2, this.swayY[i] - s / 2, s, s)
      }
    }

    // falling leaves
    g.fillStyle = stops[3]
    for (const L of this.falling) {
      g.globalAlpha = 0.7 * Math.min(1, L.life)
      g.fillRect(L.x, L.y, 2.4 * u, 2.4 * u)
    }
    g.globalAlpha = 1
  }
}
