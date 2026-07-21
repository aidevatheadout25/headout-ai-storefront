import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { expandSearchQuery, excludeGitHubPrSkillsForPrdQuery } from "../lib/searchQuery";
import {
  isBuildIntent,
  isGapAcknowledgement,
  isMatchRejection,
  isScopeAffirm,
} from "../lib/buildIntent";

describe("expandSearchQuery — PRD vs GitHub PR", () => {
  test("expands PRD and disambiguates from pull requests", () => {
    const out = expandSearchQuery(
      "an app where a user describes what they want and we give out a prd",
    );
    assert.match(out, /product requirements document \(PRD\)/i);
    assert.match(out, /not a GitHub pull request/i);
    assert.doesNotMatch(out, /give out a prd/i);
  });

  test("leaves non-PRD queries unchanged", () => {
    const q = "open a pull request for this branch";
    assert.equal(expandSearchQuery(q), q);
  });

  test("excludes GitHub PR skills from PRD-shaped result sets", () => {
    const filtered = excludeGitHubPrSkillsForPrdQuery("write better PRDs", [
      { name: "Product OS" },
      { name: "create-pr" },
      { name: "pr-describe" },
    ]);
    assert.deepEqual(
      filtered.map((t) => t.name),
      ["Product OS"],
    );
  });
});

describe("isBuildIntent — exploratory vs committed", () => {
  test("rejects exploratory can/could/should I build", () => {
    assert.equal(
      isBuildIntent(
        "Can I build an app where a user describes what they want and we give out a prd?",
      ),
      false,
    );
  });

  test("accepts committed build intent", () => {
    assert.equal(
      isBuildIntent("I want to build a tool that sources HR candidates"),
      true,
    );
  });
});

describe("scope handoff phrases", () => {
  test("I am ready / what next are scope affirms", () => {
    assert.equal(isScopeAffirm("I am ready"), true);
    assert.equal(isScopeAffirm("Ok so what do we do next?"), true);
    assert.equal(isBuildIntent("I am ready"), true);
  });

  test("rejects Product OS phrasing counts as match rejection", () => {
    assert.equal(
      isMatchRejection(
        "Ok I don't want everything else given I just want something that my team could use to just write prds I don't want everything in Product OS",
      ),
      true,
    );
  });

  test("gap acknowledgement tolerates wording between catalogue and covers", () => {
    assert.equal(
      isGapAcknowledgement(
        "Nothing in the catalogue currently covers PRD standardisation specifically.",
      ),
      true,
    );
    assert.equal(
      isGapAcknowledgement(
        "Nothing in the catalogue covers focused PRD writing — just the Product OS skill you've already ruled out.",
      ),
      true,
    );
  });
});
