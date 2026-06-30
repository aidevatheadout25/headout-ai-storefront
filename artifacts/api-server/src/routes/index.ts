import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeZepRouter from "./analyzeZep";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeZepRouter);

export default router;
