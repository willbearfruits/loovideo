import { OutputNet } from './net'
import { Engine } from './engine'

const net = new OutputNet()
const hud = document.getElementById('hud')
if (!hud) throw new Error('missing #hud')
new Engine(net, hud)
