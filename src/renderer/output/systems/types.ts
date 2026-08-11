import * as THREE from 'three'
import type { ParamValue, QualityState, QualityTier, SystemId } from '../../../shared/params'
import type { AudioFrame } from '../audio'
import type { Webcam } from '../webcam'

export type LayerBlend = 'add' | 'screen' | 'normal'

/**
 * Apply a layer blend to a material. `add` piles light up (and clips on a busy
 * frame); `screen` is the same gesture with a ceiling — src + dst·(1−src) — so
 * three stacked systems stay readable; `normal` is a straight overlay.
 */
export function applyBlend(mat: THREE.Material, b: LayerBlend): void {
  const before = mat.blending
  switch (b) {
    case 'add':
      mat.blending = THREE.AdditiveBlending
      break
    case 'screen':
      mat.blending = THREE.CustomBlending
      mat.blendEquation = THREE.AddEquation
      mat.blendSrc = THREE.OneFactor
      mat.blendDst = THREE.OneMinusSrcColorFactor
      break
    default:
      mat.blending = THREE.NormalBlending
  }
  if (mat.blending !== before) mat.needsUpdate = true
}

/** Effective (post-modulation) parameter access for systems. */
export class Params {
  eff: Record<string, ParamValue> = {}
  num(id: string): number {
    const v = this.eff[id]
    return typeof v === 'number' ? v : 0
  }
  bool(id: string): boolean {
    return this.eff[id] === true
  }
  str(id: string): string {
    const v = this.eff[id]
    return typeof v === 'string' ? v : ''
  }
}

export interface SystemCtx {
  renderer: THREE.WebGLRenderer
  webcam: Webcam
  quality: () => QualityState & QualityTier
  /**
   * Push a parameter change back to the hub. For momentary controls: the UI
   * sets a flag, the system acts on the rising edge and clears it here, so the
   * button springs back instead of latching.
   */
  setParam: (id: string, value: ParamValue) => void
}

export interface VisualSystem {
  readonly id: SystemId
  readonly scene: THREE.Scene
  readonly camera: THREE.Camera
  /** Palette ground colour (linear). The base layer's is the frame's clear. */
  readonly bg: THREE.Color
  init(ctx: SystemCtx): void
  /** dt/time are speed-scaled seconds. */
  update(dt: number, time: number, p: Params, audio: AudioFrame): void
  resize(width: number, height: number): void
  setActive(on: boolean): void
  /**
   * Render above the base layer: transparent ground, blended, at `opacity`.
   * Called every frame — opacity is modulatable.
   */
  setOverlay(on: boolean, opacity: number, blend: LayerBlend): void
  dispose(): void
}
