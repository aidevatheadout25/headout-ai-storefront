import type { NextFunction, Request, Response } from "express";

/**
 * Tiny in-memory fixed-window rate limiter keyed by client IP.
 *
 * This guards write endpoints (notably "+ Add a tool") from a single client
 * flooding the catalogue with submissions. It is intentionally process-local
 * and dependency-free — good enough for the single-instance v1. A distributed
 * deployment would swap the store for Redis without changing call sites.
 */
type Bucket = { count: number; resetAt: number };

export type RateLimitOptions = {
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
};

function clientKey(req: Request): string {
  // Use req.ip, which Express derives from x-forwarded-for ONLY according to the
  // app's `trust proxy` setting (configured in app.ts). This is not spoofable:
  // a client cannot forge req.ip by injecting its own x-forwarded-for header,
  // because Express ignores forwarded hops beyond the trusted proxy count.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function rateLimit({ limit, windowMs }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const now = Date.now();
    const key = clientKey(req);
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      // Opportunistically evict expired buckets so the map can't grow forever.
      if (buckets.size > 5000) {
        for (const [k, b] of buckets) {
          if (now >= b.resetAt) buckets.delete(k);
        }
      }
      next();
      return;
    }

    if (bucket.count >= limit) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: `Too many requests — please wait ${retryAfter}s and try again.`,
      });
      return;
    }

    bucket.count += 1;
    next();
  };
}
