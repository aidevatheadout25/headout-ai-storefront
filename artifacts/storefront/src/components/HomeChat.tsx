import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { useRouter, useSearchParams } from "@/compat/next-navigation";
import {
  addToolChat,
  createTool,
  fetchConversation,
  sendChat,
  type AddChatTurn,
  type ChatTurn,
  type ToolPreview,
} from "@/lib/api";
import { useAuthContext } from "@/lib/auth-context";
import { useConversationsContext } from "@/lib/conversations-context";
import { BUILDER_OPTIONS, STOREFRONT_SLACK_URL } from "@/lib/toolMeta";
import { buildZepsBuilderUrl } from "@/lib/zeps";
import type { Tool } from "@/lib/types";

const STARTER_PROMPTS = [
  "I need to summarise customer reviews",
  "Is there a tool for expense receipts?",
  "What can help me write SQL faster?",
  "Anything for translating help-centre articles?",
] as const;

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools?: Tool[];
  noMatch?: boolean;
  userQuery?: string;
  addReady?: boolean;
  addDraft?: ToolPreview;
};

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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

  // Auto-grow the composer with its content, up to a max height (then scroll).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

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

  // ── Add-tool turn runner ──────────────────────────────────────────────────
  const runAddChat = useCallback(
    async (text: string) => {
      setSending(true);
      setError(null);
      try {
        // First add-mode message: treat text as the URL
        if (!addUrl) {
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
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
      const userMessage: ChatMessage = {
        id: msgId(),
        role: "user",
        text: trimmed,
      };
      if (addMode) {
        setMessages((prev) => [...prev, userMessage]);
        void runAddChat(trimmed);
      } else {
        setMessages((prev) => {
          const next = [...prev, userMessage];
          void runChat(trimmed, prev);
          return next;
        });
      }
    },
    [addMode, runAddChat, runChat, sending],
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
    if (!trimmed || sending || addConfirming) return;
    setInput("");
    submitText(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || sending || addConfirming) return;
      setInput("");
      submitText(trimmed);
    }
  }

  const inputPlaceholder = addMode && !addUrl
    ? "Paste a link — e.g. https://…"
    : addMode
      ? "Reply…"
      : 'Describe a task, e.g. \u201csummarise customer reviews\u201d\u2026';

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
              </li>
            ))}

            {sending && (
              <li className="chat-bubble chat-bubble--assistant">
                <div className="chat-bubble__body chat-bubble__body--typing t-para-md">
                  {addMode ? "Thinking…" : "Searching the catalogue…"}
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
        </form>

        <div className="home-chat__add">
          {addMode ? (
            <button
              type="button"
              className="home-chat__add-trigger t-label-rg"
              onClick={() => {
                setAddMode(false);
                setAddUrl("");
                setAddDraft(null);
                setAddTurns([]);
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="home-chat__add-trigger t-label-rg"
              onClick={() => {
                setAddMode(true);
                setAddUrl("");
                setAddDraft(null);
                setAddTurns([]);
                setMessages((prev) => [
                  ...prev,
                  {
                    id: msgId(),
                    role: "assistant",
                    text: "Paste the link for the tool you'd like to add.",
                  },
                ]);
              }}
            >
              <span aria-hidden="true">+</span>
              Add a tool
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
