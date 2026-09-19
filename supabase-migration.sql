-- ═══════════════════════════════════════════════════════════════════
-- SpeakFix AI — Supabase Postgres schema migration
-- ═══════════════════════════════════════════════════════════════════
-- Run this in the Supabase dashboard:
--   1. Go to https://supabase.com/dashboard
--   2. Open project drtnzwvzxkifeqcysqxb
--   3. Left sidebar → SQL Editor
--   4. Click "+ New query"
--   5. Paste this entire file
--   6. Click "Run" (or press Ctrl+Enter)
--
-- After it succeeds, you'll see "Success. No rows returned."
-- Then your database is ready — all 4 tables created.
-- ═══════════════════════════════════════════════════════════════════

-- Drop existing tables if they exist (idempotent — safe to re-run)
DROP TABLE IF EXISTS "AuditEntry" CASCADE;
DROP TABLE IF EXISTS "PasswordResetToken" CASCADE;
DROP TABLE IF EXISTS "Ticket" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- ───────────────────────────────────────────────────────────────────
-- User: local profile linked to Supabase Auth by supabaseUid
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "User" (
  "id"                TEXT PRIMARY KEY,
  "supabaseUid"       TEXT UNIQUE NOT NULL,
  "name"              TEXT NOT NULL,
  "email"             TEXT UNIQUE NOT NULL,
  "preferredLanguage" TEXT NOT NULL DEFAULT 'English',
  "role"              TEXT NOT NULL DEFAULT 'USER',  -- USER | TECHNICIAN | ADMIN
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL
);

-- ───────────────────────────────────────────────────────────────────
-- PasswordResetToken: custom short-lived single-use tokens for the
-- MVP recovery-link flow (we map token → user, then call Supabase's
-- admin.updateUserById to set the new password).
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "PasswordResetToken" (
  "id"        TEXT PRIMARY KEY,
  "token"     TEXT UNIQUE NOT NULL,
  "userId"    TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ───────────────────────────────────────────────────────────────────
-- Ticket: the core maintenance ticket with the verified-resolution
-- workflow fields.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "Ticket" (
  "id"            TEXT PRIMARY KEY,
  "ticketNumber"  TEXT UNIQUE NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "priority"      TEXT NOT NULL,
  -- OPEN | IN_PROGRESS | AWAITING_VERIFICATION | RESOLVED | REOPENED
  "status"        TEXT NOT NULL DEFAULT 'OPEN',
  "location"      TEXT NOT NULL,
  "requesterName" TEXT NOT NULL DEFAULT 'Anonymous',
  "contactInfo"   TEXT,
  "urgencyReason" TEXT,
  "source"        TEXT NOT NULL DEFAULT 'voice',
  "transcript"    TEXT NOT NULL DEFAULT '',

  -- Reporter (the User who reported this ticket; nullable so tickets
  -- survive if the reporter's account is deleted)
  "userId"        TEXT REFERENCES "User"("id") ON DELETE SET NULL,

  -- Verified-resolution workflow fields
  "assignedTechnicianId"   TEXT REFERENCES "User"("id") ON DELETE SET NULL,
  "technicianAction"       TEXT,
  "resolutionNotes"        TEXT,
  "testResult"             TEXT,
  -- JSON array: [{ "type": "photo|checklist|part|note|voice", "label": "...", "note": "..." }]
  "evidence"               TEXT,
  "resolutionSubmittedAt"  TIMESTAMP(3),
  "resolutionCheckNote"    TEXT,
  "reporterConfirmedAt"    TIMESTAMP(3),
  "reporterResponse"       TEXT,
  "reopenCount"            INTEGER NOT NULL DEFAULT 0,
  "similarIncidentCount"   INTEGER,
  "similarIncidentNote"    TEXT,

  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

-- ───────────────────────────────────────────────────────────────────
-- AuditEntry: immutable record of every important action on a ticket.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE "AuditEntry" (
  "id"        TEXT PRIMARY KEY,
  "ticketId"  TEXT NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE,
  "actorId"   TEXT,                    -- null = SpeakFix system action
  "actorName" TEXT NOT NULL,
  "actorRole" TEXT NOT NULL,           -- REPORTER | TECHNICIAN | ADMIN | SYSTEM
  -- TICKET_CREATED | ASSIGNED | WORK_STARTED | RESOLUTION_SUBMITTED |
  -- EVIDENCE_SUBMITTED | VERIFICATION_REQUESTED | REPORTER_CONFIRMED |
  -- TICKET_REOPENED | TICKET_DELETED | DETAILS_UPDATED
  "action"    TEXT NOT NULL,
  "detail"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for the audit timeline query (tickets by id, ordered by date)
CREATE INDEX "AuditEntry_ticketId_createdAt_idx"
  ON "AuditEntry" ("ticketId", "createdAt");

-- Enable row-level security on all tables (Supabase best practice).
-- Our app uses the service role key for admin operations, which
-- bypasses RLS — so we add a permissive policy for the service role
-- only. Anonymous access is denied.
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditEntry" ENABLE ROW LEVEL SECURITY;

-- Allow the service role (which our Next.js backend uses) to do
-- anything. The anon role (browser) gets nothing — all browser
-- requests go through our API routes, which use the service role.
CREATE POLICY "service_role_all_users"   ON "User"   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_tickets"  ON "Ticket" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_audit"   ON "AuditEntry" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_tokens"  ON "PasswordResetToken" FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════
-- Done. Verify by running this query in the SQL editor:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- Should return: AuditEntry, PasswordResetToken, Ticket, User
-- ═══════════════════════════════════════════════════════════════════
