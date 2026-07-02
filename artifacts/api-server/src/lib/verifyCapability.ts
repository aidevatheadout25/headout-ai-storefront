import { safeFetch } from "./urlGuard";
import { anthropic, CLAUDE_MODEL } from "./anthropicClient";
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

/**
 * Hardcoded baseline for well-known, stable platform capabilities.
 * These facts don't change month-to-month and the vendor doc homepages don't
 * explicitly enumerate them, so a live fetch would return "unknown" and
 * accidentally cause the AI to recommend building something unnecessary.
 *
 * Both the platform and capability pattern must match (case-insensitive).
 * Checked before the cache and network — always wins.
 */
const KNOWN_TRUE: Array<{ platform: RegExp; capability: RegExp }> = [
  // Claude / Anthropic — file generation (Word, Excel, PDF, CSV, PowerPoint, any format)
  {
    platform: /claude|anthropic/,
    capability: /\b(word|\.docx?|doc\s+file|excel|\.xlsx?|spreadsheet|pdf|powerpoint|\.pptx?|csv|tsv|file\s+format|file\s+output|output.*file|generate.*file|create.*file|download.*file|file.*download)/,
  },
  // Claude — code execution
  {
    platform: /claude|anthropic/,
    capability: /(execut|run|sandbox).{0,20}(code|python|script|notebook)|code.{0,20}(execut|run|sandbox)/,
  },
  // Claude — web browsing
  {
    platform: /claude|anthropic/,
    capability: /(browse|search|fetch|access).{0,20}(web|internet|url|page|site)|web.{0,20}(browse|search)/,
  },
  // ChatGPT / OpenAI — file generation
  {
    platform: /chatgpt|openai|gpt/,
    capability: /\b(word|\.docx?|doc\s+file|excel|\.xlsx?|spreadsheet|pdf|powerpoint|\.pptx?|csv|tsv|file\s+format|file\s+output|output.*file|generate.*file|create.*file|download.*file|file.*download)/,
  },
  // ChatGPT — code execution / Advanced Data Analysis
  {
    platform: /chatgpt|openai|gpt/,
    capability: /(execut|run|sandbox).{0,20}(code|python|script)|code.{0,20}(execut|run|sandbox)|advanced data analysis|code interpreter/,
  },
  // ChatGPT — web browsing
  {
    platform: /chatgpt|openai|gpt/,
    capability: /(browse|search|fetch|access).{0,20}(web|internet|url|page|site)|web.{0,20}(browse|search)/,
  },
];

function checkKnownCapabilities(
  platform: string,
  capability: string,
): CapabilityResult | null {
  const normPlatform = platform.toLowerCase();
  const normCapability = capability.toLowerCase();
  for (const known of KNOWN_TRUE) {
    if (known.platform.test(normPlatform) && known.capability.test(normCapability)) {
      return {
        supported: true,
        source: "known-capabilities-baseline",
        checked_at: new Date().toISOString(),
      };
    }
  }
  return null;
}

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
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 300,
      system:
        'You are a factual assistant. Given a vendor documentation snippet, determine whether the platform supports the specified capability. Reply ONLY with a JSON object using this exact shape: {"supported": true|false|"unknown", "evidence": "<one sentence from the text confirming or denying the capability, or \\"not found\\" if no clear mention>"}\nDo NOT add any other keys or prose.',
      messages: [
        {
          role: "user",
          content: `Platform: ${platform}\nCapability to check: ${capability}\n\nDocumentation snippet (from ${sourceUrl}):\n${pageText}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock?.type === "text" ? textBlock.text.trim() : "{}";

    let parsed: { supported?: unknown; evidence?: string } = {};
    try {
      parsed = JSON.parse(raw) as { supported?: unknown; evidence?: string };
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
  if (_testOverrides.impl) {
    return _testOverrides.impl(platform, capability);
  }

  const knownResult = checkKnownCapabilities(platform, capability);
  if (knownResult) {
    logger.info(
      { platform, capability, result: knownResult },
      "verify_capability: known-baseline hit, skipping network",
    );
    return knownResult;
  }

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
