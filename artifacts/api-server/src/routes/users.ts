import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateUserBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const users = await db.select().from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      employerAccountId: u.employerAccountId ?? null,
      employerName: null,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
    })));
  } catch (err) {
    logger.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const id = parseInt(String(req.params.id));
    const updateData: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name;

    const [updated] = await db.update(usersTable).set(updateData as never).where(eq(usersTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      active: updated.active,
      employerAccountId: updated.employerAccountId ?? null,
      employerName: null,
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Update user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (req.session?.userId === id) {
      res.status(400).json({ error: "Cannot delete your own account" });
      return;
    }
    const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    logger.error({ err }, "Delete user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
