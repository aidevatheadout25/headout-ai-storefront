# Go-live plan — from today (2026-07-16) to production

This is the execution plan for getting Storefront live, fully off Replit, with real auth and real data — and for wiring in the rest of Headout's tool/skill landscape. It's written against the **actual current state of this repo**, not the aspirational one, so every step below is grounded in a specific file, env var, or commit already sitting in the working tree.

**Scope: ship the existing Vite + Express prototype**, fully decoupled from Replit, live on Railway with real Guardian auth and a real Postgres.

---

## 0. Ground truth — what's actually true right now

Verified directly against the working tree, not memory:

| Component | Current reality | Target | Status |
|---|---|---|---|
| **Anthropic client** | `lib/integrations-anthropic-ai/src/client.ts` and `artifacts/api-server/src/lib/anthropicClient.ts` have **already been edited** (uncommitted) to fall back from the Replit `AI_INTEGRATIONS_ANTHROPIC_*` vars to standard `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`/`CLAUDE_MODEL`. | Standard Anthropic env vars only, no Replit dependency. | **~90% done, uncommitted.** Needs a real key + one eval-harness fix (see 2.2). |
| **Auth** | `artifacts/api-server/src/lib/auth.ts:8` hardcodes `ISSUER_URL = "https://replit.com/oidc"` and `getOidcConfig()` calls `client.discovery(new URL(ISSUER_URL), process.env.REPL_ID!)` — **`REPL_ID` is a Replit-runtime-only variable.** This is Repl Auth, not swappable by env var; it categorically cannot issue a working login flow off Replit. | Guardian (Ory-backed) SSO — Headout's actual SSO standard, not raw OAuth. | **Not started; hard blocker.** Reference implementation already pulled into `.guardian-kit-tmp` / `.headauth-tmp` (see 0.1). This is the one piece of "auth is Replit" that's a real rewrite, not a config change. |
| **Database** | Drizzle + pgvector, schema in `lib/db`. `lib/db/scripts/ensure-extension.mjs` (new, uncommitted) creates the `vector` extension before push; `lib/db/package.json` has a new `migrate` script wired into `railway.json`'s `preDeployCommand`. | Railway Postgres with pgvector, migrated + seeded on deploy. | **Scaffolded, uncommitted, unverified against a real Railway Postgres instance.** |
| **Catalogue seed data** | `artifacts/api-server/src/lib/realSeedData.ts` (1509 lines, committed in `b5d28b9`) already has **89 real Headout tools**: Delphi, Argus (+ Argus MCP), Guardian, Product OS, Zenith, Medusa, plus 37 real Claude Code skills pulled from HeadoutAgentsConfig's `bundles.json`. `artifacts/api-server/src/scripts/seedRealTools.ts` (`pnpm run seed:real`) wipes and reseeds the `tools` table with it. | Same data, actually run against the production DB. | **The content work is basically done.** What's missing is running it against a real deployed DB — see 2.1. `lib/seedData.ts` (fictional) stays untouched on purpose — it's the eval harness's regression fixture set. |
| **Deploy** | `Dockerfile` (new, uncommitted) builds one Debian-based image: `pnpm --filter storefront build` (Vite → static) + `pnpm --filter api-server build` (esbuild bundle), Express serves both the API and the static SPA from one origin. `railway.json` (new, uncommitted) points at it, with a `healthcheckPath: /api/healthz` and a `preDeployCommand` that runs the DB migration. | Same — single service, no CORS/proxy config to maintain. | **Drafted, uncommitted, never deployed.** |
| **Embeddings** | Local ONNX model (`onnxruntime-node`), no external dependency. Dockerfile already installs `libgomp1` for it. | Unchanged. | **Fine as-is.** |
| **Scratch reference clones** | `.guardian-kit-tmp` (partial/sparse clone of `github/headout/Guardian-App-Starter-Kit`, widened during this session to `artifacts/api-server` + `.agents`) and `.headauth-tmp` (full clone of `github/headout/headauth`, the actual `@headout/headauth` npm package) are sitting in the working tree, untracked. `.codex/` is an unrelated Codex CLI config dir. | Extract what's needed (below), then delete all three — they should never be committed. | **Reference material only — not part of the app.** |

### 0.1 What the Guardian/Ory auth model actually looks like (from the starter kit)

This is materially different from the current Replit OIDC flow, so the "swap" is a rewrite, not a config change:

- **No login form, no `/login`/`/callback` routes, no server-side OIDC dance.** The frontend redirects straight to Ory's hosted login (`${VITE_ORY_SDK_URL}/ui/login?return_to=...`). Ory owns the entire login UI.
- **No server-side session store.** The Ory session is a cookie the browser already has after login. The backend's only job is to forward that cookie to **Guardian** (`https://guardian.headout.com`) via `POST /auth/whoami`, which returns the user's identity. There is no token refresh logic, no `sessionsTable` needed for this.
- **The application must be registered with Guardian as an `OryApplication` enum value** (existing values: `ARIES`, `SUPPLIERS`, `RECON`, `BMS`, ... — `STOREFRONT` is not in the list yet). This is a platform-team ask, not something we can self-serve.
- **The Ory session cookie is domain-scoped** (almost certainly to `.headout.com` or `auth.headout.com`'s cookie domain policy). If Storefront is served from a bare Railway domain (`*.up.railway.app`), the browser will not send that cookie to it. **A `storefront.headout.com` custom domain is a hard prerequisite for auth to work at all** — this elevates the "subdomain provisioning" ask in `PLATFORM-TEAM-REQUIREMENTS.md` §11 from P1/P2 to a Phase-1 blocker.
- **Dev-mode bypass exists** (`ORY_SESSION_TOKEN`, a real cookie value copied out of a logged-in browser session, injected via a Vite dev-only endpoint) — needed so local dev doesn't require going through Ory's hosted domain.
- The one genuinely good piece of news: the current frontend already isolates auth behind a single context (`artifacts/storefront/src/lib/auth-context.tsx` wraps one hook in `AuthProvider`/`useAuthContext`). Every consumer (`App.tsx`, `Sidebar.tsx`, `HomeChat.tsx`, `conversations-context.tsx`, `landing.tsx`) only calls `useAuthContext()`. **The blast radius of the auth rewrite is one context file + the server routes/middleware — not every component.**

---

## 1. Immediate asks to the platform team (send today, in parallel with everything below)

These block Phase 1 completion, not necessarily its start — begin the code work now, but chase these in parallel since they have someone else's turnaround time in them:

| # | Ask | Blocks | Who chases |
|---|---|---|---|
| 1 | **Register `STOREFRONT` as a Guardian/Ory `OryApplication`** + hand over `VITE_ORY_SDK_URL`, `ORY_SESSION_COOKIE_NAME`, `GUARDIAN_BASE_URL` (default `https://guardian.headout.com` if unspecified), `GUARDIAN_APPLICATION_NAME=STOREFRONT` | Auth (§2.3) — hard blocker, nothing logs in without this | Anish → Guardian/platform owner |
| 2 | **`storefront.headout.com` custom domain wired to the Railway service** | Auth (cookie domain, §0.1) — hard blocker | Anish → platform/infra |
| 3 | **Confirm Railway org account + billing is under Headout** (not personal) — `railway.json`/`Dockerfile` already assume a service exists to deploy to | Deploy (§2.4) | Anish |
| 4 | **A real `ANTHROPIC_API_KEY`** (public Anthropic API, not the Replit-proxied integration) + confirm rate limits/cost ownership | Everything — Claude calls are the whole product | Anish |
| 5 | Confirm whether Storefront needs the **mobile-auth token-exchange flow** (`routes/auth.ts`'s `/mobile-auth/token-exchange`, `/mobile-auth/logout`) — the Guardian starter kit's documented pattern is web-only; if there's no mobile client today, drop it instead of porting it | Auth scope (§2.3) | Anish (product call, not a platform ask) |
| 6 | GitHub App / bot account for repo-creation (per `PLATFORM-TEAM-REQUIREMENTS.md` §1) | **Not** Phase 1 — only blocks the build-handoff/registration flow, which is Phase 2+ | Anish |

---

## 2. Phase 1 — Ship the current prototype, fully off Replit, live on Railway

Goal: the existing Vite+Express app, running on Railway, at `storefront.headout.com`, with real Guardian auth, a real seeded Postgres, and a real Anthropic key. This is the whole build — no Next.js rewrite.

### 2.1 Database — provision, migrate, seed

1. Provision a Railway Postgres instance (or attach an existing pgvector-capable one). **Verify pgvector is actually allowed** — some managed Postgres offerings block arbitrary `CREATE EXTENSION`; Railway's own Postgres template does support it, but confirm before relying on `ensure-extension.mjs`.
2. Set `DATABASE_URL` in the Railway service's environment.
3. Commit the already-drafted `lib/db/scripts/ensure-extension.mjs` and the `migrate`/`ensure-extension` scripts in `lib/db/package.json` (currently uncommitted diffs).
4. Confirm `railway.json`'s `preDeployCommand: "pnpm --filter @workspace/db run migrate"` runs `ensure-extension` then `drizzle-kit push --force` — this is already wired, just needs a live DB to run against.
5. **Run `pnpm run seed:real`** (in `artifacts/api-server/package.json`) against the provisioned DB. This is the "add skills from across Headout" step — the content (89 tools incl. Delphi, Argus, Guardian, Product OS, Medusa, Zenith, 37 HeadoutAgentsConfig skills) is already written; it just has never been executed against a real deployed database. Do this once, then decide a refresh cadence (monthly? on every HeadoutAgentsConfig bundle change?) — not decided yet, flag as an open question in §5.
6. Leave `lib/seedData.ts` / the fictional seed alone — it's `catalogueQuality.test.ts`'s regression fixture, not production content.

### 2.2 Anthropic / Claude — finish and verify

1. Commit the already-made changes to `lib/integrations-anthropic-ai/src/client.ts` and `artifacts/api-server/src/lib/anthropicClient.ts`.
2. Set `ANTHROPIC_API_KEY` (real key, ask #4 above) in Railway. Leave `ANTHROPIC_BASE_URL` unset unless routing through a gateway (per `PLATFORM-TEAM-REQUIREMENTS.md` §6, OpenRouter/internal gateway status is still unconfirmed — config swap, not a rewrite, when it lands).
3. **Fix a real gap found in this audit:** `artifacts/api-server/src/eval/gate3Routing.test.ts`, `buildHandoff.test.ts`, and `gate3Latency.test.ts` all gate their `AI_READY` check on `process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL` specifically — the *legacy Replit var name*. Once Railway only sets `ANTHROPIC_API_KEY` (no base URL), these three eval suites will silently report `AI_READY = false` and skip themselves, instead of failing loudly. Update all three to check for `ANTHROPIC_API_KEY` (or equivalent), not the Replit-specific var name. This matters because the eval harness is explicitly "the regression net" per this repo's working agreements — a silently-skipped gate is worse than a failing one.

### 2.3 Auth — replace Repl Auth with Guardian (the real rewrite)

This is the biggest, riskiest piece of work in Phase 1. Concrete file plan, backend first:

**Delete/replace:**
- `artifacts/api-server/src/lib/auth.ts` — the whole OIDC-discovery + custom `sessionsTable` model goes away. No token refresh, no `REPL_ID`, no `ISSUER_URL`.
- `artifacts/api-server/src/routes/auth.ts` — `/login` and `/callback` are gone entirely (Ory's hosted UI owns login; the frontend redirects directly, no server round-trip). `/mobile-auth/*` is dropped unless ask #5 comes back "yes we need mobile."
- `artifacts/api-server/src/middlewares/authMiddleware.ts` — replaced by a `requireAuth`-style middleware that reads the Ory session cookie off the request and calls Guardian's `/auth/whoami`, populating `req.auth = { user, rawCookie }` (see the exact reference implementation pulled into `.guardian-kit-tmp/artifacts/api-server/src/middlewares/require-auth.ts` — copy the pattern, not the file verbatim, since this repo's route/response conventions differ slightly).

**Add:**
- `artifacts/api-server/src/downstreams/guardian/client.ts` + `endpoints.ts` — Guardian axios client + `whoami`/`listUserResourcePermissions` calls. Reference implementation: `.guardian-kit-tmp/artifacts/api-server/src/downstreams/guardian/{client,endpoints}.ts`.
- `artifacts/api-server/src/lib/guardian-config.ts` — env helpers for `GUARDIAN_APPLICATION_NAME`, `ORY_SESSION_COOKIE_NAME`.
- A `GET /me`-shaped route (can keep the existing `/api/auth/user` path to avoid touching the frontend's fetch URL — just change what it does internally: read the cookie, call Guardian, return the user).
- `cookie-parser` is already mounted (`app.use(cookieParser())` is in `app.ts` today) — reusable as-is.

**Frontend — small blast radius, thanks to the existing context wrapper:**
- Rewrite `artifacts/storefront/src/lib/auth-context.tsx` to stop importing `@workspace/replit-auth-web` and instead: redirect to `${VITE_ORY_SDK_URL}/ui/login?return_to=...` for `login()`, call Ory's logout flow for `logout()`, and call `/api/auth/user` for the current session (same shape as today — `{user, isLoading, isAuthenticated, login, logout}` — so `App.tsx`, `Sidebar.tsx`, `HomeChat.tsx`, `conversations-context.tsx`, `landing.tsx` need **no changes**).
- Delete `lib/replit-auth-web` once nothing imports it.
- Add `@ory/client-fetch` as a dependency (only if adopting `@headout/headauth`'s `AuthProvider`/`useAuth` wholesale — otherwise a plain `fetch`-based rewrite of the existing hook is simpler and avoids pulling in Jotai, which this app doesn't currently use). **Recommendation:** don't adopt `@headout/headauth`'s React layer (it assumes Jotai + a specific bootstrap-before-mount sequencing this app doesn't have); port the *pattern* (redirect-to-Ory, cookie-forwarding `/me`) into the existing `auth-context.tsx` shape instead. Flag if this turns out to be more work than expected once started.

**Env vars to set in Railway** (from ask #1): `VITE_ORY_SDK_URL`, `ORY_SESSION_COOKIE_NAME`, `GUARDIAN_BASE_URL`, `GUARDIAN_APPLICATION_NAME=STOREFRONT`.

**Data model cleanup:** once sessions are no longer stored server-side, `sessionsTable` in `lib/db` becomes dead — remove it in a follow-up pass once the new auth path is verified working (don't do this in the same PR as the swap; verify first).

### 2.4 Deploy — commit, connect, cut over

1. Commit `Dockerfile`, `railway.json`, `.dockerignore` (currently untracked).
2. Connect this GitHub repo to the Railway service for auto-deploy on push to `main` (confirm with platform team whether CI-triggered deploy or a gated deploy is their standard — `PLATFORM-TEAM-REQUIREMENTS.md` §2 P1).
3. Point `storefront.headout.com` (ask #2) at the Railway service.
4. Deploy. Verify `/api/healthz` (the configured healthcheck path) responds, then walk the three journeys by hand in the real deployed environment: discover → scope → modality routing; register-a-tool; browse.
5. Verify login actually round-trips through Ory → Guardian → the app, in the real domain (this cannot be fully verified until the custom domain is live, per §0.1).

### 2.5 Clean up scratch state

- Delete `.guardian-kit-tmp` and `.headauth-tmp` once the patterns/code above have been extracted — they're reference clones, not app code, and shouldn't be committed.
- `.codex/` is unrelated tooling config; leave it out of any commit (check `.gitignore` covers it, or remove it if it's just local scratch).

### 2.6 Phase 1 exit checklist

- [ ] All 5 currently-uncommitted diffs (`app.ts`, `anthropicClient.ts`, `client.ts`, `pnpm-workspace.yaml`, `lib/db/package.json`) committed
- [ ] `Dockerfile`, `railway.json`, `.dockerignore`, `lib/db/scripts/` committed
- [ ] Real `ANTHROPIC_API_KEY` set in Railway; eval `AI_READY` gates fixed to not key off the Replit var name
- [ ] Railway Postgres provisioned, pgvector confirmed working, `migrate` + `seed:real` run successfully
- [ ] Guardian `STOREFRONT` application registered; `storefront.headout.com` live and pointed at Railway
- [ ] Full Guardian/Ory auth rewrite done and verified end-to-end on the real domain (not just locally)
- [ ] `sessionsTable` and `lib/replit-auth-web` removed once auth is verified stable
- [ ] `.guardian-kit-tmp`, `.headauth-tmp` deleted
- [ ] Eval harness (`e2eConversations.ts`) run against the live deploy and behaviorally matches the last known-good Replit run

---

## 3. Phase 2 — Wire the rest of the Headout tool/skill landscape

Most of the "seed the catalogue with Headout's tools" work is already done in code (§0, `realSeedData.ts`) — running `seed:real` in §2.1 covers content. What's left is *agent-side wiring*, not catalogue content:

1. **Give Storefront's own agents Delphi access.** Per `AGENT-TOOL-DEPENDENCIES.md`, this means a PR to the `HeadoutAgentsConfig` repo adding Delphi to the relevant `.mcp.json` — not custom plumbing in this repo. This is the single highest-leverage upgrade to the critique/scope agent (Headout-grounded advice vs. generic PM advice).
2. **Confirm current Zeps connector/capability list** before the scope agent keeps recommending Zeps for things it can't actually do yet (some connectors were still being wired per the hackathon writeup) — ask Rajasekhar or check via Delphi.
3. **Decide the Product OS boundary.** Product OS already does PRD generation/ideation/validation — overlaps the critique/scope agent. Decide: hand off to it for deep PRD work, or stay deliberately lighter (quick scope → brief). Don't build a second Product OS by accident.
4. **Decide the scope agent's reuse of `feature-interview-ho`.** Per the Delphi audit, `feature-interview-ho` (+ `feature-interview-agent-ho`) already does ~80% of structured requirements-gathering. Storefront's actual distinctive value is the *front* of the funnel (reuse-check → kill-or-reshape → modality choice) that hands off to `feature-interview-ho` for the spec, not a second implementation of the interview.
5. **Get the Guardian setup skill** (`guardian-auth`, fully read out of `.guardian-kit-tmp/.agents/skills/guardian-auth/SKILL.md` during this audit) baked into the future scaffolding template — this is the actual skill referenced as "Rohan sharing" in `CLAUDE.md`; it's already in hand via the starter-kit clone, so this ask can be closed rather than chased.
6. Seed refresh cadence decision (see open question in §5).

---

## 4. Phase 3 — Governance and hardening (post-launch, not blocking go-live)

Carried over from `PLATFORM-TEAM-REQUIREMENTS.md` §8 — explicitly not required for Phase 1 to ship, but needed before wider rollout:

- Resolve the **three-gates design** (publisher listing approval, ship-to-catalogue review, per-tool access approval) — currently an open design question, not just a platform ask.
- Get the org's **security standards/checklist** so template CI can enforce real rules (v1 substitute for Vulcan, which can't gate).
- Name the **human reviewer(s)** for Storefront-shipped tools.
- **Approved third-party vendor + PII data-policy list**, so the scope agent only ever recommends sanctioned vendors.
- Monitoring/alerting standard for deployed tools, so the Gateway's kill-switch/incident path has something real to hook into.
- Vulcan v2 (structured verdict, gate-capable) — roadmap item, revisit when it exists.

---

## 5. Open decisions that need a person, not more code

- **Catalogue seed refresh cadence** — one-time `seed:real` run, or scheduled resync against HeadoutAgentsConfig's `bundles.json`/GitHub org audit? Nothing currently automates this.
- **Mobile auth** (ask #5) — does Storefront need it? If not, drop the token-exchange routes instead of porting them to Guardian.
- **Deploy gating** — fully CI-auto-deploy on push to `main`, or a manual/gated promotion step? Affects how much of `railway.json`'s deploy config is "real" vs. aspirational.
- **`@headout/headauth` adoption** — use the package wholesale (pulls in Jotai + its bootstrap-before-mount sequencing) vs. port just the pattern into the existing `auth-context.tsx` shape (recommended in §2.3, smaller diff, no new state-management dependency). Worth a quick decision before starting the auth rewrite, since it changes the shape of the PR.

---

## Docs this plan complements

- `PLATFORM-TEAM-REQUIREMENTS.md`/`AGENT-TOOL-DEPENDENCIES.md` — source material for §1 and §3, cross-referenced above with what's now resolved vs. still open.
