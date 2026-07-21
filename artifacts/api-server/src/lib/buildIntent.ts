/**
 * Detect committed build intent vs exploratory "can I build…?" questions.
 * Exploratory asks stay on the discovery/concierge path; committed ones take
 * the deterministic search-then-scope route.
 */

const BUILD_INTENT_PATTERNS: RegExp[] = [
  /^(?:please\s+)?build\s+(?:me\s+)?(?:a|an|my|our|some|something)\b/i,
  /\bbuild\s+me\b/i,
  /\bwant(?:ing)?\s+to\s+build\b/i,
  /\btrying\s+to\s+build\b/i,
  /\bhelp\s+me\s+build\b/i,
  /\blet'?s\s+build\b/i,
  /\bi(?:'m| am)\s+building\b/i,
  /\bwant(?:ing)?\s+to\s+create\s+(?:a|an|my)\s+(?:tool|app)\b/i,
  /\bscope\s+(?:an|the|my)\s+idea\b/i,
  /\bnew\s+internal\s+tool\b/i,
  /\blet'?s\s+scope\b/i,
  /\byes[,.]?\s+(?:please[,.]?\s+)?(?:let'?s\s+)?(?:scope|build)\b/i,
  /\bhow\s+do\s+we\s+(?:start\s+)?(?:building|scoping)\b/i,
  /\bready\s+to\s+(?:build|scope)\b/i,
  /\bi(?:'m| am)\s+ready\b/i,
  /\bwhat\s+do\s+we\s+do\s+next\b/i,
];

const EXPLORATORY_BUILD_PATTERNS: RegExp[] = [
  /^(?:can|could|should|may|might|would)\s+(?:i|we)\s+build\b/i,
  /\bis\s+it\s+(?:possible|worth)\s+to\s+build\b/i,
  /\bshould\s+(?:i|we)\s+(?:build|create)\b/i,
];

/** Affirm leaving discovery → critique/scope loop (same as the fork chip). */
const SCOPE_AFFIRM_PATTERNS: RegExp[] = [
  /\blet'?s\s+scope\b/i,
  /\byes[,.]?\s+(?:please[,.]?\s+)?(?:let'?s\s+)?(?:scope|build)\b/i,
  /\bi\s+want\s+to\s+build\s+it\b/i,
  /\bhow\s+do\s+we\s+(?:start\s+)?(?:building|scoping)\b/i,
  /\bready\s+to\s+(?:build|scope)\b/i,
  /\bi(?:'m| am)\s+ready\b/i,
  /\blet'?s\s+get\s+started\b/i,
  /\bget\s+started\b/i,
  /\bwhat\s+do\s+we\s+do\s+next\b/i,
  /\bwhat(?:'s| is)\s+next\b/i,
  /\bgo\s+ahead\b/i,
  /\bgo\s+ahead\s+and\s+(?:scope|build)\b/i,
  /^scope\s+it\.?$/i,
  /^let'?s\s+do\s+it\.?$/i,
];

/** Rejected the catalogue match(es) just shown. */
const MATCH_REJECTION_PATTERNS: RegExp[] = [
  /\bdoesn'?t\s+match\b/i,
  /\bdon'?t\s+match\b/i,
  /\bnot\s+what\s+i\b/i,
  /\bnone\s+of\s+(?:these|them|those)\b/i,
  /\bno(?:pe|t)\s+(?:quite\s+|really\s+)?(?:it|this|that|a\s+fit)\b/i,
  /^(?:no|nope|nah)(?:[.,!]|\s+)/i,
  /\bi\s+don'?t\s+want\s+(?:everything|all\s+(?:of\s+)?(?:that|this)|the\s+rest)\b/i,
  /\bi\s+don'?t\s+want\b[\s\S]{0,60}\bproduct\s+os\b/i,
  /\btoo\s+(?:broad|much|big|heavy)\b/i,
  /\bruled\s+out\b/i,
  /\bnot\s+product\s+os\b/i,
  /\bwithout\s+product\s+os\b/i,
  /\bjust\s+want\s+something\s+(?:that|to|for)\b/i,
];

/** User is clearly asking to search/browse instead of scoping a build. */
const OFF_SCOPE_REDIRECT_PATTERNS: RegExp[] = [
  /\bshow\s+me\b/i,
  /\bsearch\s+for\b/i,
  /\bbrowse\b/i,
  /\blist\s+all\b/i,
  /\btell\s+me\s+more\s+about\b/i,
  /\bwho\s+owns\b/i,
  /\bwhat\s+(?:tools|mcps|skills)\b/i,
];

export function isBuildIntent(text: string): boolean {
  const trimmed = text.trim();
  if (EXPLORATORY_BUILD_PATTERNS.some((re) => re.test(trimmed))) return false;
  return BUILD_INTENT_PATTERNS.some((re) => re.test(trimmed));
}

export function isScopeAffirm(text: string): boolean {
  return SCOPE_AFFIRM_PATTERNS.some((re) => re.test(text.trim()));
}

export function isMatchRejection(text: string): boolean {
  return MATCH_REJECTION_PATTERNS.some((re) => re.test(text.trim()));
}

export function isOffScopeRedirect(text: string): boolean {
  return OFF_SCOPE_REDIRECT_PATTERNS.some((re) => re.test(text.trim()));
}

/** Assistant said the catalogue doesn't cover this — next turn should scope. */
export function isGapAcknowledgement(message: string): boolean {
  return /nothing.{0,100}(?:covers|fits|in the catalogue)|(?:real|clear)\s+gap|gap\s+here|you'?ve already ruled out|doesn'?t seem to be what|let'?s scope (?:a |it |the )?(?:build|lightweight|focused)?|scope (?:a |the )?build for/i.test(
    message,
  );
}
