#!/usr/bin/env bash
# Sobe Postgres/MinIO + API + Vite (deixe esta janela aberta).
set -euo pipefail
export PATH="${HOME}/.asdf/shims:${HOME}/.asdf/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:${PATH}"
if [[ -f "${HOME}/.asdf/asdf.sh" ]]; then
  # shellcheck disable=SC1091
  source "${HOME}/.asdf/asdf.sh"
fi

REPO="${CONCORD_REPO:-/mnt/wsl/PHYSICALDRIVE2/projects/clone-discord}"
cd "$REPO"

PNPM=(node tools/node_modules/pnpm/bin/pnpm.cjs)

echo "=== 1) Docker (Postgres/MinIO) ==="
unset DOCKER_HOST || true
if ! docker info >/dev/null 2>&1; then
  echo "Docker nao esta acessivel. Abra o Docker Desktop e tente de novo."
  echo "Pressione Enter para fechar."
  read -r
  exit 1
fi
docker compose -f infra/docker/docker-compose.yml up -d

echo "Aguardando Postgres…"
for i in $(seq 1 30); do
  if docker compose -f infra/docker/docker-compose.yml exec -T postgres pg_isready -U concord >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "=== 2) Prisma migrate ==="
(cd apps/api && "${PNPM[@]}" prisma:migrate) || true

echo "=== 3) API + Vite ==="
echo "API:  http://127.0.0.1:3000"
echo "Vite: http://127.0.0.1:5173"
echo ""
"${PNPM[@]}" -r --parallel --filter @concord/api --filter @concord/desktop dev:web &
API_VITE_PID=$!

# Tambem sobe a API (dev:web so sobe vite no desktop package)
"${PNPM[@]}" --filter @concord/api dev &
API_PID=$!

cleanup() {
  kill $API_PID $API_VITE_PID 2>/dev/null || true
}
trap cleanup EXIT

wait
