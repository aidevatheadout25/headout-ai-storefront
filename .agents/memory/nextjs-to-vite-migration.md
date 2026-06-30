---
name: Next.js → Vite compat shims
description: How an imported Next.js app-router project was ported to a Vite+React artifact without rewriting every component — emulating next/link and next/navigation on wouter.
---

When porting an imported Next.js (app-router) project to a `react-vite` artifact, instead of editing every component to use wouter idioms directly, build thin compat shims and `sed`-rewrite the import specifiers. This preserves component bodies verbatim (visual + functional parity) and keeps the diff small.

**Why:** The imported tree had 13 files importing `next/link` and 13 importing `next/navigation`. Rewriting each component's navigation calls by hand risks losing markup/styling and is error-prone. Shims + import rewrite is faithful and reversible.

**How to apply:**
- `src/compat/next-link.tsx` — default-export `Link` rendering an `<a>` whose onClick calls wouter's `useLocation()` navigate; bail out for external URLs, modifier-clicks, and `target=_blank`, and respect `event.defaultPrevented` (some callers pass their own onClick).
- `src/compat/next-navigation.tsx` — `useRouter()` ({push, replace, refresh (no-op — client state is reactive), back, forward, prefetch}), `useSearchParams()` (wraps wouter `useSearch()` in a `URLSearchParams`, reactive), `usePathname()` (wouter `useLocation()[0]`), `useParams()` (re-export wouter `useParams`), and `notFound()`/`redirect()` that throw a sentinel `NotFoundError`.
- `notFound()` is called during render → catch the sentinel with a class error boundary (`getDerivedStateFromError`) that renders the NotFound page; reset its state when the route key changes so navigation away recovers.
- Rewrite imports: `grep -rl 'from "next/link"' src | xargs sed -i 's#next/link#@/compat/next-link#'` (same for `next/navigation`). Strip `"use client"` directives.
- App-router page files (`app/**/page.tsx`) are authored fresh as `src/pages/*` wired into a wouter `<Switch>`; Next redirect pages become wouter `<Redirect>`. Query-only navigation on the same path re-renders because the page reads `useSearchParams()`.
- CSS/fonts: keep the design-system stylesheet in `public/` and link it from `index.html` with a **relative** href (`./design-system/...`) so the `@font-face` relative `url()`s and the production base path both resolve. The app's `globals.css` becomes `src/index.css` (no Tailwind needed if the app uses plain CSS classes).
- API routes: a Next route that gracefully falls back client-side (here `/api/analyze-zep` falls back to a deterministic mapping when the AI key is absent) can be ported as a self-contained Express route doing just the deterministic path — no need to wire the `ai` package or OpenAPI codegen for a single fetch-based endpoint. Strip the unused `ai` import from the client copy or the Vite build fails on the missing package.
