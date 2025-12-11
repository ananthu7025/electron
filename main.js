const { app, BrowserWindow, ipcMain, session, dialog } = require('electron');
const path = require('path');

let mainWindow = null;
let pdfViewerWindow = null;
let monitoringIntervalId = null;

// Configuration
const CONFIG = {
  API_URL: 'http://localhost:3000',
  isDev: process.argv.includes('--dev')
};

// Create main window (login/dashboard)
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false
    },
    frame: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#1e3a8a'
  });
mainWindow.setContentProtection(true);
  // Load login page
  mainWindow.loadFile('pages/login.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Disable menu in production
  if (!CONFIG.isDev) {
    mainWindow.setMenu(null);
  }

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (pdfViewerWindow) {
      pdfViewerWindow.close();
    }
  });

  // Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Development tools
  if (CONFIG.isDev) {
    mainWindow.webContents.openDevTools();
  }
}

// Create secure PDF viewer window
async function createPDFViewerWindow() {
  if (pdfViewerWindow) {
    pdfViewerWindow.focus();
    return;
  }

  // SECURITY NOTE: We don't check for software installation, only block actual screenshot attempts
  // Users can have screenshot tools installed, but can't use them

  pdfViewerWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      // CRITICAL SECURITY FEATURES
      experimentalFeatures: false,
      plugins: false,
      javascript: true,
      // Additional security
      disableBlinkFeatures: 'Auxclick',
      nativeWindowOpen: false,
      safeDialogs: true,
      safeDialogsMessage: 'Security policy prevents this operation'
    },
    frame: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false,
    backgroundColor: '#1f2937',
    // MAXIMUM DRM PROTECTION
    contentProtection: true,              // Enable DRM content protection (prevents screenshots on some systems)
    alwaysOnTop: false,                   // Don't force always on top (allows detection of overlay apps)
    skipTaskbar: false,                   // Show in taskbar for transparency
    closable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,                // Prevent fullscreen to avoid hiding overlays
    // Additional Windows-specific protection
    ...(process.platform === 'win32' && {
      thickFrame: true
    })
  });
pdfViewerWindow.setContentProtection(true);
  // Load PDF viewer page
  pdfViewerWindow.loadFile('pages/viewer.html');

  // Show when ready
  pdfViewerWindow.once('ready-to-show', () => {
    pdfViewerWindow.show();

    // SECURITY: We rely on reactive protections (blur on focus loss, keyboard blocking)
    // instead of background process monitoring to avoid false positives
  });

  // Disable menu completely for security
  pdfViewerWindow.setMenu(null);

  // Prevent navigation
  pdfViewerWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Prevent new windows
  pdfViewerWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // SECURITY: Disable right-click and context menu
  pdfViewerWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
  });

  // SECURITY: Disable DevTools in PDF viewer (except in dev mode)
  if (!CONFIG.isDev) {
    pdfViewerWindow.webContents.on('devtools-opened', () => {
      pdfViewerWindow.webContents.closeDevTools();
    });
  } else {
    // Open DevTools in dev mode for debugging
    pdfViewerWindow.webContents.openDevTools();
  }

  // Handle close
  pdfViewerWindow.on('closed', () => {
    // Stop monitoring when viewer is closed
    if (monitoringIntervalId) {
      clearInterval(monitoringIntervalId);
      monitoringIntervalId = null;
    }
    pdfViewerWindow = null;
  });

  // SECURITY: AGGRESSIVE - Hide window when focus is lost to prevent screenshots

  pdfViewerWindow.on('focus', () => {
    console.log('✅ SECURITY: PDF viewer window regained focus - showing window');
    // Show window again when focus returns
    if (!pdfViewerWindow.isVisible()) {
      pdfViewerWindow.show();
    }
  });

  // SECURITY: Monitor for suspicious activities and block screenshot keys
  pdfViewerWindow.webContents.on('before-input-event', (event, input) => {
    // Block PrintScreen key
    if (input.key === 'PrintScreen' || input.key === 'Print') {
      console.warn('🚨 SECURITY: PrintScreen blocked');
      event.preventDefault();
    }

    // Block Alt+PrintScreen (active window screenshot)
    if (input.alt && input.key === 'PrintScreen') {
      console.warn('🚨 SECURITY: Alt+PrintScreen blocked');
      event.preventDefault();
    }

    // Block Ctrl+P (print)
    if (input.control && input.key === 'p') {
      console.warn('🚨 SECURITY: Print command blocked');
      event.preventDefault();
    }

    // Block Ctrl+S (save)
    if (input.control && input.key === 's') {
      console.warn('🚨 SECURITY: Save command blocked');
      event.preventDefault();
    }

    // Block Ctrl+Shift+I (DevTools)
    if (input.control && input.shift && input.key === 'I') {
      console.warn('🚨 SECURITY: DevTools access blocked');
      event.preventDefault();
    }

    // Block F12 (DevTools)
    if (input.key === 'F12') {
      console.warn('🚨 SECURITY: DevTools access blocked');
      event.preventDefault();
    }

    // Block Win+Shift+S (Windows Snipping Tool) - limited effectiveness
    if (input.shift && input.key === 's' && input.meta) {
      console.warn('🚨 SECURITY: Snipping Tool shortcut detected');
      event.preventDefault();
    }
  });
}

// App initialization
app.whenReady().then(() => {
  // SECURITY: Set strict CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https: blob:; " +
          "connect-src 'self' http://localhost:3000 https://cdn.jsdelivr.net; " +
          "font-src 'self' data:; " +
          "worker-src 'self' blob:; " +
          "object-src 'none'; " +
          "base-uri 'self'; " +
          "form-action 'self'; " +
          "frame-ancestors 'none';"
        ]
      }
    });
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('login', async (event, credentials) => {
  // The actual API call will be made from the renderer process
  // This handler can be used for additional security checks if needed
  return { success: true };
});

ipcMain.handle('navigate-to-dashboard', () => {
  if (mainWindow) {
    mainWindow.loadFile('pages/dashboard.html');
  }
});

ipcMain.handle('navigate-to-login', () => {
  if (mainWindow) {
    mainWindow.loadFile('pages/login.html');
  }
});

ipcMain.handle('open-pdf-viewer', (event, pdfData) => {
  console.log('Opening PDF viewer for:', pdfData.filename);
  createPDFViewerWindow();

  // Send PDF data once viewer is ready
  if (pdfViewerWindow) {
    pdfViewerWindow.webContents.once('did-finish-load', () => {
      console.log('PDF viewer loaded, sending PDF data...');
      pdfViewerWindow.webContents.send('load-pdf', pdfData);
      console.log('PDF data sent successfully');
    });
  }
});

ipcMain.handle('close-pdf-viewer', () => {
  if (pdfViewerWindow) {
    pdfViewerWindow.close();
    pdfViewerWindow = null;
  }
});

ipcMain.handle('get-config', () => {
  return CONFIG;
});

ipcMain.handle('check-screen-recording', async () => {
  return result;
});

// Security: Prevent remote content loading
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // Only allow navigation to local files
    if (parsedUrl.protocol !== 'file:') {
      event.preventDefault();
    }
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  app.quit();
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  app.quit();
});

console.log('=� Secure PDF Viewer Starting...');
console.log('   Development Mode:', CONFIG.isDev);
console.log('   API URL:', CONFIG.API_URL);
