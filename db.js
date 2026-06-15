/* ========================================
   MedTrack Pro — IndexedDB Storage Layer
   Replaces localStorage for encrypted data & receipts
   ======================================== */

const DB_NAME = 'medtrack';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('expenses')) {
                db.createObjectStore('expenses', { keyPath: 'key' });
            }
            if (!db.objectStoreNames.contains('receipts')) {
                db.createObjectStore('receipts', { keyPath: 'key' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

async function getDB() {
    if (!dbPromise) {
        dbPromise = openDB();
    }
    return dbPromise;
}

async function getItem(storeName, key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => {
            if (req.result) {
                resolve(req.result.value);
            } else {
                resolve(null);
            }
        };
        req.onerror = () => reject(req.error);
    });
}

async function setItem(storeName, key, value) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put({ key, value });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function removeItem(storeName, key) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

async function getAllKeys(storeName) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

// ========================================
// Receipt helpers
// ========================================

function getReceiptKey(user, year, expenseId) {
    return `receipt_${user}_${year}_${expenseId}`;
}

function getExpenseKey(user, year) {
    return `expenses_${user}_${year}`;
}

// Strip receiptData from expenses before encryption, save separately
async function saveReceipts(user, year, expenses) {
    for (const exp of expenses) {
        const key = getReceiptKey(user, year, exp.id);
        if (exp.receiptData && isValidReceiptData(exp.receiptData)) {
            await setItem('receipts', key, exp.receiptData);
        } else {
            // Remove orphaned receipt if receiptData was cleared
            await removeItem('receipts', key);
        }
    }
}

// Load receiptData back onto expenses
async function loadReceipts(user, year, expenses) {
    for (const exp of expenses) {
        if (exp.receiptName) {
            const key = getReceiptKey(user, year, exp.id);
            const receiptData = await getItem('receipts', key);
            if (receiptData) {
                exp.receiptData = receiptData;
            }
        }
    }
    return expenses;
}

// Remove a single receipt
async function removeReceipt(user, year, expenseId) {
    const key = getReceiptKey(user, year, expenseId);
    await removeItem('receipts', key);
}

function isValidReceiptData(data) {
    return typeof data === 'string' && data.startsWith('data:');
}

// ========================================
// Expose
// ========================================

window.db = {
    getItem,
    setItem,
    removeItem,
    getAllKeys,
    saveReceipts,
    loadReceipts,
    removeReceipt,
    getReceiptKey,
    getExpenseKey
};
