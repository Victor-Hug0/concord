/**
 * Auto-update do Concord (só em builds empacotadas).
 *
 * Feed:
 * - UPDATE_FEED_URL → provider generic (S3, R2, static host, etc.)
 * - senão → GitHub Releases (provider github), se repository estiver configurado
 */
const { ipcMain, app } = require('electron');

/** @type {import('electron').BrowserWindow | null} */
let targetWindow = null;
let started = false;
/** @type {import('electron-updater').AppUpdater | null} */
let autoUpdaterRef = null;

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

function resolveFeed() {
  const generic = process.env.UPDATE_FEED_URL || process.env.CONCORD_UPDATE_URL;
  if (generic) {
    return { provider: 'generic', url: generic.replace(/\/$/, '') };
  }
  return null;
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
  const feed = resolveFeed();
  if (feed) {
    autoUpdater.setFeedURL(feed);
    console.log('[updater] feed generic:', feed.url);
  } else {
    console.log('[updater] feed: GitHub Releases (package.json / electron-builder publish)');
  }

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
  autoUpdater.on('update-not-available', (info) => {
    send('not-available', { version: info.version });
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
    console.error('[updater]', err);
    send('error', { message: err?.message || String(err) });
  });

  const delayMs = Number(process.env.UPDATE_CHECK_DELAY_MS || 8_000);
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[updater] check failed', err?.message || err);
      send('error', { message: err?.message || String(err) });
    });
  }, delayMs);
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
