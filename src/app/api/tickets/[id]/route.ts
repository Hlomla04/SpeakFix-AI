import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  computeVerification,
  recordAudit,
  runResolutionCheck,
  serializeAudit,
  serializeTicket,
} from "@/lib/tickets";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type EvidenceEntry,
} from "@/lib/types";

type SessionUser = { id: string; name: string; email: string; role: string };

/** Who may see this ticket: the reporter, the assigned technician, or an admin. */
async function canAccess(ticket: { userId: string | null; assignedTechnicianId: string | null }, user: SessionUser) {
  if (user.role === "ADMIN") return true;
  if (ticket.userId === user.id) return true;
  if (user.role === "TECHNICIAN" && ticket.assignedTechnicianId === user.id) return true;
  return false;
}

/** Who may document/start work: the assigned technician or an admin. */
function canWorkOn(ticket: { assignedTechnicianId: string | null }, user: SessionUser) {
  if (user.role === "ADMIN") return true;
  if (user.role === "TECHNICIAN" && ticket.assignedTechnicianId === user.id) return true;
  return false;
}

function parseEvidence(raw: unknown): EvidenceEntry[] {
  if (!Array.isArray(raw)) return [];
  const validTypes = ["photo", "checklist", "part", "note", "voice"];
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e) => ({
      type: (validTypes.includes(String(e.type)) ? String(e.type) : "note") as EvidenceEntry["type"],
      label: String(e.label || "Evidence").trim().slice(0, 200) || "Evidence",
      note: e.note ? String(e.note).trim().slice(0, 500) : undefined,
    }))
    .filter((e) => e.label.length > 0);
}

async function loadWithAudit(id: string) {
  const ticket = await db.ticket.findUnique({
    where: { id },
    include: { assignedTechnician: { select: { id: true, name: true } } },
  });
  if (!ticket) return null;
  const audit = await db.auditEntry.findMany({ where: { ticketId: id } });
  return { ticket, audit };
}

/** GET /api/tickets/[id] — ticket + audit timeline + verification checklist (access-checked) */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(_req);
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const { id } = await params;
    const loaded = await loadWithAudit(id);
    if (!loaded) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (!(await canAccess(loaded.ticket, user))) {
      // 404 (not 403) so we don't reveal other users' tickets
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    return NextResponse.json({
      ticket: serializeTicket(loaded.ticket),
      audit: serializeAudit(loaded.audit),
      verification: computeVerification(loaded.ticket),
    });
  } catch (err) {
    console.error("[/api/tickets/[id] GET] error:", err);
    return NextResponse.json({ error: "Failed to load ticket" }, { status: 500 });
  }
}

/**
 * PATCH /api/tickets/[id] — verified-resolution workflow actions.
 * Every action is role-checked on the backend and recorded in the audit trail.
 *
 * actions:
 *  - update_fields        (reporter or admin)
 *  - assign               (admin, or technician accepting a queue ticket)
 *  - start_work           (assigned technician or admin)
 *  - submit_resolution    (assigned technician or admin) → AWAITING_VERIFICATION
 *  - add_evidence         (assigned technician or admin)
 *  - reporter_confirm     (reporter only, while AWAITING_VERIFICATION) → RESOLVED
 *  - reporter_reopen      (reporter only) → REOPENED
 *  - set_status           (admin only, escape hatch)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const { id } = await params;
    const loaded = await loadWithAudit(id);
    if (!loaded) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    const ticket = loaded.ticket;
    if (!(await canAccess(ticket, user))) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const body = (await req.json()) as {
      action?: string;
      // update_fields
      title?: string;
      description?: string;
      location?: string;
      category?: string;
      priority?: string;
      // assign
      technicianId?: string;
      // submit_resolution / add_evidence
      technicianAction?: string;
      resolutionNotes?: string;
      testResult?: string;
      evidence?: unknown;
      // reporter responses
      response?: string;
      status?: string;
    };

    const isReporter = ticket.userId === user.id;
    const now = new Date();
  
    const respond = async () => {
      const fresh = await loadWithAudit(id);
      return NextResponse.json({
        ticket: fresh ? serializeTicket(fresh.ticket) : null,
        audit: fresh ? serializeAudit(fresh.audit) : [],
        verification: fresh ? computeVerification(fresh.ticket) : null,
      });
    };

    switch (body.action) {
      /* ------------------------- edit basic details ------------------------- */
      case "update_fields": {
        if (!isReporter && user.role !== "ADMIN") {
          return NextResponse.json({ error: "Not allowed." }, { status: 403 });
        }
        const data: Record<string, string> = {};
        for (const key of ["title", "description", "location"] as const) {
          if (typeof body[key] === "string" && body[key]!.trim()) {
            data[key] = body[key]!.trim().slice(0, 2000);
          }
        }
        if (body.category && (TICKET_CATEGORIES as readonly string[]).includes(body.category)) {
          data.category = body.category;
        }
        if (
          body.priority &&
          (TICKET_PRIORITIES as readonly string[]).includes(body.priority.toUpperCase())
        ) {
          data.priority = body.priority.toUpperCase();
        }
        if (Object.keys(data).length === 0) {
          return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
        }
  await db.ticket.update({ where: { id }, data });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: isReporter ? "REPORTER" : "ADMIN",
          action: "DETAILS_UPDATED",
          detail: `Updated ${Object.keys(data).join(", ")}`,
        });
        return respond();
      }

      /* ------------------------------ assignment ---------------------------- */
      case "assign": {
        let technicianId = body.technicianId;
        let technicianName: string | null = null;
        if (user.role === "ADMIN") {
          if (!technicianId) return NextResponse.json({ error: "technicianId required" }, { status: 400 });
          const tech = await db.user.findUnique({ where: { id: technicianId } });
          if (!tech || (tech.role !== "TECHNICIAN" && tech.role !== "ADMIN")) {
            return NextResponse.json({ error: "That user is not maintenance staff." }, { status: 400 });
          }
          technicianName = tech.name;
        } else if (user.role === "TECHNICIAN") {
          // Technicians may accept a queue ticket themselves
          if (technicianId && technicianId !== user.id) {
            return NextResponse.json({ error: "Not allowed." }, { status: 403 });
          }
          technicianId = user.id;
          technicianName = user.name;
        } else {
          return NextResponse.json({ error: "Not allowed." }, { status: 403 });
        }
  await db.ticket.update({
          where: { id },
          data: { assignedTechnicianId: technicianId },
        });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: user.role === "ADMIN" ? "ADMIN" : "TECHNICIAN",
          action: "ASSIGNED",
          detail: `Assigned to ${technicianName}`,
        });
        return respond();
      }

      /* ------------------------------ start work ---------------------------- */
      case "start_work": {
        if (!canWorkOn(ticket, user)) {
          return NextResponse.json({ error: "Only the assigned technician can start this work." }, { status: 403 });
        }
        if (!["OPEN", "REOPENED"].includes(ticket.status)) {
          return NextResponse.json({ error: `Work already ${ticket.status.toLowerCase().replaceAll("_", " ")}.` }, { status: 409 });
        }
  await db.ticket.update({ where: { id }, data: { status: "IN_PROGRESS" } });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "TECHNICIAN",
          action: "WORK_STARTED",
          detail: `${user.name} started work${ticket.status === "REOPENED" ? " (after reopening)" : ""}`,
        });
        return respond();
      }

      /* --------------------------- record resolution ------------------------ */
      case "submit_resolution": {
        if (!canWorkOn(ticket, user)) {
          return NextResponse.json({ error: "Only the assigned technician can submit a resolution." }, { status: 403 });
        }
        if (!["OPEN", "IN_PROGRESS", "REOPENED", "AWAITING_VERIFICATION"].includes(ticket.status)) {
          return NextResponse.json({ error: "This ticket is already resolved." }, { status: 409 });
        }
        const technicianAction = (body.technicianAction || "").trim().slice(0, 2000);
        const resolutionNotes = (body.resolutionNotes || "").trim().slice(0, 2000);
        const testResult = (body.testResult || "").trim().slice(0, 2000);
        if (!technicianAction) {
          return NextResponse.json(
            { error: "Describe what was done to fix the problem." },
            { status: 400 }
          );
        }
        const evidenceEntries = parseEvidence(body.evidence);

        // Cautious AI documentation check — complaint vs resolution
        const checkNote = await runResolutionCheck({
          complaint: `${ticket.title}. ${ticket.description}`,
          location: ticket.location,
          technicianAction,
          resolutionNotes,
          testResult,
        });

        // Merge with any evidence already on the ticket
        const existingEvidence = parseEvidence(
          (() => {
            try {
              return JSON.parse(ticket.evidence || "[]");
            } catch {
              return [];
            }
          })()
        );
        const allEvidence = [...existingEvidence, ...evidenceEntries];
  await db.ticket.update({
          where: { id },
          data: {
            technicianAction,
            resolutionNotes: resolutionNotes || null,
            testResult: testResult || null,
            evidence: allEvidence.length > 0 ? JSON.stringify(allEvidence) : ticket.evidence,
            resolutionCheckNote: checkNote,
            resolutionSubmittedAt: now,
            reporterConfirmedAt: null,
            status: "AWAITING_VERIFICATION",
          },
        });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "TECHNICIAN",
          action: "RESOLUTION_SUBMITTED",
          detail: `${technicianAction}${testResult ? `. ${testResult}` : ""}`,
        });
        if (evidenceEntries.length > 0) {
          await recordAudit({
            ticketId: id,
            actorId: user.id,
            actorName: user.name,
            actorRole: "TECHNICIAN",
            action: "EVIDENCE_SUBMITTED",
            detail: evidenceEntries.map((e) => `${e.type}: ${e.label}`).join("; ").slice(0, 400),
          });
        }
        await recordAudit({
          ticketId: id,
          actorId: null,
          actorName: "SpeakFix",
          actorRole: "SYSTEM",
          action: "VERIFICATION_REQUESTED",
          detail: "Reporter asked to confirm the problem is actually fixed",
        });
        return respond();
      }

      /* ------------------------------ add evidence -------------------------- */
      case "add_evidence": {
        if (!canWorkOn(ticket, user)) {
          return NextResponse.json({ error: "Not allowed." }, { status: 403 });
        }
        if (ticket.status === "RESOLVED") {
          return NextResponse.json({ error: "This ticket is already closed." }, { status: 409 });
        }
        const evidenceEntries = parseEvidence(body.evidence);
        if (evidenceEntries.length === 0) {
          return NextResponse.json({ error: "No valid evidence entries." }, { status: 400 });
        }
        const existingEvidence = parseEvidence(
          (() => {
            try {
              return JSON.parse(ticket.evidence || "[]");
            } catch {
              return [];
            }
          })()
        );
  await db.ticket.update({
          where: { id },
          data: { evidence: JSON.stringify([...existingEvidence, ...evidenceEntries]) },
        });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "TECHNICIAN",
          action: "EVIDENCE_SUBMITTED",
          detail: evidenceEntries.map((e) => `${e.type}: ${e.label}`).join("; ").slice(0, 400),
        });
        return respond();
      }

      /* -------------------- reporter confirms it's actually fixed ----------- */
      case "reporter_confirm": {
        if (!isReporter) {
          return NextResponse.json({ error: "Only the person who reported this can confirm it." }, { status: 403 });
        }
        if (ticket.status !== "AWAITING_VERIFICATION") {
          return NextResponse.json({ error: "This ticket isn't waiting for your confirmation." }, { status: 409 });
        }
  await db.ticket.update({
          where: { id },
          data: {
            status: "RESOLVED",
            reporterConfirmedAt: now,
            reporterResponse: (body.response || "").trim().slice(0, 500) || "Confirmed working",
          },
        });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "REPORTER",
          action: "REPORTER_CONFIRMED",
          detail: (body.response || "").trim().slice(0, 400) || "Reporter confirmed the problem is fixed",
        });
        return respond();
      }

      /* ------------------- reporter says it's still broken ------------------ */
      case "reporter_reopen": {
        if (!isReporter) {
          return NextResponse.json({ error: "Only the person who reported this can reopen it." }, { status: 403 });
        }
        if (!["AWAITING_VERIFICATION", "RESOLVED"].includes(ticket.status)) {
          return NextResponse.json({ error: "This ticket can't be reopened right now." }, { status: 409 });
        }
  await db.ticket.update({
          where: { id },
          data: {
            status: "REOPENED",
            reporterConfirmedAt: null,
            reporterResponse: (body.response || "").trim().slice(0, 500) || "Still broken",
            reopenCount: (ticket.reopenCount || 0) + 1,
          },
        });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "REPORTER",
          action: "TICKET_REOPENED",
          detail: (body.response || "").trim().slice(0, 400) || "Reporter says the problem is still there, maintenance notified",
        });
        return respond();
      }

      /* --------------------------- admin escape hatch ----------------------- */
      case "set_status": {
        if (user.role !== "ADMIN") {
          return NextResponse.json({ error: "Admins only." }, { status: 403 });
        }
        const status = body.status || "";
        if (!(TICKET_STATUSES as readonly string[]).includes(status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
  await db.ticket.update({ where: { id }, data: { status } });
        await recordAudit({
          ticketId: id,
          actorId: user.id,
          actorName: user.name,
          actorRole: "ADMIN",
          action: "DETAILS_UPDATED",
          detail: `Status set to ${status.replaceAll("_", " ").toLowerCase()} by admin`,
        });
        return respond();
      }

      default:
        return NextResponse.json(
          { error: "Unknown action. Use update_fields, assign, start_work, submit_resolution, add_evidence, reporter_confirm or reporter_reopen." },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[/api/tickets/[id] PATCH] error:", err);
    return NextResponse.json({ error: "We couldn't update the ticket. Please try again." }, { status: 500 });
  }
}

/** DELETE /api/tickets/[id] — reporter or admin */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUserFromRequest(_req);
    if (!user) return NextResponse.json({ error: "Please log in." }, { status: 401 });

    const { id } = await params;
    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    // 404 for other users' tickets (no existence leak)
    if (ticket.userId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    await db.ticket.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[/api/tickets/[id] DELETE] error:", err);
    return NextResponse.json({ error: "Failed to delete ticket" }, { status: 500 });
  }
}
