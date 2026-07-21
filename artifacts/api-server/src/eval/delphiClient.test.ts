import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  _testOverrides,
  callDelphiTool,
  isDelphiConfigured,
} from "../lib/delphiClient";

describe("delphiClient", () => {
  it("reports unconfigured when DELPHI_API_KEY is unset", () => {
    const prev = process.env.DELPHI_API_KEY;
    delete process.env.DELPHI_API_KEY;
    try {
      assert.equal(isDelphiConfigured(), false);
    } finally {
      if (prev !== undefined) process.env.DELPHI_API_KEY = prev;
    }
  });

  it("short-circuits callDelphiTool when unconfigured", async () => {
    const prev = process.env.DELPHI_API_KEY;
    const prevImpl = _testOverrides.impl;
    delete process.env.DELPHI_API_KEY;
    _testOverrides.impl = null;
    try {
      const result = await callDelphiTool("ask", { prompt: "what is leave policy?" });
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.unavailable, true);
        assert.match(result.error, /DELPHI_API_KEY/);
      }
    } finally {
      _testOverrides.impl = prevImpl;
      if (prev !== undefined) process.env.DELPHI_API_KEY = prev;
    }
  });

  it("honours _testOverrides.impl", async () => {
    const prevImpl = _testOverrides.impl;
    _testOverrides.impl = async (tool, args) => {
      assert.equal(tool, "find_repos");
      assert.equal(args.query, "pricing");
      return { ok: true, data: ["wall-street", "athena"] };
    };
    try {
      const result = await callDelphiTool("find_repos", { query: "pricing" });
      assert.deepEqual(result, { ok: true, data: ["wall-street", "athena"] });
    } finally {
      _testOverrides.impl = prevImpl;
    }
  });
});
