import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import fs from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const isProd = process.env.NODE_ENV === "production";
const appMode = process.env.APP_MODE === "admin" ? "admin" : "client";

if (isProd && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required in production");
}

const app: Express = express();

// Render terminates TLS before forwarding requests to Node. Trusting the first
// proxy is required so secure session cookies work correctly in production.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Each Render service is same-origin: its Express process serves both its API
// and its compiled frontend. FRONTEND_URL is only needed for an intentionally
// separate trusted frontend origin.
app.use(
  cors({
    origin: isProd ? process.env.FRONTEND_URL || false : true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true, service: `service-map-atlas-${appMode}`, awake: true });
});

app.head("/api/health", (_req, res) => {
  res.status(200).end();
});

const PgSession = connectPgSimple(session);
app.use(
  session({
    // A distinct cookie name prevents a session created by the former combined
    // deployment—or by the other Render service—from bypassing the correct
    // client/admin credential checkpoint.
    name: appMode === "admin" ? "occu_atlas_admin.sid" : "occu_atlas_client.sid",
    store: new PgSession({
      pool,
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET || "occu-med-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

app.use("/api", router);

if (isProd) {
  const frontendCandidates = [
    path.resolve(process.cwd(), "../occu-med/dist/public"),
    path.resolve(process.cwd(), "artifacts/occu-med/dist/public"),
    path.resolve(process.cwd(), "dist/public"),
  ];
  const frontendDirectory = frontendCandidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "index.html")),
  );

  if (frontendDirectory) {
    app.use(express.static(frontendDirectory));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/")) {
        next();
        return;
      }
      res.sendFile(path.join(frontendDirectory, "index.html"));
    });
  } else {
    logger.error(
      { frontendCandidates },
      "Production frontend build was not found; run the workspace build before starting the service",
    );
  }
}

export default app;
