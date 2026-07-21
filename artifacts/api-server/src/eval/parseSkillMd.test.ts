import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSkillMd, SkillMdParseError } from "../lib/parseSkillMd";

describe("parseSkillMd", () => {
  it("parses name, description, and body from frontmatter", () => {
    const parsed = parseSkillMd(`---
name: guardian-auth
description: Integrate Guardian Auth (Ory) into a web app.
---

# Guardian Auth

Do the thing.
`);
    assert.equal(parsed.name, "guardian-auth");
    assert.match(parsed.description, /Guardian Auth/);
    assert.match(parsed.body, /# Guardian Auth/);
  });

  it("rejects files without frontmatter", () => {
    assert.throws(
      () => parseSkillMd("# Just a heading\n"),
      /paste a URL instead/i,
    );
  });

  it("rejects empty frontmatter without name/description", () => {
    assert.throws(
      () =>
        parseSkillMd(`---
author: someone
---

body
`),
      /name or description/i,
    );
  });
});
