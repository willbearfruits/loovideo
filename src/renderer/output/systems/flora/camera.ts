// The flora camera: a 2D view (focus point + zoom) with spring-damped motion,
// layered on top of the auto-frame. The auto-frame remains the camera's brain
// — it knows where the world is — and the story director chooses what to do
// with that knowledge: sit wide, push in on the seed, drift across the forest,
// or follow one falling leaf down to the ground.

export type CamMode = 'auto' | 'seed' | 'drift' | 'leaf'

export interface CamTarget {
  /** world-space focus */
  fx: number
  fy: number
  /** zoom multiplier applied on top of the auto-frame fit */
  zoom: number
}

export class FloraCamera {
  private fx = 0
  private fy = 0
  private zoom = 1
  private started = false
  private driftT = Math.random() * 100

  /** manual override: pan/zoom gestures take the wheel until reset */
  manual = false
  private mx = 0
  private my = 0
  private mz = 1

  /** engage/adjust manual control; deltas are in world px / zoom factor */
  nudge(panX: number, panY: number, zoomMul: number): void {
    if (!this.manual) {
      this.manual = true
      this.mx = this.fx
      this.my = this.fy
      this.mz = this.zoom
    }
    this.mx += panX
    this.my += panY
    this.mz = Math.min(24, Math.max(0.15, this.mz * zoomMul))
  }

  release(): void {
    this.manual = false
  }

  /** the target the update loop should chase when manual is engaged */
  manualTarget(): CamTarget {
    return { fx: this.mx, fy: this.my, zoom: this.mz }
  }

  update(dt: number, target: CamTarget, onset: number): void {
    if (!this.started) {
      this.started = true
      this.fx = target.fx
      this.fy = target.fy
      this.zoom = target.zoom
    }
    this.driftT += dt
    // exponential approach; zoom moves slower than pan so pushes feel weighted
    const kPan = Math.min(1, dt * 1.4)
    const kZoom = Math.min(1, dt * 0.8)
    this.fx += (target.fx - this.fx) * kPan
    this.fy += (target.fy - this.fy) * kPan
    this.zoom += (target.zoom - this.zoom) * kZoom
    // a barely-there breath, and a 1.5% nudge on onsets
    this.zoom *= 1 + Math.sin(this.driftT * 0.13) * 0.0016 + onset * 0.015
  }

  /** Slow Ken-Burns pan offset for 'drift' mode, in world px. */
  driftOffset(span: number): number {
    return Math.sin(this.driftT * 0.045) * span * 0.14 + Math.sin(this.driftT * 0.017) * span * 0.06
  }

  /** Apply as a canvas transform: focus → screen anchor, scaled. */
  apply(g: CanvasRenderingContext2D, ax: number, ay: number, fit: number): void {
    g.translate(ax, ay)
    g.scale(fit * this.zoom, fit * this.zoom)
    g.translate(-this.fx, -this.fy)
  }

  get currentZoom(): number {
    return this.zoom
  }
  get focusX(): number {
    return this.fx
  }
  get focusY(): number {
    return this.fy
  }
}
