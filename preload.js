const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Navigation
  navigateToDashboard: () => ipcRenderer.invoke('navigate-to-dashboard'),
  navigateToLogin: () => ipcRenderer.invoke('navigate-to-login'),

  // PDF Viewer
  openPDFViewer: (pdfData) => ipcRenderer.invoke('open-pdf-viewer', pdfData),
  closePDFViewer: () => ipcRenderer.invoke('close-pdf-viewer'),

  // PDF Viewer listeners
  onLoadPDF: (callback) => {
    ipcRenderer.on('load-pdf', (event, data) => callback(data));
  },

  // Security event listeners
  onSecurityThreat: (callback) => {
    ipcRenderer.on('security-threat', (event, threat) => callback(threat));
  },

  onHideContent: (callback) => {
    ipcRenderer.on('hide-content', (event, data) => callback(data));
  },

  onShowContent: (callback) => {
    ipcRenderer.on('show-content', () => callback());
  },

  // Configuration
  getConfig: () => ipcRenderer.invoke('get-config'),

  // Security monitoring
  checkScreenRecording: () => ipcRenderer.invoke('check-screen-recording'),

  // Platform info
  platform: process.platform
});

// Security: Disable eval and similar dangerous functions
window.eval = global.eval = function() {
  throw new Error('eval() is disabled for security reasons');
};

// Security: Prevent right-click context menu
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
});

// Security: Disable keyboard shortcuts for DevTools and screenshots
document.addEventListener('keydown', (e) => {
  // Block F12
  if (e.key === 'F12') {
    e.preventDefault();
    return false;
  }

  // Block Ctrl+Shift+I (DevTools)
  if (e.ctrlKey && e.shiftKey && e.key === 'I') {
    e.preventDefault();
    return false;
  }

  // Block Ctrl+Shift+J (DevTools)
  if (e.ctrlKey && e.shiftKey && e.key === 'J') {
    e.preventDefault();
    return false;
  }

  // Block Ctrl+U (View source)
  if (e.ctrlKey && e.key === 'u') {
    e.preventDefault();
    return false;
  }

  // Block Ctrl+S (Save)
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    return false;
  }

  // Block Ctrl+P (Print)
  if (e.ctrlKey && e.key === 'p') {
    e.preventDefault();
    return false;
  }

  // Block PrintScreen
  if (e.key === 'PrintScreen') {
    e.preventDefault();
    return false;
  }
});

// Security: Disable drag and drop
document.addEventListener('drop', (e) => {
  e.preventDefault();
  return false;
});

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  return false;
});

// Security: Clear clipboard on sensitive pages
window.addEventListener('beforeunload', () => {
  if (window.location.pathname.includes('viewer.html')) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText('').catch(() => {});
    }
  }
});

// Enhanced watermark system
window.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('viewer.html')) {
    const username = localStorage.getItem('username') || 'UNKNOWN USER';
    const timestamp = new Date().toLocaleString();

    // Create watermark container
    const watermarkContainer = document.createElement('div');
    watermarkContainer.id = 'watermark-container';
    watermarkContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      user-select: none;
      z-index: 9998;
      overflow: hidden;
    `;

    // Main diagonal watermark
    const mainWatermark = document.createElement('div');
    mainWatermark.className = 'main-watermark';
    mainWatermark.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-45deg);
      font-size: 72px;
      color: rgba(220, 38, 38, 0.15);
      pointer-events: none;
      user-select: none;
      white-space: nowrap;
      font-weight: bold;
      text-transform: uppercase;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
    `;
    mainWatermark.textContent = `CONFIDENTIAL - ${username}`;

    // Create grid watermarks
    const createGridWatermark = (row, col) => {
      const gridWatermark = document.createElement('div');
      gridWatermark.style.cssText = `
        position: absolute;
        top: ${row * 25}%;
        left: ${col * 25}%;
        transform: rotate(-45deg);
        font-size: 18px;
        color: rgba(220, 38, 38, 0.08);
        pointer-events: none;
        user-select: none;
        white-space: nowrap;
        font-weight: 600;
      `;
      gridWatermark.textContent = username;
      return gridWatermark;
    };

    // Add grid watermarks
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        watermarkContainer.appendChild(createGridWatermark(row, col));
      }
    }

    // User info watermark (top)
    const userWatermark = document.createElement('div');
    userWatermark.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 14px;
      color: rgba(220, 38, 38, 0.6);
      pointer-events: none;
      user-select: none;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.4);
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: 600;
      backdrop-filter: blur(4px);
    `;
    userWatermark.textContent = ``;

    // Timestamp watermark (bottom)
    const timestampWatermark = document.createElement('div');
    timestampWatermark.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      pointer-events: none;
      user-select: none;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.4);
      padding: 6px 12px;
      border-radius: 4px;
      backdrop-filter: blur(4px);
    `;
    timestampWatermark.textContent = `🕐 ${timestamp}`;

    // Append watermarks
    watermarkContainer.appendChild(mainWatermark);
    document.body.appendChild(watermarkContainer);
    document.body.appendChild(userWatermark);
    document.body.appendChild(timestampWatermark);

    // Animate watermark
    let angle = -45;
    setInterval(() => {
      angle += 0.5;
      mainWatermark.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    }, 100);

    // Add corner timestamp overlays
    const corners = [
      { top: '10px', left: '10px' },
      { top: '10px', right: '10px' },
      { bottom: '10px', left: '10px' },
      { bottom: '10px', right: '10px' }
    ];

    corners.forEach((position) => {
      const cornerOverlay = document.createElement('div');
      cornerOverlay.style.cssText = `
        position: fixed;
        ${Object.entries(position).map(([k, v]) => `${k}: ${v};`).join(' ')}
        font-size: 10px;
        color: rgba(220, 38, 38, 0.5);
        pointer-events: none;
        user-select: none;
        z-index: 9999;
        background: rgba(0, 0, 0, 0.6);
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-family: monospace;
      `;

      const updateTime = () => {
        cornerOverlay.textContent = `${username} | ${new Date().toLocaleTimeString()}`;
      };
      updateTime();
      setInterval(updateTime, 1000);

      document.body.appendChild(cornerOverlay);
    });
  }
});

console.log('🔒 Enhanced security preload script loaded with auto-hide support');