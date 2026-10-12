import { ShaderBackgroundStyle } from '../backgroundStyle';

const PALETTE_INDICES = [0, 1, 2, 3, 4];

const UNIFORMS = [
  'uniform vec2 uRes;',
  'uniform float uTime;',
  'uniform float uLo;',
  'uniform float uHi;',
  'uniform float uSeed;',
  ...PALETTE_INDICES.map((i) => `uniform vec3 uPal${i};`),
  ...PALETTE_INDICES.map((i) => `uniform vec3 uRamp${i};`),
  ...PALETTE_INDICES.map((i) => `uniform float uW${i};`),
].join('\n');

const BODY = `
const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.; float a = .5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= .5; } return v / .9375; }
vec3 palAt(int i){ if (i == 0) return uPal0; if (i == 1) return uPal1; if (i == 2) return uPal2; if (i == 3) return uPal3; return uPal4; }
float wAt(int i){ if (i == 0) return uW0; if (i == 1) return uW1; if (i == 2) return uW2; if (i == 3) return uW3; return uW4; }
vec3 ramp(float x){ x = clamp(x, 0., 1.) * 4.;
  if (x < 1.) return mix(uRamp0, uRamp1, x);
  if (x < 2.) return mix(uRamp1, uRamp2, x - 1.);
  if (x < 3.) return mix(uRamp2, uRamp3, x - 2.);
  return mix(uRamp3, uRamp4, x - 3.); }
vec3 toSrgb(vec3 c){ c = clamp(c, 0., 1.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(vec3(.0031308), c)); }
vec3 clampToBand(vec3 c){ float y = dot(c, LW);
  if (y > uHi) return c * (uHi / y);
  if (y < uLo) return mix(c, vec3(1.), (uLo - y) / (1. - y));
  return c; }
float dither(vec2 fc){ return (hash(fc + fract(uTime * 7.)) - .5) / 255.; }

vec3 mesh(vec2 p, float t){ vec3 acc = vec3(0.); float ws = 0.;
  for (int i = 0; i < 5; i++) { float fi = float(i);
    vec2 c = vec2(sin(t * (.11 + .03 * fi) + fi * 1.7 + uSeed), cos(t * (.09 + .025 * fi) + fi * 2.3 + uSeed * 1.3)) * vec2(.55, .75);
    float d = length(p - c); float w = (.35 + wAt(i)) * exp(-d * d * 2.2);
    acc += palAt(i) * w; ws += w; }
  return acc / max(ws, 1e-4); }

vec3 warped(vec2 p, float t){ p *= 1.3;
  vec2 q = vec2(fbm(p + vec2(0., t * .03) + uSeed), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 4. * q + vec2(1.7, 9.2) + .05 * t), fbm(p + 4. * q + vec2(8.3, 2.8) - .04 * t));
  return ramp(smoothstep(.2, .85, fbm(p + 3. * r))); }
`;

const SHADER_FUNCTIONS: Record<ShaderBackgroundStyle, string> = {
  mesh: 'mesh',
  noise: 'warped',
};

export function backdropShaderSource(style: ShaderBackgroundStyle): string {
  return `${UNIFORMS}
${BODY}
vec3 shade(vec2 fc){ vec2 uv = fc / uRes; float asp = uRes.x / uRes.y;
  vec2 p = (uv - .5) * vec2(asp, 1.) * 2.;
  vec3 c = clampToBand(${SHADER_FUNCTIONS[style]}(p, uTime));
  return toSrgb(c) + dither(fc); }
half4 main(float2 xy){ return half4(shade(float2(xy.x, uRes.y - xy.y)), 1.); }`;
}
