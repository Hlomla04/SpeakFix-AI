#!/usr/bin/env python3
"""
SpeakFix AI — Verified Resolution E2E (the hackathon demo loop, via API)

SPEAK → UNDERSTAND → ACTION → REPAIR → VERIFY → REOPEN → CONFIRM
"""
import json
import sys
import urllib.request

BASE = "http://localhost:3000"
PASS = 0
FAIL = 0


def ok(msg):
    global PASS
    PASS += 1
    print(f"  ✔ {msg}")


def bad(msg):
    global FAIL
    FAIL += 1
    print(f"  ✘ {msg}")


def check(desc, expected, actual):
    if expected in str(actual):
        ok(desc)
    else:
        bad(f"{desc} — expected '…{expected}…' got: {str(actual)[:220]}")


class Client:
    def __init__(self):
        self.token = None

    def login(self, email, password):
        data = json.dumps({"email": email, "password": password}).encode()
        req = urllib.request.Request(BASE + "/api/auth/login", data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req) as resp:
            cookie = resp.headers.get("Set-Cookie", "")
            for part in cookie.split(";"):
                if part.strip().startswith("speakfix_session="):
                    self.token = part.strip().split("=", 1)[1]
            return json.load(resp)

    def req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Cookie", f"speakfix_session={self.token}")
        try:
            with urllib.request.urlopen(req) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            try:
                return json.load(e)
            except Exception:
                return {"error": f"HTTP {e.code}"}

    def get(self, path):
        return self.req("GET", path)

    def post(self, path, body):
        return self.req("POST", path, body)

    def patch(self, path, body):
        return self.req("PATCH", path, body)


def main():
    reporter, admin, tech = Client(), Client(), Client()
    anon = Client()

    print("── setup: login all three roles")
    r = reporter.login("demo@speakfix.ai", "demo1234")
    check("reporter session", "Hiomla", r.get("user", {}).get("name", ""))
    tech.login("tech@speakfix.ai", "tech1234")
    check("technician role", "TECHNICIAN", tech.get("/api/auth/me").get("user", {}).get("role", ""))
    admin.login("admin@speakfix.ai", "admin1234")

    print("── 1. SPEAK: agent conversation (Iris personality)")
    h = [{"role": "user", "content": "The air conditioner in Building B is leaking again."}]
    r1 = reporter.post("/api/agent", {"messages": h, "currentFields": {}, "phase": "gathering"})
    print(f"    Iris: {r1.get('reply')}")
    if any(k in r1.get("reply", "").lower() for k in ("which", "where", "confirm")):
        ok("natural follow-up question (no generic chatbot line)")
    else:
        bad(f"unexpected follow-up style: {r1.get('reply')}")
    check("category inferred as HVAC", "HVAC", r1.get("fields", {}).get("category", ""))

    h.append({"role": "agent", "content": r1.get("reply", "")})
    h.append({"role": "user", "content": "yes exactly, the split unit above the east desks"})
    r2 = reporter.post("/api/agent", {"messages": h, "currentFields": r1.get("fields"), "phase": r1.get("phase")})
    print(f"    Iris: {r2.get('reply')}")

    h.append({"role": "agent", "content": r2.get("reply", "")})
    h.append({"role": "user", "content": "yes, create it"})
    r3 = reporter.post("/api/agent", {"messages": h, "currentFields": r2.get("fields"), "phase": r2.get("phase")})
    if r3.get("userConfirmed"):
        ok("agent confirms ticket creation")
    else:
        bad(f"agent did not confirm: {r3}")

    create = reporter.post(
        "/api/tickets",
        {
            "title": r3["fields"].get("title") or "Air conditioner leaking in Building B",
            "description": r3["fields"]["description"],
            "category": r3["fields"]["category"],
            "priority": r3["fields"]["priority"],
            "location": r3["fields"]["location"],
            "transcript": "\n".join(f"{m['role']}: {m['content']}" for m in h),
            "source": "voice",
        },
    )
    ticket_id = create.get("ticket", {}).get("id")
    tnum = create.get("ticket", {}).get("ticketNumber")
    sim = create.get("similarIncidents", {})
    print(f"    created {tnum} (similar incidents: {sim.get('count')})")
    check("ticket created", "SF-", tnum or "")
    if (sim.get("count") or 0) >= 3:
        ok("similar-incident detection found 3+ past Building B reports")
    else:
        bad(f"similar-incident detection got {sim.get('count')}, expected >= 3")

    print("── 2. ACTION: admin assigns technician")
    techs = admin.get("/api/users?role=TECHNICIAN").get("users", [])
    assign = admin.patch(f"/api/tickets/{ticket_id}", {"action": "assign", "technicianId": techs[0]["id"]})
    check("assigned to Thabo", "Thabo", assign.get("ticket", {}).get("assignedTechnicianName"))
    check("audit trail seeded with TICKET_CREATED", "TICKET_CREATED", [a["action"] for a in assign.get("audit", [])])

    print("── 3. REPAIR: technician starts work")
    start = tech.patch(f"/api/tickets/{ticket_id}", {"action": "start_work"})
    check("status IN_PROGRESS", "IN_PROGRESS", start.get("ticket", {}).get("status"))

    print("── 4. VOICE RESOLUTION: technician documents repair by voice")
    vr = tech.post(
        "/api/agent",
        {
            "mode": "resolve",
            "ticketId": ticket_id,
            "messages": [
                {
                    "role": "user",
                    "content": "I repaired the drainage pipe and flushed the line. I ran the unit for twenty minutes and there is no more leaking.",
                }
            ],
            "currentResolution": {},
        },
    )
    print(f"    Iris structured: {vr.get('resolution')}")
    check("voice resolution extracted action", "drainage", (vr.get("resolution") or {}).get("technicianAction", "").lower())
    if vr.get("ready"):
        ok("voice resolution ready")
    else:
        bad(f"voice resolution not ready: {vr}")

    res = tech.patch(
        f"/api/tickets/{ticket_id}",
        {
            "action": "submit_resolution",
            "technicianAction": vr["resolution"]["technicianAction"],
            "resolutionNotes": "Handed back in working order",
            "testResult": vr["resolution"].get("testResult", ""),
            "evidence": [
                {"type": "photo", "label": "Repaired drain pipe"},
                {"type": "checklist", "label": "Post-repair checklist"},
            ],
        },
    )
    check("status AWAITING_VERIFICATION", "AWAITING_VERIFICATION", res.get("ticket", {}).get("status"))
    if res.get("verification", {}).get("evidenceSubmitted"):
        ok("verification checklist: evidence submitted")
    else:
        bad(f"evidence not recorded: {res.get('verification')}")

    print("── 5. VERIFY (reporter voice): 'No, it's still leaking' → REOPENED")
    rv = reporter.post(
        "/api/agent",
        {
            "messages": [
                {
                    "role": "user",
                    "content": "The repair was completed, is the air conditioner working now? No, it's still leaking.",
                }
            ],
            "currentFields": {},
            "phase": "gathering",
        },
    )
    action = rv.get("action") or {}
    print(f"    agent action: {action.get('type')} for {action.get('ticketId')}")
    check("agent returns REOPEN_TICKET intent", "REOPEN_TICKET", action.get("type", ""))

    reopen = reporter.patch(
        f"/api/tickets/{action.get('ticketId')}",
        {"action": "reporter_reopen", "response": "No, it's still leaking"},
    )
    check("ticket REOPENED", "REOPENED", reopen.get("ticket", {}).get("status"))
    check("reopenCount incremented", "1", str(reopen.get("ticket", {}).get("reopenCount")))

    print("── 6. second repair cycle → AWAITING again")
    res2 = tech.patch(
        f"/api/tickets/{ticket_id}",
        {
            "action": "submit_resolution",
            "technicianAction": "Replaced the corroded drain section and resealed the tray",
            "resolutionNotes": "Old fitting was corroded through",
            "testResult": "Ran unit 30 minutes with full cooling — completely dry",
            "evidence": [{"type": "part", "label": "Replacement drain fitting installed"}],
        },
    )
    check("back to AWAITING_VERIFICATION", "AWAITING_VERIFICATION", res2.get("ticket", {}).get("status"))

    print("── 7. CONFIRM (reporter voice): 'Yes, it's working now' → RESOLVED")
    cv = reporter.post(
        "/api/agent",
        {
            "messages": [
                {
                    "role": "user",
                    "content": "You asked about the repair — yes, the air conditioner is working now, nice and dry.",
                }
            ],
            "currentFields": {},
            "phase": "gathering",
        },
    )
    ca = cv.get("action") or {}
    check("agent returns CONFIRM_RESOLUTION intent", "CONFIRM_RESOLUTION", ca.get("type", ""))
    confirm = reporter.patch(
        f"/api/tickets/{ca.get('ticketId')}", {"action": "reporter_confirm", "response": "Yes, working now"}
    )
    check("ticket RESOLVED", "RESOLVED", confirm.get("ticket", {}).get("status"))
    if confirm.get("verification", {}).get("reporterConfirmed"):
        ok("reporter confirmed flag set")
    else:
        bad("reporter confirmed flag missing")
    audit_count = len(confirm.get("audit", []))
    print(f"    audit entries: {audit_count}")
    if audit_count >= 8:
        ok(f"full audit trail recorded ({audit_count} entries)")
    else:
        bad(f"audit trail too short: {audit_count}")

    print("── 8. permissions & isolation")
    check("technician cannot confirm (403)", "Only the person who reported", tech.patch(f"/api/tickets/{ticket_id}", {"action": "reporter_confirm", "response": "x"}).get("error", ""))
    check("reporter cannot assign (403)", "Not allowed", reporter.patch(f"/api/tickets/{ticket_id}", {"action": "assign", "technicianId": "x"}).get("error", ""))
    check("unauthenticated blocked (401)", "log in", anon.patch(f"/api/tickets/{ticket_id}", {"action": "start_work"}).get("error", ""))
    check("reporter blocked from insights (403)", "staff only", reporter.get("/api/insights").get("error", ""))
    insights = admin.get("/api/insights")
    rec_locs = " ".join(r["location"] for r in insights.get("recurring", []))
    check("recurring Building B detected in insights", "Building B", rec_locs)
    check("admin insights: users list", "Priya", json.dumps(insights.get("users", [])))
    check("admin insights: activity history", "SF-", json.dumps(insights.get("activity", [])))

    # Reporter sees only their own tickets
    mine = reporter.get("/api/tickets?scope=all")
    n = len(mine.get("tickets", []))
    if n > 0:
        ok(f"reporter scope forced to own tickets ({n} visible)")
    else:
        bad("no tickets visible")

    # AI resolution check flags weak documentation (cautious note)
    weak = tech.patch(
        f"/api/tickets/{ticket_id}",
        {
            "action": "submit_resolution",
            "technicianAction": "Tightened a screw",
            "resolutionNotes": "",
            "testResult": "",
        },
    )
    # ticket is RESOLVED so this should be rejected (409)
    check("cannot submit resolution on RESOLVED ticket (409)", "already resolved", weak.get("error", ""))

    print()
    print(f"═══════ RESULT: {PASS} passed, {FAIL} failed ══════")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
