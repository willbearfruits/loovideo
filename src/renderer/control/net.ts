// WebSocket client + tiny external store for React. State changes and
// telemetry bump separate versions so 15 Hz meters never re-render the app.

import { useSyncExternalStore } from 'react'
import { defaultState, type LfoDef, type ModRoute, type ParamState, type ParamValue, type QualityState, type SystemId } from '../../shared/params'
import {
  parseMessage,
  DEFAULT_WS_PORT,
  type ClientMessage,
  type MediaDeviceLite,
  type ServerMessage
} from '../../shared/protocol'

export interface Telemetry {
  fps: number
  level: number
  bands: number[]
  onset: number
  spectrum: number[]
  story: { act: number; total: number; name: string; t: number } | null
}

class ControlNet {
  state: ParamState = defaultState()
  presets: string[] = []
  devices: { audio: MediaDeviceLite[]; video: MediaDeviceLite[] } = { audio: [], video: [] }
  telemetry: Telemetry = {
    fps: 0,
    level: 0,
    bands: new Array(8).fill(0),
    onset: 0,
    spectrum: [],
    story: null
  }
  /** latest stage preview frame (JPEG data URL from the output) */
  preview: string | null = null
  connected = false
  port: string

  private ws: WebSocket | null = null
  private stateVersion = 0
  private telemetryVersion = 0
  private previewVersion = 0
  private stateListeners = new Set<() => void>()
  private telemetryListeners = new Set<() => void>()
  private previewListeners = new Set<() => void>()

  constructor() {
    this.port = new URLSearchParams(location.search).get('port') ?? String(DEFAULT_WS_PORT)
    this.connect()
  }

  private connect(): void {
    this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`)
    this.ws.onopen = () => {
      this.connected = true
      this.send({ t: 'hello', role: 'control' })
      this.bumpState()
    }
    this.ws.onclose = () => {
      this.connected = false
      this.bumpState()
      setTimeout(() => this.connect(), 1000)
    }
    this.ws.onerror = () => this.ws?.close()
    this.ws.onmessage = (ev) => {
      const msg = parseMessage<ServerMessage>(ev.data)
      if (msg) this.handle(msg)
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  // ---- convenience mutators (optimistic + send) ---------------------------

  set(id: string, value: ParamValue): void {
    this.state.values[id] = value
    this.bumpState()
    this.send({ t: 'set', id, value })
  }

  setSystem(id: SystemId): void {
    this.state.system = id
    this.bumpState()
    this.send({ t: 'system', id })
  }

  setRoutes(routes: ModRoute[]): void {
    this.state.routes = routes
    this.bumpState()
    this.send({ t: 'routes', routes })
  }

  setLfo(index: number, def: LfoDef): void {
    this.state.lfos[index] = def
    this.bumpState()
    this.send({ t: 'lfo', index, def })
  }

  setQuality(q: Partial<QualityState>): void {
    this.state.quality = { ...this.state.quality, ...q }
    this.bumpState()
    this.send({ t: 'quality', quality: q })
  }

  setDevice(kind: 'audio' | 'video', deviceId: string | null): void {
    if (kind === 'audio') this.state.audioDeviceId = deviceId
    else this.state.videoDeviceId = deviceId
    this.bumpState()
    this.send({ t: 'device', kind, deviceId })
  }

  // ---- incoming -----------------------------------------------------------

  private handle(msg: ServerMessage): void {
    const s = this.state
    switch (msg.t) {
      case 'state':
        this.state = msg.state
        this.presets = msg.presets
        break
      case 'set':
        s.values[msg.id] = msg.value
        break
      case 'routes':
        s.routes = msg.routes
        break
      case 'lfo':
        s.lfos[msg.index] = msg.def
        break
      case 'system':
        s.system = msg.id
        break
      case 'device':
        if (msg.kind === 'audio') s.audioDeviceId = msg.deviceId
        else s.videoDeviceId = msg.deviceId
        break
      case 'quality':
        s.quality = msg.quality
        break
      case 'presets':
        this.presets = msg.names
        break
      case 'devices':
        this.devices = { audio: msg.audio, video: msg.video }
        break
      case 'preview':
        this.preview = msg.data
        this.previewVersion++
        for (const l of this.previewListeners) l()
        return
      case 'palette':
        this.state.customPalette = msg.stops
        break
      case 'telemetry':
        this.telemetry = {
          fps: msg.fps,
          level: msg.level,
          bands: msg.bands,
          onset: msg.onset,
          spectrum: msg.spectrum ?? [],
          story: msg.story ?? null
        }
        this.telemetryVersion++
        for (const l of this.telemetryListeners) l()
        return
    }
    this.bumpState()
  }

  private bumpState(): void {
    this.stateVersion++
    for (const l of this.stateListeners) l()
  }

  // ---- React glue ---------------------------------------------------------

  subscribeState = (l: () => void): (() => void) => {
    this.stateListeners.add(l)
    return () => this.stateListeners.delete(l)
  }
  getStateVersion = (): number => this.stateVersion
  subscribeTelemetry = (l: () => void): (() => void) => {
    this.telemetryListeners.add(l)
    return () => this.telemetryListeners.delete(l)
  }
  getTelemetryVersion = (): number => this.telemetryVersion
  subscribePreview = (l: () => void): (() => void) => {
    this.previewListeners.add(l)
    return () => this.previewListeners.delete(l)
  }
  getPreviewVersion = (): number => this.previewVersion
}

export const net = new ControlNet()

/** Re-render when authoritative state changes. Read fields off `net` directly. */
export function useNetState(): number {
  return useSyncExternalStore(net.subscribeState, net.getStateVersion)
}

/** Re-render at telemetry rate — use only in meter/spectrum components. */
export function useTelemetry(): Telemetry {
  useSyncExternalStore(net.subscribeTelemetry, net.getTelemetryVersion)
  return net.telemetry
}

/** Re-render on each preview frame — use only in the stage preview. */
export function usePreview(): string | null {
  useSyncExternalStore(net.subscribePreview, net.getPreviewVersion)
  return net.preview
}
