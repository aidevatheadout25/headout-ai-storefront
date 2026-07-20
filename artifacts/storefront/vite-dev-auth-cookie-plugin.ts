import type { Plugin } from "vite";

/**
 * Dev-only: `GET /__dev-auth-cookie` sets an HttpOnly Ory session cookie from
 * server-side env (`ORY_SESSION_COOKIE_NAME` + `ORY_SESSION_TOKEN`).
 *
 * Matches Guardian-App-Starter-Kit: returns JSON `{ ok, missing }` so bootstrap
 * can surface which secrets are absent. Token is the opaque cookie *value*
 * only — never `name=value`.
 */
export function devAuthCookiePlugin(): Plugin {
  return {
    name: "dev-auth-cookie",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev-auth-cookie", (_req, res) => {
        const cookieName = process.env.ORY_SESSION_COOKIE_NAME;
        const token = process.env.ORY_SESSION_TOKEN;
        const missing: string[] = [];
        if (!cookieName) missing.push("ORY_SESSION_COOKIE_NAME");
        if (!token) missing.push("ORY_SESSION_TOKEN");

        if (!cookieName || !token) {
          for (const name of missing) {
            console.warn(
              `[dev-auth-cookie] ${name} is not set; skipping dev session injection.`,
            );
          }
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ ok: false, missing }));
          return;
        }

        res.writeHead(200, {
          "Set-Cookie": `${cookieName}=${token}; Path=/; SameSite=Lax; HttpOnly`,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        });
        res.end(JSON.stringify({ ok: true, missing: [] }));
      });
    },
  };
}
