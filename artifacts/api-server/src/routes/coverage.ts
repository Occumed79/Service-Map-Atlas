import { Router } from "express";
import { db, serviceLocationsTable, serviceCategoriesTable, locationServicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

type CoverageArea = {
  id: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  services: Set<string>;
  providerCount: number;
};

/**
 * Client-facing coverage data.
 *
 * This endpoint intentionally never returns provider names, exact addresses,
 * direct contact details, internal notes, pricing, or source records. Multiple
 * provider records in the same city are aggregated into a single coverage area
 * so the client experience communicates capability rather than exposing the
 * underlying Occu-Med network.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const requestedService = typeof req.query.serviceType === "string"
      ? req.query.serviceType.trim().toLowerCase()
      : null;

    const locations = await db
      .select()
      .from(serviceLocationsTable)
      .where(eq(serviceLocationsTable.active, true));

    const serviceRows = await db
      .select({
        locationId: locationServicesTable.locationId,
        categoryName: serviceCategoriesTable.name,
      })
      .from(locationServicesTable)
      .innerJoin(
        serviceCategoriesTable,
        eq(locationServicesTable.categoryId, serviceCategoriesTable.id),
      );

    const servicesByLocation = new Map<number, string[]>();
    for (const row of serviceRows) {
      const current = servicesByLocation.get(row.locationId) ?? [];
      current.push(row.categoryName);
      servicesByLocation.set(row.locationId, current);
    }

    const coverageByArea = new Map<string, CoverageArea>();

    for (const location of locations) {
      const services = servicesByLocation.get(location.id) ?? [];
      if (
        requestedService &&
        !services.some((service) => service.toLowerCase() === requestedService)
      ) {
        continue;
      }

      const city = location.city.trim();
      const region = location.state.trim();
      const country = location.country.trim();
      const key = `${city.toLowerCase()}|${region.toLowerCase()}|${country.toLowerCase()}`;
      const existing = coverageByArea.get(key);

      if (existing) {
        for (const service of services) existing.services.add(service);
        existing.providerCount++;
        continue;
      }

      coverageByArea.set(key, {
        id: key,
        city,
        region,
        country,
        // Deliberately reduce coordinate precision so the client map indicates
        // an area of coverage rather than revealing a provider's exact site.
        latitude: Number(location.latitude.toFixed(2)),
        longitude: Number(location.longitude.toFixed(2)),
        services: new Set(services),
        providerCount: 1,
      });
    }

    const response = Array.from(coverageByArea.values()).map((area) => ({
      id: area.id,
      city: area.city,
      region: area.region,
      country: area.country,
      latitude: area.latitude,
      longitude: area.longitude,
      services: Array.from(area.services).sort(),
      availability: "coordination_available" as const,
      providerCount: area.providerCount,
    }));

    res.json(response);
  } catch (err) {
    logger.error({ err }, "List client coverage error");
    res.status(500).json({ error: "Unable to load coverage data" });
  }
});

export default router;
