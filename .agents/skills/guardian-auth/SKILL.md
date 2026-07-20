---
name: guardian-auth
description: Integrate Guardian Auth (Ory) into a Replit pnpm-workspace app with React + Vite + TypeScript. Use when the user asks to add Ory authentication, Guardian auth, hosted login, or session-based auth to a web app. Covers the browser bootstrap, dev-mode bypass, and the server-side `/me` integration that exposes the signed-in user (and optional permissions) to the React app.
---

# Guardian Auth (Ory) Integration

Integrate Ory-based authentication (Guardian Auth) into a React + Vite + TypeScript web app in a Replit pnpm monorepo. The app never builds its own login form — it redirects to Ory's hosted login page. In development, a session token bypass lets the app run without the Ory redirect. A companion `/me` endpoint on the API server resolves the caller's Ory cookie via Guardian and returns user details (and optionally resource permissions for a configured application).

The skill is split into two halves:

- **Steps 1–11: Browser auth bootstrap.** Required for every app. The bootstrap calls `/me` once before mounting React and stores the result in a global Jotai atom that pages read synchronously.
- **Steps 12–17: Server-side `/me` integration.** Implements the `/me` endpoint that bootstrap calls, plus the codegen and config wiring.

## Prerequisites

- React + Vite + TypeScript web artifact in a pnpm workspace
- An Express-based API artifact in the same workspace (for the `/me` half)
- `axios` already installed in the web artifact
- An Ory instance URL (e.g. `https://auth.headout.com`)
- A Guardian instance URL (defaults to `https://guardian.headout.com`)

## Step 1: Install dependency

```bash
pnpm --filter @workspace/<web-artifact> add @ory/client-fetch
```

## Step 2: Set environment variable

Set `VITE_ORY_SDK_URL` in `[userenv.shared]` in the `.replit` config file. This **must** be shared (not development-only) because the app needs it in both development and production — it's used to redirect users to the Ory login page and to validate sessions in all environments.

```toml
[userenv.shared]
VITE_ORY_SDK_URL = "https://auth.headout.com"
```

**Do not** set this as a development-only or production-only variable. It must be in `[userenv.shared]` so it is available everywhere. The `VITE_` prefix is a Vite convention that exposes the variable to frontend code via `import.meta.env.VITE_ORY_SDK_URL`.

## Step 3: Create `src/auth/ory-client.ts`

Ory SDK instance, login URL constant, and logout function.

```typescript
import { Configuration, FrontendApi } from "@ory/client-fetch";

const basePath = import.meta.env.VITE_ORY_SDK_URL as string;

export const ory = new FrontendApi(
  new Configuration({ basePath, credentials: "include" })
);

export const ORY_LOGIN_URL = `${basePath}/ui/login`;

export async function oryLogout(): Promise<void> {
  const { logout_token } = await ory.createBrowserLogoutFlow();
  await ory.updateLogoutFlow({ token: logout_token });
}
```

## Step 4: Create `src/auth/bootstrap.ts`

Pre-mount auth resolution. In dev, hits the `/__dev-auth-cookie` Vite endpoint first to set the Ory cookie in the browser; in prod the cookie is already present (set by Ory's hosted login). Then calls `getMe()` from the typed API client.

On 401 the behavior diverges by environment:

- **Production** — redirects to Ory's hosted login.
- **Dev** — does **not** redirect (Ory's hosted login is unreachable from the local environment because of CORS / host mismatch / no real login). Instead, returns a tagged `"dev-session-invalid"` result so `main.tsx` can render an in-app screen telling the developer to refresh `ORY_SESSION_TOKEN`. The names of any missing dev secrets reported by `/__dev-auth-cookie` are forwarded so the screen can call them out.

The success result is the `MeResponse` (real user, not a stub), which `main.tsx` writes into the global `meAtom` (Step 5) before mounting React.

```typescript
import axios from "axios";
import { getMe, type MeResponse } from "@workspace/api-client-react";

import { ORY_LOGIN_URL } from "./ory-client";

const PUBLIC_PATHS = ["/logged-out"];

export type BootstrapStatus = "authenticating" | "redirecting";

export type BootstrapResultKind = "ok" | "dev-session-invalid";

export interface IBootstrapResult {
  kind: BootstrapResultKind;
  me: MeResponse | null;
  /**
   * Names of dev-only env vars that the `/__dev-auth-cookie` Vite middleware
   * reported as missing. Only populated when `kind === "dev-session-invalid"`.
   */
  missingDevSecrets: string[];
}

export interface IBootstrapOptions {
  onStatus?: (status: BootstrapStatus) => void;
}

interface IDevCookieStatus {
  ok: boolean;
  missing: string[];
}

function isPublicPath(): boolean {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  return PUBLIC_PATHS.some(
    (p) => pathname === `${basePath}${p}` || pathname === `${basePath}${p}/`,
  );
}

async function injectDevSessionCookie(): Promise<IDevCookieStatus> {
  try {
    const res = await axios.get<IDevCookieStatus>("/__dev-auth-cookie", {
      withCredentials: true,
    });
    const data = res.data ?? { ok: false, missing: [] };
    return {
      ok: Boolean(data.ok),
      missing: Array.isArray(data.missing) ? data.missing : [],
    };
  } catch {
    // Best-effort: if the dev cookie endpoint is unreachable the /me call
    // below will surface the auth failure.
    return { ok: false, missing: [] };
  }
}

function isUnauthorized(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: unknown }).status === 401
  );
}

function redirectToOryLogin(): void {
  window.location.href = `${ORY_LOGIN_URL}?return_to=${encodeURIComponent(window.location.href)}`;
}

export async function bootstrap(
  options: IBootstrapOptions = {},
): Promise<IBootstrapResult | null> {
  const { onStatus } = options;

  if (isPublicPath()) {
    return { kind: "ok", me: null, missingDevSecrets: [] };
  }

  onStatus?.("authenticating");

  let devCookieStatus: IDevCookieStatus = { ok: false, missing: [] };
  if (import.meta.env.DEV) {
    devCookieStatus = await injectDevSessionCookie();
  }

  try {
    const me = await getMe();
    return { kind: "ok", me, missingDevSecrets: [] };
  } catch (err) {
    if (isUnauthorized(err)) {
      if (import.meta.env.DEV) {
        return {
          kind: "dev-session-invalid",
          me: null,
          missingDevSecrets: devCookieStatus.missing,
        };
      }
      onStatus?.("redirecting");
      redirectToOryLogin();
      return null;
    }
    throw err;
  }
}
```

### Why `/me` is called from bootstrap, not from a page hook

Calling `/me` from `bootstrap()` (instead of from a `useGetMe()` query inside a component) gives us:

- **No spinner per-page.** Pages render synchronously with the user already populated; no loading skeleton, no error branch to handle.
- **Single source of truth.** The whole app reads the same `MeResponse` from one atom, so it can never disagree with itself.
- **Eager redirect.** A 401 is caught before React mounts, so users go straight to Ory's hosted login without ever seeing a flashed UI.

The `useGetMe`/`getMe` hook from `@workspace/api-client-react` is still the right tool if a feature needs to **refetch** the user (e.g. after editing their profile) — call it in that flow and write the result back into `meAtom` via `setMe()` from Step 5.

### How `PUBLIC_PATHS` works

Paths listed in `PUBLIC_PATHS` bypass auth entirely — `bootstrap()` returns `{ kind: "ok", me: null, missingDevSecrets: [] }` for them and skips the dev cookie injection and the `/me` call. This is used for the `/logged-out` page. To add more public pages, add their paths to the array (e.g. `["/logged-out", "/terms", "/privacy"]`).

### Dev-mode invalid session screen

Render a small in-app screen instead of redirecting in dev. Add `src/components/dev-session-invalid.tsx`:

```tsx
import { Button, Stack, Surface, Text } from "shoreline-ds";

interface IDevSessionInvalidProps {
  missingSecrets: string[];
}

export function DevSessionInvalid({ missingSecrets }: IDevSessionInvalidProps) {
  const missing = new Set(missingSecrets);
  const anyMissing = missing.size > 0;
  const title = anyMissing
    ? "Dev session secret is missing"
    : "Dev session is invalid or expired";
  return (
    <Stack
      align="center"
      justify="center"
      gap={0}
      className="min-h-screen w-full bg-surface p-4"
    >
      <Surface elevation="raised" padding="lg" radius="lg">
        <Stack gap={4} className="max-w-xl">
          <Text role="h2">{title}</Text>
          <Text role="body">
            {anyMissing
              ? `Set the missing Replit secret(s): ${[...missing].join(", ")}.`
              : "Refresh ORY_SESSION_TOKEN with a current cookie value (DevTools → Application → Cookies → copy only the Value column)."}
          </Text>
          <Text role="small" tone="soft">
            In dev we don&apos;t redirect to <code>auth.headout.com</code> because
            you can&apos;t actually log in there from this environment.
          </Text>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Surface>
    </Stack>
  );
}
```

`main.tsx` (Step 7) renders this when bootstrap returns `kind === "dev-session-invalid"`.

## Step 5: Create `src/auth/me-atom.ts`

A global Jotai atom that holds the `MeResponse` returned by `/me`, plus the hooks consumers use to read it and a `useLogout()` hook. The atom is bootstrapped once (Step 7) before React mounts; pages then read it synchronously.

```typescript
import { useCallback } from "react";
import { atom, getDefaultStore, useAtomValue, useSetAtom } from "jotai";
import type { MeResponse } from "@workspace/api-client-react";

import { oryLogout } from "./ory-client";

export const meAtom = atom<MeResponse | null>(null);

export function setMe(value: MeResponse | null): void {
  getDefaultStore().set(meAtom, value);
}

export function useMaybeMe(): MeResponse | null {
  return useAtomValue(meAtom);
}

export function useMe(): MeResponse {
  const me = useAtomValue(meAtom);
  if (!me) {
    throw new Error(
      "useMe() called outside an authenticated route. Only use this from components rendered when /me has been resolved.",
    );
  }
  return me;
}

export function useLogout(): () => Promise<void> {
  const setMeAtom = useSetAtom(meAtom);
  return useCallback(async () => {
    try {
      await oryLogout();
    } catch {
      // Session may already be invalid — that's fine.
    }
    setMeAtom(null);
    const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
    window.location.href = `${basePath}/logged-out?return_to=${encodeURIComponent(window.location.href)}`;
  }, [setMeAtom]);
}
```

### Three reads, one writer

- `setMe(value)` — module-level setter that uses `getDefaultStore()`. Called once from `main.tsx` before mounting React, so the atom is populated synchronously by the time the first render happens. Also the right call to use after manual refetches that should update the global user.
- `useMe()` — for components rendered inside the authenticated app. Throws if the atom is `null`, so a missing user is a programming error, not a runtime branch every page has to handle.
- `useMaybeMe()` — for components that may render in either state (e.g. the top-level `App` deciding between the public and authenticated route trees).

### Why no `<JotaiProvider>` wraps the app

The atom uses Jotai's **default store** (`getDefaultStore()`). Wrapping the app in `<JotaiProvider>` without an explicit `store` prop creates a *separate* private store, which would not see the value `setMe()` wrote before mount. Keep all atoms on the default store and do not mount `<JotaiProvider>`.

## Step 6: Create `src/auth/logged-out.tsx`

Page shown after explicit logout. Accessible without authentication.

```tsx
import { ORY_LOGIN_URL } from "./ory-client";

export function LoggedOut() {
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("return_to");
  const loginHref = returnTo
    ? `${ORY_LOGIN_URL}?return_to=${encodeURIComponent(returnTo)}`
    : ORY_LOGIN_URL;

  return (
    <div style={{
      minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center", padding: 16
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>You've been logged out</h1>
        <p style={{ color: "#666", marginBottom: 24 }}>Sign in again to continue.</p>
        <a href={loginHref} style={{
          padding: "8px 16px", border: "1px solid #ccc",
          borderRadius: 4, textDecoration: "none", color: "inherit"
        }}>
          Login
        </a>
      </div>
    </div>
  );
}
```

## Step 7: Wire into `main.tsx`

`bootstrap()` is awaited **at the module level**, before `<App />` ever mounts. To keep the screen non-blank during the wait, render a loader into the root synchronously, then re-render the same root with `<App />` once the user atom is populated. This pre-mount sequencing is the contract that lets every component call `useMe()` on first paint without a spinner.

```tsx
import { createRoot } from "react-dom/client";

import { bootstrap } from "./auth/bootstrap";
import { setMe } from "./auth/me-atom";
import { AppLoader } from "./components/app-loader";
import { DevSessionInvalid } from "./components/dev-session-invalid";
import { App } from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

// Show a loader immediately so the user never sees a blank document while
// bootstrap() is in flight. The same root is reused for the final App tree
// once /me has resolved.
root.render(<AppLoader title="Authenticating you" />);

void (async () => {
  let result;
  try {
    result = await bootstrap({
      onStatus: (status) => {
        if (status === "redirecting") {
          root.render(
            <AppLoader
              title="Authenticating you"
              message="Redirecting to Guardian…"
            />,
          );
        }
      },
    });
  } catch (err) {
    // bootstrap() handles 401 internally by redirecting. Anything reaching
    // here is a non-401 failure (network, 5xx). Surface it explicitly rather
    // than leaving the user on a misleading "redirecting" loader forever.
    // eslint-disable-next-line no-console
    console.error("[bootstrap] Failed to resolve /me:", err);
    root.render(
      <AppLoader
        title="Couldn't authenticate you"
        message="The /me request failed. Try refreshing the page in a moment."
      />,
    );
    return;
  }

  if (!result) {
    // bootstrap is navigating away to Ory — keep the loader on screen.
    return;
  }

  if (result.kind === "dev-session-invalid") {
    // Dev only: Guardian rejected the cookie or the dev secrets are
    // missing. Show an in-app screen instead of redirecting to Ory's
    // hosted login (which is unreachable from the local environment).
    root.render(
      <DevSessionInvalid missingSecrets={result.missingDevSecrets} />,
    );
    return;
  }

  // Populate the user atom BEFORE mounting <App /> so every component can
  // call useMe() on first render with no spinner.
  setMe(result.me);
  root.render(<App />);
})();
```

Three rules to keep this sequencing correct:

1. `setMe(result.me)` must run **before** `root.render(<App />)`. Otherwise the first paint of `<App />` sees `meAtom === null` and `useMe()` throws.
2. `createRoot(...)` is called exactly **once**. The same root is re-rendered for the loader, the redirecting state, the error state, and the final `<App />`. Calling `createRoot` twice on the same DOM node is a React warning and produces broken UIs.
3. The bootstrap promise is awaited at module scope (top-level `void (async () => { ... })()`), not inside a `useEffect`. Effect-based bootstrap forces the App tree to mount before identity is known and reintroduces per-page loading branches.

## Step 8: Wire into `App.tsx`

`App` takes no props. It reads the atom with `useMaybeMe()`: when `null` (public path), only the `/logged-out` route is rendered; when present, the full authenticated route tree is rendered. **Do not** wrap the children in `<JotaiProvider>` — see Step 5 for why.

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useMaybeMe } from "@/auth/me-atom";
import { LoggedOut } from "@/auth/logged-out";
// ... other imports

export function App() {
  const me = useMaybeMe();

  if (!me) {
    return (
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Routes>
          <Route path="logged-out" element={<LoggedOut />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Routes>
        <Route path="logged-out" element={<LoggedOut />} />
        {/* ... your authenticated routes */}
      </Routes>
    </BrowserRouter>
  );
}
```

## Step 9: Dev auth bypass in `vite.config.ts`

Add the `devAuthCookiePlugin` to the Vite config. This plugin exposes a `/__dev-auth-cookie` endpoint that reads two server-side env vars — the cookie **name** (`ORY_SESSION_COOKIE_NAME`) and the cookie **value** (`ORY_SESSION_TOKEN`) — and emits a `Set-Cookie` header that composes them. The token never enters the client JS bundle.

The split is intentional: the cookie name is non-sensitive shared config (lives in `.replit`), while the token is a per-developer dev secret. The same `ORY_SESSION_COOKIE_NAME` is also read by the `/me` route on the API server (Step 16), so the two services agree on which cookie carries the session.

```typescript
import type { Plugin } from "vite";

function devAuthCookiePlugin(): Plugin {
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
```

Then add `devAuthCookiePlugin()` to the `plugins` array in `defineConfig`:

```typescript
export default defineConfig({
  plugins: [
    react(),
    // ... other plugins
    devAuthCookiePlugin(),
  ],
  // ...
});
```

## Step 10: Set `ORY_SESSION_TOKEN` secret

Request `ORY_SESSION_TOKEN` as a Replit secret. This is a **dev-only** secret used to bypass the Ory login redirect during development.

**Format:** The value must be the **opaque cookie value only** — no `name=` prefix, no `;` suffix. The cookie name comes from the separate `ORY_SESSION_COOKIE_NAME` config var (Step 12), and the dev-auth-cookie middleware composes them as `${ORY_SESSION_COOKIE_NAME}=${ORY_SESSION_TOKEN}`. If you store the full `name=value` string here you will get a malformed cookie like `ory_session_xyz=ory_session_xyz=actualvalue`, and Guardian will reject it with a 401.

Example value: `MTcxNzI4NzU2MnxEdi1CQk...` (a long opaque base64-ish string).

**To obtain this value:**
1. Log into the Ory-protected environment in a browser
2. Open DevTools → **Application** → **Cookies** → select your Ory domain (e.g. `https://auth.headout.com`)
3. Find the row whose **Name** column matches your `ORY_SESSION_COOKIE_NAME` (e.g. `ory_session_angryhertzf78ol5nls8`)
4. Copy **only the Value column** — not the Name, not the `=`

Use the `environment-secrets` skill to request the secret:

```javascript
await requestEnvVar({
  keys: ["ORY_SESSION_TOKEN"],
  userMessage:
    "Ory session cookie VALUE for dev auth bypass. Copy only the Value column from DevTools → Application → Cookies for the cookie named per your ORY_SESSION_COOKIE_NAME. Do NOT include the cookie name or '=' prefix.",
  requestType: "secret",
});
```

After the secret is set, restart **both** the web and api-server workflows — Node snapshots `process.env` at process start, and both services use the cookie (web injects it via the dev-auth middleware, api-server reads it on `/me`).

## Step 11: Cookie forwarding

Ensure `withCredentials: true` is set on axios requests so the browser sends cookies with every API call. This is needed for both production (Ory session cookie) and development (injected dev cookie).

If using a custom fetch wrapper (e.g. Orval's `custom-fetch.ts`), add `withCredentials: true` to the axios config:

```typescript
const axiosConfig: AxiosRequestConfig = {
  url,
  method: method.toLowerCase(),
  headers,
  data: body,
  // ... other config
  withCredentials: true,
};
```

If using axios directly, set the default:

```typescript
axios.defaults.withCredentials = true;
```

---

# Server-side /me integration

Steps 12–17 add a typed `/me` endpoint on the API server that resolves the caller's Ory session via Guardian and returns user details (plus optional resource permissions for a configured application). On the React side, Orval-generated `useGetMe()` gives the app a typed React Query hook with zero hand-written client code.

## Step 12: Configuration variables

Three non-secret env vars drive the server side. Declare them in `[userenv.shared]` in `.replit` so they apply in both dev and production. **None of these are secrets** — they are configuration. The only secret in the entire integration is `ORY_SESSION_TOKEN` (Step 10).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ORY_SESSION_COOKIE_NAME` | **Yes** | — | The Ory cookie name carrying the session, e.g. `ory_session_<slug>`. Read by both the dev-auth-cookie middleware in `vite.config.ts` (to compose the dev cookie) and the `/me` route on the API server (to read it from the request). The two **must agree** at runtime or `/me` will 401. |
| `GUARDIAN_BASE_URL` | No | `https://guardian.headout.com` | Base URL of the Guardian service. Set this only if you point at a non-default Guardian environment. |
| `GUARDIAN_APPLICATION_NAME` | No | none | When set to one of the `OryApplication` enum values (see Step 13), `/me` additionally returns the user's resource permissions for that app. When unset, `/me` returns just the user details. |

```toml
[userenv.shared]
VITE_ORY_SDK_URL = "https://auth.headout.com"
ORY_SESSION_COOKIE_NAME = "ory_session_angryhertzf78ol5nls8"
GUARDIAN_BASE_URL = "https://guardian.headout.com"
GUARDIAN_APPLICATION_NAME = "SCORPIO"
```

After changing any of these, restart **both** the web and api-server workflows — `process.env` is snapshotted at process start in Node.

## Step 13: Add the `/me` operation and supporting schemas to OpenAPI

This template uses Orval to generate both a typed React Query client (`@workspace/api-client-react`) and a Zod parser package (`@workspace/api-zod`) from a single `lib/api-spec/openapi.yaml`. Add the operation and schemas there, then run codegen — never hand-edit the generated files.

Add to `lib/api-spec/openapi.yaml`:

```yaml
tags:
  - name: me
    description: Current user operations

paths:
  /me:
    get:
      operationId: getMe
      tags: [me]
      summary: Current user details and permissions
      description: |
        Resolves the caller's Ory session cookie via Guardian and returns the
        user details. When `GUARDIAN_APPLICATION_NAME` is configured on the
        server, also returns the resource permissions for that application.
      responses:
        "200":
          description: Current user
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/MeResponse"
        "401":
          description: No or invalid Ory session
        "502":
          description: Guardian unreachable or returned an unexpected error

components:
  schemas:
    OryApplication:
      type: string
      enum:
        - ARIES
        - SUPPLIERS
        - RECON
        - BMS
        - FEITORIA
        - FULFILMENT
        - SCORPIO
        - GUARDIAN
        - NIMBUS
        - ATLAS
        - HUB
        - ATHENA
        - APOLLO
        - DAM
        - MMP
        - ILF
        - PLTOPERATOR
        - SENTRA
        - URUK
        - ENDURANCE
        - SPEED_OR_BLEED
        - ORBIT
    AccessPermission:
      type: string
      enum: [VIEW, EDIT]
    MeUser:
      type: object
      properties:
        userId:    { type: string, description: "The user id (typically an email)" }
        firstName: { type: string }
        lastName:  { type: string }
      required: [userId, firstName, lastName]
    MeResourcePermission:
      type: object
      properties:
        resourceName:     { type: string }
        accessPermission: { $ref: "#/components/schemas/AccessPermission" }
      required: [resourceName, accessPermission]
    MeResponse:
      type: object
      properties:
        user:        { $ref: "#/components/schemas/MeUser" }
        application: { $ref: "#/components/schemas/OryApplication" }
        permissions:
          type: array
          items: { $ref: "#/components/schemas/MeResourcePermission" }
      required: [user]
```

Run codegen and rebuild the project-reference declarations so `@workspace/web` can see the new exports:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/api-client-react exec tsc -b
pnpm --filter @workspace/api-zod exec tsc -b
```

After this you will have:

- `useGetMe`, `getMe`, `getGetMeQueryKey`, etc. exported from `@workspace/api-client-react`
- `GetMeResponse` (Zod schema) and `MeUser` / `MeResourcePermission` / `MeResponse` types exported from `@workspace/api-zod`

The `OryApplication` enum in OpenAPI must stay in sync with the `ORY_APPLICATIONS` array in the server-side Guardian client (Step 15) — both lists are the source of truth for the same Guardian-side enum.

## Step 14: Install API server dependencies

In the API server artifact, add `axios` (HTTP to Guardian) and `cookie-parser` (read the Ory cookie off `req`):

```bash
pnpm --filter @workspace/<api-server> add axios cookie-parser
pnpm --filter @workspace/<api-server> add -D @types/cookie-parser
```

Mount `cookieParser()` once on the Express app, before the `/api` router:

```typescript
// artifacts/<api-server>/src/app.ts
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";

const app = express();
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use("/api", router);

export default app;
```

## Step 15: Create the Guardian downstream client

Guardian is itself a downstream service, so it follows the same BFF
layout as every other downstream (see the `api-integration` skill). The
work splits into three small files:

1. `artifacts/<api-server>/src/types/axios.d.ts` — module augmentation so axios's `config.rawCookie` is typesafe (only needed once per project; reuse for every downstream service).
2. `artifacts/<api-server>/src/downstreams/guardian/client.ts` — singleton axios instance + `GuardianError` + the standard request/response interceptor pair.
3. `artifacts/<api-server>/src/downstreams/guardian/endpoints.ts` — one async function per Guardian call (`whoami`, `listUserResourcePermissions`).
4. `artifacts/<api-server>/src/lib/guardian-config.ts` — env/config helpers consumed by the auth middleware and `/me` route (not by the downstream calls themselves).

`src/types/axios.d.ts`:

```typescript
import "axios";

declare module "axios" {
  export interface AxiosRequestConfig {
    rawCookie?: string;
  }
  export interface InternalAxiosRequestConfig {
    rawCookie?: string;
  }
}
```

`src/downstreams/guardian/client.ts`:

```typescript
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { logger } from "../../lib/logger";

const DEFAULT_GUARDIAN_BASE_URL = "https://guardian.headout.com";

const GUARDIAN_BASE_URL =
  process.env["GUARDIAN_BASE_URL"] ?? DEFAULT_GUARDIAN_BASE_URL;

export type TApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "BAD_GATEWAY"
  | "INTERNAL";

export class GuardianError extends Error {
  override readonly name = "GuardianError";
  readonly status: number;
  readonly code: TApiErrorCode;
  readonly responseBody: unknown;
  constructor(
    message: string,
    status: number,
    code: TApiErrorCode,
    responseBody: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
  }
}

function mapStatusToCode(status: number): TApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  return "BAD_GATEWAY";
}

export const guardianClient: AxiosInstance = axios.create({
  baseURL: GUARDIAN_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

guardianClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const rawCookie = config.rawCookie;
    if (rawCookie) {
      if (!config.headers) {
        config.headers = new AxiosHeaders();
      }
      config.headers.set("Cookie", rawCookie);
    }
    return config;
  },
);

guardianClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error instanceof AxiosError) {
      const status = error.response?.status ?? 0;
      const body = error.response?.data;
      const url = error.config?.url ?? "";
      const method = (error.config?.method ?? "").toUpperCase();
      logger.error(
        { status, body, url, method },
        "Guardian request failed",
      );
      const effectiveStatus = status > 0 ? status : 502;
      const message =
        status > 0
          ? `Guardian ${method} ${url} returned ${status}`
          : `Guardian ${method} ${url} failed: ${error.message}`;
      return Promise.reject(
        new GuardianError(
          message,
          effectiveStatus,
          mapStatusToCode(effectiveStatus),
          body,
        ),
      );
    }
    return Promise.reject(error);
  },
);
```

`src/downstreams/guardian/endpoints.ts`:

```typescript
import { guardianClient } from "./client";
import type { TOryApplication, TAccessPermission } from "../../lib/guardian-config";

export interface IGuardianUserDetails {
  userId: string;
  firstName: string;
  lastName: string;
  groups: { name: string; application: TOryApplication }[] | null;
}

export interface IGuardianResourcePermission {
  application: TOryApplication;
  resourceName: string;
  accessPermission: TAccessPermission;
}

export interface IWhoamiOptions { includeGroups?: boolean }

export async function whoami(
  rawCookie: string,
  options: IWhoamiOptions = {},
): Promise<IGuardianUserDetails> {
  const { includeGroups = false } = options;
  const response = await guardianClient.post<IGuardianUserDetails>(
    "/auth/whoami",
    { sessionCookie: rawCookie },
    {
      rawCookie,
      params: includeGroups ? { includeGroups: true } : undefined,
    },
  );
  return response.data;
}

export interface IListUserResourcePermissionsOptions {
  accessPermission?: TAccessPermission;
}

export async function listUserResourcePermissions(
  userId: string,
  application: TOryApplication,
  rawCookie: string,
  options: IListUserResourcePermissionsOptions = {},
): Promise<IGuardianResourcePermission[]> {
  const { accessPermission } = options;
  const response = await guardianClient.get<{ data: IGuardianResourcePermission[] }>(
    `/permissions/user/${encodeURIComponent(userId)}/resources/all`,
    {
      rawCookie,
      params: { application, ...(accessPermission ? { accessPermission } : {}) },
    },
  );
  return response.data.data;
}
```

`src/lib/guardian-config.ts`:

```typescript
import { logger } from "./logger";

const GUARDIAN_APPLICATION_NAME =
  process.env["GUARDIAN_APPLICATION_NAME"] ?? null;
const ORY_SESSION_COOKIE_NAME = process.env["ORY_SESSION_COOKIE_NAME"] ?? null;

// Keep this list in sync with the OryApplication enum in openapi.yaml
const ORY_APPLICATIONS = [
  "ARIES", "SUPPLIERS", "RECON", "BMS", "FEITORIA", "FULFILMENT",
  "SCORPIO", "GUARDIAN", "NIMBUS", "ATLAS", "HUB", "ATHENA", "APOLLO",
  "DAM", "MMP", "ILF", "PLTOPERATOR", "SENTRA", "URUK", "ENDURANCE",
  "SPEED_OR_BLEED", "ORBIT",
] as const;

export type TOryApplication = (typeof ORY_APPLICATIONS)[number];
export type TAccessPermission = "VIEW" | "EDIT";

function isOryApplication(v: string): v is TOryApplication {
  return (ORY_APPLICATIONS as readonly string[]).includes(v);
}

export function getOrySessionCookieName(): string {
  if (!ORY_SESSION_COOKIE_NAME) {
    throw new Error(
      "ORY_SESSION_COOKIE_NAME environment variable is required but was not provided.",
    );
  }
  return ORY_SESSION_COOKIE_NAME;
}

export function getConfiguredApplicationName(): TOryApplication | null {
  if (!GUARDIAN_APPLICATION_NAME) return null;
  if (!isOryApplication(GUARDIAN_APPLICATION_NAME)) {
    logger.warn(
      { value: GUARDIAN_APPLICATION_NAME },
      "GUARDIAN_APPLICATION_NAME is not a valid OryApplication enum value; ignoring",
    );
    return null;
  }
  return GUARDIAN_APPLICATION_NAME;
}
```

## Step 16: Create the `/me` route

`/me` is a thin proxy on top of the Guardian downstream client and the
shared `requireAuth` middleware (Step 18). The middleware extracts the
Ory cookie, calls `whoami`, and populates `req.auth = { user, rawCookie }`,
so the route handler only owns the optional permissions lookup and the
`GetMeResponse` shape. All errors use the standard `{ error, code }`
payload (see the `api-integration` skill).

Create `artifacts/<api-server>/src/routes/me.ts`:

```typescript
import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { GuardianError } from "../downstreams/guardian/client";
import { listUserResourcePermissions } from "../downstreams/guardian/endpoints";
import { getConfiguredApplicationName } from "../lib/guardian-config";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/me", async (req, res) => {
  // requireAuth (mounted above) guarantees req.auth is populated.
  const { user, rawCookie } = req.auth!;
  const application = getConfiguredApplicationName();

  try {
    if (!application) {
      res.json(GetMeResponse.parse({
        user: { userId: user.userId, firstName: user.firstName, lastName: user.lastName },
      }));
      return;
    }

    const permissions = await listUserResourcePermissions(
      user.userId,
      application,
      rawCookie,
    );

    res.json(GetMeResponse.parse({
      user: { userId: user.userId, firstName: user.firstName, lastName: user.lastName },
      application,
      permissions: permissions.map((p) => ({
        resourceName: p.resourceName,
        accessPermission: p.accessPermission,
      })),
    }));
  } catch (err) {
    if (err instanceof GuardianError && err.status === 401) {
      res.status(401).json({ error: "Unauthorized", code: err.code });
      return;
    }
    req.log.error({ err }, "Failed to resolve /me");
    res.status(502).json({ error: "Guardian request failed", code: "BAD_GATEWAY" });
  }
});

export default router;
```

Then mount it from your route index alongside the other routers:

```typescript
// artifacts/<api-server>/src/routes/index.ts
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";

const router: IRouter = Router();
router.use(healthRouter);
router.use(meRouter);

export default router;
```

## Step 17: Reading the user from a page

Pages do not call `/me` themselves — bootstrap (Step 4) already did. Read the user from the atom with `useMe()`. The component renders synchronously on first paint with full user data; there is no loading or error branch to handle.

```tsx
import { useMe } from "@/auth/me-atom";

export function MeDebug() {
  const me = useMe();

  return (
    <div>
      <div>{me.user.firstName} {me.user.lastName} ({me.user.userId})</div>
      {me.application && <div>App: {me.application}</div>}
      {me.permissions?.map((p) => (
        <div key={p.resourceName}>{p.resourceName}: {p.accessPermission}</div>
      ))}
    </div>
  );
}
```

If a feature needs to **refetch** the user (e.g. after the user edits their own profile), call `getMe()` from `@workspace/api-client-react` directly and write the result back with `setMe()` from `@/auth/me-atom`:

```tsx
import { getMe } from "@workspace/api-client-react";
import { setMe } from "@/auth/me-atom";

async function refreshMe() {
  setMe(await getMe());
}
```

---

# Backend-For-Frontend (BFF) pattern

The `/me` route in Steps 12–17 isn't just authentication — it's the canonical pattern for **every** downstream call the React app needs to make: the browser never talks to a downstream service directly; it talks to this api-server, and the api-server forwards the Ory cookie to the downstream on the user's behalf.

That workflow (the `requireAuth` middleware, downstream client, proxy route, OpenAPI extension + codegen, and React page wiring) is owned by a **separate skill**: read [`.agents/skills/api-integration/SKILL.md`](../api-integration/SKILL.md) before adding any new downstream API integration or BFF proxy route. It builds directly on top of `guardian-auth` and uses the SMC integration as its worked example.

The remainder of this skill (`/me`, the auth bootstrap, the dev cookie injection, the Guardian client) is a **prerequisite** for `api-integration` — make sure Steps 1–17 above are in place before reaching for it.

## Step 18: `requireAuth` middleware

> Note: `requireAuth` is the entry point that the `api-integration` skill builds on. It lives here because it's the bridge between the auth half (this skill) and the BFF half (the other skill). New BFF routes should not redefine it — they should `import { requireAuth } from "../middlewares/require-auth"` and follow the steps in `api-integration/SKILL.md`.

Create `artifacts/<api-server>/src/middlewares/require-auth.ts`. The middleware mirrors the error shapes already used by `/me`: 401 for missing/invalid cookie, 502 for Guardian failure, 500 for misconfiguration. All responses use the standard `{ error, code }` payload.

```typescript
import type { RequestHandler } from "express";
import { GuardianError } from "../downstreams/guardian/client";
import { whoami } from "../downstreams/guardian/endpoints";
import { getOrySessionCookieName } from "../lib/guardian-config";

export const requireAuth: RequestHandler = async (req, res, next) => {
  let cookieName: string;
  try {
    cookieName = getOrySessionCookieName();
  } catch (err) {
    req.log.error({ err }, "requireAuth misconfigured");
    res.status(500).json({ error: "Server misconfigured", code: "INTERNAL" });
    return;
  }

  const cookieValue = req.cookies?.[cookieName];
  if (!cookieValue || typeof cookieValue !== "string") {
    res
      .status(401)
      .json({ error: "Missing Ory session cookie", code: "UNAUTHORIZED" });
    return;
  }

  const rawCookie = `${cookieName}=${cookieValue}`;

  try {
    const user = await whoami(rawCookie);
    req.auth = { user, rawCookie };
    next();
  } catch (err) {
    if (err instanceof GuardianError && err.status === 401) {
      res.status(401).json({ error: "Unauthorized", code: err.code });
      return;
    }
    req.log.error({ err }, "requireAuth: Guardian failed");
    res
      .status(502)
      .json({ error: "Guardian request failed", code: "BAD_GATEWAY" });
  }
};
```

Augment Express's `Request` type so handlers see `req.auth`. Create `artifacts/<api-server>/src/types/express.d.ts`:

```typescript
import type { IGuardianUserDetails } from "../downstreams/guardian/endpoints";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: IGuardianUserDetails;
        rawCookie: string;
      };
    }
  }
}

export {};
```

The `.d.ts` file is picked up automatically by `tsc` because it's under `src/` (the `include` glob in `tsconfig.json`). Do **not** add `import "../types/express"` from runtime modules — esbuild can't resolve `.d.ts` paths and the build will fail. Type-only augmentation is global; tsc sees it without an import.

## Adding a new downstream API integration

Adding the actual downstream client, proxy route, OpenAPI operation, and React page wiring is covered end-to-end by the **`api-integration`** skill. Read [`.agents/skills/api-integration/SKILL.md`](../api-integration/SKILL.md) — do not duplicate that workflow here.

The `api-integration` skill is structured as two phases (using the SMC integration as its worked example):

**Phase 1 — wire up the downstream service:**

1. Configure the per-service env vars in `[userenv.shared]`.
2. Create the per-downstream folder at `artifacts/api-server/src/downstreams/<service>/` with a `client.ts` (singleton axios instance whose request interceptor injects the user's Ory cookie via `config.rawCookie`, and whose response interceptor normalises any axios failure into a typed `<Service>Error` carrying the standard `{ error, code }` payload shape) and an `endpoints.ts` (one async function per downstream call, taking `rawCookie` as the last argument).

**Phase 2 — expose an endpoint as an authenticated proxy route:**

3. (Optional) Add a service layer at `artifacts/api-server/src/services/<service>/<op>.ts` for response validation and any business logic that sits between the route and the downstream call.
4. Extend `lib/api-spec/openapi.yaml` and run codegen + `tsc -b` for `api-zod` and `api-client-react`.
5. Write the proxy route at `artifacts/api-server/src/routes/<service>.ts` (mounts `requireAuth` at the router level, validates request shape, calls into the service/endpoint with `req.auth!.rawCookie`, maps `<Service>Error` statuses to `401`/`404`/`502`).
6. Call the proxy from a React page using the generated `use<Operation>` hook with `query: { enabled: ... }` and `ApiError.status` branching.

The canonical implementation lives at:

- `artifacts/api-server/src/downstreams/smc/{client,endpoints}.ts`
- `artifacts/api-server/src/services/smc/tour-group.ts`
- `artifacts/api-server/src/routes/smc.ts`
- `artifacts/web/src/pages/test-api.tsx`

The status-code mapping (`401` / `400` / `404` / `502` / `500`), the standard `{ error, code }` error payload shape, and the "three rules" of the BFF pattern are documented there as well.

---

## Usage Patterns

### Access the signed-in user

```tsx
import { useMe } from "@/auth/me-atom";

function Profile() {
  const me = useMe();
  return <p>Logged in as {me.user.firstName} {me.user.lastName}</p>;
}
```

### Trigger logout

```tsx
import { useLogout } from "@/auth/me-atom";

function LogoutButton() {
  const logout = useLogout();
  return <button onClick={() => void logout()}>Log out</button>;
}
```

### Add more public paths

In `bootstrap.ts`, add paths to the `PUBLIC_PATHS` array:

```typescript
const PUBLIC_PATHS = ["/logged-out", "/terms", "/privacy"];
```

These paths bypass auth entirely (no dev cookie injection, no `/me` call) and render with `me: null`.

## Important Notes

- **Never build a login form.** Ory handles the login UI. The app only redirects to Ory's hosted login page.
- **Cookie name and token live in two different env vars on purpose.** `ORY_SESSION_COOKIE_NAME` is non-sensitive shared config (`.replit` `[userenv.shared]`); `ORY_SESSION_TOKEN` is a developer-specific dev secret. `ORY_SESSION_TOKEN` is the **value only**, never `name=value`.
- **The cookie name must agree across services.** The Vite dev middleware and the API server's `/me` route both read `ORY_SESSION_COOKIE_NAME`. Mismatch → `/me` 401.
- **`import.meta.env.BASE_URL`** is used for subpath-deployed apps (e.g. when the app is at `/my-app/` instead of `/`). All path comparisons and redirects account for this.
- **Production flow:** `bootstrap()` → `getMe()` against the API server (which forwards the real Ory cookie set by Ory's hosted login to Guardian) → on 401 redirect to Ory's hosted login → on success write the `MeResponse` into `meAtom` and mount the app.
- **Dev flow:** `bootstrap()` → `/__dev-auth-cookie` sets the Ory cookie via `Set-Cookie` (HttpOnly, never enters JS) → `getMe()` succeeds with the real user resolved by Guardian → write into `meAtom` and mount the app. The `/me` call exercises the same code path as production; only the source of the cookie differs.
- **The user atom is the single source of truth.** Pages call `useMe()` (or `useMaybeMe()` at the route boundary) and never refetch `/me` on render. If something must trigger a refresh, call `getMe()` then `setMe()` — see Step 17.
- **Do not mount `<JotaiProvider>`.** All auth atoms live on Jotai's default store so `setMe()` from `main.tsx` (which runs before React mounts) is visible to every component. A `<Provider>` without a `store` prop creates a private store and breaks bootstrap.
- **Do NOT add a Vite proxy for `/api`.** In Replit pnpm workspaces, the shared proxy at `localhost:80` handles cross-service routing. Vite proxy configs are explicitly prohibited by the platform.
- **Restart workflows after env or secret changes.** Node snapshots `process.env` at process start. Changing `VITE_ORY_SDK_URL`, `ORY_SESSION_COOKIE_NAME`, `GUARDIAN_BASE_URL`, `GUARDIAN_APPLICATION_NAME`, or `ORY_SESSION_TOKEN` requires restarting **both** the web and api-server artifact workflows.
- **Never hand-edit `lib/api-client-react/src/generated/` or `lib/api-zod/src/generated/`.** They are regenerated from `lib/api-spec/openapi.yaml` by `pnpm --filter @workspace/api-spec run codegen`. After regenerating, run `tsc -b` in both packages so the project-reference `.d.ts` files in `dist/` are refreshed — the web app's typecheck reads those, not source.

## File Summary

After integration, these files should exist in the **web** artifact:

```
src/auth/
├── ory-client.ts      # Ory SDK instance, login URL, logout function
├── bootstrap.ts       # Pre-mount /me call + dev cookie injection + 401 redirect
├── me-atom.ts         # meAtom + setMe() + useMe() / useMaybeMe() / useLogout()
└── logged-out.tsx     # Post-logout page
```

And these files should be modified in the **web** artifact:

- `src/main.tsx` — awaits `bootstrap()` at module scope (pre-mount), calls `setMe()`, then renders `<App />` into the same root that initially showed the loader. Never use `useEffect` for this — the App tree must not mount before identity is known.
- `src/App.tsx` — reads `useMaybeMe()` to choose between the public and authenticated route trees (no `<JotaiProvider>`, no `AuthProvider`, no session prop)
- `vite.config.ts` — includes `devAuthCookiePlugin()` reading `ORY_SESSION_COOKIE_NAME` + `ORY_SESSION_TOKEN`
- API client / custom fetch — `withCredentials: true` on axios

For the **server-side `/me` integration**, these files should exist in the **api-server** artifact:

```
src/types/axios.d.ts                       # Adds rawCookie to AxiosRequestConfig (shared by every downstream)
src/downstreams/guardian/client.ts         # Guardian axios instance + GuardianError + interceptors
src/downstreams/guardian/endpoints.ts      # whoami / listUserResourcePermissions catalogue
src/lib/guardian-config.ts                 # ORY_APPLICATIONS + env-var helpers (cookie name, app name)
src/middlewares/require-auth.ts            # Cookie -> whoami -> req.auth (used by /me and BFF routes)
src/routes/me.ts                           # GET /me route handler (mounts requireAuth)
```

And these files should be modified:

- `src/app.ts` — `app.use(cookieParser())` mounted before the `/api` router
- `src/routes/index.ts` — mounts `meRouter`
- `package.json` — adds `axios`, `cookie-parser`, and `@types/cookie-parser`

These shared files are also touched (codegen output — do not hand-edit):

- `lib/api-spec/openapi.yaml` — `/me` operation + `MeResponse` / `MeUser` / `MeResourcePermission` / `OryApplication` / `AccessPermission` schemas
- `lib/api-client-react/src/generated/` — regenerated by Orval (`useGetMe`, `getMe`, ...)
- `lib/api-zod/src/generated/` — regenerated by Orval (`GetMeResponse`, types)

And `.replit` is updated to declare the three configuration variables in `[userenv.shared]` (see Step 12).
