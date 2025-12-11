// API Configuration
const API_URL = 'http://localhost:3000';

// State
let documents = [];
let currentView = 'grid';
let authToken = localStorage.getItem('authToken');

// DOM Elements
const documentGrid = document.getElementById('documentGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const errorState = document.getElementById('errorState');
const documentCount = document.getElementById('documentCount');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const retryBtn = document.getElementById('retryBtn');
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const viewBtns = document.querySelectorAll('.view-btn');

// Initialize
window.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!authToken) {
        await window.electronAPI.navigateToLogin();
        return;
    }

    // Set username
    const username = localStorage.getItem('username');
    if (username) {
        userName.textContent = username;
    }

    // Load documents
    await loadDocuments();

    // Setup event listeners
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search
    searchInput.addEventListener('input', handleSearch);

    // Refresh
    refreshBtn.addEventListener('click', handleRefresh);

    // Retry
    retryBtn.addEventListener('click', loadDocuments);

    // User menu
    userMenuBtn.addEventListener('click', toggleUserMenu);

    // Logout
    logoutBtn.addEventListener('click', handleLogout);

    // View switcher
    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => handleViewChange(btn.dataset.view));
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.style.display = 'none';
            userMenuBtn.classList.remove('active');
        }
    });

    // Prevent default on sidebar links
    document.querySelectorAll('.nav-item').forEach((link, index) => {
        if (index !== 0) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
            });
        }
    });
}

// Load documents from API
async function loadDocuments() {
    showState('loading');

    try {
        const response = await fetch(`${API_URL}/api/files`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token expired, try to refresh
            const refreshed = await refreshAuthToken();
            if (refreshed) {
                return loadDocuments(); // Retry with new token
            } else {
                // Redirect to login
                await handleLogout();
                return;
            }
        }

        const data = await response.json();

        if (data.success && data.files) {
            documents = data.files;
            renderDocuments(documents);

            if (documents.length === 0) {
                showState('empty');
            } else {
                showState('documents');
            }
        } else {
            throw new Error(data.error || 'Failed to load documents');
        }
    } catch (error) {
        console.error('Error loading documents:', error);
        showState('error');
        document.getElementById('errorMessage').textContent = error.message;
    }
}

// Refresh auth token
async function refreshAuthToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return false;

    try {
        const response = await fetch(`${API_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken })
        });

        const data = await response.json();

        if (data.success && data.token) {
            localStorage.setItem('authToken', data.token);
            authToken = data.token;
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

// Render documents
function renderDocuments(docs) {
    documentGrid.innerHTML = '';
    documentCount.textContent = `${docs.length} document${docs.length !== 1 ? 's' : ''}`;

    docs.forEach(filename => {
        const card = createDocumentCard(filename);
        documentGrid.appendChild(card);
    });
}

// Create document card
function createDocumentCard(filename) {
    const card = document.createElement('div');
    card.className = 'document-card';
    card.dataset.filename = filename;

    // Extract file info
    const displayName = filename.replace('.pdf', '');
    const size = '-- MB'; // Size will be fetched when clicking

    card.innerHTML = `
        <div class="document-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                <path d="M7 18H17V16H7V18ZM7 14H17V12H7V14ZM14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2ZM18 20H6V4H13V9H18V20Z" fill="white"/>
            </svg>
        </div>
        <div class="document-info">
            <div class="document-name" title="${filename}">${displayName}</div>
            <div class="document-meta">
                <span class="document-size">${size}</span>
                <span class="document-type">PDF</span>
            </div>
        </div>
    `;

    // Click handler to open PDF
    card.addEventListener('click', () => handleDocumentClick(filename));

    return card;
}

// Handle document click
async function handleDocumentClick(filename) {
    // Show loading indicator on the card
    const card = document.querySelector(`[data-filename="${filename}"]`);
    if (card) {
        card.style.opacity = '0.6';
        card.style.cursor = 'wait';
    }

    try {
        // Fetch PDF data
        const response = await fetch(`${API_URL}/api/pdf/${encodeURIComponent(filename)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 401) {
            // Token expired
            const refreshed = await refreshAuthToken();
            if (refreshed) {
                return handleDocumentClick(filename); // Retry
            } else {
                await handleLogout();
                return;
            }
        }

        const data = await response.json();

        if (data.success && data.base64) {
            // Open PDF viewer
            await window.electronAPI.openPDFViewer({
                filename: filename,
                base64: data.base64
            });
        } else {
            throw new Error(data.error || 'Failed to load PDF');
        }
    } catch (error) {
        console.error('Error loading PDF:', error);
        alert(`Error loading PDF: ${error.message}`);
    } finally {
        // Reset card state
        if (card) {
            card.style.opacity = '1';
            card.style.cursor = 'pointer';
        }
    }
}

// Handle search
function handleSearch(e) {
    const query = e.target.value.toLowerCase().trim();

    if (!query) {
        renderDocuments(documents);
        return;
    }

    const filtered = documents.filter(filename =>
        filename.toLowerCase().includes(query)
    );

    renderDocuments(filtered);

    if (filtered.length === 0) {
        showState('empty');
        document.getElementById('emptyState').querySelector('h3').textContent = 'No matching documents';
        document.getElementById('emptyState').querySelector('p').textContent = `No documents match "${query}"`;
    } else {
        showState('documents');
    }
}

// Handle refresh
async function handleRefresh() {
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s';

    await loadDocuments();

    setTimeout(() => {
        refreshBtn.style.transform = 'rotate(0deg)';
    }, 500);
}

// Handle view change
function handleViewChange(view) {
    currentView = view;

    // Update active button
    viewBtns.forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update grid class
    if (view === 'list') {
        documentGrid.classList.add('list-view');
    } else {
        documentGrid.classList.remove('list-view');
    }
}

// Toggle user menu
function toggleUserMenu(e) {
    e.stopPropagation();
    const isVisible = userDropdown.style.display === 'block';

    if (isVisible) {
        userDropdown.style.display = 'none';
        userMenuBtn.classList.remove('active');
    } else {
        userDropdown.style.display = 'block';
        userMenuBtn.classList.add('active');
    }
}

// Handle logout
async function handleLogout(e) {
    if (e) e.preventDefault();

    // Call logout API
    try {
        await fetch(`${API_URL}/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('username');

    // Navigate to login
    await window.electronAPI.navigateToLogin();
}

// Show different states
function showState(state) {
    loadingState.style.display = 'none';
    emptyState.style.display = 'none';
    errorState.style.display = 'none';
    documentGrid.style.display = 'none';

    switch (state) {
        case 'loading':
            loadingState.style.display = 'flex';
            break;
        case 'empty':
            emptyState.style.display = 'flex';
            break;
        case 'error':
            errorState.style.display = 'flex';
            break;
        case 'documents':
            documentGrid.style.display = 'grid';
            break;
    }
}

console.log('Dashboard loaded');
