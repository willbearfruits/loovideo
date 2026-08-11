// loovideo main process: two windows (output + control), the WebSocket hub,
// CLI flags, media permissions, and performance-critical window settings.

import { app, BrowserWindow, screen, session } from 'electron'
import { join } from 'node:path'
import { ParamStore } from './store'
import { Hub } from './server'
import { DEFAULT_WS_PORT } from '../shared/protocol'
import type { QualityPreset } from '../shared/params'

interface CliArgs {
  fullscreen: boolean
  display?: number
  preset?: string
  wsPort: number
  wsHost: string
  noAudio: boolean
  quality?: QualityPreset
  help: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = {
    fullscreen: false,
    wsPort: DEFAULT_WS_PORT,
    wsHost: '127.0.0.1',
    noAudio: false,
    help: false
  }
  for (const arg of argv) {
    const [k, v] = arg.split('=', 2)
    switch (k) {
      case '--fullscreen': a.fullscreen = true; break
      case '--display': a.display = Number(v); break
      case '--preset': a.preset = v; break
      case '--ws-port': a.wsPort = Number(v) || DEFAULT_WS_PORT; break
      case '--ws-host': a.wsHost = v || '127.0.0.1'; break
      case '--no-audio': a.noAudio = true; break
      case '--quality':
        if (v === 'low' || v === 'medium' || v === 'high' || v === 'ultra') a.quality = v
        break
      case '--help': case '-h': a.help = true; break
    }
  }
  return a
}

const HELP = `loovideo — realtime audio-reactive visual instrument

  --fullscreen          start the output window fullscreen
  --display=N           put the output window on display N (0-based)
  --preset=NAME         load a preset at startup
  --quality=TIER        low | medium | high | ultra
  --no-audio            start with audio input disabled
  --ws-port=PORT        control server port (default ${DEFAULT_WS_PORT})
  --ws-host=HOST        bind address; use 0.0.0.0 to allow phone/ESP32 control
  --help                this text

Remote control: connect a WebSocket client and speak JSON — see README.
Keys in the output window: F fullscreen · H hud · 1/2 switch system · Esc exit fs
`

const args = parseArgs(process.argv.slice(1))
if (args.help) {
  process.stdout.write(HELP)
  app.exit(0)
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0)
}

let store: ParamStore
let hub: Hub
let outputWin: BrowserWindow | null = null
let controlWin: BrowserWindow | null = null

function loadPage(win: BrowserWindow, page: 'output' | 'control'): void {
  const query = { port: String(args.wsPort) }
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}/${page}.html?port=${query.port}`)
  } else {
    void win.loadFile(join(import.meta.dirname, `../renderer/${page}.html`), { query })
  }
}

function moveToDisplay(win: BrowserWindow, index: number): void {
  const displays = screen.getAllDisplays()
  const d = displays[Math.min(index, displays.length - 1)]
  if (!d) return
  const wasFs = win.isFullScreen()
  if (wasFs) win.setFullScreen(false)
  win.setBounds({ x: d.bounds.x + 40, y: d.bounds.y + 40, width: 960, height: 540 })
  if (wasFs) win.setFullScreen(true)
}

function createWindows(): void {
  outputWin = new BrowserWindow({
    width: 960,
    height: 540,
    backgroundColor: '#000000',
    title: 'loovideo — output',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  loadPage(outputWin, 'output')
  outputWin.once('ready-to-show', () => {
    if (args.display !== undefined && outputWin) moveToDisplay(outputWin, args.display)
    outputWin?.show()
    if (args.fullscreen) outputWin?.setFullScreen(true)
  })

  // Performance keys handled in main so the renderer stays untouched.
  outputWin.webContents.on('before-input-event', (_event, input) => {
    if (input.type !== 'keyDown' || input.control || input.meta || input.alt) return
    switch (input.key.toLowerCase()) {
      case 'f':
        outputWin?.setFullScreen(!outputWin.isFullScreen())
        break
      case 'escape':
        if (outputWin?.isFullScreen()) outputWin.setFullScreen(false)
        break
      case 'h':
        hub.applySet('master.hud', !store.state.values['master.hud'])
        break
      case '1':
        hub.applySystem('chars')
        break
      case '2':
        hub.applySystem('parts')
        break
      case '3':
        hub.applySystem('flora')
        break
      case 'arrowright':
        hub.applyPresetCycle(1)
        break
      case 'arrowleft':
        hub.applyPresetCycle(-1)
        break
    }
  })

  controlWin = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: '#0c0d10',
    title: 'loovideo — control',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  loadPage(controlWin, 'control')

  // Keep the control window off whichever display the output is using. Without
  // this it opens wherever Windows last felt like, which on a docked Ally means
  // it lands half on the projector — the one screen the audience can see.
  {
    const displays = screen.getAllDisplays()
    const outIdx =
      args.display !== undefined ? Math.min(args.display, displays.length - 1) : -1
    const target =
      displays.find((_, i) => i !== outIdx && displays.length > 1) ?? screen.getPrimaryDisplay()
    const wa = target.workArea
    controlWin.setBounds({
      x: wa.x,
      y: wa.y,
      width: Math.min(1180, wa.width),
      height: Math.min(760, wa.height)
    })
  }

  outputWin.on('closed', () => {
    outputWin = null
    app.quit()
  })
  controlWin.on('closed', () => {
    controlWin = null
    app.quit()
  })
}

app.on('second-instance', () => {
  controlWin?.focus()
})

app.whenReady().then(() => {
  // grant mic + webcam without a Chromium prompt (there is no prompt UI here)
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media')
  })

  store = new ParamStore(app.getPath('userData'))
  if (args.noAudio) store.set('audio.enabled', false)
  if (args.quality) store.setQuality({ preset: args.quality })
  if (args.preset) store.loadPreset(args.preset)

  hub = new Hub(
    store,
    {
      onWindow: (msg) => {
        if (!outputWin) return
        if (msg.display !== undefined) moveToDisplay(outputWin, msg.display)
        if (msg.fullscreen !== undefined) outputWin.setFullScreen(msg.fullscreen)
      }
    },
    args.wsPort,
    args.wsHost
  )

  createWindows()
})

app.on('window-all-closed', () => {
  hub?.close()
  app.quit()
})
