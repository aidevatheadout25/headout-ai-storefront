---
name: Server-side fetch of user-supplied URLs
description: Any api-server fetch of a user-controlled URL must go through the SSRF guard, not bare fetch.
---

# SSRF guard for user-supplied URLs

The "+ Add a tool" flow takes a pasted URL and the api-server fetches that page
to give the LLM context. Any server-side fetch of a user-controlled URL must go
through `artifacts/api-server/src/lib/urlGuard.ts` (`safeFetch` /
`assertSafePublicUrl`) — never a bare `fetch(userUrl)`.

**Why:** a bare server fetch of an attacker-chosen URL is a classic SSRF: it can
probe loopback/admin panels and cloud metadata (e.g. `169.254.169.254`). The
guard enforces an http(s)-only allowlist, resolves DNS and blocks
private/loopback/link-local/CGNAT/reserved ranges, and re-validates every
redirect hop.

**How to apply:** when adding any new endpoint or feature that fetches a URL the
user provided, import `safeFetch`/`assertSafePublicUrl` and reject
`UnsafeUrlError` with a 400. Mirror the same idea on the frontend: only render
http(s) links as actionable (`isSafeToolLink` in `lib/toolMeta.ts`) so a stored
non-http scheme can't become a dangerous outbound link.
