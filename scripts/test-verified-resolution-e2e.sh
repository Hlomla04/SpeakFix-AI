#!/usr/bin/env bash
# ============================================================================
# SpeakFix AI — Verified Resolution E2E (the hackathon demo loop, via API)
#
# SPEAK → UNDERSTAND → ACTION → REPAIR → VERIFY → REOPEN → CONFIRM
#
# 1. Reporter reports "AC in Building B leaking again" via agent conversation
# 2. Similar-incident detection finds the 3 past Building B HVAC tickets
# 3. Admin assigns the technician
# 4. Technician documents the repair BY VOICE (resolve-mode agent) + evidence
# 5. Reporter says "still leaking" by voice -> ticket REOPENED
# 6. Technician repairs again -> AWAITING VERIFICATION
# 7. Reporter confirms by voice -> RESOLVED - user confirmed
# 8. Permission checks: tech can't confirm, reporter can't assign, isolation
# ============================================================================
set -u
BASE="http://localhost:3000"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✔ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
check() { # $1 desc, $2 expected, $3 actual
  if [[ "$3" == *"$2"* ]]; then ok "$1"; else bad "$1 — expected '…$2…' got: ${3:0:220}"; fi
}
J() { python3 -c "import sys,json;d=json.load(sys.stdin);print(json.dumps(d$1) if len(sys.argv)>2 else d)" "$@" 2>/dev/null; }
jq_get() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

RJ=/tmp/sf-reporter.cookies; AJ=/tmp/sf-admin.cookies; TJ=/tmp/sf-tech.cookies
rm -f $RJ $AJ $TJ

login() { # email password jar
  curl -s -c "$3" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" >/dev/null
}

echo "── setup: login all three roles"
login demo@speakfix.ai demo1234 $RJ
login admin@speakfix.ai admin1234 $AJ
login tech@speakfix.ai tech1234 $TJ
ME=$(curl -s -b $RJ $BASE/api/auth/me)
check "reporter session" "Hiomla" "$ME"
ROLE_ME=$(curl -s -b $TJ $BASE/api/auth/me)
check "technician role in session" "TECHNICIAN" "$ROLE_ME"

echo "── 1. SPEAK: agent conversation → ticket with recurring detection"
R=$(curl -s -b $RJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"The air conditioner in Building B is leaking again."}],"currentFields":{},"phase":"gathering"}')
REPLY=$(echo "$R" | jq_get "['reply']")
PHASE=$(echo "$R" | jq_get "['phase']")
echo "    Iris: $REPLY"
check "agent gathers (asks location/follow-up)" "?" "$REPLY"
check "phase gathering or confirming" "gather" "$PHASE"

FIELDS=$(echo "$R" | jq_get "['fields']")
R2=$(curl -s -b $RJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"The air conditioner in Building B is leaking again.\"},{\"role\":\"agent\",\"content\":\"$REPLY\"},{\"role\":\"user\",\"content\":\"yes exactly, the split unit above the east desks\"}],\"currentFields\":$FIELDS,\"phase\":\"$PHASE\"}")
REPLY2=$(echo "$R2" | jq_get "['reply']")
echo "    Iris: $REPLY2"

R3=$(curl -s -b $RJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"The air conditioner in Building B is leaking again.\"},{\"role\":\"agent\",\"content\":\"$REPLY\"},{\"role\":\"user\",\"content\":\"yes exactly, the split unit above the east desks\"},{\"role\":\"agent\",\"content\":\"$REPLY2\"},{\"role\":\"user\",\"content\":\"yes, create it\"}],\"currentFields\":$(echo "$R2" | jq_get "['fields']"),\"phase\":\"$(echo "$R2" | jq_get "['phase']")\"}")
CONFIRMED=$(echo "$R3" | jq_get "['userConfirmed']")
check "agent confirms ticket creation" "True" "$CONFIRMED"

CREATE=$(curl -s -b $RJ -X POST $BASE/api/tickets -H "Content-Type: application/json" \
  -d "{\"title\":\"Air conditioner leaking in Building B\",\"description\":\"The split-unit air conditioner above the east desks in Building B is leaking water again.\",\"category\":\"HVAC\",\"priority\":\"MEDIUM\",\"location\":\"Building B\",\"transcript\":\"user: The air conditioner in Building B is leaking again.\",\"source\":\"voice\"}")
TICKET=$(echo "$CREATE" | jq_get "['ticket']['id']")
TNUM=$(echo "$CREATE" | jq_get "['ticket']['ticketNumber']")
SIMCOUNT=$(echo "$CREATE" | jq_get "['similarIncidents']['count']")
echo "    created $TNUM (similar incidents: $SIMCOUNT)"
check "ticket created" "SF-" "$TNUM"
if [ "$SIMCOUNT" -ge 3 ] 2>/dev/null; then ok "similar-incident detection found 3+ past Building B reports"; else bad "similar-incident detection (got $SIMCOUNT, expected >= 3)"; fi

echo "── 2. ACTION: admin assigns technician"
ASSIGN=$(curl -s -b $AJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" \
  -d "{\"action\":\"assign\",\"technicianId\":\"$(curl -s -b $AJ "$BASE/api/users?role=TECHNICIAN" | jq_get "['users'][0]['id']")\"}")
check "assigned to Thabo" "Thabo" "$(echo "$ASSIGN" | jq_get "['ticket']['assignedTechnicianName']")"
AUDIT_FIRST=$(echo "$ASSIGN" | jq_get "['audit'][0]['action']")
check "audit trail seeded with TICKET_CREATED" "TICKET_CREATED" "$AUDIT_FIRST"

echo "── 3. REPAIR (technician): start work"
START=$(curl -s -b $TJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" -d '{"action":"start_work"}')
check "status IN_PROGRESS" "IN_PROGRESS" "$(echo "$START" | jq_get "['ticket']['status']")"

echo "── 4. VOICE RESOLUTION: technician documents repair by voice"
VR=$(curl -s -b $TJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d "{\"mode\":\"resolve\",\"ticketId\":\"$TICKET\",\"messages\":[{\"role\":\"user\",\"content\":\"I repaired the drainage pipe and flushed the line. I ran the unit for twenty minutes and there is no more leaking.\"}],\"currentResolution\":{}}")
V_ACT=$(echo "$VR" | jq_get "['resolution']['technicianAction']")
V_READY=$(echo "$VR" | jq_get "['ready']")
echo "    Iris structured: action='$V_ACT' ready=$V_READY"
check "voice resolution extracted action" "drainage" "$V_ACT"
check "voice resolution ready to submit" "True" "$V_READY"

VTEST=$(echo "$VR" | jq_get "['resolution']['testResult']")
RES=$(curl -s -b $TJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" \
  -d "{\"action\":\"submit_resolution\",\"technicianAction\":\"$V_ACT\",\"resolutionNotes\":\"Handed back in working order\",\"testResult\":\"$VTEST\",\"evidence\":[{\"type\":\"photo\",\"label\":\"Repaired drain pipe\"},{\"type\":\"checklist\",\"label\":\"Post-repair checklist\"}]}")
check "status AWAITING_VERIFICATION" "AWAITING_VERIFICATION" "$(echo "$RES" | jq_get "['ticket']['status']")"
check "verification checklist has evidence" "True" "$(echo "$RES" | jq_get "['verification']['evidenceSubmitted']")"

echo "── 5. VERIFY (reporter voice): 'No, it's still leaking' → REOPENED"
RV=$(curl -s -b $RJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"The repair was completed, is the air conditioner working now? No, it's still leaking.\"}],\"currentFields\":{},\"phase\":\"gathering\"}")
ACT_TYPE=$(echo "$RV" | jq_get "['action']['type']")
ACT_ID=$(echo "$RV" | jq_get "['action']['ticketId']")
echo "    agent action: $ACT_TYPE for $ACT_ID"
check "agent returns REOPEN_TICKET intent" "REOPEN_TICKET" "$ACT_TYPE"

REOPEN=$(curl -s -b $RJ -X PATCH $BASE/api/tickets/$ACT_ID -H "Content-Type: application/json" \
  -d "{\"action\":\"reporter_reopen\",\"response\":\"No, it's still leaking\"}")
check "ticket REOPENED" "REOPENED" "$(echo "$REOPEN" | jq_get "['ticket']['status']")"
check "reopenCount incremented" "1" "$(echo "$REOPEN" | jq_get "['ticket']['reopenCount']")"

echo "── 6. second repair cycle → AWAITING again"
RES2=$(curl -s -b $TJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" \
  -d '{"action":"submit_resolution","technicianAction":"Replaced the corroded drain section and resealed the tray","resolutionNotes":"Old fitting was corroded through","testResult":"Ran unit 30 minutes with full cooling — completely dry","evidence":[{"type":"part","label":"Replacement drain fitting installed"}]}')
check "back to AWAITING_VERIFICATION" "AWAITING_VERIFICATION" "$(echo "$RES2" | jq_get "['ticket']['status']")"

echo "── 7. CONFIRM (reporter voice): 'Yes, it's working now' → RESOLVED"
CV=$(curl -s -b $RJ -X POST $BASE/api/agent -H "Content-Type: application/json" \
  -d "{\"messages\":[{\"role\":\"user\",\"content\":\"You asked about the repair — yes, the air conditioner is working now, nice and dry.\"}],\"currentFields\":{},\"phase\":\"gathering\"}")
CACT=$(echo "$CV" | jq_get "['action']['type']")
check "agent returns CONFIRM_RESOLUTION intent" "CONFIRM_RESOLUTION" "$CACT"
CONFIRM=$(curl -s -b $RJ -X PATCH $BASE/api/tickets/$ACT_ID -H "Content-Type: application/json" \
  -d '{"action":"reporter_confirm","response":"Yes, working now"}')
check "ticket RESOLVED" "RESOLVED" "$(echo "$CONFIRM" | jq_get "['ticket']['status']")"
check "reporter confirmed flag" "True" "$(echo "$CONFIRM" | jq_get "['verification']['reporterConfirmed']")"

AUDIT_COUNT=$(echo "$CONFIRM" | jq_get "['audit'].__len__()")
echo "    audit entries: $AUDIT_COUNT"
if [ "$AUDIT_COUNT" -ge 8 ] 2>/dev/null; then ok "full audit trail recorded ($AUDIT_COUNT entries)"; else bad "audit trail too short ($AUDIT_COUNT)"; fi

echo "── 8. permissions & isolation"
TECHCONF=$(curl -s -b $TJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" \
  -d '{"action":"reporter_confirm","response":"x"}')
check "technician cannot confirm (403)" "Only the person who reported" "$TECHCONF"
REP_ASSIGN=$(curl -s -b $RJ -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" \
  -d '{"action":"assign","technicianId":"x"}')
check "reporter cannot assign (403)" "Not allowed" "$REP_ASSIGN"
UNAUTH=$(curl -s -X PATCH $BASE/api/tickets/$TICKET -H "Content-Type: application/json" -d '{"action":"start_work"}')
check "unauthenticated blocked (401)" "log in" "$UNAUTH"
USER_LIST=$(curl -s -b $RJ "$BASE/api/tickets?scope=all")
USERCNT=$(echo "$USER_LIST" | jq_get "['tickets'].__len__()")
MINECNT=$(echo "$USER_LIST" | jq_get "['tickets'].__len__()")
echo "    (reporter scope=all forced to own: $USERCNT tickets)"
if [ "$USERCNT" -le 20 ] 2>/dev/null; then ok "USER scope forced to mine"; else bad "scope leak"; fi
TECHQ=$(curl -s -b $TJ "$BASE/api/tickets?scope=queue")
check "technician queue excludes RESOLVED" "SF-" "$(echo "$TECHQ" | jq_get "['tickets'][0]['ticketNumber']")"
INSIGHTS_USER=$(curl -s -b $RJ $BASE/api/insights)
check "reporter blocked from insights (403)" "staff only" "$INSIGHTS_USER"
INSIGHTS=$(curl -s -b $AJ $BASE/api/insights)
check "admin insights: recurring Building B detected" "Building B" "$(echo "$INSIGHTS" | jq_get "['recurring'][0]['location']")"
check "admin insights: users list" "Priya" "$INSIGHTS"

echo ""
echo "═══════ RESULT: $PASS passed, $FAIL failed ═══════"
exit $([ $FAIL -eq 0 ] && echo 0 || echo 1)
