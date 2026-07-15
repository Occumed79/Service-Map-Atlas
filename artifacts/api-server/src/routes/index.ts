import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import providersRouter from "./providers";
import coverageRouter from "./coverage";
import categoriesRouter from "./categories";
import requestsRouter from "./requests";
import searchRouter from "./search";
import analyticsRouter from "./analytics";
import usersRouter from "./users";
import invitationsRouter from "./invitations";
import { requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();
const appMode = process.env.APP_MODE === "admin" ? "admin" : "client";

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/categories", categoriesRouter);
router.use("/service-requests", requestsRouter);
router.use("/invitations", invitationsRouter);

if (appMode === "admin") {
  router.use("/providers", requireAdmin, providersRouter);
  router.use("/analytics", analyticsRouter);
  router.use("/users", usersRouter);
} else {
  router.use("/coverage", coverageRouter);
  router.use("/search-events", searchRouter);
}

export default router;
