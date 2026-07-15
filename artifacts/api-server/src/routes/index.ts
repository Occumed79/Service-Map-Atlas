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

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/coverage", coverageRouter);
router.use("/providers", requireAdmin, providersRouter);
router.use("/categories", categoriesRouter);
router.use("/service-requests", requestsRouter);
router.use("/search-events", searchRouter);
router.use("/analytics", analyticsRouter);
router.use("/users", usersRouter);
router.use("/invitations", invitationsRouter);

export default router;
