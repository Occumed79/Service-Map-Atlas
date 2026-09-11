import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Globe2, Map as MapIcon } from "lucide-react";
import {
  AtlasArcgisMap as AtlasArcgisFlatMap,
  SERVICE_COLORS,
  type CoverageArea,
} from "@/components/atlas-arcgis-flat-map";

export { SERVICE_COLORS, type CoverageArea } from "@/components/atlas-arcgis-flat-map";

const LazyMapTilerGlobe = lazy(async () => {
  const module = await import("@/components/atlas-maptiler-globe");
  return { default: module.AtlasMapTilerGlobe };
});

type ReachMode = "off" | "radius" | "drive";

type AtlasMapProps = {
  center: [number, number];
  zoom: number;
  coverageAreas: CoverageArea[];
  selectedService?: string | null;
  searchAnchor?: [number, number] | null;
  reachMode?: ReachMode;
  radiusMiles?: number;
  driveMinutes?: number;
  showNetworkArcs?: boolean;
  onMarkerClick?: (area: CoverageArea) => void;
  onRequestCoverage?: (area: CoverageArea) => void;
  onStatusChange?: (status: "loading" | "ready" | "error", message?: string) => void;
};

type MapMode = "globe" | "flat";
type MapStatus = "loading" | "ready" | "error";

/**
 * Atlas map controller.
 *
 * Default: MapTiler 3D globe.
 * Optional: the existing ArcGIS flat 2D map, preserved as its own renderer.
 * Both renderers receive the exact same coverageAreas collection and filters.
 */
export function AtlasArcgisMap({
  center,
  zoom,
  coverageAreas,
  selectedService = null,
  searchAnchor = null,
  reachMode = "off",
  radiusMiles = 75,
  driveMinutes = 60,
  showNetworkArcs = true,
  onMarkerClick,
  onRequestCoverage,
  onStatusChange,
}: AtlasMapProps) {
  const [mode, setMode] = useState<MapMode>("globe");
  const [status, setStatus] = useState<MapStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const parentStatusRef = useRef(onStatusChange);
  parentStatusRef.current = onStatusChange;

  // Home historically renders ArcGIS-specific status copy. The controller owns
  // provider-specific status now, so suppress that legacy overlay before paint.
  useLayoutEffect(() => {
    parentStatusRef.current?.("ready");
  }, []);

  useEffect(() => {
    setStatus("loading");
    setError(null);
  }, [mode]);

  const handleRendererStatus = (nextStatus: MapStatus, message?: string) => {
    setStatus(nextStatus);
    setError(message ?? null);
    // Keep the legacy parent status hidden; detailed status is shown here.
    parentStatusRef.current?.("ready");
  };

  const commonProps = {
    center,
    zoom,
    coverageAreas,
    selectedService,
    onMarkerClick,
    onRequestCoverage,
    onStatusChange: handleRendererStatus,
  };

  return (
    <>
      {mode === "globe" ? (
        <Suspense fallback={null}>
          <LazyMapTilerGlobe
            {...commonProps}
            searchAnchor={searchAnchor}
            reachMode={reachMode}
            radiusMiles={radiusMiles}
            driveMinutes={driveMinutes}
            showNetworkArcs={showNetworkArcs}
          />
        </Suspense>
      ) : (
        <AtlasArcgisFlatMap {...commonProps} />
      )}

      {status === "loading" && (
        <div className="atlas-map-status" role="status">
          Loading {mode === "globe" ? "globe" : "2D map"}…
        </div>
      )}

      {status === "error" && (
        <div className="atlas-map-status atlas-map-status-error" role="alert">
          {mode === "globe" ? "MapTiler globe" : "ArcGIS 2D map"} failed to load
          {error ? `: ${error}` : "."}
        </div>
      )}

      <div className="atlas-map-mode-toggle" role="group" aria-label="Map view">
        <button
          type="button"
          className={mode === "globe" ? "active" : ""}
          aria-pressed={mode === "globe"}
          onClick={() => setMode("globe")}
          title="Globe view"
        >
          <Globe2 aria-hidden="true" />
          <span>Globe</span>
        </button>
        <button
          type="button"
          className={mode === "flat" ? "active" : ""}
          aria-pressed={mode === "flat"}
          onClick={() => setMode("flat")}
          title="Flat 2D view"
        >
          <MapIcon aria-hidden="true" />
          <span>2D</span>
        </button>
      </div>
    </>
  );
}
