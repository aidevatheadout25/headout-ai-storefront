/**
 * Client-side mirrors of server scope/rejection matchers — keep in sync with
 * artifacts/api-server/src/lib/buildIntent.ts.
 */

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
  /\bjust\s+want\s+something\s+(?:that|to|for)\b/i,
];

const OFF_SCOPE_REDIRECT_PATTERNS: RegExp[] = [
  /\bshow\s+me\b/i,
  /\bsearch\s+for\b/i,
  /\bbrowse\b/i,
  /\blist\s+all\b/i,
  /\btell\s+me\s+more\s+about\b/i,
  /\bwho\s+owns\b/i,
  /\bwhat\s+(?:tools|mcps|skills)\b/i,
];

export function isScopeAffirm(text: string): boolean {
  return SCOPE_AFFIRM_PATTERNS.some((re) => re.test(text.trim()));
}

export function isMatchRejection(text: string): boolean {
  return MATCH_REJECTION_PATTERNS.some((re) => re.test(text.trim()));
}

export function isOffScopeRedirect(text: string): boolean {
  return OFF_SCOPE_REDIRECT_PATTERNS.some((re) => re.test(text.trim()));
}
