import { useState, type JSX } from 'react'
import {
  MOD_SOURCES,
  PARAMS,
  SYSTEMS,
  type ModRoute,
  type ModSource,
  type MsaaLevel,
  type ParamDef,
  type QualityPreset
} from '../../shared/params'
import { FACTORY_PRESETS } from '../../shared/factoryPresets'
import { net, useNetState, useTelemetry } from './net'
import { Fader, HSlider, Segmented, Spectrum, Toggle } from './components'

const SOURCE_LABELS: Record<ModSource, string> = {
  band0: 'EQ 40-80',
  band1: 'EQ 80-160',
  band2: 'EQ 160-320',
  band3: 'EQ 320-640',
  band4: 'EQ 640-1.2k',
  band5: 'EQ 1.2-2.5k',
  band6: 'EQ 2.5-5k',
  band7: 'EQ 5-16k',
  level: 'LEVEL',
  onset: 'ONSET',
  silence: 'SILENCE',
  lfo0: 'LFO 1',
  lfo1: 'LFO 2',
  lfo2: 'LFO 3',
  lfo3: 'LFO 4'
}

function ParamControl({ def }: { def: ParamDef }): JSX.Element {
  useNetState()
  const v = net.state.values[def.id]
  switch (def.kind) {
    case 'number':
      return (
        <HSlider
          label={def.label}
          value={typeof v === 'number' ? v : def.def}
          min={def.min}
          max={def.max}
          onChange={(x) => net.set(def.id, x)}
        />
      )
    case 'bool':
      return <Toggle label={def.label} on={v === true} onChange={(x) => net.set(def.id, x)} />
    case 'enum':
      return (
        <Segmented
          options={def.options}
          value={typeof v === 'string' ? v : def.def}
          onChange={(x) => net.set(def.id, x)}
        />
      )
  }
}

function Group({ title, group, kinds }: { title: string; group: string; kinds?: string[] }): JSX.Element {
  const defs = PARAMS.filter((p) => p.group === group && (!kinds || kinds.includes(p.kind)))
  const enums = defs.filter((d) => d.kind === 'enum')
  const bools = defs.filter((d) => d.kind === 'bool')
  const nums = defs.filter((d) => d.kind === 'number')
  return (
    <div className="block">
      <h3>{title}</h3>
      {enums.map((d) => (
        <div key={d.id} style={{ marginBottom: 10 }}>
          <ParamControl def={d} />
        </div>
      ))}
      {bools.length > 0 && (
        <div className="row" style={{ marginBottom: nums.length ? 10 : 0 }}>
          {bools.map((d) => (
            <ParamControl key={d.id} def={d} />
          ))}
        </div>
      )}
      {nums.map((d) => (
        <ParamControl key={d.id} def={d} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function SystemPanel(): JSX.Element {
  useNetState()
  const sys = net.state.system
  return (
    <>
      <div className="block">
        <Segmented
          big
          options={SYSTEMS.map((s) => s.id)}
          labels={SYSTEMS.map((s) => s.label)}
          value={sys}
          onChange={(v) => net.setSystem(v as typeof sys)}
        />
      </div>
      <Group title={SYSTEMS.find((s) => s.id === sys)?.label ?? sys.toUpperCase()} group={sys} />
    </>
  )
}

export function MixPanel(): JSX.Element {
  useNetState()
  const base = net.state.system
  return (
    <>
      <Group title="MASTER" group="master" />
      <div className="block">
        <h3>LAYERS · STACK SYSTEMS</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          <b>{SYSTEMS.find((s) => s.id === base)?.label ?? base}</b> is the base layer (opaque).
          Fade the other two in over it — these are modulatable, so route LEVEL or an LFO here to
          bring a whole system in and out.
        </p>
        {PARAMS.filter((p) => p.group === 'mix' && p.kind === 'enum').map((d) => (
          <div key={d.id} style={{ marginBottom: 10 }}>
            <ParamControl def={d} />
          </div>
        ))}
        {PARAMS.filter((p) => p.group === 'mix' && p.kind === 'number').map((d) => (
          <div key={d.id} style={{ opacity: d.id === `mix.${base}` ? 0.4 : 1 }}>
            <ParamControl def={d} />
          </div>
        ))}
      </div>
      <Group title="FX CHAIN" group="fx" />
    </>
  )
}

export function AudioPanel(): JSX.Element {
  useNetState()
  const dev = net.state.audioDeviceId ?? ''
  return (
    <>
      <div className="block">
        <h3>INPUT</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          {PARAMS.filter((p) => p.group === 'audio' && p.kind === 'bool').map((d) => (
            <ParamControl key={d.id} def={d} />
          ))}
          <select value={dev} onChange={(e) => net.setDevice('audio', e.target.value || null)}>
            <option value="">Default device</option>
            {net.devices.audio.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        {PARAMS.filter((p) => p.group === 'audio' && p.kind === 'number').map((d) => (
          <ParamControl key={d.id} def={d} />
        ))}
        <p className="hint">
          Zoom F4: set MENU → USB → Audio Interface → Stereo Mix (class-compliant, no driver).
        </p>
      </div>
      <div className="block">
        <h3>ANALYSIS · 8 BANDS → MOD MATRIX</h3>
        <Spectrum />
        <div className="eq-bank">
          {Array.from({ length: 8 }, (_, i) => (
            <EqFader key={i} index={i} />
          ))}
        </div>
      </div>
    </>
  )
}

function EqFader({ index }: { index: number }): JSX.Element {
  useNetState()
  const id = `audio.eq${index}`
  const v = net.state.values[id]
  return (
    <Fader
      label={SOURCE_LABELS[`band${index}` as ModSource].replace('EQ ', '')}
      value={typeof v === 'number' ? v : 1}
      min={0}
      max={2}
      onChange={(x) => net.set(id, x)}
      format={(x) => `${Math.round(x * 100)}%`}
    />
  )
}

// ---------------------------------------------------------------------------

export function ModPanel(): JSX.Element {
  useNetState()
  const routes = net.state.routes
  const targets = PARAMS.filter((p) => p.kind === 'number' && p.mod)
  const update = (i: number, patch: Partial<ModRoute>): void => {
    const next = routes.map((r, j) => (i === j ? { ...r, ...patch } : r))
    net.setRoutes(next)
  }
  return (
    <>
      <div className="block">
        <h3>ROUTES · SOURCE → PARAMETER</h3>
        {routes.map((r, i) => (
          <div className="route" key={r.id}>
            <select value={r.source} onChange={(e) => update(i, { source: e.target.value as ModSource })}>
              {MOD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
            <select value={r.target} onChange={(e) => update(i, { target: e.target.value })}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}
                </option>
              ))}
            </select>
            <HSlider
              label=""
              bipolar
              value={r.depth}
              min={-1}
              max={1}
              onChange={(x) => update(i, { depth: x })}
            />
            <button
              className="icon-btn"
              onClick={() => net.setRoutes(routes.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <button
            className="add-btn"
            onClick={() =>
              net.setRoutes([
                ...routes,
                {
                  id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
                  source: 'band0',
                  target: 'fx.bloom',
                  depth: 0.3
                }
              ])
            }
          >
            + ADD ROUTE
          </button>
        </div>
      </div>
      <div className="block">
        <h3>LFOS</h3>
        <div className="lfo-grid">
          {net.state.lfos.map((lfo, i) => (
            <div className="lfo-card" key={i}>
              <h4>LFO {i + 1}</h4>
              <Segmented
                options={['sine', 'triangle', 'saw', 'square', 'random']}
                labels={['SIN', 'TRI', 'SAW', 'SQR', 'S&H']}
                value={lfo.shape}
                onChange={(shape) => net.setLfo(i, { ...lfo, shape: shape as typeof lfo.shape })}
              />
              <div style={{ height: 8 }} />
              <HSlider
                label="Rate"
                value={Math.log(lfo.rateHz)}
                min={Math.log(0.02)}
                max={Math.log(20)}
                onChange={(x) => net.setLfo(i, { ...lfo, rateHz: Math.exp(x) })}
                format={() => (lfo.rateHz < 1 ? `${lfo.rateHz.toFixed(2)}Hz` : `${lfo.rateHz.toFixed(1)}Hz`)}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

export function ScenesPanel(): JSX.Element {
  useNetState()
  const [name, setName] = useState('')
  const factory = new Set(Object.keys(FACTORY_PRESETS))
  return (
    <div className="block">
      <h3>SCENES</h3>
      <div className="row" style={{ marginBottom: 14 }}>
        <input
          type="text"
          placeholder="scene name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="primary-btn"
          onClick={() => {
            const n = name.trim() || `SCENE ${net.presets.length + 1}`
            net.send({ t: 'preset.save', name: n })
            setName('')
          }}
        >
          SAVE
        </button>
      </div>
      <div className="preset-grid">
        {net.presets.map((p) => (
          <button className="preset" key={p} onClick={() => net.send({ t: 'preset.load', name: p })}>
            {p}
            {!factory.has(p) && (
              <span
                className="del"
                onClick={(e) => {
                  e.stopPropagation()
                  net.send({ t: 'preset.delete', name: p })
                }}
              >
                ✕
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function SetupPanel(): JSX.Element {
  useNetState()
  const q = net.state.quality
  return (
    <>
      <div className="block">
        <h3>QUALITY</h3>
        <Segmented
          options={['low', 'medium', 'high', 'ultra']}
          value={q.preset}
          onChange={(v) => net.setQuality({ preset: v as QualityPreset })}
        />
        <div style={{ height: 10 }} />
        <HSlider
          label="Render scale"
          value={q.renderScale}
          min={0.5}
          max={2}
          onChange={(x) => net.setQuality({ renderScale: Math.round(x * 20) / 20 })}
          format={(x) => `${x.toFixed(2)}×`}
        />
        <div className="row">
          <span className="hint" style={{ width: 130 }}>
            FPS cap
          </span>
          <div style={{ flex: 1 }}>
            <Segmented
              options={['0', '30', '60', '120']}
              labels={['OFF', '30', '60', '120']}
              value={String(q.fpsCap)}
              onChange={(v) => net.setQuality({ fpsCap: Number(v) as 0 | 30 | 60 | 120 })}
            />
          </div>
        </div>
        <div className="row">
          <span className="hint" style={{ width: 130 }}>
            Anti-aliasing
          </span>
          <div style={{ flex: 1 }}>
            <Segmented
              options={['0', '2', '4']}
              labels={['OFF', '2×', '4×']}
              value={String(q.msaa ?? 0)}
              onChange={(v) => net.setQuality({ msaa: Number(v) as MsaaLevel })}
            />
          </div>
        </div>
        <p className="hint">
          MSAA sharpens PARTICLES most — edges resolve before bloom softens them — and costs
          fragment throughput. Turn it up until the frame rate moves, then back off one step.
        </p>
      </div>

      <div className="block">
        <h3>OUTPUT WINDOW</h3>
        <div className="row">
          <button className="primary-btn" onClick={() => net.send({ t: 'window', fullscreen: true })}>
            FULLSCREEN
          </button>
          <button className="add-btn" onClick={() => net.send({ t: 'window', fullscreen: false })}>
            WINDOWED
          </button>
          <span className="hint">Display:</span>
          {[0, 1, 2].map((d) => (
            <button key={d} className="add-btn" onClick={() => net.send({ t: 'window', display: d })}>
              {d + 1}
            </button>
          ))}
        </div>
        <p className="hint">In the output window: F fullscreen · H hud · 1/2 switch system.</p>
      </div>

      <div className="block">
        <h3>WEBCAM</h3>
        <select
          value={net.state.videoDeviceId ?? ''}
          onChange={(e) => net.setDevice('video', e.target.value || null)}
        >
          <option value="">Default camera</option>
          {net.devices.video.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
        <p className="hint">Used by CHARACTERS → mode CAM. Devices appear after audio/camera starts.</p>
      </div>

      <div className="block">
        <h3>REMOTE CONTROL</h3>
        <p className="hint">
          WebSocket API on <code>ws://127.0.0.1:{net.port}</code> — CLI:{' '}
          <code>npm run ctl -- set fx.bloom 0.8</code>. Start with <code>--ws-host=0.0.0.0</code> to
          allow phone / ESP32 control.
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

export function HeaderMeters(): JSX.Element {
  const t = useTelemetry()
  return (
    <div className="meta">
      <span>{t.fps} fps</span>
      <div className="level-mini">
        <div style={{ width: `${Math.min(1, t.level) * 100}%` }} />
      </div>
    </div>
  )
}
