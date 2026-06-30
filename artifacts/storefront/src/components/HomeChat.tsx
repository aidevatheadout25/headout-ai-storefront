import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { useRouter, useSearchParams } from "@/compat/next-navigation";
import {
  createTool,
  fetchConversation,
  inspectToolUrl,
  sendChat,
  type ChatTurn,
  type ToolPreview,
} from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useConversationsContext } from "@/lib/conversations-context";
import { BUILDER_OPTIONS, STOREFRONT_SLACK_URL } from "@/lib/toolMeta";
import { buildZepsBuilderUrl } from "@/lib/zeps";
import type { Team, Tool, ToolType } from "@/lib/types";

const TOOL_TYPE_OPTIONS: ToolType[] = [
  "app",
  "skill",
  "docs",
  "mcp",
  "plugin",
  "script",
  "slack-bot",
  "zep",
];

const TEAM_OPTIONS: Team[] = [
  "Platform",
  "Applied AI",
  "Supply Ops",
  "Growth",
  "Content",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: Tool[];
  noMatch?: boolean;
  userQuery?: string;
};

const STARTER_PROMPTS = [
  "I need to summarise customer reviews",
  "Is there a tool for expense receipts?",
  "What can help me write SQL faster?",
  "Anything for translating help-centre articles?",
] as const;

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function HomeChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuthContext();
  const { refresh: refreshConversations } = useConversationsContext();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);
  const loadedConvRef = useRef<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedTool, setAddedTool] = useState<Tool | null>(null);
  const [addedDuplicate, setAddedDuplicate] = useState(false);
  const [addPreview, setAddPreview] = useState<ToolPreview | null>(null);
  const [addLowConfidence, setAddLowConfidence] = useState(false);
  const [addTagsInput, setAddTagsInput] = useState("");

  const started = messages.length > 0;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [messages, sending, scrollToEnd]);

  const runChat = useCallback(
    async (text: string, history: ChatMessage[]) => {
      setSending(true);
      setError(null);
      try {
        const turns: ChatTurn[] = history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.text }));
        turns.push({ role: "user", content: text });

        const result = await sendChat(turns, conversationId);
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: "assistant",
            text: result.message,
            tools: result.tools,
            noMatch: result.noMatch,
            userQuery: text,
          },
        ]);

        if (result.conversationId && result.conversationId !== conversationId) {
          loadedConvRef.current = result.conversationId;
          setConversationId(result.conversationId);
          router.replace(`/?c=${encodeURIComponent(result.conversationId)}`);
        }
        void refreshConversations();
      } catch {
        setError("The catalogue assistant is unavailable right now — try again.");
      } finally {
        setSending(false);
      }
    },
    [conversationId, refreshConversations, router],
  );

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMessage: ChatMessage = {
        id: msgId(),
        role: "user",
        text: trimmed,
      };
      setMessages((prev) => {
        const next = [...prev, userMessage];
        void runChat(trimmed, prev);
        return next;
      });
    },
    [runChat, sending],
  );

  // Load (or reset) the conversation as the `?c=` param changes, but skip the
  // one we just created locally so we don't clobber the in-progress thread.
  useEffect(() => {
    if (!isAuthenticated) return;
    const c = searchParams.get("c");
    if (c === loadedConvRef.current) return;

    if (!c) {
      loadedConvRef.current = null;
      setConversationId(null);
      setMessages([]);
      setError(null);
      return;
    }

    loadedConvRef.current = c;
    setLoadingConv(true);
    setError(null);
    fetchConversation(c)
      .then(({ messages: saved }) => {
        if (loadedConvRef.current !== c) return;
        setConversationId(c);
        setMessages(
          saved.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            tools: m.tools ?? undefined,
            noMatch: m.noMatch,
            userQuery: m.userQuery ?? undefined,
          })),
        );
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
    if (!trimmed || sending) return;
    setInput("");
    submitText(trimmed);
  }

  function resetAdd() {
    setAddUrl("");
    setAddError(null);
    setAddedTool(null);
    setAddedDuplicate(false);
    setAddPreview(null);
    setAddLowConfidence(false);
    setAddTagsInput("");
  }

  // Step 1: read the page and return inferred metadata for review (no save).
  async function handleInspect(e: FormEvent) {
    e.preventDefault();
    const url = addUrl.trim();
    if (!url || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    setAddedTool(null);
    setAddedDuplicate(false);
    try {
      const result = await inspectToolUrl(url);
      if (result.duplicate) {
        setAddedTool(result.tool);
        setAddedDuplicate(true);
      } else {
        setAddPreview(result.preview);
        setAddTagsInput(result.preview.tags.join(", "));
        setAddLowConfidence(result.lowConfidence);
      }
    } catch (err) {
      setAddError(
        err instanceof Error
          ? err.message
          : "Couldn't read that link — check the URL and try again.",
      );
    } finally {
      setAddBusy(false);
    }
  }

  function updatePreview(patch: Partial<ToolPreview>) {
    setAddPreview((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  // Step 2: persist the reviewed (possibly edited) metadata.
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!addPreview || addBusy) return;
    const title = addPreview.title.trim();
    if (!title) {
      setAddError("Give the tool a title before adding it.");
      return;
    }
    const tags = addTagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setAddBusy(true);
    setAddError(null);
    try {
      const { tool, duplicate } = await createTool({
        ...addPreview,
        title,
        tags,
      });
      setAddedTool(tool);
      setAddedDuplicate(duplicate);
      setAddPreview(null);
    } catch (err) {
      setAddError(
        err instanceof Error
          ? err.message
          : "Couldn't add that tool — try again.",
      );
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="home-chat">
      {isAuthenticated && (
        <div className="home-chat__header">
          <a href="/" className="home-chat__new-chat-btn" title="New chat" aria-label="New chat">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </a>
        </div>
      )}
      <div className="home-chat__thread" ref={scrollRef}>
        {!started && !loadingConv && (
          <div className="home-chat__empty">
            <h1 className="home-chat__heading t-display-xs">
              What are you trying to do?
            </h1>
            <p className="home-chat__intro t-para-md">
              Describe a task and I&apos;ll find the internal AI tool that already
              does it. If nothing fits, I&apos;ll point you at how to build or
              request one. I help you find tools — I don&apos;t run them.
            </p>
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
                      <ToolCard key={tool.id} tool={tool} variant="catalog" />
                    ))}
                  </div>
                )}

                {message.noMatch && (
                  <div className="chat-bubble__nomatch">
                    <p className="t-para-sm text-muted">
                      Nothing in the catalogue matches yet. You could build it —
                      with Zeps, Replit, or Claude — or request it from the team.
                    </p>
                    <div className="chat-bubble__nomatch-actions">
                      <ButtonLink
                        href={buildZepsBuilderUrl({
                          prompt: message.userQuery ?? message.text,
                        })}
                        variant="primary"
                        size="sm"
                        external
                      >
                        Build with Zeps
                        <Icon name="arrow-right" size={16} />
                      </ButtonLink>
                      {BUILDER_OPTIONS.map((builder) => (
                        <ButtonLink
                          key={builder.id}
                          href={builder.url}
                          variant="secondary"
                          size="sm"
                          external
                        >
                          {builder.label}
                        </ButtonLink>
                      ))}
                      <ButtonLink
                        href={STOREFRONT_SLACK_URL}
                        variant="tertiary"
                        size="sm"
                        external
                      >
                        Request it on Slack
                      </ButtonLink>
                    </div>
                  </div>
                )}
              </li>
            ))}

            {sending && (
              <li className="chat-bubble chat-bubble--assistant">
                <div className="chat-bubble__body chat-bubble__body--typing t-para-md">
                  Searching the catalogue…
                </div>
              </li>
            )}
          </ul>
        )}

        {error && (
          <p className="home-chat__error t-para-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="home-chat__footer">
        <form className="home-chat__composer" onSubmit={handleSubmit}>
          <div className="home-chat__input-wrap">
            <Icon name="spark" size={20} className="home-chat__input-icon" />
            <input
              type="text"
              className="home-chat__input t-para-md"
              placeholder="Describe a task, e.g. “summarise customer reviews”…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              aria-label="Message"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || sending}>
              Send
            </Button>
          </div>
        </form>

        <div className="home-chat__add">
          {!addOpen ? (
            <button
              type="button"
              className="home-chat__add-trigger t-label-rg"
              onClick={() => {
                setAddOpen(true);
                setAddedTool(null);
                setAddError(null);
              }}
            >
              <span aria-hidden="true">+</span>
              Add a tool
            </button>
          ) : addedTool ? (
            <div className="home-chat__add-form">
              <div className="home-chat__add-success">
                <p className="t-para-sm" role="status">
                  {addedDuplicate ? (
                    <>
                      <strong>{addedTool.name}</strong> is already in the
                      catalogue.
                    </>
                  ) : (
                    <>
                      Added <strong>{addedTool.name}</strong> to the catalogue.
                    </>
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/tools/${addedTool.id}`)}
                >
                  View it
                </Button>
              </div>
              <div className="home-chat__add-actions">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => resetAdd()}
                >
                  Add another
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddOpen(false);
                    resetAdd();
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
          ) : addPreview ? (
            <form className="home-chat__add-form" onSubmit={handleCreate}>
              <p className="home-chat__add-label t-label-sm text-muted">
                Review what I found, edit anything, then add it.
              </p>
              {addLowConfidence && (
                <p className="home-chat__add-notice t-para-sm" role="status">
                  I couldn&apos;t read much from this page, so these details are a
                  rough guess — please check and correct them before adding.
                </p>
              )}
              <div className="home-chat__add-grid">
                <label className="form-field">
                  <span className="form-field__label t-label-rg">Type</span>
                  <select
                    className="form-field__input form-field__select t-para-rg"
                    value={addPreview.type}
                    onChange={(e) => updatePreview({ type: e.target.value })}
                    disabled={addBusy}
                  >
                    {TOOL_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-field__label t-label-rg">Team</span>
                  <select
                    className="form-field__input form-field__select t-para-rg"
                    value={addPreview.team}
                    onChange={(e) => updatePreview({ team: e.target.value })}
                    disabled={addBusy}
                  >
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="form-field">
                <span className="form-field__label t-label-rg">Title</span>
                <input
                  className="form-field__input t-para-rg"
                  value={addPreview.title}
                  onChange={(e) => updatePreview({ title: e.target.value })}
                  disabled={addBusy}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label t-label-rg">One-liner</span>
                <input
                  className="form-field__input t-para-rg"
                  value={addPreview.oneLiner}
                  onChange={(e) => updatePreview({ oneLiner: e.target.value })}
                  disabled={addBusy}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label t-label-rg">Description</span>
                <textarea
                  className="form-field__input form-field__textarea t-para-rg"
                  rows={3}
                  value={addPreview.description}
                  onChange={(e) =>
                    updatePreview({ description: e.target.value })
                  }
                  disabled={addBusy}
                />
              </label>
              <label className="form-field">
                <span className="form-field__label t-label-rg">Tags</span>
                <input
                  className="form-field__input t-para-rg"
                  placeholder="comma, separated, tags"
                  value={addTagsInput}
                  onChange={(e) => setAddTagsInput(e.target.value)}
                  disabled={addBusy}
                />
              </label>
              {addError && (
                <p className="home-chat__add-error t-para-sm" role="alert">
                  {addError}
                </p>
              )}
              <div className="home-chat__add-actions">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!addPreview.title.trim() || addBusy}
                >
                  {addBusy ? "Adding…" : "Add to catalogue"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={addBusy}
                  onClick={() => {
                    setAddPreview(null);
                    setAddError(null);
                  }}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  disabled={addBusy}
                  onClick={() => {
                    setAddOpen(false);
                    resetAdd();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <form className="home-chat__add-form" onSubmit={handleInspect}>
              <p className="home-chat__add-label t-label-sm text-muted">
                Paste a link — I&apos;ll read the page so you can review the
                details before adding.
              </p>
              <div className="home-chat__add-row">
                <input
                  type="url"
                  className="home-chat__add-input t-para-rg"
                  placeholder="https://…"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  disabled={addBusy}
                  aria-label="Tool URL"
                />
                <Button type="submit" size="sm" disabled={!addUrl.trim() || addBusy}>
                  {addBusy ? "Reading…" : "Read"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddOpen(false);
                    resetAdd();
                  }}
                  disabled={addBusy}
                >
                  Cancel
                </Button>
              </div>
              {addError && (
                <p className="home-chat__add-error t-para-sm" role="alert">
                  {addError}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
