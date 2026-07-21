import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Soft session probe for the landing page.
 * Relies on authMiddleware hydrate: returns `{ user }` or `{ user: null }`,
 * never 401 — so the SPA can show the login CTA without a hard redirect.
 */
router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/mobile-auth/token-exchange", (_req: Request, res: Response) => {
  res.status(501).json({
    error: "Mobile auth is not supported with Guardian web SSO",
    code: "NOT_IMPLEMENTED",
  });
});

router.post("/mobile-auth/logout", (_req: Request, res: Response) => {
  res.status(501).json({
    error: "Mobile auth is not supported with Guardian web SSO",
    code: "NOT_IMPLEMENTED",
  });
});

export default router;
