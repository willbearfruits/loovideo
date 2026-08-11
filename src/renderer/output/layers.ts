// Composite pass: draws every enabled system into one frame before the FX
// chain sees it. The base system paints the ground (opaque, and its palette
// stop 0 is the clear colour); the others come in over the top as blended
// layers at their own opacity — which is how three systems end up happening
// at once instead of one at a time.
//
// Replaces RenderPass. Same contract: writes into readBuffer, needsSwap false.

import * as THREE from 'three'
import { Pass } from 'three/addons/postprocessing/Pass.js'
import type { VisualSystem } from './systems/types'

export class LayersPass extends Pass {
  /** Draw order, base first. Mutated by the engine every frame. */
  layers: VisualSystem[] = []
  readonly clearColor = new THREE.Color(0x000000)

  private prevClear = new THREE.Color()

  constructor() {
    super()
    this.needsSwap = false
  }

  render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    const autoClear = renderer.autoClear
    renderer.getClearColor(this.prevClear)
    const prevAlpha = renderer.getClearAlpha()

    renderer.autoClear = false
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer)
    renderer.setClearColor(this.clearColor, 1)
    renderer.clear(true, true, false)

    for (const s of this.layers) {
      renderer.render(s.scene, s.camera)
      // each layer gets a fresh depth range; they are 2D stacks, not a scene
      renderer.clearDepth()
    }

    renderer.setClearColor(this.prevClear, prevAlpha)
    renderer.autoClear = autoClear
  }
}
