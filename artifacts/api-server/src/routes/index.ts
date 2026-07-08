import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import analyzeZepRouter from "./analyzeZep";
import toolsRouter from "./tools";
import chatRouter from "./chat";
import conversationsRouter from "./conversations";
import briefsRouter from "./briefs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(analyzeZepRouter);
router.use(toolsRouter);
router.use(chatRouter);
router.use(conversationsRouter);
router.use(briefsRouter);

export default router;
