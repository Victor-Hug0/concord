#!/usr/bin/env bash
# Setup local contra Docker Compose (Postgres + MinIO).
# Execute no seu terminal WSL (onde `docker ps` funciona):
#   bash scripts/setup-from-docker.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="$ROOT/tools/node_modules/.bin:$PATH"
PNPM=(node "$ROOT/tools/node_modules/pnpm/bin/pnpm.cjs")

echo "==> Docker Compose"
docker compose -f infra/docker/docker-compose.yml up -d
docker compose -f infra/docker/docker-compose.yml ps

echo "==> Aguardando Postgres"
for i in $(seq 1 30); do
  if docker compose -f infra/docker/docker-compose.yml exec -T postgres pg_isready -U concord -d concord >/dev/null 2>&1; then
    echo "Postgres pronto"
    break
  fi
  sleep 1
done

echo "==> Dependências / shared"
"${PNPM[@]}" install --ignore-scripts || "${PNPM[@]}" install
"${PNPM[@]}" --filter @concord/shared build

echo "==> Prisma migrate + seed"
"${PNPM[@]}" --filter @concord/api exec prisma generate
"${PNPM[@]}" --filter @concord/api exec prisma migrate deploy
"${PNPM[@]}" --filter @concord/api exec tsx prisma/seed.ts

echo "==> Pronto. Em dois terminais:"
echo "  ${PNPM[*]} --filter @concord/api dev"
echo "  ${PNPM[*]} --filter @concord/desktop dev"
