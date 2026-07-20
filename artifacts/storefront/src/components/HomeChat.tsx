import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button, ButtonLink } from "@/components/Button";
import { BriefCard } from "@/components/BriefCard";
import { ChecklistCard } from "@/components/ChecklistCard";
import { EscalateCard } from "@/components/EscalateCard";
import { KillCard } from "@/components/KillCard";
import { ReviewCard } from "@/components/ReviewCard";
import { ScaffoldCard } from "@/components/ScaffoldCard";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { ToolDetailOverlay } from "@/components/ToolDetailOverlay";
import { useRouter, useSearchParams } from "@/compat/next-navigation";
import {
  addToolChat,
  createTool,
  fetchConversation,
  sendChat,
  type AddChatTurn,
  type BriefPayload,
  type BuilderId,
  type ChatTurn,
  type EscalatePayload,
  type FunnelStage,
  type KillPayload,
  type ReviewResult,
  type ScaffoldResult,
  type SendChatOpts,
  type ToolPreview,
} from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useConversationsContext } from "@/lib/conversations-context";
import {
  builderUrl,
  isManualPath,
  orderedBuilders,
  STOREFRONT_SLACK_URL,
} from "@/lib/toolMeta";
import type { Tool } from "@/lib/types";

const STARTER_PROMPTS = [
  "Weekly reports take hours — better way?",
  "Draft replies to customer complaints",
] as const;

const SCOPE_LAUNCHERS = [
  {
    label: "Find an existing tool",
    text: "I need to find an existing tool",
    icon: "search" as const,
  },
  {
    label: "Build something new",
    text: "I want to scope an idea for a new internal tool",
    icon: "bulb" as const,
  },
  {
    label: "Register a tool I built",
    text: "I just built a tool and want to add it to the catalogue",
    icon: "checkmark" as const,
  },
] as const;

const JOURNEY_PILL_LABELS: Partial<Record<FunnelStage, string>> = {
  scope: "Scoping",
  brief: "Writing brief",
  kill: "Redirected",
  escalate: "Needs eng team",
  handoff: "Building",
  register: "Registering",
};

type JourneyPhase = "brief" | "scaffold" | "checklist" | "review" | "live" | null;

const JOURNEY_STEP_LABELS: Record<Exclude<JourneyPhase, null>, string> = {
  brief: "Brief",
  scaffold: "Repo",
  checklist: "Checklist",
  review: "Review",
  live: "Live",
};

const JOURNEY_STEP_ORDER = [
  "brief",
  "scaffold",
  "checklist",
  "review",
  "live",
] as const satisfies ReadonlyArray<Exclude<JourneyPhase, null>>;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: Tool[];
  noMatch?: boolean;
  stage?: FunnelStage;
  recommendedBuilder?: BuilderId | null;
  buildPrompt?: string | null;
  registration?: { url: string | null } | null;
  briefPayload?: BriefPayload | null;
  killPayload?: KillPayload | null;
  escalatePayload?: EscalatePayload | null;
  userQuery?: string;
  addReady?: boolean;
  addDraft?: ToolPreview;
  /** True when the user typed a non-URL as the first add-mode message. */
  addDisambiguation?: boolean;
  addDisambiguationText?: string;
  /** True when the user typed something off-journey while a build phase was active. */
  journeyDisambiguation?: boolean;
  journeyDisambiguationText?: string;
};

// ── Journey input guard ─────────────────────────────────────────────────────
// Phases where the journey owns the conversation — typed input must be
// handled in journey context (see submitText) instead of falling through to
// the concierge, which has no build context and denies the request. "brief"
// (still editing the draft) and "live" (explicit next-step chips already
// shown) are deliberately excluded.
const JOURNEY_GUARD_PHASES: ReadonlySet<JourneyPhase> = new Set([
  "scaffold",
  "checklist",
  "review",
]);

function isJourneyGuardPhase(phase: JourneyPhase): boolean {
  return JOURNEY_GUARD_PHASES.has(phase);
}

type JourneyIntent = "action" | "off-journey" | "question";

/** A request to advance or check the build itself — "ship it", "is it ready to publish", "run the review". */
const JOURNEY_ACTION_PATTERNS: RegExp[] = [
  /\b(publish|launch it|ship it|go live)\b/i,
  /\b(good|ready) to (publish|ship|go live)\b/i,
  /\b(run|kick off|start)\s+(the\s+)?review\b/i,
  /\bsubmit\b.*\breview\b/i,
  /\breview\s+it\b/i,
  /\bis it (good|ready)\b/i,
];

/** A new search, a different tool, or leaving the build entirely. */
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

/** Classifies typed input while a build journey phase is active. Exported shape is deterministic — no LLM involved. */
function classifyJourneyIntent(text: string): JourneyIntent {
  if (JOURNEY_ACTION_PATTERNS.some((re) => re.test(text))) return "action";
  if (JOURNEY_OFF_PATTERNS.some((re) => re.test(text))) return "off-journey";
  return "question";
}

/** Canned, phase-aware reply for an action request ("publish it", "is it ready?"). Never denies the capability. */
function journeyActionResponse(phase: JourneyPhase): string {
  if (phase === "review") {
    return "The review's already running — CI, secrets scan, auth rules, security policy, and a deploy smoke test. I'll flag it here the moment it passes and ships live.";
  }
  return "Finish the checklist below first, then I'll run the review — that's the safety check before it goes live.";
}

/** Canned, phase-aware reply for a general question about the build ("what's in the repo", "what does review check"). */
function journeyQuestionResponse(phase: JourneyPhase): string {
  if (phase === "review") {
    return "The review's running now — it checks CI, secrets, auth rules, security policy, and does a deploy smoke test. I'll let you know here the moment it's done, and it ships live automatically if it passes.";
  }
  return "Your repo's scaffolded — work through the checklist below, then I'll run the review automatically and ship it live once it passes.";
}

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Infer the visible mode pill label from all messages. */
function pillLabel(messages: ChatMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  if (!last?.stage) return null;
  return JOURNEY_PILL_LABELS[last.stage] ?? null;
}

export function HomeChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthContext();
  const { refresh: refreshConversations } = useConversationsContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const seededRef = useRef(false);
  const loadedConvRef = useRef<string | null>(null);
  const stickToBottomRef = useRef(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Add-tool inline state ─────────────────────────────────────────────────
  const [addMode, setAddMode] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addDraft, setAddDraft] = useState<ToolPreview | null>(null);
  const [addTurns, setAddTurns] = useState<AddChatTurn[]>([]);
  const [addConfirming, setAddConfirming] = useState(false);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  // ── Tool detail overlay ───────────────────────────────────────────────────
  const [detailToolId, setDetailToolId] = useState<string | null>(null);

  // ── Builder journey state ─────────────────────────────────────────────────
  const [journeyPhase, setJourneyPhase] = useState<JourneyPhase>(null);
  const [activeBrief, setActiveBrief] = useState<BriefPayload | null>(null);
  const [scaffoldResult, setScaffoldResult] = useState<ScaffoldResult | null>(null);
  const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
  /** True while the critique/scope agent is active. Cleared on brief/kill/continuation. */
  const [inScopeMode, setInScopeMode] = useState(false);

  const started = messages.length > 0;
  const hasToolResults = messages.some(
    (message) => message.tools && message.tools.length > 0,
  );

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  const handleThreadScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 96;
  }, []);

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollToEnd();
    }
  }, [messages, sending, journeyPhase, scrollToEnd]);

  // Auto-grow the composer with its content, up to a max height (then scroll).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // ── Add-tool turn runner ──────────────────────────────────────────────────
  const runAddChat = useCallback(
    async (text: string) => {
      setSending(true);
      setError(null);
      try {
        // First add-mode message: treat text as the URL
        if (!addDraft) {
          const url = text.trim();
          const result = await addToolChat({ url });
          if ("duplicate" in result && result.duplicate) {
            setMessages((prev) => [
              ...prev,
              {
                id: msgId(),
                role: "assistant",
                text: `**${result.tool.name}** is already in the catalogue. [View it →](/tools/${result.tool.id})`,
              },
            ]);
            setAddMode(false);
          } else {
            const r = result as Extract<typeof result, { ready: boolean }>;
            setAddUrl(url);
            setAddDraft(r.preview);
            const openingTurn: AddChatTurn = { role: "assistant", content: r.message };
            setAddTurns([openingTurn]);
            setMessages((prev) => [
              ...prev,
              { id: msgId(), role: "assistant", text: r.message },
            ]);
          }
          return;
        }

        // Subsequent add-mode messages
        const userTurn: AddChatTurn = { role: "user", content: text };
        const nextTurns = [...addTurns, userTurn];
        setAddTurns(nextTurns);

        const result = await addToolChat({
          url: addUrl,
          messages: nextTurns,
          preview: addDraft ?? undefined,
        });

        if ("duplicate" in result && result.duplicate) {
          setMessages((prev) => [
            ...prev,
            {
              id: msgId(),
              role: "assistant",
              text: `**${result.tool.name}** is already in the catalogue. [View it →](/tools/${result.tool.id})`,
            },
          ]);
          setAddMode(false);
          setAddUrl("");
          setAddDraft(null);
          setAddTurns([]);
        } else {
          const r = result as Extract<typeof result, { ready: boolean }>;
          const assistantTurn: AddChatTurn = { role: "assistant", content: r.message };
          setAddTurns((prev) => [...prev, assistantTurn]);
          setAddDraft(r.preview);
          if (r.ready) {
            setMessages((prev) => [
              ...prev,
              {
                id: msgId(),
                role: "assistant",
                text: r.message,
                addReady: true,
                addDraft: r.preview,
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              { id: msgId(), role: "assistant", text: r.message },
            ]);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong — try again.",
        );
      } finally {
        setSending(false);
      }
    },
    [addUrl, addDraft, addTurns],
  );

  const runAddSkillUpload = useCallback(
    async (markdown: string, fileName: string) => {
      setSending(true);
      setError(null);
      setMessages((prev) => [
        ...prev,
        {
          id: msgId(),
          role: "user",
          text: `Uploaded skill: ${fileName}`,
        },
      ]);
      try {
        const result = await addToolChat({ skillMarkdown: markdown });
        if ("duplicate" in result && result.duplicate) {
          setMessages((prev) => [
            ...prev,
            {
              id: msgId(),
              role: "assistant",
              text: `**${result.tool.name}** is already in the catalogue. [View it →](/tools/${result.tool.id})`,
            },
          ]);
          setAddMode(false);
          return;
        }
        const r = result as Extract<typeof result, { ready: boolean }>;
        setAddUrl(r.preview.url ?? "");
        setAddDraft(r.preview);
        const openingTurn: AddChatTurn = { role: "assistant", content: r.message };
        setAddTurns([openingTurn]);
        setMessages((prev) => [
          ...prev,
          { id: msgId(), role: "assistant", text: r.message },
        ]);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't read that skill file — try again.",
        );
      } finally {
        setSending(false);
      }
    },
    [],
  );

  const handleSkillFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || sending || addConfirming || addDraft) return;
      if (!/\.(md|markdown|txt)$/i.test(file.name) && file.type && !file.type.includes("text")) {
        setError(
          "Upload only works for SKILL.md (Claude/Cursor skills). For docs, apps, or PDFs, paste a public link instead.",
        );
        return;
      }
      try {
        const text = await file.text();
        await runAddSkillUpload(text, file.name);
      } catch {
        setError("Couldn't read that file — try again.");
      }
    },
    [addConfirming, addDraft, runAddSkillUpload, sending],
  );

  // Stable ref so runChat can trigger the add-tool flow without a circular dep.
  const runAddChatRef = useRef(runAddChat);
  useEffect(() => {
    runAddChatRef.current = runAddChat;
  }, [runAddChat]);

  // Stable ref so runChat can forward an end_scope forwardQuery through
  // submitText without a circular dep (submitText already depends on
  // runChat). Populated by the effect right after submitText is defined.
  const submitTextRef = useRef<
    ((text: string, overrideOpts?: SendChatOpts & { forceChat?: boolean }) => void) | null
  >(null);

  const runChat = useCallback(
    async (text: string, history: ChatMessage[], opts?: SendChatOpts) => {
      setSending(true);
      setError(null);
      try {
        const turns: ChatTurn[] = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.text }));
        turns.push({ role: "user", content: text });

        const result = await sendChat(turns, conversationId, opts);
        const newMsg: ChatMessage = {
          id: msgId(),
          role: "assistant",
          text: result.message,
          tools: result.tools,
          noMatch: result.noMatch,
          stage: result.stage,
          recommendedBuilder: result.recommendedBuilder,
          buildPrompt: result.buildPrompt,
          registration: result.registration,
          briefPayload: result.briefPayload,
          killPayload: result.killPayload,
          escalatePayload: result.escalatePayload,
          userQuery: text,
        };
        setMessages((prev) => [...prev, newMsg]);

        if (result.conversationId && result.conversationId !== conversationId) {
          loadedConvRef.current = result.conversationId;
          setConversationId(result.conversationId);
          router.replace(`/?c=${encodeURIComponent(result.conversationId)}`);
        }
        void refreshConversations();

        // When the concierge routes to registration, switch the composer into
        // add-tool mode. If a URL was already captured, auto-submit it.
        if (result.stage === "register") {
          setAddMode(true);
          setAddUrl("");
          setAddDraft(null);
          setAddTurns([]);
          if (result.registration?.url) {
            const url = result.registration.url;
            setMessages((prev) => [
              ...prev,
              { id: msgId(), role: "user", text: url },
            ]);
            void runAddChatRef.current(url);
          }
        }

        // The server auto-entered scope mode from typed build intent (not the
        // fork chip) — keep sending subsequent messages with mode:"scope" so
        // the critique agent stays in control past this first exchange.
        if (result.stage === "scope") {
          setInScopeMode(true);
        }

        // When the critique agent produces a brief, enter the builder journey.
        if (result.stage === "brief" && result.briefPayload) {
          setActiveBrief(result.briefPayload);
          setJourneyPhase("brief");
        }

        // Critique session resolved — exit scope mode.
        if (
          result.stage === "brief" ||
          result.stage === "kill" ||
          result.stage === "escalate" ||
          result.stage === "scope_exit"
        ) {
          setInScopeMode(false);
          if (result.stage === "scope_exit") {
            // An exit is exactly that — never leave a stale brief/journey
            // card rendering from before the scope session started.
            setJourneyPhase(null);
            setActiveBrief(null);
            setScaffoldResult(null);
            setReviewResult(null);

            // The critique agent's end_scope call can carry an actionable
            // request from the user's exit message (e.g. "show me the
            // registry instead") — forward it as a normal search instead of
            // just acknowledging the exit and dead-ending. Deferred so it
            // runs after `sending` is cleared in `finally` below (submitText
            // no-ops while sending is true).
            if (result.forwardQuery) {
              const forwardQuery = result.forwardQuery;
              setTimeout(() => submitTextRef.current?.(forwardQuery, { forceChat: true }), 0);
            }
          }
        }

        // Kill / escalate — no extra journey state needed, just show the
        // matching card in the message (KillCard / EscalateCard).
      } catch {
        setError("The catalogue assistant is unavailable right now — try again.");
      } finally {
        setSending(false);
      }
    },
    [conversationId, refreshConversations, router],
  );

  const handleAddConfirm = useCallback(
    async (draft: ToolPreview) => {
      if (addConfirming) return;
      setAddConfirming(true);
      setError(null);
      try {
        const { tool, duplicate } = await createTool(draft);
        const successText = duplicate
          ? `**${tool.name}** is already in the catalogue. [View it →](/tools/${tool.id})`
          : `Added **${tool.name}** to the catalogue. [View it →](/tools/${tool.id})`;
        setMessages((prev) => [
          ...prev,
          { id: msgId(), role: "assistant", text: successText },
        ]);
        setAddMode(false);
        setAddUrl("");
        setAddDraft(null);
        setAddTurns([]);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Couldn't add that tool — try again.",
        );
      } finally {
        setAddConfirming(false);
      }
    },
    [addConfirming],
  );

  const submitText = useCallback(
    (text: string, overrideOpts?: SendChatOpts & { forceChat?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMessage: ChatMessage = {
        id: msgId(),
        role: "user",
        text: trimmed,
      };
      if (isJourneyGuardPhase(journeyPhase) && !overrideOpts?.forceChat) {
        // Never route typed input to the concierge while a build phase owns
        // the conversation — it has no build context and denies the request
        // (e.g. "is it good to publish?" → "I can't review code"). Handle it
        // here instead, in journey context.
        const intent = classifyJourneyIntent(trimmed);
        if (intent === "off-journey") {
          setMessages((prev) => [
            ...prev,
            userMessage,
            {
              id: msgId(),
              role: "assistant",
              text: "You're mid-build right now — want to leave this and do that instead?",
              journeyDisambiguation: true,
              journeyDisambiguationText: trimmed,
            },
          ]);
          return;
        }
        const replyText =
          intent === "action"
            ? journeyActionResponse(journeyPhase)
            : journeyQuestionResponse(journeyPhase);
        setMessages((prev) => [
          ...prev,
          userMessage,
          { id: msgId(), role: "assistant", text: replyText },
        ]);
        return;
      }
      if (addMode && !overrideOpts?.forceChat) {
        // First add-mode message: validate it looks like a URL before calling addToolChat.
        if (!addDraft) {
          const looksLikeUrl =
            !trimmed.includes(" ") &&
            (trimmed.includes(".") || trimmed.startsWith("http"));
          if (!looksLikeUrl) {
            setMessages((prev) => [
              ...prev,
              userMessage,
              {
                id: msgId(),
                role: "assistant" as const,
                text: "That doesn't look like a link. Paste a URL for apps, docs, Zeps, or MCPs — or upload a SKILL.md for Claude/Cursor skills.",
                addDisambiguation: true,
                addDisambiguationText: trimmed,
              },
            ]);
            return;
          }
        }
        setMessages((prev) => [...prev, userMessage]);
        void runAddChat(trimmed);
      } else {
        const chatOpts =
          overrideOpts?.forceChat
            ? undefined
            : overrideOpts ?? (inScopeMode ? { mode: "scope" as const } : undefined);
        setMessages((prev) => {
          const next = [...prev, userMessage];
          void runChat(trimmed, prev, chatOpts);
          return next;
        });
      }
    },
    [addMode, addDraft, inScopeMode, journeyPhase, runAddChat, runChat, sending],
  );

  useEffect(() => {
    submitTextRef.current = submitText;
  }, [submitText]);

  // Load (or reset) the conversation as the `?c=` param changes, but skip the
  // one we just created locally so we don't clobber the in-progress thread.
  useEffect(() => {
    if (!isAuthenticated) return;
    const c = searchParams.get("c");
    if (c === loadedConvRef.current) return;

    if (!c) {
      loadedConvRef.current = null;
      stickToBottomRef.current = true;
      setConversationId(null);
      setMessages([]);
      setAddMode(false);
      setAddUrl("");
      setAddDraft(null);
      setAddTurns([]);
      setError(null);
      setJourneyPhase(null);
      setActiveBrief(null);
      setScaffoldResult(null);
      setReviewResult(null);
      setInScopeMode(false);
      return;
    }

    loadedConvRef.current = c;
    stickToBottomRef.current = true;
    setLoadingConv(true);
    setError(null);
    fetchConversation(c)
      .then(({ messages: saved }) => {
        if (loadedConvRef.current !== c) return;
        setConversationId(c);
        const mapped: ChatMessage[] = saved.map((m) => ({
          id: m.id,
          role: m.role,
          text: m.text,
          tools: m.tools ?? undefined,
          noMatch: m.noMatch,
          stage: m.stage,
          recommendedBuilder: m.recommendedBuilder,
          buildPrompt: m.buildPrompt,
          registration: m.registration,
          briefPayload: m.briefPayload,
          killPayload: m.killPayload,
          escalatePayload: m.escalatePayload,
          userQuery: m.userQuery ?? undefined,
        }));
        setMessages(mapped);

        // Reset every journey/add-mode variable unconditionally before
        // applying this conversation's own state below. Previously each
        // branch below set its own subset, so scaffoldResult/reviewResult
        // were never cleared by ANY branch — switching from a conversation
        // that had reached "scaffold"/"review"/"live" to one that never
        // touched the journey (e.g. a plain search, stage "chat") left the
        // old repo/scaffold cards rendering on top of the new conversation.
        // Reset-then-set means no branch can forget to clear something.
        setAddMode(false);
        setAddUrl("");
        setAddDraft(null);
        setAddTurns([]);
        setInScopeMode(false);
        setJourneyPhase(null);
        setActiveBrief(null);
        setScaffoldResult(null);
        setReviewResult(null);

        const lastAssistant = [...mapped].reverse().find((m) => m.role === "assistant");
        if (lastAssistant?.stage === "register") {
          setAddMode(true);
        } else if (lastAssistant?.stage === "brief" && lastAssistant.briefPayload) {
          setActiveBrief(lastAssistant.briefPayload);
          setJourneyPhase("brief");
        } else if (lastAssistant?.stage === "scope") {
          setInScopeMode(true);
        }
        // scope_exit / kill / escalate / chat / handoff / disambiguation:
        // the unconditional reset above already leaves everything cleared.
      })
      .catch(() => {
        if (loadedConvRef.current !== c) return;
        setError("Couldn't open that conversation.");
        setMessages([]);
        setConversationId(null);
      })
      .finally(() => {
        if (loadedConvRef.current === c) setLoadingConv(false);
      });
  }, [searchParams, isAuthenticated]);

  // Optional deep-link: `/?q=...` seeds the first message into a fresh chat.
  useEffect(() => {
    if (seededRef.current || !isAuthenticated) return;
    if (searchParams.get("c")) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      seededRef.current = true;
      submitText(q);
    }
  }, [searchParams, isAuthenticated, submitText]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending || addConfirming) return;
    setInput("");
    submitText(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || sending || addConfirming) return;
      setInput("");
      submitText(trimmed);
    }
  }

  // Builder journey handlers
  const handleScaffold = useCallback((result: ScaffoldResult) => {
    setScaffoldResult(result);
    setJourneyPhase("scaffold");
  }, []);

  const handleChecklistDone = useCallback(() => {
    setJourneyPhase("review");
  }, []);

  const handleHelpRequest = useCallback(
    (helpText: string) => {
      submitText(helpText);
    },
    [submitText],
  );

  const handleReviewLive = useCallback((result: ReviewResult) => {
    setReviewResult(result);
    setJourneyPhase("live");
  }, []);

  // Determine if the "fork" chip (nothing fits — scope it) is visible on the last message.
  const lastMessage = [...messages].reverse().find((m) => m.role === "assistant");
  const showScopeChip =
    lastMessage?.noMatch &&
    lastMessage.stage !== "scope" &&
    lastMessage.stage !== "brief" &&
    lastMessage.stage !== "kill" &&
    lastMessage.stage !== "escalate" &&
    journeyPhase === null &&
    !addMode;

  const currentPillLabel = pillLabel(messages);

  const inputPlaceholder = addMode && !addDraft
    ? "Paste a URL for apps, docs, Zeps, MCPs…"
    : addMode
      ? "Reply…"
      : 'Describe a task, e.g. \u201csummarise customer reviews\u201d\u2026';

  const isJourneyActive = journeyPhase !== null;

  const typingLabel = addMode
    ? "Thinking…"
    : inScopeMode || isJourneyActive
      ? "Thinking…"
      : "Searching the catalogue…";

  const journeyStepIndex = journeyPhase
    ? JOURNEY_STEP_ORDER.indexOf(journeyPhase)
    : -1;

  return (
    <div className={`home-chat${hasToolResults ? " home-chat--wide" : ""}`}>
      {isAuthenticated && currentPillLabel && (
        <div className="home-chat__header">
          <span className="home-chat__mode-pill t-label-xs">{currentPillLabel}</span>
        </div>
      )}
      <div
        className="home-chat__thread"
        ref={scrollRef}
        onScroll={handleThreadScroll}
      >
        {!started && !loadingConv && (
          <div className="home-chat__empty">
            <h1 className="home-chat__heading t-display-xs">
              What are you trying to do?
            </h1>
            <p className="home-chat__intro t-para-md">
              Tell me what you need and I&apos;ll find the right internal tool — or
              help you figure out if anything needs building at all. Use the
              composer below, or pick a path.
            </p>
            <div className="home-chat__launchers">
              {SCOPE_LAUNCHERS.map((launcher) => (
                <button
                  key={launcher.label}
                  type="button"
                  className="home-chat__launcher t-label-sm"
                  onClick={() => submitText(launcher.text)}
                >
                  <Icon
                    name={launcher.icon}
                    size={16}
                    className="home-chat__launcher-icon"
                  />
                  {launcher.label}
                </button>
              ))}
            </div>
            <p className="home-chat__starters-label t-label-xs">Try an example</p>
            <div className="home-chat__starters">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="home-chat__chip t-para-rg"
                  onClick={() => submitText(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {loadingConv && (
          <div className="home-chat__empty">
            <p className="home-chat__intro t-para-md">Opening conversation…</p>
          </div>
        )}

        {started && (
          <ul className="home-chat__messages" aria-live="polite">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`chat-bubble chat-bubble--${message.role}`}
              >
                <div className="chat-bubble__body t-para-md">{message.text}</div>

                {message.tools && message.tools.length > 0 && (
                  <div className="chat-bubble__tools">
                    {message.tools.map((tool) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        variant="catalog"
                        onSelect={(t) => setDetailToolId(t.id)}
                      />
                    ))}
                  </div>
                )}

                {/* kill card */}
                {message.stage === "kill" && message.killPayload && (
                  <KillCard kill={message.killPayload} />
                )}

                {message.stage === "escalate" && message.escalatePayload && (
                  <EscalateCard escalate={message.escalatePayload} />
                )}

                {/* Handoff card — deprecated for build flows; only ever rendered on the
                    last message of a legacy/restored conversation, never mid-flow. */}
                {message.stage === "handoff" &&
                  message.id === lastMessage?.id &&
                  (() => {
                    const prompt = message.buildPrompt || message.userQuery || message.text;
                    const manual = isManualPath(message.recommendedBuilder);
                    const builders = orderedBuilders(message.recommendedBuilder);
                    return (
                      <div className="chat-bubble__nomatch">
                        <p className="t-para-sm text-muted">
                          {manual
                            ? "Not ready to build yet — start with a lightweight approach first, then automate what's confirmed."
                            : "Nothing existing fits, so here\u2019s how to build it. Your recommended path is first\u00a0\u2014 or request it from the team."}
                        </p>
                        <div className="chat-bubble__nomatch-actions">
                          {builders.map((builder, i) => (
                            <ButtonLink
                              key={builder.id}
                              href={builderUrl(builder.id, prompt)}
                              variant={i === 0 ? "primary" : "secondary"}
                              size="sm"
                              external
                            >
                              {builder.label}
                              {i === 0 && <Icon name="arrow-right" size={16} />}
                            </ButtonLink>
                          ))}
                          <ButtonLink
                            href={STOREFRONT_SLACK_URL}
                            variant={manual ? "primary" : "tertiary"}
                            size="sm"
                            external
                          >
                            {manual ? "Talk to the platform team on Slack" : "Request it on Slack"}
                            {manual && <Icon name="arrow-right" size={16} />}
                          </ButtonLink>
                        </div>
                      </div>
                    );
                  })()}

                {message.addReady && message.addDraft && (
                  <div className="chat-bubble__nomatch-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAddConfirm(message.addDraft!)}
                      disabled={addConfirming}
                    >
                      {addConfirming ? "Adding…" : "Add to catalogue"}
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() => {
                        setAddMode(false);
                        setAddUrl("");
                        setAddDraft(null);
                        setAddTurns([]);
                      }}
                      disabled={addConfirming}
                    >
                      Cancel
                    </Button>
                  </div>
                )}

                {message.addDisambiguation && (
                  <div className="chat-bubble__nomatch-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setAddMode(false);
                        setAddUrl("");
                        setAddDraft(null);
                        setAddTurns([]);
                        submitText(message.addDisambiguationText ?? "", { forceChat: true });
                      }}
                    >
                      <Icon name="search" size={16} />
                      Search for this
                    </Button>
                    <ButtonLink href="/registry" variant="secondary" size="sm">
                      Browse the catalogue
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() =>
                        setMessages((prev) =>
                          prev.filter((m) => !m.addDisambiguation),
                        )
                      }
                    >
                      Paste a URL instead
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMessages((prev) =>
                          prev.filter((m) => !m.addDisambiguation),
                        );
                        skillFileInputRef.current?.click();
                      }}
                    >
                      Upload SKILL.md (skills only)
                    </Button>
                  </div>
                )}

                {message.journeyDisambiguation && (
                  <div className="chat-bubble__nomatch-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setJourneyPhase(null);
                        setActiveBrief(null);
                        setScaffoldResult(null);
                        setReviewResult(null);
                        setInScopeMode(false);
                        submitText(message.journeyDisambiguationText ?? "", { forceChat: true });
                      }}
                    >
                      <Icon name="search" size={16} />
                      Do that instead
                    </Button>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      onClick={() =>
                        setMessages((prev) =>
                          prev.filter((m) => !m.journeyDisambiguation),
                        )
                      }
                    >
                      Keep building
                    </Button>
                  </div>
                )}
              </li>
            ))}

            {sending && (
              <li className="chat-bubble chat-bubble--assistant">
                <div className="chat-bubble__body chat-bubble__body--typing t-para-md">
                  {typingLabel}
                </div>
              </li>
            )}
          </ul>
        )}

        {/* Nothing fits → scope fork chip */}
        {showScopeChip && !sending && (
          <div className="home-chat__scope-fork">
            <p className="home-chat__scope-fork-label t-label-sm">
              Nothing fits what you described.
            </p>
            <button
              type="button"
              className="home-chat__chip home-chat__chip--scope t-para-sm"
              onClick={() => {
                const nearMisses = (lastMessage?.tools ?? []).map((t) => ({
                  name: t.name,
                  oneLiner: t.oneLiner,
                }));
                const query = lastMessage?.userQuery ?? lastMessage?.text ?? "";
                setInScopeMode(true);
                submitText("Let's scope the idea — I want to build it", {
                  mode: "scope",
                  searchContext: { query, nearMisses },
                });
              }}
            >
              <Icon name="bulb" size={16} />
              Nothing fits — let&apos;s scope it
            </button>
          </div>
        )}

        {/* ── Builder journey cards ─────────────────────────────────────── */}
        {isJourneyActive && (
          <div className="home-chat__journey">
            {/* Phase 1: Brief (always shown when journey is active) */}
            {journeyPhase === "brief" && activeBrief && (
              <BriefCard brief={activeBrief} onScaffold={handleScaffold} />
            )}

            {/* Phase 2+: Brief collapsed → Scaffold card */}
            {(journeyPhase === "scaffold" ||
              journeyPhase === "checklist" ||
              journeyPhase === "review" ||
              journeyPhase === "live") &&
              scaffoldResult && (
                <ScaffoldCard scaffold={scaffoldResult} />
              )}

            {/* Phase 3: Checklist */}
            {(journeyPhase === "checklist" ||
              journeyPhase === "review" ||
              journeyPhase === "live") &&
              scaffoldResult && (
                <ChecklistCard
                  buildId={scaffoldResult.buildId}
                  onDone={handleChecklistDone}
                  onHelp={handleHelpRequest}
                />
              )}

            {/* Phase 4: Review */}
            {(journeyPhase === "review" || journeyPhase === "live") &&
              scaffoldResult && (
                <ReviewCard
                  buildId={scaffoldResult.buildId}
                  onLive={handleReviewLive}
                />
              )}

            {/* Phase 5: Live ceremony */}
            {journeyPhase === "live" && reviewResult && (
              <div className="home-chat__live-banner">
                <span className="t-heading-sm">Your tool is live!</span>
                <div className="home-chat__live-actions">
                  <ButtonLink href={`/tools/${reviewResult.toolId}`} variant="primary" size="sm">
                    View {reviewResult.toolName} →
                  </ButtonLink>
                  <ButtonLink
                    href={`/?q=${encodeURIComponent(reviewResult.toolName)}`}
                    variant="secondary"
                    size="sm"
                  >
                    Try searching for it
                  </ButtonLink>
                </div>
                <div className="home-chat__scope-fork" style={{ marginTop: "var(--space-3)" }}>
                  <p className="home-chat__scope-fork-label t-label-sm">What next?</p>
                  <button
                    type="button"
                    className="home-chat__chip t-para-sm"
                    onClick={() => {
                      setJourneyPhase(null);
                      setActiveBrief(null);
                      setScaffoldResult(null);
                      setReviewResult(null);
                      setInScopeMode(false);
                    }}
                  >
                    <Icon name="search" size={16} />
                    Search again
                  </button>
                  <button
                    type="button"
                    className="home-chat__chip t-para-sm"
                    onClick={() => {
                      setJourneyPhase(null);
                      setActiveBrief(null);
                      setScaffoldResult(null);
                      setReviewResult(null);
                      setInScopeMode(false);
                      router.push("/registry");
                    }}
                  >
                    Browse the catalogue
                  </button>
                </div>
              </div>
            )}

            {/* Journey progression: brief → scaffold transition */}
            {journeyPhase === "brief" && activeBrief && (
              <p className="home-chat__journey-hint t-label-sm">
                Edit any field above, then click <strong>Create my repo</strong>.
              </p>
            )}
            {journeyPhase === "scaffold" && scaffoldResult && (
              <p className="home-chat__journey-hint t-label-sm">
                Work through the checklist below to get ready for review.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="home-chat__error t-para-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="home-chat__footer">
        {/* Journey phase pill */}
        {isJourneyActive && journeyPhase && (
          <div className="home-chat__journey-phase">
            {JOURNEY_STEP_ORDER.map((phase, i) => {
              const isActive = journeyPhase === phase;
              const isDone = journeyStepIndex > i;
              return (
                <span
                  key={phase}
                  className={`home-chat__journey-step${isActive ? " home-chat__journey-step--active" : ""}${isDone ? " home-chat__journey-step--done" : ""}`}
                >
                  {i + 1}. {JOURNEY_STEP_LABELS[phase]}
                </span>
              );
            })}
          </div>
        )}
        <form className="home-chat__composer" onSubmit={handleSubmit}>
          <div className="home-chat__input-wrap">
            <Icon name="spark" size={20} className="home-chat__input-icon" />
            <textarea
              ref={textareaRef}
              className="home-chat__input t-para-md"
              placeholder={inputPlaceholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || addConfirming}
              aria-label="Message"
              rows={1}
            />
            <Button type="submit" size="sm" disabled={!input.trim() || sending || addConfirming}>
              Send
            </Button>
          </div>
          {addMode && !addDraft && (
            <div className="home-chat__add-upload">
              <p className="home-chat__add-upload-lead t-label-xs">
                <strong>Apps, docs, Zeps, MCPs:</strong> paste their URL above.
                {" "}
                <strong>Claude/Cursor skills:</strong> upload a SKILL.md (not a PDF or doc).
              </p>
              <input
                ref={skillFileInputRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                className="home-chat__skill-file-input"
                disabled={sending || addConfirming}
                onChange={(e) => void handleSkillFileChange(e)}
                aria-label="Upload a SKILL.md file for a Claude or Cursor skill"
                tabIndex={-1}
              />
              <button
                type="button"
                className="home-chat__chip t-para-sm"
                disabled={sending || addConfirming}
                onClick={() => skillFileInputRef.current?.click()}
              >
                <Icon name="checkmark" size={16} />
                Upload SKILL.md
              </button>
            </div>
          )}
        </form>
      </div>

      <ToolDetailOverlay
        toolId={detailToolId}
        onClose={() => setDetailToolId(null)}
      />
    </div>
  );
}
