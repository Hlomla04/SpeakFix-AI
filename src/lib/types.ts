// Shared types for SpeakFix AI

export const TICKET_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "HVAC",
  "AV Equipment",
  "IT & Network",
  "Furniture",
  "Safety",
  "Cleaning",
  "Structural",
  "Other",
] as const;

// Smart priority detection — CRITICAL is reserved for safety hazards,
// users cannot simply demand it.
export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

// Verified resolution workflow:
// OPEN → IN_PROGRESS → AWAITING_VERIFICATION → RESOLVED (reporter confirmed)
//                                    ↘ REOPENED (reporter said still broken) → back to IN_PROGRESS
export const TICKET_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "AWAITING_VERIFICATION",
  "RESOLVED",
  "REOPENED",
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** Account roles — permissions are validated on the backend, never trusted from the frontend */
export const USER_ROLES = ["USER", "TECHNICIAN", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Fields the agent extracts during conversation */
export interface TicketFields {
  title: string;
  description: string;
  category: string;
  priority: string;
  location: string;
  requesterName: string;
  contactInfo: string;
  urgencyReason: string;
}

export const EMPTY_TICKET_FIELDS: TicketFields = {
  title: "",
  description: "",
  category: "",
  priority: "",
  location: "",
  requesterName: "",
  contactInfo: "",
  urgencyReason: "",
};

/** A single chat message in the voice-agent conversation */
export interface ChatMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

/** Phases of the reporting conversation */
export type AgentPhase = "greeting" | "gathering" | "confirming" | "done";

/** Structured action the agent asks the client to perform (verified resolution loop) */
export interface AgentAction {
  type: "CONFIRM_RESOLUTION" | "REOPEN_TICKET";
  ticketId: string;
  /** What the reporter actually said, kept on the record */
  response: string;
}

/** Structured response returned by /api/agent */
export interface AgentResponse {
  reply: string;
  fields: TicketFields;
  missing: string[];
  phase: AgentPhase;
  userConfirmed: boolean;
  userWantsChanges: boolean;
  action: AgentAction | null;
}

/** Technician resolution fields captured by voice or typed */
export interface ResolutionFields {
  technicianAction: string;
  resolutionNotes: string;
  testResult: string;
}

export const EMPTY_RESOLUTION_FIELDS: ResolutionFields = {
  technicianAction: "",
  resolutionNotes: "",
  testResult: "",
};

/** Structured response from /api/agent in "resolve" mode */
export interface ResolveAgentResponse {
  reply: string;
  resolution: ResolutionFields;
  /** true when action + (test or notes) look complete enough to submit */
  ready: boolean;
}

/** Evidence attached to a resolution — simple typed entries, no document-management system */
export interface EvidenceEntry {
  type: "photo" | "checklist" | "part" | "note" | "voice";
  label: string;
  note?: string;
}

/** One immutable audit timeline entry */
export interface AuditEntryRecord {
  id: string;
  action: string;
  actorName: string;
  actorRole: string;
  detail: string | null;
  createdAt: string;
}

/** Verification checklist shown on every ticket */
export interface VerificationChecklist {
  actionRecorded: boolean;
  notesSubmitted: boolean;
  evidenceSubmitted: boolean;
  testPerformed: boolean;
  reporterConfirmed: boolean;
}

/** Ticket as stored in DB (serialized for client) */
export interface TicketRecord {
  id: string;
  ticketNumber: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  location: string;
  requesterName: string;
  contactInfo: string | null;
  urgencyReason: string | null;
  source: string;
  transcript: string;
  createdAt: string;
  updatedAt: string;
  /** Owning reporter account (for client-side role checks; access still enforced server-side) */
  userId: string | null;
  // Verified resolution workflow
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
  technicianAction: string | null;
  resolutionNotes: string | null;
  testResult: string | null;
  evidence: EvidenceEntry[] | null;
  resolutionSubmittedAt: string | null;
  resolutionCheckNote: string | null;
  reporterConfirmedAt: string | null;
  reporterResponse: string | null;
  reopenCount: number;
  similarIncidentCount: number | null;
  similarIncidentNote: string | null;
}

export interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  awaitingVerification: number;
  resolved: number;
  reopened: number;
  critical: number;
  high: number;
}

/** Similar incidents found in real ticket history when a new ticket is created */
export interface SimilarIncidents {
  count: number;
  lastReportedAt: string | null;
  ticketNumbers: string[];
  note: string | null;
}

/** Recurring issue group computed from real ticket data (admin/technician insights) */
export interface RecurringIssue {
  location: string;
  category: string;
  count: number;
  recentCount: number;
  lastReportedAt: string;
  ticketNumbers: string[];
  suggestion: string;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  TICKET_CREATED: "Ticket created",
  ASSIGNED: "Technician assigned",
  WORK_STARTED: "Work started",
  RESOLUTION_SUBMITTED: "Resolution submitted",
  EVIDENCE_SUBMITTED: "Evidence submitted",
  VERIFICATION_REQUESTED: "Sent for reporter verification",
  REPORTER_CONFIRMED: "Reporter confirmed resolution",
  TICKET_REOPENED: "Reopened by reporter",
  DETAILS_UPDATED: "Details updated",
  TICKET_DELETED: "Ticket deleted",
};
