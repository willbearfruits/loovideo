// GPU particle shaders: positions are derived every frame from seeds + curl noise
// (stateless — no compute/GPGPU needed, runs identically on any WebGL2 GPU).

// Ashima / Ian McEwan 3D simplex noise (public domain, webgl-noise)
const SNOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// curl of a 3-component noise potential field
vec3 curlNoise(vec3 p) {
  const float e = 0.12;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  const vec3 oB = vec3(31.4, 47.2, 12.9);
  const vec3 oC = vec3(-17.3, 88.1, 54.7);
  float dcdy = snoise(p + dy + oC) - snoise(p - dy + oC);
  float dbdz = snoise(p + dz + oB) - snoise(p - dz + oB);
  float dadz = snoise(p + dz) - snoise(p - dz);
  float dcdx = snoise(p + dx + oC) - snoise(p - dx + oC);
  float dbdx = snoise(p + dx + oB) - snoise(p - dx + oB);
  float dady = snoise(p + dy) - snoise(p - dy);
  return normalize(vec3(dcdy - dbdz, dadz - dcdx, dbdx - dady) + 1e-6);
}
`

export const particleVertex = /* glsl */ `
attribute float aRand;
uniform float uTime;
uniform float uMode;        // 0 nebula · 1 shell
uniform float uTurb;
uniform float uScale;
uniform float uDrift;
uniform float uSpread;
uniform float uSize;
uniform float uHue;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uPxScale;
varying float vT;
varying float vSpark;

${SNOISE}

void main() {
  vec3 seed = position;
  float t = uTime;

  vec3 p;
  if (uMode < 0.5) {
    // nebula: seeds advected through an evolving curl field
    vec3 base = seed * (1.1 * uSpread);
    vec3 flowP = base * (0.85 * uScale) + vec3(0.0, t * 0.12 * uDrift, t * 0.07 * uDrift);
    vec3 flow = curlNoise(flowP);
    p = base + flow * (uTurb * (0.55 + uBass * 0.9));
    p *= 1.0 + uMid * 0.18;
  } else {
    // shell: breathing sphere, surface rippled by noise + bass
    vec3 dir = normalize(seed + vec3(1e-4));
    float ripple = snoise(dir * (2.2 * uScale) + vec3(t * 0.35 * (0.2 + uDrift))) * 0.32 * uTurb;
    float r = uSpread * (1.15 + uBass * 0.5) + ripple;
    p = dir * r;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float sparkGate = step(0.995 - uTreble * 0.03, fract(aRand * 7.31));
  vSpark = sparkGate * uTreble;
  vT = fract(aRand * 0.618 + uHue + snoise(seed * 0.6) * 0.15);

  float sz = uSize * mix(0.7, 2.2, fract(aRand * 3.7)) * (1.0 + sparkGate * uTreble * 2.0);
  gl_PointSize = clamp(sz * uPxScale / max(0.4, -mv.z), 1.0, 42.0);
}
`

export const particleFragment = /* glsl */ `
precision highp float;
uniform vec3 uPal0;
uniform vec3 uPal1;
uniform vec3 uPal2;
uniform vec3 uPal3;
uniform vec3 uPal4;
uniform float uLevel;
varying float vT;
varying float vSpark;

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  vec3 c = mix(uPal0, uPal1, clamp(t, 0.0, 1.0));
  c = mix(c, uPal2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, uPal3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, uPal4, clamp(t - 3.0, 0.0, 1.0));
  return c;
}

void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.06, d);
  vec3 c = palette(vT) * (0.55 + uLevel * 0.75);
  c += vSpark * vec3(0.9);
  gl_FragColor = vec4(c * a, a * 0.85);
}
`
