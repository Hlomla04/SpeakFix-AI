"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import {
  Keyboard,
  RotateCcw,
  SendHorizontal,
  Volume2,
  VolumeX,
  Sparkles,
  TicketCheck,
  LayoutDashboard,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useSpeech } from "@/hooks/use-speech";
import { buildGreeting, type AwaitingVerificationTicket } from "@/lib/agent-prompt";
import { MicButton } from "./mic-button";
import { ChatPanel } from "./chat-panel";
import { TicketDraftPanel } from "./ticket-draft-panel";
import {
  EMPTY_TICKET_FIELDS,
  type AgentPhase,
  type AgentResponse,
  type ChatMessage,
  type SimilarIncidents,
  type TicketFields,
  type TicketRecord,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "The projector in Room 204 keeps switching off, and we have a lecture there tomorrow.",
  "There's a water leak under the sink in the second floor kitchen.",
  "The air conditioner in Building B is leaking again.",
];

interface VoiceAgentViewProps {
  onTicketCreated: () => void;
  onGoToDashboard: () => void;
  userName?: string;
}

export function VoiceAgentView({ onTicketCreated, onGoToDashboard, userName }: VoiceAgentViewProps) {
  const { toast } = useToast();
  const speech = useSpeech();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [fields, setFields] = useState<TicketFields>({ ...EMPTY_TICKET_FIELDS });
  const [missing, setMissing] = useState<string[]>([]);
  const [phase, setPhase] = useState<AgentPhase>("greeting");
  const [isAgentThinking, setIsAgentThinking] = useState(false);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<TicketRecord | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [showText, setShowText] = useState(false);
  // Verified-resolution loop: this user's tickets waiting on their confirmation
  const [awaiting, setAwaiting] = useState<AwaitingVerificationTicket[]>([]);
  const [similar, setSimilar] = useState<SimilarIncidents | null>(null);

  // Refs to avoid stale closures in async flows
  const fieldsRef = useRef(fields);
  const phaseRef = useRef(phase);
  const messagesRef = useRef(messages);
  const handsFreeRef = useRef(false);
  const [handsFree, setHandsFree] = useState(false);
  const awaitingAutoListen = useRef(false);
  const creatingTicketRef = useRef(false);
  const thinkingRef = useRef(false);
  const voiceRef = useRef<ReturnType<typeof useVoiceInput> | null>(null);

  useEffect(() => {
    fieldsRef.current = fields;
    phaseRef.current = phase;
    messagesRef.current = messages;
    handsFreeRef.current = handsFree;
  }, [fields, phase, messages, handsFree]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  /* ---------------------- awaiting-verification tickets ---------------------- */

  const loadAwaiting = useCallback(async () => {
    try {
      const res = await fetch("/api/tickets?scope=mine&status=AWAITING_VERIFICATION", { cache: "no-store" });
      const data = (await res.json()) as { tickets?: TicketRecord[]; error?: string };
      if (!res.ok) return; // silent — the conversation works without it
      setAwaiting(
        (data.tickets ?? []).map((t) => ({
          id: t.id,
          ticketNumber: t.ticketNumber,
          title: t.title,
          location: t.location,
          technicianAction: t.technicianAction,
          testResult: t.testResult,
        }))
      );
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    void loadAwaiting();
  }, [loadAwaiting]);

  /* ------------------------- Ticket creation ------------------------ */

  const createTicket = useCallback(
    async (finalFields: TicketFields, transcript: string) => {
      if (creatingTicketRef.current) return;
      creatingTicketRef.current = true;
      try {
        const res = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...finalFields, transcript, source: "voice" }),
        });
        const data = (await res.json()) as {
          ticket?: TicketRecord;
          similarIncidents?: SimilarIncidents;
          error?: string;
        };
        if (!res.ok || !data.ticket) {
          throw new Error(data.error || "Failed to create ticket");
        }
        setCreatedTicket(data.ticket);
        setSimilar(data.similarIncidents ?? null);
        setPhase("done");
        phaseRef.current = "done";
        const confirmMsg: ChatMessage = {
          role: "agent",
          content: `Done. Ticket ${data.ticket.ticketNumber} is in. The maintenance team has been notified.`,
          timestamp: Date.now(),
        };
        appendMessage(confirmMsg);
        let spoken = `Ticket ${data.ticket.ticketNumber.split("-").join(" ")} has been created and sent to the maintenance team.`;

        // Real ticket history: mention similar past incidents at this location
        const sim = data.similarIncidents;
        if (sim && sim.count > 0) {
          const patternMsg: ChatMessage = {
            role: "agent",
            content:
              sim.count === 1
                ? `One more thing. I found a similar past report for this location. I've flagged it on the ticket so the team can see the history.`
                : `One more thing. I found ${sim.count} similar past reports for this location. I've flagged this as possibly recurring so the team can check for an underlying fault.`,
            timestamp: Date.now(),
          };
          appendMessage(patternMsg);
          spoken +=
            sim.count === 1
              ? " I found one similar past report for this location and flagged it for the team."
              : ` I found ${sim.count} similar past reports for this location, so I've flagged this as possibly recurring.`;
        }

        speech.speak(spoken);
        onTicketCreated();
        toast({
          title: "Ticket created",
          description: `${data.ticket.ticketNumber} · ${data.ticket.title}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create ticket";
        toast({ title: "Could not create ticket", description: message, variant: "destructive" });
        setPhase("gathering");
        phaseRef.current = "gathering";
      } finally {
        creatingTicketRef.current = false;
      }
    },
    [appendMessage, onTicketCreated, speech, toast]
  );

  /* --------------------- verified-resolution actions -------------------- */

  const executeAction = useCallback(
    async (action: NonNullable<AgentResponse["action"]>) => {
      try {
        const res = await fetch(`/api/tickets/${action.ticketId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: action.type === "CONFIRM_RESOLUTION" ? "reporter_confirm" : "reporter_reopen",
            response: action.response,
          }),
        });
        const data = (await res.json()) as { ticket?: TicketRecord; error?: string };
        if (!res.ok || !data.ticket) throw new Error(data.error || "Action failed");
        const number = data.ticket.ticketNumber.split("-").join(" ");
        const msg: ChatMessage =
          action.type === "CONFIRM_RESOLUTION"
            ? {
                role: "agent",
                content: `Great. I've confirmed the resolution and closed ${data.ticket.ticketNumber}. Thanks for checking.`,
                timestamp: Date.now(),
              }
            : {
                role: "agent",
                content: `I understand. I've reopened ${data.ticket.ticketNumber} and notified the maintenance team. They'll take another look.`,
                timestamp: Date.now(),
              };
        appendMessage(msg);
        speech.speak(
          action.type === "CONFIRM_RESOLUTION"
            ? `Great. I've confirmed the resolution and closed ticket ${number}.`
            : `I understand. I've reopened ticket ${number} and notified the maintenance team.`
        );
        toast({
          title: action.type === "CONFIRM_RESOLUTION" ? "Repair confirmed" : "Ticket reopened",
          description: `${data.ticket.ticketNumber} · ${data.ticket.status.replaceAll("_", " ").toLowerCase()}`,
        });
        onTicketCreated(); // refresh dashboards
        void loadAwaiting(); // refresh the pending list
      } catch (err) {
        const message = err instanceof Error ? err.message : "Action failed";
        appendMessage({
          role: "agent",
          content: "Sorry, I couldn't update that ticket just now. Please try again.",
          timestamp: Date.now(),
        });
        toast({ title: "Could not update ticket", description: message, variant: "destructive" });
      }
    },
    [appendMessage, loadAwaiting, onTicketCreated, speech, toast]
  );

  /* --------------------------- Agent call --------------------------- */

  const sendToAgent = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isAgentThinking) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: Date.now() };
      const nextMessages = [...messagesRef.current, userMsg];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
      setIsAgentThinking(true);
      thinkingRef.current = true;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map(({ role, content }) => ({ role, content })),
            currentFields: fieldsRef.current,
            phase: phaseRef.current === "greeting" ? "gathering" : phaseRef.current,
          }),
        });
        const data = (await res.json()) as AgentResponse & { error?: string };
        if (!res.ok) throw new Error(data.error || "Agent failed");

        const agentMsg: ChatMessage = {
          role: "agent",
          content: data.reply,
          timestamp: Date.now(),
        };
        const withAgent = [...nextMessages, agentMsg];
        messagesRef.current = withAgent;
        setMessages(withAgent);
        setFields(data.fields);
        fieldsRef.current = data.fields;
        setMissing(data.missing);
        setPhase(data.phase);
        phaseRef.current = data.phase;

        // Speak the reply; schedule auto-listen for hands-free mode
        if (handsFreeRef.current && data.phase !== "done" && !data.userConfirmed && !data.action) {
          if (speech.enabled) {
            awaitingAutoListen.current = true;
          } else {
            setTimeout(() => {
              if (
                handsFreeRef.current &&
                phaseRef.current !== "done" &&
                !voiceRef.current?.isListening &&
                !thinkingRef.current
              ) {
                voiceRef.current?.start();
              }
            }, 1200);
          }
        }
        speech.speak(data.reply);

        // Verified-resolution action from the conversation (confirm / reopen by voice)
        if (data.action) {
          await executeAction(data.action);
          // The verification exchange must never become a new ticket draft —
          // reset the draft so the next report starts clean.
          setFields({ ...EMPTY_TICKET_FIELDS });
          fieldsRef.current = { ...EMPTY_TICKET_FIELDS };
          setMissing([]);
          setPhase("gathering");
          phaseRef.current = "gathering";
          return;
        }

        // If the user confirmed, create the ticket
        if (data.userConfirmed) {
          setIsCreatingTicket(true);
          try {
            await createTicket(data.fields, withAgent.map((m) => `${m.role === "agent" ? "Agent" : "User"}: ${m.content}`).join("\n"));
          } finally {
            setIsCreatingTicket(false);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        appendMessage({
          role: "agent",
          content: "Sorry, I hit a technical hiccup. Please try that again.",
          timestamp: Date.now(),
        });
        toast({ title: "Agent error", description: message, variant: "destructive" });
      } finally {
        setIsAgentThinking(false);
        thinkingRef.current = false;
      }
    },
    [appendMessage, createTicket, isAgentThinking, speech, toast]
  );

  /* ---------------------------- Voice input ------------------------- */

  const handleVoiceResult = useCallback(
    (text: string) => {
      void sendToAgent(text);
    },
    [sendToAgent]
  );

  const voice = useVoiceInput({
    onFinalResult: handleVoiceResult,
    onError: (message) => toast({ title: "Microphone error", description: message, variant: "destructive" }),
  });

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  const toggleMic = useCallback(() => {
    // Barge-in: starting the mic interrupts the agent's speech
    if (speech.speaking) speech.cancel();
    awaitingAutoListen.current = false;
    if (voice.isListening) {
      voice.stop();
    } else {
      voice.start();
    }
  }, [speech, voice]);

  /* ------------------- Hands-free auto-listen loop ------------------ */

  useEffect(() => {
    if (!speech.speaking && awaitingAutoListen.current && voiceRef.current) {
      awaitingAutoListen.current = false;
      const timer = setTimeout(() => {
        if (
          handsFreeRef.current &&
          phaseRef.current !== "done" &&
          !voiceRef.current?.isListening &&
          !thinkingRef.current
        ) {
          voiceRef.current?.start();
        }
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [speech.speaking]);

  /* ------------------------------ Reset ----------------------------- */

  const resetConversation = useCallback(() => {
    speech.cancel();
    voice.stop();
    awaitingAutoListen.current = false;
    setMessages([]);
    setFields({ ...EMPTY_TICKET_FIELDS });
    setMissing([]);
    setPhase("greeting");
    phaseRef.current = "greeting";
    messagesRef.current = [];
    fieldsRef.current = { ...EMPTY_TICKET_FIELDS };
    setCreatedTicket(null);
    setSimilar(null);
    setTextDraft("");
    const greetingMsg: ChatMessage = { role: "agent", content: buildGreeting(userName), timestamp: Date.now() };
    messagesRef.current = [greetingMsg];
    setMessages([greetingMsg]);
  }, [speech, voice, userName]);

  // Initial greeting — refreshed with verification context once tickets load
  useEffect(() => {
    const greetingMsg: ChatMessage = {
      role: "agent",
      content: buildGreeting(userName, awaiting),
      timestamp: Date.now(),
    };
    // If the user hasn't spoken yet, we can (re)set the greeting with verification context
    if (messagesRef.current.length <= 1 && !messagesRef.current.some((m) => m.role === "user")) {
      messagesRef.current = [greetingMsg];
      setMessages([greetingMsg]);
    }
     
  }, [userName, awaiting]);

  /* ---------------------------- Text input -------------------------- */

  const submitText = useCallback(() => {
    const text = textDraft.trim();
    if (!text) return;
    setTextDraft("");
    void sendToAgent(text);
  }, [sendToAgent, textDraft]);

  /* ------------------------------ Status ---------------------------- */

  const statusLabel = createdTicket
    ? "Ticket created. Report another issue anytime"
    : isCreatingTicket
      ? "Creating your ticket…"
      : voice.isListening
        ? "Listening. Speak now (tap to stop)"
        : voice.isTranscribing
          ? "Transcribing your recording…"
          : isAgentThinking
            ? "Iris is thinking…"
            : speech.speaking
              ? "Iris is speaking. Tap the mic to interrupt"
              : messages.length <= 1
                ? "Ready. Tap the mic and describe the problem"
                : "Your turn. Tap the mic to speak";

  const micDisabled = isAgentThinking || isCreatingTicket || voice.isTranscribing || Boolean(createdTicket);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_370px] lg:items-stretch">
      {/* ------------------------- Conversation card ------------------------- */}
      <div className="glass-card flex flex-col overflow-hidden min-h-[520px] lg:min-h-[600px]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/5 px-4 py-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-full border border-primary/40 bg-primary/15 shadow-[0_0_0_3px_primary/10]"
              aria-hidden
            >
              <Image
                src="/hero-character.png"
                alt=""
                fill
                sizes="36px"
                className="object-cover"
                style={{ objectPosition: "50% 9%" }}
              />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold leading-tight">
                Iris <span className="font-normal text-muted-foreground">· SpeakFix assistant</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">{statusLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant={speech.enabled ? "secondary" : "ghost"}
              onClick={() => {
                const next = !speech.enabled;
                speech.setEnabled(next);
                if (!next) speech.cancel();
              }}
              aria-pressed={speech.enabled}
              title={speech.enabled ? "Voice replies on" : "Voice replies muted"}
              className={cn("h-8 gap-1.5", speech.enabled && "text-primary")}
            >
              {speech.enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span className="hidden sm:inline">{speech.enabled ? "Voice on" : "Muted"}</span>
            </Button>
            <Button
              size="sm"
              variant={handsFree ? "secondary" : "ghost"}
              onClick={() => setHandsFree((v) => !v)}
              aria-pressed={handsFree}
              title="Automatically listen after each agent reply"
              className={cn("h-8 gap-1.5", handsFree && "text-primary")}
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Hands-free</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetConversation}
              title="Start a new report"
              className="h-8 gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>
        </div>

        {/* Body: success ticket or chat */}
        {createdTicket ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6 custom-scrollbar">
            {/* The filed ticket — a physical stub with punched notches + stamp */}
            <div className="relative w-full max-w-md animate-in fade-in zoom-in-95 duration-500" role="status">
              {/* Gradient dots revealed through the punched notches */}
              <span aria-hidden className="absolute -left-2.5 bottom-[46px] h-5 w-5 rounded-full bg-brand-gradient shadow-md shadow-primary/30" />
              <span aria-hidden className="absolute -right-2.5 bottom-[46px] h-5 w-5 rounded-full bg-brand-gradient shadow-md shadow-primary/30" />
            <div
              className="ticket-stub overflow-hidden"
              style={{ "--notch-y": "calc(100% - 3.5rem)" } as CSSProperties}
            >
              <div className="h-1.5 w-full bg-brand-gradient" aria-hidden />
              <div className="relative px-6 pt-6 pb-4 text-center">
                <span className="stamp absolute right-4 top-4 text-[11px] text-primary">
                  Filed
                </span>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gradient text-white shadow-lg shadow-primary/35">
                  <TicketCheck className="h-7 w-7" aria-hidden />
                </div>
                <h3 className="mt-3 font-display text-2xl font-bold tracking-tight">
                  <span className="text-gradient">{createdTicket.ticketNumber}</span>
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {createdTicket.title} · reported by {createdTicket.requesterName}
                </p>
              </div>
              <div className="perforation mx-4" aria-hidden />
              <div className="grid grid-cols-2 gap-2 px-6 py-4 text-left">
                <div className="rounded-xl border border-dashed px-3 py-2">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Location</p>
                  <p className="text-sm font-semibold truncate">{createdTicket.location}</p>
                </div>
                <div className="rounded-xl border border-dashed px-3 py-2">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Category</p>
                  <p className="text-sm font-semibold truncate">{createdTicket.category}</p>
                </div>
                <div className="rounded-xl border border-dashed px-3 py-2">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Priority</p>
                  <p className="text-sm font-semibold">{createdTicket.priority}</p>
                </div>
                <div className="rounded-xl border border-dashed px-3 py-2">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold">{createdTicket.status.replaceAll("_", " ")}</p>
                </div>
              </div>
              <footer className="flex h-14 shrink-0 items-center justify-between gap-4 border-t-2 border-dashed border-foreground/20 px-6">
                <div className="barcode w-24 text-foreground" aria-hidden />
                <p className="font-mono text-[10px] font-semibold tracking-[0.28em] text-muted-foreground">
                  CREATED
                </p>
              </footer>
            </div>
            </div>

            {/* Real ticket history: similar past incidents at this location */}
            {similar && similar.count > 0 && (
              <p className="max-w-md rounded-lg border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" role="status">
                <span className="font-semibold">Recurring pattern flagged. </span>
                {similar.note} The maintenance team can see this on the ticket.
              </p>
            )}

            <div className="flex flex-wrap justify-center gap-2.5">
              <Button onClick={onGoToDashboard} className="btn-brand gap-2">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                View in Dashboard
              </Button>
              <Button variant="outline" onClick={resetConversation} className="gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden />
                Report another issue
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ChatPanel
              messages={messages}
              interimTranscript={voice.interimTranscript}
              isAgentSpeaking={speech.speaking}
              isAgentThinking={isAgentThinking}
            />

            {/* Example chips */}
            {messages.length <= 1 && !voice.isListening && (
              <div className="flex flex-wrap gap-2 px-4 pb-3">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => void sendToAgent(example)}
                    className="group flex items-start gap-1.5 rounded-full border bg-card/60 backdrop-blur-sm px-3 py-1.5 text-left text-xs text-muted-foreground transition-all hover:border-primary/50 hover:text-foreground hover:shadow-md hover:shadow-primary/10 cursor-pointer"
                  >
                    <Sparkles className="mt-0.5 h-3 w-3 text-primary shrink-0" aria-hidden />
                    <span className="line-clamp-1 max-w-[240px] sm:max-w-xs">{example}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Mic zone */}
            <div className="border-t border-foreground/5 px-4 py-4">
              <div className="flex flex-col items-center gap-3">
                <MicButton
                  isListening={voice.isListening}
                  isProcessing={isAgentThinking}
                  isTranscribing={voice.isTranscribing}
                  disabled={micDisabled}
                  onToggle={toggleMic}
                  label={statusLabel}
                />
                {voice.speechApiSupported ? (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Live transcription powered by your browser&apos;s speech engine
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Browser doesn&apos;t support live transcription. Audio is transcribed by the
                    SpeakFix cloud engine
                  </p>
                )}
              </div>

              {/* Text fallback */}
              <div className="mt-3">
                {showText ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitText();
                    }}
                  >
                    <Input
                      value={textDraft}
                      onChange={(e) => setTextDraft(e.target.value)}
                      placeholder="Type your message instead…"
                      aria-label="Type your message"
                      disabled={isAgentThinking}
                      autoFocus
                    />
                    <Button type="submit" size="icon" disabled={!textDraft.trim() || isAgentThinking} aria-label="Send message" className="btn-brand">
                      <SendHorizontal className="h-4 w-4" />
                    </Button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowText(true)}
                    className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <Keyboard className="h-3.5 w-3.5" aria-hidden />
                    Prefer typing? Switch to text input
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ------------------------- Ticket draft stub ------------------------- */}
      <div className="relative min-h-[420px] lg:min-h-0">
        {/* Gradient dots revealed through the punched notches */}
        <span aria-hidden className="absolute -left-2.5 bottom-[46px] z-0 h-5 w-5 rounded-full bg-brand-gradient shadow-md shadow-primary/30" />
        <span aria-hidden className="absolute -right-2.5 bottom-[46px] z-0 h-5 w-5 rounded-full bg-brand-gradient shadow-md shadow-primary/30" />
        <div
          className="ticket-stub flex h-full flex-col overflow-hidden"
          style={{ "--notch-y": "calc(100% - 3.5rem)" } as CSSProperties}
        >
          <TicketDraftPanel fields={fields} missing={missing} phase={phase} />
        </div>
      </div>
    </div>
  );
}
