import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

/**
 * GET /api/users?role=TECHNICIAN — directory for assignment.
 * Only admins (and technicians listing their own team) may call this.
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

    const { searchParams } = new URL(req.url);
    const roleFilter = searchParams.get("role");

    const where: Record<string, unknown> = {};
    if (roleFilter === "TECHNICIAN" || roleFilter === "ADMIN" || roleFilter === "USER") {
      where.role = roleFilter;
    }

    const users = await db.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 100,
    });

    return NextResponse.json({ users });
  } catch (err) {
    console.error("[/api/users] error:", err);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
