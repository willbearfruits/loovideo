// Space-colonization tree (Runions, Lane & Prusinkiewicz 2007). Attraction
// points fill a crown envelope; nodes grow toward whichever attractors they
// influence; attractors die when reached. Branching is emergent. Growth ticks
// are driven by the music — the tree grows while sound plays, holds its breath
// in silence, and sheds leaves if the silence goes on.
//
// Growth is ENDLESS by design: when a crown envelope is consumed the tree
// seeds the next generation above and around its own canopy, so it keeps
// branching for as long as the set lasts. The node ceiling comes from the
// quality tier, and FloraSystem's auto-frame scales the drawing down as the
// silhouette grows, which is what makes unbounded growth stay watchable.
//
// Nearest-node queries go through an unbounded spatial hash (cell = the
// influence radius), so a generation costs O(attractors) rather than
// O(attractors × nodes) — without it, growth past a few thousand nodes stalls
// the frame.
//
// Thickness: pipe model (Leonardo's rule, exponent 2) accumulated from tips.
// Sway: per-node rotation accumulated down the parent chain (rigid trunk,
// flexible tips, phase accruing along each branch → a traveling wave).
//
// Rendering is the "luminous ink" look: a wide dim halo under the structural
// wood, bright cores whose brightness tapers from trunk to twig, limbs curved
// through segment midpoints, leaves as stroked outline sprites, and species
// appendages (willow strand curtains, banyan aerial roots, the bonsai vessel).

import { getLeafSprites } from './leafsprites'

export interface TreeDrive {
  wind: number
  vigor: number
  scatter: number
  level: number
  bass: number
  treble: number
  onset: number
  silence: number
  horizonY: number
  /** keep seeding new crown generations instead of finishing */
  endless: boolean
  /** how far each new generation reaches beyond the current canopy */
  reach: number
  /** background dieback rate — old tips are shed to make room for new growth */
  decay: number
  /** foliage density 0..1 */
  leaves: number
  /** 0 spring · 0.25 summer · 0.5 autumn · 0.75 winter (wraps) */
  season: number
}

/**
 * The year, as it reaches the canopy. Spring buds small and pale, summer is
 * full and mid-toned, autumn turns to the palette's accent stop and lets go,
 * winter is bare. `fall` is a multiplier on how readily a leaf detaches, so
 * autumn actually rains and winter has nothing left to drop.
 */
export function seasonLeaf(season: number): { size: number; stop: number; fall: number } {
  const s = ((season % 1) + 1) % 1
  if (s < 0.25) {
    const t = s / 0.25 // spring: budding
    return { size: 0.25 + t * 0.75, stop: 2, fall: 0.25 }
  }
  if (s < 0.5) {
    return { size: 1, stop: 3, fall: 0.35 } // summer: full canopy
  }
  if (s < 0.75) {
    const t = (s - 0.5) / 0.25 // autumn: turning and falling
    return { size: 1 - t * 0.35, stop: 4, fall: 1 + t * 3 }
  }
  const t = (s - 0.75) / 0.25 // winter: bare
  return { size: Math.max(0, 0.65 - t * 0.65), stop: 4, fall: 2.5 * (1 - t) }
}

export type TreeKind = 'oak' | 'pine' | 'willow' | 'birch' | 'sapling' | 'bonsai' | 'banyan'

/**
 * Species are the same space-colonization solver with a different crown
 * envelope and tropism. That is close to how the real difference arises: a
 * pine's apical dominance is a strong upward bias with a narrow crown, a
 * willow's habit is a downward bias at the tips, a birch is narrow and sparse.
 */
interface KindProfile {
  /** crown ellipse radii, as multipliers on the default envelope */
  rx: number
  ry: number
  /** crown centre height above the ground line, as a fraction of view height */
  cy: number
  /** vertical bias applied to every growth step: negative is upward */
  tropism: number
  /** internode length multiplier — short segments read as dense twigging */
  seg: number
  /** direction jitter; low is orderly, high is scruffy */
  jitter: number
  /** attractor count multiplier */
  fill: number
  /** leaf sprite size multiplier */
  leaf: number
  /** hanging strand curtains from the outer tips (weeping willow) */
  strands?: boolean
  /** aerial roots dropping from the major limbs to the ground (banyan) */
  roots?: boolean
  /** outlined vessel under the trunk foot (bonsai) */
  pot?: boolean
  /** seed the crown as k flattened pads instead of one ellipse (bonsai) */
  pads?: number
  /** trunk bootstrap follows an S-curve instead of climbing straight */
  sCurve?: boolean
  /** major limbs stroked as an offset fiber bundle, not one line */
  fiber?: boolean
}

const KINDS: Record<TreeKind, KindProfile> = {
  oak: { rx: 1, ry: 1, cy: 0.46, tropism: -0.1, seg: 1, jitter: 0.24, fill: 1, leaf: 1 },
  pine: { rx: 0.5, ry: 1.5, cy: 0.55, tropism: -0.42, seg: 0.85, jitter: 0.12, fill: 1.15, leaf: 0.6 },
  willow: { rx: 1.2, ry: 0.8, cy: 0.5, tropism: 0.3, seg: 1.05, jitter: 0.3, fill: 0.95, leaf: 1.25, strands: true },
  birch: { rx: 0.62, ry: 1.25, cy: 0.5, tropism: -0.26, seg: 1.15, jitter: 0.18, fill: 0.7, leaf: 0.85 },
  // a young tree: few long graceful limbs, oversized leaves at the tips
  sapling: { rx: 0.85, ry: 0.95, cy: 0.5, tropism: -0.22, seg: 1.35, jitter: 0.1, fill: 0.42, leaf: 1.55 },
  // S-curved fiber trunk, flattened foliage pads, an outlined vessel
  bonsai: { rx: 0.95, ry: 0.5, cy: 0.34, tropism: -0.06, seg: 0.8, jitter: 0.34, fill: 1.05, leaf: 0.9, pads: 4, sCurve: true, pot: true, fiber: true },
  // broad low dome on a massive base, aerial roots reaching for the ground
  banyan: { rx: 1.55, ry: 0.72, cy: 0.42, tropism: -0.06, seg: 0.95, jitter: 0.26, fill: 1.25, leaf: 0.9, roots: true, fiber: true }
}

interface Leaf {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  phase: number
}

export interface TreeBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

const INIT_CAP = 4096

export class Tree {
  /** true only when the node ceiling is reached — not when a crown is spent */
  done = false
  generation = 0

  private nodesX = new Float32Array(INIT_CAP)
  private nodesY = new Float32Array(INIT_CAP)
  private parent = new Int32Array(INIT_CAP)
  private depth = new Int32Array(INIT_CAP)
  private radius = new Float32Array(INIT_CAP)
  private phase = new Float32Array(INIT_CAP)
  private childCount = new Int32Array(INIT_CAP)
  private swayX = new Float32Array(INIT_CAP)
  private swayY = new Float32Array(INIT_CAP)
  private swayA = new Float32Array(INIT_CAP)
  private nNodes = 0 // high-water mark of used slots, not the live count
  private cap = INIT_CAP
  private nodeCeiling = 40_000

  // Growth/decay equilibrium. The node ceiling is a memory and stroke-cost
  // limit, not a life expectancy: once the tree reaches it, the OLDEST tips are
  // shed and their slots recycled, so new growth continues indefinitely and the
  // canopy erodes inward behind it. That is what makes growth genuinely
  // endless rather than "grows, then stops looking alive".
  private alive = new Uint8Array(INIT_CAP)
  private birth = new Int32Array(INIT_CAP)
  private freeList = new Int32Array(INIT_CAP)
  private freeN = 0
  private liveCount = 0
  private tick = 0
  private hashDirty = false
  private decayCarry = 0
  /**
   * Seconds this tree has been alive, and the stamp on each node. Leaf size
   * was keyed to the GROWTH TICK counter, which is the bug that made foliage
   * never appear: ticks only advance while the music is driving growth, so a
   * leaf needed ~220 of them to reach full size — minutes of continuous sound —
   * and dieback sheds the OLDEST tips first, which are precisely the ones that
   * had earned a leaf. The canopy stayed permanently juvenile. Wall-clock
   * seconds decouples foliage from the growth rate.
   */
  private ageSec = 0
  private birthT = new Float32Array(INIT_CAP)
  private leafUnit = 1
  private seasonFall = 1
  private leafFallCarry = 0
  private kind: TreeKind = 'oak'
  private prof: KindProfile = KINDS.oak
  /** >0 while this tree is being felled: everything sheds, nothing grows */
  private fellT = 0

  // spatial hash over nodes; cell size ≥ the influence radius so a 3×3 scan
  // is exhaustive. Unbounded (hashed), so the crown may leave the viewport.
  private gridHead = new Int32Array(0)
  private gridNext = new Int32Array(INIT_CAP)
  private gridMask = 0
  private cellSize = 1

  private attrX = new Float32Array(0)
  private attrY = new Float32Array(0)
  private attrAlive = new Uint8Array(0)
  private attrN = 0
  private attrLeft = 0

  private segLen = 10
  private tickBudget = 0
  private stall = 0
  private lastOnset = 0
  private ambientCarry = 0
  private maxDepth = 1
  private falling: Leaf[] = []
  private leafShed = 0
  private radiusDirty = true
  private tipCount = 0
  private minX = 0
  private maxX = 0
  private minY = 0
  private maxY = 0
  private density = 0.6
  private originX = 0
  private rootY = 0
  private treeScale = 1

  // scratch for grow(), sized to capacity and reused — allocating three
  // node-sized arrays per growth tick was the single biggest cost on a mature
  // tree (six ticks a frame × tens of thousands of nodes of garbage)
  private accX = new Float32Array(INIT_CAP)
  private accY = new Float32Array(INIT_CAP)
  private accN = new Int32Array(INIT_CAP)

  // node indices counting-sorted by stroke width, rebuilt only when the tree
  // grows. Drawing then walks one contiguous run per width instead of
  // re-testing every node four times a frame.
  private order = new Int32Array(INIT_CAP)
  private bucketStart = new Int32Array(5)
  private cursor = new Int32Array(4)

  /**
   * @param originX  trunk foot, in canvas px (a grove spreads these out)
   * @param scale    per-trunk size multiplier, so a grove is not a row of clones
   * @param nodeCeiling  this trunk's share of the quality tier's node budget
   */
  reset(
    w: number,
    h: number,
    density: number,
    horizonY: number,
    originX = w / 2,
    scale = 1,
    nodeCeiling = 40_000,
    kind: TreeKind = 'oak'
  ): void {
    this.kind = kind
    const K = KINDS[kind] ?? KINDS.oak
    this.prof = K
    this.nNodes = 0
    this.done = false
    this.stall = 0
    this.tickBudget = 0
    this.falling = []
    this.maxDepth = 1
    this.generation = 0
    this.tick = 0
    this.hashDirty = false
    this.decayCarry = 0
    this.fellT = 0
    this.ageSec = 0
    this.density = density
    this.nodeCeiling = Math.max(600, Math.floor(nodeCeiling))
    this.cap = INIT_CAP
    this.allocNodes(INIT_CAP)

    const u = h / 1080
    this.segLen = 11 * u * scale * K.seg

    // the hash cell must cover the largest influence radius grow() can ask for
    this.cellSize = this.segLen * 7.2
    const table = 1 << Math.ceil(Math.log2(Math.max(1024, this.nodeCeiling)))
    this.gridHead = new Int32Array(table).fill(-1)
    this.gridMask = table - 1

    // crown envelope: ellipse, surface-weighted sampling for a full crown edge
    const cx = originX
    const cy = horizonY - h * K.cy * scale
    const rx = Math.min(w * 0.34, h * 0.42) * scale * K.rx
    const ry = h * 0.3 * scale * K.ry
    this.originX = cx
    this.rootY = horizonY
    this.treeScale = scale
    this.attrN = 0
    this.attrLeft = 0
    const count = Math.round((260 + density * 900) * K.fill)
    this.growAttrCapacity(count)
    if (K.pads && K.pads > 1) {
      // bonsai: flattened foliage pads stepped up the S of the trunk, sides
      // alternating — the cloud-layer silhouette rather than one dome
      const pads = K.pads
      const per = Math.max(40, Math.round(count / pads))
      for (let j = 0; j < pads; j++) {
        const side = j % 2 === 0 ? -1 : 1
        const fx = cx + side * (0.3 + 0.55 * (j / pads)) * rx + (Math.random() - 0.5) * rx * 0.2
        const fy = cy + ry * (0.75 - (j / (pads - 1)) * 1.7)
        this.seedCrown(fx, fy, rx * 0.38, ry * 0.42, per)
      }
    } else {
      this.seedCrown(cx, cy, rx, ry, count)
    }

    this.minX = this.maxX = cx
    this.minY = this.maxY = horizonY

    // root node at the ground line, then a trunk bootstrap: climb (straight,
    // or along an S for bonsai) until the crown's influence field can see the
    // tip — without this the algorithm stalls before it ever starts
    let tip = this.addNode(cx, horizonY, -1)
    const di = this.segLen * 6
    let guard = 200
    let step = 0
    while (guard-- > 0 && tip >= 0) {
      if (this.nearestAttractorDist2(this.nodesX[tip], this.nodesY[tip]) < di * di) break
      step++
      const xNext = K.sCurve
        ? cx + Math.sin(step * 0.3) * h * 0.055 * scale
        : this.nodesX[tip] + (Math.random() - 0.5) * this.segLen * 0.35
      tip = this.addNode(xNext, this.nodesY[tip] - this.segLen, tip)
    }
  }

  private allocNodes(cap: number): void {
    this.nodesX = new Float32Array(cap)
    this.nodesY = new Float32Array(cap)
    this.parent = new Int32Array(cap)
    this.depth = new Int32Array(cap)
    this.radius = new Float32Array(cap)
    this.phase = new Float32Array(cap)
    this.childCount = new Int32Array(cap)
    this.swayX = new Float32Array(cap)
    this.swayY = new Float32Array(cap)
    this.swayA = new Float32Array(cap)
    this.gridNext = new Int32Array(cap)
    this.accX = new Float32Array(cap)
    this.accY = new Float32Array(cap)
    this.accN = new Int32Array(cap)
    this.order = new Int32Array(cap)
    this.alive = new Uint8Array(cap)
    this.birth = new Int32Array(cap)
    this.birthT = new Float32Array(cap)
    this.freeList = new Int32Array(cap)
    this.freeN = 0
    this.liveCount = 0
  }

  private growNodeCapacity(): void {
    const next = Math.min(this.nodeCeiling + 8, this.cap * 2)
    if (next <= this.cap) return
    const f = (a: Float32Array): Float32Array<ArrayBuffer> => {
      const b = new Float32Array(next)
      b.set(a)
      return b
    }
    const i32 = (a: Int32Array): Int32Array<ArrayBuffer> => {
      const b = new Int32Array(next)
      b.set(a)
      return b
    }
    this.nodesX = f(this.nodesX)
    this.nodesY = f(this.nodesY)
    this.parent = i32(this.parent)
    this.depth = i32(this.depth)
    this.radius = f(this.radius)
    this.phase = f(this.phase)
    this.childCount = i32(this.childCount)
    this.swayX = f(this.swayX)
    this.swayY = f(this.swayY)
    this.swayA = f(this.swayA)
    this.gridNext = i32(this.gridNext)
    this.accX = new Float32Array(next)
    this.accY = new Float32Array(next)
    this.accN = new Int32Array(next)
    this.order = new Int32Array(next)
    const al = new Uint8Array(next)
    al.set(this.alive)
    this.alive = al
    this.birth = i32(this.birth)
    this.birthT = f(this.birthT)
    this.freeList = i32(this.freeList)
    this.cap = next
  }

  private growAttrCapacity(extra: number): void {
    const need = this.attrN + extra
    if (need <= this.attrX.length) return
    const next = Math.max(need, this.attrX.length * 2, 512)
    const fx = new Float32Array(next)
    fx.set(this.attrX)
    const fy = new Float32Array(next)
    fy.set(this.attrY)
    const al = new Uint8Array(next)
    al.set(this.attrAlive)
    this.attrX = fx
    this.attrY = fy
    this.attrAlive = al
  }

  private seedCrown(cx: number, cy: number, rx: number, ry: number, count: number): void {
    this.growAttrCapacity(count)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.pow(Math.sin((Math.random() * Math.PI) / 2), 0.8)
      const j = this.attrN++
      this.attrX[j] = cx + Math.cos(a) * rx * r
      this.attrY[j] = cy + Math.sin(a) * ry * r * (0.85 + Math.random() * 0.3)
      this.attrAlive[j] = 1
    }
    this.attrLeft += count
  }

  /**
   * Next crown generation: an envelope pitched above the current canopy and
   * offset sideways on alternating generations, so the silhouette keeps
   * opening out instead of growing a single column.
   */
  private reseed(reach: number): void {
    if (this.nNodes < 2) return
    this.generation++
    const g = this.generation
    const spanX = Math.max(this.segLen * 10, this.maxX - this.minX)
    const spanY = Math.max(this.segLen * 10, this.maxY - this.minY)
    const cx = (this.minX + this.maxX) / 2 + Math.sin(g * 2.399) * spanX * 0.3
    const rx = spanX * 0.55 * reach
    const ry = spanY * 0.4 * reach
    const cy = this.minY - ry * 0.3
    const count = Math.round((200 + this.density * 520) * (1 + Math.min(2, g * 0.12)))
    this.seedCrown(cx, cy, rx, ry, count)
    this.stall = 0
  }

  private hashCell(x: number, y: number): number {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    return (((cx * 73856093) ^ (cy * 19349663)) >>> 0) & this.gridMask
  }

  private hashKey(cx: number, cy: number): number {
    return (((cx * 73856093) ^ (cy * 19349663)) >>> 0) & this.gridMask
  }

  private addNode(x: number, y: number, parent: number): number {
    let i: number
    if (this.freeN > 0) {
      // recycle a slot freed by dieback
      i = this.freeList[--this.freeN]
    } else {
      if (this.nNodes >= this.nodeCeiling) return -1
      if (this.nNodes >= this.cap) {
        this.growNodeCapacity()
        if (this.nNodes >= this.cap) return -1
      }
      i = this.nNodes
      this.nNodes++
    }
    this.alive[i] = 1
    this.birth[i] = this.tick
    this.birthT[i] = this.ageSec
    this.liveCount++
    this.nodesX[i] = x
    this.nodesY[i] = y
    this.parent[i] = parent
    this.depth[i] = parent < 0 ? 0 : this.depth[parent] + 1
    if (this.depth[i] > this.maxDepth) this.maxDepth = this.depth[i]
    this.phase[i] = (parent < 0 ? 0 : this.phase[parent]) + 0.35 + Math.random() * 0.4
    this.childCount[i] = 0
    this.radius[i] = 1

    const h = this.hashCell(x, y)
    this.gridNext[i] = this.gridHead[h]
    this.gridHead[h] = i

    if (x < this.minX) this.minX = x
    if (x > this.maxX) this.maxX = x
    if (y < this.minY) this.minY = y
    if (y > this.maxY) this.maxY = y

    // pipe model: every ancestor gains cross-section
    let p = parent
    while (p >= 0) {
      this.childCount[p]++
      p = this.parent[p]
    }
    this.radiusDirty = true
    return i
  }

  /** Freed slots leave stale links in the hash chains, so it is rebuilt whole. */
  private rebuildHash(): void {
    this.hashDirty = false
    this.gridHead.fill(-1)
    for (let i = 0; i < this.nNodes; i++) {
      if (!this.alive[i]) continue
      const h = this.hashCell(this.nodesX[i], this.nodesY[i])
      this.gridNext[i] = this.gridHead[h]
      this.gridHead[h] = i
    }
  }

  /**
   * Shed a tip. Only tips are ever shed, so no node is orphaned. A tip that
   * had grown a leaf drops it — dieback is where most falling leaves come
   * from, not just deep silence.
   */
  private killTip(i: number): void {
    const leafAge = (this.ageSec - this.birthT[i]) / 6
    if (leafAge > 0.5 && this.falling.length < 300 && this.depth[i] > 3) {
      const u = this.leafUnit
      this.falling.push({
        x: this.swayX[i],
        y: this.swayY[i],
        vx: (Math.random() - 0.5) * 18 * u,
        vy: (8 + Math.random() * 16) * u,
        life: 1,
        phase: Math.random() * Math.PI * 2
      })
    }
    this.alive[i] = 0
    this.liveCount--
    this.freeList[this.freeN++] = i
    let p = this.parent[i]
    while (p >= 0) {
      this.childCount[p]--
      p = this.parent[p]
    }
    this.hashDirty = true
    this.radiusDirty = true
  }

  /**
   * Shed roughly `target` of the oldest living tips. The threshold is found by
   * bisection on the birth stamp — a handful of counting passes, no sorting and
   * no allocation, which matters because this runs for as long as the set does.
   */
  private pruneOldestTips(target: number): number {
    if (target < 1) return 0
    let lo = Infinity
    let hi = -Infinity
    let tips = 0
    for (let i = 1; i < this.nNodes; i++) {
      if (!this.alive[i] || this.childCount[i] !== 0) continue
      tips++
      const b = this.birth[i]
      if (b < lo) lo = b
      if (b > hi) hi = b
    }
    if (tips === 0) return 0
    if (target >= tips) target = Math.max(1, tips - 1)

    let a = lo
    let b2 = hi
    let thr = lo
    for (let it = 0; it < 12 && a <= b2; it++) {
      thr = Math.floor((a + b2) / 2)
      let c = 0
      for (let i = 1; i < this.nNodes; i++) {
        if (this.alive[i] && this.childCount[i] === 0 && this.birth[i] <= thr) c++
      }
      if (c < target) a = thr + 1
      else b2 = thr - 1
    }

    let killed = 0
    for (let i = 1; i < this.nNodes && killed < target; i++) {
      if (this.alive[i] && this.childCount[i] === 0 && this.birth[i] <= thr) {
        this.killTip(i)
        killed++
      }
    }
    return killed
  }

  /**
   * Shed up to `target` tips regardless of age, spawning a falling leaf for
   * some of them. Unlike the age-ordered dieback this erodes the whole canopy
   * at once, which is what a tree coming down looks like.
   */
  private shedAnyTips(target: number, h: number, spawnLeaves: boolean): number {
    const u = h / 1080
    let killed = 0
    for (let i = 1; i < this.nNodes && killed < target; i++) {
      if (!this.alive[i] || this.childCount[i] !== 0) continue
      if (spawnLeaves && this.falling.length < 260 && this.depth[i] > 3) {
        this.falling.push({
          x: this.swayX[i],
          y: this.swayY[i],
          vx: (Math.random() - 0.5) * 30 * u,
          vy: (10 + Math.random() * 26) * u,
          life: 1,
          phase: Math.random() * Math.PI * 2
        })
      }
      this.killTip(i)
      killed++
    }
    return killed
  }

  /** Start the fell sequence: leaves let go, then the structure comes apart. */
  fell(): void {
    this.fellT = 0.0001
  }

  get felling(): boolean {
    return this.fellT > 0
  }

  /** True once the tree is gone and the slot should be replanted. */
  get felled(): boolean {
    return this.fellT > 0 && this.liveCount <= 24
  }

  /** Nearest node to (x,y) within `maxD`, via the 3×3 cell neighbourhood. */
  private nearestNode(x: number, y: number, maxD: number): number {
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    let best = -1
    let bestD2 = maxD * maxD
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        for (let i = this.gridHead[this.hashKey(cx + ox, cy + oy)]; i !== -1; i = this.gridNext[i]) {
          const dx = this.nodesX[i] - x
          const dy = this.nodesY[i] - y
          const d2 = dx * dx + dy * dy
          if (d2 < bestD2) {
            bestD2 = d2
            best = i
          }
        }
      }
    }
    return best
  }

  private nearestAttractorDist2(x: number, y: number): number {
    let best = Infinity
    for (let a = 0; a < this.attrN; a++) {
      if (!this.attrAlive[a]) continue
      const dx = this.attrX[a] - x
      const dy = this.attrY[a] - y
      const d2 = dx * dx + dy * dy
      if (d2 < best) best = d2
    }
    return best
  }

  /** One space-colonization iteration. Returns true if anything grew. */
  private grow(diMul: number): boolean {
    const D = this.segLen
    const di = Math.min(this.cellSize, D * (4.5 + diMul * 2.5))
    const dk = D * 1.9
    const n = this.nNodes
    if (n === 0 || this.attrLeft === 0) return false
    if (this.hashDirty) this.rebuildHash()

    // accumulate directions per node from attractors that see it as nearest
    const accX = this.accX
    const accY = this.accY
    const accN = this.accN
    accX.fill(0, 0, n)
    accY.fill(0, 0, n)
    accN.fill(0, 0, n)
    for (let a = 0; a < this.attrN; a++) {
      if (!this.attrAlive[a]) continue
      const best = this.nearestNode(this.attrX[a], this.attrY[a], di)
      if (best < 0) continue
      const dx = this.attrX[a] - this.nodesX[best]
      const dy = this.attrY[a] - this.nodesY[best]
      const inv = 1 / (Math.hypot(dx, dy) || 1)
      accX[best] += dx * inv
      accY[best] += dy * inv
      accN[best]++
    }

    let grew = false
    for (let i = 0; i < n; i++) {
      if (accN[i] === 0 || !this.alive[i]) continue
      // jitter breaks the opposed-attractor deadlock; tropism is the species'
      // habit (pine drives up hard, willow lets its tips fall)
      const J = this.prof.jitter
      let dx = accX[i] + (Math.random() - 0.5) * J
      let dy = accY[i] + (Math.random() - 0.5) * J + this.prof.tropism
      const len = Math.hypot(dx, dy) || 1
      dx /= len
      dy /= len
      if (this.addNode(this.nodesX[i] + dx * D, this.nodesY[i] + dy * D, i) >= 0) grew = true
    }

    // kill reached attractors — hash lookup, not a full node sweep
    if (grew) {
      for (let a = 0; a < this.attrN; a++) {
        if (!this.attrAlive[a]) continue
        if (this.nearestNode(this.attrX[a], this.attrY[a], dk) >= 0) {
          this.attrAlive[a] = 0
          this.attrLeft--
        }
      }
      // spent attractors accumulate across generations forever; compact them
      // out so a long set does not end up sweeping a dead 100k-entry list
      if (this.attrN > 2048 && this.attrLeft * 2 < this.attrN) this.compactAttractors()
    }
    return grew
  }

  private compactAttractors(): void {
    let w = 0
    for (let a = 0; a < this.attrN; a++) {
      if (!this.attrAlive[a]) continue
      this.attrX[w] = this.attrX[a]
      this.attrY[w] = this.attrY[a]
      this.attrAlive[w] = 1
      w++
    }
    this.attrAlive.fill(0, w, this.attrN)
    this.attrN = w
    this.attrLeft = w
  }

  update(dt: number, time: number, w: number, h: number, d: TreeDrive): void {
    const u = h / 1080
    this.ageSec += dt
    this.leafUnit = u
    if (this.nNodes === 0) this.reset(w, h, 0.6, d.horizonY)

    // Felling: for the first second the leaves let go, then the structure
    // itself comes apart from the canopy inward. Nothing grows meanwhile.
    if (this.fellT > 0) {
      this.fellT += dt
      const leafPhase = this.fellT < 1.1
      const rate = leafPhase ? 0.02 : 0.09
      this.shedAnyTips(Math.max(30, Math.round(this.nodeCeiling * rate)), h, true)
    }

    // audio-driven growth: ticks accrue with level & vigor; onsets spurt;
    // silence halts growth entirely (the tree waits with the room)
    if (!this.done && this.fellT === 0) {
      const rate = d.vigor * (0.35 + d.level * 3.2) * (1 - d.silence)
      this.tickBudget += dt * rate * 3.2
      if (d.onset > 0.85 && this.lastOnset <= 0.85) this.tickBudget += 1.5 + d.scatter * 2
      let guard = 6
      while (this.tickBudget >= 1 && guard-- > 0) {
        this.tickBudget -= 1
        this.tick++

        // At the ceiling, shed before growing rather than stopping. The tree
        // stays the same size in memory and stroke cost while the *material*
        // keeps turning over — new tips at the frontier, old ones dying back.
        if (this.liveCount >= this.nodeCeiling - 4) {
          if (d.endless) {
            const shed = this.pruneOldestTips(Math.max(24, Math.round(this.nodeCeiling * 0.02)))
            if (shed === 0) {
              this.done = true
              break
            }
          } else {
            this.done = true
            break
          }
        }

        const grew = this.grow(d.scatter)
        this.stall = grew ? 0 : this.stall + 1
        // a spent crown is not the end of the tree — put out the next one
        if (this.stall > 5 || this.attrLeft === 0) {
          if (d.endless) this.reseed(d.reach)
          else {
            this.done = true
            break
          }
        }
      }
    }

    // Background dieback, independent of the ceiling: the tree is always
    // losing a little of its oldest growth. Silence accelerates it — the same
    // gesture as the falling leaves, one level deeper into the structure.
    if (d.decay > 0.001 && this.liveCount > 200 && this.fellT === 0) {
      this.decayCarry += dt * d.decay * 40 * (1 + d.silence * 2.5)
      if (this.decayCarry >= 1) {
        const n = Math.floor(this.decayCarry)
        this.decayCarry -= n
        this.pruneOldestTips(Math.min(n, 400))
      }
    }
    this.lastOnset = d.onset

    // radii from pipe model + the stroke-width ordering — only after growth,
    // not every frame
    if (this.radiusDirty) {
      this.radiusDirty = false
      const tipR = 1.1 * u
      const trunkCap = h / 42
      const t0 = 6 * u
      const t1 = 3 * u
      const t2 = 1.6 * u
      const st = this.bucketStart
      st.fill(0)
      let tips = 0
      // bounds are recomputed here rather than accumulated in addNode: with
      // dieback the silhouette shrinks as well as grows, and an ever-expanding
      // bounding box would leave the auto-frame zoomed out around dead air
      let bx0 = Infinity
      let bx1 = -Infinity
      let by0 = Infinity
      let by1 = -Infinity
      for (let i = 0; i < this.nNodes; i++) {
        if (!this.alive[i]) continue
        const r = Math.min(trunkCap, tipR * Math.sqrt(this.childCount[i] + 1))
        this.radius[i] = r
        const x = this.nodesX[i]
        const y = this.nodesY[i]
        if (x < bx0) bx0 = x
        if (x > bx1) bx1 = x
        if (y < by0) by0 = y
        if (y > by1) by1 = y
        if (i === 0) continue
        st[(r > t0 ? 0 : r > t1 ? 1 : r > t2 ? 2 : 3) + 1]++
        if (this.childCount[i] === 0 && this.depth[i] >= 4) tips++
      }
      if (bx0 <= bx1) {
        this.minX = bx0
        this.maxX = bx1
        this.minY = by0
        this.maxY = by1
      }
      this.tipCount = tips
      for (let b = 0; b < 4; b++) st[b + 1] += st[b]
      for (let b = 0; b < 4; b++) this.cursor[b] = st[b]
      for (let i = 1; i < this.nNodes; i++) {
        if (!this.alive[i]) continue
        const r = this.radius[i]
        const b = r > t0 ? 0 : r > t1 ? 1 : r > t2 ? 2 : 3
        this.order[this.cursor[b]++] = i
      }
    }

    // sway: accumulate rotations down the parent chain. The rigid lower trunk
    // skips the trig entirely — that is most of the nodes on a mature tree.
    //
    // Index order is topological only until slot recycling starts, after which
    // a regrown node can sit at a lower index than its parent and read the
    // parent's transform from the previous frame. Deliberate: sway is a smooth
    // ~0.03 rad oscillation, so one frame of lag on a twig is far below a
    // pixel, and the alternative is a topological sort every growth tick.
    const gust = 0.5 + 0.5 * Math.sin(time * 0.31 + Math.sin(time * 0.13) * 2)
    const amp = d.wind * (0.028 + d.bass * 0.02) * gust
    const md = Math.max(1, this.maxDepth)
    for (let i = 0; i < this.nNodes; i++) {
      if (!this.alive[i]) continue
      const p = this.parent[i]
      if (p < 0) {
        this.swayX[i] = this.nodesX[i]
        this.swayY[i] = this.nodesY[i]
        this.swayA[i] = 0
        continue
      }
      const ox = this.nodesX[i] - this.nodesX[p]
      const oy = this.nodesY[i] - this.nodesY[p]
      const dfrac = this.depth[i] / md
      const stiff = amp * Math.pow(dfrac, 1.7)
      if (stiff < 1e-4 && this.swayA[p] === 0) {
        this.swayX[i] = this.swayX[p] + ox
        this.swayY[i] = this.swayY[p] + oy
        this.swayA[i] = 0
        continue
      }
      const theta =
        stiff * Math.sin(time * 1.9 + this.phase[i]) +
        amp * 0.3 * (dfrac > 0.6 ? Math.sin(time * 7.1 + this.phase[i] * 2.3) * d.treble : 0)
      const a = this.swayA[p] + theta
      const c = Math.cos(a)
      const s = Math.sin(a)
      this.swayX[i] = this.swayX[p] + ox * c - oy * s
      this.swayY[i] = this.swayY[p] + ox * s + oy * c
      this.swayA[i] = a
    }

    // the season's own leaf-fall: autumn rains, winter finishes emptying the
    // tree, spring and summer barely let go at all
    const season = seasonLeaf(d.season)
    this.seasonFall = season.fall

    // ambient release: a canopy in leaf is never entirely still — a slow
    // steady drift of leaves lets go, more in wind, far more in autumn.
    // Onsets shake a small burst loose. (Tips are not killed; the tree only
    // loses the leaf, dieback is what takes the wood.)
    if (d.leaves > 0.05 && this.liveCount > 120 && this.fellT === 0 && season.size > 0.05) {
      this.ambientCarry +=
        dt * d.leaves * (0.5 + d.wind * 1.2) * (0.35 + season.fall) * 2.1
      if (d.onset > 0.85 && this.lastOnset <= 0.85) this.ambientCarry += 2 + d.scatter * 4
      while (this.ambientCarry >= 1 && this.falling.length < 300) {
        this.ambientCarry -= 1
        const tip = this.pickTip()
        if (tip < 0) break
        this.falling.push({
          x: this.swayX[tip],
          y: this.swayY[tip],
          vx: (Math.random() - 0.5) * 20 * u,
          vy: (6 + Math.random() * 12) * u,
          life: 1,
          phase: Math.random() * Math.PI * 2
        })
      }
      if (this.ambientCarry > 8) this.ambientCarry = 0
    }
    if (season.fall > 0.6 && this.liveCount > 60) {
      this.leafFallCarry += dt * (season.fall - 0.6) * 9 * d.leaves
      while (this.leafFallCarry >= 1 && this.falling.length < 300) {
        this.leafFallCarry -= 1
        const tip = this.pickTip()
        if (tip < 0) break
        this.falling.push({
          x: this.swayX[tip],
          y: this.swayY[tip],
          vx: (Math.random() - 0.5) * 22 * u,
          vy: (7 + Math.random() * 16) * u,
          life: 1,
          phase: Math.random() * Math.PI * 2
        })
      }
      if (this.leafFallCarry > 4) this.leafFallCarry = 0
    }

    // deep silence sheds leaves
    if (d.silence > 0.5) {
      this.leafShed += dt * d.silence * 2.2
      while (this.leafShed >= 1 && this.falling.length < 90) {
        this.leafShed -= 1
        const tip = this.pickTip()
        if (tip >= 0) {
          this.falling.push({
            x: this.swayX[tip],
            y: this.swayY[tip],
            vx: (Math.random() - 0.5) * 14 * u,
            vy: (8 + Math.random() * 14) * u,
            life: 1,
            phase: Math.random() * Math.PI * 2
          })
        }
      }
    }
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const L = this.falling[i]
      L.phase += dt * 2.2
      if (L.y >= d.horizonY) {
        // came to rest: lie on the ground line and fade out slowly, sliding a
        // little when the wind gusts
        L.y = d.horizonY
        L.x += L.vx * dt * 0.3 + Math.sin(L.phase * 0.5) * 4 * u * d.wind * dt
        L.vx *= 1 - Math.min(1, dt * 3)
        L.life -= dt * 0.5
      } else {
        L.x += (L.vx + Math.sin(L.phase) * 26 * u * (0.4 + d.wind)) * dt
        L.y += L.vy * dt
      }
      if (L.life <= 0) this.falling.splice(i, 1)
    }
  }

  /** Swayed silhouette in canvas px — FloraSystem unions these to auto-frame. */
  bounds(): TreeBounds {
    return { minX: this.minX, maxX: this.maxX, minY: this.minY, maxY: this.maxY }
  }

  get nodeCount(): number {
    return this.liveCount
  }

  /** Trunk foot, world coordinates — the camera's 'seed' focus. */
  get origin(): { x: number; y: number } {
    return { x: this.originX, y: this.rootY }
  }

  /** A falling leaf to follow, or null — the camera's 'leaf' focus. */
  trackFalling(): { x: number; y: number } | null {
    const L = this.falling[0]
    return L ? { x: L.x, y: L.y } : null
  }

  /**
   * Up to n living tip positions (swayed, world space) for birds to roost on.
   * Sampled with a stride so the anchors spread across the whole canopy.
   */
  perchTips(out: { x: number; y: number }[], n: number): void {
    if (this.nNodes < 40) return
    const step = Math.max(1, Math.ceil(this.tipCount / Math.max(1, n)))
    let seen = 0
    for (let i = 1; i < this.nNodes && out.length < n; i++) {
      if (!this.alive[i] || this.childCount[i] !== 0 || this.depth[i] < 5) continue
      if (seen++ % step !== 0) continue
      out.push({ x: this.swayX[i], y: this.swayY[i] })
    }
  }

  private pickTip(): number {
    if (this.nNodes < 10) return -1
    for (let t = 0; t < 12; t++) {
      const i = 1 + Math.floor(Math.random() * (this.nNodes - 1))
      if (this.alive[i] && this.childCount[i] === 0 && this.depth[i] > 3) return i
    }
    return -1
  }

  /**
   * Branches + leaves. The caller owns the ground line and the fit transform,
   * and passes the fit scale in so sub-pixel twigs can be skipped: as the
   * canopy outgrows the frame the auto-frame shrinks it, and the finest tier
   * stops being visible long before it stops being expensive. That cull is
   * what keeps endless growth from turning into an ever-slower frame.
   */
  draw(
    g: CanvasRenderingContext2D,
    _w: number,
    h: number,
    stops: string[],
    d: TreeDrive,
    fitScale = 1,
    alpha = 1
  ): void {
    if (alpha <= 0.002) return
    const u = h / 1080
    const onScreenSeg = this.segLen * fitScale

    const K = this.prof
    if (K.pot) this.drawPot(g, h, stops, alpha)

    g.lineCap = 'round'
    g.lineJoin = 'round'
    const widths = [11 * u, 5.2 * u, 2.6 * u, 1.2 * u]
    // structural branches are always drawn whole; the twig tiers get a segment
    // budget so a canopy that has been growing for an hour costs the same to
    // stroke as one that started ten minutes ago
    const budget = [Infinity, Infinity, 9000, 12000]
    const st = this.bucketStart

    // 1) halo: a wide, dim under-glow beneath the structural wood. This is
    // what makes the trunk read as light rather than a line (fx.bloom then
    // lifts it further on dark palettes). The alpha adapts to how much
    // structural wood there is — a sapling gets a full halo, a banyan whose
    // whole dome is thick limbs would otherwise wash out into glare.
    const structN = Math.max(1, st[2] - st[0])
    g.strokeStyle = stops[2]
    g.globalAlpha = 0.16 * alpha * Math.min(1, 340 / structN)
    for (let b = 0; b < 2; b++) {
      const from = st[b]
      const to = st[b + 1]
      if (to <= from) continue
      g.lineWidth = widths[b] * 2.8
      g.beginPath()
      for (let k = from; k < to; k++) {
        const i = this.order[k]
        const p = this.parent[i]
        g.moveTo(this.swayX[p], this.swayY[p])
        g.lineTo(this.swayX[i], this.swayY[i])
      }
      g.stroke()
    }

    // 2) cores: brightness tapers from white-hot trunk to grey twig, and limbs
    // curve through segment midpoints (control point = the shared node), so
    // chains read as drawn strokes instead of jointed segments.
    const coreCols = [stops[4], stops[4], stops[3], stops[3]]
    const coreAlpha = [0.98, 0.9, 0.72, 0.5]
    for (let b = 0; b < 4; b++) {
      if (b === 3 && onScreenSeg <= 0.9) continue // finest tier is sub-pixel
      const from = st[b]
      const to = st[b + 1]
      if (to <= from) continue
      const stride = Math.max(1, Math.ceil((to - from) / budget[b]))
      const curved = stride === 1 && b < 3
      g.globalAlpha = coreAlpha[b] * alpha
      g.strokeStyle = coreCols[b]

      if (b === 0 && K.fiber) {
        // fiber bundle: three offset strands instead of one heavy line — the
        // twisted-trunk look of the bonsai / banyan references
        for (const off of [-0.34, 0, 0.34]) {
          const o = widths[0] * off
          g.lineWidth = widths[0] * (off === 0 ? 0.5 : 0.4)
          g.globalAlpha = (off === 0 ? 0.98 : 0.8) * alpha
          g.beginPath()
          for (let k = from; k < to; k++) {
            const i = this.order[k]
            const p = this.parent[i]
            const dx = this.swayX[i] - this.swayX[p]
            const dy = this.swayY[i] - this.swayY[p]
            const inv = 1 / (Math.hypot(dx, dy) || 1)
            const nx = -dy * inv * o
            const ny = dx * inv * o
            g.moveTo(this.swayX[p] + nx, this.swayY[p] + ny)
            g.lineTo(this.swayX[i] + nx, this.swayY[i] + ny)
          }
          g.stroke()
        }
        continue
      }

      // the caller's fit transform already scales stroke width — don't re-apply
      g.lineWidth = widths[b]
      g.beginPath()
      for (let k = from; k < to; k += stride) {
        const i = this.order[k]
        const p = this.parent[i]
        const gp = p >= 0 ? this.parent[p] : -1
        if (!curved || gp < 0) {
          g.moveTo(this.swayX[p], this.swayY[p])
          g.lineTo(this.swayX[i], this.swayY[i])
        } else {
          g.moveTo((this.swayX[gp] + this.swayX[p]) / 2, (this.swayY[gp] + this.swayY[p]) / 2)
          g.quadraticCurveTo(
            this.swayX[p],
            this.swayY[p],
            (this.swayX[p] + this.swayX[i]) / 2,
            (this.swayY[p] + this.swayY[i]) / 2
          )
          if (this.childCount[i] === 0) g.lineTo(this.swayX[i], this.swayY[i])
        }
      }
      g.stroke()
    }

    if (K.roots) this.drawAerialRoots(g, h, stops, alpha)
    if (K.strands) this.drawStrands(g, h, stops, d, alpha, onScreenSeg)

    // leaves: stroked outline sprites at the tips, oriented off the twig they
    // grow from, fluttering with treble. Capped by a stride so a huge canopy
    // does not spend the frame on foliage.
    const season = seasonLeaf(d.season)
    if (this.nNodes > 40 && onScreenSeg > 1.4 && d.leaves > 0.01 && season.size > 0.01) {
      // A leaf swells with the age of the tip carrying it, so foliage fills in
      // behind the growing frontier instead of the canopy appearing whole —
      // and a freshly regrown tree is visibly bare for a while.
      const spr = getLeafSprites(stops[season.stop])
      const base = 5.4 * u * this.prof.leaf * (0.4 + d.leaves * 1.3) * season.size
      const mature = 6 // SECONDS for a leaf to reach full size
      const budget = 4000
      const step = Math.max(1, Math.ceil(this.tipCount / budget))
      const TWO_PI = Math.PI * 2
      let seen = 0
      for (let i = 1; i < this.nNodes; i++) {
        if (!this.alive[i] || this.childCount[i] !== 0 || this.depth[i] < 4) continue
        if (seen++ % step !== 0) continue
        const age = Math.min(1, (this.ageSec - this.birthT[i]) / mature)
        if (age <= 0.02) continue
        const p = this.parent[i]
        const px = this.swayX[i]
        const py = this.swayY[i]
        const h1 = Math.sin(i * 12.9898) * 43758.5453
        const hash = h1 - Math.floor(h1)
        const twigAng = Math.atan2(py - this.swayY[p], px - this.swayX[p])
        const rot =
          twigAng +
          (hash - 0.5) * 1.2 +
          Math.sin(this.ageSec * 2.6 + i * 0.7) * 0.2 * (0.3 + d.treble)
        const idx = (((Math.round((rot / TWO_PI) * spr.count) % spr.count) + spr.count) % spr.count)
        const D = base * age * (1.6 + hash * 1.3)
        const tw = 0.45 + 0.55 * Math.abs(Math.sin(i * 1.93 + d.treble * 9))
        g.globalAlpha = (0.32 + 0.5 * tw) * (1 - d.silence * 0.45) * age * alpha
        g.drawImage(spr.canvas, idx * spr.cell, 0, spr.cell, spr.cell, px - D / 2, py - D, D, D)
      }
    }

    // falling leaves — outline sprites tumbling, keeping the season's colour
    {
      const spr = getLeafSprites(stops[season.stop])
      const D = 6.5 * u
      for (const L of this.falling) {
        const idx = ((Math.floor(L.phase * 2.5) % spr.count) + spr.count) % spr.count
        g.globalAlpha = 0.7 * Math.min(1, L.life) * alpha
        g.drawImage(spr.canvas, idx * spr.cell, 0, spr.cell, spr.cell, L.x - D / 2, L.y - D / 2, D, D)
      }
    }
    g.globalAlpha = 1
  }

  /** Bonsai vessel: an outlined trapezoid pot with rim and feet, drawn behind the trunk. */
  private drawPot(g: CanvasRenderingContext2D, h: number, stops: string[], alpha: number): void {
    const u = h / 1080
    const s = this.treeScale
    const ox = this.originX
    const ry = this.rootY
    const W = h * 0.13 * s
    const H = h * 0.05 * s
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.strokeStyle = stops[4]
    g.lineWidth = 2.2 * u
    g.globalAlpha = 0.9 * alpha
    g.beginPath()
    g.moveTo(ox - W, ry + 2 * u)
    g.lineTo(ox + W, ry + 2 * u)
    g.lineTo(ox + W * 0.98, ry + H * 0.34)
    g.lineTo(ox + W * 0.78, ry + H)
    g.lineTo(ox - W * 0.78, ry + H)
    g.lineTo(ox - W * 0.98, ry + H * 0.34)
    g.closePath()
    g.stroke()
    // rim shadow line + feet
    g.globalAlpha = 0.5 * alpha
    g.lineWidth = 1.4 * u
    g.beginPath()
    g.moveTo(ox - W * 0.94, ry + H * 0.3)
    g.lineTo(ox + W * 0.94, ry + H * 0.3)
    g.stroke()
    g.globalAlpha = 0.9 * alpha
    g.lineWidth = 2 * u
    for (const fx of [-0.55, 0.55]) {
      g.beginPath()
      g.moveTo(ox + W * fx - W * 0.08, ry + H)
      g.lineTo(ox + W * fx - W * 0.06, ry + H * 1.22)
      g.lineTo(ox + W * fx + W * 0.06, ry + H * 1.22)
      g.lineTo(ox + W * fx + W * 0.08, ry + H)
      g.stroke()
    }
  }

  /** Banyan: thin wavering roots dropped from the major limbs to the ground. */
  private drawAerialRoots(
    g: CanvasRenderingContext2D,
    h: number,
    stops: string[],
    alpha: number
  ): void {
    const u = h / 1080
    const st = this.bucketStart
    const from = st[0]
    const to = st[2] // structural buckets only
    if (to <= from) return
    g.strokeStyle = stops[3]
    g.lineWidth = 1.2 * u
    let drawn = 0
    for (let k = from; k < to && drawn < 14; k++) {
      const i = this.order[k]
      // deterministic pick: the same limbs drip every night
      if ((((i * 2654435761) >>> 0) & 7) !== 3) continue
      const y0 = this.swayY[i]
      if (this.rootY - y0 < h * 0.12 * this.treeScale) continue
      drawn++
      const x0 = this.swayX[i]
      const segs = Math.max(4, Math.ceil((this.rootY - y0) / (16 * u)))
      const grown = Math.min(1, (this.ageSec - this.birthT[i]) / 30) // roots reach slowly
      if (grown <= 0.05) continue
      g.globalAlpha = 0.34 * alpha
      g.beginPath()
      g.moveTo(x0, y0)
      let x = x0
      for (let s = 1; s <= Math.ceil(segs * grown); s++) {
        x += Math.sin(s * 0.9 + i * 1.7 + this.ageSec * 0.4) * 1.7 * u
        g.lineTo(x, y0 + ((this.rootY - y0) / segs) * s)
      }
      g.stroke()
    }
    g.globalAlpha = 1
  }

  /** Willow: pendulous strand curtains falling from the outer canopy. */
  private drawStrands(
    g: CanvasRenderingContext2D,
    h: number,
    stops: string[],
    d: TreeDrive,
    alpha: number,
    onScreenSeg: number
  ): void {
    if (onScreenSeg <= 1.1) return // sub-pixel strands are pure cost
    const u = h / 1080
    const t = this.ageSec
    const lean = d.wind * 1.4 * u
    const spr = getLeafSprites(stops[3])
    const budget = 420
    const step = Math.max(1, Math.ceil(this.tipCount / budget))
    const minDepth = this.maxDepth * 0.45
    g.strokeStyle = stops[3]
    g.lineWidth = 1 * u
    let seen = 0
    for (let i = 1; i < this.nNodes; i++) {
      if (!this.alive[i] || this.childCount[i] !== 0 || this.depth[i] < minDepth) continue
      if (seen++ % step !== 0) continue
      const h1 = Math.sin(i * 78.233) * 43758.5453
      const hash = h1 - Math.floor(h1)
      const segLen = (9 + hash * 4) * u
      // strands fall a good part of the way to the ground, like the reference
      const targetLen = (this.rootY - this.swayY[i]) * (0.3 + hash * 0.4)
      const segs = Math.max(4, Math.min(22, Math.round(targetLen / segLen)))
      const phase = this.phase[i] * 3.1
      let x = this.swayX[i]
      let y = this.swayY[i]
      g.globalAlpha = (0.28 + 0.3 * hash) * (1 - d.silence * 0.35) * alpha
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 1; k <= segs; k++) {
        const free = k / segs
        x += Math.sin(t * 1.4 + phase + k * 0.55) * 2.1 * u * free * (0.5 + d.wind) + lean * free
        y += segLen
        g.lineTo(x, y)
      }
      g.stroke()
      // a small leaf at the strand's free end
      const D = 4.6 * u * (0.7 + hash)
      const idx = (i + Math.floor(t * 1.5)) % spr.count
      g.drawImage(spr.canvas, idx * spr.cell, 0, spr.cell, spr.cell, x - D / 2, y - D / 2, D, D)
    }
    g.globalAlpha = 1
  }
}
