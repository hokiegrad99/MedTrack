/* ========================================
   MedTrack Pro — Medical Expense Tracker
   JavaScript Application Logic
   ======================================== */

// ========================================
// State
// ========================================

const state = {
    expenses: [],
    taxYear: new Date().getFullYear(),
    sortColumn: 'date',
    sortDirection: 'desc',
    filterCategory: '',
    searchQuery: '',
    deleteTargetId: null,
    editTargetId: null,
    tablePage: 1,
    itemsPerPage: 20,
    dateRangeFrom: '',
    dateRangeTo: '',
    categoryColors: {
        'Doctor Visit': '#0d9488',
        'Prescription': '#3b82f6',
        'Hospital': '#ef4444',
        'Dental': '#8b5cf6',
        'Vision': '#06b6d4',
        'Mental Health': '#ec4899',
        'Physical Therapy': '#f59e0b',
        'Lab / Imaging': '#6366f1',
        'Insurance Premium': '#10b981',
        'Medical Supplies': '#84cc16',
        'Transportation': '#f97316',
        'Other': '#64748b'
    },
    categoryIcons: {
        'Doctor Visit': 'fa-user-doctor',
        'Prescription': 'fa-prescription-bottle-medical',
        'Hospital': 'fa-hospital',
        'Dental': 'fa-tooth',
        'Vision': 'fa-glasses',
        'Mental Health': 'fa-brain',
        'Physical Therapy': 'fa-person-walking',
        'Lab / Imaging': 'fa-microscope',
        'Insurance Premium': 'fa-shield-heart',
        'Medical Supplies': 'fa-kit-medical',
        'Transportation': 'fa-car',
        'Other': 'fa-notes-medical'
    }
};

// ========================================
// DOM Elements
// ========================================

const elements = {
    taxYear: document.getElementById('taxYear'),
    customTaxYear: document.getElementById('customTaxYear'),
    customTaxYearBtn: document.getElementById('customTaxYearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    totalExpenses: document.getElementById('totalExpenses'),
    netExpenses: document.getElementById('netExpenses'),
    totalEntries: document.getElementById('totalEntries'),
    largestExpense: document.getElementById('largestExpense'),
    averageExpense: document.getElementById('averageExpense'),
    totalInsuranceCovered: document.getElementById('totalInsuranceCovered'),
    expenseForm: document.getElementById('expenseForm'),
    expenseId: document.getElementById('expenseId'),
    date: document.getElementById('date'),
    category: document.getElementById('category'),
    provider: document.getElementById('provider'),
    amount: document.getElementById('amount'),
    insuranceCovered: document.getElementById('insuranceCovered'),
    description: document.getElementById('description'),
    receipt: document.getElementById('receipt'),
    fileName: document.getElementById('fileName'),
    notes: document.getElementById('notes'),
    submitBtn: document.getElementById('submitBtn'),
    cancelEditBtn: document.getElementById('cancelEditBtn'),
    clearFormBtn: document.getElementById('clearFormBtn'),
    breakdownList: document.getElementById('breakdownList'),
    searchInput: document.getElementById('searchInput'),
    filterCategory: document.getElementById('filterCategory'),
    expenseTable: document.getElementById('expenseTable'),
    expenseTableBody: document.getElementById('expenseTableBody'),
    loadMoreBtn: document.getElementById('loadMoreBtn'),
    showAllBtn: document.getElementById('showAllBtn'),
    tableCounter: document.getElementById('tableCounter'),
    itemsPerPage: document.getElementById('itemsPerPage'),
    dateRangeFrom: document.getElementById('dateRangeFrom'),
    dateRangeTo: document.getElementById('dateRangeTo'),
    toastContainer: document.getElementById('toastContainer'),
    deleteModal: document.getElementById('deleteModal'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    importModal: document.getElementById('importModal'),
    importModalBody: document.getElementById('importModalBody'),
    cancelImportBtn: document.getElementById('cancelImportBtn'),
    confirmImportBtn: document.getElementById('confirmImportBtn'),
    importCount: document.getElementById('importCount'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    reportBtn: document.getElementById('reportBtn')
};

// ========================================
// Initialization
// ========================================

async function init() {
    populateTaxYearOptions();
    // Check URL for year parameter (e.g., returning from report page)
    const urlParams = new URLSearchParams(window.location.search);
    const yearParam = parseInt(urlParams.get('year'));
    if (yearParam && !isNaN(yearParam)) {
        const option = elements.taxYear.querySelector(`option[value="${yearParam}"]`);
        if (option) {
            option.selected = true;
            state.taxYear = yearParam;
        }
        // Clean up the URL so a refresh doesn't keep the param
        if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
    await initAuth();
    setupEventListeners();
    setDefaultDate();
    initDarkMode();
    await loadData();
    renderAll();
    renderUserBadge();
    startBackupReminder();
    renderLastExport();
    checkExportOverdue();
}

function initDarkMode() {
    // Check for saved preference or system preference
    const savedMode = localStorage.getItem('medtrack_darkMode');
    if (savedMode === 'true') {
        document.body.classList.add('dark-mode');
    } else if (savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
    }
    
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('medtrack_darkMode', isDark ? 'true' : 'false');
    showToast(isDark ? 'Dark mode enabled' : 'Light mode enabled', 'success');
}

function populateTaxYearOptions() {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 5; y >= currentYear; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        elements.taxYear.appendChild(option);
    }
}

async function handleTaxYearChange(e) {
    const year = parseInt(e.target.value);
    state.taxYear = year;
    state.tablePage = 1;
    await loadData();
    renderAll();
    // Update URL so a bookmark or refresh keeps the current year
    if (window.history.replaceState) {
        window.history.replaceState({}, document.title, '?year=' + year);
    }
}

function handleCustomYear() {
    const rawValue = elements.customTaxYear.value.trim();
    const year = parseInt(rawValue, 10);

    if (isNaN(year) || !rawValue) {
        showToast('Please enter a valid year', 'error');
        return;
    }

    if (year < 1900 || year > 2100) {
        showToast('Year must be between 1900 and 2100', 'error');
        return;
    }

    // Check if year already exists in dropdown
    let option = elements.taxYear.querySelector(`option[value="${year}"]`);
    if (!option) {
        // Add new option in sorted order
        const options = Array.from(elements.taxYear.options);
        let inserted = false;
        for (let i = 0; i < options.length; i++) {
            if (parseInt(options[i].value) < year) {
                const newOption = document.createElement('option');
                newOption.value = year;
                newOption.textContent = year;
                elements.taxYear.insertBefore(newOption, options[i]);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            const newOption = document.createElement('option');
            newOption.value = year;
            newOption.textContent = year;
            elements.taxYear.appendChild(newOption);
        }
        option = elements.taxYear.querySelector(`option[value="${year}"]`);
    }

    option.selected = true;
    elements.customTaxYear.value = '';
    // Dispatch change event so the standard tax-year handler runs everything consistently
    elements.taxYear.dispatchEvent(new Event('change', { bubbles: true }));
}

function setDefaultDate() {
    elements.date.valueAsDate = new Date();
}

let searchDebounceTimer = null;

function setupEventListeners() {
    elements.taxYear.addEventListener('change', handleTaxYearChange);

    elements.customTaxYearBtn.addEventListener('click', handleCustomYear);
    elements.customTaxYear.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCustomYear();
    });

    elements.expenseForm.addEventListener('submit', handleFormSubmit);

    elements.receipt.addEventListener('change', handleFileSelect);

    elements.clearFormBtn.addEventListener('click', clearForm);

    elements.cancelEditBtn.addEventListener('click', cancelEdit);

    elements.exportBtn.addEventListener('click', exportCSV);
    elements.exportJsonBtn.addEventListener('click', exportJSON);

    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            state.searchQuery = e.target.value.toLowerCase();
            state.tablePage = 1;
            renderTable();
        }, 200);
    });

    elements.filterCategory.addEventListener('change', (e) => {
        state.filterCategory = e.target.value;
        state.tablePage = 1;
        renderTable();
    });

    elements.itemsPerPage.addEventListener('change', (e) => {
        state.itemsPerPage = parseInt(e.target.value, 10);
        state.tablePage = 1;
        renderTable();
    });

    elements.dateRangeFrom.addEventListener('change', (e) => {
        state.dateRangeFrom = e.target.value;
        state.tablePage = 1;
        renderTable();
    });

    elements.dateRangeTo.addEventListener('change', (e) => {
        state.dateRangeTo = e.target.value;
        state.tablePage = 1;
        renderTable();
    });

    elements.expenseTable.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });

    elements.cancelDeleteBtn.addEventListener('click', hideDeleteModal);
    elements.confirmDeleteBtn.addEventListener('click', () => confirmDelete().catch(console.error));

    // Close modal on overlay click
    elements.deleteModal.addEventListener('click', (e) => {
        if (e.target === elements.deleteModal) hideDeleteModal();
    });

    // Load more button
    if (elements.loadMoreBtn) {
        elements.loadMoreBtn.addEventListener('click', () => {
            state.tablePage += 1;
            renderTable();
        });
    }

    // Show all button
    if (elements.showAllBtn) {
        elements.showAllBtn.addEventListener('click', () => {
            state.tablePage = Infinity;
            renderTable();
        });
    }

    // Event delegation for edit/delete buttons (replaces inline onclick handlers)
    elements.expenseTableBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.action-edit');
        const deleteBtn = e.target.closest('.action-delete');
        if (editBtn) {
            e.stopPropagation();
            populateEditForm(editBtn.dataset.id);
        } else if (deleteBtn) {
            e.stopPropagation();
            showDeleteModal(deleteBtn.dataset.id);
        }
    });

    // Keyboard shortcut: Escape to cancel edit / close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!elements.importModal.classList.contains('hidden')) {
                hideImportModal();
            } else if (!elements.deleteModal.classList.contains('hidden')) {
                hideDeleteModal();
            } else if (state.editTargetId) {
                cancelEdit();
            }
        }
    });

    // Trap focus in delete modal
    elements.deleteModal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const focusable = elements.deleteModal.querySelectorAll('button');
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    // Import handlers
    elements.importBtn.addEventListener('click', () => elements.importFile.click());
    elements.importFile.addEventListener('change', handleImportFile);

    if (elements.reportBtn) {
        elements.reportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'report.html?year=' + encodeURIComponent(elements.taxYear.value);
        });
    }
    elements.cancelImportBtn.addEventListener('click', hideImportModal);
    elements.confirmImportBtn.addEventListener('click', () => confirmImport().catch(console.error));
    elements.importModal.addEventListener('click', (e) => {
        if (e.target === elements.importModal) hideImportModal();
    });
    elements.importModal.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            const focusable = elements.importModal.querySelectorAll('button');
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });
}

// ========================================
// Data Persistence
// ========================================

async function loadData() {
    try {
        state.expenses = await loadUserData(state.taxYear);
    } catch (e) {
        state.expenses = [];
        showToast('Error loading saved data', 'error');
    }
}

async function saveData() {
    try {
        await saveUserData(state.taxYear, state.expenses);
    } catch (e) {
        showToast('Error saving data. Storage may be full.', 'error');
    }
}

// ========================================
// Form Handling
// ========================================

function handleFileSelect(e) {
    const file = e.target.files[0];
    const uploadWrap = elements.receipt.closest('.file-upload');
    if (file) {
        elements.fileName.textContent = file.name;
        uploadWrap.classList.add('has-file');
    } else {
        elements.fileName.textContent = 'Click to upload receipt';
        uploadWrap.classList.remove('has-file');
    }
}

const MAX_RECEIPT_SIZE = 500 * 1024; // 500KB

async function handleFormSubmit(e) {
    e.preventDefault();

    const amount = parseFloat(elements.amount.value) || 0;
    const insuranceCovered = parseFloat(elements.insuranceCovered.value) || 0;
    
    // Validate insurance covered doesn't exceed amount
    if (insuranceCovered > amount) {
        showToast('Insurance covered cannot exceed total amount', 'error');
        return;
    }

    const expense = {
        id: state.editTargetId || generateId(),
        date: elements.date.value,
        category: elements.category.value,
        provider: elements.provider.value.trim(),
        amount: amount,
        insuranceCovered: insuranceCovered,
        description: elements.description.value.trim(),
        notes: elements.notes.value.trim(),
        receiptName: null,
        receiptData: null,
        createdAt: state.editTargetId ? findExpense(state.editTargetId)?.createdAt || new Date().toISOString() : new Date().toISOString()
    };

    // Handle receipt file
    const file = elements.receipt.files[0];
    if (file) {
        if (file.size > MAX_RECEIPT_SIZE) {
            showToast('Receipt too large. Max size is 500KB.', 'error');
            return;
        }
        expense.receiptName = file.name;
        try {
            expense.receiptData = await compressImage(file);
        } catch (err) {
            showToast('Error reading receipt file', 'error');
            return;
        }
    } else if (state.editTargetId) {
        if (elements.expenseForm.dataset.removeReceipt === 'true') {
            // User explicitly removed receipt during edit
            expense.receiptName = null;
            expense.receiptData = null;
        } else {
            // Preserve existing receipt when editing without changing it
            const existing = findExpense(state.editTargetId);
            if (existing) {
                expense.receiptName = existing.receiptName;
                expense.receiptData = existing.receiptData;
            }
        }
    }
    delete elements.expenseForm.dataset.removeReceipt;

    if (state.editTargetId) {
        const index = state.expenses.findIndex(exp => exp.id === state.editTargetId);
        if (index !== -1) {
            state.expenses[index] = expense;
            showToast('Expense updated successfully', 'success');
        }
        cancelEdit();
    } else {
        state.expenses.push(expense);
        showToast('Expense added successfully', 'success');
        clearForm();
    }

    await saveData();
    state.tablePage = 1;
    renderAll();
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function compressImage(file, maxWidth = 800, quality = 0.85) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) {
            // Non-image files: read as-is
            readFileAsBase64(file).then(resolve).catch(reject);
            return;
        }

        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', quality);
            resolve(compressed);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image for compression'));
        };
        img.src = url;
    });
}

function clearForm() {
    elements.expenseForm.reset();
    elements.expenseId.value = '';
    setDefaultDate();
    elements.insuranceCovered.value = '0';

    const uploadWrap = elements.receipt.closest('.file-upload');
    elements.fileName.textContent = 'Click to upload receipt';
    uploadWrap.classList.remove('has-file');

    // Clean up remove-receipt link
    const removeLink = uploadWrap.querySelector('.remove-receipt');
    if (removeLink) removeLink.remove();

    if (state.editTargetId) {
        state.editTargetId = null;
        elements.submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Expense';
        elements.cancelEditBtn.classList.add('hidden');
    }
}

function cancelEdit() {
    state.editTargetId = null;
    elements.submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Save Expense';
    elements.cancelEditBtn.classList.add('hidden');
    clearForm();
}

function populateEditForm(id) {
    const expense = findExpense(id);
    if (!expense) return;

    // Clear stale flags from previous edits
    delete elements.expenseForm.dataset.removeReceipt;

    state.editTargetId = id;
    elements.expenseId.value = id;
    elements.date.value = expense.date;
    elements.category.value = expense.category;
    elements.provider.value = expense.provider;
    elements.amount.value = expense.amount;
    elements.insuranceCovered.value = expense.insuranceCovered || 0;
    elements.description.value = expense.description || '';
    elements.notes.value = expense.notes || '';

    const uploadWrap = elements.receipt.closest('.file-upload');

    // Always clear any old remove-receipt link first
    const oldRemoveLink = uploadWrap.querySelector('.remove-receipt');
    if (oldRemoveLink) oldRemoveLink.remove();

    if (expense.receiptName) {
        elements.fileName.textContent = expense.receiptName;
        uploadWrap.classList.add('has-file');
    } else {
        elements.fileName.textContent = 'Click to upload receipt';
        uploadWrap.classList.remove('has-file');
    }

    elements.submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Update Expense';
    elements.cancelEditBtn.classList.remove('hidden');

    // Add remove-receipt link if there is an existing receipt
    if (expense.receiptName) {
        const removeLink = document.createElement('button');
        removeLink.type = 'button';
        removeLink.className = 'btn-text remove-receipt';
        removeLink.textContent = 'Remove';
        removeLink.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            elements.expenseForm.dataset.removeReceipt = 'true';
            elements.fileName.textContent = 'Click to upload receipt';
            uploadWrap.classList.remove('has-file');
            removeLink.remove();
        });
        elements.fileName.parentElement.appendChild(removeLink);
    }

    // Scroll to form on mobile
    if (window.innerWidth <= 1024) {
        elements.expenseForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ========================================
// CRUD Helpers
// ========================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function isValidReceiptData(data) {
    return typeof data === 'string' && data.startsWith('data:');
}

function findExpense(id) {
    return state.expenses.find(exp => exp.id === id);
}

let lastFocusedElement = null;

function showDeleteModal(id) {
    lastFocusedElement = document.activeElement;
    state.deleteTargetId = id;
    elements.deleteModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        elements.deleteModal.classList.add('show');
        elements.cancelDeleteBtn.focus();
    });
}

function hideDeleteModal() {
    elements.deleteModal.classList.remove('show');
    setTimeout(() => {
        elements.deleteModal.classList.add('hidden');
        state.deleteTargetId = null;
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }, 200);
}

async function confirmDelete() {
    if (!state.deleteTargetId) return;

    const index = state.expenses.findIndex(exp => exp.id === state.deleteTargetId);
    if (index !== -1) {
        const expenseId = state.deleteTargetId;
        state.expenses.splice(index, 1);
        // Remove orphaned receipt from IndexedDB
        const user = getCurrentUser();
        if (user && window.db) {
            await window.db.removeReceipt(user, state.taxYear, expenseId);
        }
        await saveData();
        showToast('Expense deleted', 'success');
        state.tablePage = 1;
        renderAll();
    }

    hideDeleteModal();
}

// ========================================
// Sorting & Filtering
// ========================================

function handleSort(column) {
    if (state.sortColumn === column) {
        state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortColumn = column;
        state.sortDirection = 'asc';
    }
    state.tablePage = 1;
    renderTable();
    updateSortIcons();
}

function getFilteredAndSortedExpenses() {
    let result = [...state.expenses];

    // Filter by category
    if (state.filterCategory) {
        result = result.filter(exp => exp.category === state.filterCategory);
    }

    // Search
    if (state.searchQuery) {
        result = result.filter(exp =>
            exp.provider.toLowerCase().includes(state.searchQuery) ||
            (exp.description && exp.description.toLowerCase().includes(state.searchQuery)) ||
            exp.category.toLowerCase().includes(state.searchQuery)
        );
    }

    // Date range filter
    if (state.dateRangeFrom) {
        result = result.filter(exp => exp.date >= state.dateRangeFrom);
    }
    if (state.dateRangeTo) {
        result = result.filter(exp => exp.date <= state.dateRangeTo);
    }

    // Sort
    result.sort((a, b) => {
        let comparison = 0;
        switch (state.sortColumn) {
            case 'date':
                comparison = new Date(a.date) - new Date(b.date);
                break;
            case 'category':
                comparison = a.category.localeCompare(b.category);
                break;
            case 'provider':
                comparison = a.provider.localeCompare(b.provider);
                break;
            case 'description':
                comparison = (a.description || '').localeCompare(b.description || '');
                break;
            case 'amount':
                comparison = a.amount - b.amount;
                break;
            case 'insuranceCovered':
                comparison = (a.insuranceCovered || 0) - (b.insuranceCovered || 0);
                break;
            case 'outOfPocket':
                const aNet = a.amount - (a.insuranceCovered || 0);
                const bNet = b.amount - (b.insuranceCovered || 0);
                comparison = aNet - bNet;
                break;
        }
        return state.sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
}

function updateSortIcons() {
    elements.expenseTable.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('sorted');
        const icon = th.querySelector('i');
        icon.className = 'fa-solid fa-sort';
        th.removeAttribute('aria-sort');

        if (th.dataset.sort === state.sortColumn) {
            th.classList.add('sorted');
            const isAsc = state.sortDirection === 'asc';
            icon.className = isAsc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
            th.setAttribute('aria-sort', isAsc ? 'ascending' : 'descending');
        } else {
            th.setAttribute('aria-sort', 'none');
        }
    });
}

// ========================================
// Category-to-CSS-class helpers
// ========================================

function catClass(category) {
    return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

// ========================================
// Dynamic Stylesheet (CSP-safe)
// ========================================

function updateDynamicStyles(css) {
    let styleEl = document.getElementById('medtrack-dynamic-styles');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'medtrack-dynamic-styles';
        document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;
}

// ========================================
// Rendering
// ========================================

function renderAll() {
    renderSummary();
    renderBreakdown();
    renderTable();
    updateSortIcons();
}

function renderSummary() {
    const total = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const insuranceTotal = state.expenses.reduce((sum, exp) => sum + (exp.insuranceCovered || 0), 0);
    const netTotal = total - insuranceTotal;
    const count = state.expenses.length;
    const max = count > 0 ? Math.max(...state.expenses.map(exp => exp.amount)) : 0;
    const avg = count > 0 ? netTotal / count : 0;

    if (elements.totalExpenses) animateValue(elements.totalExpenses, total, formatCurrency);
    if (elements.netExpenses) animateValue(elements.netExpenses, netTotal, formatCurrency);
    if (elements.totalEntries) animateValue(elements.totalEntries, count, (n) => n.toLocaleString());
    if (elements.largestExpense) animateValue(elements.largestExpense, max, formatCurrency);
    if (elements.averageExpense) animateValue(elements.averageExpense, avg, formatCurrency);
    if (elements.totalInsuranceCovered) animateValue(elements.totalInsuranceCovered, insuranceTotal, formatCurrency);
}

function animateValue(element, target, formatter) {
    const currentText = element.textContent;
    const current = parseFloat(currentText.replace(/[^0-9.-]/g, '')) || 0;
    if (Math.abs(current - target) < 0.01) {
        element.textContent = formatter(target);
        return;
    }

    const duration = 400;
    const start = performance.now();

    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const value = current + (target - current) * eased;
        element.textContent = formatter(value);
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function renderBreakdown() {
    if (state.expenses.length === 0) {
        elements.breakdownList.innerHTML = '<div class="empty-breakdown">Add expenses to see breakdown</div>';
        return;
    }

    const total = state.expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const categoryTotals = {};

    state.expenses.forEach(exp => {
        categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
    });

    const sortedCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    let dynamicCss = '';
    elements.breakdownList.innerHTML = sortedCategories.map(([category, amount], index) => {
        const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
        const cssClass = catClass(category);
        const iconClass = state.categoryIcons[category] || 'fa-notes-medical';
        dynamicCss += `.breakdown-bar-fill.bar-width-${index} { width: ${percent}%; }\n`;

        return `
            <div class="breakdown-item">
                <span class="breakdown-category"><i class="fa-solid ${iconClass} cat-icon-${cssClass} mr-6"></i>${category}</span>
                <div class="breakdown-bar-track">
                    <div class="breakdown-bar-fill cat-bar-${cssClass} bar-width-${index}"></div>
                </div>
                <span class="breakdown-amount">${formatCurrency(amount)}</span>
                <span class="breakdown-percent">${percent}%</span>
            </div>
        `;
    }).join('');

    updateDynamicStyles(dynamicCss);
}

function renderTable() {
    const expenses = getFilteredAndSortedExpenses();

    if (expenses.length === 0) {
        elements.expenseTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fa-solid fa-clipboard-list"></i>
                        <p>${state.expenses.length === 0 ? 'No expenses recorded yet' : 'No matching expenses'}</p>
                        <span>${state.expenses.length === 0 ? 'Use the form to add your first medical expense' : 'Try adjusting your search or filter'}</span>
                    </div>
                </td>
            </tr>
        `;
        if (elements.loadMoreBtn) elements.loadMoreBtn.classList.add('hidden');
        if (elements.showAllBtn) elements.showAllBtn.classList.add('hidden');
        if (elements.tableCounter) elements.tableCounter.textContent = '';
        return;
    }

    const limit = state.tablePage * state.itemsPerPage;
    const visible = expenses.slice(0, limit);
    const hasMore = expenses.length > visible.length;

    if (elements.tableCounter) {
        if (visible.length === expenses.length) {
            elements.tableCounter.textContent = `Showing all ${expenses.length} transactions`;
        } else {
            elements.tableCounter.textContent = `Showing ${visible.length} of ${expenses.length} transactions`;
        }
    }

    elements.expenseTableBody.innerHTML = visible.map((exp, index) => {
        const cssClass = catClass(exp.category);
        const iconClass = state.categoryIcons[exp.category] || 'fa-notes-medical';
        const receiptHtml = exp.receiptData && isValidReceiptData(exp.receiptData)
            ? `<a href="${exp.receiptData}" target="_blank" class="receipt-icon" title="${escapeHtml(exp.receiptName || 'View receipt')}"><i class="fa-solid fa-file-image"></i></a>`
            : `<span class="receipt-missing"><i class="fa-regular fa-file"></i></span>`;
        const netAmount = exp.amount - (exp.insuranceCovered || 0);
        const delayClass = Math.min(index, 20);

        return `
            <tr class="row-delay-${delayClass}">
                <td>${formatDate(exp.date)}</td>
                <td>
                    <span class="category-badge cat-badge-${cssClass}">
                        <i class="fa-solid ${iconClass}"></i> ${exp.category}
                    </span>
                </td>
                <td>${escapeHtml(exp.provider)}</td>
                <td>${escapeHtml(exp.description || '—')}</td>
                <td class="amount text-right">${formatCurrency(exp.amount)}</td>
                <td class="amount text-right insurance-col">${exp.insuranceCovered > 0 ? formatCurrency(exp.insuranceCovered) : '—'}</td>
                <td class="amount text-right net-col">${formatCurrency(netAmount)}</td>
                <td class="text-center">${receiptHtml}</td>
                <td class="text-center">
                    <button class="btn-icon action-edit" data-id="${escapeHtml(exp.id)}" title="Edit" aria-label="Edit expense">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon btn-delete action-delete" data-id="${escapeHtml(exp.id)}" title="Delete" aria-label="Delete expense">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (elements.loadMoreBtn) {
        if (hasMore) {
            elements.loadMoreBtn.classList.remove('hidden');
            const remaining = expenses.length - visible.length;
            elements.loadMoreBtn.innerHTML = `<i class="fa-solid fa-chevron-down"></i> Show next ${Math.min(remaining, state.itemsPerPage)} transactions (${remaining} remaining)`;
        } else {
            elements.loadMoreBtn.classList.add('hidden');
        }
    }

    if (elements.showAllBtn) {
        elements.showAllBtn.classList.toggle('hidden', !hasMore);
    }
}

// ========================================
// CSV Import
// ========================================

state.pendingImports = [];

async function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    elements.importFile.value = ''; // reset so same file can be selected again

    let text;
    try {
        text = await file.text();
    } catch (err) {
        showToast('Error reading file', 'error');
        return;
    }

    const isJson = file.name.toLowerCase().endsWith('.json');
    let parsed = [];
    let skipped = [];
    let duplicates = [];

    if (isJson) {
        try {
            const payload = JSON.parse(text);
            const expenses = payload.expenses || payload;
            if (!Array.isArray(expenses)) {
                showToast('JSON file does not contain an expenses array', 'error');
                return;
            }
            for (const exp of expenses) {
                const amount = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount);
                if (!exp.date || !exp.provider || isNaN(amount)) {
                    skipped.push({ row: '-', reason: 'Missing required field(s)', preview: exp.provider || '(empty)' });
                    continue;
                }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(exp.date)) {
                    skipped.push({ row: '-', reason: `Invalid date: ${exp.date}`, preview: exp.provider });
                    continue;
                }
                if (amount < 0) {
                    skipped.push({ row: '-', reason: `Invalid amount: ${exp.amount}`, preview: exp.provider });
                    continue;
                }
                const insuranceCovered = typeof exp.insuranceCovered === 'number' ? exp.insuranceCovered : (exp.insuranceCovered ? parseFloat(exp.insuranceCovered) : 0);
                if (isNaN(insuranceCovered) || insuranceCovered < 0 || insuranceCovered > amount) {
                    skipped.push({ row: '-', reason: 'Invalid insurance covered', preview: exp.provider });
                    continue;
                }
                if (exp.receiptData && !isValidReceiptData(exp.receiptData)) {
                    skipped.push({ row: '-', reason: 'Invalid receipt data URL', preview: exp.provider });
                    continue;
                }
                const validCategories = Object.keys(state.categoryColors);
                const finalCategory = validCategories.includes(exp.category) ? exp.category : 'Other';
                parsed.push({
                    id: exp.id || generateId(),
                    date: exp.date,
                    category: finalCategory,
                    provider: String(exp.provider),
                    amount: exp.amount,
                    insuranceCovered,
                    description: exp.description || '',
                    notes: exp.notes || '',
                    receiptName: exp.receiptName || null,
                    receiptData: exp.receiptData || null,
                    createdAt: exp.createdAt || new Date().toISOString()
                });
            }
        } catch (err) {
            showToast('Invalid JSON file', 'error');
            return;
        }
    } else {
        const rows = parseCSV(text);
        if (rows.length < 2) {
            showToast('CSV file appears empty or invalid', 'error');
            return;
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const colMap = {
            date: headers.indexOf('date'),
            category: headers.indexOf('category'),
            provider: headers.indexOf('provider'),
            description: headers.indexOf('description'),
            amount: headers.indexOf('amount'),
            insuranceCovered: headers.indexOf('insurance covered') !== -1 ? headers.indexOf('insurance covered') : headers.indexOf('insurance_covered') !== -1 ? headers.indexOf('insurance_covered') : headers.indexOf('insurancecovered'),
            notes: headers.indexOf('notes'),
            receipt: headers.indexOf('receipt')
        };

        if (colMap.date === -1 || colMap.provider === -1 || colMap.amount === -1) {
            showToast('CSV missing required columns: Date, Provider, Amount', 'error');
            return;
        }

        const validCategories = Object.keys(state.categoryColors);

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (row.length === 1 && row[0].trim() === '') continue; // skip empty rows

            const date = colMap.date !== -1 ? row[colMap.date]?.trim() : '';
            const provider = colMap.provider !== -1 ? row[colMap.provider]?.trim() : '';
            const amountStr = colMap.amount !== -1 ? row[colMap.amount]?.trim() : '';
            const category = colMap.category !== -1 ? row[colMap.category]?.trim() : '';
            const description = colMap.description !== -1 ? row[colMap.description]?.trim() : '';
            const insuranceStr = colMap.insuranceCovered !== -1 ? row[colMap.insuranceCovered]?.trim() : '';
            const notes = colMap.notes !== -1 ? row[colMap.notes]?.trim() : '';
            const receiptName = colMap.receipt !== -1 ? row[colMap.receipt]?.trim() : '';

            // Validate
            if (!date || !provider || !amountStr) {
                skipped.push({ row: i + 1, reason: 'Missing required field(s)', preview: provider || '(empty)' });
                continue;
            }

            // Validate date format (YYYY-MM-DD)
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                skipped.push({ row: i + 1, reason: `Invalid date: ${date}`, preview: provider });
                continue;
            }

            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount < 0) {
                skipped.push({ row: i + 1, reason: `Invalid amount: ${amountStr}`, preview: provider });
                continue;
            }

            const insuranceCovered = insuranceStr ? parseFloat(insuranceStr) : 0;
            if (isNaN(insuranceCovered) || insuranceCovered < 0) {
                skipped.push({ row: i + 1, reason: `Invalid insurance covered: ${insuranceStr}`, preview: provider });
                continue;
            }
            if (insuranceCovered > amount) {
                skipped.push({ row: i + 1, reason: `Insurance exceeds amount`, preview: provider });
                continue;
            }

            // Use provided category or default to Other
            const finalCategory = validCategories.includes(category) ? category : 'Other';

            parsed.push({
                id: generateId(),
                date,
                category: finalCategory,
                provider,
                amount,
                insuranceCovered,
                description,
                notes,
                receiptName: receiptName || null,
                receiptData: null,
                createdAt: new Date().toISOString()
            });
        }
    }

    // Deduplicate against existing expenses
    const toImport = [];
    for (const exp of parsed) {
        if (isDuplicateExpense(exp)) {
            duplicates.push(exp);
        } else {
            toImport.push(exp);
        }
    }

    state.pendingImports = toImport;
    showImportModal(toImport, skipped, duplicates);
}

function parseCSV(text) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                currentField += '"';
                i++; // skip next quote
            } else if (char === '"') {
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                currentRow.push(currentField);
                currentField = '';
            } else if (char === '\r' || char === '\n') {
                if (char === '\r' && nextChar === '\n') i++;
                currentRow.push(currentField);
                rows.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }

    // Push final field/row
    currentRow.push(currentField);
    if (currentRow.length > 1 || currentRow[0] !== '') {
        rows.push(currentRow);
    }

    return rows;
}

function isDuplicateExpense(expense) {
    return state.expenses.some(e =>
        e.date === expense.date &&
        e.provider === expense.provider &&
        e.amount === expense.amount &&
        e.category === expense.category
    );
}

let importLastFocused = null;

function showImportModal(toImport, skipped, duplicates) {
    importLastFocused = document.activeElement;

    const total = toImport.length + skipped.length + duplicates.length;
    const importedCount = toImport.length;

    elements.importModalBody.innerHTML = `
        <div class="import-summary">
            <div class="import-stat success"><i class="fa-solid fa-check"></i> ${importedCount} to import</div>
            <div class="import-stat warning"><i class="fa-solid fa-triangle-exclamation"></i> ${skipped.length} skipped</div>
            <div class="import-stat info"><i class="fa-solid fa-clone"></i> ${duplicates.length} duplicates</div>
        </div>
        <p>Found <strong>${total}</strong> row(s) in the file.</p>
        ${toImport.length > 0 ? `
        <div class="import-preview">
            <table>
                <thead>
                    <tr><th>Date</th><th>Category</th><th>Provider</th><th>Amount</th><th>Insurance</th></tr>
                </thead>
                <tbody>
                    ${toImport.slice(0, 20).map(exp => `
                        <tr>
                            <td>${escapeHtml(exp.date)}</td>
                            <td>${escapeHtml(exp.category)}</td>
                            <td>${escapeHtml(exp.provider)}</td>
                            <td>${formatCurrency(exp.amount)}</td>
                            <td>${exp.insuranceCovered > 0 ? formatCurrency(exp.insuranceCovered) : '—'}</td>
                        </tr>
                    `).join('')}
                    ${toImport.length > 20 ? `<tr><td colspan="5" class="import-center">...and ${toImport.length - 20} more</td></tr>` : ''}
                </tbody>
            </table>
        </div>
        ` : '<p class="import-muted">No new expenses to import.</p>'}
        ${skipped.length > 0 ? `
        <div class="import-mt">
            <p class="import-label">Skipped rows:</p>
            <div class="import-preview">
                <table>
                    <thead><tr><th>Row</th><th>Reason</th><th>Provider</th></tr></thead>
                    <tbody>
                        ${skipped.slice(0, 10).map(s => `<tr class="skip-row"><td>${s.row}</td><td>${escapeHtml(s.reason)}</td><td>${escapeHtml(s.preview)}</td></tr>`).join('')}
                        ${skipped.length > 10 ? `<tr><td colspan="3" class="import-center">...and ${skipped.length - 10} more</td></tr>` : ''}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    `;

    elements.importCount.textContent = importedCount;
    elements.confirmImportBtn.disabled = importedCount === 0;
    if (importedCount === 0) {
        elements.confirmImportBtn.classList.add('hidden');
    } else {
        elements.confirmImportBtn.classList.remove('hidden');
    }

    elements.importModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        elements.importModal.classList.add('show');
        elements.cancelImportBtn.focus();
    });
}

function hideImportModal() {
    elements.importModal.classList.remove('show');
    setTimeout(() => {
        elements.importModal.classList.add('hidden');
        state.pendingImports = [];
        if (importLastFocused) {
            importLastFocused.focus();
            importLastFocused = null;
        }
    }, 200);
}

async function confirmImport() {
    if (state.pendingImports.length === 0) {
        hideImportModal();
        return;
    }

    state.expenses.push(...state.pendingImports);
    await saveData();
    showToast(`${state.pendingImports.length} expense(s) imported successfully`, 'success');
    hideImportModal();
    state.tablePage = 1;
    renderAll();
}

// ========================================
// CSV Export
// ========================================

function exportCSV() {
    if (state.expenses.length === 0) {
        showToast('No expenses to export', 'error');
        return;
    }

    const headers = ['Date', 'Category', 'Provider', 'Description', 'Amount', 'Insurance Covered', 'Net Out of Pocket', 'Notes', 'Receipt'];
    // Prevent CSV formula injection by prefixing with a single quote (safe for Excel, Sheets, etc.)
    const sanitizeCsv = (val) => {
        const str = String(val);
        if (/^[+=\-@\t\r]/.test(str)) return "'" + str;
        return str;
    };

    const rows = state.expenses.map(exp => [
        exp.date,
        exp.category,
        sanitizeCsv(exp.provider),
        sanitizeCsv(exp.description || ''),
        exp.amount.toFixed(2),
        (exp.insuranceCovered || 0).toFixed(2),
        (exp.amount - (exp.insuranceCovered || 0)).toFixed(2),
        sanitizeCsv((exp.notes || '').replace(/\n/g, ' ')),
        exp.receiptName || ''
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medical-expenses-${state.taxYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('CSV exported successfully', 'success');
    saveExportTimestamp();
}

function exportJSON() {
    if (state.expenses.length === 0) {
        showToast('No expenses to export', 'error');
        return;
    }

    const payload = {
        version: 1,
        app: 'MedTrack Pro',
        exportedAt: new Date().toISOString(),
        taxYear: state.taxYear,
        expenses: state.expenses
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medical-expenses-${state.taxYear}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('JSON exported successfully', 'success');
    saveExportTimestamp();
}

function saveExportTimestamp() {
    localStorage.setItem('medtrack_lastExport', Date.now().toString());
    renderLastExport();
    const banner = document.getElementById('exportBanner');
    if (banner) banner.classList.add('hidden');
}

function renderLastExport() {
    const el = document.getElementById('lastExportTime');
    if (!el) return;
    const ts = localStorage.getItem('medtrack_lastExport');
    if (!ts) {
        el.textContent = ' — Never exported';
        return;
    }
    const parsed = parseInt(ts, 10);
    if (isNaN(parsed)) {
        el.textContent = ' — Never exported';
        return;
    }
    const date = new Date(parsed);
    const formatted = date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
    el.textContent = ` — Last exported: ${formatted}`;
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHtml(message)}`;

    elements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// ========================================
// Utilities
// ========================================

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(value);
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// ========================================
// Export Overdue Banner
// ========================================

function checkExportOverdue() {
    const banner = document.getElementById('exportBanner');
    const exportNowBtn = document.getElementById('exportNowBtn');
    const dismissBtn = document.getElementById('dismissBannerBtn');
    if (!banner) return;

    // If already dismissed this session, don't show again
    if (sessionStorage.getItem('medtrack_bannerDismissed') === 'true') {
        return;
    }

    const ts = localStorage.getItem('medtrack_lastExport');
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const showBanner = !ts || isNaN(parseInt(ts, 10)) || parseInt(ts, 10) < sevenDaysAgo;

    if (showBanner) {
        banner.classList.remove('hidden');
        if (exportNowBtn && !exportNowBtn.dataset.listenerAdded) {
            exportNowBtn.addEventListener('click', () => {
                exportCSV();
            });
            exportNowBtn.dataset.listenerAdded = 'true';
        }
        if (dismissBtn && !dismissBtn.dataset.listenerAdded) {
            dismissBtn.addEventListener('click', () => {
                banner.classList.add('hidden');
                sessionStorage.setItem('medtrack_bannerDismissed', 'true');
            });
            dismissBtn.dataset.listenerAdded = 'true';
        }
    }
}

// ========================================
// Backup Reminder
// ========================================

function startBackupReminder() {
    const initialDelay = 5 * 60 * 1000; // 5 minutes
    const interval = 30 * 60 * 1000; // 30 minutes

    setTimeout(() => {
        showToast('Remember to export your data for backup', 'warning');
        setInterval(() => {
            showToast('Remember to export your data for backup', 'warning');
        }, interval);
    }, initialDelay);
}

// ========================================
// Service Worker Registration (PWA)
// ========================================

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    });
}

// ========================================
// Start
// ========================================

init();
