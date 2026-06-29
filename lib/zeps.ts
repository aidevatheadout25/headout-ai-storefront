/**
 * Zeps integration.
 *
 * Zeps (https://zeps-taupe.vercel.app) is the external no-code builder + runtime.
 * Storefront does NOT host or run agents — it lists them and hands off to Zeps:
 *
 *   1. BUILD  — a "planned" tool / unmet need deeplinks into the Zeps builder,
 *               prefilled with the need. Zeps builds it conversationally.
 *   2. RUN    — a built Zep is listed as a `zep`-type tool whose `link` opens it
 *               in Zeps. Zeps is caller-bound, so it runs as whoever clicks.
 *
 * The only things we need from the Zeps team: a builder deeplink that accepts a
 * prefilled prompt, and (later) a publish-back call so a finished Zep lists itself.
 */

export const ZEPS_BASE_URL = "https://zeps-taupe.vercel.app";

/** Where the conversational builder lives. */
const ZEPS_BUILDER_PATH = "/build";

export type ZepsBuilderPrefill = {
  /** Suggested name for the agent. */
  name?: string;
  /** Opening prompt — what the agent should do. */
  prompt?: string;
  /** Where the need came from, for attribution back to Storefront. */
  source?: string;
};

/** Build a deeplink into the Zeps builder, prefilled with the need. */
export function buildZepsBuilderUrl(prefill: ZepsBuilderPrefill = {}): string {
  const url = new URL(ZEPS_BUILDER_PATH, ZEPS_BASE_URL);
  if (prefill.name) url.searchParams.set("name", prefill.name);
  if (prefill.prompt) url.searchParams.set("prompt", prefill.prompt);
  url.searchParams.set("source", prefill.source ?? "storefront");
  return url.toString();
}

/** True if a pasted URL points at a Zeps-hosted agent (the run/publish-back link). */
export function isZepsUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host.includes("zeps");
  } catch {
    return false;
  }
}

export type ZepManifest = {
  name?: string;
  description?: string;
  requiredConnectors?: string[];
  skills?: string[];
  triggers?: string[];
  runtimeUrl?: string;
  id?: string;
};

function extractZepIdFromUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const markerIdx = segments.findIndex((segment) =>
      ["zep", "zeps", "z", "run", "agent"].includes(segment.toLowerCase()),
    );
    if (markerIdx >= 0 && segments[markerIdx + 1]) {
      return segments[markerIdx + 1];
    }
    if (segments.length > 0) {
      return segments[segments.length - 1] ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Load manifest from a Zeps runtime URL; fails soft if the read API is unavailable. */
export async function fetchZepManifest(input: string): Promise<ZepManifest | null> {
  const trimmed = input.trim();
  if (!trimmed || !isZepsUrl(trimmed)) return null;

  const id = extractZepIdFromUrl(trimmed);
  if (!id) {
    return { runtimeUrl: trimmed };
  }

  try {
    const res = await fetch(
      `${ZEPS_BASE_URL}/api/zeps/${encodeURIComponent(id)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) {
      return { runtimeUrl: trimmed, id };
    }
    const data = (await res.json()) as ZepManifest;
    return {
      ...data,
      id: data.id ?? id,
      runtimeUrl: data.runtimeUrl ?? trimmed,
    };
  } catch {
    return { runtimeUrl: trimmed, id };
  }
}

/** Parse an uploaded Zep JSON export. */
export function parseZepManifest(json: string): ZepManifest | null {
  try {
    const data = JSON.parse(json) as ZepManifest;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}
