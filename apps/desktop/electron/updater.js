/**
 * Auto-update do Concord (só em builds empacotadas).
 *
 * Feed embutido em resources/app-update.yml (scripts/after-pack.js):
 *   https://concord.televei.dev/updates  → API proxy das GitHub Releases
 */
const { app, ipcMain } = require('electron');

/** @type {import('electron').BrowserWindow | null} */
let targetWindow = null;
let started = false;
let checkTimer = null;
/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdaterRef = null;

const CHECK_INTERVAL_MS = Number(process.env.UPDATE_CHECK_INTERVAL_MS || 30 * 60_000);
const INITIAL_DELAY_MS = Number(process.env.UPDATE_CHECK_DELAY_MS || 8_000);

function getAutoUpdater() {
  if (!autoUpdaterRef) {
    autoUpdaterRef = require('electron-updater').autoUpdater;
  }
  return autoUpdaterRef;
}

function send(type, payload = {}) {
  if (targetWindow && !targetWindow.isDestroyed()) {
    targetWindow.webContents.send('updater:event', { type, ...payload });
  }
}

function isBenignUpdateError(message) {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('404') ||
    m.includes('403') ||
    m.includes('releases.atom') ||
    m.includes('authentication token') ||
    m.includes('net::') ||
    m.includes('enotfound')
  );
}

function scheduleChecks() {
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => {
    void runUpdateCheck(false);
  }, CHECK_INTERVAL_MS);
}

async function runUpdateCheck(notifyErrors) {
  if (!app.isPackaged) return;
  try {
    await getAutoUpdater().checkForUpdates();
  } catch (err) {
    const message = err?.message || String(err);
    console.warn('[updater] check failed', message);
    if (notifyErrors && !isBenignUpdateError(message)) {
      send('error', { message: 'Não foi possível verificar atualizações.' });
    }
  }
}

function setupAutoUpdater(win) {
  targetWindow = win;
  if (started) return;
  if (!app.isPackaged) {
    send('idle', { reason: 'dev' });
    return;
  }
  started = true;

  const autoUpdater = getAutoUpdater();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => send('checking'));
  autoUpdater.on('update-available', (info) => {
    send('available', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });
  autoUpdater.on('update-not-available', () => {
    send('not-available');
  });
  autoUpdater.on('download-progress', (p) => {
    send('progress', {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    send('downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes ?? null,
    });
  });
  autoUpdater.on('error', (err) => {
    const message = err?.message || String(err);
    console.error('[updater]', message);
    if (!isBenignUpdateError(message)) {
      send('error', { message: 'Não foi possível baixar a atualização.' });
    }
  });

  setTimeout(() => {
    void runUpdateCheck(false);
    scheduleChecks();
  }, INITIAL_DELAY_MS);
}

function registerUpdaterIpc() {
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    try {
      const result = await getAutoUpdater().checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version ?? null };
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
  });

  ipcMain.handle('updater:install', () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    setImmediate(() => getAutoUpdater().quitAndInstall(false, true));
    return { ok: true };
  });

  ipcMain.handle('updater:get-version', () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
  }));
}

module.exports = { setupAutoUpdater, registerUpdaterIpc };
