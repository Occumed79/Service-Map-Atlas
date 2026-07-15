import { Router } from "express";
import { z } from "zod/v4";
import { db, serviceLocationsTable, serviceCategoriesTable, locationServicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateProviderBody, UpdateProviderBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();
type ProviderInput = z.infer<typeof CreateProviderBody>;

async function createProviderRecord(data: ProviderInput) {
  const { serviceIds, ...rest } = data;
  const [location] = await db.insert(serviceLocationsTable).values({
    name: rest.name,
    address: rest.address,
    city: rest.city,
    state: rest.state,
    country: rest.country || "US",
    postalCode: rest.postalCode,
    latitude: rest.latitude,
    longitude: rest.longitude,
    phone: rest.phone,
    email: rest.email,
    website: rest.website,
    availabilityNotes: rest.availabilityNotes,
    coverageNotes: rest.coverageNotes,
    internalTags: rest.internalTags,
    active: rest.active ?? true,
  }).returning();

  if (serviceIds && serviceIds.length > 0) {
    await db.insert(locationServicesTable).values(serviceIds.map((categoryId) => ({ locationId: location.id, categoryId })));
  }

  const services = await db
    .select({ name: serviceCategoriesTable.name })
    .from(locationServicesTable)
    .innerJoin(serviceCategoriesTable, eq(locationServicesTable.categoryId, serviceCategoriesTable.id))
    .where(eq(locationServicesTable.locationId, location.id));

  return { ...location, services: services.map((service) => service.name), createdAt: location.createdAt.toISOString() };
}

router.get("/", async (req, res) => {
  try {
    const { serviceType, search, active } = req.query;
    let locations = await db.select().from(serviceLocationsTable);

    if (active !== undefined) {
      locations = locations.filter((location) => location.active === (active === "true"));
    }

    if (search && typeof search === "string") {
      const query = search.toLowerCase();
      locations = locations.filter((location) =>
        location.name.toLowerCase().includes(query) ||
        location.city.toLowerCase().includes(query) ||
        location.state.toLowerCase().includes(query) ||
        location.country.toLowerCase().includes(query) ||
        location.address.toLowerCase().includes(query),
      );
    }

    let locationServices: { locationId: number; categoryName: string }[] = [];
    if (locations.length > 0) {
      locationServices = await db
        .select({ locationId: locationServicesTable.locationId, categoryName: serviceCategoriesTable.name })
        .from(locationServicesTable)
        .innerJoin(serviceCategoriesTable, eq(locationServicesTable.categoryId, serviceCategoriesTable.id));
    }

    const serviceMap: Record<number, string[]> = {};
    for (const row of locationServices) {
      if (!serviceMap[row.locationId]) serviceMap[row.locationId] = [];
      serviceMap[row.locationId].push(row.categoryName);
    }

    let filtered = locations;
    if (serviceType && typeof serviceType === "string") {
      filtered = locations.filter((location) =>
        (serviceMap[location.id] || []).some((service) => service.toLowerCase() === serviceType.toLowerCase()),
      );
    }

    res.json(filtered.map((location) => ({
      id: location.id,
      name: location.name,
      address: location.address,
      city: location.city,
      state: location.state,
      country: location.country,
      postalCode: location.postalCode ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      phone: location.phone ?? null,
      email: location.email ?? null,
      website: location.website ?? null,
      availabilityNotes: location.availabilityNotes ?? null,
      coverageNotes: location.coverageNotes ?? null,
      internalTags: location.internalTags ?? null,
      active: location.active,
      services: serviceMap[location.id] || [],
      createdAt: location.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "List providers error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const locations = await db.select().from(serviceLocationsTable).where(eq(serviceLocationsTable.id, id)).limit(1);
    const location = locations[0];
    if (!location) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    const services = await db
      .select({ name: serviceCategoriesTable.name })
      .from(locationServicesTable)
      .innerJoin(serviceCategoriesTable, eq(locationServicesTable.categoryId, serviceCategoriesTable.id))
      .where(eq(locationServicesTable.locationId, id));

    res.json({
      ...location,
      postalCode: location.postalCode ?? null,
      phone: location.phone ?? null,
      email: location.email ?? null,
      website: location.website ?? null,
      availabilityNotes: location.availabilityNotes ?? null,
      coverageNotes: location.coverageNotes ?? null,
      internalTags: location.internalTags ?? null,
      services: services.map((service) => service.name),
      createdAt: location.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get provider error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const created = await createProviderRecord(parsed.data);
    res.status(201).json(created);
  } catch (err) {
    logger.error({ err }, "Create provider error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/bulk", requireAdmin, async (req, res) => {
  const parsed = z.object({ providers: z.array(CreateProviderBody).min(1).max(1000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid bulk provider data", details: parsed.error.issues.slice(0, 20) });
    return;
  }

  try {
    const created = [];
    for (const provider of parsed.data.providers) {
      created.push(await createProviderRecord(provider));
    }
    res.status(201).json({ createdCount: created.length, providers: created });
  } catch (err) {
    logger.error({ err }, "Bulk create providers error");
    res.status(500).json({ error: "Bulk import failed before completion" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = UpdateProviderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const id = parseInt(String(req.params.id));
    const { serviceIds, ...rest } = parsed.data;
    const updateData: Record<string, unknown> = {};
    if (rest.name !== undefined) updateData.name = rest.name;
    if (rest.address !== undefined) updateData.address = rest.address;
    if (rest.city !== undefined) updateData.city = rest.city;
    if (rest.state !== undefined) updateData.state = rest.state;
    if (rest.country !== undefined) updateData.country = rest.country;
    if (rest.postalCode !== undefined) updateData.postalCode = rest.postalCode;
    if (rest.latitude !== undefined) updateData.latitude = rest.latitude;
    if (rest.longitude !== undefined) updateData.longitude = rest.longitude;
    if (rest.phone !== undefined) updateData.phone = rest.phone;
    if (rest.email !== undefined) updateData.email = rest.email;
    if (rest.website !== undefined) updateData.website = rest.website;
    if (rest.availabilityNotes !== undefined) updateData.availabilityNotes = rest.availabilityNotes;
    if (rest.coverageNotes !== undefined) updateData.coverageNotes = rest.coverageNotes;
    if (rest.internalTags !== undefined) updateData.internalTags = rest.internalTags;
    if (rest.active !== undefined) updateData.active = rest.active;

    const [updated] = await db.update(serviceLocationsTable).set(updateData as never).where(eq(serviceLocationsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }

    if (serviceIds !== undefined) {
      await db.delete(locationServicesTable).where(eq(locationServicesTable.locationId, id));
      if (serviceIds.length > 0) {
        await db.insert(locationServicesTable).values(serviceIds.map((categoryId) => ({ locationId: id, categoryId })));
      }
    }

    const services = await db
      .select({ name: serviceCategoriesTable.name })
      .from(locationServicesTable)
      .innerJoin(serviceCategoriesTable, eq(locationServicesTable.categoryId, serviceCategoriesTable.id))
      .where(eq(locationServicesTable.locationId, id));

    res.json({ ...updated, services: services.map((service) => service.name), createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    logger.error({ err }, "Update provider error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [deleted] = await db.delete(serviceLocationsTable).where(eq(serviceLocationsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Provider not found" });
      return;
    }
    res.json({ success: true, message: "Provider deleted" });
  } catch (err) {
    logger.error({ err }, "Delete provider error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/services", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const services = await db
      .select({
        id: serviceCategoriesTable.id,
        name: serviceCategoriesTable.name,
        slug: serviceCategoriesTable.slug,
        description: serviceCategoriesTable.description,
        icon: serviceCategoriesTable.icon,
      })
      .from(locationServicesTable)
      .innerJoin(serviceCategoriesTable, eq(locationServicesTable.categoryId, serviceCategoriesTable.id))
      .where(eq(locationServicesTable.locationId, id));

    res.json(services.map((service) => ({ ...service, providerCount: 1, description: service.description ?? null, icon: service.icon ?? null })));
  } catch (err) {
    logger.error({ err }, "Get provider services error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
