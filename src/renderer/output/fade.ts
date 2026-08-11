// Scene crossfade: on any scene change (preset load or system switch) the
// last rendered frame is frozen onto a DOM overlay canvas and CSS-faded out
// over the live new scene. A freeze-frame fade covers every kind of change —
// system, mode, palette — with zero extra render cost during the transition.

export class SceneFade {
  private overlay: HTMLCanvasElement
  private g: CanvasRenderingContext2D
  private remaining = 0
  private duration = 1

  constructor(private source: HTMLCanvasElement) {
    this.overlay = document.createElement('canvas')
    const s = this.overlay.style
    s.position = 'fixed'
    s.inset = '0'
    s.width = '100%'
    s.height = '100%'
    s.pointerEvents = 'none'
    s.zIndex = '5'
    s.opacity = '0'
    s.display = 'none'
    document.body.appendChild(this.overlay)
    this.g = this.overlay.getContext('2d')!
  }

  /** Capture the current frame and fade it out over `duration` seconds. */
  freeze(duration: number): void {
    if (duration <= 0.02) return
    const w = this.source.width
    const h = this.source.height
    if (w === 0 || h === 0) return
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w
      this.overlay.height = h
    }
    try {
      this.g.drawImage(this.source, 0, 0)
    } catch {
      return // nothing rendered yet
    }
    this.duration = duration
    this.remaining = duration
    const s = this.overlay.style
    s.display = 'block'
    s.opacity = '1'
  }

  /**
   * Advance the dissolve. Called from the render loop rather than left to a CSS
   * transition: transitions are driven by the compositor, and a window this app
   * runs in gets throttled (occluded, on a display that comes and goes, or a
   * locked session). A stalled transition leaves the overlay pinned at opacity
   * 1 — a freeze-frame of the last scene covering the entire output while the
   * HUD, being a separate element, carries on updating. That reads as "the
   * visuals are stuck" in every mode at once, which is exactly the bug this
   * replaces. The render loop is guaranteed to be running: if it is not, there
   * is nothing to cover up anyway.
   */
  update(dt: number): void {
    if (this.remaining <= 0) return
    this.remaining -= dt
    const s = this.overlay.style
    if (this.remaining <= 0) {
      this.remaining = 0
      s.opacity = '0'
      s.display = 'none' // out of the compositor entirely between scenes
      return
    }
    const t = this.remaining / this.duration
    // same ease as the old cubic-bezier(0.4, 0, 0.6, 1), evaluated directly
    s.opacity = String(t * t * (3 - 2 * t))
  }
}
