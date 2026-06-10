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
    exportBtn: document.getElementById('exportBtn'),
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
    darkModeToggle: document.getElementById('darkModeToggle')
};

// ========================================
// Initialization
// ========================================

async function init() {
    populateTaxYearOptions();
    await initAuth();
    setupEventListeners();
    setDefaultDate();
    initDarkMode();
    await loadData();
    renderAll();
    renderUserBadge();
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
    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === currentYear) option.selected = true;
        elements.taxYear.appendChild(option);
    }
}

function setDefaultDate() {
    elements.date.valueAsDate = new Date();
}

let searchDebounceTimer = null;

function setupEventListeners() {
    elements.taxYear.addEventListener('change', async (e) => {
        state.taxYear = parseInt(e.target.value);
        await loadData();
        renderAll();
    });

    elements.expenseForm.addEventListener('submit', handleFormSubmit);

    elements.receipt.addEventListener('change', handleFileSelect);

    elements.clearFormBtn.addEventListener('click', clearForm);

    elements.cancelEditBtn.addEventListener('click', cancelEdit);

    elements.exportBtn.addEventListener('click', exportCSV);

    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            state.searchQuery = e.target.value.toLowerCase();
            renderTable();
        }, 200);
    });

    elements.filterCategory.addEventListener('change', (e) => {
        state.filterCategory = e.target.value;
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
            expense.receiptData = await readFileAsBase64(file);
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
        removeLink.style.marginLeft = '8px';
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
        state.expenses.splice(index, 1);
        await saveData();
        showToast('Expense deleted', 'success');
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

    elements.breakdownList.innerHTML = sortedCategories.map(([category, amount]) => {
        const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
        const color = state.categoryColors[category] || '#64748b';
        const iconClass = state.categoryIcons[category] || 'fa-notes-medical';

        return `
            <div class="breakdown-item">
                <span class="breakdown-category"><i class="fa-solid ${iconClass}" style="color:${color};margin-right:6px;"></i>${category}</span>
                <div class="breakdown-bar-track">
                    <div class="breakdown-bar-fill" style="width: ${percent}%; background: ${color};"></div>
                </div>
                <span class="breakdown-amount">${formatCurrency(amount)}</span>
                <span class="breakdown-percent">${percent}%</span>
            </div>
        `;
    }).join('');
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
        return;
    }

    elements.expenseTableBody.innerHTML = expenses.map((exp, index) => {
        const color = state.categoryColors[exp.category] || '#64748b';
        const iconClass = state.categoryIcons[exp.category] || 'fa-notes-medical';
        const receiptHtml = exp.receiptData
            ? `<a href="${exp.receiptData}" target="_blank" class="receipt-icon" title="${escapeHtml(exp.receiptName || 'View receipt')}"><i class="fa-solid fa-file-image"></i></a>`
            : `<span class="receipt-missing"><i class="fa-regular fa-file"></i></span>`;
        const netAmount = exp.amount - (exp.insuranceCovered || 0);

        return `
            <tr style="animation-delay: ${Math.min(index * 0.03, 0.4)}s">
                <td>${formatDate(exp.date)}</td>
                <td>
                    <span class="category-badge" style="background: ${color}15; color: ${color};">
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
                    <button class="btn-icon" title="Edit" aria-label="Edit expense" onclick="populateEditForm('${exp.id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-icon btn-delete" title="Delete" aria-label="Delete expense" onclick="showDeleteModal('${exp.id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
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
    const parsed = [];
    const skipped = [];

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

    // Deduplicate against existing expenses
    const toImport = [];
    const duplicates = [];
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
        <p>Found <strong>${total}</strong> row(s) in the CSV file.</p>
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
                    ${toImport.length > 20 ? `<tr><td colspan="5" style="text-align:center;color:var(--gray-400)">...and ${toImport.length - 20} more</td></tr>` : ''}
                </tbody>
            </table>
        </div>
        ` : '<p style="color:var(--gray-500)">No new expenses to import.</p>'}
        ${skipped.length > 0 ? `
        <div style="margin-top:12px">
            <p style="font-size:0.8125rem;font-weight:600;color:var(--gray-600)">Skipped rows:</p>
            <div class="import-preview">
                <table>
                    <thead><tr><th>Row</th><th>Reason</th><th>Provider</th></tr></thead>
                    <tbody>
                        ${skipped.slice(0, 10).map(s => `<tr class="skip-row"><td>${s.row}</td><td>${escapeHtml(s.reason)}</td><td>${escapeHtml(s.preview)}</td></tr>`).join('')}
                        ${skipped.length > 10 ? `<tr><td colspan="3" style="text-align:center;color:var(--gray-400)">...and ${skipped.length - 10} more</td></tr>` : ''}
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
    // Prevent CSV formula injection by prefixing with a tab character
    const sanitizeCsv = (val) => {
        const str = String(val);
        if (/^[+=\-@\t\r]/.test(str)) return '\t' + str;
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
}

// ========================================
// Toast Notifications
// ========================================

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation';
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
    return div.innerHTML;
}

// ========================================
// Start
// ========================================

// Expose functions needed by inline onclick handlers
window.populateEditForm = populateEditForm;
window.showDeleteModal = showDeleteModal;

init();
