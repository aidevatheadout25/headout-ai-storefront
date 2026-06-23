"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

const MCP_SNIPPET = `{
  "mcpServers": {
    "headout-storefront": {
      "url": "https://storefront.headout.tools/mcp",
      "tools": ["search_internal_tools"]
    }
  }
}`;

export function McpUsePanel() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(MCP_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="mcp-panel">
      <div className="mcp-panel__header">
        <h2 className="mcp-panel__title t-heading-md">Use via MCP</h2>
        <p className="mcp-panel__desc t-para-rg">
          Illustrative config — search the catalog from Claude Code without leaving
          your editor.
        </p>
      </div>
      <div className="mcp-panel__snippet-wrap">
        <pre className="mcp-panel__snippet t-para-sm">{MCP_SNIPPET}</pre>
        <button
          type="button"
          className="mcp-panel__copy btn btn--secondary btn--sm t-cta-sm"
          onClick={handleCopy}
        >
          <Icon name="checkmark" size={14} />
          {copied ? "Copied" : "Copy config"}
        </button>
      </div>
      <p className="mcp-panel__caption t-label-sm text-muted">
        search_internal_tools() — read-only
      </p>
    </section>
  );
}
