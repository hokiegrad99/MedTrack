/* ========================================
   MedTrack Pro — Tax Report Page
   ======================================== */

const categoryColors = {
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
};

const categoryIcons = {
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
};

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
        month: 'long',
        day: 'numeric'
    });
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML.replace(/"/g, '&quot;');
}

async function loadExpenses(year) {
    try {
        return await loadUserData(year);
    } catch (e) {
        return [];
    }
}

async function initReport() {
    await initAuth();
    const params = new URLSearchParams(window.location.search);
    const year = parseInt(params.get('year')) || new Date().getFullYear();

    // Set back button href immediately so it's correct even if auth is slow
    const backBtn = document.getElementById('backToTrackerBtn');
    if (backBtn) {
        backBtn.href = 'index.html?year=' + encodeURIComponent(year);
    }

    document.getElementById('reportYear').textContent = year;
    document.title = `Medical Expense Tax Summary — ${year}`;

    const expenses = await loadExpenses(year);
    renderReport(expenses, year);
    initDarkMode();
    renderUserBadge();
    startBackupReminder();
    renderLastExport();
}

function initDarkMode() {
    // Check for saved preference or system preference
    const savedMode = localStorage.getItem('medtrack_darkMode');
    if (savedMode === 'true') {
        document.body.classList.add('dark-mode');
    } else if (savedMode === null && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
    }
    
    const toggleBtn = document.getElementById('reportDarkModeToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleDarkMode);
    }
}

function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('medtrack_darkMode', isDark ? 'true' : 'false');
}

function renderReport(expenses, year) {
    // Summary stats
    const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const insuranceTotal = expenses.reduce((sum, exp) => sum + (exp.insuranceCovered || 0), 0);
    const netTotal = total - insuranceTotal;
    const count = expenses.length;
    const max = count > 0 ? Math.max(...expenses.map(exp => exp.amount)) : 0;
    const avg = count > 0 ? netTotal / count : 0;

    // Sort by date ascending for report
    const sorted = [...expenses].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Date range
    let dateRange = '—';
    if (sorted.length > 0) {
        const first = formatDate(sorted[0].date);
        const last = formatDate(sorted[sorted.length - 1].date);
        dateRange = first === last ? first : `${first} – ${last}`;
    }

    document.getElementById('reportTotal').textContent = formatCurrency(total);
    document.getElementById('reportInsuranceCovered').textContent = formatCurrency(insuranceTotal);
    document.getElementById('reportNet').textContent = formatCurrency(netTotal);
    document.getElementById('reportEntries').textContent = count.toLocaleString();
    document.getElementById('reportDateRange').textContent = dateRange;
    document.getElementById('reportLargest').textContent = formatCurrency(max);
    document.getElementById('reportGenerated').textContent = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
    });

    // Category breakdown
    renderCategoryBreakdown(expenses, netTotal);

    // Itemized list
    renderItemizedList(sorted, netTotal);
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

function renderCategoryBreakdown(expenses, total) {
    const tbody = document.getElementById('reportCategoryBody');
    const totalEl = document.getElementById('reportCategoryTotal');

    if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#94a3b8;padding:24px">No expenses recorded for this tax year.</td></tr>';
        totalEl.textContent = '$0.00';
        return;
    }

    const categoryTotals = {};
    expenses.forEach(exp => {
        categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
    });

    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    tbody.innerHTML = sortedCategories.map(([category, amount]) => {
        const percent = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
        const color = categoryColors[category] || '#64748b';
        const iconClass = categoryIcons[category] || 'fa-notes-medical';

        return `
            <tr>
                <td>
                    <span class="report-category-badge" style="color: ${color};">
                        <i class="fa-solid ${iconClass}"></i> ${escapeHtml(category)}
                    </span>
                </td>
                <td class="text-right">${formatCurrency(amount)}</td>
                <td class="text-right">${percent}%</td>
            </tr>
        `;
    }).join('');

    totalEl.textContent = formatCurrency(total);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHtml(message)}`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

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

function renderItemizedList(expenses, netTotal) {
    const tbody = document.getElementById('reportItemizedBody');
    const totalEl = document.getElementById('reportItemizedTotal');
    const insuranceEl = document.getElementById('reportInsuranceTotal');
    const netEl = document.getElementById('reportNetTotal');

    if (expenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:24px">No expenses recorded for this tax year.</td></tr>';
        totalEl.textContent = '$0.00';
        if (insuranceEl) insuranceEl.textContent = '$0.00';
        if (netEl) netEl.textContent = '$0.00';
        return;
    }

    let totalAmount = 0;
    let totalInsurance = 0;

    tbody.innerHTML = expenses.map((exp, index) => {
        const color = categoryColors[exp.category] || '#64748b';
        const iconClass = categoryIcons[exp.category] || 'fa-notes-medical';
        const insurance = exp.insuranceCovered || 0;
        const net = exp.amount - insurance;
        totalAmount += exp.amount;
        totalInsurance += insurance;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${formatDate(exp.date)}</td>
                <td>
                    <span class="report-category-badge" style="color: ${color};">
                        <i class="fa-solid ${iconClass}"></i> ${escapeHtml(exp.category)}
                    </span>
                </td>
                <td>${escapeHtml(exp.provider)}</td>
                <td>${escapeHtml(exp.description || '—')}</td>
                <td class="text-right amount">${formatCurrency(exp.amount)}</td>
                <td class="text-right amount insurance-cell">${insurance > 0 ? formatCurrency(insurance) : '—'}</td>
                <td class="text-right amount net-cell">${formatCurrency(net)}</td>
            </tr>
        `;
    }).join('');

    totalEl.textContent = formatCurrency(totalAmount);
    if (insuranceEl) insuranceEl.textContent = formatCurrency(totalInsurance);
    if (netEl) netEl.textContent = formatCurrency(netTotal);
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW registered:', reg.scope))
            .catch(err => console.log('SW registration failed:', err));
    });
}

initReport();
