/**
 * Shared tagging policy for the add-tool flow.
 *
 * Tags feed both semantic search (they are part of the embedding text) and the
 * registry facet filters, so weak tags hurt search *and* browsing. Humans never
 * type tags directly — the LLM proposes them and the user can only confirm or
 * correct them via the chat. These helpers are the deterministic safety net that
 * enforces the mechanical rules no matter what the model returns, plus the
 * policy text injected into the prompts that mint tags.
 */

/** Generic, low-signal tags that are always stripped. */
export const BANNED_TAGS: ReadonlySet<string> = new Set([
  "ai",
  "llm",
  "tool",
  "app",
  "automation",
  "productivity",
  "internal",
  "helper",
  "assistant",
  "general",
  "utility",
  "software",
]);

export const MIN_TAGS = 3;
export const MAX_TAGS = 6;

/** Lowercase + kebab-case a single raw tag; returns "" when nothing usable. */
function kebabCase(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic safety net for tags written from the add-tool flow. Lowercases,
 * kebab-cases, strips the banned generic list, drops empties/duplicates (order
 * preserved) and caps at {@link MAX_TAGS}. Runs on every write path regardless
 * of what the LLM returns, so a banned/misformatted tag can never be persisted.
 */
export function normalizeTags(raw: readonly unknown[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    if (typeof item !== "string") continue;
    const tag = kebabCase(item);
    if (!tag || BANNED_TAGS.has(tag) || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** True when normalization left too few tags to satisfy the policy. */
export function hasTooFewTags(tags: readonly string[]): boolean {
  return tags.length < MIN_TAGS;
}

/**
 * Resolve a model's raw tag proposal into a policy-compliant set, with one
 * recovery attempt. Normalizes the first proposal; if it falls below
 * {@link MIN_TAGS}, asks `regenerate` once for a fresh proposal (e.g. a stricter
 * reprompt), merges + normalizes both, and reports whether it still falls short.
 *
 * Pure aside from the injected `regenerate` callback, so the inference path can
 * guarantee 3–6 tags where possible and otherwise surface a `belowMin` state
 * rather than silently returning a weak set. A throwing/empty `regenerate`
 * degrades gracefully to the original proposal.
 */
export async function resolveInferredTags(
  rawTags: readonly unknown[] | undefined,
  regenerate: () => Promise<readonly unknown[]>,
): Promise<{ tags: string[]; belowMin: boolean }> {
  let tags = normalizeTags(rawTags);
  if (hasTooFewTags(tags)) {
    let retry: readonly unknown[] = [];
    try {
      retry = await regenerate();
    } catch {
      retry = [];
    }
    tags = normalizeTags([...tags, ...(Array.isArray(retry) ? retry : [])]);
  }
  return { tags, belowMin: hasTooFewTags(tags) };
}

/**
 * The tagging policy, in prose, for injection into any LLM prompt that mints
 * tags. Keep this aligned with {@link normalizeTags} / {@link BANNED_TAGS}.
 */
export const TAG_POLICY_PROMPT = `Tagging policy (STRICT — tags are facets people filter by and feed search):
- Tags must be SPECIFIC, high-signal facets a person would actually filter by:
  - systems / connectors it touches → bigquery, slack, notion, gmail, looker
  - domain / function → refunds, support-tickets, forecasting, seo
  - data entity / team / area → bookings, vendor, supply-ops
- BANNED generic tags — NEVER use these (they will be stripped): ${[...BANNED_TAGS].join(", ")}.
- Format: lowercase, kebab-case, between ${MIN_TAGS} and ${MAX_TAGS} tags, no duplicates or near-synonyms.
- REUSE existing vocabulary: before minting a new tag, prefer an existing catalogue tag over a near-synonym; invent a new tag only when nothing fits (e.g. reuse "support-tickets" rather than inventing "tickets").`;

/** Render the existing tag vocabulary for prompt injection. */
export function renderTagVocabulary(tags: readonly string[]): string {
  if (tags.length === 0) return "(catalogue has no tags yet)";
  return tags.join(", ");
}
