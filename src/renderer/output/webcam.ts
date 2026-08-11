// Lazy webcam source: started only while a system actually uses it.

export class Webcam {
  readonly video: HTMLVideoElement
  active = false
  error: string | null = null
  private stream: MediaStream | null = null
  private wantedDeviceId: string | null = null
  private starting = false

  constructor() {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
  }

  setDevice(deviceId: string | null): void {
    if (deviceId !== this.wantedDeviceId) {
      this.wantedDeviceId = deviceId
      if (this.active) {
        this.stop()
      }
    }
  }

  /** Call every frame with whether the current visuals want the camera. */
  ensure(wanted: boolean): void {
    if (wanted && !this.active && !this.starting) void this.start()
    if (!wanted && this.active) this.stop()
  }

  private async start(): Promise<void> {
    this.starting = true
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: this.wantedDeviceId ? { exact: this.wantedDeviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 360 }
        }
      })
      this.video.srcObject = this.stream
      await this.video.play()
      this.active = true
      this.error = null
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.active = false
    } finally {
      this.starting = false
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
    this.active = false
  }
}
