import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
const ORS_ISOCHRONE_URL = "https://api.heigit.org/openrouteservice/v2/isochrones/driving-car";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CachedIsochrone = {
  expiresAt: number;
  body: Record<string, unknown>;
};

const isochroneCache = new Map<string, CachedIsochrone>();

function finiteCoordinate(value: unknown, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

router.post("/isochrones", requireAuth, async (req, res) => {
  const latitude = finiteCoordinate(req.body?.latitude, -90, 90);
  const longitude = finiteCoordinate(req.body?.longitude, -180, 180);

  if (latitude === null || longitude === null) {
    res.status(400).json({ error: "Valid latitude and longitude are required" });
    return;
  }

  const apiKey = String(process.env.OPENROUTESERVICE_API_KEY || "").trim();
  if (!apiKey) {
    res.status(503).json({ error: "Routing service is not configured" });
    return;
  }

  const cacheKey = `${latitude.toFixed(4)}|${longitude.toFixed(4)}|driving-car|30,60`;
  const cached = isochroneCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("X-Atlas-Routing-Cache", "HIT");
    res.json(cached.body);
    return;
  }

  try {
    const upstream = await fetch(ORS_ISOCHRONE_URL, {
      method: "POST",
      headers: {
        Accept: "application/geo+json, application/json",
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        locations: [[longitude, latitude]],
        range: [1800, 3600],
        range_type: "time",
        location_type: "start",
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 500);
      logger.warn(
        { status: upstream.status, detail },
        "OpenRouteService isochrone request failed",
      );
      res.status(502).json({ error: "Road-network reach could not be calculated" });
      return;
    }

    const raw = await upstream.json() as {
      type?: string;
      bbox?: unknown;
      features?: Array<{
        type?: string;
        geometry?: unknown;
        properties?: Record<string, unknown>;
      }>;
    };

    const features = Array.isArray(raw.features)
      ? raw.features.map((feature) => {
          const seconds = Number(feature.properties?.value ?? 0);
          const minutes = Math.round(seconds / 60);
          return {
            ...feature,
            properties: {
              ...(feature.properties ?? {}),
              bandValue: minutes,
              label: `${minutes} min`,
              source: "openrouteservice",
              estimated: 0,
            },
          };
        })
      : [];

    const body = {
      type: "FeatureCollection",
      ...(raw.bbox ? { bbox: raw.bbox } : {}),
      features,
      source: "openrouteservice",
      maxDrivingMinutes: 60,
    };

    isochroneCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      body,
    });

    if (isochroneCache.size > 250) {
      const oldestKey = isochroneCache.keys().next().value;
      if (oldestKey) isochroneCache.delete(oldestKey);
    }

    res.setHeader("Cache-Control", "private, max-age=900");
    res.setHeader("X-Atlas-Routing-Cache", "MISS");
    res.json(body);
  } catch (err) {
    logger.error({ err }, "OpenRouteService isochrone request error");
    res.status(502).json({ error: "Road-network reach could not be calculated" });
  }
});

export default router;
