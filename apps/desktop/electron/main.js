const {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  desktopCapturer,
  systemPreferences,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { setupAutoUpdater, registerUpdaterIpc } = require('./updater');

const isDev = !app.isPackaged;
let mainWindow = null;

/** @type {Electron.DesktopCapturerSource[]} */
let cachedSources = [];
/** @type {{ id: string, name: string, audio?: boolean } | null} */
let pendingDisplaySource = null;

function resolveDevUrl() {
  return process.env.CONCORD_DEV_URL || 'http://127.0.0.1:5173';
}

// getDisplayMedia exige "secure context". http://IP-WSL:5173 não é;
// sem este switch, navigator.mediaDevices fica undefined no Electron Windows.
if (isDev) {
  const origins = new Set([
    'http://127.0.0.1:5173',
    'http://localhost:5173',
    resolveDevUrl(),
  ]);
  app.commandLine.appendSwitch(
    'unsafely-treat-insecure-origin-as-secure',
    [...origins].join(','),
  );
  app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
}

function detectWsl() {
  if (process.platform !== 'linux') return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(fs.readFileSync('/proc/version', 'utf8'));
  } catch {
    return false;
  }
}

const captureEnv = {
  platform: process.platform,
  wsl: detectWsl(),
  wayland: Boolean(process.env.WAYLAND_DISPLAY),
  /** Telas inteiras costumam vir pretas (só cursor) no WSL/WSLg e em alguns Wayland. */
  get screenCaptureUnreliable() {
    return this.wsl || (this.platform === 'linux' && this.wayland);
  },
};

/** Amostra o bitmap: thumbnails pretos (WSL) não passam como prévia válida. */
function thumbnailHasContent(img) {
  try {
    if (!img || img.isEmpty()) return false;
    const { width, height } = img.getSize();
    if (width < 4 || height < 4) return false;
    const buf = img.toBitmap();
    if (!buf || buf.length < 16) return false;
    let lumSum = 0;
    let samples = 0;
    // BGRA; amostra a cada ~32 pixels
    for (let i = 0; i + 2 < buf.length; i += 128) {
      lumSum += buf[i] + buf[i + 1] + buf[i + 2];
      samples += 1;
    }
    if (samples === 0) return false;
    const avg = lumSum / (samples * 3);
    return avg > 12;
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0f1419',
    title: 'Concord',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL(resolveDevUrl());
    // DevTools em janela separada pode confundir captura; abre só sob demanda (F12).
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer crashed:', details);
    // Recupera a UI em vez de ficar tela preta
    if (isDev) {
      mainWindow.loadURL(resolveDevUrl());
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    setupAutoUpdater(mainWindow);
  });
}

function serializeSource(source) {
  let thumbnail = '';
  let previewOk = false;
  const isScreen = source.id.startsWith('screen:');
  try {
    const img = source.thumbnail;
    if (img && !img.isEmpty()) {
      const size = img.getSize();
      if (size.width > 2 && size.height > 2) {
        previewOk = thumbnailHasContent(img);
        if (previewOk) {
          thumbnail = img.toDataURL({ scaleFactor: 1.0 });
        }
      }
    }
  } catch (err) {
    console.warn('thumbnail serialize failed', err);
  }

  // No WSL, telas quase nunca têm pixels reais — marca como inviável
  if (isScreen && captureEnv.screenCaptureUnreliable && !previewOk) {
    previewOk = false;
    thumbnail = '';
  }

  return {
    id: source.id,
    name: source.name,
    thumbnail: previewOk ? thumbnail : '',
    previewOk,
    type: isScreen ? 'screen' : 'window',
    captureRisky: isScreen && (!previewOk || captureEnv.screenCaptureUnreliable),
  };
}

app.whenReady().then(() => {
  registerUpdaterIpc();

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
      callback(true);
      return;
    }
    callback(false);
  });

  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    try {
      if (!pendingDisplaySource) {
        callback({});
        return;
      }
      const match =
        cachedSources.find((s) => s.id === pendingDisplaySource.id) ||
        cachedSources.find((s) => s.name === pendingDisplaySource.name);
      if (!match) {
        callback({});
        return;
      }
      callback({
        video: match,
        audio: pendingDisplaySource.audio === false ? undefined : 'loopback',
      });
    } catch (err) {
      console.error('display media handler error', err);
      callback({});
    }
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Re-bind updater target if window is recreated after crash reload
app.on('browser-window-created', (_e, win) => {
  if (app.isPackaged) {
    win.webContents.once('did-finish-load', () => setupAutoUpdater(win));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.setAsDefaultProtocolClient('concord');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = argv.find((a) => a.startsWith('concord://'));
    if (url && mainWindow) {
      mainWindow.webContents.send('oauth-callback', url);
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) mainWindow.webContents.send('oauth-callback', url);
});

ipcMain.handle('get-capture-env', () => ({
  platform: captureEnv.platform,
  wsl: captureEnv.wsl,
  wayland: captureEnv.wayland,
  screenCaptureUnreliable: captureEnv.screenCaptureUnreliable,
}));

ipcMain.handle('get-sources', async () => {
  cachedSources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false,
  });
  return cachedSources.map(serializeSource);
});

ipcMain.handle('set-display-source', (_e, source) => {
  pendingDisplaySource =
    source && source.id
      ? { id: source.id, name: source.name || '', audio: source.audio !== false }
      : null;
  return { ok: true };
});

ipcMain.handle('open-external', async (_e, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('get-media-access', async () => {
  if (process.platform === 'darwin') {
    return {
      microphone: systemPreferences.getMediaAccessStatus('microphone'),
      screen: systemPreferences.getMediaAccessStatus('screen'),
    };
  }
  return { microphone: 'granted', screen: 'granted' };
});
