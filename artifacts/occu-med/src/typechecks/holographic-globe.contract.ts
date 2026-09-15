import { HolographicGlobeShell } from "@/components/holographic-globe-shell";
import { getMapTilerApiKeys } from "@/lib/tech-api-key-registry";

// Compile-time contract for the holographic globe feature.
// The dedicated key must be selectable without changing the global MapTiler fallback order.
const prioritizedKeys: string[] = getMapTilerApiKeys("maptiler6");
void prioritizedKeys;

// The shell is a standalone visual layer so the map beneath it remains the interaction surface.
const ShellComponent: typeof HolographicGlobeShell = HolographicGlobeShell;
void ShellComponent;
