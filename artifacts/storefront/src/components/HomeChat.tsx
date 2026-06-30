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
  addToolByUrl,
  sendChat,
  type ChatTurn,
} from "@/lib/api";
import { STOREFRONT_SLACK_URL } from "@/lib/toolMeta";
import { buildZepsBuilderUrl } from "@/lib/zeps";
import type { Tool } from "@/lib/types";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addedTool, setAddedTool] = useState<Tool | null>(null);

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

        const result = await sendChat(turns);
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
      } catch {
        setError("The catalogue assistant is unavailable right now — try again.");
      } finally {
        setSending(false);
      }
    },
    [],
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

  useEffect(() => {
    if (seededRef.current) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      seededRef.current = true;
      submitText(q);
    }
  }, [searchParams, submitText]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput("");
    submitText(trimmed);
  }

  async function handleAddTool(e: FormEvent) {
    e.preventDefault();
    const url = addUrl.trim();
    if (!url || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    setAddedTool(null);
    try {
      const tool = await addToolByUrl(url);
      setAddedTool(tool);
      setAddUrl("");
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

  return (
    <div className="home-chat">
      <div className="home-chat__thread" ref={scrollRef}>
        {!started && (
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
                      Nothing in the catalogue matches yet. You can build it with
                      Zeps, or request it from the team.
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
                      <ButtonLink
                        href={STOREFRONT_SLACK_URL}
                        variant="secondary"
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
          ) : (
            <form className="home-chat__add-form" onSubmit={handleAddTool}>
              <p className="home-chat__add-label t-label-sm text-muted">
                Paste a link — I&apos;ll read the page and fill in the details.
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
                  {addBusy ? "Reading…" : "Add"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAddOpen(false);
                    setAddUrl("");
                    setAddError(null);
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
              {addedTool && (
                <div className="home-chat__add-success">
                  <p className="t-para-sm" role="status">
                    Added <strong>{addedTool.name}</strong> to the catalogue.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/tools/${addedTool.id}`)}
                  >
                    View it
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
