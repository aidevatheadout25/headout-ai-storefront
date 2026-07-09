/**
 * Regression: typed input during an active Builder journey phase (scaffold /
 * checklist / review) must be handled in journey context and must NEVER fall
 * through to the concierge — the concierge has no build context and denies
 * the request (e.g. "is it good to publish?" -> "I can't review code, reach
 * out to your team"), even though reviewing/publishing a built tool is the
 * product's core Gateway-phase capability.
 *
 * The routing/classification logic lives in the storefront package
 * (artifacts/storefront/src/components/HomeChat.tsx: isJourneyGuardPhase,
 * classifyJourneyIntent, journeyActionResponse, journeyQuestionResponse),
 * which isn't importable from here (a different package, a .tsx React
 * component, no shared build step). Following the same convention already
 * used in builderJourney.test.ts for the add-mode URL predicate, this test
 * duplicates the pure decision logic and pins it against the real transcript
 * case plus the other branches. If HomeChat.tsx's logic changes, update this
 * copy too.
 *
 * No LLM or network call involved — this is pure-function logic. Runs
 * unconditionally (no AI/DB skip guard needed).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

type JourneyPhase = "brief" | "scaffold" | "checklist" | "review" | "live" | null;

const JOURNEY_GUARD_PHASES: ReadonlySet<JourneyPhase> = new Set([
  "scaffold",
  "checklist",
  "review",
]);

function isJourneyGuardPhase(phase: JourneyPhase): boolean {
  return JOURNEY_GUARD_PHASES.has(phase);
}

type JourneyIntent = "action" | "off-journey" | "question";

const JOURNEY_ACTION_PATTERNS: RegExp[] = [
  /\b(publish|launch it|ship it|go live)\b/i,
  /\b(good|ready) to (publish|ship|go live)\b/i,
  /\b(run|kick off|start)\s+(the\s+)?review\b/i,
  /\bsubmit\b.*\breview\b/i,
  /\breview\s+it\b/i,
  /\bis it (good|ready)\b/i,
];

const JOURNEY_OFF_PATTERNS: RegExp[] = [
  /\b(search|look) for\b/i,
  /\bfind (a|another)\b/i,
  /\bregister (a |another )?(different )?tool\b/i,
  /\b(add|register) (my|another) (other )?tool\b/i,
  /\bshow me the (registry|catalogue|catalog)\b/i,
  /\b(never ?mind|forget it|start over)\b/i,
  /\b(a |another )?different (tool|idea|thing)\b/i,
  /\bnew (search|tool|idea)\b/i,
];

function classifyJourneyIntent(text: string): JourneyIntent {
  if (JOURNEY_ACTION_PATTERNS.some((re) => re.test(text))) return "action";
  if (JOURNEY_OFF_PATTERNS.some((re) => re.test(text))) return "off-journey";
  return "question";
}

function journeyActionResponse(phase: JourneyPhase): string {
  if (phase === "review") {
    return "The review's already running — CI, secrets scan, auth rules, security policy, and a deploy smoke test. I'll flag it here the moment it passes and ships live.";
  }
  return "Finish the checklist below first, then I'll run the review — that's the safety check before it goes live.";
}

function journeyQuestionResponse(phase: JourneyPhase): string {
  if (phase === "review") {
    return "The review's running now — it checks CI, secrets, auth rules, security policy, and does a deploy smoke test. I'll let you know here the moment it's done, and it ships live automatically if it passes.";
  }
  return "Your repo's scaffolded — work through the checklist below, then I'll run the review automatically and ship it live once it passes.";
}

/** Phrases the old (buggy) concierge fallback used — none of these must appear in a journey-context reply. */
const DENIAL_PHRASES = [
  "outside what i can do",
  "i don't have access",
  "i can't review",
  "i cannot review",
  "reach out to your team",
  "i can only help you discover",
];

function containsDenial(text: string): boolean {
  const lower = text.toLowerCase();
  return DENIAL_PHRASES.some((phrase) => lower.includes(phrase));
}

describe("journey input guard — phase gating", () => {
  test("scaffold, checklist, and review are guarded phases", () => {
    assert.equal(isJourneyGuardPhase("scaffold"), true);
    assert.equal(isJourneyGuardPhase("checklist"), true);
    assert.equal(isJourneyGuardPhase("review"), true);
  });

  test("brief, live, and null are NOT guarded — input there still reaches the concierge", () => {
    assert.equal(isJourneyGuardPhase("brief"), false);
    assert.equal(isJourneyGuardPhase("live"), false);
    assert.equal(isJourneyGuardPhase(null), false);
  });
});

describe("journey input guard — the exact transcript case", () => {
  const TRANSCRIPT_MESSAGE =
    "pull the latest code review and let me know if it's good to publish.";

  test('"is it good to publish" while at the review phase classifies as an action, not a question the concierge should field', () => {
    assert.equal(classifyJourneyIntent(TRANSCRIPT_MESSAGE), "action");
  });

  test("the journey-context reply for that action never denies the capability", () => {
    const reply = journeyActionResponse("review");
    assert.ok(
      !containsDenial(reply),
      `journey action reply must not deny the publish/review capability, got: ${reply}`,
    );
    // Must reference the actual in-flight review, not a generic brush-off.
    assert.match(reply.toLowerCase(), /review/);
  });
});

describe("journey input guard — action bucket", () => {
  for (const phrase of [
    "publish it",
    "ship it",
    "is it ready to go live?",
    "can you run the review now?",
    "submit this for review",
  ]) {
    test(`"${phrase}" classifies as action`, () => {
      assert.equal(classifyJourneyIntent(phrase), "action");
    });
  }

  test("pre-review phase (scaffold) points to the checklist, not a denial", () => {
    const reply = journeyActionResponse("scaffold");
    assert.ok(!containsDenial(reply));
    assert.match(reply.toLowerCase(), /checklist/);
  });
});

describe("journey input guard — off-journey bucket", () => {
  for (const phrase of [
    "actually, search for something else",
    "register a different tool instead",
    "never mind, forget it",
    "show me the registry",
  ]) {
    test(`"${phrase}" classifies as off-journey`, () => {
      assert.equal(classifyJourneyIntent(phrase), "off-journey");
    });
  }
});

describe("journey input guard — question bucket (default)", () => {
  for (const phrase of [
    "what's in the repo?",
    "what happens next?",
    "what does the review actually check?",
  ]) {
    test(`"${phrase}" classifies as a question, not off-journey or action`, () => {
      assert.equal(classifyJourneyIntent(phrase), "question");
    });
  }

  test("the journey-context answer never denies the capability", () => {
    const reply = journeyQuestionResponse("review");
    assert.ok(!containsDenial(reply));
  });
});
