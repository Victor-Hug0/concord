#!/usr/bin/env bash
# Inicia o Vite do Concord (chamado pelo PowerShell via wsl.exe).
set -euo pipefail
LOG="${TMPDIR:-/tmp}/concord-vite.log"
exec > >(tee -a "$LOG") 2>&1

echo "=== Concord Vite $(date -Iseconds) ==="

# asdf / nvm / paths comuns (bash -lc do Windows às vezes não carrega shims)
export PATH="${HOME}/.asdf/shims:${HOME}/.asdf/bin:${HOME}/.local/bin:/usr/local/bin:/usr/bin:${PATH}"
if [[ -f "${HOME}/.asdf/asdf.sh" ]]; then
  # shellcheck disable=SC1091
  source "${HOME}/.asdf/asdf.sh"
fi

REPO="${CONCORD_REPO:-/mnt/wsl/PHYSICALDRIVE2/projects/clone-discord}"
cd "$REPO" || {
  echo "Falha: não achei o repo em $REPO"
  echo "Pressione Enter para fechar."
  read -r
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Falha: 'node' não encontrado no PATH."
  echo "PATH=$PATH"
  echo "Pressione Enter para fechar."
  read -r
  exit 1
fi

echo "node=$(command -v node) ($(node -v))"
echo "cwd=$(pwd)"

# Libera 5173 se ficou zumbi
if command -v fuser >/dev/null 2>&1; then
  fuser -k 5173/tcp 2>/dev/null || true
fi

echo "Subindo Vite…"
node tools/node_modules/pnpm/bin/pnpm.cjs --filter @concord/desktop dev:web
status=$?
echo "Vite encerrou com código $status"
echo "Pressione Enter para fechar."
read -r
exit "$status"
