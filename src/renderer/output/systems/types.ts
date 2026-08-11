import type * as THREE from 'three'
import type { ParamValue, QualityState, QualityTier, SystemId } from '../../../shared/params'
import type { AudioFrame } from '../audio'
import type { Webcam } from '../webcam'

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
}

export interface VisualSystem {
  readonly id: SystemId
  readonly scene: THREE.Scene
  readonly camera: THREE.Camera
  init(ctx: SystemCtx): void
  /** dt/time are speed-scaled seconds. */
  update(dt: number, time: number, p: Params, audio: AudioFrame): void
  resize(width: number, height: number): void
  setActive(on: boolean): void
  dispose(): void
}
