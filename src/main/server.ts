// The WebSocket hub. Control window, output window, CLI, and any future
// client (phone, MCP server, ESP32) connect here; the store mutates, everyone
// hears the echo.

import { WebSocketServer, WebSocket } from 'ws'
import type { ParamStore } from './store'
import {
  parseMessage,
  type ClientMessage,
  type ClientRole,
  type MediaDeviceLite,
  type ServerMessage
} from '../shared/protocol'
import type { ParamValue } from '../shared/params'

export interface ServerHooks {
  onWindow(msg: { fullscreen?: boolean; display?: number }): void
}

interface Client {
  ws: WebSocket
  role: ClientRole
}

export class Hub {
  private wss: WebSocketServer
  private clients = new Set<Client>()
  private lastDevices: { audio: MediaDeviceLite[]; video: MediaDeviceLite[] } | null = null

  constructor(
    private store: ParamStore,
    private hooks: ServerHooks,
    port: number,
    host: string
  ) {
    this.wss = new WebSocketServer({ port, host })
    this.wss.on('listening', () => console.log(`[hub] ws://${host}:${port}`))
    this.wss.on('error', (err) => console.error('[hub]', err))
    this.wss.on('connection', (ws) => {
      const client: Client = { ws, role: 'cli' }
      this.clients.add(client)
      ws.on('close', () => this.clients.delete(client))
      ws.on('message', (raw) => {
        const msg = parseMessage<ClientMessage>(raw)
        if (msg) this.handle(client, msg)
      })
    })
  }

  broadcast(msg: ServerMessage, opts?: { except?: Client; roles?: ClientRole[] }): void {
    const data = JSON.stringify(msg)
    for (const c of this.clients) {
      if (opts?.except === c) continue
      if (opts?.roles && !opts.roles.includes(c.role)) continue
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(data)
    }
  }

  private sendState(c: Client): void {
    const msg: ServerMessage = {
      t: 'state',
      state: this.store.state,
      presets: this.store.listPresets()
    }
    c.ws.send(JSON.stringify(msg))
    if (this.lastDevices)
      c.ws.send(JSON.stringify({ t: 'devices', ...this.lastDevices } satisfies ServerMessage))
  }

  /** Mutate + broadcast from inside the main process (keyboard shortcuts, CLI). */
  applySet(id: string, value: ParamValue): void {
    const v = this.store.set(id, value)
    if (v !== null) this.broadcast({ t: 'set', id, value: v })
  }

  applySystem(id: import('../shared/params').SystemId): void {
    this.store.setSystem(id)
    this.broadcast({ t: 'system', id })
  }

  applyPresetCycle(dir: number): void {
    const s = this.store.cyclePreset(dir)
    if (s) this.broadcast({ t: 'state', state: s, presets: this.store.listPresets() })
  }

  private handle(client: Client, msg: ClientMessage): void {
    switch (msg.t) {
      case 'hello':
        client.role = msg.role
        this.sendState(client)
        break
      case 'state.request':
        this.sendState(client)
        break
      case 'set': {
        const v = this.store.set(msg.id, msg.value)
        if (v !== null) this.broadcast({ t: 'set', id: msg.id, value: v })
        break
      }
      case 'routes':
        this.store.setRoutes(msg.routes)
        this.broadcast({ t: 'routes', routes: this.store.state.routes })
        break
      case 'lfo':
        if (this.store.setLfo(msg.index, msg.def))
          this.broadcast({ t: 'lfo', index: msg.index, def: msg.def })
        break
      case 'system':
        this.applySystem(msg.id)
        break
      case 'device':
        this.store.setDevice(msg.kind, msg.deviceId)
        this.broadcast({ t: 'device', kind: msg.kind, deviceId: msg.deviceId })
        break
      case 'quality': {
        const q = this.store.setQuality(msg.quality)
        this.broadcast({ t: 'quality', quality: q })
        break
      }
      case 'preset.save':
        this.store.savePreset(msg.name)
        this.broadcast({ t: 'presets', names: this.store.listPresets() })
        break
      case 'preset.load': {
        const s = this.store.loadPreset(msg.name)
        if (s) this.broadcast({ t: 'state', state: s, presets: this.store.listPresets() })
        break
      }
      case 'preset.delete':
        this.store.deletePreset(msg.name)
        this.broadcast({ t: 'presets', names: this.store.listPresets() })
        break
      case 'preset.cycle':
        this.applyPresetCycle(msg.dir >= 0 ? 1 : -1)
        break
      case 'window':
        this.hooks.onWindow(msg)
        break
      case 'telemetry':
        // output → everyone watching meters; never echoed back to the output
        this.broadcast({ ...msg }, { except: client, roles: ['control', 'cli'] })
        break
      case 'devices':
        this.lastDevices = { audio: msg.audio, video: msg.video }
        this.broadcast({ ...msg }, { except: client })
        break
    }
  }

  close(): void {
    this.wss.close()
  }
}
