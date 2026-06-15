/* ========================================
   MedTrack Pro — Client-Side Auth & Encryption
   Multi-user support with password-protected localStorage
   ======================================== */

const VERIFY_PLAINTEXT = 'medtrack-verify';

// Fallback hardcoded salt/IV for backward compatibility with legacy accounts
const VERIFY_SALT = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const VERIFY_IV = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

let authResolve = null;
let currentUser = null;
let cachedKeyMaterial = null;

// ========================================
// Web Crypto API Helpers
// ========================================

async function importPassword(password) {
    return await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
}

async function deriveKeyFromMaterial(keyMaterial, salt) {
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

async function setPassword(password) {
    cachedKeyMaterial = await importPassword(password);
    password = null; // help GC
}

async function deriveKey(salt) {
    if (!cachedKeyMaterial) throw new Error('No password set');
    return deriveKeyFromMaterial(cachedKeyMaterial, salt);
}

async function encryptData(data) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(salt);
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

async function decryptData(encryptedBase64) {
    const binary = atob(encryptedBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const salt = bytes.slice(0, 16);
    const iv = bytes.slice(16, 28);
    const ciphertext = bytes.slice(28);
    const key = await deriveKey(salt);
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
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial = await importPassword(password);
    const key = await deriveKeyFromMaterial(keyMaterial, salt);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(VERIFY_PLAINTEXT)
    );
    return {
        hash: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv))
    };
}

async function verifyPassword(password, username, hash) {
    try {
        const salt = getUserSalt(username);
        const iv = getUserIv(username);
        const keyMaterial = await importPassword(password);
        const key = await deriveKeyFromMaterial(keyMaterial, salt);
        const binary = atob(hash);
        const encrypted = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            encrypted[i] = binary.charCodeAt(i);
        }
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
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

function getUserSalt(username) {
    const stored = localStorage.getItem(`medtrack_salt_${username}`);
    if (stored) {
        const binary = atob(stored);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    return VERIFY_SALT; // fallback for legacy accounts
}

function getUserIv(username) {
    const stored = localStorage.getItem(`medtrack_iv_${username}`);
    if (stored) {
        const binary = atob(stored);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    return VERIFY_IV; // fallback for legacy accounts
}

function setUserSalt(username, saltB64) {
    localStorage.setItem(`medtrack_salt_${username}`, saltB64);
}

function setUserIv(username, ivB64) {
    localStorage.setItem(`medtrack_iv_${username}`, ivB64);
}

// ========================================
// Public API
// ========================================

async function saveUserData(year, data) {
    if (!currentUser || !cachedKeyMaterial) return;
    // Strip receiptData before encryption, save receipts separately
    const stripped = data.map(exp => {
        const clone = { ...exp };
        delete clone.receiptData;
        return clone;
    });
    const encrypted = await encryptData(stripped);
    await window.db.setItem('expenses', window.db.getExpenseKey(currentUser, year), encrypted);
    await window.db.saveReceipts(currentUser, year, data);
}

async function loadUserData(year) {
    if (!currentUser || !cachedKeyMaterial) return [];
    const encrypted = await window.db.getItem('expenses', window.db.getExpenseKey(currentUser, year));
    if (!encrypted) return [];
    try {
        const decrypted = await decryptData(encrypted);
        if (!Array.isArray(decrypted)) return [];
        return await window.db.loadReceipts(currentUser, year, decrypted);
    } catch (e) {
        console.error('Failed to decrypt data for year', year, e);
        return [];
    }
}

function getCurrentUser() {
    return currentUser;
}

async function logout() {
    const user = currentUser;
    currentUser = null;
    cachedKeyMaterial = null;
    localStorage.removeItem('medtrack_current_user');

    // Clear all IndexedDB data for this user to prevent stale data on shared computers
    if (user && window.db) {
        try {
            const expenseKeys = await window.db.getAllKeys('expenses');
            for (const key of expenseKeys) {
                if (key.startsWith(`expenses_${user}_`)) {
                    await window.db.removeItem('expenses', key);
                }
            }
            const receiptKeys = await window.db.getAllKeys('receipts');
            for (const key of receiptKeys) {
                if (key.startsWith(`receipt_${user}_`)) {
                    await window.db.removeItem('receipts', key);
                }
            }
        } catch (e) {
            console.warn('Failed to clear IndexedDB during logout', e);
        }
    }

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
        if (savedUser && hasUser(savedUser)) {
            renderAuthOverlay(savedUser);
        } else {
            renderAuthOverlay();
        }
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
                <div class="auth-error visible">
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

            <div class="auth-tabs ${isReturning ? 'hidden' : ''}" id="authTabs">
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
            document.getElementById('authTabs').classList.remove('hidden');
            loginForm.classList.remove('hidden');
            document.getElementById('authLoginUser').focus();
            clearAuthError();
        });
    }
}

function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) {
        overlay.classList.add('fade-out');
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
    const valid = await verifyPassword(password, username, hash);
    if (!valid) {
        showAuthError('Incorrect password.');
        return;
    }

    await onLoginSuccess(username, password);
    password = null;
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
    const valid = await verifyPassword(password, username, hash);
    if (!valid) {
        showAuthError('Incorrect password.');
        return;
    }

    await onLoginSuccess(username, password);
    password = null;
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

    const { hash, salt, iv } = await createVerificationHash(password);
    addUser(username);
    setVerificationHash(username, hash);
    setUserSalt(username, salt);
    setUserIv(username, iv);

    await onLoginSuccess(username, password);
    password = null;
}

// ========================================
// Legacy Data Migration
// ========================================

async function migrateLegacyData(user) {
    if (!window.db) return false;
    let migrated = false;
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`medtrack_data_${user}_`)) {
            const encrypted = localStorage.getItem(key);
            if (encrypted) {
                const year = key.replace(`medtrack_data_${user}_`, '');
                await window.db.setItem('expenses', window.db.getExpenseKey(user, year), encrypted);
                // Migrate inline receipts to separate store
                try {
                    const decrypted = await decryptData(encrypted);
                    if (Array.isArray(decrypted)) {
                        await window.db.saveReceipts(user, year, decrypted);
                        // Re-save without receiptData
                        const stripped = decrypted.map(exp => {
                            const clone = { ...exp };
                            delete clone.receiptData;
                            return clone;
                        });
                        const reEncrypted = await encryptData(stripped);
                        await window.db.setItem('expenses', window.db.getExpenseKey(user, year), reEncrypted);
                    }
                } catch (e) {
                    console.warn('Migration failed for year', year, e);
                }
                localStorage.removeItem(key);
                migrated = true;
            }
        }
    }
    return migrated;
}

// ========================================
// Login Success
// ========================================

async function onLoginSuccess(username, password) {
    currentUser = username;
    await setPassword(password);
    password = null; // help GC
    localStorage.setItem('medtrack_current_user', username);

    // Migrate any legacy localStorage data to IndexedDB
    migrateLegacyData(username).then(migrated => {
        if (migrated) {
            console.log('Migrated legacy localStorage data to IndexedDB');
        }
    }).catch(err => {
        console.warn('Migration check failed', err);
    });

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
    return div.innerHTML.replace(/"/g, '&quot;');
}

// ========================================
// Expose
// ========================================

window.initAuth = initAuth;
window.logout = logout;
window.getCurrentUser = getCurrentUser;
window.saveUserData = saveUserData;
window.loadUserData = loadUserData;
window.renderUserBadge = renderUserBadge;
