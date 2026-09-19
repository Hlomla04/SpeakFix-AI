import { db } from "@/lib/db";
import type {
  AuditEntryRecord,
  EvidenceEntry,
  RecurringIssue,
  SimilarIncidents,
  TicketRecord,
  VerificationChecklist,
} from "@/lib/types";

 

type TicketWithTech = any; // Prisma Ticket payload (kept loose for serialize flexibility)

/**
 * Serialize a Prisma ticket (optionally with assignedTechnician included)
 * into the shape the client expects.
 */
export function serializeTicket(ticket: TicketWithTech): TicketRecord {
  let evidence: EvidenceEntry[] | null = null;
  if (ticket.evidence) {
    try {
      const parsed = JSON.parse(ticket.evidence);
      evidence = Array.isArray(parsed) ? parsed : null;
    } catch {
      evidence = null;
    }
  }
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    location: ticket.location,
    requesterName: ticket.requesterName,
    contactInfo: ticket.contactInfo ?? null,
    urgencyReason: ticket.urgencyReason ?? null,
    source: ticket.source,
    transcript: ticket.transcript,
    userId: ticket.userId ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    assignedTechnicianId: ticket.assignedTechnicianId ?? null,
    assignedTechnicianName: ticket.assignedTechnician?.name ?? null,
    technicianAction: ticket.technicianAction ?? null,
    resolutionNotes: ticket.resolutionNotes ?? null,
    testResult: ticket.testResult ?? null,
    evidence,
    resolutionSubmittedAt: ticket.resolutionSubmittedAt?.toISOString() ?? null,
    resolutionCheckNote: ticket.resolutionCheckNote ?? null,
    reporterConfirmedAt: ticket.reporterConfirmedAt?.toISOString() ?? null,
    reporterResponse: ticket.reporterResponse ?? null,
    reopenCount: ticket.reopenCount ?? 0,
    similarIncidentCount: ticket.similarIncidentCount ?? null,
    similarIncidentNote: ticket.similarIncidentNote ?? null,
  };
}

/** Append an immutable audit entry to a ticket's timeline. */
export async function recordAudit(params: {
  ticketId: string;
  actorId: string | null;
  actorName: string;
  actorRole: "REPORTER" | "TECHNICIAN" | "ADMIN" | "SYSTEM";
  action: string;
  detail?: string | null;
}) {
  await db.auditEntry.create({
    data: {
      ticketId: params.ticketId,
      actorId: params.actorId,
      actorName: params.actorName,
      actorRole: params.actorRole,
      action: params.action,
      detail: params.detail ?? null,
    },
  });
}

/** Serialize audit entries for a ticket (oldest first for the timeline). */
export function serializeAudit(entries: any[]): AuditEntryRecord[] {
  return entries
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      actorRole: e.actorRole,
      detail: e.detail ?? null,
      createdAt: e.createdAt.toISOString(),
    }));
}

/** Evidence-Based Resolution Verification checklist — real fields only, no invented scores. */
export function computeVerification(ticket: TicketWithTech): VerificationChecklist {
  let evidence: EvidenceEntry[] = [];
  if (ticket.evidence) {
    try {
      const parsed = JSON.parse(ticket.evidence);
      if (Array.isArray(parsed)) evidence = parsed;
    } catch {
      /* ignore malformed */
    }
  }
  return {
    actionRecorded: Boolean(ticket.technicianAction?.trim()),
    notesSubmitted: Boolean(ticket.resolutionNotes?.trim()),
    evidenceSubmitted: evidence.length > 0,
    testPerformed: Boolean(ticket.testResult?.trim()),
    reporterConfirmed: Boolean(ticket.reporterConfirmedAt),
  };
}

/* ------------------------- similar & recurring incidents ------------------------- */

const STOPWORDS = new Set([
  "the", "and", "in", "of", "at", "on", "to", "a", "an", "is", "it", "near",
  "by", "with", "for", "room", "area", "level",
]);

/** Extract significant location tokens (numbers, building letters, names). */
function locationTokens(location: string): Set<string> {
  return new Set(
    location
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
  );
}

/** Token similarity between two location strings (0..1). */
function locationSimilarity(a: string, b: string): number {
  const ta = locationTokens(a);
  const tb = locationTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : shared / union;
}

/**
 * Find similar past incidents for a newly reported issue — REAL ticket history only.
 * Rule-based: same category AND a location overlap, or same category plus a strong
 * title/description keyword overlap. Never fabricates numbers.
 */
export async function findSimilarIncidents(input: {
  location: string;
  category: string;
  title: string;
  description: string;
  excludeTicketId?: string;
}): Promise<SimilarIncidents> {
  const empty: SimilarIncidents = { count: 0, lastReportedAt: null, ticketNumbers: [], note: null };
  if (!input.location && !input.description) return empty;

  // Consider every ticket except the one being created (all reporters — recurring
  // issues are a property of the facility, not of the person reporting).
  const candidates = await db.ticket.findMany({
    where: input.excludeTicketId ? { id: { not: input.excludeTicketId } } : undefined,
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const descWords = new Set(
    `${input.title} ${input.description}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  );

  const matches = candidates.filter((t) => {
    if (t.category !== input.category) return false;
    const locSim = locationSimilarity(t.location, input.location);
    if (locSim >= 0.34) return true;
    // Fall back to keyword overlap for cases like "Building B" vs "B-wing"
    const tWords = `${t.title} ${t.description}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    let shared = 0;
    for (const w of tWords) if (descWords.has(w)) shared++;
    return shared >= 2 && locSim > 0.15;
  });

  if (matches.length === 0) return empty;

  const last = matches[0];
  const days = Math.max(
    1,
    Math.round((Date.now() - last.createdAt.getTime()) / 86400000)
  );
  return {
    count: matches.length,
    lastReportedAt: last.createdAt.toISOString(),
    ticketNumbers: matches.slice(0, 5).map((t) => t.ticketNumber),
    note:
      matches.length === 1
        ? `1 similar past incident found (last reported ${days} day${days === 1 ? "" : "s"} ago).`
        : `${matches.length} similar past incidents found (last reported ${days} day${days === 1 ? "" : "s"} ago). This may be a recurring issue.`,
  };
}

/**
 * Detect recurring issues from real ticket history (rule-based, no fake ML).
 * Groups by location + category; 3+ incidents → recurring; 3+ within 60 days → active.
 */
export async function detectRecurringIssues(): Promise<RecurringIssue[]> {
  const tickets = await db.ticket.findMany({ orderBy: { createdAt: "desc" } });
  const groups = new Map<string, any[]>();

  for (const t of tickets) {
    const key = `${t.category}::${t.location.trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const recurring: RecurringIssue[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const [category, ...locParts] = key.split("::");
    const location = list[0].location; // original casing
    void locParts;
    const sixtyDaysAgo = Date.now() - 60 * 86400000;
    const recentCount = list.filter((t) => t.createdAt.getTime() >= sixtyDaysAgo).length;
    const days = Math.max(
      1,
      Math.round((Date.now() - list[0].createdAt.getTime()) / 86400000)
    );
    recurring.push({
      location,
      category,
      count: list.length,
      recentCount,
      lastReportedAt: list[0].createdAt.toISOString(),
      ticketNumbers: list.slice(0, 6).map((t) => t.ticketNumber),
      suggestion:
        recentCount >= 2
          ? `${list.length} incidents at this location (${recentCount} in the last 60 days). Consider inspecting for an underlying fault and scheduling preventative maintenance.`
          : `${list.length} incidents recorded at this location, the most recent ${days} day${days === 1 ? "" : "s"} ago. Consider scheduling preventative maintenance.`,
    });
  }

  // Most active first
  return recurring.sort((a, b) => b.recentCount - a.recentCount || b.count - a.count);
}

/* ------------------------------ AI resolution check ------------------------------ */

/**
 * Cautious, AI-assisted comparison of the original complaint against the
 * technician's resolution. Encourages good documentation. NEVER accuses anyone
 * and never claims the AI can physically verify a repair.
 */
export async function runResolutionCheck(input: {
  complaint: string;
  location: string;
  technicianAction: string;
  resolutionNotes: string;
  testResult: string;
}): Promise<string | null> {
  try {
    const { nvidiaChatCompletion } = await import("@/lib/nvidia-llm");
    const prompt = `You review maintenance ticket resolutions for documentation quality. You CANNOT physically verify repairs, you only review whether the written evidence addresses the original complaint.

ORIGINAL COMPLAINT: ${input.complaint}
LOCATION: ${input.location}
TECHNICIAN ACTION: ${input.technicianAction}
RESOLUTION NOTES: ${input.resolutionNotes || "(none provided)"}
TEST / RESULT: ${input.testResult || "(none provided)"}

Rules:
- If the action plausibly addresses the complaint AND a test or result is recorded, reply with {"flagged": false, "note": ""}.
- If the documentation does not mention any test, verification, or outcome that matches the reported symptom, reply with {"flagged": true, "note": "..."}.
- Flagged notes MUST be cautious and helpful, never accusatory. Use phrasing like: "Resolution evidence may be incomplete. The reported symptom was not addressed by a recorded test or result."
- Refer to the specific symptom. Max 30 words. Plain text, no quotes inside.
- Respond with JSON only: {"flagged": boolean, "note": string}`;

    const raw = await nvidiaChatCompletion(
      [{ role: "user", content: prompt }],
      { temperature: 0.3, maxTokens: 400 }
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { flagged?: boolean; note?: string };
    if (parsed.flagged && typeof parsed.note === "string" && parsed.note.trim()) {
      return parsed.note.trim().slice(0, 300);
    }
    return null;
  } catch (err) {
    console.error("[runResolutionCheck] skipped:", err);
    return null; // non-blocking
  }
}
