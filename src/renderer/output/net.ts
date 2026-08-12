// WebSocket client for the output window: mirrors authoritative state from the
// hub and reconnects forever (the show must survive a hub restart).

import { defaultState, type ParamState } from '../../shared/params'
import { setCustomPalette } from '../../shared/palettes'
import {
  parseMessage,
  DEFAULT_WS_PORT,
  type ClientMessage,
  type ServerMessage
} from '../../shared/protocol'

export class OutputNet {
  state: ParamState = defaultState()
  connected = false
  /** bumped whenever a full state (preset load / reconnect) replaces the mirror */
  stateEpoch = 0
  /** called just before a scene change lands (preset load / system switch),
   * with the fade duration to use — the engine freezes the outgoing frame */
  onSceneChange: ((duration: number) => void) | null = null
  /** stage interaction relayed from the hub */
  onPlace: ((kind: 'tree' | 'birds', x: number, y: number) => void) | null = null
  onCam: ((msg: { panX?: number; panY?: number; zoom?: number; reset?: boolean }) => void) | null =
    null
  private gotFirstState = false
  private ws: WebSocket | null = null
  private url: string

  constructor() {
    const port = new URLSearchParams(location.search).get('port') ?? String(DEFAULT_WS_PORT)
    this.url = `ws://127.0.0.1:${port}`
    this.connect()
  }

  private connect(): void {
    this.ws = new WebSocket(this.url)
    this.ws.onopen = () => {
      this.connected = true
      this.send({ t: 'hello', role: 'output' })
    }
    this.ws.onclose = () => {
      this.connected = false
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

  private handle(msg: ServerMessage): void {
    const s = this.state
    switch (msg.t) {
      case 'state': {
        if (this.gotFirstState) {
          const dur = Number(msg.state.values['master.fade'])
          this.onSceneChange?.(Number.isFinite(dur) ? dur : 0)
        }
        this.gotFirstState = true
        this.state = msg.state
        if (msg.state.customPalette) setCustomPalette(msg.state.customPalette)
        this.stateEpoch++
        break
      }
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
        if (msg.id !== s.system) {
          const dur = Number(s.values['master.fade'])
          this.onSceneChange?.(Number.isFinite(dur) ? dur : 0)
        }
        s.system = msg.id
        break
      case 'device':
        if (msg.kind === 'audio') s.audioDeviceId = msg.deviceId
        else s.videoDeviceId = msg.deviceId
        break
      case 'quality':
        s.quality = msg.quality
        break
      case 'palette':
        s.customPalette = msg.stops
        setCustomPalette(msg.stops)
        break
      case 'place':
        this.onPlace?.(msg.kind, msg.x, msg.y)
        break
      case 'cam':
        this.onCam?.(msg)
        break
      default:
        break
    }
  }
}
