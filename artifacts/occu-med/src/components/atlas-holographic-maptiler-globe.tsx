import type { ComponentProps } from "react";
import { AtlasMapTilerGlobe } from "@/components/atlas-maptiler-globe";
import { HolographicGlobeShell } from "@/components/holographic-globe-shell";

type AtlasHolographicMapTilerGlobeProps = ComponentProps<typeof AtlasMapTilerGlobe>;

export function AtlasHolographicMapTilerGlobe(props: AtlasHolographicMapTilerGlobeProps) {
  return (
    <div className="atlas-holographic-globe-stage">
      <AtlasMapTilerGlobe {...props} />
      <HolographicGlobeShell zoom={props.zoom} />
    </div>
  );
}
