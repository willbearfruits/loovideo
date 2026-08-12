// GlitchPass: three corruptions in one fullscreen pass, all modulatable —
//   mosh    · macroblocks stop updating and drag stale frames (P-frame loss)
//   sort    · bright pixels smear into sorted-looking streaks along scanlines
//   corrupt · wrong-stride row shifts, block posterize, split chroma
// A history render target holds the previous frame's input for the mosh.

import * as THREE from 'three'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tHistory;
uniform float uMosh;
uniform float uSort;
uniform float uCorrupt;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  float tQ = floor(uTime * 8.0);

  // corrupt: whole rows land at the wrong stride
  if (uCorrupt > 0.002) {
    float ry = floor(vUv.y * 48.0);
    float hr = hash(vec2(ry, tQ));
    if (hr < uCorrupt * 0.35) {
      uv.x = fract(uv.x + (hash(vec2(ry, tQ + 7.0)) - 0.5) * 0.3);
    }
  }

  // mosh: some macroblocks sample the PREVIOUS frame, displaced
  vec2 bl = floor(uv * vec2(28.0, 16.0));
  float hb = hash(bl + floor(uTime * 2.7));
  vec3 c;
  if (hb < uMosh * 0.6) {
    vec2 mv = (vec2(hash(bl + 3.1), hash(bl + 9.7)) - 0.5) * 0.09 * uMosh;
    c = texture2D(tHistory, uv + mv).rgb;
  } else {
    c = texture2D(tDiffuse, uv).rgb;
  }

  // sort: streaks — carry the brightest of a run of taps along the row
  if (uSort > 0.002) {
    float rowGate = step(hash(vec2(floor(vUv.y * 90.0), floor(uTime * 4.0))), uSort * 0.8);
    if (rowGate > 0.5) {
      float px = uSort * 0.11;
      vec3 mx = c;
      for (int i = 1; i <= 7; i++) {
        vec3 s = texture2D(tDiffuse, uv - vec2(px * float(i) / 7.0, 0.0)).rgb;
        mx = max(mx, s * (1.0 - float(i) * 0.055));
      }
      c = mx;
    }
  }

  // corrupt: block posterize + split chroma
  if (uCorrupt > 0.002) {
    float hb2 = hash(bl + tQ);
    if (hb2 < uCorrupt * 0.4) {
      c = floor(c * 6.0 + hb2) / 6.0;
      c.r = texture2D(tDiffuse, uv + vec2(0.004, 0.0)).r;
    }
  }

  gl_FragColor = vec4(c, 1.0);
}
`

export class GlitchPass extends Pass {
  uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tHistory: { value: null as THREE.Texture | null },
    uMosh: { value: 0 },
    uSort: { value: 0 },
    uCorrupt: { value: 0 },
    uTime: { value: 0 }
  }
  private material: THREE.ShaderMaterial
  private fsQuad: FullScreenQuad
  private copyQuad: FullScreenQuad
  private copyUniforms: Record<string, THREE.IUniform>
  private history: THREE.WebGLRenderTarget | null = null

  constructor() {
    super()
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader:
        'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FRAG
    })
    this.fsQuad = new FullScreenQuad(this.material)
    this.copyUniforms = THREE.UniformsUtils.clone(CopyShader.uniforms)
    this.copyQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.copyUniforms,
        vertexShader: CopyShader.vertexShader,
        fragmentShader: CopyShader.fragmentShader
      })
    )
  }

  setSize(w: number, h: number): void {
    this.history?.dispose()
    this.history = new THREE.WebGLRenderTarget(w, h)
  }

  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget
  ): void {
    if (!this.history) this.setSize(readBuffer.width, readBuffer.height)
    this.uniforms.tDiffuse.value = readBuffer.texture
    this.uniforms.tHistory.value = this.history!.texture

    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.fsQuad.render(renderer)

    // stash this frame's clean input: the mosh drags real previous frames
    this.copyUniforms['tDiffuse'].value = readBuffer.texture
    renderer.setRenderTarget(this.history)
    this.copyQuad.render(renderer)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.material.dispose()
    this.fsQuad.dispose()
    this.copyQuad.dispose()
    this.history?.dispose()
  }
}
