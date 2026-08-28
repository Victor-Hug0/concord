#!/bin/sh
set -e

echo "[concord-api] prisma migrate deploy..."
pnpm exec prisma migrate deploy

if [ "${RUN_SEED:-0}" = "1" ]; then
  echo "[concord-api] running seed..."
  pnpm exec tsx prisma/seed.ts
fi

echo "[concord-api] starting..."
exec node dist/src/main.js
