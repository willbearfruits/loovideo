// Night sky. Static star majority pre-rendered once; a twinkling minority
// drawn per frame; shooting stars fired by onsets. In sustained silence the
// twinkle stills and a faint milky-way band develops, like a long exposure.

interface StarsDrive {
  wind: number
  vigor: number
  scatter: number
  treble: number
  onset: number
  silence: number
  horizonY: number
}

interface Shooter {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
}

export class Stars {
  private staticLayer: HTMLCanvasElement | null = null
  private twinkX = new Float32Array(0)
  private twinkY = new Float32Array(0)
  private twinkR = new Float32Array(0)
  private twinkPh = new Float32Array(0)
  private twinkW = new Float32Array(0)
  private nTwink = 0
  private shooters: Shooter[] = []
  private lastOnset = 0
  private key = ''

  private build(w: number, h: number, density: number, stops: string[], horizonY: number): void {
    const key = `${w}x${h}|${density.toFixed(2)}|${stops[0]}|${horizonY.toFixed(0)}`
    if (key === this.key) return
    this.key = key
    const total = Math.round(240 + density * 800)
    const nStatic = Math.round(total * 0.7)
    this.nTwink = total - nStatic

    const layer = document.createElement('canvas')
    layer.width = w
    layer.height = h
    const g = layer.getContext('2d')!
    g.fillStyle = stops[3]
    for (let i = 0; i < nStatic; i++) {
      const x = Math.random() * w
      const y = Math.random() * horizonY
      const r = 0.4 + Math.pow(Math.random(), 3) * 1.6 // many faint, few bright
      g.globalAlpha = 0.25 + Math.random() * 0.6
      g.fillRect(x, y, r, r)
    }
    this.staticLayer = layer

    this.twinkX = new Float32Array(this.nTwink)
    this.twinkY = new Float32Array(this.nTwink)
    this.twinkR = new Float32Array(this.nTwink)
    this.twinkPh = new Float32Array(this.nTwink)
    this.twinkW = new Float32Array(this.nTwink)
    for (let i = 0; i < this.nTwink; i++) {
      this.twinkX[i] = Math.random() * w
      this.twinkY[i] = Math.random() * horizonY
      this.twinkR[i] = 0.6 + Math.pow(Math.random(), 2.5) * 2
      this.twinkPh[i] = Math.random() * Math.PI * 2
      this.twinkW[i] = 0.5 + Math.random() * 2.5
    }
  }

  update(
    dt: number,
    time: number,
    w: number,
    h: number,
    density: number,
    stops: string[],
    d: StarsDrive
  ): void {
    this.build(w, h, density, stops, d.horizonY)

    // shooting stars: onset-triggered (probability = scatter) + a slow Poisson
    const u = h / 1080
    const fire = (): void => {
      const speed = (700 + Math.random() * 800) * u
      const ang = (20 + Math.random() * 20) * (Math.PI / 180)
      const dir = Math.random() < 0.5 ? 1 : -1
      this.shooters.push({
        x: Math.random() * w,
        y: Math.random() * d.horizonY * 0.6,
        vx: Math.cos(ang) * speed * dir,
        vy: Math.sin(ang) * speed,
        life: 0.9,
        maxLife: 0.9
      })
    }
    if (d.onset > 0.85 && this.lastOnset <= 0.85 && Math.random() < d.scatter) fire()
    if (Math.random() < dt / 14) fire()
    this.lastOnset = d.onset

    for (let i = this.shooters.length - 1; i >= 0; i--) {
      const s = this.shooters[i]
      s.x += s.vx * dt
      s.y += s.vy * dt
      s.life -= dt
      if (s.life <= 0 || s.y > d.horizonY) this.shooters.splice(i, 1)
    }
  }

  draw(
    g: CanvasRenderingContext2D,
    w: number,
    h: number,
    time: number,
    stops: string[],
    d: StarsDrive,
    /** false when the scenery sky already draws the sun/moon arc — two moons
     * in one sky was a real bug */
    drawMoon = true
  ): void {
    const u = h / 1080

    // long-exposure milky way, developing only in silence
    if (d.silence > 0.05) {
      g.save()
      g.translate(w / 2, d.horizonY * 0.45)
      g.rotate(-0.5)
      const grad = g.createLinearGradient(0, -h * 0.16, 0, h * 0.16)
      grad.addColorStop(0, 'transparent')
      grad.addColorStop(0.5, stops[2])
      grad.addColorStop(1, 'transparent')
      g.globalAlpha = d.silence * 0.2
      g.fillStyle = grad
      g.fillRect(-w, -h * 0.16, w * 2, h * 0.32)
      g.restore()
    }

    if (this.staticLayer) {
      g.globalAlpha = 1
      g.drawImage(this.staticLayer, 0, 0)
    }

    // twinkling minority; stills as silence deepens
    const rate = 1 - d.silence * 0.7
    g.fillStyle = stops[4]
    for (let i = 0; i < this.nTwink; i++) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * this.twinkW[i] * rate + this.twinkPh[i]))
      g.globalAlpha = a * (0.6 + d.treble * 0.5)
      const r = this.twinkR[i]
      g.fillRect(this.twinkX[i], this.twinkY[i], r, r)
    }

    // moon: bright disc with an offset bite of background — a dry crescent
    if (drawMoon) {
      const mx = w * 0.74
      const my = h * 0.22
      const mr = h * 0.048
      g.globalAlpha = 0.95
      g.fillStyle = stops[3]
      g.beginPath()
      g.arc(mx, my, mr, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = stops[0]
      g.beginPath()
      g.arc(mx - mr * 0.42, my - mr * 0.18, mr * 0.92, 0, Math.PI * 2)
      g.fill()
    }

    // shooting stars: gradient streak + bright head
    for (const s of this.shooters) {
      const t = s.life / s.maxLife
      const tail = 120 * u
      const nx = s.x - (s.vx / Math.hypot(s.vx, s.vy)) * tail
      const ny = s.y - (s.vy / Math.hypot(s.vx, s.vy)) * tail
      const grad = g.createLinearGradient(s.x, s.y, nx, ny)
      grad.addColorStop(0, stops[4])
      grad.addColorStop(1, 'transparent')
      g.strokeStyle = grad
      g.globalAlpha = t
      g.lineWidth = 1.5 * u
      g.beginPath()
      g.moveTo(s.x, s.y)
      g.lineTo(nx, ny)
      g.stroke()
      g.fillStyle = stops[4]
      g.fillRect(s.x - u, s.y - u, 2.5 * u, 2.5 * u)
    }

    // ground silhouette
    g.globalAlpha = 1
    g.fillStyle = stops[1]
    g.fillRect(0, d.horizonY, w, h - d.horizonY)
  }
}
