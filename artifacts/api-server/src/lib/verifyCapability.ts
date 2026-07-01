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

interface CacheEntry {
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
  // Test-seam: if a stub has been installed (by unit tests only), delegate
  // immediately — bypasses network, cache, and LLM calls.
  if (_testOverrides.impl) {
    return _testOverrides.impl(platform, capability);
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
    const result: CapabilityResult = {
      supported: "unknown",
      source: "",
      checked_at: new Date().toISOString(),
    };
    logger.info(
      { platform, capability, result, cacheHit: false, reason: "no_page_content" },
      "verify_capability result",
    );
    capabilityCache.set(cacheKey, { result, expires: now + CACHE_TTL_MS });
    return result;
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

    const result: CapabilityResult = {
      supported,
      source: sourceUrl,
      checked_at: new Date().toISOString(),
    };

    logger.info(
      { platform, capability, result, cacheHit: false },
      "verify_capability result",
    );
    capabilityCache.set(cacheKey, { result, expires: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    const result: CapabilityResult = {
      supported: "unknown",
      source: sourceUrl,
      checked_at: new Date().toISOString(),
    };
    logger.warn(
      { platform, capability, result, cacheHit: false, err },
      "verify_capability: LLM call failed, returning unknown",
    );
    capabilityCache.set(cacheKey, { result, expires: now + CACHE_TTL_MS });
    return result;
  }
}
