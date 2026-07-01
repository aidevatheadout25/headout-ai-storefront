import { safeFetch } from "./urlGuard";
import { openai, OPENAI_MODEL } from "./openaiClient";
import { logger } from "./logger";

export interface CapabilityResult {
  supported: boolean | "unknown";
  source: string;
  checked_at: string;
}

/**
 * Test-only seam.  In production this object is untouched (its property is
 * null) and verifyCapability runs the real fetch + LLM path.  In tests, set
 * `_testOverrides.impl` to a stub before calling runChat — the function reads
 * this reference on every invocation so each test can supply a fresh value.
 *
 * ESM live-binding semantics make the mutable object the easiest cross-loader
 * seam: tests import the object and mutate its property; no mock.module needed.
 */
export const _testOverrides: {
  impl: ((platform: string, capability: string) => Promise<CapabilityResult>) | null;
} = { impl: null };

const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const REFRESH_LOOKAHEAD_MS = 24 * 60 * 60 * 1000; // refresh when < 24 h left
const REFRESH_INTERVAL_MS = 60 * 60 * 1000; // scan every hour

interface CacheEntry {
  platform: string;
  capability: string;
  result: CapabilityResult;
  expires: number;
}

const capabilityCache = new Map<string, CacheEntry>();

/**
 * Allowlist of vendor doc URLs for capability checks.
 * Only these origins are ever fetched — never general web search.
 */
const VENDOR_DOC_URLS: Record<string, string[]> = {
  claude: [
    "https://docs.claude.com",
    "https://anthropic.com/news",
  ],
  anthropic: [
    "https://docs.claude.com",
    "https://anthropic.com/news",
  ],
  chatgpt: [
    "https://platform.openai.com",
    "https://openai.com/index",
  ],
  openai: [
    "https://platform.openai.com",
    "https://openai.com/index",
  ],
};

function normalizePlatform(platform: string): string {
  return platform.toLowerCase().trim();
}

function getDocUrls(platform: string): string[] {
  const norm = normalizePlatform(platform);
  if (!norm) return [];
  if (VENDOR_DOC_URLS[norm]) return VENDOR_DOC_URLS[norm];
  for (const [key, urls] of Object.entries(VENDOR_DOC_URLS)) {
    if (norm.includes(key) || key.includes(norm)) return urls;
  }
  return [];
}

async function fetchPageText(url: string): Promise<string> {
  const res = await safeFetch(url, { timeoutMs: 8000 });
  if (!res.ok) return "";
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

/**
 * Core fetch + LLM logic — no cache read/write. Always returns a
 * CapabilityResult; supported may be "unknown" when doc pages are unreachable
 * or the LLM call fails.
 */
async function fetchFreshResult(
  platform: string,
  capability: string,
): Promise<CapabilityResult> {
  // Test-seam: if a stub has been installed (by unit tests only), delegate
  // immediately — bypasses network, cache, and LLM calls.
  if (_testOverrides.impl) {
    return _testOverrides.impl(platform, capability);
  }

  const docUrls = getDocUrls(platform);
  let pageText = "";
  let sourceUrl = "";

  for (const url of docUrls) {
    try {
      const text = await fetchPageText(url);
      if (text.length > 200) {
        pageText = text;
        sourceUrl = url;
        break;
      }
    } catch (err) {
      logger.warn({ url, err }, "verify_capability: failed to fetch doc page, trying next");
    }
  }

  if (!pageText) {
    return {
      supported: "unknown",
      source: "",
      checked_at: new Date().toISOString(),
    };
  }

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content:
            'You are a factual assistant. Given a vendor documentation snippet, determine whether the platform supports the specified capability. Reply ONLY with a JSON object using this exact shape: {"supported": true|false|"unknown", "evidence": "<one sentence from the text confirming or denying the capability, or \\"not found\\" if no clear mention>"}\nDo NOT add any other keys or prose.',
        },
        {
          role: "user",
          content: `Platform: ${platform}\nCapability to check: ${capability}\n\nDocumentation snippet (from ${sourceUrl}):\n${pageText}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { supported?: unknown; evidence?: string } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const supported: boolean | "unknown" =
      typeof parsed.supported === "boolean" ? parsed.supported : "unknown";

    return {
      supported,
      source: sourceUrl,
      checked_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(
      { platform, capability, sourceUrl, err },
      "verify_capability: LLM call failed, returning unknown",
    );
    return {
      supported: "unknown",
      source: sourceUrl,
      checked_at: new Date().toISOString(),
    };
  }
}

/**
 * Check whether a platform supports a given capability by consulting the
 * vendor's own documentation pages (allowlist only). Results are cached
 * in-process with a 14-day TTL.
 *
 * Every call is logged with platform, capability, result, and cache-hit status
 * so that drift can be detected over time.
 */
export async function verifyCapability(
  platform: string,
  capability: string,
): Promise<CapabilityResult> {
  const cacheKey = `${normalizePlatform(platform)}::${capability.toLowerCase().trim()}`;
  const now = Date.now();

  const cached = capabilityCache.get(cacheKey);
  if (cached && cached.expires > now) {
    logger.info(
      { platform, capability, result: cached.result, cacheHit: true },
      "verify_capability cache hit",
    );
    return cached.result;
  }

  const result = await fetchFreshResult(platform, capability);

  logger.info(
    { platform, capability, result, cacheHit: false },
    "verify_capability result",
  );
  capabilityCache.set(cacheKey, { platform, capability, result, expires: now + CACHE_TTL_MS });
  return result;
}

/**
 * Start a background scheduler that proactively refreshes cached capability
 * entries approaching their TTL expiry (within 24 h). Enabled only when the
 * CAPABILITY_REFRESH_ENABLED env var is set to a truthy value.
 *
 * Entries where the `supported` value flips are logged at WARN level so
 * operator alerts can be wired up downstream.
 *
 * Returns a cleanup function that cancels the interval.
 */
export function startCapabilityRefreshScheduler(): (() => void) | null {
  const enabled = process.env["CAPABILITY_REFRESH_ENABLED"];
  if (!enabled || enabled === "false" || enabled === "0") {
    logger.info(
      "verify_capability scheduler: disabled (set CAPABILITY_REFRESH_ENABLED=true to enable)",
    );
    return null;
  }

  logger.info(
    { intervalMs: REFRESH_INTERVAL_MS, lookaheadMs: REFRESH_LOOKAHEAD_MS },
    "verify_capability scheduler: starting",
  );

  const runRefresh = async () => {
    const now = Date.now();
    const candidates: Array<{ key: string; entry: CacheEntry }> = [];

    for (const [key, entry] of Array.from(capabilityCache.entries())) {
      const timeLeft = entry.expires - now;
      if (timeLeft > 0 && timeLeft <= REFRESH_LOOKAHEAD_MS) {
        candidates.push({ key, entry });
      }
    }

    if (candidates.length === 0) {
      logger.debug("verify_capability scheduler: no entries near expiry, skipping");
      return;
    }

    logger.info(
      { count: candidates.length },
      "verify_capability scheduler: refreshing near-expiry entries",
    );

    for (const { key, entry } of candidates) {
      try {
        const fresh = await fetchFreshResult(entry.platform, entry.capability);
        const oldSupported = entry.result.supported;
        const newSupported = fresh.supported;

        if (newSupported === "unknown" && oldSupported !== "unknown") {
          logger.warn(
            {
              platform: entry.platform,
              capability: entry.capability,
              oldSupported,
              reason: "transient_unknown",
            },
            "verify_capability scheduler: refresh returned unknown — keeping prior definitive result, extending TTL",
          );
          capabilityCache.set(key, {
            platform: entry.platform,
            capability: entry.capability,
            result: entry.result,
            expires: now + CACHE_TTL_MS,
          });
          continue;
        }

        if (oldSupported !== newSupported) {
          logger.warn(
            {
              platform: entry.platform,
              capability: entry.capability,
              oldSupported,
              newSupported,
              source: fresh.source,
            },
            "verify_capability scheduler: capability answer flipped — cache updated",
          );
        } else {
          logger.info(
            {
              platform: entry.platform,
              capability: entry.capability,
              supported: newSupported,
            },
            "verify_capability scheduler: entry refreshed, no change",
          );
        }

        capabilityCache.set(key, {
          platform: entry.platform,
          capability: entry.capability,
          result: fresh,
          expires: now + CACHE_TTL_MS,
        });
      } catch (err) {
        logger.warn(
          { platform: entry.platform, capability: entry.capability, err },
          "verify_capability scheduler: refresh attempt failed, keeping old entry",
        );
      }
    }
  };

  const handle = setInterval(() => {
    void runRefresh().catch((err) =>
      logger.error({ err }, "verify_capability scheduler: unexpected error"),
    );
  }, REFRESH_INTERVAL_MS);

  handle.unref();

  return () => {
    clearInterval(handle);
    logger.info("verify_capability scheduler: stopped");
  };
}
