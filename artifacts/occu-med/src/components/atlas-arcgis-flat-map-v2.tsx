import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SERVICE_COLORS, SERVICE_ORDER } from "@/components/atlas-service-palette";

const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const EARTH_RADIUS_MILES = 3958.8;

type ReachMode = "off" | "radius" | "drive";
type FeatureCollection = { type: "FeatureCollection"; features: any[]; [key: string]: unknown };

type ArcgisLoader = {
  import: (moduleIds: string | string[]) => Promise<any>;
};

declare const $arcgis: ArcgisLoader | undefined;

export type CoverageArea = {
  id: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  services: string[];
  availability: "coordination_available";
};

type Modules = {
  Graphic: any;
  Point: any;
  Polygon: any;
  Polyline: any;
  SimpleMarkerSymbol: any;
  SimpleFillSymbol: any;
  SimpleLineSymbol: any;
};

function getArcgisLoader(): ArcgisLoader | null {
  if (typeof $arcgis === "undefined" || typeof $arcgis?.import !== "function") return null;
  return $arcgis;
}

function waitForArcgisLoader(timeoutMs = 30_000): Promise<ArcgisLoader> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const loader = getArcgisLoader();
      if (loader) return resolve(loader);
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("ArcGIS Maps SDK did not expose the $arcgis module loader"));
        return;
      }
      window.setTimeout(check, 40);
    };
    check();
  });
}

async function importModules(loader: ArcgisLoader, ids: string[]) {
  const result = await loader.import(ids);
  return Array.isArray(result) ? result : [result];
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function serviceForArea(area: CoverageArea, selectedService: string | null) {
  if (selectedService && area.services.includes(selectedService)) return selectedService;
  return SERVICE_ORDER.find((service) => area.services.includes(service)) ?? "Specialty Services";
}

function colorForArea(area: CoverageArea, selectedService: string | null) {
  return SERVICE_COLORS[serviceForArea(area, selectedService)] ?? SERVICE_COLORS["Specialty Services"];
}

function hexToRgba(hex: string, alpha = 1) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

function hexToCssRgba(hex: string, alpha = 1) {
  const [r, g, b] = hexToRgba(hex, alpha);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function graphicAttributes(area: CoverageArea) {
  return {
    ...area,
    coverageId: area.id,
    services: area.services.join("|"),
  };
}

function areaFromGraphic(graphic: any): CoverageArea {
  const attrs = graphic.attributes as CoverageArea & { coverageId: string };
  return {
    id: attrs.coverageId || attrs.id,
    city: attrs.city,
    region: attrs.region,
    country: attrs.country,
    latitude: Number(attrs.latitude),
    longitude: Number(attrs.longitude),
    services: Array.isArray(attrs.services)
      ? attrs.services
      : String(attrs.services || "").split("|").filter(Boolean),
    availability: "coordination_available",
  };
}

function markerProfile(zoom: number) {
  if (zoom < 4) return { outer: 0, inner: 0, core: 4.2, outline: 0.8 };
  if (zoom < 6.5) return { outer: 9.5, inner: 6.2, core: 4.8, outline: 1.1 };
  return { outer: 16, inner: 10, core: 6.2, outline: 1.7 };
}

function zoomBand(zoom: number) {
  if (zoom < 4) return "world";
  if (zoom < 6.5) return "regional";
  return "local";
}

function syncProviderGraphics(
  layer: any,
  modules: Modules,
  areas: CoverageArea[],
  selectedService: string | null,
  zoom: number,
) {
  const { Graphic, Point, SimpleMarkerSymbol } = modules;
  const profile = markerProfile(zoom);
  layer.removeAll();
  const graphics: any[] = [];

  for (const area of areas) {
    const color = colorForArea(area, selectedService);
    const point = new Point({ longitude: area.longitude, latitude: area.latitude });
    const attrs = graphicAttributes(area);

    if (profile.outer > 0) {
      graphics.push(new Graphic({
        geometry: point,
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: hexToRgba(color, 0.08),
          size: profile.outer,
          outline: { color: hexToRgba(color, 0), width: 0 },
        }),
        attributes: { ...attrs, markerPart: "outer" },
      }));
      graphics.push(new Graphic({
        geometry: point,
        symbol: new SimpleMarkerSymbol({
          style: "circle",
          color: hexToRgba(color, 0.26),
          size: profile.inner,
          outline: { color: hexToRgba(color, 0), width: 0 },
        }),
        attributes: { ...attrs, markerPart: "inner" },
      }));
    }

    graphics.push(new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color,
        size: profile.core,
        outline: { color: [255, 255, 255, 0.94], width: profile.outline },
      }),
      attributes: { ...attrs, markerPart: "core" },
    }));
  }

  if (typeof layer.addMany === "function") layer.addMany(graphics);
  else for (const graphic of graphics) layer.add(graphic);
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

function greatCircleCoordinates(start: [number, number], end: [number, number], steps = 44) {
  const latLonToVector = (point: [number, number]) => {
    const latitude = toRadians(point[0]);
    const longitude = toRadians(point[1]);
    return [
      Math.cos(latitude) * Math.cos(longitude),
      Math.cos(latitude) * Math.sin(longitude),
      Math.sin(latitude),
    ];
  };
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

function featureRings(geometry: any): number[][][] {
  if (geometry?.type === "Polygon") return geometry.coordinates ?? [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates ?? []).flat();
  return [];
}

function selectedRoadFeature(roadIsochrones: FeatureCollection | null, driveMinutes: number) {
  if (![30, 60].includes(driveMinutes)) return null;
  return roadIsochrones?.features?.find(
    (feature) => Number(feature?.properties?.bandValue) === driveMinutes,
  ) ?? null;
}

function syncIntelligenceGraphics(
  layer: any,
  modules: Modules,
  areas: CoverageArea[],
  selectedService: string | null,
  anchor: [number, number] | null,
  reachMode: ReachMode,
  radiusMiles: number,
  driveMinutes: number,
  showNetworkArcs: boolean,
  roadIsochrones: FeatureCollection | null,
) {
  const { Graphic, Point, Polygon, Polyline, SimpleMarkerSymbol, SimpleFillSymbol, SimpleLineSymbol } = modules;
  layer.removeAll();
  if (!anchor) return;

  const graphics: any[] = [];
  const roadFeatures = Array.isArray(roadIsochrones?.features)
    ? roadIsochrones!.features.filter((feature) => [30, 60].includes(Number(feature?.properties?.bandValue)))
    : [];

  const reachFeatures: Array<{ value: number; geometry: any; estimated: boolean }> = [];
  if (reachMode === "radius") {
    for (const value of [25, 50, 75]) {
      reachFeatures.push({
        value,
        estimated: false,
        geometry: { type: "Polygon", coordinates: [circleCoordinates(anchor, value)] },
      });
    }
  } else if (reachMode === "drive") {
    if (roadFeatures.length) {
      for (const feature of roadFeatures) {
        reachFeatures.push({
          value: Number(feature.properties?.bandValue),
          estimated: false,
          geometry: feature.geometry,
        });
      }
    } else {
      for (const value of [30, 60]) {
        reachFeatures.push({
          value,
          estimated: true,
          geometry: { type: "Polygon", coordinates: [circleCoordinates(anchor, driveMinutesToEstimatedRadius(value))] },
        });
      }
    }
    reachFeatures.push({
      value: 90,
      estimated: true,
      geometry: { type: "Polygon", coordinates: [circleCoordinates(anchor, driveMinutesToEstimatedRadius(90))] },
    });
  }

  for (const feature of reachFeatures) {
    const active = feature.value === (reachMode === "radius" ? radiusMiles : driveMinutes);
    const color = feature.estimated ? "#258CFF" : "#00C7FF";
    const polygon = new Polygon({ rings: featureRings(feature.geometry), spatialReference: { wkid: 4326 } });
    graphics.push(new Graphic({
      geometry: polygon,
      symbol: new SimpleFillSymbol({
        color: hexToRgba(color, active ? 0.07 : 0.018),
        outline: { color: hexToRgba(color, active ? 0.2 : 0.08), width: active ? 5 : 2 },
      }),
    }));
    graphics.push(new Graphic({
      geometry: polygon,
      symbol: new SimpleFillSymbol({
        color: [0, 0, 0, 0],
        outline: { color: hexToRgba(active ? "#D8FBFF" : color, active ? 0.92 : 0.38), width: active ? 1.7 : 0.9 },
      }),
    }));
  }

  const anchorPoint = new Point({ longitude: anchor[1], latitude: anchor[0] });
  graphics.push(new Graphic({
    geometry: anchorPoint,
    symbol: new SimpleMarkerSymbol({ style: "circle", color: [0, 199, 255, 0.12], size: 24, outline: { color: [0, 199, 255, 0], width: 0 } }),
  }));
  graphics.push(new Graphic({
    geometry: anchorPoint,
    symbol: new SimpleMarkerSymbol({ style: "circle", color: [235, 253, 255, 1], size: 7, outline: { color: [0, 199, 255, 0.95], width: 2 } }),
  }));

  if (showNetworkArcs && reachMode !== "off") {
    const roadFeature = reachMode === "drive" ? selectedRoadFeature(roadIsochrones, driveMinutes) : null;
    const maxMiles = reachMode === "radius" ? radiusMiles : driveMinutesToEstimatedRadius(driveMinutes);
    const targets = areas
      .map((area) => ({ area, miles: distanceMiles(anchor, [area.latitude, area.longitude]) }))
      .filter(({ area, miles }) => {
        if (roadFeature?.geometry) return pointInGeometry([area.longitude, area.latitude], roadFeature.geometry);
        return miles <= maxMiles;
      })
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 18);

    for (const { area } of targets) {
      const color = colorForArea(area, selectedService);
      const geometry = new Polyline({
        paths: [greatCircleCoordinates(anchor, [area.latitude, area.longitude])],
        spatialReference: { wkid: 4326 },
      });
      graphics.push(new Graphic({
        geometry,
        symbol: new SimpleLineSymbol({ color: hexToRgba(color, 0.16), width: 6 }),
      }));
      graphics.push(new Graphic({
        geometry,
        symbol: new SimpleLineSymbol({ color: hexToRgba(color, 0.92), width: 1.35 }),
      }));
    }
  }

  if (typeof layer.addMany === "function") layer.addMany(graphics);
  else for (const graphic of graphics) layer.add(graphic);
}

type AtlasArcgisFlatMapProps = {
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

export function AtlasArcgisFlatMap({
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
}: AtlasArcgisFlatMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<any>(null);
  const viewRef = useRef<any>(null);
  const providerLayerRef = useRef<any>(null);
  const intelligenceLayerRef = useRef<any>(null);
  const modulesRef = useRef<Modules | null>(null);
  const coverageRef = useRef(coverageAreas);
  const selectedServiceRef = useRef(selectedService);
  const intelligenceRef = useRef({ searchAnchor, reachMode, radiusMiles, driveMinutes, showNetworkArcs });
  const roadIsochronesRef = useRef<FeatureCollection | null>(null);
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage, onStatusChange });
  const [selectedArea, setSelectedArea] = useState<CoverageArea | null>(null);
  const [roadIsochrones, setRoadIsochrones] = useState<FeatureCollection | null>(null);

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
        if (!controller.signal.aborted && data?.type === "FeatureCollection") setRoadIsochrones(data as FeatureCollection);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn("ArcGIS road isochrones unavailable; using estimate.", error);
          setRoadIsochrones(null);
        }
      });
    return () => controller.abort();
  }, [reachMode, searchAnchor]);

  useEffect(() => {
    let destroyed = false;
    let clickHandle: { remove: () => void } | null = null;
    let zoomHandle: { remove: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const host = hostRef.current;
    if (!host) return;

    handlersRef.current.onStatusChange?.("loading");
    host.replaceChildren();

    void (async () => {
      try {
        const loader = await waitForArcgisLoader();
        const [esriConfig] = await importModules(loader, ["@arcgis/core/config.js"]);
        const apiKey = String(import.meta.env.VITE_ARCGIS_API_KEY || "").trim();
        if (apiKey) esriConfig.apiKey = apiKey;

        if (typeof customElements !== "undefined" && customElements.get("arcgis-map") == null) {
          await Promise.race([
            customElements.whenDefined("arcgis-map"),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error("arcgis-map custom element did not register")), 20_000)),
          ]);
        }
        if (destroyed) return;

        const [GraphicsLayer, Graphic, Point, Polygon, Polyline, SimpleMarkerSymbol, SimpleFillSymbol, SimpleLineSymbol, reactiveUtils] = await importModules(loader, [
          "@arcgis/core/layers/GraphicsLayer.js",
          "@arcgis/core/Graphic.js",
          "@arcgis/core/geometry/Point.js",
          "@arcgis/core/geometry/Polygon.js",
          "@arcgis/core/geometry/Polyline.js",
          "@arcgis/core/symbols/SimpleMarkerSymbol.js",
          "@arcgis/core/symbols/SimpleFillSymbol.js",
          "@arcgis/core/symbols/SimpleLineSymbol.js",
          "@arcgis/core/core/reactiveUtils.js",
        ]);
        if (destroyed) return;

        const modules: Modules = { Graphic, Point, Polygon, Polyline, SimpleMarkerSymbol, SimpleFillSymbol, SimpleLineSymbol };
        modulesRef.current = modules;

        const mapEl = document.createElement("arcgis-map") as any;
        mapEl.setAttribute("basemap", "topo-vector");
        mapEl.style.width = "100%";
        mapEl.style.height = "100%";
        mapEl.style.display = "block";
        host.appendChild(mapEl);
        mapElRef.current = mapEl;

        if (typeof mapEl.viewOnReady === "function") await mapEl.viewOnReady();
        else {
          const deadline = Date.now() + 25_000;
          while (!mapEl.view && Date.now() < deadline) await new Promise((resolve) => window.setTimeout(resolve, 50));
          if (!mapEl.view) throw new Error("arcgis-map view did not become ready");
          await mapEl.view.when();
        }
        if (destroyed) return;

        const view = mapEl.view;
        viewRef.current = view;
        view.popupEnabled = false;
        view.constraints = {
          ...(view.constraints ?? {}),
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          rotationEnabled: false,
          snapToZoom: false,
        };
        try {
          if ("qualityProfile" in view) view.qualityProfile = "high";
          if ("qualityProfile" in mapEl) mapEl.qualityProfile = "high";
        } catch {
          // Optional quality profile.
        }

        try {
          await view.goTo({ center: [center[1], center[0]], zoom: clampZoom(zoom) }, { duration: 0 });
        } catch {
          // Initial navigation can be interrupted during layout.
        }

        const intelligenceLayer = new GraphicsLayer({ id: "atlas-intelligence", listMode: "hide" });
        const providerLayer = new GraphicsLayer({ id: "atlas-coverage", listMode: "hide" });
        view.map.add(intelligenceLayer);
        view.map.add(providerLayer);
        intelligenceLayerRef.current = intelligenceLayer;
        providerLayerRef.current = providerLayer;

        syncIntelligenceGraphics(
          intelligenceLayer,
          modules,
          coverageRef.current,
          selectedServiceRef.current,
          intelligenceRef.current.searchAnchor,
          intelligenceRef.current.reachMode,
          intelligenceRef.current.radiusMiles,
          intelligenceRef.current.driveMinutes,
          intelligenceRef.current.showNetworkArcs,
          roadIsochronesRef.current,
        );
        syncProviderGraphics(providerLayer, modules, coverageRef.current, selectedServiceRef.current, Number(view.zoom ?? zoom));

        clickHandle = view.on("click", async (event: any) => {
          const hit = await view.hitTest(event, { include: [providerLayerRef.current] });
          const result = hit?.results?.find((item: any) => item.graphic?.attributes?.coverageId);
          if (!result?.graphic) {
            setSelectedArea(null);
            return;
          }
          const area = areaFromGraphic(result.graphic);
          handlersRef.current.onMarkerClick?.(area);
          setSelectedArea(area);
        });

        let lastBand = zoomBand(Number(view.zoom ?? zoom));
        if (reactiveUtils?.watch) {
          zoomHandle = reactiveUtils.watch(
            () => zoomBand(Number(view.zoom ?? zoom)),
            (nextBand: string) => {
              if (nextBand === lastBand || !providerLayerRef.current || !modulesRef.current) return;
              lastBand = nextBand;
              syncProviderGraphics(
                providerLayerRef.current,
                modulesRef.current,
                coverageRef.current,
                selectedServiceRef.current,
                Number(view.zoom ?? zoom),
              );
            },
          );
        }

        resizeObserver = new ResizeObserver(() => view.resize?.());
        resizeObserver.observe(host);
        handlersRef.current.onStatusChange?.("ready");
      } catch (error: unknown) {
        if (destroyed) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Occu-Med Atlas ArcGIS map failed to load.", error);
        handlersRef.current.onStatusChange?.("error", message);
      }
    })();

    return () => {
      destroyed = true;
      clickHandle?.remove?.();
      zoomHandle?.remove?.();
      resizeObserver?.disconnect();
      try { mapElRef.current?.remove?.(); } catch { /* already removed */ }
      mapElRef.current = null;
      viewRef.current = null;
      providerLayerRef.current = null;
      intelligenceLayerRef.current = null;
      modulesRef.current = null;
      host.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount ArcGIS host once.
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    void view.goTo({ center: [center[1], center[0]], zoom: clampZoom(zoom) }, { duration: 900 }).catch(() => undefined);
  }, [center, zoom]);

  useEffect(() => {
    const layer = providerLayerRef.current;
    const modules = modulesRef.current;
    if (!layer || !modules) return;
    syncProviderGraphics(layer, modules, coverageAreas, selectedService, Number(viewRef.current?.zoom ?? zoom));
  }, [coverageAreas, selectedService, zoom]);

  useEffect(() => {
    const layer = intelligenceLayerRef.current;
    const modules = modulesRef.current;
    if (!layer || !modules) return;
    syncIntelligenceGraphics(
      layer,
      modules,
      coverageAreas,
      selectedService,
      searchAnchor,
      reachMode,
      radiusMiles,
      driveMinutes,
      showNetworkArcs,
      roadIsochrones,
    );
  }, [coverageAreas, selectedService, searchAnchor, reachMode, radiusMiles, driveMinutes, showNetworkArcs, roadIsochrones]);

  const cardColor = selectedArea ? colorForArea(selectedArea, selectedService) : SERVICE_COLORS["Occupational Medicine"];
  const cardPrimaryService = selectedArea ? serviceForArea(selectedArea, selectedService) : "";
  const cardDistance = selectedArea && searchAnchor
    ? distanceMiles(searchAnchor, [selectedArea.latitude, selectedArea.longitude])
    : null;

  return (
    <>
      <div ref={hostRef} className="atlas-map atlas-arcgis-map atlas-arcgis-map-v2" role="application" aria-label="Occu-Med coverage map" />

      {selectedArea && (
        <aside
          className="atlas-coverage-card"
          aria-label={`Coverage in ${selectedArea.city}`}
          style={{ "--coverage-accent": cardColor } as CSSProperties}
        >
          <button type="button" className="atlas-coverage-card-close" aria-label="Close coverage details" onClick={() => setSelectedArea(null)}>×</button>
          <div className="atlas-coverage-card-accent" />
          <div className="atlas-coverage-card-kicker"><span className="atlas-coverage-card-pip" />{cardPrimaryService}</div>
          <h2>Coverage available</h2>
          <p className="atlas-coverage-card-place">
            {selectedArea.city}{selectedArea.region ? `, ${selectedArea.region}` : ""}
            {selectedArea.country ? ` · ${selectedArea.country}` : ""}
            {cardDistance !== null ? ` · ${Math.round(cardDistance)} mi from search` : ""}
          </p>
          <div className="atlas-coverage-card-services">
            {selectedArea.services.map((service) => {
              const color = SERVICE_COLORS[service] ?? SERVICE_COLORS["Specialty Services"];
              return (
                <span key={service} style={{ borderColor: hexToCssRgba(color, 0.32), background: hexToCssRgba(color, 0.12), color }}>
                  {service}
                </span>
              );
            })}
          </div>
          <button type="button" className="atlas-coverage-card-action" onClick={() => handlersRef.current.onRequestCoverage?.(selectedArea)}>
            Request confirmation <span aria-hidden="true">→</span>
          </button>
        </aside>
      )}
    </>
  );
}
