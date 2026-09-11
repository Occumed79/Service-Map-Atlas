export type TechApiKeyId = "arcgis" | "maptiler";

type TechApiKeyRegistration = {
  id: TechApiKeyId;
  provider: string;
  renderVariable: string;
  clientVariable: string;
  purpose: string;
  getValue: () => string;
};

/**
 * Canonical frontend technology/API key registry for Atlas map providers.
 *
 * Important isolation rule:
 * - ArcGIS flat/2D map reads only VITE_ARCGIS_API_KEY.
 * - MapTiler globe reads only the build-exposed value sourced from
 *   MAP_TILER_API_KEY on Render.
 */
export const TECH_API_KEY_REGISTRY: Record<TechApiKeyId, TechApiKeyRegistration> = {
  arcgis: {
    id: "arcgis",
    provider: "ArcGIS",
    renderVariable: "VITE_ARCGIS_API_KEY",
    clientVariable: "VITE_ARCGIS_API_KEY",
    purpose: "Flat 2D Atlas map",
    getValue: () => String(import.meta.env.VITE_ARCGIS_API_KEY || "").trim(),
  },
  maptiler: {
    id: "maptiler",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY",
    clientVariable: "VITE_MAP_TILER_API_KEY",
    purpose: "Default 3D globe Atlas map",
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY || "").trim(),
  },
};

export function getTechApiKey(id: TechApiKeyId) {
  return TECH_API_KEY_REGISTRY[id].getValue();
}
