import { Router } from "express";
import { db, serviceCategoriesTable, locationServicesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { CreateCategoryBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const categories = await db.select().from(serviceCategoriesTable);

    const counts = await db
      .select({ categoryId: locationServicesTable.categoryId, count: sql<number>`count(*)::int` })
      .from(locationServicesTable)
      .groupBy(locationServicesTable.categoryId);

    const countMap: Record<number, number> = {};
    for (const row of counts) {
      countMap[row.categoryId] = row.count;
    }

    res.json(categories.map(c => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description ?? null,
      icon: c.icon ?? null,
      providerCount: countMap[c.id] || 0,
    })));
  } catch (err) {
    logger.error({ err }, "List categories error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const [cat] = await db.insert(serviceCategoriesTable).values(parsed.data).returning();
    res.status(201).json({ ...cat, description: cat.description ?? null, icon: cat.icon ?? null, providerCount: 0 });
  } catch (err) {
    logger.error({ err }, "Create category error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
