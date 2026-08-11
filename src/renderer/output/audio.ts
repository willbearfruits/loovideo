// Audio analysis: getUserMedia (processing disabled — we want the raw signal,
// not a phone-call feed) → AnalyserNode FFT → 8 log-spaced bands with
// attack/release envelopes, RMS level, and spectral-flux onset detection.
// Also provides a deterministic "demo drive" so visuals move with no input.

export interface AudioFrame {
  bands: Float32Array // 8 envelopes, 0..1, post EQ gain
  level: number
  onset: number // 1 on a transient, exponential decay
  /** 0 while sound plays; ramps to 1 over ~5s of sustained quiet, falls fast */
  silence: number
  /** whether analysis is running at all (live or demo) — systems use this to
   * suppress idle motion: when sound drives the show, stillness must mean
   * stillness; when audio is off entirely, autonomous motion is fine */
  active: boolean
  waveform: Float32Array // 256 time-domain samples (left), -1..1
  waveformR: Float32Array // right channel, for phase-scope figures
  spectrum: Float32Array // 48 log bins for UI display, 0..1
}

export interface AudioParams {
  enabled: boolean
  demo: boolean
  gain: number
  attack: number
  release: number
  eq: number[]
}

const BAND_EDGES = [40, 80, 160, 320, 640, 1250, 2500, 5000, 16000]
const FFT_SIZE = 4096
const SPECTRUM_BINS = 48

export class AudioEngine {
  frame: AudioFrame = {
    bands: new Float32Array(8),
    level: 0,
    onset: 0,
    silence: 0,
    active: false,
    waveform: new Float32Array(256),
    waveformR: new Float32Array(256),
    spectrum: new Float32Array(SPECTRUM_BINS)
  }
  error: string | null = null
  running = false

  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private analyserL: AnalyserNode | null = null
  private analyserR: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private freq = new Float32Array(FFT_SIZE / 2)
  private prevFreq = new Float32Array(FFT_SIZE / 2)
  private env = new Float32Array(8)
  private wave = new Float32Array(1024)
  private onsetEnv = 0
  private fluxAvg = 0
  private quietT = 0
  private silenceV = 0
  private currentDeviceId: string | null | undefined = undefined

  /** Sustained quiet ramps in slowly (a held breath), sound snaps it back. */
  private updateSilence(dt: number, level: number): number {
    if (level < 0.035) this.quietT += dt
    else this.quietT = 0
    const target = Math.min(1, Math.max(0, (this.quietT - 1.0) / 4.5))
    const k = target > this.silenceV ? Math.min(1, dt / 2.0) : Math.min(1, dt * 6)
    this.silenceV += (target - this.silenceV) * k
    return this.silenceV
  }

  async setDevice(deviceId: string | null): Promise<void> {
    if (deviceId === this.currentDeviceId && this.running) return
    this.currentDeviceId = deviceId
    this.stop()
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2
        }
      })
      this.ctx = new AudioContext({ latencyHint: 'interactive' })
      const src = this.ctx.createMediaStreamSource(this.stream)
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = FFT_SIZE
      this.analyser.smoothingTimeConstant = 0 // we do our own envelopes
      src.connect(this.analyser)
      // per-channel taps for phase-scope (Lissajous) figures
      const split = this.ctx.createChannelSplitter(2)
      src.connect(split)
      this.analyserL = this.ctx.createAnalyser()
      this.analyserR = this.ctx.createAnalyser()
      this.analyserL.fftSize = 1024
      this.analyserR.fftSize = 1024
      split.connect(this.analyserL, 0)
      split.connect(this.analyserR, 1)
      this.running = true
      this.error = null
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.running = false
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close()
    this.ctx = null
    this.analyser = null
    this.analyserL = null
    this.analyserR = null
    this.stream = null
    this.running = false
  }

  /** Enumerate devices; only meaningful after one successful getUserMedia. */
  async listDevices(): Promise<{ audio: MediaDeviceInfo[]; video: MediaDeviceInfo[] }> {
    const all = await navigator.mediaDevices.enumerateDevices()
    return {
      audio: all.filter((d) => d.kind === 'audioinput'),
      video: all.filter((d) => d.kind === 'videoinput')
    }
  }

  update(dt: number, time: number, p: AudioParams): AudioFrame {
    const f = this.frame
    if (!p.enabled) {
      if (this.running) this.stop()
      if (p.demo) return this.demoFrame(dt, time, p)
      f.bands.fill(0)
      f.level = 0
      f.onset = 0
      f.silence = 0 // touch-only mode: don't force "silence" narratives
      f.active = false
      f.waveform.fill(0)
      f.waveformR.fill(0)
      f.spectrum.fill(0)
      return f
    }
    if (!this.analyser || !this.ctx) {
      if (p.demo) return this.demoFrame(dt, time, p)
      return f
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()

    const a = this.analyser
    ;[this.prevFreq, this.freq] = [this.freq, this.prevFreq]
    a.getFloatFrequencyData(this.freq)
    const nyquist = this.ctx.sampleRate / 2
    const bins = this.freq.length

    // dB → 0..1
    const norm = (db: number): number => Math.min(1, Math.max(0, (db + 82) / 62))

    // 8 log bands
    const attackT = 0.004 * Math.pow(80, 1 - p.attack)
    const releaseT = 0.03 * Math.pow(40, 1 - p.release)
    const aC = 1 - Math.exp(-dt / attackT)
    const rC = 1 - Math.exp(-dt / releaseT)
    let level = 0
    for (let b = 0; b < 8; b++) {
      const lo = Math.max(1, Math.floor((BAND_EDGES[b] / nyquist) * bins))
      const hi = Math.min(bins - 1, Math.ceil((BAND_EDGES[b + 1] / nyquist) * bins))
      let sum = 0
      for (let i = lo; i <= hi; i++) sum += norm(this.freq[i])
      let v = (sum / (hi - lo + 1)) * p.gain * (p.eq[b] ?? 1)
      v = Math.min(1, v)
      const c = v > this.env[b] ? aC : rC
      this.env[b] += (v - this.env[b]) * c
      f.bands[b] = this.env[b]
      level += this.env[b]
    }
    f.level = Math.min(1, (level / 8) * 1.6)

    // spectral flux onset (skip the lowest bins — rumble retriggers constantly)
    let flux = 0
    const fluxLo = Math.floor((120 / nyquist) * bins)
    const fluxHi = Math.floor((8000 / nyquist) * bins)
    for (let i = fluxLo; i < fluxHi; i++) {
      const d = norm(this.freq[i]) - norm(this.prevFreq[i])
      if (d > 0) flux += d
    }
    flux /= fluxHi - fluxLo
    this.fluxAvg += (flux - this.fluxAvg) * Math.min(1, dt * 2)
    if (flux > this.fluxAvg * 1.6 + 0.012) this.onsetEnv = 1
    this.onsetEnv *= Math.exp(-dt * 9)
    f.onset = this.onsetEnv
    f.silence = this.updateSilence(dt, f.level)

    // raw waveforms for oscilloscope / phase-scope modes
    f.active = true
    const fill = (an: AnalyserNode | null, out: Float32Array, fallback?: Float32Array): void => {
      if (!an) {
        if (fallback) out.set(fallback)
        return
      }
      const buf = this.wave.subarray(0, an.fftSize)
      an.getFloatTimeDomainData(buf)
      const stride = buf.length / out.length
      for (let i = 0; i < out.length; i++) {
        out[i] = Math.max(-1, Math.min(1, buf[Math.floor(i * stride)] * p.gain))
      }
    }
    fill(this.analyserL ?? this.analyser, f.waveform)
    fill(this.analyserR, f.waveformR, f.waveform)

    // display spectrum, log-spaced
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const frac = i / (SPECTRUM_BINS - 1)
      const hz = 30 * Math.pow(16000 / 30, frac)
      const bin = Math.min(bins - 1, Math.max(1, Math.round((hz / nyquist) * bins)))
      f.spectrum[i] = norm(this.freq[bin]) * Math.min(2, p.gain)
    }
    return f
  }

  private demoFrame(dt: number, t: number, p: AudioParams): AudioFrame {
    const f = this.frame
    // a long dynamics cycle with real quiet passages, so silence-driven
    // behaviors (birds landing, flatlines) can be rehearsed without input
    const cycle = 0.5 + 0.5 * Math.sin(t * 0.14)
    const gate = cycle < 0.22 ? Math.pow(cycle / 0.22, 2) : 1
    let level = 0
    for (let b = 0; b < 8; b++) {
      const pulse = Math.max(0, Math.sin(t * (0.9 + b * 0.43) + b * 1.7))
      const beat = b < 2 ? Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 0.9)), 6) : 0
      const v = Math.min(1, (pulse * pulse * 0.55 + beat * 0.8) * gate * (p.eq[b] ?? 1))
      f.bands[b] = v
      level += v
    }
    f.level = Math.min(1, (level / 8) * 1.8)
    const beatPhase = (t * 0.9) % 1
    if (beatPhase < 0.03 && gate > 0.5) this.onsetEnv = 1
    this.onsetEnv *= Math.exp(-dt * 9)
    f.onset = this.onsetEnv
    f.silence = this.updateSilence(dt, f.level)
    f.active = true
    for (let i = 0; i < f.waveform.length; i++) {
      const ph = i / f.waveform.length
      f.waveform[i] =
        gate *
        (Math.sin(ph * Math.PI * 2 * 3 + t * 4) * f.bands[1] * 0.7 +
          Math.sin(ph * Math.PI * 2 * 13 + t * 9) * f.bands[5] * 0.3)
      // phase-shifted right channel → rotating Lissajous figures in demo
      f.waveformR[i] =
        gate *
        (Math.sin(ph * Math.PI * 2 * 3 + t * 4 + 1.1) * f.bands[1] * 0.7 +
          Math.sin(ph * Math.PI * 2 * 13 + t * 9 + 0.6) * f.bands[5] * 0.3)
    }
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const b = Math.min(7, Math.floor((i / SPECTRUM_BINS) * 8))
      f.spectrum[i] = f.bands[b] * (0.6 + 0.4 * Math.sin(i * 1.3 + t * 3))
    }
    return f
  }
}
