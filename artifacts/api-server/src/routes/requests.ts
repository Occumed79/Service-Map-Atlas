import { Router } from "express";
import { db, serviceRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateServiceRequestBody, UpdateServiceRequestBody } from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAdmin, async (req, res) => {
  try {
    const { status, limit, offset } = req.query;
    let rows = await db.select().from(serviceRequestsTable).orderBy(serviceRequestsTable.createdAt);

    if (status && typeof status === "string") {
      rows = rows.filter(r => r.status === status);
    }

    const total = rows.length;
    const off = parseInt(String(offset || "0"));
    const lim = parseInt(String(limit || "50"));
    rows = rows.slice(off, off + lim);

    res.json(rows.map(r => ({
      ...r,
      clientPhone: r.clientPhone ?? null,
      employerCompany: r.employerCompany ?? null,
      notes: r.notes ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "List service requests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = CreateServiceRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const [created] = await db.insert(serviceRequestsTable).values({
      clientName: parsed.data.clientName,
      clientEmail: parsed.data.clientEmail,
      clientPhone: parsed.data.clientPhone,
      employerCompany: parsed.data.employerCompany ?? req.session.employerName ?? null,
      requestedService: parsed.data.requestedService,
      requestedLocation: parsed.data.requestedLocation,
      urgency: parsed.data.urgency,
      notes: parsed.data.notes,
      status: "pending",
    }).returning();

    res.status(201).json({
      ...created,
      clientPhone: created.clientPhone ?? null,
      employerCompany: created.employerCompany ?? null,
      notes: created.notes ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Create service request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = UpdateServiceRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const id = parseInt(String(req.params.id));
    const updateData: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    const [updated] = await db.update(serviceRequestsTable).set(updateData as never).where(eq(serviceRequestsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Service request not found" });
      return;
    }
    res.json({
      ...updated,
      clientPhone: updated.clientPhone ?? null,
      employerCompany: updated.employerCompany ?? null,
      notes: updated.notes ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Update service request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
