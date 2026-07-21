import {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import { GuardianError } from "../downstreams/guardian/client";
import { whoami } from "../downstreams/guardian/endpoints";
import {
  AUTH_BYPASS_GUARDIAN_USER,
  AUTH_BYPASS_USER,
  ensureAuthUserRow,
  guardianUserToAuthUser,
  isAuthBypassEnabled,
} from "../lib/auth";
import {
  getOrySessionCookieName,
  resolveOrySessionCookie,
} from "../lib/guardian-config";

async function attachBypassUser(req: Request): Promise<void> {
  await ensureAuthUserRow(AUTH_BYPASS_USER);
  req.user = AUTH_BYPASS_USER;
  req.rawCookie = "auth_bypass=1";
  req.auth = {
    user: AUTH_BYPASS_GUARDIAN_USER,
    rawCookie: "auth_bypass=1",
  };
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];
}

async function attachGuardianUser(
  req: Request,
  rawCookie: string,
): Promise<void> {
  const guardianUser = await whoami(rawCookie);
  const user = guardianUserToAuthUser(guardianUser);
  await ensureAuthUserRow(user);
  req.user = user;
  req.rawCookie = rawCookie;
  req.auth = { user: guardianUser, rawCookie };
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];
}

/**
 * Soft hydrate: if an Ory session cookie is present, resolve it via Guardian
 * and attach `req.user` / `req.rawCookie` / `req.auth`. Missing or invalid
 * cookies leave the request unauthenticated (no 401) — used for the soft
 * landing page and optional reporter identity on public-ish routes.
 *
 * When AUTH_BYPASS=true and there is no session cookie, attach a synthetic
 * user so the app is usable before custom-domain SSO works.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sessionCookie = resolveOrySessionCookie(req.cookies);
  if (!sessionCookie) {
    if (isAuthBypassEnabled()) {
      try {
        await attachBypassUser(req);
      } catch (err) {
        req.log?.error?.({ err }, "AUTH_BYPASS user upsert failed");
      }
    }
    next();
    return;
  }

  const rawCookie = `${sessionCookie.name}=${sessionCookie.value}`;

  try {
    await attachGuardianUser(req, rawCookie);
    next();
  } catch (err) {
    if (err instanceof GuardianError && err.status === 401) {
      if (isAuthBypassEnabled()) {
        try {
          await attachBypassUser(req);
        } catch (bypassErr) {
          req.log?.error?.(
            { err: bypassErr },
            "AUTH_BYPASS user upsert failed after 401",
          );
        }
      }
      next();
      return;
    }
    req.log?.error?.({ err }, "Guardian whoami failed during auth hydrate");
    if (isAuthBypassEnabled()) {
      try {
        await attachBypassUser(req);
      } catch (bypassErr) {
        req.log?.error?.(
          { err: bypassErr },
          "AUTH_BYPASS user upsert failed after Guardian error",
        );
      }
    }
    next();
  }
}

/**
 * Hard gate (starter-kit pattern): require a configured cookie name, call
 * Guardian whoami, populate `req.auth` + `req.user`. Use on routers that
 * must reject anonymous callers.
 *
 * AUTH_BYPASS short-circuits to the synthetic user when set.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  // Soft hydrate may already have validated this request via Guardian.
  if (req.auth && req.user) {
    next();
    return;
  }

  if (isAuthBypassEnabled()) {
    try {
      await attachBypassUser(req);
      next();
    } catch (err) {
      req.log?.error?.({ err }, "AUTH_BYPASS user upsert failed in requireAuth");
      res.status(500).json({ error: "Auth bypass failed", code: "INTERNAL" });
    }
    return;
  }

  let cookieName: string;
  try {
    cookieName = getOrySessionCookieName();
  } catch (err) {
    req.log?.error?.({ err }, "requireAuth misconfigured");
    res.status(500).json({ error: "Server misconfigured", code: "INTERNAL" });
    return;
  }

  const cookieValue = req.cookies?.[cookieName];
  if (!cookieValue || typeof cookieValue !== "string") {
    res.status(401).json({
      error: "invalid or missing session",
      errorCode: "INVALID_SESSION",
      code: "UNAUTHORIZED",
    });
    return;
  }

  const rawCookie = `${cookieName}=${cookieValue}`;

  try {
    await attachGuardianUser(req, rawCookie);
    next();
  } catch (err) {
    if (err instanceof GuardianError && err.status === 401) {
      res.status(401).json({
        error: "invalid or missing session",
        errorCode: "INVALID_SESSION",
        code: "UNAUTHORIZED",
      });
      return;
    }
    req.log?.error?.({ err }, "requireAuth: Guardian failed");
    res
      .status(502)
      .json({ error: "Guardian request failed", code: "BAD_GATEWAY" });
  }
};
