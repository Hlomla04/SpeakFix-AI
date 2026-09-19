#!/bin/bash
# SpeakFix AI auth + ticket isolation E2E API test suite
set -u
BASE="http://localhost:3000"
JAR1="/tmp/user1-cookies.txt"
JAR2="/tmp/user2-cookies.txt"
rm -f "$JAR1" "$JAR2"
PASS=0; FAIL=0

check() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "  ✓ $1"; PASS=$((PASS+1));
  else echo "  ✗ $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi
}

echo "=== 1. Login: demo account (correct password) ==="
code=$(curl -s -o /tmp/out1.json -w "%{http_code}" -c "$JAR1" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"demo1234"}')
check "login demo 200" "200" "$code"

echo "=== 2. Login: wrong password → 401 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"demo@speakfix.ai","password":"wrongpass"}')
check "wrong password 401" "401" "$code"

echo "=== 3. GET /api/tickets unauthenticated → 401 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/tickets")
check "unauth tickets 401" "401" "$code"

echo "=== 4. Demo user sees their 10 seeded tickets ==="
n=$(curl -s -b "$JAR1" "$BASE/api/tickets" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['tickets']))")
check "demo ticket count == 10" "10" "$n"

echo "=== 5. Signup: brand-new user Thabo ==="
code=$(curl -s -o /tmp/out2.json -w "%{http_code}" -c "$JAR2" -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Thabo Mokoena","email":"thabo@example.com","password":"thabo12345","preferredLanguage":"isiZulu"}')
check "signup thabo 201" "201" "$code"

echo "=== 6. Signup: duplicate email → 409 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"name":"Thabo Again","email":"thabo@example.com","password":"whatever123"}')
check "duplicate email 409" "409" "$code"

echo "=== 7. ISOLATION: new user sees ZERO tickets (not demo's 10) ==="
n=$(curl -s -b "$JAR2" "$BASE/api/tickets" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['tickets']))")
check "thabo ticket count == 0" "0" "$n"

echo "=== 8. New user creates a ticket via API (as the voice agent does) ==="
code=$(curl -s -o /tmp/out3.json -w "%{http_code}" -b "$JAR2" -X POST "$BASE/api/tickets" \
  -H "Content-Type: application/json" \
  -d '{"description":"The heater in Lab 3 is making a loud buzzing noise","location":"Lab 3","category":"HVAC","priority":"MEDIUM","title":"Heater buzzing in Lab 3"}')
check "thabo create ticket 201" "201" "$code"
requester=$(python3 -c "import json;print(json.load(open('/tmp/out3.json'))['ticket']['requesterName'])")
check "requesterName auto-filled from account" "Thabo Mokoena" "$requester"
ticket_id=$(python3 -c "import json;print(json.load(open('/tmp/out3.json'))['ticket']['id'])")

echo "=== 9. ISOLATION: thabo now sees exactly 1; demo still sees 10 ==="
n=$(curl -s -b "$JAR2" "$BASE/api/tickets" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['tickets']))")
check "thabo ticket count == 1" "1" "$n"
n=$(curl -s -b "$JAR1" "$BASE/api/tickets" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['tickets']))")
check "demo ticket count still == 10" "10" "$n"

echo "=== 10. ISOLATION: demo cannot PATCH/DELETE thabo's ticket → 404 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR1" -X PATCH "$BASE/api/tickets/$ticket_id" \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS"}')
check "demo patch thabo ticket 404" "404" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR1" -X DELETE "$BASE/api/tickets/$ticket_id")
check "demo delete thabo ticket 404" "404" "$code"

echo "=== 11. Owner CAN patch own ticket → 200 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR2" -X PATCH "$BASE/api/tickets/$ticket_id" \
  -H "Content-Type: application/json" -d '{"status":"IN_PROGRESS"}')
check "thabo patch own ticket 200" "200" "$code"

echo "=== 12. Agent endpoint: unauthenticated → 401 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/agent" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"the tap is leaking in room 5"}]}')
check "unauth agent 401" "401" "$code"

echo "=== 13. Forgot password: generates reset URL ==="
curl -s -X POST "$BASE/api/auth/forgot-password" -H "Content-Type: application/json" \
  -d '{"email":"thabo@example.com"}' -o /tmp/forgot.json
reset_url=$(python3 -c "import json;print(json.load(open('/tmp/forgot.json')).get('resetUrl') or '')")
if [ -n "$reset_url" ]; then echo "  ✓ reset URL generated"; PASS=$((PASS+1)); else echo "  ✗ no reset URL"; FAIL=$((FAIL+1)); fi

echo "=== 14. Reset password with token → 200; old sessions invalidated ==="
token="${reset_url##*token=}"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/reset-password" \
  -H "Content-Type: application/json" -d "{\"token\":\"$token\",\"password\":\"newpass12345\"}")
check "reset password 200" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -b "$JAR2" "$BASE/api/auth/me")
check "old session invalidated 401" "401" "$code"

echo "=== 15. Token is single-use: second attempt → 400 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/reset-password" \
  -H "Content-Type: application/json" -d "{\"token\":\"$token\",\"password\":\"another12345\"}")
check "token reuse 400" "400" "$code"

echo "=== 16. Login with NEW password works; old password rejected ==="
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"thabo@example.com","password":"newpass12345"}')
check "login with new password 200" "200" "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" -d '{"email":"thabo@example.com","password":"thabo12345"}')
check "old password rejected 401" "401" "$code"

echo ""
echo "================ RESULTS: $PASS passed, $FAIL failed ================"
[ "$FAIL" -eq 0 ]
