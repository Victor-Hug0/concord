#!/usr/bin/env bash
# Sobe so a API (requer Postgres ja no ar).
set -euo pipefail
export PATH="${HOME}/.asdf/shims:${HOME}/.asdf/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:${PATH}"
[[ -f "${HOME}/.asdf/asdf.sh" ]] && source "${HOME}/.asdf/asdf.sh"

REPO="${CONCORD_REPO:-/mnt/wsl/PHYSICALDRIVE2/projects/clone-discord}"
cd "$REPO"

echo "=== Concord API $(date -Iseconds) ==="
node tools/node_modules/pnpm/bin/pnpm.cjs --filter @concord/api prisma:migrate || true
exec node tools/node_modules/pnpm/bin/pnpm.cjs --filter @concord/api dev
