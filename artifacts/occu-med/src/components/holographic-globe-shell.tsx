import type { CSSProperties } from "react";

type HolographicGlobeShellProps = {
  zoom?: number;
};

type ShellStyle = CSSProperties & {
  "--holo-shell-scale": number;
  "--holo-shell-opacity": number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function HolographicGlobeShell({ zoom = 1.5 }: HolographicGlobeShellProps) {
  const normalizedZoom = clamp((zoom - 1.5) / 2.75, 0, 1);
  const scale = 1 + normalizedZoom * 0.16;
  const opacity = 1 - normalizedZoom * 0.78;
  const style = {
    "--holo-shell-scale": scale,
    "--holo-shell-opacity": opacity,
  } as ShellStyle;

  return (
    <div className="holographic-globe-shell" aria-hidden="true" style={style}>
      <div className="holographic-globe-shell__orb">
        <span className="holographic-globe-shell__layer holographic-globe-shell__layer--a" />
        <span className="holographic-globe-shell__layer holographic-globe-shell__layer--b" />
        <span className="holographic-globe-shell__layer holographic-globe-shell__layer--c" />
        <span className="holographic-globe-shell__layer holographic-globe-shell__layer--d" />
        <span className="holographic-globe-shell__rim" />
      </div>
    </div>
  );
}
