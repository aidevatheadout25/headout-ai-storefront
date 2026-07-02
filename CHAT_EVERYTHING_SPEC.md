# Everything Over Chat — Implementation Spec

## Vision

The chat is the entire product interface. Users should never need to navigate to another page to do anything on the platform. This spec extends the existing PM advisor chat to cover five additional capabilities: browsing the catalogue by facet, viewing full tool details, flagging broken or outdated tools, requesting access to restricted tools, and managing tools the user owns — all without leaving the chat.

The PM advisor system prompt and starter prompts from `CHAT_PROMPT_UPDATE.md` are already live. This spec builds on top of them.

---

## What changes

| File | Change |
|---|---|
| `lib/db/src/schema/tools.ts` | Add `toolFlagsTable` and `accessRequestsTable` |
| `lib/db/src/schema/index.ts` | Export new tables |
| `artifacts/api-server/src/lib/catalogue.ts` | Add `listToolsByFilter`, `insertToolFlag`, `insertAccessRequest`, `verifyManageToken` |
| `artifacts/api-server/src/routes/tools.ts` | Add `POST /api/tools/:id/flag` and `POST /api/tools/:id/access-request` |
| `artifacts/api-server/src/lib/chatAgent.ts` | Extended `runChat` signature, 5 new tool definitions, new handlers, extended system prompt |
| `artifacts/api-server/src/routes/chat.ts` | Pass user email into `runChat` |

No frontend changes. Tool cards already render from the `tools` array in `ChatResult` — the new tools reuse that same mechanism.

---

## Part A — New DB tables

**File:** `lib/db/src/schema/tools.ts`

Add the following two tables after the `insertToolSchema` export at the bottom of the file:

```ts
export const toolFlagsTable = pgTable("tool_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").notNull(),
  reason: text("reason").notNull().default("other"),
  details: text("details").notNull().default(""),
  reporterEmail: text("reporter_email").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accessRequestsTable = pgTable("access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  toolId: uuid("tool_id").notNull(),
  reason: text("reason").notNull().default(""),
  requesterEmail: text("requester_email").notNull().default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ToolFlagRow = typeof toolFlagsTable.$inferSelect;
export type AccessRequestRow = typeof accessRequestsTable.$inferSelect;
```

These are append-only audit tables. No foreign key constraint on `toolId` — we want flags and requests to survive even if a tool is deleted.

**File:** `lib/db/src/schema/index.ts`

The existing `export * from "./tools"` will pick up the new tables automatically. No change needed here.

**Migration:** Run `drizzle-kit push` (or `drizzle-kit generate` then apply) to create the two new tables. No existing data is affected.

---

## Part B — New catalogue library functions

**File:** `artifacts/api-server/src/lib/catalogue.ts`

### 1. Update imports at the top

The file already imports `and`, `asc`, `cosineDistance`, `desc`, `eq`, `getTableColumns`, `sql` from `drizzle-orm`, and `toolsTable` from `@workspace/db`. Add `toolFlagsTable` and `accessRequestsTable` to the db import:

```ts
import {
  db,
  toolsTable,
  toolFlagsTable,
  accessRequestsTable,
  type ToolRow,
  type InsertTool,
} from "@workspace/db";
```

### 2. Add `listToolsByFilter`

Add this after the existing `listTools` function:

```ts
export async function listToolsByFilter(opts: {
  type?: string;
  team?: string;
  limit?: number;
} = {}): Promise<ApiTool[]> {
  const conditions = [];
  if (opts.type) conditions.push(eq(toolsTable.type, opts.type));
  if (opts.team) conditions.push(eq(toolsTable.team, opts.team));

  const rows = await db
    .select()
    .from(toolsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(toolsTable.updatedAt))
    .limit(opts.limit ?? 20);

  return rows.filter((row) => canView(row)).map(rowToApiTool);
}
```

### 3. Add `insertToolFlag`

```ts
export async function insertToolFlag(data: {
  toolId: string;
  reason: string;
  details?: string;
  reporterEmail?: string;
}): Promise<void> {
  await db.insert(toolFlagsTable).values({
    toolId: data.toolId,
    reason: data.reason,
    details: data.details ?? "",
    reporterEmail: data.reporterEmail ?? "",
  });
}
```

### 4. Add `insertAccessRequest`

```ts
export async function insertAccessRequest(data: {
  toolId: string;
  reason: string;
  requesterEmail?: string;
}): Promise<void> {
  await db.insert(accessRequestsTable).values({
    toolId: data.toolId,
    reason: data.reason,
    requesterEmail: data.requesterEmail ?? "",
  });
}
```

### 5. Add `verifyManageToken`

The `hashManageToken` function already exists. Add a convenience wrapper next to it:

```ts
export function verifyManageToken(row: ToolRow, token: string | undefined): boolean {
  if (!token || !row.manageTokenHash) return false;
  const aBuf = Buffer.from(hashManageToken(token));
  const bBuf = Buffer.from(row.manageTokenHash);
  if (aBuf.length !== bBuf.length) return false;
  const { timingSafeEqual } = await import("node:crypto");
  return timingSafeEqual(aBuf, bBuf);
}
```

**Note:** `timingSafeEqual` is a synchronous function but the import above uses `await import`. If the `timingSafeEqual` import causes issues, import it at the top of the file with the existing crypto imports instead:

```ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
```

Then the function body is just:

```ts
export function verifyManageToken(row: ToolRow, token: string | undefined): boolean {
  if (!token || !row.manageTokenHash) return false;
  const aBuf = Buffer.from(hashManageToken(token));
  const bBuf = Buffer.from(row.manageTokenHash);
  return aBuf.length === bBuf.length && timingSafeEqual(aBuf, bBuf);
}
```

---

## Part C — New API endpoints

**File:** `artifacts/api-server/src/routes/tools.ts`

Add these two routes after the existing `PATCH /api/tools/:id` handler and before `export default router`.

First, add the new catalogue imports. Find the existing import block:

```ts
import {
  claimTool,
  DuplicateToolError,
  fetchTagVocabulary,
  findToolByUrl,
  getToolById,
  getToolRowById,
  hashManageToken,
  insertTool,
  listTools,
  updateTool,
} from "../lib/catalogue";
```

Replace with:

```ts
import {
  claimTool,
  DuplicateToolError,
  fetchTagVocabulary,
  findToolByUrl,
  getToolById,
  getToolRowById,
  hashManageToken,
  insertTool,
  insertAccessRequest,
  insertToolFlag,
  listTools,
  updateTool,
} from "../lib/catalogue";
```

Then add the two new routes:

```ts
/** POST /api/tools/:id/flag — report a tool as broken, outdated, or incorrect. */
router.post("/tools/:id/flag", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const tool = await getToolById(id);
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "other";
    const details =
      typeof req.body?.details === "string" ? req.body.details.trim() : "";
    const reporterEmail =
      req.isAuthenticated() ? (req.user as { email?: string }).email ?? "" : "";

    await insertToolFlag({ toolId: id, reason, details, reporterEmail });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to flag tool");
    return res.status(500).json({ error: "Failed to flag tool" });
  }
});

/** POST /api/tools/:id/access-request — request access to a restricted tool. */
router.post("/tools/:id/access-request", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const tool = await getToolById(id);
    if (!tool) return res.status(404).json({ error: "Tool not found" });

    const reason =
      typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const requesterEmail =
      req.isAuthenticated() ? (req.user as { email?: string }).email ?? "" : "";

    await insertAccessRequest({ toolId: id, reason, requesterEmail });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to submit access request");
    return res.status(500).json({ error: "Failed to submit access request" });
  }
});
```

---

## Part D — Chat agent changes

**File:** `artifacts/api-server/src/lib/chatAgent.ts`

This file has the most changes. Apply them in order.

### D1 — New imports

At the top of the file, extend the catalogue import to include the new functions:

Find:
```ts
import { searchCatalogue, MIN_MATCH_SIMILARITY, type ApiTool } from "./catalogue";
```

Replace with:
```ts
import {
  searchCatalogue,
  listToolsByFilter,
  getToolById,
  getToolRowById,
  insertToolFlag,
  insertAccessRequest,
  verifyManageToken,
  updateTool,
  MIN_MATCH_SIMILARITY,
  type ApiTool,
} from "./catalogue";
```

### D2 — Extended `runChat` signature

Find:
```ts
export async function runChat(history: ChatTurn[]): Promise<ChatResult> {
```

Replace with:
```ts
export type ChatUserContext = {
  email?: string;
  userId?: string;
};

export async function runChat(history: ChatTurn[], userContext?: ChatUserContext): Promise<ChatResult> {
```

### D3 — Five new tool definitions

Add these five constants after the existing `REGISTER_TOOL` constant (around line 255) and before the `pickRecommended` function:

```ts
const BROWSE_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "browse_catalogue",
    description:
      "List tools filtered by team and/or type when the user wants to browse or explore rather than search for a specific capability. Use this for requests like 'show me all data tools', 'what has the ops team built?', or 'list all Claude skills'.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Filter by tool type. Valid values: app, skill, docs, mcp, plugin, script, slack-bot, zep. Omit to return all types.",
        },
        team: {
          type: "string",
          description:
            "Filter by team name (e.g. 'Platform', 'Applied AI', 'Supply Ops', 'Growth', 'Content'). Omit to return all teams.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 12.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

const DETAIL_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_tool_details",
    description:
      "Fetch full details about a specific tool when the user asks about it by name or asks 'how does X work?', 'who owns X?', 'what access level is X?'. Use the tool's ID from a prior search or browse result.",
    parameters: {
      type: "object",
      properties: {
        toolId: {
          type: "string",
          description: "The UUID of the tool to fetch details for.",
        },
      },
      required: ["toolId"],
      additionalProperties: false,
    },
  },
};

const FLAG_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "flag_tool",
    description:
      "Report a problem with a tool on behalf of the user. Call this when the user says a tool is broken, has a dead link, is outdated, or has incorrect information. Identify the tool ID from context or a prior search before calling.",
    parameters: {
      type: "object",
      properties: {
        toolId: {
          type: "string",
          description: "The UUID of the tool being flagged.",
        },
        reason: {
          type: "string",
          enum: ["broken-link", "outdated", "wrong-info", "other"],
          description: "The category of the problem.",
        },
        details: {
          type: "string",
          description:
            "Optional extra detail the user provided about the issue (e.g. 'the link goes to a 404', 'hasn't been updated since Q1').",
        },
      },
      required: ["toolId", "reason"],
      additionalProperties: false,
    },
  },
};

const ACCESS_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "request_access",
    description:
      "Submit an access request on behalf of the signed-in user for a tool that requires approval (accessLevel is 'request' or 'sensitive'). Ask for their reason before calling if they haven't given one.",
    parameters: {
      type: "object",
      properties: {
        toolId: {
          type: "string",
          description: "The UUID of the tool to request access for.",
        },
        reason: {
          type: "string",
          description:
            "Why the user needs access — what they will use the tool for.",
        },
      },
      required: ["toolId", "reason"],
      additionalProperties: false,
    },
  },
};

const UPDATE_TOOL_DEF: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "update_tool",
    description:
      "Update a field on a tool the user owns. Only call this after: (1) the user has confirmed the tool name and the field they want to change, (2) the user has confirmed the new value, and (3) the user has provided their manage key for that tool. Never call before all three are confirmed.",
    parameters: {
      type: "object",
      properties: {
        toolId: {
          type: "string",
          description: "The UUID of the tool to update.",
        },
        field: {
          type: "string",
          enum: ["url", "title", "oneLiner", "description", "status"],
          description: "The field to update.",
        },
        value: {
          type: "string",
          description: "The new value for the field.",
        },
        manageToken: {
          type: "string",
          description:
            "The manage key the user provided. This is a one-time secret issued when the tool was claimed.",
        },
      },
      required: ["toolId", "field", "value", "manageToken"],
      additionalProperties: false,
    },
  },
};
```

### D4 — New handlers in the `runChat` loop

Find the section in `runChat` that starts with:

```ts
      if (call.function.name === "start_registration") {
```

Add the five new handlers immediately AFTER the existing four handlers (`start_registration`, `record_recommendation`, `verify_capability`, and `search_catalogue`), just before the closing `}` of the `for (const call of toolCalls)` loop:

```ts
      if (call.function.name === "browse_catalogue") {
        let browseArgs: { type?: string; team?: string; limit?: number } = {};
        try {
          browseArgs = JSON.parse(call.function.arguments || "{}");
        } catch { /* use defaults */ }
        const browseResults = await listToolsByFilter({
          type: browseArgs.type,
          team: browseArgs.team,
          limit: browseArgs.limit ?? 12,
        });
        for (const tool of browseResults) found.set(tool.id, tool);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            browseResults.length > 0
              ? browseResults.map((t) => ({
                  id: t.id,
                  name: t.name,
                  type: t.types[0],
                  team: t.team,
                  oneLiner: t.oneLiner,
                  accessLevel: t.accessLevel,
                  status: t.status,
                }))
              : { results: [], note: "No tools found matching those filters." },
          ),
        });
        continue;
      }

      if (call.function.name === "get_tool_details") {
        let detailArgs: { toolId?: string } = {};
        try {
          detailArgs = JSON.parse(call.function.arguments || "{}");
        } catch { /* use defaults */ }
        const tool = detailArgs.toolId
          ? await getToolById(detailArgs.toolId)
          : null;
        if (tool) found.set(tool.id, tool);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: tool
            ? JSON.stringify({
                id: tool.id,
                name: tool.name,
                type: tool.types[0],
                team: tool.team,
                oneLiner: tool.oneLiner,
                description: tool.description,
                accessLevel: tool.accessLevel,
                status: tool.status,
                owner: tool.owner.name,
                link: tool.link,
                tags: tool.tags,
              })
            : JSON.stringify({ error: "Tool not found." }),
        });
        continue;
      }

      if (call.function.name === "flag_tool") {
        let flagArgs: { toolId?: string; reason?: string; details?: string } = {};
        try {
          flagArgs = JSON.parse(call.function.arguments || "{}");
        } catch { /* use defaults */ }
        let flagOk = false;
        if (flagArgs.toolId && flagArgs.reason) {
          try {
            await insertToolFlag({
              toolId: flagArgs.toolId,
              reason: flagArgs.reason,
              details: flagArgs.details,
              reporterEmail: userContext?.email,
            });
            flagOk = true;
          } catch { /* flagOk stays false */ }
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            flagOk
              ? { ok: true, note: "Flag submitted. Write a warm one-sentence confirmation — the issue has been logged and the platform team will review it." }
              : { ok: false, note: "Flag could not be saved. Apologise briefly and ask them to report it directly on Slack." },
          ),
        });
        continue;
      }

      if (call.function.name === "request_access") {
        let accessArgs: { toolId?: string; reason?: string } = {};
        try {
          accessArgs = JSON.parse(call.function.arguments || "{}");
        } catch { /* use defaults */ }
        let accessOk = false;
        if (accessArgs.toolId && accessArgs.reason) {
          try {
            await insertAccessRequest({
              toolId: accessArgs.toolId,
              reason: accessArgs.reason,
              requesterEmail: userContext?.email,
            });
            accessOk = true;
          } catch { /* accessOk stays false */ }
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(
            accessOk
              ? { ok: true, note: "Access request submitted. Write a warm one-sentence confirmation — the request is logged and the tool owner will be in touch." }
              : { ok: false, note: "Request could not be saved. Apologise briefly and ask them to reach out to the tool owner directly on Slack." },
          ),
        });
        continue;
      }

      if (call.function.name === "update_tool") {
        let updateArgs: { toolId?: string; field?: string; value?: string; manageToken?: string } = {};
        try {
          updateArgs = JSON.parse(call.function.arguments || "{}");
        } catch { /* use defaults */ }
        let updateMsg = "";
        if (updateArgs.toolId && updateArgs.field && updateArgs.value && updateArgs.manageToken) {
          const row = await getToolRowById(updateArgs.toolId);
          if (!row) {
            updateMsg = "Tool not found. Ask the user to confirm the tool name.";
          } else if (!verifyManageToken(row, updateArgs.manageToken)) {
            updateMsg = "The manage key is incorrect. Ask the user to check it and try again. Remind them it was issued when they first claimed the tool.";
          } else {
            const patch: Record<string, string> = { [updateArgs.field]: updateArgs.value };
            try {
              await updateTool(updateArgs.toolId, patch);
              updateMsg = `Update applied. Write a warm one-sentence confirmation that the ${updateArgs.field} has been updated.`;
            } catch {
              updateMsg = "The update failed. Ask them to try again or contact the platform team on Slack.";
            }
          }
        } else {
          updateMsg = "Missing required arguments. Make sure you have the tool ID, field, new value, and manage key before calling this.";
        }
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ note: updateMsg }),
        });
        continue;
      }
```

### D5 — Update the tools array passed to the LLM

Find:
```ts
      tools: [REGISTER_TOOL, SEARCH_TOOL, HANDOFF_TOOL, VERIFY_CAPABILITY_TOOL],
```

Replace with:
```ts
      tools: [
        REGISTER_TOOL,
        SEARCH_TOOL,
        BROWSE_TOOL,
        DETAIL_TOOL,
        FLAG_TOOL,
        ACCESS_TOOL,
        UPDATE_TOOL_DEF,
        HANDOFF_TOOL,
        VERIFY_CAPABILITY_TOOL,
      ],
```

### D6 — Extended system prompt

Find the end of the existing system prompt, just before `━━ TONE AND APPROACH ━━`:

```
Always mention the platform team on Slack as a resource.

━━ TONE AND APPROACH ━━
```

Replace with:

```
Always mention the platform team on Slack as a resource.

━━ BROWSING THE CATALOGUE ━━
When a user wants to explore rather than search — "show me all data tools", "what has the ops team built?", "list all Claude skills" — call browse_catalogue with the appropriate type and/or team filters. Present results the same way as search: name each tool with one sentence on what it does. The UI renders a card for every tool you name.

Valid type values: app, skill, docs, mcp, plugin, script, slack-bot, zep.
Valid team values: Platform, Applied AI, Supply Ops, Growth, Content.

━━ TOOL DETAILS ━━
When a user asks about a specific tool — "tell me more about X", "who owns Y?", "what's the access level for Z?" — and you have its ID from a prior search or browse, call get_tool_details. Present the key facts in plain prose: what it does, the team, access requirements, and where to find it. Never fabricate details that weren't in the result.

If you don't have the tool's ID yet, run search_catalogue or browse_catalogue first to find it.

━━ FLAGGING ISSUES ━━
When a user reports a problem with a tool — "the link is broken", "this seems outdated", "the description is wrong" — identify the tool by name using search_catalogue if its ID is not already known. Then call flag_tool with the ID and reason. Write a brief warm confirmation after. Valid reasons: broken-link, outdated, wrong-info, other.

━━ REQUESTING ACCESS ━━
When a user says they need access to a tool — "I need access to X", "how do I get access to Y?" — first check whether that tool genuinely requires approval (accessLevel is 'request' or 'sensitive'). If it's open, tell them they can use it directly. If access is restricted, ask what they'll use it for if they haven't said, then call request_access(toolId, reason). Confirm warmly after.

━━ UPDATING YOUR TOOLS ━━
When a user wants to edit a tool they own — "update the URL for my tool", "change the description of X" — do the following in order:
1. Confirm which tool and which field they want to change.
2. Confirm the new value.
3. Ask for their manage key. Explain: "You received a manage key when you first claimed this tool — it's a long string of letters and numbers. Paste it here and I'll apply the change."
4. Once you have all three, call update_tool. Never call it before step 3 is complete.

Updatable fields: url, title, oneLiner, description, status.

If the manage key is wrong, say so clearly and ask them to double-check. If they can't find it, direct them to the platform team on Slack.

━━ TONE AND APPROACH ━━
```

---

## Part E — Chat route: pass user context

**File:** `artifacts/api-server/src/routes/chat.ts`

Find:
```ts
import { runChat, type ChatTurn } from "../lib/chatAgent";
```

Replace with:
```ts
import { runChat, type ChatTurn, type ChatUserContext } from "../lib/chatAgent";
```

Find:
```ts
    const result = await runChat(history);
```

Replace with:
```ts
    const userCtx: ChatUserContext = {
      email: (req.user as { email?: string } | undefined)?.email,
      userId: req.user?.id,
    };
    const result = await runChat(history, userCtx);
```

---

## Part F — No frontend changes

The existing rendering pipeline already handles everything:

- **Browsing and details** — both `browse_catalogue` and `get_tool_details` add tools to the `found` map, which flows into `ChatResult.tools`. The UI already renders a `ToolCard` for every tool in that array.
- **Flagging and access requests** — these are fire-and-confirm. The AI writes a confirmation sentence; the UI renders it as a normal assistant message.
- **Tool updates** — same: the AI confirms the change in a sentence; nothing special renders.

The `stage` field stays `"chat"` for all these new interactions. No new `FunnelStage` values are needed.

---

## Conversation examples

### Browsing

> User: What tools has the Applied AI team built?
>
> AI: *(calls `browse_catalogue({ team: "Applied AI" })`)*
> Here's what the Applied AI team has in the catalogue: **[Tool A]** — ... **[Tool B]** — ... **[Tool C]** — ... Want details on any of these, or are you looking for something specific?

### Flagging

> User: The link for SQL Wizard is dead
>
> AI: *(calls `search_catalogue("SQL Wizard")` if ID unknown, then `flag_tool(id, "broken-link", "link returns 404")`)*
> Flagged — the broken link on SQL Wizard has been logged and the platform team will take a look.

### Access request

> User: I need access to the Customer Insights Dashboard
>
> AI: *(calls `get_tool_details(id)`, sees `accessLevel: "request"`)*
> That one requires approval. What will you be using it for?
>
> User: I need to pull weekly retention numbers for a board deck
>
> AI: *(calls `request_access(id, "Weekly retention numbers for a board deck")`)*
> Done — your access request has been submitted. The tool owner will be in touch.

### Tool management

> User: I want to update the description on my Slack Digest bot
>
> AI: What would you like to change the description to?
>
> User: *(provides new description)*
>
> AI: Got it. Last thing — I'll need your manage key to apply this change. It's a long string you received when you first claimed the tool. Paste it here and I'll update it now.
>
> User: *(pastes token)*
>
> AI: *(calls `update_tool(id, "description", newValue, token)`)*
> Done — the description on Slack Digest Bot has been updated.

---

## Sequence of implementation

1. Add the two new DB tables and run the migration.
2. Add the four new catalogue functions.
3. Add the two new API endpoints.
4. Apply the chatAgent changes in order: imports → signature → tool definitions → handlers → tools array → system prompt.
5. Update the chat route to pass user context.
6. Test each capability end-to-end in the chat UI.
