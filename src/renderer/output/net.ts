// WebSocket client for the output window: mirrors authoritative state from the
// hub and reconnects forever (the show must survive a hub restart).

import { defaultState, type ParamState } from '../../shared/params'
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
      case 'state':
        this.state = msg.state
        this.stateEpoch++
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
      default:
        break
    }
  }
}
