import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for user-supplied URLs that the server will fetch.
 *
 * The add-tool-by-URL flow fetches an arbitrary, user-controlled URL to give
 * the LLM page context. Without guards that lets a caller probe internal
 * services (cloud metadata endpoints, loopback admin panels, link-local, etc.).
 * We therefore allow only http(s), resolve the hostname, and reject any address
 * that resolves into a private/loopback/link-local/reserved range — re-checking
 * on every redirect hop.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);

/** True only for http/https URLs — safe to store and render as an outbound link. */
export function isSafeLinkScheme(rawUrl: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this" network
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (norm === "::1" || norm === "::") return true; // loopback / unspecified
  if (norm.startsWith("fe80")) return true; // link-local
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true; // unique local
  // IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const mapped = norm.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return true; // unknown form → treat as unsafe
}

/**
 * Validate a single URL: must be http(s) and its hostname must resolve only to
 * public addresses. Throws {@link UnsafeUrlError} otherwise.
 */
export async function assertSafePublicUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }
  if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname.toLowerCase() === "localhost") {
    throw new UnsafeUrlError("URL host is not allowed");
  }

  // If the host is a literal IP, check it directly; otherwise resolve DNS.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new UnsafeUrlError("URL resolves to a private address");
    }
    return;
  }

  let records: { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeUrlError("Could not resolve URL host");
  }
  if (records.length === 0 || records.some((r) => isPrivateAddress(r.address))) {
    throw new UnsafeUrlError("URL resolves to a private address");
  }
}

/**
 * Fetch a URL with SSRF protection: validates the URL and every redirect hop
 * against {@link assertSafePublicUrl} before following it.
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number; maxRedirects?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, maxRedirects = 4, ...rest } = init;
  let currentUrl = rawUrl;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await assertSafePublicUrl(currentUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        ...rest,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    return res;
  }
  throw new UnsafeUrlError("Too many redirects");
}
