#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────────
# Push SpeakFix AI to GitHub — run this on your own machine.
# ───────────────────────────────────────────────────────────────────
# Prerequisites:
#   1. Unzip speakfix-ai-deploy.zip
#   2. cd into the unzipped folder (the one containing package.json)
#   3. Run: bash push-to-github.sh
#
# You'll be prompted for your GitHub username + Personal Access Token
# the first time you push. Get a free PAT at:
#   https://github.com/settings/tokens  →  Generate new token (classic)
#   →  Tick "repo" scope  →  Generate  →  Copy the token
#
# Use your GitHub username as the username, and the PAT as the password.
# ───────────────────────────────────────────────────────────────────

set -e

REPO_URL="https://github.com/Hlomla04/SpeakFix-AI.git"

echo "› Initialising git repo…"
[ -d .git ] || git init -b main
git config user.email "deployer@speakfix.ai" 2>/dev/null || true
git config user.name "SpeakFix Deploy" 2>/dev/null || true

echo "› Staging files (secrets + node_modules + build are gitignored)…"
git add .

echo "› Committing…"
if git diff --cached --quiet; then
  echo "  (nothing new to commit — already up to date)"
else
  git commit -m "SpeakFix AI — voice-first maintenance reporting with verified resolution workflow" > /dev/null
fi

echo "› Adding remote origin…"
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo "› Pushing to GitHub…"
echo ""
echo "  If prompted for credentials:"
echo "    Username: your GitHub username (Hlomla04)"
echo "    Password: your GitHub Personal Access Token (not your account password)"
echo ""
git push -u origin main

echo ""
echo "✓ Done! Your code is at https://github.com/Hlomla04/SpeakFix-AI"
