import { NextRequest, NextResponse } from "next/server";
import { nvidiaChatCompletion } from "@/lib/nvidia-llm";
import {
  buildAgentSystemPrompt,
  buildResolveSystemPrompt,
  parseAgentJson,
  type AwaitingVerificationTicket,
} from "@/lib/agent-prompt";
import { getUserFromRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  EMPTY_RESOLUTION_FIELDS,
  EMPTY_TICKET_FIELDS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type AgentAction,
  type AgentPhase,
  type AgentResponse,
  type ResolutionFields,
  type TicketFields,
} from "@/lib/types";

export const maxDuration = 120;

interface AgentRequestBody {
  mode?: "report" | "resolve";
  messages: { role: "user" | "agent"; content: string }[];
  currentFields?: Partial<TicketFields>;
  phase?: AgentPhase;
  // resolve mode only
  ticketId?: string;
  currentResolution?: Partial<ResolutionFields>;
}

function sanitizeFields(raw: Partial<TicketFields> | undefined): TicketFields {
  const f = { ...EMPTY_TICKET_FIELDS, ...(raw || {}) };
  const clean = (v: unknown): string =>
    typeof v === "string" ? v.trim().slice(0, 2000) : "";

  const category = clean(f.category);
  let priority = clean(f.priority).toUpperCase();
  if (priority === "URGENT") priority = "CRITICAL"; // legacy value

  return {
    title: clean(f.title),
    description: clean(f.description),
    category: (TICKET_CATEGORIES as readonly string[]).includes(category)
      ? category
      : category
        ? "Other"
        : "",
    priority: (TICKET_PRIORITIES as readonly string[]).includes(priority)
      ? priority
      : priority
        ? "MEDIUM"
        : "",
    location: clean(f.location),
    requesterName: clean(f.requesterName),
    contactInfo: clean(f.contactInfo),
    urgencyReason: clean(f.urgencyReason),
  };
}

function sanitizeResolution(raw: Partial<ResolutionFields> | undefined): ResolutionFields {
  const f = { ...EMPTY_RESOLUTION_FIELDS, ...(raw || {}) };
  const clean = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 2000) : "");
  return {
    technicianAction: clean(f.technicianAction),
    resolutionNotes: clean(f.resolutionNotes),
    testResult: clean(f.testResult),
  };
}

/** Validate an agent-returned verification action against real user data. */
async function validateAction(
  user: { id: string },
  raw: unknown
): Promise<AgentAction | null> {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: string; ticketId?: string; response?: string };
  if (
    (a.type !== "CONFIRM_RESOLUTION" && a.type !== "REOPEN_TICKET") ||
    typeof a.ticketId !== "string"
  ) {
    return null;
  }
  type TicketRow = Awaited<ReturnType<typeof db.ticket.findUnique>>;
  let ticket: TicketRow = null;
  // LLMs sometimes echo the SF-number instead of the id — resolve both forms
  if (/^SF-/i.test(a.ticketId)) {
    ticket = await db.ticket.findUnique({ where: { ticketNumber: a.ticketId.toUpperCase() } });
  } else {
    ticket = await db.ticket.findUnique({ where: { id: a.ticketId } });
  }
  // Only the reporter may confirm or reopen their own ticket, and only while
  // it is genuinely awaiting their verification.
  if (!ticket || ticket.userId !== user.id || ticket.status !== "AWAITING_VERIFICATION") {
    return null;
  }
  return {
    type: a.type,
    ticketId: ticket.id,
    response: typeof a.response === "string" ? a.response.trim().slice(0, 500) : "",
  };
}

/**
 * Deterministic safety net for the single-pending-ticket case: if the LLM
 * forgot the structured action but the user's message is a clear, short
 * verification answer that references the pending ticket, synthesize the
 * action ourselves. Never fires for messages that look like new reports.
 */
function deterministicAction(
  awaiting: AwaitingVerificationTicket[],
  userMessage: string
): AgentAction | null {
  if (awaiting.length !== 1) return null;
  const t = awaiting[0];
  const msg = userMessage.toLowerCase();
  if (msg.length > 200) return null;

  const words = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !["the", "and", "has", "was", "its", "it's", "not"].includes(w))
    );
  const pendingWords = words(`${t.title} ${t.location}`);
  const msgWords = words(userMessage);
  let overlap = 0;
  for (const w of msgWords) if (pendingWords.has(w)) overlap++;
  if (overlap === 0) return null; // talks about something else → new report

  const negative =
    /\bno\b|\bnope\b|\bstill\b|not (working|fixed|resolved|right)|isn'?t|broken|leaking|switching (off|out)|cutting out|happening/;
  const positive =
    /\byes\b|\byeah\b|\byep\b|\byup\b|working (now|fine|great|perfectly|normally)|all good|sorted|it'?s fixed|fixed now|confirmed/;
  const strongPositive = /working (now|fine|great|perfectly|normally)|it'?s fixed|fixed now|all good|sorted/;

  if (positive.test(msg) && strongPositive.test(msg)) {
    return { type: "CONFIRM_RESOLUTION", ticketId: t.id, response: userMessage.slice(0, 300) };
  }
  if (negative.test(msg)) {
    return { type: "REOPEN_TICKET", ticketId: t.id, response: userMessage.slice(0, 300) };
  }
  if (positive.test(msg) && /^(yes|yeah|yep|yup)\b/.test(msg.trim())) {
    return { type: "CONFIRM_RESOLUTION", ticketId: t.id, response: userMessage.slice(0, 300) };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json(
        { error: "Please log in to use the voice agent." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as AgentRequestBody;
    const history = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
    if (history.length === 0 || !history.some((m) => m.role === "user")) {
      return NextResponse.json(
        { error: "messages array with at least one user message is required" },
        { status: 400 }
      );
    }

    /**
     * Wrapper around the NVIDIA-hosted z-ai/glm-5.3-flash model.
     *
     * The previous code used z-ai-web-dev-sdk which accepted the system prompt
     * as a `role: "assistant"` first message. The OpenAI-compatible NVIDIA API
     * expects `role: "system"` for the system prompt — we coerce here so the
     * call-site stays clean.
     */
    const callAgent = async (
      msgs: { role: "assistant" | "user"; content: string }[]
    ): Promise<string> => {
      // The first message is always the system prompt (passed as role: "assistant"
      // by the existing code). Promote it to role: "system" for NVIDIA's API.
      const normalized = msgs.map((m, i) =>
        i === 0 && m.role === "assistant"
          ? { role: "system" as const, content: m.content }
          : { role: m.role, content: m.content }
      );
      return nvidiaChatCompletion(
        normalized as { role: "system" | "user" | "assistant"; content: string }[]
      );
    };

    /* ------------------------------ RESOLVE MODE ------------------------------ */
    if (body.mode === "resolve") {
      // Only technicians (assigned) or admins may document work on a ticket
      if (user.role !== "TECHNICIAN" && user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only maintenance staff can document resolutions." },
          { status: 403 }
        );
      }
      const ticket = body.ticketId
        ? await db.ticket.findUnique({ where: { id: body.ticketId } })
        : null;
      if (!ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }
      if (user.role === "TECHNICIAN" && ticket.assignedTechnicianId !== user.id) {
        return NextResponse.json(
          { error: "You can only document work on tickets assigned to you." },
          { status: 403 }
        );
      }

      const current = sanitizeResolution(body.currentResolution);
      const llmMessages: { role: "assistant" | "user"; content: string }[] = [
        {
          role: "assistant",
          content: buildResolveSystemPrompt(
            {
              ticketNumber: ticket.ticketNumber,
              title: ticket.title,
              description: ticket.description,
              location: ticket.location,
            },
            current
          ),
        },
      ];
      for (const m of history.slice(0, -1)) {
        if (!m.content?.trim()) continue;
        llmMessages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content.slice(0, 2000) });
      }
      llmMessages.push({ role: "user", content: history[history.length - 1].content.slice(0, 2000) });

      let parsed = parseAgentJson(await callAgent(llmMessages));
      if (!parsed || typeof parsed.reply !== "string") {
        parsed = parseAgentJson(
          await callAgent([
            ...llmMessages,
            {
              role: "assistant",
              content:
                'REMINDER: respond with a single valid JSON object only: {"reply": string, "resolution": {"technicianAction": "", "resolutionNotes": "", "testResult": ""}, "ready": boolean}',
            },
          ])
        );
      }

      const resolution = sanitizeResolution({
        ...current,
        ...((parsed?.resolution as Partial<ResolutionFields>) || {}),
      });
      const ready =
        Boolean(parsed?.ready) &&
        resolution.technicianAction.length > 0 &&
        (resolution.testResult.length > 0 || resolution.resolutionNotes.length > 0);

      return NextResponse.json({
        reply:
          typeof parsed?.reply === "string" && parsed.reply.trim()
            ? parsed.reply.trim().slice(0, 400)
            : "Sorry, I didn't catch that. Could you describe the work again?",
        resolution,
        ready,
      } satisfies { reply: string; resolution: ResolutionFields; ready: boolean });
    }

    /* ------------------------------ REPORT MODE ------------------------------ */
    const currentFields = sanitizeFields(body.currentFields);
    const phase: AgentPhase =
      body.phase === "gathering" || body.phase === "confirming" || body.phase === "done"
        ? body.phase
        : "gathering";

    // Real data: this user's tickets waiting on their confirmation
    const awaitingRows = await db.ticket.findMany({
      where: { userId: user.id, status: "AWAITING_VERIFICATION" },
      orderBy: { resolutionSubmittedAt: "asc" },
      take: 5,
    });
    const awaiting: AwaitingVerificationTicket[] = awaitingRows.map((t) => ({
      id: t.id,
      ticketNumber: t.ticketNumber,
      title: t.title,
      location: t.location,
      technicianAction: t.technicianAction,
      testResult: t.testResult,
    }));

    const llmMessages: { role: "assistant" | "user"; content: string }[] = [
      {
        role: "assistant",
        content: buildAgentSystemPrompt(currentFields, phase, { name: user.name, email: user.email }, awaiting),
      },
    ];
    for (const m of history.slice(0, -1)) {
      if (!m.content?.trim()) continue;
      llmMessages.push({ role: m.role === "user" ? "user" : "assistant", content: m.content.slice(0, 2000) });
    }
    llmMessages.push({ role: "user", content: history[history.length - 1].content.slice(0, 2000) });

    let raw = await callAgent(llmMessages);
    let parsed = parseAgentJson(raw);

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      console.error("[/api/agent] unparseable LLM response, retrying");
      raw = await callAgent([
        ...llmMessages,
        {
          role: "assistant",
          content:
            'REMINDER: respond NOW with a single valid JSON object only. No prose, no fences. Schema: {"reply": string, "fields": {...}, "missing": [...], "phase": "gathering"|"confirming"|"done", "userConfirmed": boolean, "userWantsChanges": boolean, "action": null}',
        },
      ]);
      parsed = parseAgentJson(raw);
    }

    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      const plain = raw.replace(/```[\s\S]*?```/g, "").trim();
      if (plain && !plain.startsWith("{")) {
        const response: AgentResponse = {
          reply: plain.slice(0, 400),
          fields: currentFields,
          missing: [],
          phase,
          userConfirmed: false,
          userWantsChanges: true,
          action: null,
        };
        return NextResponse.json(response);
      }
      const fallback: AgentResponse = {
        reply:
          "Sorry, I didn't quite catch that. Could you describe the issue again, including where it is?",
        fields: currentFields,
        missing: ["description", "location"].filter(
          (k) => !currentFields[k as keyof TicketFields]
        ),
        phase: "gathering",
        userConfirmed: false,
        userWantsChanges: false,
        action: null,
      };
      return NextResponse.json(fallback);
    }

    // Merge: keep known values, overwrite with any non-empty incoming values
    const finalFields: TicketFields = { ...currentFields };
    const incoming = (parsed.fields || {}) as Partial<TicketFields>;
    for (const key of Object.keys(EMPTY_TICKET_FIELDS) as (keyof TicketFields)[]) {
      const value = incoming[key];
      if (typeof value === "string" && value.trim()) {
        finalFields[key] = value.trim().slice(0, 2000);
      }
    }

    const action =
      (await validateAction(user, parsed.action)) ??
      deterministicAction(awaiting, history[history.length - 1].content);

    const response: AgentResponse = {
      reply: parsed.reply.toString().trim().slice(0, 800),
      fields: sanitizeFields(finalFields),
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).slice(0, 8) : [],
      phase:
        parsed.phase === "confirming" || parsed.phase === "done" ? parsed.phase : "gathering",
      userConfirmed: Boolean(parsed.userConfirmed) && action === null,
      userWantsChanges: Boolean(parsed.userWantsChanges),
      action,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/agent] error:", err);
    return NextResponse.json(
      { error: "We couldn't reach SpeakFix right now. Please try again." },
      { status: 500 }
    );
  }
}
