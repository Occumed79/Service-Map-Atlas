/**
 * Legacy Leaflet + ArcGIS hybrid runtime.
 * The client map now uses a pure ArcGIS WebMap/MapView in
 * `components/atlas-arcgis-map.tsx`. This file is intentionally a no-op
 * so any stale imports do not re-enable Leaflet basemap behavior.
 */
export function installArcgisAtlasRuntime(): void {
  // no-op
}
