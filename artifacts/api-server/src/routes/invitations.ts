import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, invitationsTable, usersTable, employerAccountsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { CreateInvitationBody, AcceptInvitationBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/", requireAdmin, async (_req, res) => {
  try {
    const invitations = await db.select({
      inv: invitationsTable,
      inviterName: usersTable.name,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.invitedById, usersTable.id))
    .orderBy(invitationsTable.createdAt);

    res.json(invitations.map(({ inv, inviterName }) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      token: inv.token,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      invitedByName: inviterName ?? null,
      employerName: inv.employerName ?? null,
    })));
  } catch (err) {
    logger.error({ err }, "List invitations error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72);

    const [inv] = await db.insert(invitationsTable).values({
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      token,
      status: "pending",
      employerName: parsed.data.employerName,
      invitedById: req.session?.userId ?? null,
      expiresAt,
    }).returning();

    const inviterRows = req.session?.userId
      ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.session.userId)).limit(1)
      : [];

    logger.info({ email: parsed.data.email, invitationId: inv.id }, "Invitation created");

    res.status(201).json({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      token: inv.token,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
      invitedByName: inviterRows[0]?.name ?? null,
      employerName: inv.employerName ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Create invitation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const now = new Date();
    const rows = await db.select({
      inv: invitationsTable,
      inviterName: usersTable.name,
    })
    .from(invitationsTable)
    .leftJoin(usersTable, eq(invitationsTable.invitedById, usersTable.id))
    .where(and(
      eq(invitationsTable.token, req.params.token),
      gt(invitationsTable.expiresAt, now),
      eq(invitationsTable.status, "pending"),
    ))
    .limit(1);

    const row = rows[0];
    if (!row) {
      res.status(404).json({ error: "Invitation not found or expired" });
      return;
    }

    res.json({
      id: row.inv.id,
      email: row.inv.email,
      role: row.inv.role,
      token: row.inv.token,
      status: row.inv.status,
      expiresAt: row.inv.expiresAt.toISOString(),
      createdAt: row.inv.createdAt.toISOString(),
      invitedByName: row.inviterName ?? null,
      employerName: row.inv.employerName ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Get invitation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:token/accept", async (req, res) => {
  const parsed = AcceptInvitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const now = new Date();
    const rows = await db.select().from(invitationsTable)
      .where(and(
        eq(invitationsTable.token, req.params.token),
        gt(invitationsTable.expiresAt, now),
        eq(invitationsTable.status, "pending"),
      ))
      .limit(1);

    const inv = rows[0];
    if (!inv) {
      res.status(404).json({ error: "Invitation not found or expired" });
      return;
    }

    let employerAccountId: number | null = null;
    const employerName = inv.employerName?.trim() || null;

    if (employerName) {
      const existingEmployers = await db
        .select()
        .from(employerAccountsTable)
        .where(eq(employerAccountsTable.name, employerName))
        .limit(1);

      if (existingEmployers[0]) {
        employerAccountId = existingEmployers[0].id;
      } else {
        const emailDomain = inv.email.split("@")[1] ?? null;
        const [createdEmployer] = await db.insert(employerAccountsTable).values({
          name: employerName,
          emailDomain,
          contactEmail: inv.email,
        }).returning();
        employerAccountId = createdEmployer.id;
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [user] = await db.insert(usersTable).values({
      email: inv.email,
      name: parsed.data.name,
      passwordHash,
      role: inv.role,
      active: true,
      employerAccountId,
    }).returning();

    await db.update(invitationsTable).set({ status: "accepted", acceptedAt: now }).where(eq(invitationsTable.id, inv.id));

    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.employerAccountId = employerAccountId;
    req.session.employerName = employerName;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employerAccountId,
      employerName,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Accept invitation error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
