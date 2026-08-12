// Final grade pass: brightness/blackout, pixelate, vignette, grain — one
// shader so the iGPU pays for one fullscreen pass, not four.

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uBrightness: { value: 1.0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.15 },
    uPixelate: { value: 0.0 },
    uSharpen: { value: 0.0 },
    uFlash: { value: 0.0 },
    uInvert: { value: 0.0 },
    uHue: { value: 0.0 },
    uSat: { value: 1.0 },
    uContrast: { value: 1.0 },
    uTime: { value: 0.0 },
    uRes: { value: [1920, 1080] }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uBrightness;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uPixelate;
    uniform float uSharpen;
    uniform float uFlash;
    uniform float uInvert;
    uniform float uHue;
    uniform float uSat;
    uniform float uContrast;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      if (uPixelate > 0.002) {
        float block = 1.0 + uPixelate * uPixelate * 60.0;
        vec2 g = uRes / block;
        uv = (floor(uv * g) + 0.5) / g;
      }
      vec3 c = texture2D(tDiffuse, uv).rgb;

      // unsharp mask: bloom and the canvas upscale both soften the frame, and
      // on a 7" panel a little edge recovery is the difference between glyphs
      // you can read and a glow. Four taps — one pass, no extra target.
      if (uSharpen > 0.002) {
        vec2 px = 1.0 / uRes;
        vec3 blur = texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb
                  + texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb
                  + texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb
                  + texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb;
        c = clamp(c + (c - blur * 0.25) * uSharpen * 1.6, 0.0, 1.0);
      }

      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * 1.15 * smoothstep(0.28, 0.72, d);

      float n = hash(vUv * uRes + mod(uTime * 60.0, 1024.0));
      c += (n - 0.5) * uGrain * 0.22 * (0.35 + 0.65 * clamp(c.g + c.r, 0.0, 1.0));

      // color grade: saturation, hue rotation (about the grey axis), contrast
      c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSat);
      if (abs(uHue) > 0.001) {
        float ca = cos(uHue);
        float sa = sin(uHue);
        vec3 k = vec3(0.57735);
        c = c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
      }
      c = (c - 0.5) * uContrast + 0.5;

      // full-frame impulse (route onset here for raster-noton punctuation)
      c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
      c = mix(c, vec3(1.0) - c, uInvert);

      gl_FragColor = vec4(c * uBrightness, 1.0);
    }
  `
}
