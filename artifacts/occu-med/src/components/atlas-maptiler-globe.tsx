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

type ReachMode = "off" | "radius" | "drive";
type FeatureCollection = { type: "FeatureCollection"; features: any[]; [key: string]: unknown };

const SOURCE_ID = "atlas-coverage-areas";
const OUTER_LAYER_ID = "atlas-coverage-outer-halo";
const INNER_LAYER_ID = "atlas-coverage-inner-halo";
const CORE_LAYER_ID = "atlas-coverage-core";
const RING_SOURCE_ID = "atlas-reach-rings";
const RING_FILL_LAYER_ID = "atlas-reach-ring-fill";
const RING_GLOW_LAYER_ID = "atlas-reach-ring-glow";
const RING_CORE_LAYER_ID = "atlas-reach-ring-core";
const ARC_SOURCE_ID = "atlas-network-arcs";
const ARC_GLOW_LAYER_ID = "atlas-network-arc-glow";
const ARC_CORE_LAYER_ID = "atlas-network-arc-core";
const ANCHOR_SOURCE_ID = "atlas-search-anchor";
const ANCHOR_GLOW_LAYER_ID = "atlas-search-anchor-glow";
const ANCHOR_CORE_LAYER_ID = "atlas-search-anchor-core";
const MIN_ZOOM = 1.5;
const MAX_ZOOM = 18;
const EARTH_RADIUS_MILES = 3958.8;

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

function coverageGeoJson(areas: CoverageArea[], selectedService: string | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: areas.map((area) => ({
      type: "Feature",
      id: area.id,
      geometry: { type: "Point", coordinates: [area.longitude, area.latitude] },
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
    event?.error?.status ?? event?.error?.statusCode ?? event?.status ?? event?.statusCode ?? 0,
  );
  if (status === 401 || status === 403 || status === 429) return true;

  const message = String(event?.error?.message || event?.message || "").toLowerCase();
  return /api\s*key|api-key|unauthori[sz]ed|forbidden|quota|rate\s*limit|too many requests|usage\s*limit/.test(message);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function distanceMiles(a: [number, number], b: [number, number]) {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

function destinationPoint(center: [number, number], radiusMiles: number, bearingRadians: number) {
  const angularDistance = radiusMiles / EARTH_RADIUS_MILES;
  const latitude = toRadians(center[0]);
  const longitude = toRadians(center[1]);
  const nextLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const nextLongitude = longitude + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
  );
  return [toDegrees(nextLongitude), toDegrees(nextLatitude)];
}

function circleCoordinates(center: [number, number], radiusMiles: number, steps = 112) {
  const coordinates: number[][] = [];
  for (let index = 0; index <= steps; index += 1) {
    coordinates.push(destinationPoint(center, radiusMiles, (index / steps) * Math.PI * 2));
  }
  return coordinates;
}

function driveMinutesToEstimatedRadius(minutes: number) {
  return minutes * 0.6;
}

function circleFeature(anchor: [number, number], value: number, miles: number, label: string, estimated: number, active: boolean) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [circleCoordinates(anchor, miles)] },
    properties: {
      active: active ? 1 : 0,
      label,
      bandValue: value,
      estimated,
      source: estimated ? "atlas-estimate" : "atlas-radius",
    },
  };
}

function reachGeoJson(
  anchor: [number, number] | null,
  mode: ReachMode,
  radiusMiles: number,
  driveMinutes: number,
  roadIsochrones: FeatureCollection | null,
): FeatureCollection {
  if (!anchor || mode === "off") return { type: "FeatureCollection", features: [] };

  if (mode === "radius") {
    return {
      type: "FeatureCollection",
      features: [25, 50, 75].map((value) =>
        circleFeature(anchor, value, value, `${value} mi`, 0, value === radiusMiles),
      ),
    };
  }

  const roadFeatures = Array.isArray(roadIsochrones?.features)
    ? roadIsochrones!.features
        .filter((feature) => [30, 60].includes(Number(feature?.properties?.bandValue)))
        .map((feature) => ({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            active: Number(feature.properties?.bandValue) === driveMinutes ? 1 : 0,
            estimated: 0,
            source: "openrouteservice",
          },
        }))
    : [];

  if (roadFeatures.length) {
    return {
      type: "FeatureCollection",
      features: [
        ...roadFeatures,
        circleFeature(
          anchor,
          90,
          driveMinutesToEstimatedRadius(90),
          "90 min estimate",
          1,
          driveMinutes === 90,
        ),
      ],
    };
  }

  return {
    type: "FeatureCollection",
    features: [30, 60, 90].map((value) =>
      circleFeature(
        anchor,
        value,
        driveMinutesToEstimatedRadius(value),
        `${value} min estimate`,
        1,
        value === driveMinutes,
      ),
    ),
  };
}

function anchorGeoJson(anchor: [number, number] | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: anchor ? [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [anchor[1], anchor[0]] },
      properties: {},
    }] : [],
  };
}

function latLonToVector(point: [number, number]) {
  const latitude = toRadians(point[0]);
  const longitude = toRadians(point[1]);
  return [
    Math.cos(latitude) * Math.cos(longitude),
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
  ];
}

function greatCircleCoordinates(start: [number, number], end: [number, number], steps = 44) {
  const a = latLonToVector(start);
  const b = latLonToVector(end);
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const sinOmega = Math.sin(omega);

  if (Math.abs(sinOmega) < 1e-6) return [[start[1], start[0]], [end[1], end[0]]];

  const coordinates: number[][] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const scaleA = Math.sin((1 - t) * omega) / sinOmega;
    const scaleB = Math.sin(t * omega) / sinOmega;
    const x = scaleA * a[0] + scaleB * b[0];
    const y = scaleA * a[1] + scaleB * b[1];
    const z = scaleA * a[2] + scaleB * b[2];
    coordinates.push([
      toDegrees(Math.atan2(y, x)),
      toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
    ]);
  }
  return coordinates;
}

function pointInRing(point: [number, number], ring: number[][]) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects = ((yi > y) !== (yj > y)) &&
      (x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: [number, number], geometry: any) {
  if (geometry?.type === "Polygon") {
    const rings = geometry.coordinates;
    if (!Array.isArray(rings?.[0]) || !pointInRing(point, rings[0])) return false;
    return !rings.slice(1).some((ring: number[][]) => pointInRing(point, ring));
  }
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon: number[][][]) => {
      if (!Array.isArray(polygon?.[0]) || !pointInRing(point, polygon[0])) return false;
      return !polygon.slice(1).some((ring: number[][]) => pointInRing(point, ring));
    });
  }
  return false;
}

function selectedRoadFeature(roadIsochrones: FeatureCollection | null, driveMinutes: number) {
  if (![30, 60].includes(driveMinutes)) return null;
  return roadIsochrones?.features?.find(
    (feature) => Number(feature?.properties?.bandValue) === driveMinutes,
  ) ?? null;
}

function networkArcGeoJson(
  anchor: [number, number] | null,
  areas: CoverageArea[],
  selectedService: string | null,
  mode: ReachMode,
  radiusMiles: number,
  driveMinutes: number,
  enabled: boolean,
  roadIsochrones: FeatureCollection | null,
): FeatureCollection {
  if (!anchor || !enabled) return { type: "FeatureCollection", features: [] };

  const roadFeature = mode === "drive" ? selectedRoadFeature(roadIsochrones, driveMinutes) : null;
  const maxMiles = mode === "radius"
    ? radiusMiles
    : mode === "drive"
      ? driveMinutesToEstimatedRadius(driveMinutes)
      : Number.POSITIVE_INFINITY;

  const targets = areas
    .map((area) => ({ area, miles: distanceMiles(anchor, [area.latitude, area.longitude]) }))
    .filter(({ area, miles }) => {
      if (roadFeature?.geometry) return pointInGeometry([area.longitude, area.latitude], roadFeature.geometry);
      return miles <= maxMiles;
    })
    .sort((a, b) => a.miles - b.miles)
    .slice(0, mode === "off" ? 10 : 18);

  return {
    type: "FeatureCollection",
    features: targets.map(({ area, miles }) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: greatCircleCoordinates(anchor, [area.latitude, area.longitude]),
      },
      properties: {
        coverageId: area.id,
        arcColor: colorForArea(area, selectedService),
        distanceMiles: Math.round(miles),
      },
    })),
  };
}

type AtlasMapTilerGlobeProps = {
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

export function AtlasMapTilerGlobe({
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
}: AtlasMapTilerGlobeProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const readyRef = useRef(false);
  const centerZoomRef = useRef({ center, zoom });
  const coverageRef = useRef(coverageAreas);
  const selectedServiceRef = useRef<string | null>(selectedService);
  const intelligenceRef = useRef({ searchAnchor, reachMode, radiusMiles, driveMinutes, showNetworkArcs });
  const roadIsochronesRef = useRef<FeatureCollection | null>(null);
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage, onStatusChange });
  const [selectedArea, setSelectedArea] = useState<CoverageArea | null>(null);
  const [roadIsochrones, setRoadIsochrones] = useState<FeatureCollection | null>(null);

  centerZoomRef.current = { center, zoom };
  coverageRef.current = coverageAreas;
  selectedServiceRef.current = selectedService;
  intelligenceRef.current = { searchAnchor, reachMode, radiusMiles, driveMinutes, showNetworkArcs };
  roadIsochronesRef.current = roadIsochrones;
  handlersRef.current = { onMarkerClick, onRequestCoverage, onStatusChange };

  useEffect(() => {
    setSelectedArea(null);
  }, [selectedService]);

  useEffect(() => {
    if (selectedArea && !coverageAreas.some((area) => area.id === selectedArea.id)) setSelectedArea(null);
  }, [coverageAreas, selectedArea]);

  useEffect(() => {
    if (!searchAnchor || reachMode !== "drive") {
      setRoadIsochrones(null);
      return;
    }

    const controller = new AbortController();
    void fetch("/api/routing/isochrones", {
      method: "POST",
      credentials: "include",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ latitude: searchAnchor[0], longitude: searchAnchor[1] }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing API returned ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted && data?.type === "FeatureCollection") {
          setRoadIsochrones(data as FeatureCollection);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn("Atlas road isochrones unavailable; using conservative estimate.", error);
        setRoadIsochrones(null);
      });

    return () => controller.abort();
  }, [reachMode, searchAnchor]);

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
        if (!apiKeys.length) throw new Error("No MAP_TILER_API_KEY values are available to the Atlas client build");

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
          const map = new sdk.Map({
            container: host,
            style: sdk.MapStyle.STREETS,
            center: preservedCamera?.center ?? [current.center[1], current.center[0]],
            zoom: clampZoom(preservedCamera?.zoom ?? current.zoom),
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
            projection: "globe",
            space: {
              preset: "stars",
              color: "#F8FBFF",
            },
            attributionControl: true,
          });
          mapRef.current = map;
          let fallbackScheduledForMap = false;

          map.on("load", () => {
            if (destroyed || mapRef.current !== map) return;
            const intelligence = intelligenceRef.current;
            const roadData = roadIsochronesRef.current;

            map.addSource(RING_SOURCE_ID, {
              type: "geojson",
              data: reachGeoJson(
                intelligence.searchAnchor,
                intelligence.reachMode,
                intelligence.radiusMiles,
                intelligence.driveMinutes,
                roadData,
              ),
            });

            map.addLayer({
              id: RING_FILL_LAYER_ID,
              type: "fill",
              source: RING_SOURCE_ID,
              paint: {
                "fill-color": ["case", ["==", ["get", "estimated"], 1], "#258CFF", "#00C7FF"],
                "fill-opacity": ["case", ["==", ["get", "active"], 1], 0.065, 0.014],
              },
            });

            map.addLayer({
              id: RING_GLOW_LAYER_ID,
              type: "line",
              source: RING_SOURCE_ID,
              paint: {
                "line-color": ["case", ["==", ["get", "estimated"], 1], "#4360CF", "#00C7FF"],
                "line-width": ["case", ["==", ["get", "active"], 1], 8, 4],
                "line-opacity": ["case", ["==", ["get", "active"], 1], 0.26, 0.09],
                "line-blur": 5,
              },
            });

            map.addLayer({
              id: RING_CORE_LAYER_ID,
              type: "line",
              source: RING_SOURCE_ID,
              paint: {
                "line-color": ["case", ["==", ["get", "estimated"], 1], "#9CB7FF", "#BDFBFF"],
                "line-width": ["case", ["==", ["get", "active"], 1], 1.8, 1],
                "line-opacity": ["case", ["==", ["get", "active"], 1], 0.95, 0.42],
              },
            });

            map.addSource(ARC_SOURCE_ID, {
              type: "geojson",
              data: networkArcGeoJson(
                intelligence.searchAnchor,
                coverageRef.current,
                selectedServiceRef.current,
                intelligence.reachMode,
                intelligence.radiusMiles,
                intelligence.driveMinutes,
                intelligence.showNetworkArcs,
                roadData,
              ),
            });

            map.addLayer({
              id: ARC_GLOW_LAYER_ID,
              type: "line",
              source: ARC_SOURCE_ID,
              paint: {
                "line-color": ["get", "arcColor"],
                "line-width": ["interpolate", ["linear"], ["zoom"], 1.5, 3.5, 6, 6, 10, 8],
                "line-opacity": 0.2,
                "line-blur": 4,
              },
            });

            map.addLayer({
              id: ARC_CORE_LAYER_ID,
              type: "line",
              source: ARC_SOURCE_ID,
              paint: {
                "line-color": ["get", "arcColor"],
                "line-width": ["interpolate", ["linear"], ["zoom"], 1.5, 0.8, 6, 1.25, 10, 1.7],
                "line-opacity": 0.94,
              },
            });

            map.addSource(ANCHOR_SOURCE_ID, {
              type: "geojson",
              data: anchorGeoJson(intelligence.searchAnchor),
            });

            map.addLayer({
              id: ANCHOR_GLOW_LAYER_ID,
              type: "circle",
              source: ANCHOR_SOURCE_ID,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 7, 6, 14, 10, 19],
                "circle-color": "#00C7FF",
                "circle-opacity": 0.22,
                "circle-blur": 0.72,
                "circle-stroke-width": 0,
              },
            });

            map.addLayer({
              id: ANCHOR_CORE_LAYER_ID,
              type: "circle",
              source: ANCHOR_SOURCE_ID,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 2.6, 6, 4.2, 10, 5.6],
                "circle-color": "#F4FDFF",
                "circle-opacity": 1,
                "circle-stroke-color": "#00C7FF",
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1.5, 1, 6, 1.8, 10, 2.4],
              },
            });

            map.addSource(SOURCE_ID, {
              type: "geojson",
              data: coverageGeoJson(coverageRef.current, selectedServiceRef.current),
            });

            map.addLayer({
              id: OUTER_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 3, 3, 4.5, 5, 7.5, 8, 12, 12, 17],
                "circle-color": ["get", "markerColor"],
                "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1.5, 0.025, 4, 0.055, 7, 0.1, 11, 0.13],
                "circle-blur": 0.72,
                "circle-stroke-width": 0,
              },
            });

            map.addLayer({
              id: INNER_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 2.4, 3, 3.1, 5, 4.6, 8, 7.4, 12, 10.5],
                "circle-color": ["get", "markerColor"],
                "circle-opacity": ["interpolate", ["linear"], ["zoom"], 1.5, 0.1, 4, 0.18, 7, 0.29, 11, 0.38],
                "circle-blur": 0.32,
                "circle-stroke-width": 0,
              },
            });

            map.addLayer({
              id: CORE_LAYER_ID,
              type: "circle",
              source: SOURCE_ID,
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 1.5, 1.8, 3, 2.2, 5, 2.9, 8, 4.2, 12, 5.8],
                "circle-color": ["get", "markerColor"],
                "circle-opacity": 1,
                "circle-stroke-color": "rgba(255,255,255,0.96)",
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 1.5, 0.55, 3, 0.8, 5, 1.05, 8, 1.55, 12, 2],
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

            if (shouldFailOverMapTiler(event) && keyIndex + 1 < apiKeys.length && !fallbackScheduledForMap) {
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
              fallbackTimer = window.setTimeout(() => createMap(keyIndex + 1, nextCamera), 0);
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
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
    map.stop?.();
    const nextCamera = {
      center: [center[1], center[0]],
      zoom: clampZoom(zoom),
      pitch: zoom >= 6 ? 28 : 0,
      bearing: 0,
      duration: reducedMotion ? 0 : 2600,
      curve: 1.42,
      speed: 0.72,
      essential: false,
    };
    if (typeof map.flyTo === "function") map.flyTo(nextCamera);
    else map.easeTo?.({ ...nextCamera, duration: reducedMotion ? 0 : 1100 });
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const roadData = roadIsochrones;
    map.getSource?.(SOURCE_ID)?.setData?.(coverageGeoJson(coverageAreas, selectedService));
    map.getSource?.(RING_SOURCE_ID)?.setData?.(
      reachGeoJson(searchAnchor, reachMode, radiusMiles, driveMinutes, roadData),
    );
    map.getSource?.(ANCHOR_SOURCE_ID)?.setData?.(anchorGeoJson(searchAnchor));
    map.getSource?.(ARC_SOURCE_ID)?.setData?.(networkArcGeoJson(
      searchAnchor,
      coverageAreas,
      selectedService,
      reachMode,
      radiusMiles,
      driveMinutes,
      showNetworkArcs,
      roadData,
    ));
  }, [coverageAreas, selectedService, searchAnchor, reachMode, radiusMiles, driveMinutes, showNetworkArcs, roadIsochrones]);

  const cardColor = selectedArea ? colorForArea(selectedArea, selectedService) : SERVICE_COLORS["Occupational Medicine"];
  const cardPrimaryService = selectedArea ? serviceForArea(selectedArea, selectedService) : "";
  const cardDistance = selectedArea && searchAnchor
    ? distanceMiles(searchAnchor, [selectedArea.latitude, selectedArea.longitude])
    : null;

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
            {cardDistance !== null ? ` · ${Math.round(cardDistance)} mi from search` : ""}
          </p>

          <div className="atlas-coverage-card-services">
            {selectedArea.services.map((service) => {
              const serviceColor = SERVICE_COLORS[service] ?? SERVICE_COLORS["Specialty Services"];
              return (
                <span
                  key={service}
                  style={{
                    borderColor: hexToCssRgba(serviceColor, 0.32),
                    background: hexToCssRgba(serviceColor, 0.12),
                    color: serviceColor,
                  }}
                >
                  {service}
                </span>
              );
            })}
          </div>

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
