#!/bin/sh
set -e
echo "→ Running prisma generate..."
npx prisma generate
echo "→ Running next build..."
npx next build