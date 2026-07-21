/**
 * Expand known acronyms / collisions before embedding a search query.
 * Biggest real failure mode: "PRD" (product requirements) → GitHub PR skills
 * (`pr-describe`, `create-pr`) because embeddings treat "PR"/"describe" as close.
 */

const GITHUB_PR_SKILL_NAMES = new Set([
  "create-pr",
  "pr-describe",
  "resolve-pr-comments",
  "harden-pr",
]);

export function expandSearchQuery(query: string): string {
  let expanded = query.trim();
  if (!expanded) return expanded;

  if (/\bPRDs?\b/i.test(expanded) || /\bproduct\s+requirements?\b/i.test(expanded)) {
    expanded = expanded.replace(/\bPRDs?\b/gi, "product requirements document (PRD)");
    if (!/pull\s*request/i.test(expanded)) {
      expanded = `${expanded} — writing a product requirements document, not a GitHub pull request`;
    }
  }

  return expanded;
}

/** True when the ask is about product requirements docs, not GitHub PRs. */
export function isPrdShapedQuery(query: string): boolean {
  return /\bPRDs?\b/i.test(query) || /\bproduct\s+requirements?\b/i.test(query);
}

/**
 * Drop GitHub Pull-Request skills from PRD-shaped searches. Embeddings alone
 * still rank create-pr / pr-describe high even after query expansion.
 */
export function excludeGitHubPrSkillsForPrdQuery<T extends { name: string }>(
  query: string,
  tools: T[],
): T[] {
  if (!isPrdShapedQuery(query)) return tools;
  return tools.filter((t) => !GITHUB_PR_SKILL_NAMES.has(t.name.toLowerCase()));
}
