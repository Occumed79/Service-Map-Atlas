import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "@workspace/api-zod";
import { db, usersTable, employerAccountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const roleSchema = z.enum(["super_admin", "admin", "client_user", "read_only"]);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  role: roleSchema,
  employerName: z.string().trim().optional(),
  active: z.boolean().optional(),
});

const updateUserSchema = z.object({
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  name: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
  employerName: z.string().trim().nullable().optional(),
});

async function resolveEmployerAccountId(employerName?: string | null) {
  const normalized = employerName?.trim();
  if (!normalized) return null;

  const existing = await db
    .select({ id: employerAccountsTable.id })
    .from(employerAccountsTable)
    .where(sql`lower(${employerAccountsTable.name}) = lower(${normalized})`)
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(employerAccountsTable)
    .values({ name: normalized })
    .returning({ id: employerAccountsTable.id });

  return created.id;
}

function serializeUser(user: typeof usersTable.$inferSelect, employerName: string | null) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    employerAccountId: user.employerAccountId ?? null,
    employerName,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

router.get("/", requireAdmin, async (req, res) => {
  try {
    const audience = typeof req.query.audience === "string" ? req.query.audience : "all";
    const rows = await db
      .select({ user: usersTable, employerName: employerAccountsTable.name })
      .from(usersTable)
      .leftJoin(employerAccountsTable, eq(usersTable.employerAccountId, employerAccountsTable.id))
      .orderBy(usersTable.createdAt);

    const filtered = rows.filter(({ user }) => {
      if (audience === "admin") return user.role === "admin" || user.role === "super_admin";
      if (audience === "client") return user.role === "client_user" || user.role === "read_only";
      return true;
    });

    res.json(filtered.map(({ user, employerName }) => serializeUser(user, employerName ?? null)));
  } catch (err) {
    logger.error({ err }, "List users error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user details" });
    return;
  }

  try {
    const email = parsed.data.email.toLowerCase().trim();
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing[0]) {
      res.status(409).json({ error: "A user with this email already exists" });
      return;
    }

    const employerAccountId = await resolveEmployerAccountId(parsed.data.employerName);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [created] = await db.insert(usersTable).values({
      email,
      name: parsed.data.name.trim(),
      passwordHash,
      role: parsed.data.role,
      active: parsed.data.active ?? true,
      employerAccountId,
    }).returning();

    res.status(201).json(serializeUser(created, parsed.data.employerName?.trim() || null));
  } catch (err) {
    logger.error({ err }, "Create user error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const id = parseInt(String(req.params.id));
    const updateData: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active;
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
    if (parsed.data.password !== undefined) updateData.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    if (parsed.data.employerName !== undefined) {
      updateData.employerAccountId = await resolveEmployerAccountId(parsed.data.employerName);
    }

    const [updated] = await db.update(usersTable).set(updateData as never).where(eq(usersTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let employerName: string | null = null;
    if (updated.employerAccountId) {
      const employer = await db
        .select({ name: employerAccountsTable.name })
        .from(employerAccountsTable)
        .where(eq(employerAccountsTable.id, updated.employerAccountId))
        .limit(1);
      employerName = employer[0]?.name ?? null;
    }

    res.json(serializeUser(updated, employerName));
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
