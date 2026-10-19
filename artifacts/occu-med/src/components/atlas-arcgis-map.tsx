import { lazy, Suspense, useLayoutEffect, useRef, useState } from "react";
import type { CoverageArea } from "@/components/atlas-arcgis-flat-map-v2";
import { SERVICE_COLORS } from "@/components/atlas-service-palette";

export { SERVICE_COLORS } from "@/components/atlas-service-palette";
export type { CoverageArea } from "@/components/atlas-arcgis-flat-map-v2";

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

type MapStatus = "loading" | "ready" | "error";

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
  const [status, setStatus] = useState<MapStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const parentStatusRef = useRef(onStatusChange);
  parentStatusRef.current = onStatusChange;

  useLayoutEffect(() => {
    parentStatusRef.current?.("ready");
  }, []);

  const handleRendererStatus = (nextStatus: MapStatus, message?: string) => {
    setStatus(nextStatus);
    setError(message ?? null);
    parentStatusRef.current?.("ready");
  };

  const commonProps = {
    center,
    zoom,
    coverageAreas,
    selectedService,
    searchAnchor,
    reachMode,
    radiusMiles,
    driveMinutes,
    showNetworkArcs,
    onMarkerClick,
    onRequestCoverage,
    onStatusChange: handleRendererStatus,
  };

  return (
    <>
      <Suspense fallback={null}>
        <LazyMapTilerGlobe {...commonProps} />
      </Suspense>

      {status === "loading" && (
        <div className="atlas-map-status" role="status">
          Loading globe…
        </div>
      )}

      {status === "error" && (
        <div className="atlas-map-status atlas-map-status-error" role="alert">
          MapTiler globe failed to load
          {error ? `: ${error}` : "."}
        </div>
      )}
    </>
  );
}
