#!/usr/bin/env node
// loovideo CLI — talks to the app's WebSocket hub.
//
//   npm run ctl -- <command> [args] [--port 7770] [--host 127.0.0.1]
//
//   state                      dump current state (values, routes, system)
//   set <id> <value>           set a parameter        e.g. set fx.bloom 0.8
//   get <id>                   print one value
//   system <chars|parts>       switch visual system
//   preset <name>              load a preset
//   preset-save <name>         save current state as a preset
//   presets                    list presets
//   fullscreen <on|off>        output window fullscreen
//   display <n>                move output window to display n (0-based)
//   place <tree|birds|fell> [x y]   stage tap at normalized 0..1 coords
//   watch                      stream telemetry (ctrl-c to stop)

import WebSocket from 'ws'

const argv = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  if (i >= 0 && argv[i + 1]) {
    const v = argv[i + 1]
    argv.splice(i, 2)
    return v
  }
  return dflt
}
const port = flag('port', '7770')
const host = flag('host', '127.0.0.1')
const [cmd, ...rest] = argv

if (!cmd) {
  console.log('usage: ctl <state|set|get|system|preset|preset-save|presets|fullscreen|display|place|watch>')
  process.exit(1)
}

const ws = new WebSocket(`ws://${host}:${port}`)
const send = (m) => ws.send(JSON.stringify(m))
const die = (msg, code = 0) => {
  if (msg) console.log(msg)
  ws.close()
  process.exit(code)
}

const parseValue = (s) => {
  if (s === 'true') return true
  if (s === 'false') return false
  const n = Number(s)
  return Number.isFinite(n) ? n : s
}

ws.on('error', (e) => {
  console.error(`cannot reach loovideo at ws://${host}:${port} — is it running? (${e.message})`)
  process.exit(2)
})

ws.on('open', () => {
  send({ t: 'hello', role: 'cli' })
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.t === 'state') {
    switch (cmd) {
      case 'state':
        die(JSON.stringify(msg.state, null, 2))
        break
      case 'get':
        die(`${rest[0]} = ${JSON.stringify(msg.state.values[rest[0]])}`)
        break
      case 'presets':
        die(msg.presets.join('\n'))
        break
      case 'set':
        send({ t: 'set', id: rest[0], value: parseValue(rest[1]) })
        die(`set ${rest[0]} = ${rest[1]}`)
        break
      case 'system':
        send({ t: 'system', id: rest[0] })
        die(`system → ${rest[0]}`)
        break
      case 'preset':
        send({ t: 'preset.load', name: rest.join(' ') })
        die(`preset → ${rest.join(' ')}`)
        break
      case 'next':
        send({ t: 'preset.cycle', dir: 1 })
        die('next preset')
        break
      case 'prev':
        send({ t: 'preset.cycle', dir: -1 })
        die('prev preset')
        break
      case 'preset-save':
        send({ t: 'preset.save', name: rest.join(' ') })
        die(`saved preset ${rest.join(' ')}`)
        break
      case 'fullscreen':
        send({ t: 'window', fullscreen: rest[0] !== 'off' })
        die(`fullscreen ${rest[0] !== 'off' ? 'on' : 'off'}`)
        break
      case 'display':
        send({ t: 'window', display: Number(rest[0]) || 0 })
        die(`display → ${rest[0]}`)
        break
      case 'place': {
        const x = rest[1] !== undefined ? Number(rest[1]) : 0.5
        const y = rest[2] !== undefined ? Number(rest[2]) : 0.55
        send({ t: 'place', kind: rest[0], x, y })
        die(`place ${rest[0]} @ ${x},${y}`)
        break
      }
      case 'watch':
        console.log('watching telemetry — ctrl-c to stop')
        break
      default:
        die(`unknown command: ${cmd}`, 1)
    }
  } else if (msg.t === 'telemetry' && cmd === 'watch') {
    const bar = (v, n = 10) => '▮'.repeat(Math.round(Math.min(1, v) * n)).padEnd(n, '·')
    process.stdout.write(
      `\r${msg.fps} fps  lvl ${bar(msg.level)}  bands ${msg.bands.map((b) => bar(b, 3)).join(' ')} `
    )
  }
})
