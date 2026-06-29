"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
import { DEMO_USER, findDedupMatches } from "@/lib/mockData";
import {
  PREVIEW_FIELDS,
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
  isRegisterComplete,
  isRegisterFieldFilled,
  nextMissingField,
  openingMessage,
  type RegisterChatField,
} from "@/lib/registerToolChat";
import { fetchZepManifest, parseZepManifest, type ZepManifest } from "@/lib/zeps";
import { GATE_ELIGIBILITY_NOTE } from "@/lib/adminMetrics";
import {
  TOOL_TYPES,
  normalizeCatalogueTypeParam,
  type ToolFormData,
} from "@/lib/types";

const TYPING_DELAY_MS = 600;

type ChatMessage = {
  id: string;
  role: "agent" | "user";
  text: string;
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

  const [record, setRecord] = useState<ToolFormData>(initialForm);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: msgId(), role: "agent", text: openingMessage(prefillRef) },
  ]);
  const [input, setInput] = useState("");
  const [zepLink, setZepLink] = useState("");
  const [zepFileName, setZepFileName] = useState("");
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

  const scrollToBottom = useCallback(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(scrollToBottom, [messages, typing]);

  const pushAgentMessage = useCallback((text: string) => {
    setTyping(true);
    window.setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { id: msgId(), role: "agent", text }]);
    }, TYPING_DELAY_MS);
  }, []);

  const analyzeAndPrefill = useCallback(
    async (manifest: ZepManifest) => {
      if (typing || registered || analyzing) return;

      setAnalyzing(true);
      try {
        const res = await fetch("/api/analyze-zep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest }),
        });

        if (!res.ok) {
          throw new Error("analyze failed");
        }

        const draft = (await res.json()) as Partial<ToolFormData>;
        setRecord((prev) => applyZepAnalysisDraft(prev, draft));
        const flash = flashFieldsFromDraft(draft);
        setFlashFields(new Set(flash));
        window.setTimeout(() => setFlashFields(new Set()), 1200);
        pushAgentMessage(buildZepReviewAgentMessage());
      } catch {
        pushAgentMessage(
          "Couldn't analyze that Zep — try again or use the manual flow below.",
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [analyzing, typing, registered, pushAgentMessage],
  );

  const handleZepFileUpload = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file || typing || registered || analyzing) return;

      setZepFileName(file.name);

      const text = await file.text();
      const manifest = parseZepManifest(text);
      if (!manifest) {
        setZepFileName("");
        pushAgentMessage(
          "Couldn't read that file — upload a JSON Zep export.",
        );
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: msgId(), role: "user", text: `Uploaded Zep: ${file.name}` },
      ]);
      await analyzeAndPrefill(manifest);
      setZepFileName("");
    },
    [analyzeAndPrefill, analyzing, pushAgentMessage, registered, typing],
  );

  const handleZepLinkAnalyze = useCallback(async () => {
    const url = zepLink.trim();
    if (!url || typing || registered || analyzing) return;

    setMessages((prev) => [...prev, { id: msgId(), role: "user", text: url }]);
    setZepLink("");

    const manifest = await fetchZepManifest(url);
    if (!manifest) {
      pushAgentMessage(
        "That doesn't look like a Zeps link — try again or upload JSON.",
      );
      return;
    }

    await analyzeAndPrefill(manifest);
  }, [analyzeAndPrefill, analyzing, pushAgentMessage, registered, typing, zepLink]);

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || typing || analyzing || registered) return;

      setMessages((prev) => [...prev, { id: msgId(), role: "user", text: trimmed }]);
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
    [typing, analyzing, registered, pushAgentMessage],
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
    console.log("Registered tool:", JSON.stringify(payload, null, 2));
    setRegistered(true);
    pushAgentMessage(
      `✅ **${record.name}** is submitted! Pending admin approval before it appears in search.`,
    );
  }, [complete, record, submitTool, pushAgentMessage]);

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const quickReplies =
    registered || typing || analyzing
      ? []
      : getQuickReplies(lastAgent?.text ?? "", record);
  const entryDisabled = typing || registered || analyzing;

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
                ? "Hide preview"
                : `Preview (${requiredFilled}/${requiredFields.length})`}
            </button>
          </div>

          <div className="register-chat__entry">
            <p className="register-chat__entry-lead t-para-sm text-muted">
              Have a Zep already? Start from the artifact — we&apos;ll draft the
              listing.
            </p>
            <div className="register-chat__entry-options">
              <div className="register-chat__entry-option">
                <span className="register-chat__entry-label t-label-sm">
                  Upload a Zep
                </span>
                <div className="register-chat__entry-link-row">
                  <input
                    ref={zepFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="register-chat__entry-file-input"
                    disabled={entryDisabled}
                    onChange={handleZepFileUpload}
                    aria-label="Upload a Zep JSON export"
                    tabIndex={-1}
                  />
                  <span
                    className={`register-chat__entry-input register-chat__entry-filename t-para-sm${
                      zepFileName ? "" : " text-muted"
                    }`}
                    aria-hidden
                  >
                    {zepFileName || "JSON export (.json)"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={entryDisabled}
                    onClick={() => zepFileInputRef.current?.click()}
                  >
                    {analyzing ? "Analyzing…" : "Choose file"}
                  </Button>
                </div>
              </div>
              <div className="register-chat__entry-option">
                <span className="register-chat__entry-label t-label-sm">
                  Paste a Zeps link
                </span>
                <div className="register-chat__entry-link-row">
                  <input
                    type="url"
                    className="register-chat__entry-input t-para-sm"
                    value={zepLink}
                    onChange={(e) => setZepLink(e.target.value)}
                    disabled={entryDisabled}
                    placeholder="https://zeps-taupe.vercel.app/…"
                    aria-label="Zeps agent link"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!zepLink.trim() || entryDisabled}
                    onClick={() => void handleZepLinkAnalyze()}
                  >
                    {analyzing ? "Analyzing…" : "Analyze"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div ref={threadRef} className="register-chat__thread">
            <ul className="register-chat__messages">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`register-chat__message register-chat__message--${m.role}`}
                >
                  <div className="register-chat__avatar" aria-hidden>
                    {m.role === "agent" ? "🤖" : "👤"}
                  </div>
                  <div className="register-chat__bubble">
                    {m.role === "agent" ? renderAgentText(m.text) : (
                      <p className="register-chat__line t-para-rg">{m.text}</p>
                    )}
                  </div>
                </li>
              ))}
              {typing && (
                <li className="register-chat__message register-chat__message--agent">
                  <div className="register-chat__avatar" aria-hidden>
                    🤖
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
          className={`register-chat__pane register-chat__pane--preview ${
            previewOpen ? "register-chat__pane--preview-open" : ""
          }`}
        >
          <div className="register-chat__preview-header">
            <div>
              <h2 className="register-chat__preview-title t-heading-sm">Tool preview</h2>
              <p className="register-chat__preview-meta t-para-sm text-muted">
                {requiredFilled}/{requiredFields.length} required
                {complete ? " · ready to register" : ""}
              </p>
            </div>
            <button
              type="button"
              className="register-chat__preview-toggle t-para-sm"
              onClick={() => setPreviewOpen((o) => !o)}
            >
              {previewOpen ? "Hide" : "Show"}
            </button>
          </div>

          <div className="register-chat__progress">
            <div
              className="register-chat__progress-fill"
              style={{
                width: `${Math.round((requiredFilled / requiredFields.length) * 100)}%`,
              }}
            />
          </div>

          <div className="register-chat__preview-body">
            {PREVIEW_FIELDS.map((field) => {
              const filled = isRegisterFieldFilled(record, field);
              const optional = !requiredFields.includes(field);
              return (
                <div
                  key={field}
                  className={`register-chat__field ${
                    flashFields.has(field) ? "register-chat__field--flash" : ""
                  } ${filled ? "register-chat__field--filled" : "register-chat__field--empty"}`}
                >
                  <div className="register-chat__field-head">
                    <span className="register-chat__field-label t-label-sm">
                      {fieldLabel(field)}
                    </span>
                    {optional && !filled && (
                      <span className="register-chat__field-opt t-tag-sm">optional</span>
                    )}
                  </div>
                  <p className="register-chat__field-value t-para-sm">
                    {filled
                      ? fieldDisplayValue(record, field)
                      : `Add ${fieldLabel(field).toLowerCase()}…`}
                  </p>
                </div>
              );
            })}

            <div className="register-chat__field register-chat__field--filled">
              <div className="register-chat__field-head">
                <span className="register-chat__field-label t-label-sm">Owner</span>
              </div>
              <p className="register-chat__field-value t-para-sm">
                {record.ownerName} ({record.ownerSlackId})
              </p>
            </div>

            {dedupMatches.length > 0 && record.name && record.oneLiner && (
              <div className="register-chat__dedup">
                <p className="t-subheading-rg">Might already exist</p>
                <div className="tool-grid tool-grid--compact">
                  {dedupMatches.map((tool) => (
                    <ToolCard key={tool.id} tool={tool} />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="register-chat__preview-footer">
            <Button
              variant="primary"
              disabled={!complete}
              onClick={handleRegister}
              className="register-chat__register-btn"
            >
              {isPlanned ? "Register idea" : "Submit for review"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
