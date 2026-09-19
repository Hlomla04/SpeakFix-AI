#!/usr/bin/env bash
# E2E test for the Supabase-auth-backed SpeakFix AI.
# Tests: login (good/bad), me, tickets, signup, isolation, forgot/reset, logout.

set -u
BASE="http://localhost:3000"
TMP="/tmp/speakfix-e2e"
rm -rf "$TMP" && mkdir -p "$TMP"
PASS=0
FAIL=0
function expect_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name  (expected=$expected actual=$actual)"
    FAIL=$((FAIL+1))
  fi
}
function expect_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name  (needle='$needle' not found in: $haystack)"
    FAIL=$((FAIL+1))
  fi
}
function expect_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -qF "$needle"; then
    echo "  ✓ $name"
    PASS=$((PASS+1))
  else
    echo "  ✗ $name  (needle='$needle' unexpectedly found in: $haystack)"
    FAIL=$((FAIL+1))
  fi
}

echo "== 1. Login with wrong password =="
RES=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"WRONG"}' -w '%{http_code}' -o /tmp/speakfix-e2e/login_bad.json)
expect_eq "status 401" "401" "$RES"
expect_contains "error message" "Incorrect email or password" "$(cat /tmp/speakfix-e2e/login_bad.json)"

echo "== 2. Login as demo user =="
RES=$(curl -s -c "$TMP/demo.txt" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"demo1234"}' -w '%{http_code}' -o "$TMP/login_demo.json")
expect_eq "status 200" "200" "$RES"
expect_contains "user email" "demo@speakfix.ai" "$(cat "$TMP/login_demo.json")"
expect_contains "user name" "Hiomla" "$(cat "$TMP/login_demo.json")"
expect_contains "cookie set" "sb-upjfcykmvjzlbwreftvg-auth-token" "$(cat "$TMP/demo.txt")"

echo "== 3. /api/auth/me with demo cookie =="
RES=$(curl -s -b "$TMP/demo.txt" "$BASE/api/auth/me" -w '%{http_code}' -o "$TMP/me_demo.json")
expect_eq "status 200" "200" "$RES"
expect_contains "supabaseUid" "supabaseUid" "$(cat "$TMP/me_demo.json")"
expect_contains "role USER" '"role":"USER"' "$(cat "$TMP/me_demo.json")"

echo "== 4. /api/auth/me without cookie (should 401) =="
RES=$(curl -s "$BASE/api/auth/me" -w '%{http_code}' -o "$TMP/me_anon.json")
expect_eq "status 401" "401" "$RES"

echo "== 5. /api/tickets with demo cookie =="
RES=$(curl -s -b "$TMP/demo.txt" "$BASE/api/tickets" -w '%{http_code}' -o "$TMP/tickets_demo.json")
expect_eq "status 200" "200" "$RES"
TICKETS_COUNT=$(python3 -c "import json; print(len(json.load(open('$TMP/tickets_demo.json'))['tickets']))")
echo "    demo tickets: $TICKETS_COUNT"
[ "$TICKETS_COUNT" -ge 5 ] && { echo "  ✓ demo has >=5 tickets"; PASS=$((PASS+1)); } || { echo "  ✗ expected >=5 tickets"; FAIL=$((FAIL+1)); }

echo "== 6. /api/tickets without cookie (should 401) =="
RES=$(curl -s "$BASE/api/tickets" -w '%{http_code}' -o "$TMP/tickets_anon.json")
expect_eq "status 401" "401" "$RES"

echo "== 7. Login as technician =="
RES=$(curl -s -c "$TMP/tech.txt" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"tech@speakfix.ai","password":"tech1234"}' -w '%{http_code}' -o "$TMP/login_tech.json")
expect_eq "status 200" "200" "$RES"
expect_contains "tech email" "tech@speakfix.ai" "$(cat "$TMP/login_tech.json")"
curl -s -b "$TMP/tech.txt" "$BASE/api/auth/me" -o "$TMP/me_tech.json"
expect_contains "tech name" "Thabo Nkosi" "$(cat "$TMP/me_tech.json")"
expect_contains "role TECHNICIAN via /me" '"role":"TECHNICIAN"' "$(cat "$TMP/me_tech.json")"

echo "== 8. Login as admin =="
RES=$(curl -s -c "$TMP/admin.txt" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@speakfix.ai","password":"admin1234"}' -w '%{http_code}' -o "$TMP/login_admin.json")
expect_eq "status 200" "200" "$RES"

echo "== 9. /api/insights requires staff (USER should 403) =="
RES=$(curl -s -b "$TMP/demo.txt" "$BASE/api/insights" -w '%{http_code}' -o "$TMP/insights_demo.json")
expect_eq "status 403 (or 401)" "403" "$RES"

echo "== 10. /api/insights with admin =="
RES=$(curl -s -b "$TMP/admin.txt" "$BASE/api/insights" -w '%{http_code}' -o "$TMP/insights_admin.json")
expect_eq "status 200" "200" "$RES"

echo "== 11. Signup new user (random email) =="
NEW_EMAIL="newuser-$(date +%s)@test.com"
RES=$(curl -s -c "$TMP/new.txt" -X POST "$BASE/api/auth/signup" -H "Content-Type: application/json" -d "{\"name\":\"Test User\",\"email\":\"$NEW_EMAIL\",\"password\":\"newpass123\",\"preferredLanguage\":\"English\"}" -w '%{http_code}' -o "$TMP/signup_new.json")
expect_eq "status 201" "201" "$RES"
expect_contains "user email" "$NEW_EMAIL" "$(cat "$TMP/signup_new.json")"

echo "== 12. New user has 0 tickets (isolation) =="
RES=$(curl -s -b "$TMP/new.txt" "$BASE/api/tickets" -w '%{http_code}' -o "$TMP/tickets_new.json")
NEW_COUNT=$(python3 -c "import json; print(len(json.load(open('$TMP/tickets_new.json'))['tickets']))")
expect_eq "new user has 0 tickets" "0" "$NEW_COUNT"

echo "== 13. New user tries to access demo's ticket (should 404) =="
DEMO_TICKET_ID=$(python3 -c "import json; print(json.load(open('$TMP/tickets_demo.json'))['tickets'][0]['id'])")
RES=$(curl -s -b "$TMP/new.txt" "$BASE/api/tickets/$DEMO_TICKET_ID" -w '%{http_code}' -o "$TMP/cross.json")
expect_eq "status 404 (cross-user isolation)" "404" "$RES"

echo "== 14. Forgot password (existing email) =="
RES=$(curl -s -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" -d "{\"email\":\"demo@speakfix.ai\"}" -w '%{http_code}' -o "$TMP/forgot.json")
expect_eq "status 200" "200" "$RES"
expect_contains "resetUrl returned" "resetUrl" "$(cat "$TMP/forgot.json")"
expect_contains "token in resetUrl" "?token=" "$(cat "$TMP/forgot.json")"

echo "== 15. Forgot password (nonexistent email — should still respond OK) =="
RES=$(curl -s -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"nonexistent@example.com"}' -w '%{http_code}' -o "$TMP/forgot_ne.json")
expect_eq "status 200 (no leak)" "200" "$RES"
expect_contains "resetUrl is null (no leak)" '"resetUrl":null' "$(cat "$TMP/forgot_ne.json")"

echo "== 16. Reset password =="
TOKEN=$(python3 -c "import json, urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlparse(json.load(open('$TMP/forgot.json'))['resetUrl']).query)['token'][0])")
echo "    token: ${TOKEN:0:24}…"
RES=$(curl -s -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN\",\"password\":\"newdemo1234\"}" -w '%{http_code}' -o "$TMP/reset.json")
expect_eq "status 200" "200" "$RES"
expect_contains "success message" "success" "$(cat "$TMP/reset.json")"

echo "== 17. Old password no longer works =="
RES=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"demo1234"}' -w '%{http_code}' -o "$TMP/old_pw.json")
expect_eq "status 401 (old pw rejected)" "401" "$RES"

echo "== 18. New password works =="
RES=$(curl -s -c "$TMP/demo2.txt" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"newdemo1234"}' -w '%{http_code}' -o "$TMP/new_pw.json")
expect_eq "status 200 (new pw works)" "200" "$RES"

echo "== 19. Logout =="
RES=$(curl -s -b "$TMP/demo2.txt" -c "$TMP/demo2_logged_out.txt" -X POST "$BASE/api/auth/logout" -w '%{http_code}' -o "$TMP/logout.json")
expect_eq "status 200" "200" "$RES"
expect_contains "success" "true" "$(cat "$TMP/logout.json")"

echo "== 20. /api/auth/me after logout (should 401) =="
RES=$(curl -s -b "$TMP/demo2_logged_out.txt" "$BASE/api/auth/me" -w '%{http_code}' -o "$TMP/me_after_logout.json")
expect_eq "status 401" "401" "$RES"

# Reset demo password back (for future runs)
echo "== 21. Reset demo password back to demo1234 (for repeatability) =="
RES=$(curl -s -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai"}' -w '%{http_code}' -o "$TMP/forgot2.json")
TOKEN2=$(python3 -c "import json, urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlparse(json.load(open('$TMP/forgot2.json'))['resetUrl']).query)['token'][0])")
curl -s -X POST "$BASE/api/auth/reset-password" -H "Content-Type: application/json" -d "{\"token\":\"$TOKEN2\",\"password\":\"demo1234\"}" -o /dev/null
RES=$(curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"demo1234"}' -w '%{http_code}' -o "$TMP/sanity.json")
expect_eq "demo password restored" "200" "$RES"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
