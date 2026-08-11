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
attribute vec3 aLat;        // lattice coordinate, -1..1 per axis
attribute vec2 aStr;        // x = strand id 0..1 · y = arc position 0..1
uniform float uTime;
uniform float uMode;        // 0 nebula · 1 shell · 2 galaxy · 3 lattice · 4 strands · 5 torus
uniform float uTurb;
uniform float uScale;
uniform float uDrift;
uniform float uSpread;
uniform float uSize;
uniform float uHue;
uniform float uTwist;
uniform float uDepth;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uPxScale;
varying float vT;
varying float vSpark;
varying float vFog;

${SNOISE}

const float TAU = 6.28318530718;

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
  } else if (uMode < 1.5) {
    // shell: breathing sphere, surface rippled by noise + bass
    vec3 dir = normalize(seed + vec3(1e-4));
    float ripple = snoise(dir * (2.2 * uScale) + vec3(t * 0.35 * (0.2 + uDrift))) * 0.32 * uTurb;
    float r = uSpread * (1.15 + uBass * 0.5) + ripple;
    p = dir * r;
  } else if (uMode < 2.5) {
    // galaxy: log-spiral disc with differential rotation — the inner arms
    // wind faster than the rim, so the figure shears instead of spinning rigid
    float rr = sqrt(fract(aRand * 1.618 + 0.13));         // area-uniform radius
    float r = rr * uSpread * 1.6;
    float arm = floor(fract(aRand * 5.77) * 3.0);          // three arms
    float theta = arm * (TAU / 3.0)
                + log(r + 0.12) * (2.6 * uScale)
                + t * (0.5 * uDrift) / (0.35 + r)
                + (fract(aRand * 91.7) - 0.5) * (0.55 + uTurb * 0.6);
    float thick = (fract(aRand * 33.3) - 0.5) * (0.14 + uTurb * 0.12) * (1.0 - rr * 0.55);
    p = vec3(cos(theta) * r, thick * uSpread + uBass * 0.12 * sin(theta * 3.0), sin(theta) * r);
    p += curlNoise(p * (0.9 * uScale) + t * 0.05) * uTurb * 0.18;
  } else if (uMode < 3.5) {
    // lattice: a rigid grid the audio breathes through — Ikeda's data-cube
    vec3 cellP = aLat * uSpread * 1.25;
    float wave = sin(dot(aLat, vec3(2.1, 1.7, 2.6)) * 2.4 - t * (1.2 + uDrift));
    vec3 push = curlNoise(cellP * (0.7 * uScale) + t * 0.08 * uDrift);
    p = cellP + push * uTurb * 0.35 * (0.35 + uBass * 1.4) + normalize(cellP + 1e-4) * wave * uMid * 0.22;
  } else if (uMode < 4.5) {
    // strands: filaments combed by one curl sample — cheap enough for 600k
    // points, and the arc parameter keeps each filament coherent
    float sid = aStr.x;
    float arc = aStr.y;
    float a0 = sid * TAU * 7.0;
    vec3 root = vec3(cos(a0), (fract(sid * 17.3) - 0.5) * 1.6, sin(a0)) * uSpread * 0.9;
    vec3 dir = curlNoise(root * (0.8 * uScale) + vec3(0.0, t * 0.08 * uDrift, 0.0));
    float len = uSpread * (0.7 + fract(sid * 3.1) * 1.1);
    p = root + dir * arc * len;
    p += curlNoise(p * (1.6 * uScale) + t * 0.12 * uDrift) * uTurb * 0.22 * arc;
    p.y += sin(arc * 3.0 + t * 1.4 + sid * 20.0) * uBass * 0.2 * arc;
  } else {
    // torus: a ring the treble ripples around the minor circumference
    float u1 = fract(aRand * 1.913) * TAU;
    float v1 = fract(aRand * 7.271) * TAU + t * 0.25 * uDrift;
    float R = uSpread * 1.05;
    float rMinor = uSpread * (0.34 + uBass * 0.16)
                 + snoise(vec3(cos(u1), sin(u1), v1) * (1.8 * uScale) + t * 0.3) * 0.12 * uTurb;
    p = vec3((R + rMinor * cos(v1)) * cos(u1), rMinor * sin(v1), (R + rMinor * cos(v1)) * sin(u1));
  }

  // twist about Y, proportional to height — shears any of the above
  if (abs(uTwist) > 0.001) {
    float a = uTwist * p.y;
    float c = cos(a), s = sin(a);
    p = vec3(p.x * c - p.z * s, p.y, p.x * s + p.z * c);
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  vFog = 1.0 - uDepth * clamp((dist - 1.4) / 3.6, 0.0, 1.0);

  float sparkGate = step(0.995 - uTreble * 0.03, fract(aRand * 7.31));
  vSpark = sparkGate * uTreble;
  vT = fract(aRand * 0.618 + uHue + snoise(seed * 0.6) * 0.15);

  float sz = uSize * mix(0.7, 2.2, fract(aRand * 3.7)) * (1.0 + sparkGate * uTreble * 2.0);
  gl_PointSize = clamp(sz * uPxScale / max(0.4, dist), 1.0, 42.0);
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
uniform float uSharp;
uniform float uShape;   // 0 soft · 1 dot · 2 ring · 3 square · 4 cross
uniform float uOpacity;
varying float vT;
varying float vSpark;
varying float vFog;

vec3 palette(float t) {
  t = clamp(t, 0.0, 1.0) * 4.0;
  vec3 c = mix(uPal0, uPal1, clamp(t, 0.0, 1.0));
  c = mix(c, uPal2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, uPal3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, uPal4, clamp(t - 3.0, 0.0, 1.0));
  return c;
}

void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = length(q);
  // uSharp collapses the falloff toward a hard edge; at 1.0 the sprite is a
  // clean stamp rather than a blur, which is what reads as "sharp" on an LCD
  float inner = mix(0.06, 0.46, uSharp);
  float a;

  if (uShape < 0.5) {
    a = smoothstep(0.5, inner, d);
  } else if (uShape < 1.5) {
    a = 1.0 - smoothstep(mix(0.30, 0.44, uSharp), 0.5, d);
  } else if (uShape < 2.5) {
    float ring = abs(d - 0.34);
    a = 1.0 - smoothstep(mix(0.05, 0.015, uSharp), mix(0.16, 0.06, uSharp), ring);
  } else if (uShape < 3.5) {
    vec2 e = abs(q);
    float m = max(e.x, e.y);
    a = 1.0 - smoothstep(mix(0.30, 0.44, uSharp), 0.47, m);
  } else {
    vec2 e = abs(q);
    float bar = mix(0.09, 0.035, uSharp);
    float arm = min(e.x, e.y);
    a = (1.0 - smoothstep(bar, bar * 2.0, arm)) * (1.0 - smoothstep(0.42, 0.5, max(e.x, e.y)));
  }

  if (a <= 0.003) discard;
  vec3 c = palette(vT) * (0.55 + uLevel * 0.75);
  c += vSpark * vec3(0.9);
  c *= vFog;
  // additive blending ignores dst alpha, so the layer fade has to scale RGB too
  gl_FragColor = vec4(c * a * uOpacity, a * 0.85 * vFog * uOpacity);
}
`
