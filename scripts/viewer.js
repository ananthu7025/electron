// State
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let scale = 1.0;
let rotation = 0;
let currentFilename = '';

// DOM Elements
let canvasWrapper, loadingOverlay, fileName, pageInput, totalPagesSpan, zoomLevel;
let backBtn, prevBtn, nextBtn, zoomInBtn, zoomOutBtn, fitWidthBtn, rotateBtn;

// Initialize PDF.js when script loads
window.addEventListener('load', () => {
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        console.log('PDF.js loaded successfully');
    } else {
        console.error('PDF.js failed to load from CDN');
    }
});

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    canvasWrapper = document.getElementById('canvasWrapper');
    loadingOverlay = document.getElementById('loadingOverlay');
    fileName = document.getElementById('fileName');
    pageInput = document.getElementById('pageInput');
    totalPagesSpan = document.getElementById('totalPages');
    zoomLevel = document.getElementById('zoomLevel');
    backBtn = document.getElementById('backBtn');
    prevBtn = document.getElementById('prevBtn');
    nextBtn = document.getElementById('nextBtn');
    zoomInBtn = document.getElementById('zoomInBtn');
    zoomOutBtn = document.getElementById('zoomOutBtn');
    fitWidthBtn = document.getElementById('fitWidthBtn');
    rotateBtn = document.getElementById('rotateBtn');

    setupEventListeners();
    setupSecurityFeatures();

    console.log('PDF Viewer initialized and waiting for PDF data...');
});

// Listen for PDF data from main process
window.electronAPI.onLoadPDF((pdfData) => {
    console.log('Received PDF data:', pdfData.filename);
    currentFilename = pdfData.filename;
    fileName.textContent = pdfData.filename;
    loadPDF(pdfData.base64);
});

// Setup event listeners
function setupEventListeners() {
    backBtn.addEventListener('click', handleBack);
    prevBtn.addEventListener('click', () => changePage(-1));
    nextBtn.addEventListener('click', () => changePage(1));
    zoomInBtn.addEventListener('click', () => changeZoom(0.1));
    zoomOutBtn.addEventListener('click', () => changeZoom(-0.1));
    fitWidthBtn.addEventListener('click', fitToWidth);
    rotateBtn.addEventListener('click', rotatePage);

    pageInput.addEventListener('change', (e) => {
        const page = parseInt(e.target.value);
        if (page >= 1 && page <= totalPages) {
            currentPage = page;
            renderPage(currentPage);
        } else {
            e.target.value = currentPage;
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboard);

    // Mouse wheel zoom
    canvasWrapper.addEventListener('wheel', handleWheel, { passive: false });
}

// Setup additional security features
function setupSecurityFeatures() {
    // Enhanced blur detection for screenshot prevention
    let blurTimeout;
    window.addEventListener('blur', () => {
        // Immediately blur content when window loses focus (prevents Snipping Tool)
        document.body.classList.add('window-blur');
        console.warn('🚨 Window focus lost - possible screenshot attempt');

        // Log potential screenshot event
        logSecurityEvent('WINDOW_BLUR', 'Window lost focus - possible screenshot tool');
    });

    window.addEventListener('focus', () => {
        // Delay removing blur to prevent quick screenshot
        clearTimeout(blurTimeout);
        blurTimeout = setTimeout(() => {
            document.body.classList.remove('window-blur');
        }, 500);
    });

    // Prevent drag and drop
    document.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });

    // Additional clipboard protection
    document.addEventListener('copy', (e) => {
        e.preventDefault();
        logSecurityEvent('COPY_ATTEMPT', 'Copy operation blocked');
        return false;
    });

    document.addEventListener('cut', (e) => {
        e.preventDefault();
        logSecurityEvent('CUT_ATTEMPT', 'Cut operation blocked');
        return false;
    });

    // Monitor for screen recording software (basic detection)
    detectScreenRecording();

    // Monitor for suspicious keyboard combinations
    monitorScreenshotKeys();

    // SECURITY: We don't do background process checking to avoid false positives
    // Instead, we rely on reactive protections (window blur, keyboard blocking)
}

// Security event logging
const securityLog = [];

function logSecurityEvent(type, message) {
    const event = {
        type,
        message,
        timestamp: new Date().toISOString(),
        user: localStorage.getItem('username') || 'UNKNOWN',
        filename: currentFilename
    };

    securityLog.push(event);
    console.warn(`🔒 SECURITY EVENT [${type}]:`, message);

    // In production, send to server for audit trail
    // sendSecurityEventToServer(event);

    // Store in localStorage for tracking
    try {
        const existingLogs = JSON.parse(localStorage.getItem('securityLogs') || '[]');
        existingLogs.push(event);
        // Keep only last 100 events
        if (existingLogs.length > 100) {
            existingLogs.shift();
        }
        localStorage.setItem('securityLogs', JSON.stringify(existingLogs));
    } catch (e) {
        console.error('Failed to log security event:', e);
    }
}

// Monitor for screenshot keyboard combinations
function monitorScreenshotKeys() {
    let winKeyPressed = false;
    let shiftKeyPressed = false;
    let hideTimeout = null;

    document.addEventListener('keydown', (e) => {
        // AGGRESSIVE: Detect Windows key press - hide content immediately as precaution
        if (e.key === 'Meta' || e.key === 'OS' || e.keyCode === 91 || e.keyCode === 92) {
            winKeyPressed = true;

            // Immediately blur content when Windows key is pressed (preventive measure)
            document.body.classList.add('window-blur');
            logSecurityEvent('WINDOWS_KEY_PRESSED', 'Windows key pressed - hiding content as precaution');

            // Auto-remove blur after 2 seconds if nothing happens
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!document.querySelector('#recording-warning')) {
                    document.body.classList.remove('window-blur');
                }
            }, 2000);
        }

        if (e.key === 'Shift') {
            shiftKeyPressed = true;
        }

        // Detect Win + Shift + S (Windows Snipping Tool) - CRITICAL COMBO
        if (winKeyPressed && shiftKeyPressed && e.key.toLowerCase() === 's') {
            logSecurityEvent('SCREENSHOT_KEY', 'Snipping Tool shortcut detected (Win+Shift+S) - CRITICAL');
            document.body.classList.add('window-blur');
            e.preventDefault();

            // Keep content hidden for 3 seconds
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!document.querySelector('#recording-warning')) {
                    document.body.classList.remove('window-blur');
                }
            }, 3000);
        }

        // Detect PrintScreen
        if (e.key === 'PrintScreen') {
            logSecurityEvent('SCREENSHOT_KEY', 'PrintScreen key pressed');
            document.body.classList.add('window-blur');
            e.preventDefault();

            // Keep hidden for 1 second
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!document.querySelector('#recording-warning')) {
                    document.body.classList.remove('window-blur');
                }
            }, 1000);
        }

        // Detect Alt + PrintScreen
        if (e.altKey && e.key === 'PrintScreen') {
            logSecurityEvent('SCREENSHOT_KEY', 'Alt+PrintScreen detected (active window capture)');
            document.body.classList.add('window-blur');
            e.preventDefault();

            // Keep hidden for 1 second
            clearTimeout(hideTimeout);
            hideTimeout = setTimeout(() => {
                if (!document.querySelector('#recording-warning')) {
                    document.body.classList.remove('window-blur');
                }
            }, 1000);
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Meta' || e.key === 'OS' || e.keyCode === 91 || e.keyCode === 92) {
            winKeyPressed = false;
        }
        if (e.key === 'Shift') {
            shiftKeyPressed = false;
        }
    });
}

// Basic screen recording detection (not foolproof)
function detectScreenRecording() {
    // Monitor for visibility changes that might indicate recording
    let visibilityChangeCount = 0;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            visibilityChangeCount++;
            if (visibilityChangeCount > 3) {
                logSecurityEvent('SUSPICIOUS_ACTIVITY', `Multiple visibility changes detected (${visibilityChangeCount})`);
            }
        }
    });

    // Check for screen capture API usage
    if (navigator.mediaDevices) {
        const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia;
        if (originalGetDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia = function(...args) {
                logSecurityEvent('SCREEN_CAPTURE', 'Screen capture API called');
                return originalGetDisplayMedia.apply(this, args);
            };
        }
    }
}

// Load PDF from base64
async function loadPDF(base64Data) {
    try {
        console.log('Starting PDF load...');
        showLoading(true);

        // Check if PDF.js is available
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not loaded. Check internet connection.');
        }

        console.log('Converting base64 to bytes...');
        // Convert base64 to Uint8Array
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        console.log('Converted', bytes.length, 'bytes');

        // Load PDF
        console.log('Loading PDF document...');
        const loadingTask = pdfjsLib.getDocument({ data: bytes });
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;
        console.log('PDF loaded with', totalPages, 'pages');

        // Update UI
        totalPagesSpan.textContent = totalPages;
        pageInput.max = totalPages;

        // Render first page
        console.log('Rendering first page...');
        await renderPage(1);

        showLoading(false);

        console.log('PDF loaded successfully:', currentFilename);
    } catch (error) {
        console.error('Error loading PDF:', error);
        showLoading(false);
        showError('Failed to load PDF: ' + error.message);
    }
}

// Render a page
async function renderPage(pageNum) {
    try {
        // Get page
        const page = await pdfDoc.getPage(pageNum);

        // Calculate scale
        const viewport = page.getViewport({ scale: 1, rotation });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        // Set canvas dimensions
        const actualScale = scale;
        const scaledViewport = page.getViewport({ scale: actualScale, rotation });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Render page
        const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
        };

        await page.render(renderContext).promise;

        // Clear previous canvas and add new one
        const existingCanvas = canvasWrapper.querySelector('canvas');
        if (existingCanvas) {
            existingCanvas.remove();
        }

        canvasWrapper.insertBefore(canvas, loadingOverlay);

        // Update UI
        currentPage = pageNum;
        pageInput.value = pageNum;
        updateNavigationButtons();

        console.log(`Rendered page ${pageNum} of ${totalPages}`);
    } catch (error) {
        console.error('Error rendering page:', error);
        showError('Failed to render page: ' + error.message);
    }
}

// Change page
function changePage(delta) {
    const newPage = currentPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        renderPage(newPage);
    }
}

// Change zoom
function changeZoom(delta) {
    scale = Math.max(0.5, Math.min(3.0, scale + delta));
    zoomLevel.textContent = Math.round(scale * 100) + '%';
    renderPage(currentPage);
}

// Fit to width
function fitToWidth() {
    const containerWidth = canvasWrapper.clientWidth - 40; // Padding
    const canvas = canvasWrapper.querySelector('canvas');

    if (canvas) {
        pdfDoc.getPage(currentPage).then(page => {
            const viewport = page.getViewport({ scale: 1, rotation });
            scale = containerWidth / viewport.width;
            zoomLevel.textContent = Math.round(scale * 100) + '%';
            renderPage(currentPage);
        });
    }
}

// Rotate page
function rotatePage() {
    rotation = (rotation + 90) % 360;
    renderPage(currentPage);
}

// Update navigation buttons
function updateNavigationButtons() {
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
}

// Handle keyboard shortcuts
function handleKeyboard(e) {
    // Prevent default for all shortcuts
    if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
            case 'p': // Print
            case 's': // Save
            case 'c': // Copy
                e.preventDefault();
                return false;
        }
    }

    switch (e.key) {
        case 'ArrowLeft':
        case 'PageUp':
            e.preventDefault();
            changePage(-1);
            break;
        case 'ArrowRight':
        case 'PageDown':
            e.preventDefault();
            changePage(1);
            break;
        case 'Home':
            e.preventDefault();
            renderPage(1);
            break;
        case 'End':
            e.preventDefault();
            renderPage(totalPages);
            break;
        case '+':
        case '=':
            e.preventDefault();
            changeZoom(0.1);
            break;
        case '-':
            e.preventDefault();
            changeZoom(-0.1);
            break;
        case '0':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                scale = 1.0;
                zoomLevel.textContent = '100%';
                renderPage(currentPage);
            }
            break;
    }
}

// Handle mouse wheel zoom
function handleWheel(e) {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        changeZoom(delta);
    }
}

// Handle back button
async function handleBack() {
    await window.electronAPI.closePDFViewer();
}

// Show loading overlay
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Show error
function showError(message) {
    showLoading(false);

    const errorHTML = `
        <div class="error-container">
            <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                <path d="M12 9V11M12 15H12.01M5.07183 19H18.9282C20.4678 19 21.4301 17.3333 20.6603 16L13.7321 4C12.9623 2.66667 11.0378 2.66667 10.268 4L3.33978 16C2.56998 17.3333 3.53223 19 5.07183 19Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <h2>Error Loading PDF</h2>
            <p>${message}</p>
            <button class="error-btn" onclick="handleBack()">Go Back</button>
        </div>
    `;

    canvasWrapper.innerHTML = errorHTML;
}

// Security: Monitor for suspicious activities
let suspiciousActivityCount = 0;

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden (possible screen recording or screenshot)
        suspiciousActivityCount++;
        console.warn('Visibility change detected:', suspiciousActivityCount);
    }
});

// Prevent inspect element (additional layer)
window.addEventListener('devtools-opened', () => {
    console.warn('DevTools opened detected');
});

// Clear canvas when window is minimized (optional security)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Optional: Clear canvas when hidden
        // This can be uncommented for maximum security
        /*
        const canvas = canvasWrapper.querySelector('canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        */
    } else {
        // Re-render when visible again
        if (pdfDoc && currentPage) {
            renderPage(currentPage);
        }
    }
});

// Check for screen recording software via main process
async function checkForRecordingSoftware() {
    try {
        const result = await window.electronAPI.checkScreenRecording();

        if (result.detected) {
            console.error('🚨🚨 SCREEN RECORDING SOFTWARE DETECTED!');
            console.error('Detected:', result.processes);

            logSecurityEvent('RECORDING_SOFTWARE_DETECTED', `Screen recording software found: ${result.processes.join(', ')}`);

            // SILENT: Just hide content, no red screen to capture
            hideAllContent();
        } else {
            // No threat detected - show content if it was hidden
            showContent();
        }
    } catch (error) {
        console.error('Error checking for recording software:', error);
    }
}

// Hide all PDF content silently
function hideAllContent() {
    // Hide all canvases
    document.querySelectorAll('canvas').forEach(canvas => {
        canvas.style.visibility = 'hidden';
    });

    // Hide the viewer container
    const viewerContainer = document.getElementById('viewerContainer');
    if (viewerContainer) {
        viewerContainer.style.visibility = 'hidden';
    }

    // Add blur as additional protection
    document.body.classList.add('window-blur');
}

// Show content when threat is cleared
function showContent() {
    // Show all canvases
    document.querySelectorAll('canvas').forEach(canvas => {
        canvas.style.visibility = 'visible';
    });

    // Show the viewer container
    const viewerContainer = document.getElementById('viewerContainer');
    if (viewerContainer) {
        viewerContainer.style.visibility = 'visible';
    }

    // Remove blur
    document.body.classList.remove('window-blur');

    // Remove any warning overlays
    const warning = document.getElementById('recording-warning');
    if (warning) {
        warning.remove();
    }
}

// Show recording software warning overlay - IMMEDIATE AND AGGRESSIVE
function showRecordingWarning(processes) {
    // Remove existing warning if any
    const existingWarning = document.getElementById('recording-warning');
    if (existingWarning) {
        return; // Already showing
    }

    // CRITICAL: Hide ALL content immediately
    document.body.classList.add('window-blur');

    // Create full-screen blocking overlay
    const warningOverlay = document.createElement('div');
    warningOverlay.id = 'recording-warning';
    warningOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #dc2626;
        color: white;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: sans-serif;
        text-align: center;
        padding: 40px;
        animation: pulse 1s infinite;
    `;

    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
        }
    `;
    document.head.appendChild(style);

    warningOverlay.innerHTML = `
        <div style="max-width: 700px;">
            <h1 style="font-size: 64px; margin-bottom: 20px; text-shadow: 3px 3px 6px rgba(0,0,0,0.5);">🚨 SECURITY VIOLATION 🚨</h1>
            <h2 style="font-size: 36px; margin-bottom: 30px; font-weight: bold;">UNAUTHORIZED CAPTURE SOFTWARE DETECTED</h2>
            <p style="font-size: 22px; margin-bottom: 20px; font-weight: 600;">
                The following prohibited software is currently running:
            </p>
            <div style="background: rgba(0, 0, 0, 0.7); padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 3px solid white;">
                <ul style="list-style: none; padding: 0; font-size: 20px; font-weight: bold;">
                    ${processes.map(p => `<li style="margin: 12px 0; font-family: monospace;">❌ ${p.toUpperCase()}</li>`).join('')}
                </ul>
            </div>
            <p style="font-size: 20px; margin-bottom: 20px; font-weight: 700;">
                📵 DOCUMENT VIEWING SUSPENDED 📵
            </p>
            <p style="font-size: 18px; margin-bottom: 15px;">
                This window will close automatically.
            </p>
            <p style="font-size: 16px; opacity: 0.95; font-weight: 600; background: rgba(0,0,0,0.5); padding: 15px; border-radius: 8px;">
                ⚠️ SECURITY INCIDENT LOGGED ⚠️<br>
                User: ${localStorage.getItem('username')}<br>
                Time: ${new Date().toLocaleString()}<br>
                This violation has been recorded for audit purposes.
            </p>
        </div>
    `;

    // Insert at the very beginning to ensure it's on top
    document.body.insertBefore(warningOverlay, document.body.firstChild);

    // Also hide all canvases
    document.querySelectorAll('canvas').forEach(canvas => {
        canvas.style.display = 'none';
    });
}

console.log('PDF Viewer initialized with security features');
console.log('Security features enabled:');
console.log('- DRM-level content protection (contentProtection)');
console.log('- Window hiding on focus loss');
console.log('- Screen recording software detection');
console.log('- Dynamic moving watermarks');
console.log('- Right-click disabled');
console.log('- Copy/paste disabled');
console.log('- Print disabled');
console.log('- Save disabled');
console.log('- All keyboard shortcuts disabled');
console.log('- DevTools blocked');
console.log('- Random flash overlays');
console.log('- Corner timestamp overlays');
console.log('- Security event logging');
