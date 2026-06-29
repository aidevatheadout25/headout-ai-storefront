"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ChatMessageBubble } from "@/components/ChatMessageBubble";
import { DemoModePicker } from "@/components/DemoModePicker";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { RoleBanner } from "@/components/RoleSwitcher";
import { useApp } from "@/context/AppContext";
import { resolveAskQuery } from "@/lib/askBar";
import type { ChatMessage, DemoMode, QuickReply } from "@/lib/chatTypes";
import { DEMO_STEP_DELAY_MS } from "@/lib/chatTypes";
import { buildDemoScript } from "@/lib/demoScenarios";
import { matchFunnelReuse } from "@/lib/funnel";
import {
  buildPmRecommendation,
  findNearDuplicateTools,
  isVagueProblem,
  pmPushbackMessage,
} from "@/lib/pm";
import type {
  RequestPrerequisites,
  RequestValidation,
  RiskAnswer,
} from "@/lib/types";

const EMPTY_PREREQ: RequestPrerequisites = {
  dataSources: "",
  systems: "",
  inputsOutputs: "",
  touchesPII: "no",
  touchesPayments: "no",
  usesLLM: "no",
  needsExternalDep: "no",
};

const EMPTY_VALIDATION: RequestValidation = {
  problem: "",
  whoHasIt: "",
  frequency: "",
  currentWorkaround: "",
  expectedValue: "",
};

const STARTER_CHIPS = [
  { id: "find-tool", label: "Find a tool" },
  { id: "build", label: "I have something to build" },
  { id: "team", label: "What exists for my team?" },
  { id: "browse", label: "Browse the catalogue" },
] as const;

type ChatPhase =
  | "idle"
  | "match-choice"
  | "q-problem"
  | "q-problem-pushback"
  | "q-who"
  | "q-frequency"
  | "q-impact"
  | "q-risk"
  | "pm-done";

function msgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function assistant(text: string, attachment?: ChatMessage["attachment"]): ChatMessage {
  return { id: msgId(), role: "assistant", text, attachment };
}

function user(text: string): ChatMessage {
  return { id: msgId(), role: "user", text };
}

function resetLiveState(): {
  phase: ChatPhase;
  validation: RequestValidation;
  prerequisites: RequestPrerequisites;
  sentence: string;
  title: string;
  pushbackUsed: boolean;
  reuseMatches: ReturnType<typeof matchFunnelReuse> | null;
} {
  return {
    phase: "idle",
    validation: { ...EMPTY_VALIDATION },
    prerequisites: { ...EMPTY_PREREQ },
    sentence: "",
    title: "",
    pushbackUsed: false,
    reuseMatches: null,
  };
}

export function HomeChat() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement>(null);
  const playbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackIndexRef = useRef(0);
  const playbackScriptRef = useRef<ChatMessage[]>([]);

  const {
    approvedTools,
    allTools,
    buildingBlocks,
    currentUser,
    recordZeroResultSearch,
  } = useApp();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [demoMode, setDemoMode] = useState<DemoMode>("live");
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [demoCanReplay, setDemoCanReplay] = useState(false);
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [input, setInput] = useState("");
  const [sentence, setSentence] = useState("");
  const [title, setTitle] = useState("");
  const [validation, setValidation] = useState<RequestValidation>({
    ...EMPTY_VALIDATION,
  });
  const [prerequisites, setPrerequisites] = useState<RequestPrerequisites>({
    ...EMPTY_PREREQ,
  });
  const [reuseMatches, setReuseMatches] = useState<ReturnType<
    typeof matchFunnelReuse
  > | null>(null);
  const [pushbackUsed, setPushbackUsed] = useState(false);
  const [started, setStarted] = useState(false);

  const isDemo = demoMode !== "live";

  const append = useCallback((...next: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...next]);
  }, []);

  const clearPlaybackTimer = useCallback(() => {
    if (playbackTimerRef.current) {
      clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
  }, []);

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
  }, [messages, scrollToEnd]);

  useEffect(() => {
    return () => clearPlaybackTimer();
  }, [clearPlaybackTimer]);

  const scheduleDemoStep = useCallback(() => {
    const script = playbackScriptRef.current;
    if (playbackIndexRef.current >= script.length) {
      setDemoPlaying(false);
      setDemoCanReplay(true);
      return;
    }

    const next = script[playbackIndexRef.current];
    playbackIndexRef.current += 1;
    append(next);
    setStarted(true);

    playbackTimerRef.current = setTimeout(() => {
      scheduleDemoStep();
    }, DEMO_STEP_DELAY_MS);
  }, [append]);

  const startDemoPlayback = useCallback(
    (mode: DemoMode) => {
      clearPlaybackTimer();
      const script = buildDemoScript(mode, approvedTools);
      playbackScriptRef.current = script;
      playbackIndexRef.current = 0;
      setMessages([]);
      setDemoPlaying(true);
      setDemoCanReplay(false);
      setStarted(false);
      setInput("");

      if (script.length === 0) {
        setDemoPlaying(false);
        return;
      }

      scheduleDemoStep();
    },
    [approvedTools, clearPlaybackTimer, scheduleDemoStep],
  );

  const skipDemoPlayback = useCallback(() => {
    clearPlaybackTimer();
    const script = playbackScriptRef.current;
    const remaining = script.slice(playbackIndexRef.current);
    if (remaining.length > 0) {
      append(...remaining);
      setStarted(true);
    }
    playbackIndexRef.current = script.length;
    setDemoPlaying(false);
    setDemoCanReplay(true);
  }, [append, clearPlaybackTimer]);

  const replayDemo = useCallback(() => {
    if (demoMode !== "live") {
      startDemoPlayback(demoMode);
    }
  }, [demoMode, startDemoPlayback]);

  const handleDemoModeChange = useCallback(
    (mode: DemoMode) => {
      setDemoMode(mode);
      clearPlaybackTimer();

      const reset = resetLiveState();
      setPhase(reset.phase);
      setValidation(reset.validation);
      setPrerequisites(reset.prerequisites);
      setSentence(reset.sentence);
      setTitle(reset.title);
      setPushbackUsed(reset.pushbackUsed);
      setReuseMatches(reset.reuseMatches);
      setMessages([]);
      setStarted(false);
      setDemoPlaying(false);
      setDemoCanReplay(false);
      setInput("");

      if (mode !== "live") {
        startDemoPlayback(mode);
      }
    },
    [clearPlaybackTimer, startDemoPlayback],
  );

  const deliverPmOutcome = useCallback(() => {
    const recommendation = buildPmRecommendation({
      title,
      sentence,
      validation,
      prerequisites,
      reuseToolNames: reuseMatches?.tools.map((t) => t.name),
      reuseBlockNames: reuseMatches?.blocks.map((b) => b.name),
      nearMatchTools: findNearDuplicateTools(
        validation,
        title,
        allTools,
        currentUser.id,
      ),
    });

    const intro =
      recommendation.reuseNote ??
      "Here's how I'd scope this — build the smallest useful version, then register it.";

    append(
      assistant(intro, {
        type: "pm-recommendation",
        recommendation,
      }),
      assistant(
        "Go build it with the path above. When it's working, register it so the next person finds it.",
        {
          type: "register-cta",
          name: title.slice(0, 80),
          oneLiner: validation.problem.slice(0, 120) || sentence.slice(0, 120),
          toolType: recommendation.buildPath.toolType,
          status: "planned",
        },
      ),
    );
    setPhase("pm-done");
  }, [
    allTools,
    append,
    currentUser.id,
    prerequisites,
    reuseMatches,
    sentence,
    title,
    validation,
  ]);

  const showMatchResults = useCallback(
    (query: string, matches: ReturnType<typeof matchFunnelReuse>) => {
      const tools = matches.tools;
      const blocks = matches.blocks;

      const replies: QuickReply[] = [
        ...tools.map((t) => ({
          id: `open-tool-${t.id}`,
          label: `${t.name} fits`,
          variant: "primary" as const,
        })),
        { id: "none-fit", label: "None of these fit", variant: "secondary" },
      ];

      append(
        assistant(
          tools.length > 0 || blocks.length > 0
            ? "Reuse first — does one of these already solve it? Don't build if it exists."
            : "Nothing close in the catalogue. Let's pressure-test the idea before you build.",
          tools.length > 0 || blocks.length > 0
            ? { type: "matches", tools, blocks }
            : undefined,
        ),
      );

      if (tools.length > 0 || blocks.length > 0) {
        append(
          assistant("Pick one or keep going.", {
            type: "quick-replies",
            replies,
          }),
        );
        setPhase("match-choice");
      } else {
        setValidation((v) => ({
          ...v,
          problem: query,
        }));
        if (isVagueProblem(query)) {
          setPushbackUsed(true);
          append(assistant(pmPushbackMessage(query)));
          setPhase("q-problem-pushback");
        } else {
          append(
            assistant(
              "Who exactly has this problem? Team, role, and roughly how many people.",
            ),
          );
          setPhase("q-who");
        }
      }
    },
    [append],
  );

  const beginIntakeFromQuery = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      setSentence(trimmed);
      setTitle(trimmed.slice(0, 80));
      setPushbackUsed(false);
      const matches = matchFunnelReuse(trimmed, approvedTools, buildingBlocks);
      setReuseMatches(matches);

      const askResult = resolveAskQuery(trimmed, approvedTools);
      if (askResult.type === "fallback" && askResult.reason === "no-match") {
        recordZeroResultSearch(trimmed);
      }

      const mergedTools =
        askResult.type === "tools"
          ? [
              ...askResult.tools,
              ...matches.tools.filter(
                (t) => !askResult.tools.some((m) => m.id === t.id),
              ),
            ]
          : matches.tools;

      showMatchResults(trimmed, {
        ...matches,
        tools: mergedTools.slice(0, 5),
      });
    },
    [
      approvedTools,
      buildingBlocks,
      recordZeroResultSearch,
      showMatchResults,
    ],
  );

  const handleStarter = useCallback(
    (chipId: string) => {
      if (isDemo) return;
      setStarted(true);
      if (chipId === "browse") {
        router.push("/registry");
        router.refresh();
        return;
      }

      if (chipId === "find-tool") {
        append(
          assistant("What tool or problem are you looking for? Plain language is fine."),
        );
        setPhase("idle");
        return;
      }

      if (chipId === "build") {
        append(
          assistant(
            "In one sentence — what do you want to build or need?",
          ),
        );
        setPhase("idle");
        return;
      }

      if (chipId === "team") {
        const teamTools = approvedTools.filter(
          (t) => t.team === currentUser.team,
        );
        append(
          user(`What exists for ${currentUser.team}?`),
          assistant(
            teamTools.length > 0
              ? `Here's what ${currentUser.team} has in the catalogue.`
              : `No tools tagged to ${currentUser.team} yet — tell me what you're looking for.`,
            teamTools.length > 0
              ? {
                  type: "matches",
                  tools: teamTools.slice(0, 5),
                  blocks: [],
                }
              : undefined,
          ),
        );
        if (teamTools.length > 0) {
          append(
            assistant("Open one, or describe what you still need.", {
              type: "quick-replies",
              replies: [
                ...teamTools.slice(0, 3).map((t) => ({
                  id: `open-tool-${t.id}`,
                  label: t.name,
                  variant: "primary" as const,
                })),
                {
                  id: "none-fit",
                  label: "Still need something else",
                  variant: "secondary",
                },
              ],
            }),
          );
          setPhase("match-choice");
        }
      }
    },
    [append, approvedTools, currentUser.team, isDemo, router],
  );

  const handleUserText = useCallback(
    (text: string) => {
      if (isDemo) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setStarted(true);
      append(user(trimmed));

      if (phase === "q-problem" || phase === "q-problem-pushback") {
        const nextValidation = { ...validation, problem: trimmed };
        setValidation(nextValidation);

        if (isVagueProblem(trimmed) && !pushbackUsed) {
          setPushbackUsed(true);
          append(assistant(pmPushbackMessage(trimmed)));
          setPhase("q-problem-pushback");
          return;
        }

        append(
          assistant("Who exactly has this problem? Team, role, and roughly how many people."),
        );
        setPhase("q-who");
        return;
      }

      if (phase === "q-who") {
        setValidation((v) => ({ ...v, whoHasIt: trimmed }));
        append(assistant("How often does it happen? Daily, weekly, per launch…"));
        setPhase("q-frequency");
        return;
      }

      if (phase === "q-frequency") {
        setValidation((v) => ({ ...v, frequency: trimmed }));
        append(
          assistant(
            "What breaks if we don't solve it? Time lost, errors, blocked launches…",
          ),
        );
        setPhase("q-impact");
        return;
      }

      if (phase === "q-impact") {
        setValidation((v) => ({ ...v, expectedValue: trimmed }));
        append(
          assistant(
            "Quick stakes check — not sure counts as high stakes. Tap an answer for each:",
            { type: "risk-picker" },
          ),
        );
        setPhase("q-risk");
        return;
      }

      if (phase === "idle" || phase === "pm-done") {
        beginIntakeFromQuery(trimmed);
        return;
      }
    },
    [append, beginIntakeFromQuery, isDemo, phase, pushbackUsed, validation],
  );

  const handleQuickReply = useCallback(
    (replyId: string) => {
      if (replyId.startsWith("open-tool-")) {
        const toolId = replyId.replace("open-tool-", "");
        router.push(`/tools/${toolId}`);
        return;
      }

      if (replyId === "demo-browse") {
        return;
      }

      if (demoPlaying) return;

      if (replyId === "none-fit") {
        append(user("None of these fit"));
        setValidation((v) => ({
          ...v,
          problem: v.problem || sentence,
        }));
        append(
          assistant(
            "What's the actual problem? Not the tool you want — what's painful or slow today?",
          ),
        );
        setPhase("q-problem");
        setPushbackUsed(false);
        return;
      }

      if (replyId === "risk-done") {
        append(user("Stakes check done"));
        deliverPmOutcome();
        return;
      }

      if (replyId.startsWith("risk:")) {
        const [, key, value] = replyId.split(":");
        const prereqKey = key as keyof RequestPrerequisites;
        if (
          prereqKey === "touchesPII" ||
          prereqKey === "touchesPayments" ||
          prereqKey === "usesLLM" ||
          prereqKey === "needsExternalDep"
        ) {
          setPrerequisites((p) => ({
            ...p,
            [prereqKey]: value as RiskAnswer,
          }));
        }
        return;
      }
    },
    [append, deliverPmOutcome, demoPlaying, router, sentence],
  );

  useEffect(() => {
    if (isDemo) return;
    const q = searchParams.get("q");
    if (q && !started) {
      setStarted(true);
      append(user(q));
      beginIntakeFromQuery(q);
    }
  }, [append, beginIntakeFromQuery, isDemo, searchParams, started]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isDemo) return;
    setInput("");
    handleUserText(trimmed);
  }

  return (
    <div className="home-chat">
      <RoleBanner />

      <DemoModePicker
        mode={demoMode}
        playing={demoPlaying}
        canReplay={demoCanReplay}
        onModeChange={handleDemoModeChange}
        onSkip={skipDemoPlayback}
        onReplay={replayDemo}
      />

      <div className="home-chat__thread" ref={scrollRef}>
        {!started && !isDemo && (
          <div className="home-chat__empty">
            <p className="home-chat__intro t-para-md">
              Find a tool in the catalogue, or describe what you want to build —
              I&apos;ll pressure-test the idea, scope the smallest version, and
              point you at the right build path.
            </p>
            <div className="home-chat__starters">
              {STARTER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="home-chat__chip t-para-rg"
                  onClick={() => handleStarter(chip.id)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <ul className="home-chat__messages" aria-live="polite">
          {messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              message={message}
              phase={phase === "q-risk" ? "q-risk" : undefined}
              prerequisites={prerequisites}
              interactive={!demoPlaying}
              onQuickReply={handleQuickReply}
            />
          ))}
        </ul>
      </div>

      <form className="home-chat__composer" onSubmit={handleSubmit}>
        <div
          className={`home-chat__input-wrap${isDemo ? " home-chat__input-wrap--disabled" : ""}`}
        >
          <Icon name="spark" size={20} className="home-chat__input-icon" />
          <input
            type="text"
            className="home-chat__input t-para-md"
            placeholder={
              isDemo
                ? "Select Live mode to type your own message…"
                : phase === "q-problem" || phase === "q-problem-pushback"
                  ? "Describe the problem…"
                  : phase === "q-who"
                    ? "Who's affected…"
                    : phase === "q-frequency"
                      ? "How often…"
                      : phase === "q-impact"
                        ? "Impact if unsolved…"
                        : "Message…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isDemo}
            aria-label="Message"
          />
          <Button type="submit" size="sm" disabled={!input.trim() || isDemo}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
