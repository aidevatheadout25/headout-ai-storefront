---
name: Add-tool dedup must precede the SSRF guard
description: Why POST /api/tools checks duplicates before the SSRF/fetch step
---

In the add-tool-by-URL route, the duplicate check (`findToolByUrl`, a pure
normalized-string lookup against `tools.normalized_url`) runs BEFORE the
SSRF `assertSafePublicUrl` + page fetch.

**Why:** The seeded/internal tool URLs (e.g. `internal.headout.com/...`) do not
resolve on the public internet, so the SSRF guard rejects them with "Could not
resolve URL host". If dedup ran after the guard, re-submitting an existing
internal tool would 400 instead of returning the existing entry. Doing dedup
first also skips the outbound fetch + LLM cost on duplicates.

**How to apply:** Keep the order — cheap scheme check (`isSafeLinkScheme`) →
dedup → SSRF assert → fetch/infer. Dedup relies on `normalizeUrl`
(api-server) and the `normalized_url` column being backfilled for every row;
seed/backfill must populate it or dedup silently misses.
