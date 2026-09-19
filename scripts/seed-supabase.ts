/**
 * Seed script for the Supabase-auth-backed SpeakFix AI:
 *
 *   1. Ensures three demo users exist in Supabase Auth (creating them with the
 *      service role key if needed) AND in the local SQLite User table (linked
 *      by supabaseUid).
 *   2. Seeds the demo ticket history: 3 past Building B HVAC incidents (so the
 *      recurring-issue detection triggers live), 1 AWAITING_VERIFICATION
 *      projector ticket, 1 OPEN stairwell light assigned to the technician.
 *   3. Backfills audit timelines for any tickets missing them.
 *
 * Idempotent: safe to run multiple times.
 *
 * Run: bun scripts/seed-supabase.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const db = new PrismaClient();

// Load env vars from .env (Bun does this automatically when running from the
// project root, but we want to be explicit for clarity).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SECRET_KEY env vars. Set them in .env");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const days = (n: number) => new Date(Date.now() - n * 86400000);
const hours = (n: number) => new Date(Date.now() - n * 3600000);

interface DemoUser {
  email: string;
  password: string;
  name: string;
  role: "USER" | "TECHNICIAN" | "ADMIN";
  preferredLanguage: string;
}

const DEMO_USERS: DemoUser[] = [
  { email: "demo@speakfix.ai",  password: "demo1234", name: "Hiomla Haldorson", role: "USER",      preferredLanguage: "English" },
  { email: "tech@speakfix.ai",  password: "tech1234",  name: "Thabo Nkosi",      role: "TECHNICIAN", preferredLanguage: "English" },
  { email: "admin@speakfix.ai", password: "admin1234", name: "Priya Naidoo",     role: "ADMIN",     preferredLanguage: "English" },
];

/** Get a Supabase Auth user by email (admin API). Returns null if not found. */
async function findSupabaseUserByEmail(email: string): Promise<{ id: string } | null> {
  // admin.listUsers paginates; for the demo we only have a handful so one page is fine.
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    console.warn(`listUsers failed: ${error.message}`);
    return null;
  }
  const found = (data.users as { id: string; email?: string }[]).find((u) => u.email === email);
  return found ? { id: found.id } : null;
}

/** Idempotently create a Supabase Auth user with a known password. */
async function ensureSupabaseUser(demo: DemoUser): Promise<string> {
  // 1. Try to find an existing Supabase Auth user with this email.
  const existing = await findSupabaseUserByEmail(demo.email);
  if (existing) return existing.id;

  // 2. Otherwise create one (auto-confirm email so the user can log in immediately).
  const { data, error } = await admin.auth.admin.createUser({
    email: demo.email,
    password: demo.password,
    email_confirm: true,
    user_metadata: { name: demo.name, preferredLanguage: demo.preferredLanguage, role: demo.role },
  });
  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      const reFind = await findSupabaseUserByEmail(demo.email);
      if (reFind) return reFind.id;
    }
    throw new Error(`Failed to create Supabase user ${demo.email}: ${error.message}`);
  }
  // SDK returns the user nested under `data.user`, not at the top level.
  const uid = (data as { user?: { id?: string } })?.user?.id;
  if (!uid) throw new Error(`Failed to create Supabase user ${demo.email}: no id returned`);
  return uid;
}

/** Idempotently create a local User row linked by supabaseUid. */
async function ensureLocalUser(demo: DemoUser, supabaseUid: string) {
  // Try by supabaseUid first (the unique key in our schema).
  const byUid = await db.user.findUnique({ where: { supabaseUid } });
  if (byUid) {
    // Sync fields in case the demo definition changed.
    return db.user.update({
      where: { id: byUid.id },
      data: { name: demo.name, email: demo.email, role: demo.role, preferredLanguage: demo.preferredLanguage },
    });
  }
  // Check by email in case the local row pre-dates the supabaseUid link.
  const byEmail = await db.user.findUnique({ where: { email: demo.email } });
  if (byEmail) {
    return db.user.update({
      where: { id: byEmail.id },
      data: { supabaseUid, name: demo.name, role: demo.role, preferredLanguage: demo.preferredLanguage },
    });
  }
  return db.user.create({
    data: {
      supabaseUid,
      name: demo.name,
      email: demo.email,
      role: demo.role,
      preferredLanguage: demo.preferredLanguage,
    },
  });
}

async function main() {
  console.log("== Seeding Supabase Auth + local users ==");
  const userMap: Record<string, { id: string; name: string; email: string; role: string }> = {};
  for (const demo of DEMO_USERS) {
    const supabaseUid = await ensureSupabaseUser(demo);
    const localUser = await ensureLocalUser(demo, supabaseUid);
    userMap[demo.role] = { id: localUser.id, name: localUser.name, email: localUser.email, role: localUser.role };
    console.log(`  ✓ ${demo.email} / ${demo.password} (role=${demo.role}, supabaseUid=${supabaseUid})`);
  }
  const reporter = userMap["USER"];
  const tech = userMap["TECHNICIAN"];
  const adminUser = userMap["ADMIN"];

  console.log("\n== Backfilling audit entries for any orphan tickets ==");
  const existingTickets = await db.ticket.findMany({ include: { audit: true } });
  let backfilled = 0;
  for (const t of existingTickets) {
    if (t.audit.length > 0) continue;
    await db.auditEntry.create({
      data: {
        ticketId: t.id,
        actorName: t.requesterName,
        actorRole: "REPORTER",
        action: "TICKET_CREATED",
        detail: `Reported by ${t.requesterName} via ${t.source === "voice" ? "voice" : "form"}`,
        createdAt: t.createdAt,
      },
    });
    backfilled++;
  }
  console.log(`  Backfilled ${backfilled} audit entry(ies).`);

  console.log("\n== Seeding demo ticket history (if missing) ==");
  // 3 past Building B HVAC incidents (recurring-issue demo)
  const hasDemoHistory = await db.ticket.findFirst({
    where: { location: { contains: "Building B" }, category: "HVAC" },
  });
  if (!hasDemoHistory) {
    const history = [
      {
        ticketNumber: "SF-2026-0101",
        title: "Air conditioner leaking onto floor",
        description:
          "The split-unit air conditioner above the east desks is dripping water onto the carpet. A bucket has been placed underneath.",
        createdAt: days(96),
        technicianAction: "Cleared the blocked condensate drain and wiped down the unit",
        testResult: "Ran the unit for 30 minutes — no dripping observed",
      },
      {
        ticketNumber: "SF-2026-0118",
        title: "Air conditioner not cooling",
        description:
          "The air conditioner in Building B blows air but never gets cold. The room gets uncomfortably warm by midday.",
        createdAt: days(61),
        technicianAction: "Recharged refrigerant and replaced a corroded fitting",
        testResult: "Outlet air measured at 12°C after 20 minutes of running",
      },
      {
        ticketNumber: "SF-2026-0134",
        title: "Water stain below air conditioner",
        description:
          "A damp patch and staining have appeared on the ceiling tile directly under the Building B air conditioner.",
        createdAt: days(23),
        technicianAction: "Re-seated the condensate tray and cleared the drain line",
        testResult: "Tray level checked and drain flow confirmed with a water test",
      },
    ];

    for (const h of history) {
      const created = await db.ticket.create({
        data: {
          ticketNumber: h.ticketNumber,
          title: h.title,
          description: h.description,
          category: "HVAC",
          priority: "MEDIUM",
          status: "RESOLVED",
          location: "Building B",
          requesterName: reporter.name,
          source: "voice",
          transcript: "",
          userId: reporter.id,
          assignedTechnicianId: tech.id,
          technicianAction: h.technicianAction,
          resolutionNotes: "Unit handed back in working order.",
          testResult: h.testResult,
          evidence: JSON.stringify([
            { type: "checklist", label: "Post-repair checklist completed" },
          ]),
          resolutionSubmittedAt: days(23),
          reporterConfirmedAt: days(22),
          reporterResponse: "Looks fine now, thanks.",
          createdAt: h.createdAt,
          updatedAt: days(22),
        },
      });
      await db.auditEntry.createMany({
        data: [
          {
            ticketId: created.id, actorName: reporter.name, actorRole: "REPORTER",
            action: "TICKET_CREATED", detail: `Reported by ${reporter.name} via voice`, createdAt: h.createdAt,
          },
          {
            ticketId: created.id, actorName: adminUser.name, actorRole: "ADMIN",
            action: "ASSIGNED", detail: `Assigned to ${tech.name}`, createdAt: h.createdAt,
          },
          {
            ticketId: created.id, actorName: tech.name, actorRole: "TECHNICIAN",
            action: "WORK_STARTED", detail: `${tech.name} started work`, createdAt: h.createdAt,
          },
          {
            ticketId: created.id, actorName: tech.name, actorRole: "TECHNICIAN",
            action: "RESOLUTION_SUBMITTED", detail: `${h.technicianAction} — ${h.testResult}`, createdAt: days(23),
          },
          {
            ticketId: created.id, actorName: "SpeakFix", actorRole: "SYSTEM",
            action: "VERIFICATION_REQUESTED", detail: "Reporter asked to confirm the problem is actually fixed", createdAt: days(23),
          },
          {
            ticketId: created.id, actorName: reporter.name, actorRole: "REPORTER",
            action: "REPORTER_CONFIRMED", detail: "Looks fine now, thanks.", createdAt: days(22),
          },
        ],
      });
    }
    console.log(`  ✓ Seeded 3 past Building B HVAC incidents (recurring-issue demo history).`);
  } else {
    console.log("  (Building B HVAC history already present, skipping)");
  }

  // AWAITING_VERIFICATION projector — instant voice-confirmation demo
  const hasAwaiting = await db.ticket.findFirst({
    where: { userId: reporter.id, status: "AWAITING_VERIFICATION" },
  });
  if (!hasAwaiting) {
    const submittedAt = hours(3);
    const created = await db.ticket.create({
      data: {
        ticketNumber: "SF-2026-0141",
        title: "Projector in Room 210 cuts out",
        description:
          "The ceiling projector in Room 210 switches itself off after about five minutes, mid-presentation. It happens on every input.",
        category: "AV Equipment",
        priority: "HIGH",
        status: "AWAITING_VERIFICATION",
        location: "Room 210",
        urgencyReason: "Client demo scheduled in Room 210 this week",
        requesterName: reporter.name,
        source: "voice",
        transcript: "",
        userId: reporter.id,
        assignedTechnicianId: tech.id,
        technicianAction: "Replaced the damaged HDMI cable and reseated the power connector",
        resolutionNotes: "The old cable had a bent pin and was running warm.",
        testResult: "Projector tested for 15 minutes without shutting down",
        evidence: JSON.stringify([
          { type: "photo", label: "Replacement HDMI cable installed", note: "img_210_hdi.jpg" },
          { type: "part", label: "HDMI cable, 10 m, replaced" },
        ]),
        resolutionSubmittedAt: submittedAt,
        createdAt: days(1),
        updatedAt: submittedAt,
      },
    });
    await db.auditEntry.createMany({
      data: [
        {
          ticketId: created.id, actorName: reporter.name, actorRole: "REPORTER",
          action: "TICKET_CREATED", detail: `Reported by ${reporter.name} via voice`, createdAt: days(1),
        },
        {
          ticketId: created.id, actorName: adminUser.name, actorRole: "ADMIN",
          action: "ASSIGNED", detail: `Assigned to ${tech.name}`, createdAt: days(1),
        },
        {
          ticketId: created.id, actorName: tech.name, actorRole: "TECHNICIAN",
          action: "WORK_STARTED", detail: `${tech.name} started work`, createdAt: hours(5),
        },
        {
          ticketId: created.id, actorName: tech.name, actorRole: "TECHNICIAN",
          action: "RESOLUTION_SUBMITTED",
          detail: "Replaced the damaged HDMI cable and reseated the power connector — Projector tested for 15 minutes without shutting down",
          createdAt: submittedAt,
        },
        {
          ticketId: created.id, actorName: tech.name, actorRole: "TECHNICIAN",
          action: "EVIDENCE_SUBMITTED",
          detail: "photo: Replacement HDMI cable installed; part: HDMI cable, 10 m, replaced",
          createdAt: submittedAt,
        },
        {
          ticketId: created.id, actorName: "SpeakFix", actorRole: "SYSTEM",
          action: "VERIFICATION_REQUESTED", detail: "Reporter asked to confirm the problem is actually fixed", createdAt: submittedAt,
        },
      ],
    });
    console.log(`  ✓ Seeded SF-2026-0141 (projector) AWAITING VERIFICATION for the demo reporter.`);
  } else {
    console.log("  (AWAITING_VERIFICATION ticket already present, skipping)");
  }

  // OPEN stairwell light assigned to the technician
  const hasOpenAssigned = await db.ticket.findFirst({
    where: { assignedTechnicianId: tech.id, status: "OPEN" },
  });
  if (!hasOpenAssigned) {
    const created = await db.ticket.create({
      data: {
        ticketNumber: "SF-2026-0142",
        title: "Flickering light above stairwell",
        description:
          "The fluorescent fitting above the stairwell on the second floor flickers constantly and occasionally buzzes.",
        category: "Electrical",
        priority: "MEDIUM",
        status: "OPEN",
        location: "Stairwell, second floor",
        requesterName: reporter.name,
        source: "voice",
        transcript: "",
        userId: reporter.id,
        assignedTechnicianId: tech.id,
        createdAt: hours(8),
      },
    });
    await db.auditEntry.createMany({
      data: [
        {
          ticketId: created.id, actorName: reporter.name, actorRole: "REPORTER",
          action: "TICKET_CREATED", detail: `Reported by ${reporter.name} via voice`, createdAt: hours(8),
        },
        {
          ticketId: created.id, actorName: adminUser.name, actorRole: "ADMIN",
          action: "ASSIGNED", detail: `Assigned to ${tech.name}`, createdAt: hours(7),
        },
      ],
    });
    console.log(`  ✓ Seeded SF-2026-0142 (stairwell light) assigned to the technician.`);
  } else {
    console.log("  (Open assigned ticket already present, skipping)");
  }

  console.log("\n== Done. Demo accounts ==");
  console.log("  Reporter:    demo@speakfix.ai  / demo1234");
  console.log("  Maintenance: tech@speakfix.ai  / tech1234");
  console.log("  Admin:       admin@speakfix.ai / admin1234");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
