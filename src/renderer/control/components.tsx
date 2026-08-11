// Touch-first controls. Every draggable element tracks its own pointer id, so
// two thumbs on two faders work simultaneously (real multi-touch, no mouse
// emulation involved).

import { useEffect, useRef, type JSX, type PointerEvent } from 'react'
import { useTelemetry } from './net'

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  bipolar?: boolean
  format?: (v: number) => string
}

function useDrag(onFrac: (f: { x: number; y: number }) => void) {
  const el = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const apply = (e: PointerEvent<HTMLDivElement>): void => {
    const r = el.current!.getBoundingClientRect()
    onFrac({
      x: clamp01((e.clientX - r.left) / r.width),
      y: clamp01((e.clientY - r.top) / r.height)
    })
  }
  return {
    ref: el,
    onPointerDown: (e: PointerEvent<HTMLDivElement>): void => {
      pointer.current = e.pointerId
      el.current?.setPointerCapture(e.pointerId)
      apply(e)
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>): void => {
      if (pointer.current === e.pointerId) apply(e)
    },
    onPointerUp: (e: PointerEvent<HTMLDivElement>): void => {
      if (pointer.current === e.pointerId) pointer.current = null
    },
    onPointerCancel: (e: PointerEvent<HTMLDivElement>): void => {
      if (pointer.current === e.pointerId) pointer.current = null
    }
  }
}

export function HSlider({ label, value, min, max, onChange, bipolar, format }: SliderProps): JSX.Element {
  const drag = useDrag(({ x }) => onChange(min + (max - min) * x))
  const frac = (value - min) / (max - min)
  const fillStyle = bipolar
    ? frac >= 0.5
      ? { left: '50%', width: `${(frac - 0.5) * 100}%` }
      : { left: `${frac * 100}%`, width: `${(0.5 - frac) * 100}%` }
    : { left: 0, width: `${frac * 100}%` }
  return (
    <div className={`hslider${bipolar ? ' bipolar' : ''}`}>
      <div className="label">{label}</div>
      <div className="track" {...drag}>
        <div className="fill" style={fillStyle} />
      </div>
      <div className="value">{format ? format(value) : value.toFixed(2)}</div>
    </div>
  )
}

export function Fader({ label, value, min, max, onChange, format }: SliderProps): JSX.Element {
  const drag = useDrag(({ y }) => onChange(min + (max - min) * (1 - y)))
  const frac = (value - min) / (max - min)
  return (
    <div className="fader">
      <div className="track" {...drag}>
        <div className="fill" style={{ height: `${frac * 100}%` }} />
      </div>
      <div className="label">{label}</div>
      <div className="value">{format ? format(value) : value.toFixed(2)}</div>
    </div>
  )
}

export function Toggle({
  label,
  on,
  onChange,
  danger
}: {
  label: string
  on: boolean
  onChange: (v: boolean) => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      className={`toggle${on ? ' on' : ''}${danger ? ' danger' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span className="pip" />
      {label}
    </button>
  )
}

export function Segmented({
  options,
  value,
  onChange,
  labels,
  big
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  labels?: string[]
  big?: boolean
}): JSX.Element {
  return (
    <div className={`seg${big ? ' big' : ''}`}>
      {options.map((o, i) => (
        <button key={o} className={o === value ? 'active' : ''} onClick={() => onChange(o)}>
          {labels?.[i] ?? o.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

/** Live spectrum + band envelopes, drawn outside React's render cycle. */
export function Spectrum(): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const t = useTelemetry()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth * dpr
    const h = canvas.clientHeight * dpr
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    const g = canvas.getContext('2d')
    if (!g) return
    g.clearRect(0, 0, w, h)

    const spec = t.spectrum
    if (spec.length > 0) {
      const bw = w / spec.length
      g.fillStyle = 'rgba(84, 212, 255, 0.34)'
      for (let i = 0; i < spec.length; i++) {
        const bh = Math.min(1, spec[i]) * (h - 4)
        g.fillRect(i * bw + 1, h - bh, bw - 2, bh)
      }
    }
    const bands = t.bands
    const bw2 = w / bands.length
    g.fillStyle = 'rgba(105, 240, 168, 0.9)'
    for (let i = 0; i < bands.length; i++) {
      const y = h - Math.min(1, bands[i]) * (h - 4)
      g.fillRect(i * bw2 + 2, y - 3 * dpr, bw2 - 4, 3 * dpr)
    }
    if (t.onset > 0.05) {
      g.fillStyle = `rgba(255, 93, 115, ${t.onset * 0.9})`
      g.fillRect(0, 0, w, 3 * dpr)
    }
  }, [t])
  return <canvas className="spectrum" ref={ref} />
}
