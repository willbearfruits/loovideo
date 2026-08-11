// One JSON message protocol for every client: control window, output window,
// CLI, and later phone / MCP server / ESP32. The main process owns state and
// echoes every accepted change to all connected clients.

import type {
  LfoDef,
  ModRoute,
  ParamState,
  ParamValue,
  QualityState,
  SystemId
} from './params'

export const DEFAULT_WS_PORT = 7770

export interface MediaDeviceLite {
  deviceId: string
  label: string
}

export type ClientRole = 'control' | 'output' | 'cli'

export type ClientMessage =
  | { t: 'hello'; role: ClientRole }
  | { t: 'set'; id: string; value: ParamValue }
  | { t: 'routes'; routes: ModRoute[] }
  | { t: 'lfo'; index: number; def: LfoDef }
  | { t: 'system'; id: SystemId }
  | { t: 'device'; kind: 'audio' | 'video'; deviceId: string | null }
  | { t: 'quality'; quality: Partial<QualityState> }
  | { t: 'preset.save'; name: string }
  | { t: 'preset.load'; name: string }
  | { t: 'preset.delete'; name: string }
  | { t: 'preset.cycle'; dir: number }
  | { t: 'window'; fullscreen?: boolean; display?: number }
  | { t: 'telemetry'; fps: number; level: number; bands: number[]; onset: number; spectrum?: number[] }
  | { t: 'devices'; audio: MediaDeviceLite[]; video: MediaDeviceLite[] }
  | { t: 'state.request' }

export type ServerMessage =
  | { t: 'state'; state: ParamState; presets: string[] }
  | { t: 'set'; id: string; value: ParamValue }
  | { t: 'routes'; routes: ModRoute[] }
  | { t: 'lfo'; index: number; def: LfoDef }
  | { t: 'system'; id: SystemId }
  | { t: 'device'; kind: 'audio' | 'video'; deviceId: string | null }
  | { t: 'quality'; quality: QualityState }
  | { t: 'presets'; names: string[] }
  | { t: 'telemetry'; fps: number; level: number; bands: number[]; onset: number; spectrum?: number[] }
  | { t: 'devices'; audio: MediaDeviceLite[]; video: MediaDeviceLite[] }

export function parseMessage<T>(raw: unknown): T | null {
  try {
    const msg = JSON.parse(String(raw))
    if (msg && typeof msg.t === 'string') return msg as T
  } catch {
    /* ignore malformed frames */
  }
  return null
}
