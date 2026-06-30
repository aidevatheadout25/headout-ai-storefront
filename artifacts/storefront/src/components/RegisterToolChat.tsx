
import { useRouter, useSearchParams } from "@/compat/next-navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Button, ButtonLink } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { useApp } from "@/context/AppContext";
import { findDedupMatches } from "@/lib/mockData";
import { mapManifestDeterministic } from "@/lib/analyzeZep";
import {
  BUILD_NEW_ZEPS_MESSAGE,
  PREVIEW_FIELDS,
  REGISTER_CHAT_OPENING,
  applyZepAnalysisDraft,
  buildAgentReply,
  buildZepReviewAgentMessage,
  countRequiredFilled,
  emptyRegisterForm,
  extractFromMessage,
  fieldDisplayValue,
  fieldLabel,
  flashFieldsFromDraft,
  getQuickReplies,
  getRequiredFields,
  isEntryForkChip,
  isRegisterComplete,
  isRegisterFieldFilled,
  nextMissingField,
  openingMessage,
  type RegisterChatField,
} from "@/lib/registerToolChat";
import {
  buildZepsBuilderUrl,
  fetchZepManifest,
  parseZepManifest,
  type ZepManifest,
} from "@/lib/zeps";
import { GATE_ELIGIBILITY_NOTE } from "@/lib/adminMetrics";
import {
  TOOL_TYPES,
  normalizeCatalogueTypeParam,
  type ToolFormData,
} from "@/lib/types";

const TYPING_DELAY_MS = 600;

type ChatMessage =
  | {
      id: string;
      role: "agent" | "user";
      kind: "text";
      text: string;
    }
  | {
      id: string;
      role: "agent";
      kind: "zep-ingest";
      text: string;
    }
  | {
      id: string;
      role: "agent";
      kind: "build-zeps";
      text: string;
      buildUrl: string;
    };

function msgId(): string {
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function renderAgentText(text: string) {
  return text.split("\n").map((line, i) => {
    const html = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return (
      <p
        key={i}
        className={`register-chat__line t-para-rg ${i > 0 ? "register-chat__line--gap" : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
}

type ZepIngestCardProps = {
  analyzing: boolean;
  error: string | null;
  link: string;
  onLinkChange: (value: string) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onLinkSubmit: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

function ZepIngestCard({
  analyzing,
  error,
  link,
  onLinkChange,
  onFileUpload,
  onLinkSubmit,
  fileInputRef,
}: ZepIngestCardProps) {
  return (
    <div className="register-chat__zep-card">
      <p className="register-chat__zep-card-lead t-para-sm">
        Upload a JSON export or paste the Zeps runtime link.
      </p>
      <div className="register-chat__zep-card-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="register-chat__zep-file-input"
          disabled={analyzing}
          onChange={onFileUpload}
          aria-label="Upload a Zep JSON export"
          tabIndex={-1}
        />
        <button
          type="button"
          className="register-chat__zep-upload t-para-sm"
          disabled={analyzing}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload JSON
        </button>
        <span className="register-chat__zep-or t-para-sm text-muted" aria-hidden>
          or
        </span>
        <div className="register-chat__zep-link-row">
          <input
            type="url"
            className="register-chat__zep-link-input t-para-sm"
            value={link}
            onChange={(e) => onLinkChange(e.target.value)}
            disabled={analyzing}
            placeholder="Paste Zeps link…"
            aria-label="Zeps agent link"
          />
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={!link.trim() || analyzing}
            onClick={onLinkSubmit}
          >
            {analyzing ? "Drafting…" : "Draft listing"}
          </Button>
        </div>
      </div>
      {error && (
        <p className="register-chat__zep-error t-para-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function RegisterToolChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { allTools, submitTool } = useApp();

  const initialForm = useMemo((): ToolFormData => {
    const base = emptyRegisterForm();
    const prefillName = searchParams.get("name");
    const prefillOneLiner = searchParams.get("oneLiner");
    const prefillType = searchParams.get("type");
    const prefillStatus = searchParams.get("status");
    const type = prefillType ? normalizeCatalogueTypeParam(prefillType) : "";
    return {
      ...base,
      name: prefillName ?? base.name,
      oneLiner: prefillOneLiner ?? base.oneLiner,
      types:
        type && TOOL_TYPES.includes(type as (typeof TOOL_TYPES)[number])
          ? [type as ToolFormData["types"][number]]
          : base.types,
      status: prefillStatus === "planned" ? "planned" : base.status,
    };
  }, [searchParams]);

  const prefillRef = useMemo(
    () => ({
      name: initialForm.name,
      oneLiner: initialForm.oneLiner,
    }),
    [initialForm.name, initialForm.oneLiner],
  );

  const skippedEntryFork = Boolean(prefillRef.name || prefillRef.oneLiner);

  const [record, setRecord] = useState<ToolFormData>(initialForm);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: msgId(), role: "agent", kind: "text", text: openingMessage(prefillRef) },
  ]);
  const [input, setInput] = useState("");
  const [zepLink, setZepLink] = useState("");
  const [zepError, setZepError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [flashFields, setFlashFields] = useState<Set<RegisterChatField>>(new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [registered, setRegistered] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const zepFileInputRef = useRef<HTMLInputElement>(null);

  const requiredFields = getRequiredFields(record);
  const requiredFilled = countRequiredFilled(record);
  const complete = isRegisterComplete(record);
  const dedupMatches = findDedupMatches(record.name, record.oneLiner, allTools);
  const isPlanned = record.status === "planned";
  const progressPct = Math.round((requiredFilled / requiredFields.length) * 100);

  const scrollToBottom = useCallback(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [messages, typing]);

  const pushAgentMessage = useCallback((text: string) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: msgId(), role: "agent", kind: "text", text },
      ]);
    }, TYPING_DELAY_MS);
  }, []);

  const prefillFromManifest = useCallback(
    async (manifest: ZepManifest) => {
      setAnalyzing(true);
      setZepError(null);
      try {
        let draft: Partial<ToolFormData>;
        try {
          const res = await fetch("/api/analyze-zep", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ manifest }),
          });
          draft = res.ok
            ? ((await res.json()) as Partial<ToolFormData>)
            : mapManifestDeterministic(manifest);
        } catch {
          draft = mapManifestDeterministic(manifest);
        }
        setRecord((prev) => applyZepAnalysisDraft(prev, draft));
        const flash = flashFieldsFromDraft(draft);
        setFlashFields(new Set(flash));
        window.setTimeout(() => setFlashFields(new Set()), 1200);
        setMessages((prev) =>
          prev.filter((m) => m.kind !== "zep-ingest"),
        );
        pushAgentMessage(buildZepReviewAgentMessage());
      } catch {
        setZepError("Couldn't analyze that Zep — check the file or link and try again.");
      } finally {
        setAnalyzing(false);
      }
    },
    [pushAgentMessage],
  );

  const handleZepFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || analyzing) return;

      setMessages((prev) => [
        ...prev,
        { id: msgId(), role: "user", kind: "text", text: `Uploaded Zep: ${file.name}` },
      ]);

      const text = await file.text();
      const manifest = parseZepManifest(text);
      if (!manifest) {
        setZepError("Couldn't read that file — upload a JSON Zep export.");
        return;
      }

      await prefillFromManifest(manifest);
    },
    [analyzing, prefillFromManifest],
  );

  const handleZepLinkSubmit = useCallback(async () => {
    const url = zepLink.trim();
    if (!url || analyzing) return;

    setMessages((prev) => [
      ...prev,
      { id: msgId(), role: "user", kind: "text", text: url },
    ]);
    setZepLink("");

    const manifest = await fetchZepManifest(url);
    if (!manifest) {
      setZepError("That doesn't look like a Zeps link — try again or upload JSON.");
      return;
    }

    await prefillFromManifest(manifest);
  }, [analyzing, prefillFromManifest, zepLink]);

  const handleEntryChoice = useCallback(
    (choice: string) => {
      setMessages((prev) => [
        ...prev,
        { id: msgId(), role: "user", kind: "text", text: choice },
      ]);

      if (choice === "I built a Zep") {
        setZepError(null);
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: "agent",
            kind: "zep-ingest",
            text: "Share your Zep — I'll draft the listing from it.",
          },
        ]);
        return;
      }

      if (choice === "I built another tool") {
        pushAgentMessage(REGISTER_CHAT_OPENING);
        return;
      }

      if (choice === "I want to build something new") {
        setMessages((prev) => [
          ...prev,
          {
            id: msgId(),
            role: "agent",
            kind: "build-zeps",
            text: BUILD_NEW_ZEPS_MESSAGE,
            buildUrl: buildZepsBuilderUrl(),
          },
        ]);
      }
    },
    [pushAgentMessage],
  );

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || typing || analyzing || registered) return;

      if (isEntryForkChip(trimmed) && !skippedEntryFork) {
        setInput("");
        handleEntryChoice(trimmed);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: msgId(), role: "user", kind: "text", text: trimmed },
      ]);
      setInput("");

      setRecord((prev) => {
        const expectingField = nextMissingField(prev);
        const { updates, confirmations } = extractFromMessage(
          trimmed,
          prev,
          expectingField,
        );
        const next = { ...prev, ...updates };

        window.setTimeout(() => {
          if (Object.keys(updates).length) {
            setFlashFields(new Set(Object.keys(updates) as RegisterChatField[]));
            window.setTimeout(() => setFlashFields(new Set()), 1200);
          }
          pushAgentMessage(buildAgentReply(next, confirmations));
        }, 0);

        return next;
      });
    },
    [typing, analyzing, registered, skippedEntryFork, handleEntryChoice, pushAgentMessage],
  );

  const handleRegister = useCallback(() => {
    if (!complete) return;
    const payload: ToolFormData = {
      ...record,
      description: record.description || record.oneLiner,
      ownerInstructions:
        record.ownerInstructions || "Ping the owner on Slack — include your use case.",
    };
    submitTool(payload);
    setRegistered(true);
    pushAgentMessage(
      `✅ **${record.name}** is submitted! Pending admin approval before it appears in search.`,
    );
  }, [complete, record, submitTool, pushAgentMessage]);

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const lastAgentText =
    lastAgent?.kind === "text" || lastAgent?.kind === "zep-ingest"
      ? lastAgent.text
      : lastAgent?.kind === "build-zeps"
        ? lastAgent.text
        : "";
  const quickReplies =
    registered || typing || analyzing
      ? []
      : getQuickReplies(lastAgentText, record);

  if (registered) {
    return (
      <div className="confirmation-card">
        <div className="confirmation-card__icon">
          <Icon name={isPlanned ? "bulb" : "hourglass"} size={32} />
        </div>
        <h2 className="confirmation-card__title t-heading-md">
          {isPlanned ? "Idea submitted" : "Submitted for review"}
        </h2>
        <p className="confirmation-card__desc t-para-md">
          {isPlanned ? (
            <>
              <strong>{record.name}</strong> is in the idea queue for a quick admin
              review.
            </>
          ) : (
            <>
              Your submission for <strong>{record.name}</strong> is queued for
              go-live review.
            </>
          )}
        </p>
        {!isPlanned && (
          <p className="gate-eligibility-note t-para-sm text-muted">
            {GATE_ELIGIBILITY_NOTE}
          </p>
        )}
        <div className="confirmation-card__actions">
          <ButtonLink href="/my-submissions" variant="primary">
            My requests & submissions
          </ButtonLink>
          <ButtonLink href="/registry" variant="secondary">
            Browse registry
          </ButtonLink>
          <Button variant="secondary" onClick={() => router.push("/")}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="register-chat">
      <div className="register-chat__layout">
        <section className="register-chat__pane register-chat__pane--chat">
          <div className="register-chat__chat-toolbar">
            <button
              type="button"
              className="register-chat__mobile-preview-btn t-para-sm"
              onClick={() => setPreviewOpen((o) => !o)}
            >
              {previewOpen
                ? "Hide summary"
                : `Summary (${requiredFilled}/${requiredFields.length})`}
            </button>
          </div>

          <div ref={threadRef} className="register-chat__thread">
            <ul className="register-chat__messages">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`register-chat__message register-chat__message--${m.role}`}
                >
                  <div className="register-chat__avatar" aria-hidden>
                    {m.role === "agent" ? (
                      <Icon name="spark" size={16} />
                    ) : (
                      <Icon name="user" size={16} />
                    )}
                  </div>
                  <div className="register-chat__bubble">
                    {m.kind === "zep-ingest" ? (
                      <>
                        <p className="register-chat__line t-para-rg">{m.text}</p>
                        <ZepIngestCard
                          analyzing={analyzing}
                          error={zepError}
                          link={zepLink}
                          onLinkChange={(value) => {
                            setZepLink(value);
                            setZepError(null);
                          }}
                          onFileUpload={handleZepFileUpload}
                          onLinkSubmit={() => void handleZepLinkSubmit()}
                          fileInputRef={zepFileInputRef}
                        />
                      </>
                    ) : m.kind === "build-zeps" ? (
                      <>
                        <p className="register-chat__line t-para-rg">{m.text}</p>
                        <div className="register-chat__build-action">
                          <ButtonLink
                            href={m.buildUrl}
                            variant="primary"
                            size="sm"
                            external
                          >
                            Build with Zeps
                            <Icon name="arrow-right" size={16} />
                          </ButtonLink>
                        </div>
                      </>
                    ) : m.role === "agent" ? (
                      renderAgentText(m.text)
                    ) : (
                      <p className="register-chat__line t-para-rg">{m.text}</p>
                    )}
                  </div>
                </li>
              ))}
              {typing && (
                <li className="register-chat__message register-chat__message--agent">
                  <div className="register-chat__avatar" aria-hidden>
                    <Icon name="spark" size={16} />
                  </div>
                  <div className="register-chat__bubble register-chat__bubble--typing">
                    <span className="register-chat__dot" />
                    <span className="register-chat__dot" />
                    <span className="register-chat__dot" />
                  </div>
                </li>
              )}
            </ul>
          </div>

          {quickReplies.length > 0 && (
            <div className="register-chat__chips">
              {quickReplies.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className="register-chat__chip t-para-sm"
                  onClick={() => handleSend(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <form
            className="register-chat__composer"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              handleSend(input);
            }}
          >
            <input
              type="text"
              className="register-chat__input t-para-rg"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={typing || analyzing}
              placeholder="Type your answer…"
              aria-label="Your message"
            />
            <Button type="submit" size="sm" disabled={!input.trim() || typing || analyzing}>
              Send
            </Button>
          </form>
        </section>

        <section
          className={`register-chat__pane register-chat__pane--receipt ${
            previewOpen ? "register-chat__pane--receipt-open" : ""
          }`}
        >
          <div className="register-receipt__header">
            <div>
              <h2 className="register-receipt__title t-heading-sm">Listing summary</h2>
              <p className="register-receipt__meta t-para-sm text-muted">
                Live from the conversation — not editable here
              </p>
            </div>
            <button
              type="button"
              className="register-receipt__toggle t-para-sm"
              onClick={() => setPreviewOpen((o) => !o)}
            >
              {previewOpen ? "Hide" : "Show"}
            </button>
          </div>

          <div className="register-receipt__progress">
            <div className="register-receipt__progress-head">
              <span className="t-label-sm">{requiredFilled}/{requiredFields.length} required</span>
              {complete && (
                <span className="t-para-sm text-muted">Ready to register</span>
              )}
            </div>
            <div className="register-receipt__progress-track">
              <div
                className="register-receipt__progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="register-receipt__body">
            {PREVIEW_FIELDS.map((field) => {
              const filled = isRegisterFieldFilled(record, field);
              const optional = !requiredFields.includes(field);
              return (
                <div
                  key={field}
                  className={`register-receipt__row ${
                    flashFields.has(field) ? "register-receipt__row--flash" : ""
                  } ${filled ? "register-receipt__row--set" : "register-receipt__row--unset"}`}
                >
                  <span className="register-receipt__label t-label-sm">
                    {fieldLabel(field)}
                    {optional && (
                      <span className="register-receipt__optional t-tag-sm">optional</span>
                    )}
                  </span>
                  <span className="register-receipt__value t-para-sm">
                    {filled ? fieldDisplayValue(record, field) : "—"}
                  </span>
                </div>
              );
            })}

            <div className="register-receipt__row register-receipt__row--set">
              <span className="register-receipt__label t-label-sm">Owner</span>
              <span className="register-receipt__value t-para-sm">
                {record.ownerName} ({record.ownerSlackId})
              </span>
            </div>

            {dedupMatches.length > 0 && record.name && record.oneLiner && (
              <div className="register-receipt__dedup">
                <p className="t-subheading-rg">Might already exist</p>
                <div className="tool-grid tool-grid--compact">
                  {dedupMatches.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="register-receipt__footer">
            <Button
              variant="primary"
              disabled={!complete}
              onClick={handleRegister}
              className="register-receipt__register-btn"
            >
              {isPlanned ? "Register idea" : "Submit for review"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
