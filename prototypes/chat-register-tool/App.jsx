const { useState, useEffect, useRef, useCallback } = React;

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORIES = ["Data", "AI/ML", "DevOps", "Payments", "Communication", "Other"];

const CATEGORY_KEYWORDS = {
  Data: ["data", "database", "sql", "analytics", "warehouse", "bigquery", "etl", "query", "csv", "dataset"],
  "AI/ML": ["ai", "ml", "llm", "model", "gpt", "embedding", "machine learning", "claude", "openai", "inference"],
  DevOps: ["deploy", "ci/cd", "kubernetes", "docker", "infra", "cloudflare", "monitoring", "grafana", "terraform"],
  Payments: ["payment", "stripe", "billing", "invoice", "checkout", "refund", "subscription"],
  Communication: ["slack", "email", "sms", "notification", "chat", "webhook", "zendesk", "twilio"],
};

const REQUIRED = ["name", "description", "category", "authMethod", "endpointUrl"];
const ALL_FIELDS = ["name", "description", "category", "inputs", "authMethod", "endpointUrl", "pricing"];

const FIELD_LABELS = {
  name: "Name",
  description: "Description",
  category: "Category",
  inputs: "Inputs",
  authMethod: "Auth method",
  endpointUrl: "Endpoint URL",
  pricing: "Pricing",
};

const FIELD_QUESTIONS = {
  name: "What should we call this tool?",
  description: "What does it do, in a sentence or two?",
  category: "Which category fits best — Data, AI/ML, DevOps, Payments, Communication, or Other?",
  authMethod: "How do callers authenticate — API key, OAuth, or none?",
  endpointUrl: "What's the endpoint URL callers hit?",
  pricing: "Any pricing to show? (e.g. Free, $9/mo — or say \"skip\")",
  inputs: "What inputs does it take? (e.g. city (string), date (date) — or say \"skip\")",
};

const OPENING =
  "Let's get your tool listed. What does it do, in a sentence or two?";

// ─── Record helpers ──────────────────────────────────────────────────────────

function emptyRecord() {
  return {
    name: "",
    description: "",
    category: "",
    inputs: [],
    authMethod: "",
    endpointUrl: "",
    pricing: "",
  };
}

function isFieldFilled(record, field) {
  if (field === "inputs") return record.inputs.length > 0;
  return Boolean(record[field]?.toString().trim());
}

function countFilled(record) {
  return ALL_FIELDS.filter((f) => isFieldFilled(record, f)).length;
}

function isComplete(record) {
  return REQUIRED.every((f) => isFieldFilled(record, f));
}

function nextMissingRequired(record) {
  return REQUIRED.find((f) => !isFieldFilled(record, f)) ?? null;
}

// ─── Extraction ──────────────────────────────────────────────────────────────

function extractUrl(text) {
  const m = text.match(/https?:\/\/[^\s,)>\]"']+/i);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

function extractAuth(text) {
  const lower = text.toLowerCase();
  if (/\b(none|no auth|no authentication|public|unauthenticated)\b/.test(lower)) return "None";
  if (/\boauth\s*2?\.?0?\b/.test(lower)) return "OAuth";
  if (/\b(api[\s-]?key|apikey|bearer token|bearer)\b/.test(lower)) return "API key";
  return null;
}

function extractPricing(text) {
  const lower = text.toLowerCase();
  if (/\bskip\b/.test(lower) && !/\$\d/.test(text)) return null;
  if (/\bfree\b/.test(lower)) return "Free";
  const dollar = text.match(/\$\s*\d+(?:\.\d{2})?(?:\s*\/?\s*mo(?:nth)?)?/i);
  if (dollar) return dollar[0].replace(/\s+/g, "");
  const perMo = text.match(/\d+(?:\.\d{2})?\s*\/?\s*mo(?:nth)?/i);
  if (perMo) return `$${perMo[0]}`;
  if (/\bpay[\s-]?as[\s-]?you[\s-]?go\b/i.test(text)) return "Pay as you go";
  return null;
}

function extractName(text) {
  const patterns = [
    /(?:actually|change|update|rename|correct).{0,30}(?:name(?:\s+is)?|called|named)\s+["']?([^"'\n,.—]+?)["']?(?:\.|,|$)/i,
    /(?:it's|its|it is|tool is)\s+called\s+["']?([^"'\n,.—]+?)["']?(?:\s*[—–-]|\s+(?:a|an)\s+|\.|,|$)/i,
    /(?:called|named)\s+["']([^"']+)["']/i,
    /(?:called|named)\s+([A-Z][A-Za-z0-9]+(?:\s+[A-Za-z0-9]+){0,4})(?=\s*[—–-.]|$)/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

function extractCategory(text) {
  const lower = text.toLowerCase();
  for (const cat of CATEGORIES) {
    if (new RegExp(`\\b${cat.replace("/", "\\/")}\\b`, "i").test(text)) return cat;
  }
  let best = null;
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter((k) => lower.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }
  return bestScore > 0 ? best : null;
}

function extractInputs(text) {
  const inputs = [];
  const re = /(\w[\w-]*)\s*[\(:]\s*(string|number|boolean|date|json|object|array|int|float|text)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    inputs.push({ name: m[1], type: m[2].toLowerCase() });
  }
  if (inputs.length) return inputs;
  const simple = text.match(/inputs?\s*:?\s*([^.]+)/i);
  if (simple) {
    simple[1].split(/,\s*/).forEach((part) => {
      const bit = part.trim().match(/^(\w+)\s*(?:\((\w+)\))?/);
      if (bit) inputs.push({ name: bit[1], type: (bit[2] || "string").toLowerCase() });
    });
  }
  return inputs.length ? inputs : null;
}

function extractDescription(text, record) {
  const correction = text.match(
    /(?:actually|change|update).{0,20}description(?:\s+is)?\s+["']?([^"'\n]+?)["']?(?:\.|$)/i,
  );
  if (correction) return correction[1].trim();

  const afterCalled = text.match(
    /(?:called|named)\s+[^.]+?[—–-]\s*(.+?)(?:\.\s*(?:Endpoint|Auth|Inputs|Free|Pricing)|\s+Endpoint|\s+Auth|\s+Inputs|$)/i,
  );
  if (afterCalled) return afterCalled[1].trim();

  const hasStructured =
    extractUrl(text) ||
    extractAuth(text) ||
    extractName(text) ||
    extractCategory(text);

  if (text.length >= 25 && !hasStructured) return text.trim();
  if (text.length >= 40 && !record.description && !hasStructured) return text.trim();
  return null;
}

function extractCorrections(text) {
  const updates = {};
  const endpointFix = text.match(
    /(?:actually|change|update|correct).{0,25}endpoint(?:\s+url)?(?:\s+is|\s+to|\s+should be)?\s+(https?:\/\/[^\s]+)/i,
  );
  if (endpointFix) updates.endpointUrl = endpointFix[1].replace(/[.,;]+$/, "");

  const authFix = text.match(
    /(?:actually|change|update).{0,25}auth(?:entication)?(?:\s+is|\s+to)\s+(api key|oauth|none)/i,
  );
  if (authFix) {
    const v = authFix[1].toLowerCase();
    updates.authMethod = v.includes("oauth") ? "OAuth" : v.includes("none") ? "None" : "API key";
  }

  const catFix = text.match(
    /(?:actually|change|update).{0,25}category(?:\s+is|\s+to)\s+(Data|AI\/ML|DevOps|Payments|Communication|Other)/i,
  );
  if (catFix) updates.category = catFix[1];

  return updates;
}

function extractFromMessage(text, record) {
  const updates = { ...extractCorrections(text) };
  const confirmations = [];

  const url = extractUrl(text);
  if (url && url !== record.endpointUrl) {
    updates.endpointUrl = url;
    confirmations.push(`endpoint set to ${url}`);
  }

  const auth = extractAuth(text);
  if (auth && auth !== record.authMethod) {
    updates.authMethod = auth;
    confirmations.push(`auth method set to ${auth}`);
  }

  const pricing = extractPricing(text);
  if (pricing && pricing !== record.pricing) {
    updates.pricing = pricing;
    confirmations.push(`pricing set to ${pricing}`);
  }

  const name = extractName(text);
  if (name && name !== record.name) {
    updates.name = name;
    confirmations.push(`name set to "${name}"`);
  }

  const category = extractCategory(text);
  if (category && category !== record.category) {
    updates.category = category;
    confirmations.push(`category set to ${category}`);
  }

  const inputs = extractInputs(text);
  if (inputs && JSON.stringify(inputs) !== JSON.stringify(record.inputs)) {
    updates.inputs = inputs;
    confirmations.push(
      `inputs set to ${inputs.map((i) => `${i.name} (${i.type})`).join(", ")}`,
    );
  }

  const description = extractDescription(text, record);
  if (description && description !== record.description) {
    updates.description = description;
    confirmations.push(`description captured`);
  }

  if (/^(skip|no|none|n\/a)$/i.test(text.trim()) && !Object.keys(updates).length) {
    return { updates: {}, confirmations: [], skipped: true };
  }

  return { updates, confirmations, skipped: false };
}

// ─── Agent reply builder ─────────────────────────────────────────────────────

function buildAgentReply(record, confirmations, justRegistered) {
  if (justRegistered) return null;

  const parts = [];

  if (confirmations.length) {
    parts.push(
      confirmations.map((c) => `Got it — ${c} ✅`).join("\n"),
    );
  }

  if (isComplete(record)) {
    parts.push(
      `Here's the summary:\n• **${record.name}** (${record.category})\n• ${record.description}\n• Endpoint: ${record.endpointUrl}\n• Auth: ${record.authMethod}${record.pricing ? `\n• Pricing: ${record.pricing}` : ""}${record.inputs.length ? `\n• Inputs: ${record.inputs.map((i) => `${i.name} (${i.type})`).join(", ")}` : ""}\n\nLooks complete — hit **Register** when you're ready.`,
    );
    return parts.join("\n\n");
  }

  const missing = nextMissingRequired(record);
  if (missing) {
    parts.push(FIELD_QUESTIONS[missing]);
  }

  return parts.join("\n\n") || FIELD_QUESTIONS.description;
}

function getQuickReplies(lastAgentText, record) {
  if (!lastAgentText) return [];
  if (lastAgentText.includes("authenticate")) {
    return ["API key", "OAuth", "None"];
  }
  if (lastAgentText.includes("category")) {
    return CATEGORIES;
  }
  if (lastAgentText.includes("pricing")) {
    return ["Free", "$9/mo", "skip"];
  }
  if (lastAgentText.includes("inputs")) {
    return ["city (string), date (date)", "skip"];
  }
  return [];
}

// ─── UI Components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
        <span className="text-sm">🤖</span>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, text }) {
  const isAgent = role === "agent";
  const lines = text.split("\n");

  return (
    <div
      className={`flex items-start gap-3 animate-slide-up ${isAgent ? "" : "flex-row-reverse"}`}
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isAgent ? "bg-indigo-100" : "bg-emerald-100"
        }`}
      >
        <span className="text-sm">{isAgent ? "🤖" : "👤"}</span>
      </div>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
          isAgent
            ? "bg-white border border-slate-200 rounded-tl-md text-slate-800"
            : "bg-indigo-600 text-white rounded-tr-md"
        }`}
      >
        {lines.map((line, i) => {
          const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
          return (
            <p
              key={i}
              className={`text-sm leading-relaxed ${i > 0 ? "mt-2" : ""}`}
              dangerouslySetInnerHTML={{ __html: bold }}
            />
          );
        })}
      </div>
    </div>
  );
}

function PreviewField({ label, value, flash, optional, isInputs }) {
  const filled = isInputs ? value?.length > 0 : Boolean(value?.toString().trim());
  const display = isInputs
    ? value.length
      ? value.map((i) => `${i.name}: ${i.type}`).join(", ")
      : null
    : value;

  return (
    <div
      className={`rounded-lg px-3 py-2.5 transition-all duration-500 ${
        flash
          ? "bg-emerald-50 ring-2 ring-emerald-400/60"
          : filled
            ? "bg-white border border-slate-200"
            : "bg-slate-50 border border-dashed border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {optional && !filled && (
          <span className="text-[10px] text-slate-400">optional</span>
        )}
      </div>
      <p
        className={`text-sm ${filled ? "text-slate-900 font-medium" : "text-slate-400 italic"}`}
      >
        {display || (isInputs ? "No inputs yet" : `Add ${label.toLowerCase()}…`)}
      </p>
    </div>
  );
}

function ToolPreview({ record, flashFields, onRegister, registered, registeredName }) {
  const filled = countFilled(record);
  const complete = isComplete(record);
  const pct = Math.round((filled / ALL_FIELDS.length) * 100);

  if (registered) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 animate-fade-in">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {registeredName} registered
        </h2>
        <p className="text-sm text-slate-500">
          Final record logged to console. In production this would hit the catalogue API.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-5 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-bold text-slate-900">Tool Preview</h2>
          <span className="text-xs font-medium text-slate-500">
            {filled}/{ALL_FIELDS.length} fields
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {complete ? "All required fields filled" : `${REQUIRED.filter((f) => isFieldFilled(record, f)).length}/${REQUIRED.length} required`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-2.5 bg-slate-50/80">
        <PreviewField label="Name" value={record.name} flash={flashFields.has("name")} />
        <PreviewField label="Description" value={record.description} flash={flashFields.has("description")} />
        <PreviewField label="Category" value={record.category} flash={flashFields.has("category")} />
        <PreviewField label="Inputs" value={record.inputs} flash={flashFields.has("inputs")} optional isInputs />
        <PreviewField label="Auth method" value={record.authMethod} flash={flashFields.has("authMethod")} />
        <PreviewField label="Endpoint URL" value={record.endpointUrl} flash={flashFields.has("endpointUrl")} />
        <PreviewField label="Pricing" value={record.pricing} flash={flashFields.has("pricing")} optional />
      </div>

      <div className="p-5 border-t border-slate-200 bg-white">
        <button
          type="button"
          onClick={onRegister}
          disabled={!complete}
          className={`w-full py-3 px-4 rounded-xl text-sm font-semibold transition-all ${
            complete
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          }`}
        >
          Register tool
        </button>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────

function App() {
  const [record, setRecord] = useState(emptyRecord);
  const [messages, setMessages] = useState([{ id: 1, role: "agent", text: OPENING }]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [flashFields, setFlashFields] = useState(new Set());
  const [registered, setRegistered] = useState(false);
  const [registeredName, setRegisteredName] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const threadRef = useRef(null);
  const msgId = useRef(2);

  const scrollToBottom = useCallback(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, []);

  useEffect(scrollToBottom, [messages, typing]);

  const pushAgentMessage = useCallback((text) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((prev) => [...prev, { id: msgId.current++, role: "agent", text }]);
    }, 600);
  }, []);

  const handleSend = useCallback(
    (text) => {
      const trimmed = text.trim();
      if (!trimmed || typing || registered) return;

      setMessages((prev) => [...prev, { id: msgId.current++, role: "user", text: trimmed }]);
      setInput("");

      setRecord((prev) => {
        const { updates, confirmations } = extractFromMessage(trimmed, prev);
        const next = { ...prev, ...updates };

        setTimeout(() => {
          if (Object.keys(updates).length) {
            setFlashFields(new Set(Object.keys(updates)));
            setTimeout(() => setFlashFields(new Set()), 1200);
          }
          const reply = buildAgentReply(next, confirmations, false);
          if (reply) pushAgentMessage(reply);
        }, 0);

        return next;
      });
    },
    [typing, registered, pushAgentMessage],
  );

  const handleRegister = useCallback(() => {
    if (!isComplete(record)) return;
    console.log("Registered tool:", JSON.stringify(record, null, 2));
    setRegistered(true);
    setRegisteredName(record.name);
    pushAgentMessage(`✅ **${record.name}** is registered! Check the preview panel — full JSON is in the console.`);
  }, [record, pushAgentMessage]);

  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const quickReplies = registered ? [] : getQuickReplies(lastAgent?.text, record);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <style>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-up { animation: slide-up 0.35s ease-out; }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
      `}</style>

      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Register a Tool</h1>
          <p className="text-xs text-slate-500">Chat-based registration prototype</p>
        </div>
        <button
          type="button"
          onClick={() => setPreviewOpen((o) => !o)}
          className="lg:hidden text-sm font-medium text-indigo-600 px-3 py-1.5 rounded-lg bg-indigo-50"
        >
          {previewOpen ? "Hide preview" : `Preview (${countFilled(record)}/7)`}
        </button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full">
        {/* Chat pane — 60% */}
        <div className="flex flex-col lg:w-[60%] border-r border-slate-200 bg-slate-50 min-h-0 flex-1 lg:flex-none lg:h-[calc(100vh-57px)]">
          <div ref={threadRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role} text={m.text} />
            ))}
            {typing && <TypingIndicator />}
          </div>

          {quickReplies.length > 0 && !typing && (
            <div className="px-4 pb-2 flex flex-wrap gap-2 animate-fade-in">
              {quickReplies.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleSend(chip)}
                  className="text-xs font-medium px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors shadow-sm"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}

          <div className="p-4 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={typing || registered}
                placeholder={registered ? "Registration complete" : "Type your answer…"}
                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400"
              />
              <button
                type="submit"
                disabled={!input.trim() || typing || registered}
                className="px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Preview pane — 40% */}
        <div
          className={`lg:w-[40%] bg-white lg:h-[calc(100vh-57px)] ${
            previewOpen ? "block" : "hidden"
          } lg:block border-t lg:border-t-0 border-slate-200`}
        >
          <ToolPreview
            record={record}
            flashFields={flashFields}
            onRegister={handleRegister}
            registered={registered}
            registeredName={registeredName}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────────

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
