import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  db,
  usersTable,
  invitationsTable,
  passwordResetTokensTable,
  employerAccountsTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { LoginBody, ForgotPasswordBody, ResetPasswordBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

async function getEmployerName(employerAccountId: number | null) {
  if (!employerAccountId) return null;

  const rows = await db
    .select({ name: employerAccountsTable.name })
    .from(employerAccountsTable)
    .where(eq(employerAccountsTable.id, employerAccountId))
    .limit(1);

  return rows[0]?.name ?? null;
}

router.post("/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { email, password } = parsed.data;
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);
    const user = users[0];
    if (!user || !user.active) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const employerName = await getEmployerName(user.employerAccountId ?? null);

    await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.employerAccountId = user.employerAccountId ?? null;
    req.session.employerName = employerName;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employerAccountId: user.employerAccountId ?? null,
      employerName,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error({ err }, "Session destroy error");
    }
    res.json({ success: true, message: "Logged out" });
  });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!)).limit(1);
    const user = users[0];
    if (!user || !user.active) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const employerName = await getEmployerName(user.employerAccountId ?? null);
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    req.session.employerAccountId = user.employerAccountId ?? null;
    req.session.employerName = employerName;

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      employerAccountId: user.employerAccountId ?? null,
      employerName,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/forgot-password", async (req, res) => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email.toLowerCase())).limit(1);
    if (users[0]) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60);
      await db.insert(passwordResetTokensTable).values({ userId: users[0].id, token, expiresAt });
      logger.info({ email: parsed.data.email }, "Password reset token created");
    }
    res.json({ success: true, message: "If that email exists, a reset link has been sent" });
  } catch (err) {
    logger.error({ err }, "Forgot password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const now = new Date();
    const tokens = await db.select().from(passwordResetTokensTable)
      .where(and(eq(passwordResetTokensTable.token, parsed.data.token), gt(passwordResetTokensTable.expiresAt, now)))
      .limit(1);
    const tokenRecord = tokens[0];
    if (!tokenRecord || tokenRecord.usedAt) {
      res.status(400).json({ error: "Invalid or expired reset token" });
      return;
    }
    const hash = await bcrypt.hash(parsed.data.password, 12);
    await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, tokenRecord.userId));
    await db.update(passwordResetTokensTable).set({ usedAt: now }).where(eq(passwordResetTokensTable.id, tokenRecord.id));
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    logger.error({ err }, "Reset password error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
