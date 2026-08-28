# Sobe Vite (WSL visivel) + Electron Windows.
# Nao use pnpm direto em caminho UNC (\\wsl$\...).
$ErrorActionPreference = 'Continue'

$Distro = 'Ubuntu'
$RepoWsl = '/mnt/wsl/PHYSICALDRIVE2/projects/clone-discord'
$ViteSh = $RepoWsl + '/scripts/run-vite-wsl.sh'
# Aspas simples: em "\\wsl$\Ubuntu\..." o PowerShell expandiria $Ubuntu
$ScriptUnc = '\\wsl$\Ubuntu\mnt\wsl\PHYSICALDRIVE2\projects\clone-discord\apps\desktop\scripts\dev-win-electron.js'

function Test-ViteFromWindows {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173' -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-ViteFromWsl {
  $out = & wsl.exe -d $Distro -e bash -lc "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:5173" 2>$null
  return ($out -match '^[23]')
}

function Test-ApiFromWindows {
  try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/health' -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -lt 500)
  } catch {
    return $false
  }
}

function Test-ApiFromWsl {
  $out = & wsl.exe -d $Distro -e bash -lc "curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/health" 2>$null
  return ($out -match '^[23]')
}

Write-Host ''
Write-Host 'Concord desktop (Windows Electron + stack no WSL)' -ForegroundColor Green
Write-Host ''

& wsl.exe -d $Distro -e chmod +x $ViteSh 2>$null | Out-Null
& wsl.exe -d $Distro -e chmod +x ($RepoWsl + '/scripts/run-api-wsl.sh') 2>$null | Out-Null

Write-Host '0) Docker + Postgres (WSL)...' -ForegroundColor Cyan
& wsl.exe -d $Distro -e bash -lc "cd '$RepoWsl' && unset DOCKER_HOST && docker compose -f infra/docker/docker-compose.yml up -d"
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker falhou. Abra o Docker Desktop e rode de novo.' -ForegroundColor Red
  exit 1
}

Write-Host '1) API no WSL (janela separada)...' -ForegroundColor Cyan
Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $Distro, '-e', 'bash', ($RepoWsl + '/scripts/run-api-wsl.sh'))

Write-Host '2) Abrindo janela WSL com Vite (deixe aberta)...' -ForegroundColor Cyan
Start-Process -FilePath 'wsl.exe' -ArgumentList @('-d', $Distro, '-e', 'bash', $ViteSh)

Write-Host '3) Aguardando API :3000 e Vite :5173 ...' -ForegroundColor Cyan

$viteOk = $false
$apiOk = $false
for ($i = 1; $i -le 90; $i++) {
  if (-not $viteOk) { $viteOk = (Test-ViteFromWindows) -or (Test-ViteFromWsl) }
  if (-not $apiOk) { $apiOk = (Test-ApiFromWindows) -or (Test-ApiFromWsl) }
  if ($viteOk -and $apiOk) {
    Write-Host ("   OK em {0}s (Vite+API)" -f $i) -ForegroundColor Green
    break
  }
  if (($i % 5) -eq 0) {
    Write-Host ("   ainda aguardando... {0}s  Vite={1} API={2}" -f $i, $viteOk, $apiOk) -ForegroundColor DarkYellow
  }
  Start-Sleep -Seconds 1
}

if (-not $viteOk -or -not $apiOk) {
  Write-Host ''
  Write-Host 'Stack incompleta.' -ForegroundColor Red
  Write-Host ("  Vite: {0}   API: {1}" -f $viteOk, $apiOk) -ForegroundColor Red
  Write-Host 'Olhe as janelas Ubuntu/WSL (Docker Desktop ligado?).' -ForegroundColor Yellow
  Write-Host 'Manual no WSL:' -ForegroundColor Cyan
  Write-Host ('  cd ' + $RepoWsl)
  Write-Host '  docker compose -f infra/docker/docker-compose.yml up -d'
  Write-Host '  node tools/node_modules/pnpm/bin/pnpm.cjs --filter @concord/api dev'
  Write-Host '  node tools/node_modules/pnpm/bin/pnpm.cjs --filter @concord/desktop dev:web'
  exit 1
}

Write-Host '4) Electron Windows...' -ForegroundColor Cyan

# Prefere localhost (secure context / mediaDevices). IP do WSL so se preciso.
$winLocal = Test-ViteFromWindows
if ($winLocal) {
  Remove-Item Env:CONCORD_DEV_URL -ErrorAction SilentlyContinue
  Write-Host '   UI: http://127.0.0.1:5173 (localhost)' -ForegroundColor DarkGray
} else {
  $wslIpRaw = & wsl.exe -d $Distro -e hostname -I 2>$null
  if ($wslIpRaw) {
    $wslIp = ($wslIpRaw.ToString().Trim() -split '\s+')[0]
    if ($wslIp -match '^\d+\.\d+\.\d+\.\d+$') {
      $env:CONCORD_DEV_URL = 'http://' + $wslIp + ':5173'
      Write-Host ('   UI: ' + $env:CONCORD_DEV_URL + ' (IP WSL; Electron trata como origem segura)') -ForegroundColor DarkGray
    }
  }
}

node $ScriptUnc
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
