# Concord — Electron Windows (captura de tela real)
#
# No PowerShell (preferível — evita bash/UNC do pnpm):
#   node "\\wsl$\Ubuntu\mnt\wsl\PHYSICALDRIVE2\projects\clone-discord\apps\desktop\scripts\dev-win-electron.js"
#
# Ou, com Vite já rodando:
#   cd \\wsl$\Ubuntu\mnt\wsl\PHYSICALDRIVE2\projects\clone-discord\apps\desktop
#   node .\scripts\dev-win-electron.js

$ErrorActionPreference = 'Stop'
$Script = Join-Path $PSScriptRoot 'dev-win-electron.js'
node $Script
