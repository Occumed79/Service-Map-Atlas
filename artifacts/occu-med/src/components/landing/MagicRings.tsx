// React adaptation of the supplied Vue Bits MagicRings shader.
// Each ring runs once; no modulo cycle or repeated click listeners.
import { useEffect, useRef } from "react";
import * as THREE from "three";
const vertexShader = `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const fragmentShader = `
precision highp float;

uniform float uTime, uAttenuation, uLineThickness;
uniform float uBaseRadius, uRadiusStep, uScaleRate;
uniform float uOpacity, uNoiseAmount, uRotation, uRingGap;
uniform float uFadeIn, uFadeOut;
uniform float uGlobeRadius;
uniform float uMouseInfluence, uHoverAmount, uHoverScale, uParallax, uBurst;
uniform vec2 uResolution, uMouse;
uniform vec3 uColor, uColorTwo;
uniform int uRingCount;

const float HP = 1.5707963;
const float CYCLE = 3.45;

float fade(float t) {
  return t < uFadeIn ? smoothstep(0.0, uFadeIn, t) : 1.0 - smoothstep(uFadeOut, CYCLE - 0.2, t);
}

float ring(vec2 p, float ri, float cut, float t0, float px) {
  float t = clamp(uTime - t0, 0.0, CYCLE);
  float r = uBaseRadius + (t / CYCLE) * uScaleRate;
  float d = abs(length(p) - r);
  float a = atan(abs(p.y), abs(p.x)) / HP;
  float th = max(1.0 - a, 0.5) * px * uLineThickness;
  float h = (1.0 - smoothstep(th, th * 1.5, d)) + 1.0;
  d += pow(cut * a, 3.0) * r;
  return h * exp(-uAttenuation * d) * fade(t);
}

void main() {
  float px = 1.0 / min(uResolution.x, uResolution.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) * px;
  float cr = cos(uRotation), sr = sin(uRotation);
  p = mat2(cr, -sr, sr, cr) * p;
  p -= uMouse * uMouseInfluence;
  float sc = mix(1.0, uHoverScale, uHoverAmount) + uBurst * 0.03;
  p /= sc;
  vec3 c = vec3(0.0);
  float rcf = max(float(uRingCount) - 1.0, 1.0);
  for (int i = 0; i < 10; i++) {
    if (i >= uRingCount) break;
    float fi = float(i);
    vec2 pr = p - fi * uParallax * uMouse;
    vec3 rc = mix(uColor, uColorTwo, fi / rcf);
    c = mix(c, rc, vec3(ring(pr, uBaseRadius + fi * uRadiusStep, pow(uRingGap, fi), i == 0 ? 0.0 : 0.2 * fi, px)));
  }
  c *= smoothstep(uGlobeRadius - px * 2.0, uGlobeRadius + px * 2.0, length(p));
  c *= 1.0 + uBurst * 2.0;
  float n = fract(sin(dot(gl_FragCoord.xy + uTime * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * uNoiseAmount;
  gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)) * uOpacity);
}
`;
export const entranceSettings = {
  color: "#c5cbd2",
  colorTwo: "#ffffff",
  speed: 1.4,
  ringCount: 6,
  attenuation: 10,
  lineThickness: 2,
  baseRadius: 0.35,
  radiusStep: 0.1,
  scaleRate: 0.1,
  opacity: 1,
  noiseAmount: 0.1,
  rotation: 0,
  ringGap: 1.5,
  fadeIn: 0.7,
  fadeOut: 0.5,
  followMouse: false,
  mouseInfluence: 0.2,
  hoverScale: 1.2,
  parallax: 0.05,
  clickBurst: true,
} as const;
export function MagicRings({ onComplete }: { onComplete: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      completeRef.current();
      return;
    }
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    const p = entranceSettings;
    const uniforms = {
      uTime: { value: 0 },
      uAttenuation: { value: p.attenuation },
      uResolution: { value: new THREE.Vector2() },
      uGlobeRadius: { value: 0.19 },
      uColor: { value: new THREE.Color(p.color) },
      uColorTwo: { value: new THREE.Color(p.colorTwo) },
      uLineThickness: { value: p.lineThickness },
      uBaseRadius: { value: 0.19 },
      uRadiusStep: { value: p.radiusStep },
      uScaleRate: { value: 0.26 },
      uRingCount: { value: p.ringCount },
      uOpacity: { value: p.opacity },
      uNoiseAmount: { value: Number(p.noiseAmount) },
      uRotation: { value: p.rotation },
      uRingGap: { value: p.ringGap },
      uFadeIn: { value: p.fadeIn },
      uFadeOut: { value: p.fadeOut },
      uMouse: { value: new THREE.Vector2() },
      uMouseInfluence: { value: 0 },
      uHoverAmount: { value: 0 },
      uHoverScale: { value: p.hoverScale },
      uParallax: { value: p.parallax },
      uBurst: { value: p.clickBurst ? 1 : 0 },
    };
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.1, 10);
    camera.position.z = 1;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Mesh(geometry, material));
    const resize = () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.getDrawingBufferSize(uniforms.uResolution.value);
      // Cobe's default sphere radius is 0.8 in a clip-space square (-1..1).
      const stage = mount.parentElement!;
      const radius = stage.clientWidth * 0.4;
      const normalizedRadius =
        radius / Math.min(mount.clientWidth, mount.clientHeight);
      uniforms.uBaseRadius.value = normalizedRadius;
      uniforms.uGlobeRadius.value = normalizedRadius;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    let frame = 0;
    const startedAt = performance.now();
    const endTime = 3.45 + 0.2 * (p.ringCount - 1);
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(frame);
      completeRef.current();
    };
    // RAF may be suspended in an inactive tab or on a stalled graphics context.
    // Navigation must complete independently of the decorative renderer.
    const deadline = window.setTimeout(
      finish,
      (endTime / p.speed) * 1000 + 100,
    );
    const animate = (now: number) => {
      if (finished) return;
      const elapsed = (now - startedAt) / 1000;
      uniforms.uTime.value = elapsed * p.speed;
      // Time-based click burst: identical timing at every frame rate.
      uniforms.uBurst.value = p.clickBurst ? Math.exp(-elapsed * 5) : 0;
      // Fade grain with the one-shot animation so no noise is left behind.
      uniforms.uNoiseAmount.value =
        p.noiseAmount * Math.max(0, 1 - uniforms.uTime.value / endTime);
      renderer.render(scene, camera);
      if (uniforms.uTime.value >= endTime) {
        finish();
        return;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      finished = true;
      window.clearTimeout(deadline);
      cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      ref={mountRef}
      className="atlas-landing-rings"
      aria-hidden="true"
      data-testid="atlas-entry-rings"
    />
  );
}
