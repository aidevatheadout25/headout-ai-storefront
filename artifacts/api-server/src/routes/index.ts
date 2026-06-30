import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeZepRouter from "./analyzeZep";
import toolsRouter from "./tools";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeZepRouter);
router.use(toolsRouter);
router.use(chatRouter);

export default router;
