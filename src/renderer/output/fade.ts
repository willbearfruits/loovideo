// Scene crossfade: on any scene change (preset load or system switch) the
// last rendered frame is frozen onto a DOM overlay canvas and CSS-faded out
// over the live new scene. A freeze-frame fade covers every kind of change —
// system, mode, palette — with zero extra render cost during the transition.

export class SceneFade {
  private overlay: HTMLCanvasElement
  private g: CanvasRenderingContext2D

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
    const s = this.overlay.style
    s.transition = 'none'
    s.opacity = '1'
    void this.overlay.offsetWidth // commit, so the next transition restarts
    s.transition = `opacity ${duration}s cubic-bezier(0.4, 0, 0.6, 1)`
    s.opacity = '0'
  }
}
