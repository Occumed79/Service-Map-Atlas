import { useEffect, useRef } from "react";

const ARCGIS_WEBMAP_ID = "7378ae8b471940cb9f9d114b67cd09b8";

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

function waitForArcgisLoader(timeoutMs = 25_000): Promise<ArcgisLoader> {
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<any>(null);
  const graphicsLayerRef = useRef<any>(null);
  const modulesRef = useRef<{
    Graphic: any;
    Point: any;
    SimpleMarkerSymbol: any;
  } | null>(null);
  const centerZoomRef = useRef({ center, zoom });
  const handlersRef = useRef({ onMarkerClick, onRequestCoverage });

  centerZoomRef.current = { center, zoom };
  handlersRef.current = { onMarkerClick, onRequestCoverage };

  // Initialize MapView + WebMap once
  useEffect(() => {
    let destroyed = false;
    let resizeObserver: ResizeObserver | null = null;
    let clickHandle: { remove: () => void } | null = null;

    const container = containerRef.current;
    if (!container) return;

    onStatusChange?.("loading");
    container.dataset.arcgisStatus = "loading";
    container.classList.add("atlas-arcgis-loading");
    container.classList.remove("atlas-arcgis-ready", "atlas-arcgis-error");

    void (async () => {
      try {
        const loader = await waitForArcgisLoader();
        if (destroyed) return;

        const [esriConfig, WebMap, MapView, GraphicsLayer, Graphic, Point, SimpleMarkerSymbol] =
          await loader.import([
            "@arcgis/core/config.js",
            "@arcgis/core/WebMap.js",
            "@arcgis/core/views/MapView.js",
            "@arcgis/core/layers/GraphicsLayer.js",
            "@arcgis/core/Graphic.js",
            "@arcgis/core/geometry/Point.js",
            "@arcgis/core/symbols/SimpleMarkerSymbol.js",
          ]);

        if (destroyed) return;

        const apiKey = String(import.meta.env.VITE_ARCGIS_API_KEY || "").trim();
        if (apiKey) {
          esriConfig.apiKey = apiKey;
        }

        modulesRef.current = { Graphic, Point, SimpleMarkerSymbol };

        const { center: c, zoom: z } = centerZoomRef.current;
        const webMap = new WebMap({
          portalItem: { id: ARCGIS_WEBMAP_ID },
        });

        await webMap.load();
        if (destroyed) return;

        const graphicsLayer = new GraphicsLayer({ id: "coverage-areas", title: "Coverage" });
        webMap.add(graphicsLayer);
        graphicsLayerRef.current = graphicsLayer;

        const view = new MapView({
          container,
          map: webMap,
          center: [c[1], c[0]],
          zoom: z,
          rotation: 0,
          popupEnabled: true,
          constraints: {
            snapToZoom: false,
            rotationEnabled: false,
            minZoom: 2,
            maxZoom: 18,
          },
          ui: {
            components: ["attribution"],
          },
        });

        await view.when();
        if (destroyed) {
          view.destroy();
          return;
        }

        viewRef.current = view;

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

          const servicesHtml = area.services
            .slice(0, 6)
            .map((s) => `<span>${escapeHtml(s)}</span>`)
            .join("");

          const node = document.createElement("div");
          node.className = "coverage-popup";
          node.innerHTML = `
            <div class="coverage-popup-kicker">Occu-Med network capability</div>
            <h3>Service coordination available</h3>
            <p>${escapeHtml(area.city)}, ${escapeHtml(area.region)}${area.country ? ` · ${escapeHtml(area.country)}` : ""}</p>
            <div class="coverage-service-list">${servicesHtml}</div>
            <p class="coverage-popup-note">Provider identity and final availability are confirmed by Occu-Med during coordination.</p>
            <button type="button" class="atlas-popup-action-btn">Request confirmation</button>
          `;
          node.querySelector(".atlas-popup-action-btn")?.addEventListener("click", () => {
            handlersRef.current.onRequestCoverage?.(area);
            view.closePopup?.();
            view.popup?.close?.();
          });

          view.openPopup({
            title: "",
            location: result.graphic.geometry,
            content: node,
          });
        });

        resizeObserver = new ResizeObserver(() => {
          view.resize?.();
        });
        resizeObserver.observe(container);

        container.classList.remove("atlas-arcgis-loading", "atlas-arcgis-error");
        container.classList.add("atlas-arcgis-ready");
        container.dataset.arcgisStatus = "ready";
        container.dataset.arcgisWebmapId = ARCGIS_WEBMAP_ID;
        delete container.dataset.arcgisError;
        onStatusChange?.("ready");
      } catch (error: unknown) {
        if (destroyed) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Occu-Med Atlas ArcGIS WebMap failed to load.", error);
        container.classList.remove("atlas-arcgis-loading", "atlas-arcgis-ready");
        container.classList.add("atlas-arcgis-error");
        container.dataset.arcgisStatus = "error";
        container.dataset.arcgisError = message.slice(0, 240);
        onStatusChange?.("error", message);
      }
    })();

    return () => {
      destroyed = true;
      clickHandle?.remove?.();
      resizeObserver?.disconnect();
      try {
        viewRef.current?.destroy?.();
      } catch {
        // ignore dispose races
      }
      viewRef.current = null;
      graphicsLayerRef.current = null;
      modulesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  // Sync camera from search / external state
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    void view.goTo(
      {
        center: [center[1], center[0]],
        zoom,
      },
      { duration: 900 },
    ).catch(() => {
      // ignore cancelled animations
    });
  }, [center, zoom]);

  // Sync coverage graphics
  useEffect(() => {
    const layer = graphicsLayerRef.current;
    const modules = modulesRef.current;
    if (!layer || !modules) return;

    const { Graphic, Point, SimpleMarkerSymbol } = modules;
    layer.removeAll();

    for (const area of coverageAreas) {
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
  }, [coverageAreas]);

  return (
    <div
      ref={containerRef}
      className="atlas-map atlas-arcgis-map"
      role="application"
      aria-label="Occu-Med coverage map"
    />
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}
