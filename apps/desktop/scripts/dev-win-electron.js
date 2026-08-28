/**
 * Sobe o Electron nativo Windows (captura de tela real).
 * Se o Vite não estiver no ar, tenta iniciar via `wsl.exe` (não use pnpm em caminho UNC).
 */
const { spawn, execFileSync, execSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');

const ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(ROOT, '..', '..');
const ZIP_HOST = 'https://github.com/electron/electron/releases/download';

/** Resolve versão sem seguir symlink pnpm (Windows + \\\\wsl$\\ não resolve). */
function resolveElectronVersion() {
  const pnpmDir = path.join(REPO_ROOT, 'node_modules', '.pnpm');
  try {
    const entry = fs
      .readdirSync(pnpmDir)
      .find((name) => /^electron@\d+\.\d+\.\d+/.test(name));
    if (entry) {
      const ver = entry.match(/^electron@(\d+\.\d+\.\d+)/);
      if (ver) return ver[1];
    }
  } catch {
    /* ignore */
  }

  try {
    const pkgPath = path.join(ROOT, 'node_modules', 'electron', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw).version;
  } catch {
    /* symlink quebrado no UNC */
  }

  const range =
    JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies
      ?.electron || '33.4.11';
  const m = String(range).match(/\d+\.\d+\.\d+/);
  return m ? m[0] : '33.4.11';
}

const ELECTRON_VER = resolveElectronVersion();
const ZIP_URL = `${ZIP_HOST}/v${ELECTRON_VER}/electron-v${ELECTRON_VER}-win32-x64.zip`;

function isWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

function windowsUsername() {
  if (process.platform === 'win32') {
    return process.env.USERNAME || process.env.USER || '';
  }
  try {
    return execFileSync('cmd.exe', ['/c', 'echo %USERNAME%'], { encoding: 'utf8' })
      .replace(/\r?\n/g, '')
      .trim();
  } catch {
    return '';
  }
}

function toWindowsPath(p) {
  if (process.platform === 'win32') return p;
  try {
    return execFileSync('wslpath', ['-w', p], { encoding: 'utf8' }).trim();
  } catch {
    return p;
  }
}

/** \\wsl$\Ubuntu\mnt\foo\bar → /mnt/foo/bar */
function uncToWslPath(p) {
  const norm = String(p).replace(/\//g, '\\');
  const m = norm.match(/^\\\\wsl\$\\[^\\]+\\(.*)$/i);
  if (!m) return null;
  return '/' + m[1].replace(/\\/g, '/');
}

function repoRootInWsl() {
  if (isWsl()) return REPO_ROOT.replace(/\\/g, '/');
  const fromUnc = uncToWslPath(REPO_ROOT);
  if (fromUnc) return fromUnc;
  // fallback conhecido deste monorepo
  return '/mnt/wsl/PHYSICALDRIVE2/projects/clone-discord';
}

function cacheDir() {
  const user = windowsUsername();
  if (!user) {
    throw new Error('Não foi possível obter o usuário Windows.');
  }
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(local, 'ConcordDev', `electron-v${ELECTRON_VER}-win32-x64`);
  }
  return `/mnt/c/Users/${user}/AppData/Local/ConcordDev/electron-v${ELECTRON_VER}-win32-x64`;
}

function followDownload(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirects > 8) {
            reject(new Error('Muitos redirects no download do Electron'));
            return;
          }
          res.resume();
          resolve(followDownload(res.headers.location, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download Electron falhou: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function downloadFile(url, dest) {
  const res = await followDownload(url);
  await pipeline(res, fs.createWriteStream(dest));
}

function expandZip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const zipWin = process.platform === 'win32' ? zipPath : toWindowsPath(zipPath);
  const outWin = process.platform === 'win32' ? outDir : toWindowsPath(outDir);
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipWin.replace(/'/g, "''")}' -DestinationPath '${outWin.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    return;
  } catch {
    /* fallback */
  }
  if (process.platform !== 'win32') {
    execSync(`unzip -o "${zipPath}" -d "${outDir}"`, { stdio: 'inherit' });
    return;
  }
  throw new Error('Falha ao extrair o zip do Electron (Expand-Archive).');
}

function checkVite() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:5173', (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode < 500));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForVite(timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkVite()) return true;
    await sleep(500);
  }
  return false;
}

/** Inicia Vite dentro do Ubuntu (evita pnpm em caminho UNC no Windows). */
function startViteInWsl() {
  const sh = `${repoRootInWsl()}/scripts/run-vite-wsl.sh`;
  console.log('Iniciando Vite via WSL…');
  console.log(`  bash ${sh}`);

  if (process.platform === 'win32') {
    return spawn('wsl.exe', ['-d', 'Ubuntu', '-e', 'bash', sh], {
      stdio: 'ignore',
      detached: true,
      windowsHide: false,
    });
  }

  return spawn('bash', [sh], {
    stdio: 'ignore',
    detached: true,
  });
}

async function ensureVite() {
  if (await checkVite()) return;

  if (process.platform === 'win32') {
    // Preferir IP da distro (localhost relay do WSL às vezes falha)
    try {
      const ip = execFileSync('wsl.exe', ['-d', 'Ubuntu', '-e', 'hostname', '-I'], {
        encoding: 'utf8',
      })
        .trim()
        .split(/\s+/)[0];
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        process.env.CONCORD_DEV_URL = `http://${ip}:5173`;
      }
    } catch {
      /* ignore */
    }
  }

  const child = startViteInWsl();
  child.unref();

  console.log('Aguardando Vite…');
  if (await waitForVite()) return;

  // Tenta pelo IP WSL
  const url = process.env.CONCORD_DEV_URL;
  if (url) {
    console.log(`Testando ${url}…`);
    for (let i = 0; i < 30; i++) {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(Boolean(res.statusCode && res.statusCode < 500));
        });
        req.on('error', () => resolve(false));
        req.setTimeout(2000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return;
      await sleep(500);
    }
  }

  console.error('');
  console.error('Vite não subiu a tempo.');
  console.error('Use o script PowerShell (abre janela WSL visível):');
  console.error(
    '  powershell -ExecutionPolicy Bypass -File "\\\\wsl$\\Ubuntu\\mnt\\wsl\\PHYSICALDRIVE2\\projects\\clone-discord\\scripts\\start-desktop-win.ps1"',
  );
  process.exit(1);
}

async function ensureElectron() {
  const dir = cacheDir();
  const exe = path.join(dir, 'electron.exe');
  if (fs.existsSync(exe)) return exe;

  console.log(`Baixando Electron Windows v${ELECTRON_VER}…`);
  fs.mkdirSync(dir, { recursive: true });
  const tmpZip = path.join(os.tmpdir(), `electron-v${ELECTRON_VER}-win32-x64.zip`);
  await downloadFile(ZIP_URL, tmpZip);
  expandZip(tmpZip, dir);
  try {
    fs.unlinkSync(tmpZip);
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(exe)) {
    throw new Error(`electron.exe não encontrado em ${dir}`);
  }
  return exe;
}

function isUnc(p) {
  return /^\\\\/.test(p) || /^\/\/[^/]/.test(p);
}

async function main() {
  if (process.platform !== 'win32' && !isWsl()) {
    console.error('dev:win é para Windows ou WSL. Neste Linux nativo use o Electron local (pnpm dev).');
    process.exit(1);
  }

  await ensureVite();

  const exe = await ensureElectron();
  const appPath = process.platform === 'win32' ? ROOT : toWindowsPath(ROOT);
  const exePath = exe;

  console.log('Abrindo Electron Windows (captura nativa)…');
  console.log(`App: ${appPath}`);
  console.log(`Bin: ${exePath}`);

  const child = spawn(exePath, [appPath], {
    stdio: 'inherit',
    windowsHide: false,
    shell: false,
    env: { ...process.env },
    cwd: isUnc(String(appPath))
      ? process.env.TEMP || process.env.TMP || os.tmpdir()
      : process.platform === 'win32'
        ? ROOT
        : os.tmpdir(),
  });

  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
