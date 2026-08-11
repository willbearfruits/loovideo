// Leaf-outline sprites. The reference look draws foliage as delicate STROKED
// leaf shapes — an almond outline with a stem and a hint of mid-vein — not
// filled squares. Stroking thousands of bezier leaves per frame is too slow,
// so each palette color gets a pre-rendered strip of 16 rotations that the
// tree stamps with drawImage. Cache is tiny: one strip per color in use.

export interface LeafSprites {
  canvas: HTMLCanvasElement
  cell: number
  count: number
}

const CELL = 36
const COUNT = 16
const cache = new Map<string, LeafSprites>()

export function getLeafSprites(color: string): LeafSprites {
  const hit = cache.get(color)
  if (hit) return hit

  const canvas = document.createElement('canvas')
  canvas.width = CELL * COUNT
  canvas.height = CELL
  const g = canvas.getContext('2d')!
  g.strokeStyle = color
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // leaf geometry in local space: stem at (0, 9) → base (0, 4) → tip (0, -10)
  const L = CELL / 2 - 3
  for (let i = 0; i < COUNT; i++) {
    g.save()
    g.translate(i * CELL + CELL / 2, CELL / 2)
    g.rotate((i / COUNT) * Math.PI * 2)
    const tip = -L
    const base = L * 0.35
    const stem = L * 0.8
    const belly = L * 0.52
    g.lineWidth = 2.1
    g.beginPath()
    g.moveTo(0, stem) // stem
    g.lineTo(0, base)
    g.stroke()
    g.lineWidth = 1.7
    g.beginPath() // almond outline: two mirrored quadratics
    g.moveTo(0, base)
    g.quadraticCurveTo(-belly, (base + tip) / 2, 0, tip)
    g.quadraticCurveTo(belly, (base + tip) / 2, 0, base)
    g.stroke()
    g.globalAlpha = 0.55
    g.lineWidth = 1.1
    g.beginPath() // mid-vein
    g.moveTo(0, base * 0.7)
    g.lineTo(0, tip * 0.72)
    g.stroke()
    g.globalAlpha = 1
    g.restore()
  }

  const s: LeafSprites = { canvas, cell: CELL, count: COUNT }
  cache.set(color, s)
  return s
}
