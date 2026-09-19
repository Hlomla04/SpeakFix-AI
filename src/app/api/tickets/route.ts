import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import {
  findSimilarIncidents,
  recordAudit,
  serializeTicket,
} from "@/lib/tickets";
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/types";

/** Generate a human-friendly ticket number like SF-2026-0042 */
async function generateTicketNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.ticket.count();
  let n = count + 1;
  for (let i = 0; i < 20; i++) {
    const candidate = `SF-${year}-${String(n).padStart(4, "0")}`;
    const existing = await db.ticket.findUnique({ where: { ticketNumber: candidate } });
    if (!existing) return candidate;
    n++;
  }
  return `SF-${year}-${Date.now().toString().slice(-6)}`;
}

/**
 * GET /api/tickets?scope=mine|queue|all&status=&category=&priority=&q=
 *
 * Data isolation, validated on the backend:
 *  - USER: only ever their own tickets (scope is forced to "mine")
 *  - TECHNICIAN: "queue" = tickets assigned to them + unassigned OPEN/REOPENED work;
 *               "mine" = tickets they reported themselves
 *  - ADMIN: "all" = every ticket; "mine" = their own reports
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Please log in to view tickets." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedScope = searchParams.get("scope") ?? "mine";
    const status = searchParams.get("status") ?? "";
    const category = searchParams.get("category") ?? "";
    const priority = searchParams.get("priority") ?? "";
    const q = (searchParams.get("q") ?? "").trim();

    // Enforce role scoping server-side — never trust the frontend
    const scope =
      user.role === "ADMIN"
        ? requestedScope === "all" || requestedScope === "queue"
          ? requestedScope
          : "mine"
        : user.role === "TECHNICIAN"
          ? requestedScope === "queue"
            ? "queue"
            : "mine"
          : "mine";

    const where: Record<string, unknown> = {};
    if (scope === "mine") {
      where.userId = user.id;
    } else if (scope === "queue") {
      where.AND = [
        {
          OR: [
            { assignedTechnicianId: user.id },
            { assignedTechnicianId: null, status: { in: ["OPEN", "REOPENED"] } },
          ],
        },
        // Technicians don't need resolved/closed history in the queue
        { status: { not: "RESOLVED" } },
      ];
    }
    // scope === "all": admin sees everything

    if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
      where.status = status;
    }
    if (category && (TICKET_CATEGORIES as readonly string[]).includes(category)) {
      where.category = category;
    }
    if (priority && (TICKET_PRIORITIES as readonly string[]).includes(priority)) {
      where.priority = priority;
    }
    if (q) {
      where.OR = [
        { title: { contains: q } },
        { description: { contains: q } },
        { location: { contains: q } },
        { ticketNumber: { contains: q } },
        { requesterName: { contains: q } },
      ];
    }

    const tickets = await db.ticket.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      include: { assignedTechnician: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ tickets: tickets.map(serializeTicket), scope });
  } catch (err) {
    console.error("[/api/tickets GET] error:", err);
    return NextResponse.json({ error: "Failed to load tickets" }, { status: 500 });
  }
}

/** POST /api/tickets — create a ticket for the logged-in user, checking real history for similar incidents */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Please log in to report an issue." }, { status: 401 });
    }

    const body = (await req.json()) as {
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
      location?: string;
      requesterName?: string;
      contactInfo?: string;
      urgencyReason?: string;
      transcript?: string;
      source?: string;
    };

    const title = (body.title || "").trim();
    const description = (body.description || "").trim();
    const location = (body.location || "").trim();

    if (!description || !location) {
      return NextResponse.json(
        { error: "description and location are required" },
        { status: 400 }
      );
    }

    const category = (TICKET_CATEGORIES as readonly string[]).includes(body.category || "")
      ? body.category!
      : "Other";

    let priority = (body.priority || "MEDIUM").toUpperCase();
    if (priority === "URGENT") priority = "CRITICAL"; // legacy
    if (!(TICKET_PRIORITIES as readonly string[]).includes(priority)) priority = "MEDIUM";

    const ticketNumber = await generateTicketNumber();

    // Check real ticket history for similar incidents at this location
    const similar = await findSimilarIncidents({
      location,
      category,
      title: title || description.slice(0, 60),
      description,
    });

    const ticket = await db.ticket.create({
      data: {
        ticketNumber,
        title: title || description.slice(0, 60),
        description,
        category,
        priority,
        status: "OPEN",
        location,
        userId: user.id,
        requesterName: (body.requesterName || "").trim() || user.name,
        contactInfo: (body.contactInfo || "").trim() || null,
        urgencyReason: (body.urgencyReason || "").trim() || null,
        source: body.source === "voice" ? "voice" : "manual",
        transcript: (body.transcript || "").slice(0, 10000),
        similarIncidentCount: similar.count,
        similarIncidentNote: similar.note,
      },
      include: { assignedTechnician: { select: { id: true, name: true } } },
    });

    await recordAudit({
      ticketId: ticket.id,
      actorId: user.id,
      actorName: user.name,
      actorRole: "REPORTER",
      action: "TICKET_CREATED",
      detail:
        similar.count > 0
          ? `Reported by ${ticket.requesterName}${similar.note ? `. ${similar.note}` : ""}`
          : `Reported by ${ticket.requesterName} via ${ticket.source === "voice" ? "voice" : "form"}`,
    });

    return NextResponse.json({ ticket: serializeTicket(ticket), similarIncidents: similar }, { status: 201 });
  } catch (err) {
    console.error("[/api/tickets POST] error:", err);
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
