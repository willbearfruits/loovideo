// Web MIDI: any hardware controller drives any parameter. Learn flow: pick a
// param, press LEARN, move a knob — bound. Mappings persist in localStorage.

import { useSyncExternalStore } from 'react'
import { PARAM_MAP } from '../../shared/params'
import { net } from './net'

export interface MidiMapping {
  cc: number
  ch: number
  param: string
}

const KEY = 'loovideo.midi.mappings'
let mappings: MidiMapping[] = []
try {
  mappings = JSON.parse(localStorage.getItem(KEY) ?? '[]')
} catch {
  mappings = []
}

export const midiState = {
  supported: false,
  inputs: 0,
  lastCC: null as string | null,
  learning: null as string | null
}

let version = 0
const listeners = new Set<() => void>()
const bump = (): void => {
  version++
  for (const l of listeners) l()
}

function save(): void {
  localStorage.setItem(KEY, JSON.stringify(mappings))
}

export function getMappings(): MidiMapping[] {
  return mappings
}

export function armLearn(param: string | null): void {
  midiState.learning = param
  bump()
}

export function removeMapping(i: number): void {
  mappings.splice(i, 1)
  save()
  bump()
}

function onMessage(data: Uint8Array): void {
  if (data.length < 3) return
  const status = data[0]
  if ((status & 0xf0) !== 0xb0) return // CC only
  const ch = status & 0x0f
  const cc = data[1]
  const val = data[2]
  midiState.lastCC = `CC ${cc} · ch ${ch + 1} · ${val}`

  if (midiState.learning) {
    const param = midiState.learning
    mappings = mappings.filter((m) => m.param !== param && !(m.cc === cc && m.ch === ch))
    mappings.push({ cc, ch, param })
    midiState.learning = null
    save()
  } else {
    const m = mappings.find((m) => m.cc === cc && m.ch === ch)
    if (m) {
      const def = PARAM_MAP[m.param]
      if (def?.kind === 'number') net.set(m.param, def.min + (val / 127) * (def.max - def.min))
      else if (def?.kind === 'bool') net.set(m.param, val > 63)
    }
  }
  bump()
}

export function initMidi(): void {
  const nav = navigator as Navigator & {
    requestMIDIAccess?: (opts?: { sysex: boolean }) => Promise<MIDIAccess>
  }
  if (!nav.requestMIDIAccess) return
  nav
    .requestMIDIAccess()
    .then((access) => {
      midiState.supported = true
      const attach = (): void => {
        let n = 0
        access.inputs.forEach((input) => {
          n++
          input.onmidimessage = (e: MIDIMessageEvent): void => {
            if (e.data) onMessage(e.data)
          }
        })
        midiState.inputs = n
        bump()
      }
      attach()
      access.onstatechange = attach
    })
    .catch(() => {
      midiState.supported = false
    })
}

export function useMidi(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version
  )
}
