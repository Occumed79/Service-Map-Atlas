import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SERVICE_COLORS, type CoverageArea } from "@/components/atlas-arcgis-map";
import { getMapTilerApiKeys } from "@/lib/tech-api-key-registry";

type MapTilerSdk = {
  config: { apiKey: string };
  Map: new (options: Record<string, unknown>) => any;
  MapStyle: { STREETS: unknown };
};

declare global {
  interface Window {
    maptilersdk?: MapTilerSdk;
  }
}

const SOURCE_ID = "atlas-coverage-areas";
const OUTER_LAYER_ID = "atlas-coverage-outer-halo";
const INNER_LAYER_ID = "atlas-coverage-inner-halo";
const CORE_LAYER_ID = "atlas-coverage-core";
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 18;

const SERVICE_ORDER = [
  "Dental",
  "Chest X-Ray",
  "B-Reader",
  "Spirometry",
  "Pulmonary Function Testing",
  "Drug Screen",
  "DOT Physical",
  "Audiogram",
  "EKG",
  "Treadmill Stress Test",
  "Laboratory Services",
  "Titers",
  "Vaccinations",
  "Physical Examination",
  "Vision Testing",
  "Occupational Medicine",
  "Specialty Services",
];

function serviceForArea(area: CoverageArea, selectedService: string | null) {
  if (selectedService && area.services.includes(selectedService)) return selectedService;
  return SERVICE_ORDER.find((service) => area.services.includes(service)) ?? "Specialty Services";
}

function colorForArea(area: CoverageArea, selectedService: string | null) {
  return SERVICE_COLORS[serviceForArea(area, selectedService)] ?? SERVICE_COLORS["Specialty Services"];
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function waitForMapTiler(timeoutMs = 20_000): Promise<MapTilerSdk> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.maptilersdk?.Map && window.maptilersdk?.config) {
        resolve(window.maptilersdk);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("MapTiler SDK did not finish loading"));
        return;
      }
      window.setTimeout(check, 40);
    };
    check();
  });
}

function coverageGeoJson(areas: CoverageArea[], selectedService: string | null) {
  return {
    type: "FeatureCollection",
    features: areas.map((area) => ({
      type: "Feature",
      id: area.id,
      geometry: {
        type: "Point",
        coordinates: [area.longitude, area.latitude],
      },
      properties: {
        coverageId: area.id,
        city: area.city,
        region: area.region,
        country: area.country,
        latitude: area.latitude,
        longitude: area.longitude,
        services: area.services.join("|"),
        availability: area.availability,
        markerColor: colorForArea(area, selectedService),
      },
    })),
  };
}

function areaFromFeature(feature: any): CoverageArea | null {
  const props = feature?.properties;
  const coordinates = feature?.geometry?.coordinates;
  if (!props?.coverageId || !Array.isArray(coordinates)) return null;

  return {
    id: String(props.coverageId),
    city: String(props.city || ""),
    region: String(props.region || ""),
    country: String(props.country || ""),
    latitude: Number(props.latitude ?? coordinates[1]),
    longitude: Number(props.longitude ?? coordinates[0]),
    services: String(props.services || "").split("|").filter(Boolean),
    availability: "coordination_available",
  };
}

function hexToCssRgba(hex: string, alpha = 1) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function shouldFailOverMapTiler(event: any) {
  const status = Number(
    event?.error?.status ??
      event?.error?.statusCode ??
      event?.status ??
      event?.statusCode ??
      0,
  );
  if (status === 401 || status === 403 || status === 429) return true;

  const message = String(event?.error?.message || event?.message || "").toLowerCase();
  return /api\s*key|api-key|unauthori[sz]ed|forbidden|quota|rate\s*limit|too many requests|usage\s*limit/.test(message);
}

type AtlasMapTilerGlobeProps = {
  center: [number, number];
  zoom: number;
  coverageAreas: CoverageArea[];
  selectedService?: string | null;
  onMarkerClick?: (area: CoverageArea) => void;
  onRequestCoverage?: (area: CoverageArea) => void;
  onStatusChange?: (status: "loading" | "ready" | "error", message?: string) => void;
};

export function AtlasMapTilerGlobe({
  center,
  zoom,
  coverageAreas,
  selectedService = null,
  onMarkerClick,
  onRequestCoverage,
  onStatusChange,
}: AtlasMapTilerGlobeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const centerZoomRef = useRef({ center, zoom });
  const coverageRef = useRef(coverageAreas);
  const selectedServiceRef = useRef<string | null>(selectedService);
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage, onStatusChange });
  const [selectedArea, setSelectedArea] = useState<CoverageArea | null>(null);

  centerZoomRef.current = { center, zoom };
  coverageRef.current = coverageAreas;
  selectedServiceRef.current = selectedService;
  handlersRef.current = { onMarkerClick, onRequestCoverage, onStatusChange };

  useEffect(() => {
    setSelectedArea(null);
  }, [selectedService]);

  useEffect(() => {
    let destroyed = false;
    let fallbackTimer: number | null = null;
    const host = hostRef.current;
    if (!host) return;

    handlersRef.current.onStatusChange?.("loading");
    host.dataset.maptilerStatus = "loading";

    void (async () => {
      try {
        const sdk = await waitForMapTiler();
        if (destroyed) return;

        const apiKeys = getMapTilerApiKeys();
        if (!apiKeys.length) {
          throw new Error("No MAP_TILER_API_KEY values are available to the Atlas client build");
        }

        const createMap = (
          keyIndex: number,
          preservedCamera?: { center: [number, number]; zoom: number },
        ) => {
          if (destroyed) return;

          const apiKey = apiKeys[keyIndex];
          if (!apiKey) return;

          readyRef.current = false;
          sdk.config.apiKey = apiKey;

          const previousMap = mapRef.current;
          mapRef.current = null;
          try {
            previousMap?.remove?.();
          } catch {
            // Ignore WebGL cleanup races while rotating keys.
          }
          host.replaceChildren();

          host.dataset.maptilerStatus = keyIndex === 0 ? "loading" : "fallback";
          host.dataset.maptilerKeySlot = String(keyIndex + 1);
          delete host.dataset.maptilerError;
          handlersRef.current.onStatusChange?.("loading");

          const current = centerZoomRef.current;
          const mapCenter = preservedCamera?.center ?? [current.center[1], current.center[0]];
          const mapZoom = preservedCamera?.zoom ?? clampZoom(current.zoom);

          const map = new sdk.Map({
            container: host,
            style: sdk.MapStyle.STREETS,
            center: mapCenter,
            zoom: clampZoom(mapZoom),
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            projection: "globe",
            attributionControl: true,
          });
          mapRef.current = map;
          let fallbackScheduledForMap = false;

          map.on("load", () => {
            if (destroyed || mapRef.current !== map) return;

            map.addSource(SOURCE_ID, {
              type: "geojson",
              data: coverageGeoJson(coverageRef.current, selectedServiceRef.current),
            });

            map.addLayer({
              id: OUTER_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": 15,
                "circle-color": ["get", "markerColor"],
                "circle-opacity": 0.1,
                "circle-stroke-width": 0,
              },
            });

            map.addLayer({
              id: INNER_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": 10.5,
                "circle-color": ["get", "markerColor"],
                "circle-opacity": 0.24,
                "circle-stroke-width": 0,
              },
            });

            map.addLayer({
              id: CORE_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": 5.75,
                "circle-color": ["get", "markerColor"],
                "circle-opacity": 1,
                "circle-stroke-color": "rgba(255,255,255,0.98)",
                "circle-stroke-width": 2.2,
              },
            });

            map.on("click", CORE_LAYER_ID, (event: any) => {
              const area = areaFromFeature(event.features?.[0]);
              if (!area) return;
              handlersRef.current.onMarkerClick?.(area);
              setSelectedArea(area);
            });

            map.on("mouseenter", CORE_LAYER_ID, () => {
              if (map.getCanvas?.()) map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", CORE_LAYER_ID, () => {
              if (map.getCanvas?.()) map.getCanvas().style.cursor = "";
            });

            map.on("click", (event: any) => {
              const hits = map.queryRenderedFeatures?.(event.point, { layers: [CORE_LAYER_ID] }) ?? [];
              if (!hits.length) setSelectedArea(null);
            });

            readyRef.current = true;
            host.dataset.maptilerStatus = "ready";
            handlersRef.current.onStatusChange?.("ready");
          });

          map.on("error", (event: any) => {
            if (destroyed || mapRef.current !== map) return;

            if (
              shouldFailOverMapTiler(event) &&
              keyIndex + 1 < apiKeys.length &&
              !fallbackScheduledForMap
            ) {
              fallbackScheduledForMap = true;
              const cameraCenter = map.getCenter?.();
              const nextCamera = {
                center: [
                  Number(cameraCenter?.lng ?? centerZoomRef.current.center[1]),
                  Number(cameraCenter?.lat ?? centerZoomRef.current.center[0]),
                ] as [number, number],
                zoom: clampZoom(Number(map.getZoom?.() ?? centerZoomRef.current.zoom)),
              };

              host.dataset.maptilerStatus = "fallback";
              fallbackTimer = window.setTimeout(() => {
                createMap(keyIndex + 1, nextCamera);
              }, 0);
              return;
            }

            if (readyRef.current) return;
            const message = event?.error?.message || "MapTiler globe failed to load";
            host.dataset.maptilerStatus = "error";
            host.dataset.maptilerError = String(message).slice(0, 240);
            handlersRef.current.onStatusChange?.("error", String(message));
          });
        };

        createMap(0);
      } catch (error: unknown) {
        if (destroyed) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Occu-Med Atlas MapTiler globe failed to load.", error);
        host.dataset.maptilerStatus = "error";
        host.dataset.maptilerError = message.slice(0, 240);
        handlersRef.current.onStatusChange?.("error", message);
      }
    })();

    return () => {
      destroyed = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      readyRef.current = false;
      try {
        mapRef.current?.remove?.();
      } catch {
        // Ignore cleanup races while the SDK is disposing WebGL resources.
      }
      mapRef.current = null;
      host.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.easeTo?.({
      center: [center[1], center[0]],
      zoom: clampZoom(zoom),
      duration: 900,
      essential: true,
    });
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource?.(SOURCE_ID);
    source?.setData?.(coverageGeoJson(coverageAreas, selectedService));
  }, [coverageAreas, selectedService]);

  const cardColor = selectedArea ? colorForArea(selectedArea, selectedService) : SERVICE_COLORS["Occupational Medicine"];
  const cardPrimaryService = selectedArea ? serviceForArea(selectedArea, selectedService) : "";

  return (
    <>
      <div
        ref={hostRef}
        className="atlas-map atlas-maptiler-globe"
        role="application"
        aria-label="Occu-Med coverage globe"
      />

      {selectedArea && (
        <aside
          className="atlas-coverage-card"
          aria-label={`Coverage in ${selectedArea.city}`}
          style={{ "--coverage-accent": cardColor } as CSSProperties}
        >
          <button
            type="button"
            className="atlas-coverage-card-close"
            aria-label="Close coverage details"
            onClick={() => setSelectedArea(null)}
          >
            ×
          </button>

          <div className="atlas-coverage-card-accent" />
          <div className="atlas-coverage-card-kicker">
            <span className="atlas-coverage-card-pip" />
            {cardPrimaryService}
          </div>
          <h2>Coverage available</h2>
          <p className="atlas-coverage-card-place">
            {selectedArea.city}{selectedArea.region ? `, ${selectedArea.region}` : ""}
            {selectedArea.country ? ` · ${selectedArea.country}` : ""}
          </p>

          <div className="atlas-coverage-card-services">
            {selectedArea.services.slice(0, 7).map((service) => {
              const serviceColor = SERVICE_COLORS[service] ?? SERVICE_COLORS["Specialty Services"];
              return (
                <span
                  key={service}
                  style={{
                    borderColor: hexToCssRgba(serviceColor, 0.25),
                    background: hexToCssRgba(serviceColor, 0.10),
                    color: serviceColor,
                  }}
                >
                  {service}
                </span>
              );
            })}
            {selectedArea.services.length > 7 && (
              <span className="atlas-coverage-card-more">+{selectedArea.services.length - 7} more</span>
            )}
          </div>

          <p className="atlas-coverage-card-note">
            Provider identity is protected in the Atlas. Occu-Med confirms the appropriate network location and final availability during coordination.
          </p>

          <button
            type="button"
            className="atlas-coverage-card-action"
            onClick={() => handlersRef.current.onRequestCoverage?.(selectedArea)}
          >
            Request confirmation
            <span aria-hidden="true">→</span>
          </button>
        </aside>
      )}
    </>
  );
}
