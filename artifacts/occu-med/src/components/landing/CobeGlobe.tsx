// Adapted from Eldora UI's Cobe Globe, default interactive variant.
// https://www.eldoraui.site/docs/components/cobe-globe
import { useEffect, useRef, useState } from "react";
import createGlobe from "cobe";

// Eldora's decorative example markers; these are not clinic coverage claims.
const markers: {
  location: [number, number];
  size: number;
  color?: [number, number, number];
}[] = [
  { location: [37.7595, -122.4367], size: 0.05 },
  { location: [40.7128, -74.006], size: 0.05, color: [1, 0, 0] },
  { location: [35.6895, 139.6917], size: 0.05, color: [0, 0.5, 1] },
  { location: [-33.8688, 151.2093], size: 0.05, color: [0, 1, 0] },
  { location: [-22.9068, -43.1729], size: 0.05, color: [0.8, 0, 0.8] },
  { location: [48.8566, 2.3522], size: 0.05, color: [1, 1, 0] },
  { location: [41.1579, -8.6291], size: 0.05, color: [1, 0.5, 0] },
  { location: [37.9838, 23.7275], size: 0.05, color: [1, 0.5, 1] },
  { location: [41.9028, 12.4964], size: 0.05, color: [0.5, 0.3, 0] },
  { location: [27.7172, 85.324], size: 0.05, color: [0, 0.5, 1] },
  { location: [43.4643, -0.5167], size: 0.05, color: [0, 1, 0] },
  { location: [12.6683, -8.0076], size: 0.05, color: [1, 1, 0] },
  { location: [11.55, 43.1667], size: 0.05, color: [0.8, 0, 0.8] },
];

export function CobeGlobe({ reducedMotion }: { reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interaction = useRef({
    pointer: null as number | null,
    startX: 0,
    startRotation: 0,
    target: 0,
  });
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let width = canvas.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let phi = 0;
    let rotation = 0;
    let previous = performance.now();
    let globe: ReturnType<typeof createGlobe>;
    try {
      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width: width * dpr,
        height: width * dpr,
        phi: 0,
        theta: 0.2,
        dark: 1.1,
        diffuse: 3,
        mapSamples: 16000,
        mapBrightness: 1.8,
        mapBaseBrightness: 0.05,
        baseColor: [1, 1, 1],
        markerColor: [251 / 255, 100 / 255, 21 / 255],
        glowColor: [1, 1, 1],
        markers,
        opacity: 0.7,
        onRender: (state) => {
          const now = performance.now();
          const delta = Math.min((now - previous) / 1000, 0.05);
          previous = now;
          if (!reducedMotion && interaction.current.pointer === null)
            phi += delta * 0.3;
          rotation +=
            (interaction.current.target - rotation) *
            (1 - Math.exp(-delta * 12));
          state.phi = phi + rotation;
          state.width = width * dpr;
          state.height = width * dpr;
        },
      });
    } catch {
      setUnavailable(true);
      return;
    }
    const observer = new ResizeObserver(() => {
      width = canvas.clientWidth;
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      globe.destroy();
    };
  }, [reducedMotion]);
  if (unavailable)
    return (
      <p className="atlas-globe-fallback">
        The interactive globe requires WebGL. You can still enter the map.
      </p>
    );
  return (
    <canvas
      ref={canvasRef}
      className="atlas-cobe-canvas"
      aria-label="Interactive Cobe globe. Drag to rotate."
      onPointerDown={(event) => {
        interaction.current.pointer = event.pointerId;
        interaction.current.startX = event.clientX;
        interaction.current.startRotation = interaction.current.target;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (interaction.current.pointer === event.pointerId)
          interaction.current.target =
            interaction.current.startRotation +
            (event.clientX - interaction.current.startX) / 200;
      }}
      onPointerUp={(event) => {
        interaction.current.pointer = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        interaction.current.pointer = null;
      }}
      onLostPointerCapture={() => {
        interaction.current.pointer = null;
      }}
    />
  );
}
