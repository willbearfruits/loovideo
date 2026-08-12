import { useState, type JSX } from 'react'
import { net, useNetState } from './net'
import {
  AudioPanel,
  HeaderMeters,
  MixPanel,
  ModPanel,
  SetupPanel,
  StagePanel,
  SystemPanel
} from './panels'

const TABS = ['PERFORM', 'DESIGN', 'FX', 'AUDIO', 'MOD', 'SETUP'] as const
type Tab = (typeof TABS)[number]

export function App(): JSX.Element {
  useNetState()
  const [tab, setTab] = useState<Tab>('PERFORM')
  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          LOO<span>VIDEO</span>
        </div>
        <div className={`conn-dot${net.connected ? ' ok' : ''}`} title={net.connected ? 'hub connected' : 'hub down'} />
        <HeaderMeters />
      </header>
      <main className="content">
        {tab === 'PERFORM' && <StagePanel />}
        {tab === 'DESIGN' && <SystemPanel />}
        {tab === 'FX' && <MixPanel />}
        {tab === 'AUDIO' && <AudioPanel />}
        {tab === 'MOD' && <ModPanel />}
        {tab === 'SETUP' && <SetupPanel />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
    </div>
  )
}
