import { useEffect, useRef } from "react";

const ARCGIS_WEBMAP_ID = "7378ae8b471940cb9f9d114b67cd09b8";

/** Floor zoom — matches the default world overview; blocks further zoom-out into empty tiles. */
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

const SERVICE_COLORS: Record<string, string> = {
  Dental: "#f07167",
  "Chest X-Ray": "#4f8fcf",
  "B-Reader": "#4f8fcf",
  Spirometry: "#2a9d8f",
  "Pulmonary Function Testing": "#2a9d8f",
  "Drug Screen": "#7b61a8",
  "DOT Physical": "#3a9b6f",
  Audiogram: "#d08a38",
  EKG: "#d95d67",
  "Treadmill Stress Test": "#d95d67",
  "Laboratory Services": "#7b61a8",
  Titers: "#7b61a8",
  Vaccinations: "#3a9b6f",
  "Physical Examination": "#3a9b6f",
  "Vision Testing": "#4f8fcf",
  "Occupational Medicine": "#346b87",
  "Specialty Services": "#6b7280",
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

/** Prefer the densest pixel sampling ArcGIS will give on this device. */
function applyHighPixelQuality(view: any, mapEl: any) {
  try {
    // ArcGIS quality profile: high = sharper labels, denser features, better AA.
    if ("qualityProfile" in view) {
      view.qualityProfile = "high";
    }
    if (mapEl && "qualityProfile" in mapEl) {
      mapEl.qualityProfile = "high";
    }
  } catch {
    // older builds may not expose this
  }

  // Force a resize so the view re-samples at devicePixelRatio after profile change.
  try {
    view.resize?.();
  } catch {
    // ignore
  }
}

function syncCoverageGraphics(
  layer: any,
  modules: { Graphic: any; Point: any; SimpleMarkerSymbol: any },
  areas: CoverageArea[],
) {
  const { Graphic, Point, SimpleMarkerSymbol } = modules;
  layer.removeAll();

  for (const area of areas) {
    const primaryService = area.services[0] ?? "Specialty Services";
    const color = SERVICE_COLORS[primaryService] ?? SERVICE_COLORS["Specialty Services"];
    const graphic = new Graphic({
      geometry: new Point({
        longitude: area.longitude,
        latitude: area.latitude,
      }),
      symbol: new SimpleMarkerSymbol({
        style: "circle",
        color,
        size: 11,
        outline: {
          color: [255, 255, 255, 0.95],
          width: 2,
        },
      }),
      attributes: {
        ...area,
        coverageId: area.id,
        services: area.services.join("|"),
      },
    });
    layer.add(graphic);
  }
}

type AtlasArcgisMapProps = {
  center: [number, number];
  zoom: number;
  coverageAreas: CoverageArea[];
  onMarkerClick?: (area: CoverageArea) => void;
  onRequestCoverage?: (area: CoverageArea) => void;
  onStatusChange?: (status: "loading" | "ready" | "error", message?: string) => void;
};

export function AtlasArcgisMap({
  center,
  zoom,
  coverageAreas,
  onMarkerClick,
  onRequestCoverage,
  onStatusChange,
}: AtlasArcgisMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<any>(null);
  const viewRef = useRef<any>(null);
  const graphicsLayerRef = useRef<any>(null);
  const modulesRef = useRef<{
    Graphic: any;
    Point: any;
    SimpleMarkerSymbol: any;
  } | null>(null);
  const centerZoomRef = useRef({ center, zoom });
  const coverageRef = useRef(coverageAreas);
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage });

  centerZoomRef.current = { center, zoom };
  coverageRef.current = coverageAreas;
  handlersRef.current = { onMarkerClick, onRequestCoverage };

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
        if (apiKey) {
          esriConfig.apiKey = apiKey;
        }

        if (typeof customElements !== "undefined" && customElements.get("arcgis-map") == null) {
          await Promise.race([
            customElements.whenDefined("arcgis-map"),
            new Promise((_, reject) =>
              window.setTimeout(
                () => reject(new Error("arcgis-map custom element did not register")),
                20_000,
              ),
            ),
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
        // Hint high quality before the internal view boots when supported.
        try {
          mapEl.qualityProfile = "high";
        } catch {
          // ignore
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
          if (!mapEl.view) {
            throw new Error("arcgis-map view did not become ready");
          }
          await mapEl.view.when();
        }
        if (destroyed) return;

        const view = mapEl.view;
        if (!view) {
          throw new Error("arcgis-map did not expose a MapView");
        }
        viewRef.current = view;

        applyViewConstraints(view);
        applyHighPixelQuality(view, mapEl);

        const { center: c, zoom: z } = centerZoomRef.current;
        try {
          await view.goTo({ center: [c[1], c[0]], zoom: clampZoom(z) }, { duration: 0 });
        } catch {
          // ignore
        }

        applyViewConstraints(view);
        applyHighPixelQuality(view, mapEl);
        if (typeof view.zoom === "number" && view.zoom < MIN_ZOOM) {
          try {
            await view.goTo({ zoom: MIN_ZOOM }, { duration: 0 });
          } catch {
            // ignore
          }
        }

        const graphicsLayer = new GraphicsLayer({ id: "coverage-areas", title: "Coverage" });
        if (mapEl.map?.add) {
          mapEl.map.add(graphicsLayer);
        } else if (view.map?.add) {
          view.map.add(graphicsLayer);
        } else {
          throw new Error("Could not attach coverage GraphicsLayer to the WebMap");
        }
        graphicsLayerRef.current = graphicsLayer;
        syncCoverageGraphics(graphicsLayer, modulesRef.current, coverageRef.current);

        clickHandle = view.on("click", async (event: any) => {
          const hit = await view.hitTest(event);
          const result = hit?.results?.find(
            (r: any) => r.graphic?.layer === graphicsLayerRef.current && r.graphic?.attributes?.coverageId,
          );
          if (!result?.graphic) return;

          const attrs = result.graphic.attributes as CoverageArea & { coverageId: string };
          const area: CoverageArea = {
            id: attrs.coverageId || attrs.id,
            city: attrs.city,
            region: attrs.region,
            country: attrs.country,
            latitude: Number(attrs.latitude),
            longitude: Number(attrs.longitude),
            services: Array.isArray(attrs.services)
              ? attrs.services
              : String(attrs.services || "")
                  .split("|")
                  .filter(Boolean),
            availability: "coordination_available",
          };

          handlersRef.current.onMarkerClick?.(area);

          const node = document.createElement("div");
          node.className = "coverage-popup";

          const kicker = document.createElement("div");
          kicker.className = "coverage-popup-kicker";
          kicker.textContent = "Occu-Med network capability";

          const heading = document.createElement("h3");
          heading.textContent = "Service coordination available";

          const place = document.createElement("p");
          place.textContent =
            area.city +
            ", " +
            area.region +
            (area.country ? " · " + area.country : "");

          const serviceList = document.createElement("div");
          serviceList.className = "coverage-service-list";
          for (const service of area.services.slice(0, 6)) {
            const chip = document.createElement("span");
            chip.textContent = service;
            serviceList.appendChild(chip);
          }

          const note = document.createElement("p");
          note.className = "coverage-popup-note";
          note.textContent =
            "Provider identity and final availability are confirmed by Occu-Med during coordination.";

          const action = document.createElement("button");
          action.type = "button";
          action.className = "atlas-popup-action-btn";
          action.textContent = "Request confirmation";
          action.addEventListener("click", () => {
            handlersRef.current.onRequestCoverage?.(area);
            view.popup?.close?.();
          });

          node.append(kicker, heading, place, serviceList, note, action);

          view.openPopup({
            title: "",
            location: result.graphic.geometry,
            content: node,
          });
        });

        resizeObserver = new ResizeObserver(() => {
          view.resize?.();
        });
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
        // ignore
      }
      mapElRef.current = null;
      viewRef.current = null;
      graphicsLayerRef.current = null;
      modulesRef.current = null;
      host.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    void view
      .goTo(
        {
          center: [center[1], center[0]],
          zoom: clampZoom(zoom),
        },
        { duration: 900 },
      )
      .catch(() => {
        // ignore cancelled animations
      });
  }, [center, zoom]);

  useEffect(() => {
    const layer = graphicsLayerRef.current;
    const modules = modulesRef.current;
    if (!layer || !modules) return;
    syncCoverageGraphics(layer, modules, coverageAreas);
  }, [coverageAreas]);

  return (
    <div
      ref={hostRef}
      className="atlas-map atlas-arcgis-map"
      role="application"
      aria-label="Occu-Med coverage map"
    />
  );
}
