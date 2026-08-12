import { createRoot } from 'react-dom/client'
import { App } from './App'
import { initMidi } from './midi'
import './style.css'

initMidi()

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
createRoot(root).render(<App />)
