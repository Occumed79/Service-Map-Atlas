import L from "leaflet";

const ARCGIS_SDK_VERSION = "5.1";
const ARCGIS_WEBMAP_ID = "7378ae8b471940cb9f9d114b67cd09b8";
const ARCGIS_SCRIPT_ID = "occumed-arcgis-sdk";
const ARCGIS_STYLE_ID = "occumed-arcgis-sdk-theme";

type ArcgisLoader = {
  import: (moduleIds: string | string[]) => Promise<any>;
};

declare global {
  interface Window {
    $arcgis?: ArcgisLoader;
    __occumedArcgisAtlasRuntimeInstalled?: boolean;
  }
}

function waitForArcgisLoader(timeoutMs = 15_000): Promise<ArcgisLoader> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    const check = () => {
      if (window.$arcgis?.import) {
        resolve(window.$arcgis);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("ArcGIS Maps SDK did not initialize in time"));
        return;
      }

      window.setTimeout(check, 40);
    };

    check();
  });
}

function ensureArcgisSdk(): Promise<ArcgisLoader> {
  if (window.$arcgis?.import) return Promise.resolve(window.$arcgis);

  if (!document.getElementById(ARCGIS_STYLE_ID)) {
    const stylesheet = document.createElement("link");
    stylesheet.id = ARCGIS_STYLE_ID;
    stylesheet.rel = "stylesheet";
    stylesheet.href = `https://js.arcgis.com/${ARCGIS_SDK_VERSION}/esri/themes/light/main.css`;
    document.head.appendChild(stylesheet);
  }

  if (!document.getElementById(ARCGIS_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = ARCGIS_SCRIPT_ID;
    script.type = "module";
    script.src = `https://js.arcgis.com/${ARCGIS_SDK_VERSION}/`;
    script.crossOrigin = "anonymous";
    document.head.appendChild(script);
  }

  return waitForArcgisLoader();
}

function installArcgisBasemap(leafletMap: L.Map): void {
  const container = leafletMap.getContainer();
  if (!container.classList.contains("atlas-map") || container.dataset.arcgisWebmapInstalled === "true") return;

  container.dataset.arcgisWebmapInstalled = "true";
  container.classList.add("atlas-arcgis-loading");

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
    leafletMap.off("move zoom moveend zoomend resize", scheduleSync);
    resizeObserver?.disconnect();
    try {
      arcgisView?.destroy?.();
    } catch {
      // The Leaflet map is already being destroyed; ArcGIS cleanup is best effort.
    }
    host.remove();
  };

  leafletMap.once("unload", cleanup);

  void ensureArcgisSdk()
    .then(async ($arcgis) => {
      const [esriConfig, WebMap, MapView] = await $arcgis.import([
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

      container.classList.remove("atlas-arcgis-loading");
      container.classList.add("atlas-arcgis-ready");
      container.dataset.arcgisWebmapId = ARCGIS_WEBMAP_ID;

      leafletMap.on("move zoom moveend zoomend resize", scheduleSync);
      resizeObserver = new ResizeObserver(() => {
        arcgisView?.resize?.();
        scheduleSync();
      });
      resizeObserver.observe(container);
      scheduleSync();
    })
    .catch((error) => {
      console.error("Occu-Med Atlas ArcGIS WebMap failed to load; retaining the existing fallback map.", error);
      container.classList.remove("atlas-arcgis-loading");
      container.classList.add("atlas-arcgis-error");
      host.remove();
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
