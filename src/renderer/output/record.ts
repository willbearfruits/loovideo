// Recording: the output canvas + the live audio input, muxed to WebM by
// MediaRecorder. The blob downloads on stop; the main process routes all
// downloads silently into Videos/loovideo/, so stopping a take just saves it.

export class Recorder {
  active = false
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []

  start(canvas: HTMLCanvasElement, audio: MediaStream | null): void {
    if (this.active) return
    const stream = canvas.captureStream(60)
    if (audio) for (const t of audio.getAudioTracks()) stream.addTrack(t.clone())
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm'
    try {
      this.rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 })
    } catch {
      return
    }
    this.chunks = []
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.rec.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' })
      this.chunks = []
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `loovideo-${ts}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    }
    this.rec.start(1000)
    this.active = true
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    this.rec?.stop()
    this.rec = null
  }
}
