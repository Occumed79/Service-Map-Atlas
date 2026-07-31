import L from "leaflet";

const ARCGIS_WEBMAP_ID = "7378ae8b471940cb9f9d114b67cd09b8";

type ArcgisLoader = {
  import: (moduleIds: string | string[]) => Promise<any>;
};

declare const $arcgis: ArcgisLoader | undefined;

declare global {
  interface Window {
    __occumedArcgisAtlasRuntimeInstalled?: boolean;
  }
}

function getArcgisLoader(): ArcgisLoader | null {
  if (typeof $arcgis === "undefined" || typeof $arcgis?.import !== "function") return null;
  return $arcgis;
}

function waitForArcgisLoader(timeoutMs = 20_000): Promise<ArcgisLoader> {
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

function installArcgisBasemap(leafletMap: L.Map): void {
  const container = leafletMap.getContainer();
  if (!container.classList.contains("atlas-map") || container.dataset.arcgisWebmapInstalled === "true") return;

  container.dataset.arcgisWebmapInstalled = "true";
  container.dataset.arcgisStatus = "loading";
  container.classList.add("atlas-arcgis-loading");

  // There is intentionally no Leaflet basemap fallback. Remove every raster
  // tile layer already mounted and immediately reject any tile layer added later.
  const removeLeafletTileLayer = (layer: L.Layer) => {
    if (layer instanceof L.TileLayer && leafletMap.hasLayer(layer)) {
      leafletMap.removeLayer(layer);
    }
  };

  const handleLayerAdd = (event: L.LayerEvent) => {
    removeLeafletTileLayer(event.layer);
  };

  leafletMap.eachLayer(removeLeafletTileLayer);
  leafletMap.on("layeradd", handleLayerAdd);

  const host = document.createElement("div");
  host.className = "atlas-arcgis-webmap";
  host.setAttribute("aria-hidden", "true");
  container.insertBefore(host, container.firstChild);

  let destroyed = false;
  let animationFrame = 0;
  let arcgisView: any = null;
  let resizeObserver: ResizeObserver | null = null;

  const scheduleSync = () => {
    if (destroyed || !arcgisView || animationFrame) return;

    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      if (destroyed || !arcgisView) return;

      const center = leafletMap.getCenter();
      arcgisView.center = {
        longitude: center.lng,
        latitude: center.lat,
      };
      arcgisView.zoom = leafletMap.getZoom();
      arcgisView.rotation = 0;
    });
  };

  const cleanup = () => {
    destroyed = true;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    leafletMap.off("layeradd", handleLayerAdd);
    leafletMap.off("move zoom moveend zoomend resize", scheduleSync);
    resizeObserver?.disconnect();
    try {
      arcgisView?.destroy?.();
    } catch {
      // Leaflet may already be disposing the shared map container.
    }
    host.remove();
  };

  leafletMap.once("unload", cleanup);

  void waitForArcgisLoader()
    .then(async (loader) => {
      const [esriConfig, WebMap, MapView] = await loader.import([
        "@arcgis/core/config.js",
        "@arcgis/core/WebMap.js",
        "@arcgis/core/views/MapView.js",
      ]);

      if (destroyed) return;

      const apiKey = String(import.meta.env.VITE_ARCGIS_API_KEY || "").trim();
      if (apiKey) esriConfig.apiKey = apiKey;

      const center = leafletMap.getCenter();
      const webMap = new WebMap({
        portalItem: { id: ARCGIS_WEBMAP_ID },
      });

      await webMap.load();
      if (destroyed) return;

      arcgisView = new MapView({
        container: host,
        map: webMap,
        center: [center.lng, center.lat],
        zoom: leafletMap.getZoom(),
        rotation: 0,
        popupEnabled: false,
        constraints: {
          snapToZoom: false,
          rotationEnabled: false,
        },
        ui: {
          components: ["attribution"],
        },
      });

      await arcgisView.when();
      if (destroyed) return;

      container.classList.remove("atlas-arcgis-loading", "atlas-arcgis-error");
      container.classList.add("atlas-arcgis-ready");
      container.dataset.arcgisStatus = "ready";
      container.dataset.arcgisWebmapId = ARCGIS_WEBMAP_ID;
      delete container.dataset.arcgisError;

      leafletMap.on("move zoom moveend zoomend resize", scheduleSync);
      resizeObserver = new ResizeObserver(() => {
        arcgisView?.resize?.();
        scheduleSync();
      });
      resizeObserver.observe(container);
      scheduleSync();
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Occu-Med Atlas ArcGIS WebMap failed to load.", error);
      container.classList.remove("atlas-arcgis-loading", "atlas-arcgis-ready");
      container.classList.add("atlas-arcgis-error");
      container.dataset.arcgisStatus = "error";
      container.dataset.arcgisError = message.slice(0, 240);
      // Keep the ArcGIS host in place. The removed Leaflet basemap is never restored.
    });
}

export function installArcgisAtlasRuntime(): void {
  if (window.__occumedArcgisAtlasRuntimeInstalled) return;
  window.__occumedArcgisAtlasRuntimeInstalled = true;

  L.Map.addInitHook(function arcgisAtlasInitHook(this: L.Map) {
    window.queueMicrotask(() => installArcgisBasemap(this));
  });
}

installArcgisAtlasRuntime();
