/* ========================================
   MedTrack Pro — Client-Side Auth & Encryption
   Multi-user support with password-protected localStorage
   ======================================== */

const VERIFY_SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const VERIFY_IV = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const VERIFY_PLAINTEXT = 'medtrack-verify';

let authResolve = null;
let currentUser = null;
let currentPassword = null;

// ========================================
// Web Crypto API Helpers
// ========================================

async function deriveKey(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

async function encryptData(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
    );
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    return btoa(String.fromCharCode(...result));
}

async function decryptData(encryptedBase64, password) {
    const binary = atob(encryptedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);
    const key = await deriveKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
}

// ========================================
// Password Verification
// ========================================

async function createVerificationHash(password) {
    const key = await deriveKey(password, VERIFY_SALT);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: VERIFY_IV },
        key,
        new TextEncoder().encode(VERIFY_PLAINTEXT)
    );
    return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function verifyPassword(password, hash) {
    try {
        const key = await deriveKey(password, VERIFY_SALT);
        const binary = atob(hash);
        const encrypted = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            encrypted[i] = binary.charCodeAt(i);
        }
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: VERIFY_IV },
            key,
            encrypted
        );
        return new TextDecoder().decode(decrypted) === VERIFY_PLAINTEXT;
    } catch (e) {
        return false;
    }
}

// ========================================
// User Registry
// ========================================

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem('medtrack_users') || '[]');
    } catch (e) {
        return [];
    }
}

function addUser(username) {
    const users = getUsers();
    if (!users.includes(username)) {
        users.push(username);
        localStorage.setItem('medtrack_users', JSON.stringify(users));
    }
}

function hasUser(username) {
    return getUsers().includes(username);
}

function getVerificationHash(username) {
    return localStorage.getItem(`medtrack_verify_${username}`);
}

function setVerificationHash(username, hash) {
    localStorage.setItem(`medtrack_verify_${username}`, hash);
}

// ========================================
// Public API
// ========================================

async function saveUserData(year, data) {
    if (!currentUser || !currentPassword) return;
    const encrypted = await encryptData(data, currentPassword);
    localStorage.setItem(`medtrack_data_${currentUser}_${year}`, encrypted);
}

async function loadUserData(year) {
    if (!currentUser || !currentPassword) return [];
    const encrypted = localStorage.getItem(`medtrack_data_${currentUser}_${year}`);
    if (!encrypted) return [];
    try {
        return await decryptData(encrypted, currentPassword);
    } catch (e) {
        console.error('Failed to decrypt data for year', year, e);
        return [];
    }
}

function getCurrentUser() {
    return currentUser;
}

function getCurrentPassword() {
    return currentPassword;
}

function logout() {
    currentUser = null;
    currentPassword = null;
    localStorage.removeItem('medtrack_current_user');
    try { localStorage.removeItem('medtrack_current_password'); } catch (e) {}
    location.reload();
}

// ========================================
// UI
// ========================================

function initAuth() {
    return new Promise((resolve) => {
        authResolve = resolve;
        if (!window.crypto || !crypto.subtle) {
            renderAuthOverlay(null, true);
            return;
        }
        const savedUser = localStorage.getItem('medtrack_current_user');
        const savedPassword = (() => { try { return localStorage.getItem('medtrack_current_password'); } catch (e) { return null; } })();

        if (savedUser && savedPassword && hasUser(savedUser)) {
            const hash = getVerificationHash(savedUser);
            verifyPassword(savedPassword, hash).then(valid => {
                if (valid) {
                    onLoginSuccess(savedUser, savedPassword);
                } else {
                    try { localStorage.removeItem('medtrack_current_password'); } catch (e) {}
                    renderAuthOverlay(savedUser);
                }
            });
            return;
        }

        renderAuthOverlay(savedUser);
    });
}

function renderAuthOverlay(savedUser, unsupported = false) {
    // Remove existing overlay if any
    const existing = document.getElementById('authOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';

    if (unsupported) {
        overlay.innerHTML = `
            <div class="auth-card">
                <div class="auth-logo"><i class="fa-solid fa-heart-pulse"></i><span>MedTrack Pro</span></div>
                <div class="auth-error" style="display:block">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    Your browser does not support the Web Crypto API required for encryption.
                    Please use a modern browser (Chrome, Firefox, Safari, Edge).
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        return;
    }

    const isReturning = savedUser && hasUser(savedUser);

    overlay.innerHTML = `
        <div class="auth-card">
            <div class="auth-logo">
                <i class="fa-solid fa-heart-pulse"></i>
                <span>MedTrack Pro</span>
            </div>

            <div class="auth-error hidden" id="authError"></div>

            ${isReturning ? `
            <div class="auth-welcome" id="authWelcome">
                <h2>Welcome back</h2>
                <p class="auth-welcome-user"><i class="fa-solid fa-user-shield"></i> <span id="authWelcomeUser">${escapeHtml(savedUser)}</span></p>
                <form id="authWelcomeForm" class="auth-form">
                    <div class="auth-form-group">
                        <label for="authWelcomePass">Password</label>
                        <div class="auth-input-wrap">
                            <input type="password" id="authWelcomePass" class="auth-input" placeholder="Enter your password" required autofocus>
                            <button type="button" class="auth-toggle-pass" data-target="authWelcomePass" aria-label="Show password">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </div>
                    <button type="submit" class="auth-btn auth-btn-primary">Sign In</button>
                </form>
                <div class="auth-switch">
                    <button type="button" class="btn-text" id="authSwitchBtn">Use a different account</button>
                </div>
            </div>
            ` : ''}

            <div class="auth-tabs" id="authTabs" style="${isReturning ? 'display:none' : ''}">
                <button type="button" class="auth-tab active" data-tab="login" id="authTabLogin">Sign In</button>
                <button type="button" class="auth-tab" data-tab="signup" id="authTabSignup">Create Account</button>
            </div>

            <form class="auth-form ${isReturning ? 'hidden' : ''}" id="authLoginForm">
                <div class="auth-form-group">
                    <label for="authLoginUser">Username</label>
                    <input type="text" id="authLoginUser" class="auth-input" placeholder="Enter your username" required ${isReturning ? '' : 'autofocus'}>
                </div>
                <div class="auth-form-group">
                    <label for="authLoginPass">Password</label>
                    <div class="auth-input-wrap">
                        <input type="password" id="authLoginPass" class="auth-input" placeholder="Enter your password" required>
                        <button type="button" class="auth-toggle-pass" data-target="authLoginPass" aria-label="Show password">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <button type="submit" class="auth-btn auth-btn-primary">Sign In</button>
            </form>

            <form class="auth-form hidden" id="authSignupForm">
                <div class="auth-form-group">
                    <label for="authSignupUser">Username</label>
                    <input type="text" id="authSignupUser" class="auth-input" placeholder="Choose a username" required>
                </div>
                <div class="auth-form-group">
                    <label for="authSignupPass">Password</label>
                    <div class="auth-input-wrap">
                        <input type="password" id="authSignupPass" class="auth-input" placeholder="Choose a password" required>
                        <button type="button" class="auth-toggle-pass" data-target="authSignupPass" aria-label="Show password">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <div class="auth-form-group">
                    <label for="authSignupConfirm">Confirm Password</label>
                    <div class="auth-input-wrap">
                        <input type="password" id="authSignupConfirm" class="auth-input" placeholder="Confirm password" required>
                        <button type="button" class="auth-toggle-pass" data-target="authSignupConfirm" aria-label="Show password">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </div>
                <button type="submit" class="auth-btn auth-btn-primary">Create Account</button>
            </form>

            <p class="auth-note">Data is encrypted in your browser. No server required. If you forget your password, your data cannot be recovered.</p>
        </div>
    `;

    document.body.appendChild(overlay);

    // Focus trap within auth card
    overlay.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        const card = overlay.querySelector('.auth-card');
        const focusable = card.querySelectorAll('input, button, select, textarea, a[href]');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });

    // Tab switching
    const tabs = overlay.querySelectorAll('.auth-tab');
    const loginForm = document.getElementById('authLoginForm');
    const signupForm = document.getElementById('authSignupForm');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            if (target === 'login') {
                loginForm.classList.remove('hidden');
                signupForm.classList.add('hidden');
            } else {
                loginForm.classList.add('hidden');
                signupForm.classList.remove('hidden');
            }
            // Reset all password inputs to hidden state when switching tabs
            overlay.querySelectorAll('input[type="text"]').forEach(input => {
                if (input.id && (input.id.includes('Pass') || input.id.includes('Confirm'))) {
                    input.type = 'password';
                }
            });
            overlay.querySelectorAll('.auth-toggle-pass').forEach(btn => {
                const icon = btn.querySelector('i');
                icon.className = 'fa-solid fa-eye';
                btn.setAttribute('aria-label', 'Show password');
                btn.setAttribute('aria-pressed', 'false');
            });
            clearAuthError();
        });
    });

    // Form handlers
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }

    // Show password toggles
    overlay.querySelectorAll('.auth-toggle-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            const icon = btn.querySelector('i');
            icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        });
    });

    // Welcome back handlers
    const welcomeForm = document.getElementById('authWelcomeForm');
    if (welcomeForm) {
        welcomeForm.addEventListener('submit', handleWelcomeLogin);
    }
    const switchBtn = document.getElementById('authSwitchBtn');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            document.getElementById('authWelcome').classList.add('hidden');
            document.getElementById('authTabs').style.display = 'flex';
            loginForm.classList.remove('hidden');
            document.getElementById('authLoginUser').focus();
            clearAuthError();
        });
    }
}

function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
    }
}

function clearAuthError() {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
    }
}

function showAuthError(msg) {
    const errorEl = document.getElementById('authError');
    if (errorEl) {
        errorEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${escapeHtml(msg)}`;
        errorEl.classList.remove('hidden');
    }
}

// ========================================
// Event Handlers
// ========================================

async function handleLogin(e) {
    e.preventDefault();
    clearAuthError();
    const username = document.getElementById('authLoginUser').value.trim();
    const password = document.getElementById('authLoginPass').value;

    if (!username || !password) {
        showAuthError('Please enter both username and password.');
        return;
    }
    if (!hasUser(username)) {
        showAuthError('User not found. Please create an account first.');
        return;
    }

    const hash = getVerificationHash(username);
    const valid = await verifyPassword(password, hash);
    if (!valid) {
        showAuthError('Incorrect password.');
        return;
    }

    onLoginSuccess(username, password);
}

async function handleWelcomeLogin(e) {
    e.preventDefault();
    clearAuthError();
    const username = localStorage.getItem('medtrack_current_user');
    const password = document.getElementById('authWelcomePass').value;

    if (!password) {
        showAuthError('Please enter your password.');
        return;
    }

    const hash = getVerificationHash(username);
    const valid = await verifyPassword(password, hash);
    if (!valid) {
        showAuthError('Incorrect password.');
        return;
    }

    onLoginSuccess(username, password);
}

async function handleSignup(e) {
    e.preventDefault();
    clearAuthError();
    const username = document.getElementById('authSignupUser').value.trim();
    const password = document.getElementById('authSignupPass').value;
    const confirm = document.getElementById('authSignupConfirm').value;

    if (!username || !password) {
        showAuthError('Please enter a username and password.');
        return;
    }
    if (hasUser(username)) {
        showAuthError('Username already exists. Please choose another or sign in.');
        return;
    }
    if (password !== confirm) {
        showAuthError('Passwords do not match.');
        return;
    }
    if (username.length < 2 || username.length > 30) {
        showAuthError('Username must be between 2 and 30 characters.');
        return;
    }
    if (password.length < 4) {
        showAuthError('Password must be at least 4 characters.');
        return;
    }

    const hash = await createVerificationHash(password);
    addUser(username);
    setVerificationHash(username, hash);

    // Pre-create empty encrypted data for current year so login works immediately
    const year = new Date().getFullYear();
    const encrypted = await encryptData([], password);
    localStorage.setItem(`medtrack_data_${username}_${year}`, encrypted);

    onLoginSuccess(username, password);
}

function onLoginSuccess(username, password) {
    currentUser = username;
    currentPassword = password;
    localStorage.setItem('medtrack_current_user', username);
    try { localStorage.setItem('medtrack_current_password', password); } catch (e) {}
    hideAuthOverlay();
    if (authResolve) {
        authResolve();
        authResolve = null;
    }
}

// ========================================
// User Badge
// ========================================

function renderUserBadge() {
    const badge = document.getElementById('userBadge');
    const nameEl = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const user = getCurrentUser();
    if (user && badge) {
        badge.classList.remove('hidden');
        nameEl.textContent = user;
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logout);
        }
    }
}

// ========================================
// Utilities
// ========================================

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// Expose
// ========================================

window.initAuth = initAuth;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
// getCurrentPassword intentionally not exposed to window for security
window.saveUserData = saveUserData;
window.loadUserData = loadUserData;
window.renderUserBadge = renderUserBadge;
