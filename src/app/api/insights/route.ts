import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";
import { detectRecurringIssues, serializeAudit } from "@/lib/tickets";

/**
 * GET /api/insights — real-data operational insights.
 *  - TECHNICIAN / ADMIN: recurring issue detection (rule-based, from actual tickets)
 *  - ADMIN: also user directory + recent activity history
 * Never fabricates statistics.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "TECHNICIAN") {
      return NextResponse.json({ error: "Maintenance staff only." }, { status: 403 });
    }

    const recurring = await detectRecurringIssues();

    // Admin-only sections: people + cross-ticket activity
    let users: { id: string; name: string; email: string; role: string; ticketCount: number }[] = [];
    let activity: ReturnType<typeof serializeAudit> = [];
    if (user.role === "ADMIN") {
      const userRows = await db.user.findMany({
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { tickets: true } } },
      });
      users = userRows.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        ticketCount: u._count.tickets,
      }));

      const auditRows = await db.auditEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { ticket: { select: { ticketNumber: true, title: true } } },
      });
      activity = auditRows.map((a) => ({
        id: a.id,
        action: a.action,
        actorName: a.actorName,
        actorRole: a.actorRole,
        detail: a.detail ? `${a.ticket.ticketNumber}: ${a.detail}` : a.ticket.ticketNumber,
        createdAt: a.createdAt.toISOString(),
      }));
    }

    return NextResponse.json({ recurring, users, activity });
  } catch (err) {
    console.error("[/api/insights] error:", err);
    return NextResponse.json({ error: "Failed to load insights" }, { status: 500 });
  }
}
