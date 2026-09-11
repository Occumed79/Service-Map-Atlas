export type TechApiKeyId =
  | "arcgis"
  | "maptiler"
  | "maptiler2"
  | "maptiler3"
  | "maptiler4"
  | "maptiler5"
  | "maptiler6";

export type MapTilerApiKeyId = Exclude<TechApiKeyId, "arcgis">;

type TechApiKeyRegistration = {
  id: TechApiKeyId;
  provider: string;
  renderVariable: string;
  clientVariable: string;
  purpose: string;
  priority?: number;
  getValue: () => string;
};

/**
 * Canonical frontend technology/API key registry for Atlas map providers.
 *
 * Isolation rules:
 * - ArcGIS flat/2D map reads only VITE_ARCGIS_API_KEY.
 * - MapTiler globe reads only the build-exposed values sourced from the
 *   MAP_TILER_API_KEY family on Render.
 * - ArcGIS never participates in MapTiler fallback/rotation.
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
    purpose: "Default 3D globe Atlas map — primary key",
    priority: 1,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY || "").trim(),
  },
  maptiler2: {
    id: "maptiler2",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY_2",
    clientVariable: "VITE_MAP_TILER_API_KEY_2",
    purpose: "3D globe Atlas map — backup key 2",
    priority: 2,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY_2 || "").trim(),
  },
  maptiler3: {
    id: "maptiler3",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY_3",
    clientVariable: "VITE_MAP_TILER_API_KEY_3",
    purpose: "3D globe Atlas map — backup key 3",
    priority: 3,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY_3 || "").trim(),
  },
  maptiler4: {
    id: "maptiler4",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY_4",
    clientVariable: "VITE_MAP_TILER_API_KEY_4",
    purpose: "3D globe Atlas map — backup key 4",
    priority: 4,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY_4 || "").trim(),
  },
  maptiler5: {
    id: "maptiler5",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY_5",
    clientVariable: "VITE_MAP_TILER_API_KEY_5",
    purpose: "3D globe Atlas map — backup key 5",
    priority: 5,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY_5 || "").trim(),
  },
  maptiler6: {
    id: "maptiler6",
    provider: "MapTiler",
    renderVariable: "MAP_TILER_API_KEY_6",
    clientVariable: "VITE_MAP_TILER_API_KEY_6",
    purpose: "3D globe Atlas map — backup key 6",
    priority: 6,
    getValue: () => String(import.meta.env.VITE_MAP_TILER_API_KEY_6 || "").trim(),
  },
};

const MAPTILER_KEY_IDS: MapTilerApiKeyId[] = [
  "maptiler",
  "maptiler2",
  "maptiler3",
  "maptiler4",
  "maptiler5",
  "maptiler6",
];

export function getTechApiKey(id: TechApiKeyId) {
  return TECH_API_KEY_REGISTRY[id].getValue();
}

/**
 * Returns the available MapTiler key pool in strict priority order.
 * Empty values and accidental duplicate keys are removed so failover only
 * attempts genuinely usable alternatives.
 */
export function getMapTilerApiKeys() {
  return Array.from(
    new Set(
      MAPTILER_KEY_IDS
        .map((id) => TECH_API_KEY_REGISTRY[id].getValue())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}
