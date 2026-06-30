/**
 * Canonical form of a URL used for duplicate detection in the catalogue.
 *
 * Two links that point at the same resource but differ only cosmetically
 * (scheme case, a `www.` prefix, a trailing slash, a `#fragment`, or the
 * order of query params) must collapse to the same string so we never store
 * the same tool twice. Returns the lowercased origin + path + sorted query.
 * If the input cannot be parsed as a URL we fall back to a trimmed,
 * lowercased version of the raw string so dedup still has something stable.
 */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed.toLowerCase();
  }

  const protocol = parsed.protocol.toLowerCase();
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);

  const port = parsed.port && parsed.port !== "" ? `:${parsed.port}` : "";

  let path = parsed.pathname || "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const params = [...parsed.searchParams.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  const query =
    params.length > 0
      ? `?${params.map(([k, v]) => `${k}=${v}`).join("&")}`
      : "";

  return `${protocol}//${host}${port}${path}${query}`;
}
