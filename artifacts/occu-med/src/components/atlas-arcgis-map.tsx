import { useEffect, useRef, useState } from "react";

const ARCGIS_WEBMAP_ID = "7378ae8b471940cb9f9d114b67cd09b8";
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;

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

/**
 * Every Atlas service has its own stable color. These colors are deliberately
 * not shared between categories so a client can visually learn the map.
 */
export const SERVICE_COLORS: Record<string, string> = {
  Dental: "#F06B63",
  "Chest X-Ray": "#3B82F6",
  "B-Reader": "#1D4ED8",
  Spirometry: "#14B8A6",
  "Pulmonary Function Testing": "#0F766E",
  "Drug Screen": "#7C3AED",
  "DOT Physical": "#16A34A",
  Audiogram: "#D97706",
  EKG: "#E11D48",
  "Treadmill Stress Test": "#BE123C",
  "Laboratory Services": "#4F46E5",
  Titers: "#C026D3",
  Vaccinations: "#059669",
  "Physical Examination": "#0891B2",
  "Vision Testing": "#0284C7",
  "Occupational Medicine": "#2563EB",
  "Specialty Services": "#EA580C",
};

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

function hexToRgba(hex: string, alpha = 1) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
    alpha,
  ];
}

function hexToCssRgba(hex: string, alpha = 1) {
  const [r, g, b] = hexToRgba(hex, alpha);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getArcgisLoader(): ArcgisLoader | null {
  if (typeof $arcgis === "undefined" || typeof $arcgis?.import !== "function") return null;
  return $arcgis;
}

function waitForArcgisLoader(timeoutMs = 30_000): Promise<ArcgisLoader> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      const loader = getArcgisLoader();
      if (loader) {
        resolve(loader);
        return;
      }
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
  if (Array.isArray(result)) return result;
  return [result];
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function applyViewConstraints(view: any) {
  const existing = view.constraints || {};
  view.constraints = {
    ...existing,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    rotationEnabled: false,
    snapToZoom: false,
  };
}

function applyHighPixelQuality(view: any, mapEl: any) {
  try {
    if ("qualityProfile" in view) view.qualityProfile = "high";
    if (mapEl && "qualityProfile" in mapEl) mapEl.qualityProfile = "high";
  } catch {
    // Older ArcGIS builds may not expose this setting.
  }
  try {
    view.resize?.();
  } catch {
    // Ignore resize races while the custom element is booting.
  }
}

/**
 * The ArcGIS WebMap is used only for its basemap. Its historical operational
 * point layers are explicitly removed because Atlas owns the provider graphics.
 * This guarantees that every visible coverage dot is clickable Atlas data.
 */
function removeInheritedOperationalLayers(view: any, mapEl: any) {
  const map = view?.map ?? mapEl?.map;
  try {
    map?.layers?.removeAll?.();
  } catch {
    const layers = map?.layers?.toArray?.() ?? [];
    for (const layer of layers) {
      try {
        map?.remove?.(layer);
      } catch {
        // Ignore an individual legacy layer that is already detached.
      }
    }
  }
}

function graphicAttributes(area: CoverageArea) {
  return {
    ...area,
    coverageId: area.id,
    services: area.services.join("|"),
  };
}

function syncCoverageGraphics(
  layer: any,
  modules: { Graphic: any; Point: any; SimpleMarkerSymbol: any },
  areas: CoverageArea[],
  selectedService: string | null,
) {
  const { Graphic, Point, SimpleMarkerSymbol } = modules;
  layer.removeAll();

  const graphics: any[] = [];
  for (const area of areas) {
    const color = colorForArea(area, selectedService);
    const point = new Point({ longitude: area.longitude, latitude: area.latitude });
    const attrs = graphicAttributes(area);

    // Wide, low-opacity outer halo.
    graphics.push(new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: hexToRgba(color, 0.10),
        size: 30,
        outline: { color: hexToRgba(color, 0), width: 0 },
      }),
      attributes: { ...attrs, markerPart: "outer-halo" },
    }));

    // Tighter halo creates the luminous/glow effect without hiding geography.
    graphics.push(new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color: hexToRgba(color, 0.24),
        size: 21,
        outline: { color: hexToRgba(color, 0), width: 0 },
      }),
      attributes: { ...attrs, markerPart: "inner-halo" },
    }));

    // Crisp interactive core.
    graphics.push(new Graphic({
      geometry: point,
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color,
        size: 11.5,
        outline: { color: [255, 255, 255, 0.98], width: 2.2 },
      }),
      attributes: { ...attrs, markerPart: "core" },
    }));
  }

  if (typeof layer.addMany === "function") layer.addMany(graphics);
  else for (const graphic of graphics) layer.add(graphic);
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

type AtlasArcgisMapProps = {
  center: [number, number];
  zoom: number;
  coverageAreas: CoverageArea[];
  selectedService?: string | null;
  onMarkerClick?: (area: CoverageArea) => void;
  onRequestCoverage?: (area: CoverageArea) => void;
  onStatusChange?: (status: "loading" | "ready" | "error", message?: string) => void;
};

export function AtlasArcgisMap({
  center,
  zoom,
  coverageAreas,
  selectedService = null,
  onMarkerClick,
  onRequestCoverage,
  onStatusChange,
}: AtlasArcgisMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<any>(null);
  const viewRef = useRef<any>(null);
  const graphicsLayerRef = useRef<any>(null);
  const modulesRef = useRef<{ Graphic: any; Point: any; SimpleMarkerSymbol: any } | null>(null);
  const centerZoomRef = useRef({ center, zoom });
  const coverageRef = useRef(coverageAreas);
  const selectedServiceRef = useRef<string | null>(selectedService);
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage });
  const [selectedArea, setSelectedArea] = useState<CoverageArea | null>(null);

  centerZoomRef.current = { center, zoom };
  coverageRef.current = coverageAreas;
  selectedServiceRef.current = selectedService;
  handlersRef.current = { onMarkerClick, onRequestCoverage };

  useEffect(() => {
    setSelectedArea(null);
  }, [selectedService]);

  useEffect(() => {
    let destroyed = false;
    let clickHandle: { remove: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const host = hostRef.current;
    if (!host) return;

    onStatusChange?.("loading");
    host.dataset.arcgisStatus = "loading";
    host.classList.add("atlas-arcgis-loading");
    host.classList.remove("atlas-arcgis-ready", "atlas-arcgis-error");
    host.replaceChildren();

    void (async () => {
      try {
        const loader = await waitForArcgisLoader();
        if (destroyed) return;

        const [esriConfig] = await importModules(loader, ["@arcgis/core/config.js"]);
        const apiKey = String(import.meta.env.VITE_ARCGIS_API_KEY || "").trim();
        if (apiKey) esriConfig.apiKey = apiKey;

        if (typeof customElements !== "undefined" && customElements.get("arcgis-map") == null) {
          await Promise.race([
            customElements.whenDefined("arcgis-map"),
            new Promise((_, reject) => window.setTimeout(
              () => reject(new Error("arcgis-map custom element did not register")),
              20_000,
            )),
          ]);
        }
        if (destroyed) return;

        const [GraphicsLayer, Graphic, Point, SimpleMarkerSymbol] = await importModules(loader, [
          "@arcgis/core/layers/GraphicsLayer.js",
          "@arcgis/core/Graphic.js",
          "@arcgis/core/geometry/Point.js",
          "@arcgis/core/symbols/SimpleMarkerSymbol.js",
        ]);
        if (destroyed) return;
        modulesRef.current = { Graphic, Point, SimpleMarkerSymbol };

        const mapEl = document.createElement("arcgis-map") as any;
        mapEl.setAttribute("item-id", ARCGIS_WEBMAP_ID);
        mapEl.style.width = "100%";
        mapEl.style.height = "100%";
        mapEl.style.display = "block";
        try {
          mapEl.qualityProfile = "high";
        } catch {
          // Ignore unsupported quality profile.
        }
        host.appendChild(mapEl);
        mapElRef.current = mapEl;

        if (typeof mapEl.viewOnReady === "function") {
          await mapEl.viewOnReady();
        } else {
          const readyDeadline = Date.now() + 25_000;
          while (!mapEl.view && Date.now() < readyDeadline) {
            await new Promise((r) => window.setTimeout(r, 50));
          }
          if (!mapEl.view) throw new Error("arcgis-map view did not become ready");
          await mapEl.view.when();
        }
        if (destroyed) return;

        const view = mapEl.view;
        if (!view) throw new Error("arcgis-map did not expose a MapView");
        viewRef.current = view;
        view.popupEnabled = false;

        // Critical: eliminate historical WebMap points. Keep only the basemap.
        removeInheritedOperationalLayers(view, mapEl);
        applyViewConstraints(view);
        applyHighPixelQuality(view, mapEl);

        const { center: c, zoom: z } = centerZoomRef.current;
        try {
          await view.goTo({ center: [c[1], c[0]], zoom: clampZoom(z) }, { duration: 0 });
        } catch {
          // Ignore interrupted initial camera movement.
        }

        const graphicsLayer = new GraphicsLayer({
          id: "coverage-areas",
          title: "Occu-Med Atlas Coverage",
          listMode: "hide",
        });
        if (view.map?.add) view.map.add(graphicsLayer);
        else if (mapEl.map?.add) mapEl.map.add(graphicsLayer);
        else throw new Error("Could not attach Atlas coverage layer to the WebMap");

        graphicsLayerRef.current = graphicsLayer;
        syncCoverageGraphics(
          graphicsLayer,
          modulesRef.current,
          coverageRef.current,
          selectedServiceRef.current,
        );

        clickHandle = view.on("click", async (event: any) => {
          const hit = await view.hitTest(event, { include: [graphicsLayerRef.current] });
          const result = hit?.results?.find(
            (r: any) => r.graphic?.layer === graphicsLayerRef.current && r.graphic?.attributes?.coverageId,
          );
          if (!result?.graphic) {
            setSelectedArea(null);
            return;
          }

          const area = areaFromGraphic(result.graphic);
          handlersRef.current.onMarkerClick?.(area);
          setSelectedArea(area);
        });

        resizeObserver = new ResizeObserver(() => view.resize?.());
        resizeObserver.observe(host);

        host.classList.remove("atlas-arcgis-loading", "atlas-arcgis-error");
        host.classList.add("atlas-arcgis-ready");
        host.dataset.arcgisStatus = "ready";
        host.dataset.arcgisWebmapId = ARCGIS_WEBMAP_ID;
        delete host.dataset.arcgisError;
        onStatusChange?.("ready");
      } catch (error: unknown) {
        if (destroyed) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Occu-Med Atlas ArcGIS WebMap failed to load.", error);
        host.classList.remove("atlas-arcgis-loading", "atlas-arcgis-ready");
        host.classList.add("atlas-arcgis-error");
        host.dataset.arcgisStatus = "error";
        host.dataset.arcgisError = message.slice(0, 240);
        onStatusChange?.("error", message);
      }
    })();

    return () => {
      destroyed = true;
      clickHandle?.remove?.();
      resizeObserver?.disconnect();
      try {
        mapElRef.current?.remove?.();
      } catch {
        // Ignore already-removed custom element.
      }
      mapElRef.current = null;
      viewRef.current = null;
      graphicsLayerRef.current = null;
      modulesRef.current = null;
      host.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ArcGIS host is mounted once.
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    void view.goTo(
      { center: [center[1], center[0]], zoom: clampZoom(zoom) },
      { duration: 900 },
    ).catch(() => {
      // Ignore cancelled camera animations.
    });
  }, [center, zoom]);

  useEffect(() => {
    const layer = graphicsLayerRef.current;
    const modules = modulesRef.current;
    if (!layer || !modules) return;
    syncCoverageGraphics(layer, modules, coverageAreas, selectedService);
  }, [coverageAreas, selectedService]);

  const cardColor = selectedArea ? colorForArea(selectedArea, selectedService) : SERVICE_COLORS["Occupational Medicine"];
  const cardPrimaryService = selectedArea ? serviceForArea(selectedArea, selectedService) : "";

  return (
    <>
      <div
        ref={hostRef}
        className="atlas-map atlas-arcgis-map"
        role="application"
        aria-label="Occu-Med coverage map"
      />

      {selectedArea && (
        <aside
          className="atlas-coverage-card"
          aria-label={`Coverage in ${selectedArea.city}`}
          style={{ "--coverage-accent": cardColor } as React.CSSProperties}
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
