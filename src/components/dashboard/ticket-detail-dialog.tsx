"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapPin,
  User,
  CalendarClock,
  FileText,
  Trash2,
  Mic,
  Clock,
  Mail,
  Plus,
  UserPlus,
  Wrench,
  ClipboardCheck,
  Paperclip,
  BadgeCheck,
  CheckCircle2,
  RotateCcw,
  Pencil,
  Volume2,
  Camera,
  ListChecks,
  Cog,
  StickyNote,
  AudioLines,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useSpeech } from "@/hooks/use-speech";
import { PriorityTag, StatusTag, CategoryTag } from "./ticket-badges";
import {
  AUDIT_ACTION_LABELS,
  EMPTY_RESOLUTION_FIELDS,
  type AuditEntryRecord,
  type EvidenceEntry,
  type ResolutionFields,
  type TicketRecord,
  type VerificationChecklist,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export interface Viewer {
  id: string;
  name: string;
  role: string; // USER | TECHNICIAN | ADMIN
}

interface TicketDetailDialogProps {
  ticket: TicketRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (ticket: TicketRecord) => void;
  onDeleted: (id: string) => void;
  viewer: Viewer;
}

/* ------------------------------ helpers ------------------------------ */

function computeChecklist(t: TicketRecord): VerificationChecklist {
  return {
    actionRecorded: Boolean(t.technicianAction?.trim()),
    notesSubmitted: Boolean(t.resolutionNotes?.trim()),
    evidenceSubmitted: Boolean(t.evidence && t.evidence.length > 0),
    testPerformed: Boolean(t.testResult?.trim()),
    reporterConfirmed: Boolean(t.reporterConfirmedAt),
  };
}

const AUDIT_ICONS: Record<string, typeof Plus> = {
  TICKET_CREATED: Plus,
  ASSIGNED: UserPlus,
  WORK_STARTED: Wrench,
  RESOLUTION_SUBMITTED: ClipboardCheck,
  EVIDENCE_SUBMITTED: Paperclip,
  VERIFICATION_REQUESTED: BadgeCheck,
  REPORTER_CONFIRMED: CheckCircle2,
  TICKET_REOPENED: RotateCcw,
  DETAILS_UPDATED: Pencil,
  TICKET_DELETED: Trash2,
};

const EVIDENCE_TYPES: { value: EvidenceEntry["type"]; label: string; icon: typeof Camera }[] = [
  { value: "photo", label: "Photo", icon: Camera },
  { value: "checklist", label: "Checklist", icon: ListChecks },
  { value: "part", label: "Replacement part", icon: Cog },
  { value: "note", label: "Note", icon: StickyNote },
  { value: "voice", label: "Voice note", icon: AudioLines },
];

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------ component ------------------------------ */

export function TicketDetailDialog({
  ticket,
  open,
  onOpenChange,
  onUpdated,
  onDeleted,
  viewer,
}: TicketDetailDialogProps) {
  const { toast } = useToast();
  const speech = useSpeech();

  const [current, setCurrent] = useState<TicketRecord | null>(ticket);
  const [audit, setAudit] = useState<AuditEntryRecord[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Resolution form state
  const [showForm, setShowForm] = useState(false);
  const [resolution, setResolution] = useState<ResolutionFields>({ ...EMPTY_RESOLUTION_FIELDS });
  const [evidenceDrafts, setEvidenceDrafts] = useState<EvidenceEntry[]>([]);
  const [evType, setEvType] = useState<EvidenceEntry["type"]>("photo");
  const [evLabel, setEvLabel] = useState("");
  const [voiceDoc, setVoiceDoc] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState<string[]>([]);
  const [voiceReady, setVoiceReady] = useState(false);

  // Admin assignment
  const [techs, setTechs] = useState<{ id: string; name: string; role: string }[]>([]);

  // Voice resolution conversation (resolve mode)
  const resolveMessagesRef = useRef<{ role: "user" | "agent"; content: string }[]>([]);
  const resolutionRef = useRef(resolution);
  useEffect(() => {
    resolutionRef.current = resolution;
  }, [resolution]);

  const t = current ?? ticket;
  const isStaff = viewer.role === "TECHNICIAN" || viewer.role === "ADMIN";
  const canWork = Boolean(
    t &&
    (viewer.role === "ADMIN" ||
      (viewer.role === "TECHNICIAN" && t.assignedTechnicianId === viewer.id))
  );
  const viewerIsReporter = Boolean(t && t.userId === viewer.id);

  /* ------------------- load full ticket + audit on open ------------------- */
  const load = useCallback(
    async (id: string, silent = false) => {
      if (!silent) setBusy("loading");
      try {
        const res = await fetch(`/api/tickets/${id}`, { cache: "no-store" });
        const data = (await res.json()) as {
          ticket?: TicketRecord;
          audit?: AuditEntryRecord[];
          error?: string;
        };
        if (!res.ok || !data.ticket) throw new Error(data.error || "Failed to load ticket");
        setCurrent(data.ticket);
        setAudit(data.audit ?? []);
        onUpdated(data.ticket);
      } catch (err) {
        toast({
          title: "Could not load ticket",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      } finally {
        setBusy(null);
      }
    },
    [onUpdated, toast]
  );

  useEffect(() => {
    if (open && ticket?.id) {
      setCurrent(ticket);
      setShowForm(false);
      setResolution({
        technicianAction: "",
        resolutionNotes: "",
        testResult: "",
      });
      setEvidenceDrafts([]);
      setVoiceReplies([]);
      setVoiceReady(false);
      resolveMessagesRef.current = [];
      void load(ticket.id, true);
      // Admin: load technicians for assignment
      if (viewer.role === "ADMIN") {
        void (async () => {
          try {
            const res = await fetch("/api/users?role=TECHNICIAN", { cache: "no-store" });
            const data = (await res.json()) as { users?: { id: string; name: string; role: string }[] };
            if (res.ok && data.users) setTechs(data.users);
          } catch {
            /* assignment dropdown just stays empty */
          }
        })();
      }
    }
     
  }, [open, ticket?.id]);

  /* ------------------------------ actions ------------------------------ */

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    if (!t) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/tickets/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = (await res.json()) as { ticket?: TicketRecord; audit?: AuditEntryRecord[]; error?: string };
      if (!res.ok || !data.ticket) throw new Error(data.error || "Update failed");
      setCurrent(data.ticket);
      setAudit(data.audit ?? []);
      onUpdated(data.ticket);
      setShowForm(false);
      return data.ticket;
    } catch (err) {
      toast({
        title: "Could not update ticket",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const deleteTicket = async () => {
    if (!t) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/tickets/${t.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onDeleted(t.id);
      setDeleteOpen(false);
      onOpenChange(false);
    } catch {
      toast({ title: "Could not delete ticket", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  /* --------------------------- voice resolution --------------------------- */

  const handleVoiceResolution = useCallback(
    async (text: string) => {
      if (!t) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const history = [...resolveMessagesRef.current, { role: "user" as const, content: trimmed }];
      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "resolve",
            ticketId: t.id,
            messages: history,
            currentResolution: resolutionRef.current,
          }),
        });
        const data = (await res.json()) as {
          reply?: string;
          resolution?: ResolutionFields;
          ready?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Agent failed");
        const reply = data.reply || "";
        resolveMessagesRef.current = [...history, { role: "agent", content: reply }];
        if (data.resolution) {
          setResolution(data.resolution);
          resolutionRef.current = data.resolution;
        }
        setVoiceReplies((prev) => [...prev.slice(-2), reply]);
        setVoiceReady(Boolean(data.ready));
        if (reply) speech.speak(reply);
      } catch (err) {
        toast({
          title: "Voice documentation failed",
          description: err instanceof Error ? err.message : "Please try again.",
          variant: "destructive",
        });
      }
    },
    [speech, t, toast]
  );

  const voice = useVoiceInput({
    onFinalResult: handleVoiceResolution,
    onError: (message) =>
      toast({ title: "Microphone error", description: message, variant: "destructive" }),
  });

  /* ------------------------------ render ------------------------------ */

  if (!t) return null;

  const checklist = computeChecklist(t);
  const awaiting = t.status === "AWAITING_VERIFICATION";
  const resolved = t.status === "RESOLVED";
  const formOpen = showForm;
  const canStart = canWork && ["OPEN", "REOPENED"].includes(t.status);
  const canAccept = viewer.role === "TECHNICIAN" && !t.assignedTechnicianId;
  const canRecordResolution = canWork && ["OPEN", "IN_PROGRESS", "REOPENED"].includes(t.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] sm:max-w-2xl flex flex-col">
        {/* -------- header -------- */}
        <DialogHeader className="text-left shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="font-mono text-sm font-semibold text-muted-foreground">
              {t.ticketNumber}
            </DialogTitle>
            {t.source === "voice" && (
              <span className="inline-flex items-center gap-1 rounded border border-foreground/15 px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                <Mic className="h-3 w-3" aria-hidden />
                Reported by voice
              </span>
            )}
            {t.reopenCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-1.5 py-px text-[10px] font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                Reopened {t.reopenCount}×
              </span>
            )}
          </div>
          <DialogDescription className="text-base font-semibold text-foreground">
            {t.title}
          </DialogDescription>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <CategoryTag category={t.category} />
            <PriorityTag priority={t.priority} />
            <StatusTag status={t.status} />
          </div>
        </DialogHeader>

        {/* -------- body -------- */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1 custom-scrollbar text-sm">
          {/* issue */}
          <div className="flex items-start gap-2.5">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="leading-relaxed">{t.description}</p>
          </div>
          {t.urgencyReason && (
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />
              <p className="text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Why it matters:</span> {t.urgencyReason}
              </p>
            </div>
          )}
          {t.similarIncidentNote && (
            <div className="flex items-start gap-2.5">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-muted-foreground">
                <span className="font-semibold text-foreground">Pattern:</span> {t.similarIncidentNote}
              </p>
            </div>
          )}

          {/* details grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            <Detail icon={MapPin} label="Location" value={t.location} />
            <Detail icon={User} label="Reporter" value={t.requesterName} />
            <Detail
              icon={Wrench}
              label="Technician"
              value={t.assignedTechnicianName ?? "Not assigned yet"}
              muted={!t.assignedTechnicianName}
            />
            <Detail icon={CalendarClock} label="Created" value={fmtDateTime(t.createdAt)} />
            <Detail icon={CalendarClock} label="Last update" value={fmtDateTime(t.updatedAt)} />
            {t.contactInfo && <Detail icon={Mail} label="Contact" value={t.contactInfo} />}
          </div>

          <Separator />

          {/* -------- resolution -------- */}
          {(t.technicianAction || t.resolutionNotes || t.testResult || t.evidence) && (
            <section aria-label="Resolution">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Resolution
              </h3>
              <dl className="mt-2 space-y-2.5">
                {t.technicianAction && (
                  <div>
                    <dt className="text-xs text-muted-foreground">What was done</dt>
                    <dd className="mt-0.5">{t.technicianAction}</dd>
                  </div>
                )}
                {t.testResult && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Test / result</dt>
                    <dd className="mt-0.5">{t.testResult}</dd>
                  </div>
                )}
                {t.resolutionNotes && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Notes</dt>
                    <dd className="mt-0.5 text-muted-foreground">{t.resolutionNotes}</dd>
                  </div>
                )}
                {t.evidence && t.evidence.length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Evidence</dt>
                    <dd className="mt-1.5 space-y-1">
                      {t.evidence.map((e, i) => {
                        const meta = EVIDENCE_TYPES.find((x) => x.value === e.type);
                        const Icon = meta?.icon ?? Paperclip;
                        return (
                          <span
                            key={i}
                            className="flex items-center gap-1.5 rounded border border-foreground/10 bg-foreground/[0.02] px-2 py-1 text-xs"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="font-medium">{e.label}</span>
                            {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                          </span>
                        );
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* -------- verification panel -------- */}
          {(t.resolutionSubmittedAt || resolved) && (
            <section
              aria-label="Resolution verification"
              className={cn(
                "rounded-lg border p-4",
                resolved
                  ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30"
                  : "border-foreground/15 bg-foreground/[0.02]"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {resolved ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
                  )}
                  Resolution verification
                </h3>
                <p
                  className={cn(
                    "text-xs font-semibold",
                    resolved ? "text-emerald-700 dark:text-emerald-400" : "text-violet-700 dark:text-violet-400"
                  )}
                >
                  {resolved
                    ? "Resolved — User Confirmed"
                    : "Awaiting reporter confirmation"}
                </p>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {(
                  [
                    ["Technician action recorded", checklist.actionRecorded],
                    ["Resolution notes submitted", checklist.notesSubmitted],
                    ["Evidence submitted", checklist.evidenceSubmitted],
                    ["Test performed", checklist.testPerformed],
                    ["Reporter confirmation", checklist.reporterConfirmed],
                  ] as const
                ).map(([label, done]) => (
                  <li key={label} className="flex items-center gap-2 text-xs">
                    <CheckState done={done} />
                    <span className={done ? "" : "text-muted-foreground"}>{label}</span>
                  </li>
                ))}
              </ul>
              {t.resolutionCheckNote && !resolved && (
                <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  SpeakFix note: {t.resolutionCheckNote}
                </p>
              )}
              {t.reporterResponse && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Reporter said: <span className="italic text-foreground/80">“{t.reporterResponse}”</span>
                </p>
              )}
            </section>
          )}

          {/* -------- resolution form (technician / admin) -------- */}
          {canWork && (formOpen || showForm) && !resolved && (
            <section aria-label="Record resolution" className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Record resolution
                </h3>
                <button
                  type="button"
                  onClick={() => setVoiceDoc((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    voiceDoc
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-foreground/15 text-muted-foreground hover:text-foreground"
                  )}
                  aria-pressed={voiceDoc}
                >
                  <Mic className="h-3.5 w-3.5" aria-hidden />
                  {voiceDoc ? "Listening… speak your notes" : "Document by voice"}
                </button>
              </div>

              {voiceDoc && (
                <div className="mt-3 rounded-md border border-dashed p-3">
                  <div className="flex items-start gap-3">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        if (speech.speaking) speech.cancel();
                        if (voice.isListening) voice.stop();
                        else voice.start();
                      }}
                      disabled={voice.isTranscribing}
                      className={cn("gap-1.5", voice.isListening && "bg-rose-600 hover:bg-rose-500")}
                    >
                      <Mic className="h-4 w-4" aria-hidden />
                      {voice.isListening ? "Stop" : "Speak"}
                    </Button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        Say what you did and how you tested it. E.g. "I replaced the damaged
                        cable and tested the projector for 15 minutes. It’s working normally now.”
                      </p>
                      {voice.interimTranscript && (
                        <p className="mt-1.5 text-xs italic text-muted-foreground/70">
                          {voice.interimTranscript}
                        </p>
                      )}
                      {voiceReplies.map((r, i) => (
                        <p key={i} className="mt-1.5 flex items-start gap-1.5 text-xs text-foreground/90">
                          <Volume2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
                          {r}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="res-action" className="text-xs">
                    What was fixed <span className="text-rose-500">*</span>
                  </Label>
                  <Textarea
                    id="res-action"
                    rows={2}
                    value={resolution.technicianAction}
                    onChange={(e) => setResolution((r) => ({ ...r, technicianAction: e.target.value }))}
                    placeholder="e.g. Replaced the damaged HDMI cable"
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="res-test" className="text-xs">
                    Test / result
                  </Label>
                  <Input
                    id="res-test"
                    value={resolution.testResult}
                    onChange={(e) => setResolution((r) => ({ ...r, testResult: e.target.value }))}
                    placeholder="e.g. Projector tested for 15 minutes without shutting down"
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="res-notes" className="text-xs">
                    Notes
                  </Label>
                  <Input
                    id="res-notes"
                    value={resolution.resolutionNotes}
                    onChange={(e) => setResolution((r) => ({ ...r, resolutionNotes: e.target.value }))}
                    placeholder="Anything else worth recording: parts used, advice given…"
                    className="mt-1 text-sm"
                  />
                </div>

                {/* evidence */}
                <div>
                  <Label className="text-xs">Evidence</Label>
                  {evidenceDrafts.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {evidenceDrafts.map((e, i) => {
                        const meta = EVIDENCE_TYPES.find((x) => x.value === e.type);
                        const Icon = meta?.icon ?? Paperclip;
                        return (
                          <li
                            key={i}
                            className="flex items-center gap-1.5 rounded border border-foreground/10 px-2 py-1 text-xs"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="font-medium">{e.label}</span>
                            <button
                              type="button"
                              className="ml-auto text-muted-foreground hover:text-rose-600 cursor-pointer"
                              onClick={() => setEvidenceDrafts((prev) => prev.filter((_, j) => j !== i))}
                              aria-label={`Remove evidence ${e.label}`}
                            >
                              <Trash2 className="h-3 w-3" aria-hidden />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-1.5 flex gap-2">
                    <Select value={evType} onValueChange={(v) => setEvType(v as EvidenceEntry["type"])}>
                      <SelectTrigger className="w-[150px] text-xs" aria-label="Evidence type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVIDENCE_TYPES.map((x) => (
                          <SelectItem key={x.value} value={x.value}>
                            {x.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={evLabel}
                      onChange={(e) => setEvLabel(e.target.value)}
                      placeholder="Describe it. E.g. Photo of new cable installed"
                      className="flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addEvidence();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addEvidence} className="shrink-0">
                      Add
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={!resolution.technicianAction.trim() || busy === "submit_resolution"}
                    onClick={() =>
                      void act("submit_resolution", {
                        ...resolution,
                        evidence: evidenceDrafts,
                      })
                    }
                  >
                    {busy === "submit_resolution" ? "Submitting…" : "Submit for verification"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    The reporter will be asked to confirm the problem is actually fixed.
                  </p>
                </div>
              </div>
            </section>
          )}

          <Separator />

          {/* -------- audit timeline -------- */}
          <section aria-label="Audit timeline">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              History
            </h3>
            {audit.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No recorded actions yet.</p>
            ) : (
              <ol className="mt-3 space-y-0">
                {audit.map((entry, i) => {
                  const Icon = AUDIT_ICONS[entry.action] ?? Pencil;
                  const isLast = i === audit.length - 1;
                  return (
                    <li key={entry.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {!isLast && (
                        <span
                          aria-hidden
                          className="absolute left-[9px] top-5 h-full w-px bg-foreground/10"
                        />
                      )}
                      <span className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border bg-card">
                        <Icon className="h-2.5 w-2.5 text-muted-foreground" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug">
                          <span className="font-semibold">
                            {AUDIT_ACTION_LABELS[entry.action] ?? entry.action.replaceAll("_", " ")}
                          </span>
                          {entry.detail && (
                            <span className="text-muted-foreground"> · {entry.detail}</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground/70 tabular-nums">
                          {fmtDateTime(entry.createdAt)} · {entry.actorName}
                          {entry.actorRole === "SYSTEM" ? " (SpeakFix)" : ` (${entry.actorRole.toLowerCase()})`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          {t.transcript && (
            <details className="rounded-md border bg-muted/30">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground">
                Original voice transcript
              </summary>
              <div className="max-h-40 overflow-y-auto px-3 pb-3 custom-scrollbar">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {t.transcript}
                </p>
              </div>
            </details>
          )}
        </div>

        {/* -------- footer actions -------- */}
        <DialogFooter className="flex-col gap-3 sm:flex-col shrink-0">
 {/* Reporter verification actions */}
          {viewerIsReporter && awaiting && (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-500"
                disabled={busy !== null}
                onClick={() => void act("reporter_confirm", { response: "Confirmed working from ticket view" })}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                {busy === "reporter_confirm" ? "Confirming…" : "Confirm repair, it's working"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
                disabled={busy !== null}
                onClick={() => void act("reporter_reopen", { response: "Still broken, reported from ticket view" })}
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                {busy === "reporter_reopen" ? "Reopening…" : "Still broken"}
              </Button>
            </div>
          )}

          {/* Staff workflow actions */}
          {isStaff && !resolved && (
            <div className="flex w-full flex-wrap items-center gap-2">
              {canAccept && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void act("assign", {})}
                  className="gap-1.5"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  Accept job
                </Button>
              )}
              {canStart && (
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void act("start_work")}
                  className="gap-1.5"
                >
                  <Wrench className="h-4 w-4" aria-hidden />
                  {busy === "start_work" ? "Starting…" : "Start work"}
                </Button>
              )}
              {canWork && canRecordResolution && !showForm && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowForm(true)}
                  className="gap-1.5"
                >
                  <ClipboardCheck className="h-4 w-4" aria-hidden />
                  {t.technicianAction ? "Update resolution" : "Record resolution"}
                </Button>
              )}
              {/* Admin assignment */}
              {viewer.role === "ADMIN" && techs.length > 0 && !t.assignedTechnicianId && (
                <Select
                  onValueChange={(v) => void act("assign", { technicianId: v })}
                  disabled={busy !== null}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Assign technician">
                    <SelectValue placeholder="Assign technician…" />
                  </SelectTrigger>
                  <SelectContent>
                    {techs.map((tech) => (
                      <SelectItem key={tech.id} value={tech.id}>
                        {tech.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Delete (reporter of this ticket, or admin) */}
          {(viewerIsReporter || viewer.role === "ADMIN") && (
            <div className="flex w-full justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteOpen(true)}
                className="gap-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Delete
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ticket {t.ticketNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the ticket, its resolution record and history. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteTicket()}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );

  function addEvidence() {
    const label = evLabel.trim();
    if (!label) return;
    setEvidenceDrafts((prev) => [...prev, { type: evType, label }]);
    setEvLabel("");
  }
}

function Detail({
  icon: Icon,
  label,
  value,
  muted,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-semibold text-muted-foreground">{label}</p>
        <p className={cn("truncate text-xs font-medium", muted && "text-muted-foreground")}>{value}</p>
      </div>
    </div>
  );
}

function CheckState({ done }: { done: boolean }) {
  return done ? (
    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Done" />
  ) : (
    <span
      className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-dashed border-foreground/30"
      aria-label="Pending"
    >
      <span className="sr-only">Pending</span>
    </span>
  );
}
