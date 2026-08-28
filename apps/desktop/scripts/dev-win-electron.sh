#!/usr/bin/env bash
# Roda o Electron nativo Windows (captura de tela real) apontando para este projeto.
# Uso (no WSL): em um terminal `pnpm --filter @concord/desktop dev:web`
#               em outro     `pnpm --filter @concord/desktop dev:win`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ELECTRON_VER="$(node -p "require('$ROOT/node_modules/electron/package.json').version")"

WIN_USER="$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r')"
if [[ -z "$WIN_USER" ]]; then
  echo "Não foi possível obter o usuário Windows (cmd.exe)." >&2
  exit 1
fi

CACHE_DIR="/mnt/c/Users/${WIN_USER}/AppData/Local/ConcordDev/electron-v${ELECTRON_VER}-win32-x64"
EXE="${CACHE_DIR}/electron.exe"
ZIP_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-win32-x64.zip"

if [[ ! -f "$EXE" ]]; then
  echo "Baixando Electron Windows v${ELECTRON_VER}…"
  mkdir -p "$CACHE_DIR"
  TMP_ZIP="$(mktemp /tmp/electron-win-XXXXXX.zip)"
  curl -fsSL "$ZIP_URL" -o "$TMP_ZIP"
  ZIP_WIN="$(wslpath -w "$TMP_ZIP")"
  OUT_WIN="$(wslpath -w "$CACHE_DIR")"
  if ! powershell.exe -NoProfile -Command "Expand-Archive -LiteralPath '$ZIP_WIN' -DestinationPath '$OUT_WIN' -Force"; then
    unzip -o "$TMP_ZIP" -d "$CACHE_DIR"
  fi
  rm -f "$TMP_ZIP"
fi

if [[ ! -f "$EXE" ]]; then
  echo "Falha: electron.exe não encontrado em $CACHE_DIR" >&2
  exit 1
fi

if ! curl -sf "http://127.0.0.1:5173" >/dev/null 2>&1; then
  echo "Vite não está em http://127.0.0.1:5173"
  echo "Em outro terminal: pnpm --filter @concord/desktop dev:web"
  exit 1
fi

PROJ_WIN="$(wslpath -w "$ROOT")"
EXE_WIN="$(wslpath -w "$EXE")"

echo "Abrindo Electron Windows (captura nativa)…"
echo "Projeto: $PROJ_WIN"
cmd.exe /c "cd /d \"$PROJ_WIN\" && \"$EXE_WIN\" ."
