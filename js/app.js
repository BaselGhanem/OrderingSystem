import { db, collection, getDocs, query, where, addDoc, doc, updateDoc, getDoc, onSnapshot } from './firebase.js';

// ==========================================
// 🚀 1. نظام الإشعارات (Toasts)
// ==========================================
window.showToast = function(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ph-info';
    if (type === 'success') icon = 'ph-check-circle';
    if (type === 'error') icon = 'ph-warning-circle';
    if (type === 'warning') icon = 'ph-warning';
    
    toast.innerHTML = `<i class="ph ${icon}" style="font-size: 1.4rem;"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });

    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

// ==========================================
// 📡 2. نظام الاتصال (Offline / Online Indicator)
// ==========================================
function updateOnlineStatus() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    if (!navigator.onLine) {
        banner.classList.add('active');
    } else {
        banner.classList.remove('active');
        if (banner.classList.contains('was-offline')) {
            showToast("عاد الاتصال بالإنترنت، النظام يعمل بكفاءة.", "success");
            banner.classList.remove('was-offline');
        }
    }
}
window.addEventListener('online', () => { 
    const banner = document.getElementById('offline-banner');
    if(banner) banner.classList.add('was-offline');
    updateOnlineStatus(); 
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ==========================================
// 💾 3. الحفظ التلقائي للمسودة (Auto-save Draft)
// ==========================================
function autoSaveDraft() {
    if (!currentRepId || !currentPharmacyName) return;
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value.trim() !== "") {
            items.push(createProductItemFromRow(r));
        }
    });
    const note = document.getElementById('orderNoteInput')?.value || "";
    localStorage.setItem(`draft_${currentRepId}_${currentPharmacyName}`, JSON.stringify({ items, note }));
}

function clearDraft() {
    if (currentRepId && currentPharmacyName) {
        localStorage.removeItem(`draft_${currentRepId}_${currentPharmacyName}`);
    }
}

// ==========================================
// ⚙️ 4. التهيئة الأساسية والمتغيرات
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('notesFeatureSeen')) {
        const featureModal = document.getElementById('featureUpdateModal');
        const closeFeatureBtn = document.getElementById('closeFeatureUpdateBtn');
        
        if(featureModal && closeFeatureBtn) {
            featureModal.style.display = 'flex';
            closeFeatureBtn.addEventListener('click', () => {
                featureModal.style.display = 'none';
                localStorage.setItem('notesFeatureSeen', 'true');
            });
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    if (APP_PAGE === 'login') normalizeLoginUrlAfterSwitch();
    const legacyPass = localStorage.getItem('adminPassword');
    if (legacyPass) localStorage.removeItem('adminPassword');

    const adminSession = getAdminSession();
    if (adminSession) {
        const rememberBox = getEl('rememberAdmin') || getEl('rememberMe');
        if (rememberBox) rememberBox.checked = !!adminSession.remember;
    }

    const printBtn = getEl('printDraftBtn');
    if (printBtn) printBtn.addEventListener('click', () => printCurrentDraft());

    const changePharmacyBtn = getEl('changePharmacyBtn');
    if (changePharmacyBtn) {
        changePharmacyBtn.addEventListener('click', () => {
            sessionStorage.removeItem('activeOrderContext');
            window.location.href = 'login.html';
        });
    }

    getEl('filterAllRep')?.addEventListener('input', filterAllOrders);
    getEl('filterAllPharmacy')?.addEventListener('input', filterAllOrders);
    getEl('filterAllStatus')?.addEventListener('change', filterAllOrders);
    getEl('myOrdersDateFrom')?.addEventListener('change', applyMyOrdersFilters);
    getEl('myOrdersDateTo')?.addEventListener('change', applyMyOrdersFilters);
    getEl('myOrdersPharmacyFilter')?.addEventListener('input', applyMyOrdersFilters);
    getEl('selectAllMyOrders')?.addEventListener('change', function() {
        document.querySelectorAll('.my-order-checkbox').forEach(cb => cb.checked = this.checked);
    });
    getEl('printMyOrdersBtn')?.addEventListener('click', () => printSelectedOrders('.my-order-checkbox', currentMyOrdersData));
    getEl('printManagerOrdersBtn')?.addEventListener('click', () => printSelectedOrders('.order-checkbox', managerOrdersData));
    getEl('printAllOrdersBtn')?.addEventListener('click', () => printSelectedOrders('.all-order-checkbox', allOrdersData));
    getEl('printReportsOrdersBtn')?.addEventListener('click', () => printSelectedOrders('.report-order-checkbox', reportsOrdersData));
});
// 🟢 إضافة: دالة لضبط التاريخ الافتراضي على الشهر الحالي
function setDefaultMonthFilter() {
    const date = new Date();
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    
    // أول يوم في الشهر
    const firstDay = `${y}-${m}-01`;
    
    // آخر يوم في الشهر
    const lastDayDate = new Date(y, date.getMonth() + 1, 0);
    const lastDay = `${y}-${m}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

    const fromInput = document.getElementById('managerFilterFrom');
    const toInput = document.getElementById('managerFilterTo');

    // تعيين التواريخ فقط إذا كانت الحقول فارغة (لعدم الكتابة فوق فلتر المستخدم)
    if (fromInput && !fromInput.value) fromInput.value = firstDay;
    if (toInput && !toInput.value) toInput.value = lastDay;
}
function initializeManagerView(managerName) {
    currentManagerName = managerName;
    isAdmin = true;
    const repsUnder = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === managerName);
    const filterSelect = getEl('managerRepFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">جميع مندوبي</option>';
        for (let rep of repsUnder) {
            const repOption = repSelect ? Array.from(repSelect.options).find(opt => opt.textContent === rep) : null;
            const opt = document.createElement('option');
            opt.value = repOption ? repOption.value : rep;
            opt.textContent = rep;
            filterSelect.appendChild(opt);
        }
    }

    const managerAddBtn = getEl('managerAddNewOrderBtn');
    if (managerAddBtn) {
        managerAddBtn.onclick = () => {
            sessionStorage.setItem('adminOrderMode', '1');
            sessionStorage.removeItem('activeOrderContext');
            window.location.href = 'login.html';
        };
    }

    const loginScreen = getEl('loginScreen');
    const managerScreen = getEl('managerScreen');
    const userInfo = getEl('userInfo');
    if (loginScreen) loginScreen.style.display = 'none';
    if (managerScreen) managerScreen.style.display = 'block';
    if (userInfo) userInfo.style.display = 'flex';
    const currentRepNameEl = getEl('currentRepName');
    if (currentRepNameEl) currentRepNameEl.innerHTML = `<i class="ph ph-user-gear"></i> <b>المدير: ${managerName}</b>`;

    ['navOrderBtn', 'navMyOrdersBtn', 'navReportsBtn'].forEach(id => {
        const el = getEl(id);
        if (el) el.style.display = 'none';
    });

    setDefaultMonthFilter();
    const myTeamBtn = getEl('managerMyTeamBtn');
    const allOrdersBtn = getEl('managerAllOrdersBtn');
    const teamSection = getEl('teamOrdersSection');
    const allSection = getEl('allOrdersSection');

    if (myTeamBtn && allOrdersBtn && teamSection && allSection) {
        myTeamBtn.onclick = () => {
            myTeamBtn.classList.add('active');
            allOrdersBtn.classList.remove('active');
            teamSection.style.display = 'block';
            allSection.style.display = 'none';
            loadManagerOrders();
        };
        allOrdersBtn.onclick = () => {
            myTeamBtn.classList.remove('active');
            allOrdersBtn.classList.add('active');
            teamSection.style.display = 'none';
            allSection.style.display = 'block';
            loadAllCompanyOrders();
        };
        teamSection.style.display = 'block';
        allSection.style.display = 'none';
        myTeamBtn.classList.add('active');
    }
    loadManagerOrders();
}

const repManagerMap = {
    "مراد عمر": "محمد طوالبه",
    "مؤيد الزعبي": "محمد طوالبه",
    "محمد عبدربه": "محمد طوالبه",
    "محمد الفاعوري": "عبدالله الناطور",
    "اجود التلهوني": "عبدالله الناطور",
    "يزيد الرقب": "محمد طوالبه",
    "تامر عقل": "محمد طوالبه",
    "محمد ابو يامين": "عبدالله الناطور",
    "مراد الظاهر": "عبدالله الناطور"
};
// 🟢 إضافة: كلمات سر المندوبين المشفرة (Base64) لحمايتها من القراءة المباشرة
const repPasswordsMap = {
    "قضايا": "MjAyNg==",
    "LPO": "MjAyNg==",
    "Settlement": "MjAyNg==",
    "الهاتف": "MjAyNg==",
    "مراد الظاهر": "MzQ3OA==",
    "محمد ابو يامين": "NDA5OQ==",
    "يزيد الرقب": "NDE4Nw==",
    "محمد النسور": "MjAyNg==",
    "مؤيد الزعبي": "MzQ3OQ==",
    "محمد طوالبه": "MjAyNjA0",
    "اجود التلهوني": "MzczNw==",
    "تامر عقل": "MzU2OQ==",
    "Inactive": "MjAyNg==",
    "مغلقه": "MjAyNg==",
    "اخرين": "MjAyNg==",
    "محمد الفاعوري": "NDAyMA==",
    "مراد عمر": "MTUxMA==",
    "محمد عبدربه": "NDAyOQ=="
};
let productsList = [];
let currentRepId = null;
let currentRepName = null;
let currentPharmacyName = null;
let isAdmin = false;
let currentManagerName = null;
let editingOrderId = null;
let allOrdersData = [];
let detailsModalOrder = null;
let currentPharmacyCode = null;
let currentPharmaciesData = [];
let currentMyOrdersData = [];
let reportsOrdersData = [];

let unsubMyOrders = null;
let unsubManagerOrders = null;
let unsubAllOrders = null;
let unsubReports = null;


const APP_PAGE = document.body?.dataset?.page || 'legacy';
const COMPANY_LOGO_URL = 'https://www.dadgroup.com/wp-content/uploads/2023/11/uplift-dad-website-05.png';
const ADMIN_SESSION_KEY = 'dad_admin_session_v2';
const ADMIN_SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const LEGACY_ADMIN_KEYS = ['managerName', 'adminType', 'authToken', 'adminPassword'];
const AUTH_SWITCH_PARAMS = ['switch', 'logout', 'reset', 'forceLogin'];

function isAuthSwitchRequest() {
    const params = new URLSearchParams(window.location.search);
    return AUTH_SWITCH_PARAMS.some(key => params.has(key));
}

function clearRoutingSessions() {
    clearAdminSession();
    clearRepSession();
    sessionStorage.removeItem('activeOrderContext');
    sessionStorage.removeItem('adminOrderMode');
}

function normalizeLoginUrlAfterSwitch() {
    if (!isAuthSwitchRequest()) return;
    clearRoutingSessions();
    const cleanPath = window.location.pathname.split('/').pop() || 'login.html';
    window.history.replaceState(null, document.title, cleanPath);
}

function getEl(id) { return document.getElementById(id); }

function parseAppNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
        .replace(/,/g, '')
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[^0-9.\-]/g, '')
        .trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDateValue(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === 'function') return value.toDate();
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function toDateInputValue(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getFirstDayOfCurrentMonth() {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function isOrderInDateRange(order, fromVal, toVal) {
    const date = normalizeDateValue(order.createdAt || order.updatedAt);
    if (!date) return false;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (fromVal) {
        const f = new Date(fromVal);
        f.setHours(0,0,0,0);
        if (d < f) return false;
    }
    if (toVal) {
        const t = new Date(toVal);
        t.setHours(0,0,0,0);
        if (d > t) return false;
    }
    return true;
}

function formatDateTime(value) {
    const d = normalizeDateValue(value);
    return d ? d.toLocaleString('en-GB') : 'غير متوفر';
}

function getPharmacyCodeFromOrder(order = {}) {
    return order.pharmacyCode || order.pharmacy_code || order.customerCode || '';
}

function getProductCodeFromItem(item = {}) {
    if (item.productCode || item.product_code || item.code) return item.productCode || item.product_code || item.code;
    const product = productsList.find(p => p.name === item.name);
    return product?.productCode || product?.product_code || product?.code || '';
}


const WORKFLOW_STATUS_LABELS = {
    pending: 'قيد موافقة المشرف',
    pending_supervisor_approval: 'قيد موافقة المشرف',
    supervisor_approved: 'معتمد من المشرف',
    market_manager_pending: 'بانتظار مدير السوق',
    market_manager_approved: 'معتمد من مدير السوق',
    market_manager_rejected: 'مرفوض من مدير السوق',
    finance_pending: 'بانتظار المالية',
    finance_approved: 'معتمد مالياً',
    finance_rejected: 'مرفوض مالياً',
    orders_staff_pending: 'جاهز للمعالجة',
    orders_staff_exported: 'تم تصديره',
    orders_staff_hidden: 'تمت الفوترة',
    returned_to_rep: 'مرجعة للمندوب',
    returned_to_supervisor: 'مرجعة للمشرف',
    returned_to_market_manager: 'مرجعة لمدير السوق',
    returned_to_finance: 'مرجعة للمالية',
    deleted_by_orders_staff: 'محذوفة من فريق المعالجة',
    approved: 'موافق عليه',
    returned: 'مرتجع',
    rejected: 'مرفوض',
    deleted_by_market_manager: 'محذوف من مدير السوق',
    deleted_by_supervisor: 'محذوف من المشرف',
    deleted_by_reports: 'محذوف من التقارير'
};

function getWorkflowStatusLabel(status) {
    return WORKFLOW_STATUS_LABELS[status] || status || '-';
}

function getOrderRejectionReason(order = {}) {
    const reasons = [
        order.returnReason,
        order.marketManagerRejectionReason,
        order.financeRejectionReason,
        order.rejectionReason,
        order.rejectReason
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');
    return reasons.length ? String(reasons[0]).trim() : '';
}

function isRepVisibleOrderStatus(status) {
    const hiddenStatuses = ['deleted_by_market_manager', 'deleted_by_supervisor', 'deleted_by_reports'];
    return !hiddenStatuses.includes(status || '');
}

function isSupervisorPendingStatus(status) {
    return ['pending', 'pending_supervisor_approval', 'returned_to_supervisor'].includes(status || 'pending');
}

function isRepApprovedVisibleStatus(status) {
    return [
        'approved',
        'supervisor_approved',
        'market_manager_pending',
        'market_manager_approved',
        'market_manager_rejected',
        'finance_pending',
        'finance_approved',
        'finance_rejected',
        'orders_staff_pending',
        'orders_staff_exported',
        'orders_staff_hidden',
        'returned_to_rep',
        'returned_to_supervisor',
        'returned_to_market_manager',
        'returned_to_finance',
        'rejected'
    ].includes(status || '');
}

function buildAuditEntry(action, user, role, oldValue = null, newValue = null, notes = '') {
    return {
        action,
        user: user || 'System',
        role: role || 'system',
        timestamp: new Date().toISOString(),
        oldValue,
        newValue,
        notes: notes || ''
    };
}

async function updateOrderWithAudit(orderId, updates, auditEntry) {
    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    const current = snap.exists() ? snap.data() : {};
    const trail = Array.isArray(current.auditTrail) ? current.auditTrail : [];
    await updateDoc(orderRef, {
        ...updates,
        previousStatus: current.status || '',
        changedBy: auditEntry.user,
        changedByRole: auditEntry.role,
        changedAt: new Date(),
        actionType: auditEntry.action,
        auditTrail: [...trail, { ...auditEntry, previousStatus: current.status || '', orderId }],
        updatedAt: new Date()
    });
}


function isOrderUnderCurrentManager(order = {}) {
    const managerReps = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === currentManagerName);
    const normalizedUnder = managerReps.map(rep => rep.trim().toLowerCase());
    return normalizedUnder.includes((order.repName || '').trim().toLowerCase());
}

function isOrderWithoutAssignedSupervisor(order = {}) {
    const repName = (order.repName || '').trim();
    const explicitSupervisor = String(order.managerName || order.supervisorName || order.manager || order.supervisor || '').trim();
    const mappedSupervisor = repManagerMap[repName] || '';
    const emptyValues = ['', '-', 'غير محدد', 'غير معرف', 'غير معروف', 'بدون مشرف', 'لا يوجد'];
    const hasExplicitSupervisor = !emptyValues.includes(explicitSupervisor);
    const hasMappedSupervisor = !emptyValues.includes(String(mappedSupervisor).trim());
    return !hasExplicitSupervisor && !hasMappedSupervisor;
}

function canCurrentSupervisorApproveOrder(order = {}) {
    return isSupervisorPendingStatus(order.status) && (isOrderUnderCurrentManager(order) || isOrderWithoutAssignedSupervisor(order));
}

async function approveOrderBySupervisor(orderId, order = {}, action = 'supervisor_approved') {
    await updateOrderWithAudit(orderId, {
        status: "market_manager_pending",
        workflowStage: "market_manager",
        supervisorStatus: "supervisor_approved",
        supervisorApprovedBy: currentManagerName || 'Supervisor',
        supervisorApprovedAt: new Date(),
        marketManagerStatus: "market_manager_pending"
    }, buildAuditEntry(action, currentManagerName || 'Supervisor', 'supervisor', { status: order.status || 'pending' }, { status: 'market_manager_pending' }));
}

function softDeleteOrderBySupervisor(orderId, order = {}, action = 'supervisor_order_soft_deleted') {
    return updateOrderWithAudit(orderId, {
        status: 'deleted_by_supervisor',
        workflowStage: 'deleted',
        deletedBySupervisor: currentManagerName || 'Supervisor',
        deletedAt: new Date(),
        supervisorStatus: 'deleted_by_supervisor'
    }, buildAuditEntry(action, currentManagerName || 'Supervisor', 'supervisor', { status: order.status || '' }, { status: 'deleted_by_supervisor' }, 'Soft delete only - Firebase document preserved'));
}

function promptRequiredReturnNote(message) {
    const note = prompt(message, '');
    if (note === null) return null;
    if (!note.trim()) {
        showToast('الملاحظة إجبارية عند إرجاع الطلبية.', 'warning');
        return null;
    }
    return note.trim();
}

async function supervisorReturnToRep(orderId, order = {}) {
    const reason = promptRequiredReturnNote('اكتب ملاحظة الإرجاع للمندوب:');
    if (reason === null) return;
    const current = order && Object.keys(order).length ? order : {}; 
    await updateOrderWithAudit(orderId, {
        status: 'returned_to_rep',
        workflowStage: 'representative',
        supervisorStatus: 'returned_to_rep',
        returnReason: reason,
        returnTarget: 'representative',
        returnedBy: currentManagerName || 'Supervisor',
        returnedByRole: 'supervisor',
        returnedAt: new Date()
    }, buildAuditEntry('supervisor_returned_to_rep', currentManagerName || 'Supervisor', 'supervisor', { status: current.status || '' }, { status: 'returned_to_rep', returnReason: reason }, reason));
    showToast('تم إرجاع الطلبية للمندوب مع تسجيل الملاحظة.', 'success');
}

function canRepresentativeEditReturnedOrder(order = {}) {
    return (order.status || '') === 'returned_to_rep' && String(order.repId || '') === String(currentRepId || '');
}

function setDefaultMyOrdersFilters() {
    const fromInput = getEl('myOrdersDateFrom');
    const toInput = getEl('myOrdersDateTo');
    if (fromInput && !fromInput.value) fromInput.value = getFirstDayOfCurrentMonth();
    if (toInput && !toInput.value) toInput.value = toDateInputValue(new Date());
}

function createProductItemFromRow(row) {
    const input = row.querySelector('.product-input');
    const selectedProduct = productsList.find(prod => prod.name === input?.value.trim());
    return {
        name: input?.value || '',
        productCode: input?.dataset?.productCode || selectedProduct?.productCode || selectedProduct?.product_code || selectedProduct?.code || '',
        qty: row.querySelector('.qty-input')?.value || 0,
        bonus: row.querySelector('.bonus-input')?.value || 0,
        price: row.querySelector('.price-cell')?.innerText || 0,
        total: row.querySelector('.row-total')?.innerText || 0,
        note: row.querySelector('.item-note-input')?.value.trim() || ''
    };
}

function buildFlatOrderExportRows(orders) {
    const flatData = [];
    orders.forEach(order => {
        const dateStr = formatDateTime(order.createdAt);
        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach(item => {
            const qty = parseAppNumber(item.qty);
            const bonus = parseAppNumber(item.bonus);
            flatData.push({
                "التاريخ": dateStr,
                "المندوب": order.repName || "غير معروف",
                "كود الصيدلية": getPharmacyCodeFromOrder(order),
                "الصيدلية": order.pharmacyName || "غير معروف",
                "كود المنتج": getProductCodeFromItem(item),
                "الصنف": item.name || "-",
                "الكمية": qty,
                "البونص": bonus,
                "نسبة البونص": (qty > 0 && bonus > 0) ? `${Math.round((bonus / qty) * 100)}%` : "0%",
                "السعر": parseAppNumber(item.price),
                "المجموع الفرعي": parseAppNumber(item.total),
                "ملاحظة الصنف": item.note || "-",
                "الاجمالي الكلي": parseAppNumber(order.grandTotal),
                "ملاحظة الطلبية": order.orderNote || "-",
                "الحالة": getWorkflowStatusLabel(order.status)
            });
        });
    });
    return flatData;
}

function getSelectedOrderIds(selector) {
    return Array.from(document.querySelectorAll(`${selector}:checked`)).map(cb => cb.value).filter(Boolean);
}

async function getOrdersForPrint(ids, existingOrders = []) {
    const byId = new Map(existingOrders.map(order => [order.id, order]));
    const orders = [];
    for (const id of ids) {
        if (byId.has(id)) {
            orders.push(byId.get(id));
        } else {
            const orderDoc = await getDoc(doc(db, 'orders', id));
            if (orderDoc.exists()) orders.push({ id: orderDoc.id, ...orderDoc.data() });
        }
    }
    return orders;
}

function escapePrintHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function buildPrintableOrder(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const rows = items.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${escapePrintHtml(getProductCodeFromItem(item))}</td>
            <td class="item-name">${escapePrintHtml(item.name || '-')}</td>
            <td>${parseAppNumber(item.qty).toLocaleString('en-US')}</td>
            <td>${parseAppNumber(item.bonus).toLocaleString('en-US')}</td>
            <td>${parseAppNumber(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${parseAppNumber(item.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${escapePrintHtml(item.note || '-')}</td>
        </tr>
    `).join('');

    return `
        <section class="print-order-page">
            <header class="print-header">
                <img src="${COMPANY_LOGO_URL}" alt="Dar Al Dawaa Logo">
                <div>
                    <h1>طلبية عميل</h1>
                    <p>نسخة جاهزة للإرسال إلى العميل</p>
                </div>
                <div class="print-order-ref">
                    <span>رقم الطلب</span>
                    <strong>${escapePrintHtml((order.id || '').substring(0, 8).toUpperCase())}</strong>
                </div>
            </header>
            <div class="print-info-grid">
                <div><span>التاريخ</span><strong>${escapePrintHtml(formatDateTime(order.createdAt))}</strong></div>
                <div><span>المندوب</span><strong>${escapePrintHtml(order.repName || '-')}</strong></div>
                <div><span>العميل / الصيدلية</span><strong>${escapePrintHtml(order.pharmacyName || '-')}</strong></div>
                <div><span>كود الصيدلية</span><strong>${escapePrintHtml(getPharmacyCodeFromOrder(order) || '-')}</strong></div>
                <div><span>الحالة</span><strong>${getWorkflowStatusLabel(order.status)}</strong></div>
                <div><span>الإجمالي</span><strong>${parseAppNumber(order.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} د.ا</strong></div>
            </div>
            <table class="print-items-table">
                <thead>
                    <tr>
                        <th>#</th><th>كود المنتج</th><th>الصنف</th><th>الكمية</th><th>البونص</th><th>السعر</th><th>المجموع</th><th>ملاحظة</th>
                    </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="8">لا توجد أصناف محفوظة على هذه الطلبية.</td></tr>'}</tbody>
            </table>
            <div class="print-note-box">
                <span>ملاحظات الطلبية</span>
                <p>${escapePrintHtml(order.orderNote || 'لا توجد ملاحظات.')}</p>
            </div>
            <footer class="print-footer">
                <span>Dar Al Dawaa / DAD Group</span>
                <span>تمت الطباعة من نظام الطلبيات</span>
            </footer>
        </section>
    `;
}

async function printSelectedOrders(checkboxSelector, existingOrders = []) {
    const ids = getSelectedOrderIds(checkboxSelector);
    if (ids.length === 0) return showToast('اختر طلبية واحدة على الأقل للطباعة.', 'warning');
    try {
        const orders = await getOrdersForPrint(ids, existingOrders);
        if (orders.length === 0) return showToast('لم يتم العثور على الطلبيات المحددة.', 'error');
        const printable = orders.map(buildPrintableOrder).join('');
        const printWindow = window.open('', '_blank', 'width=1100,height=800');
        if (!printWindow) return showToast('المتصفح منع نافذة الطباعة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.', 'warning');
        printWindow.document.open();
        printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>طباعة الطلبيات</title><style>
            @page { size: A4; margin: 12mm; }
            * { box-sizing: border-box; }
            body { margin: 0; font-family: Cairo, Arial, sans-serif; color: #0f172a; background: #fff; }
            .print-order-page { min-height: 273mm; page-break-after: always; display: flex; flex-direction: column; gap: 14px; }
            .print-order-page:last-child { page-break-after: auto; }
            .print-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 3px solid #099999; padding-bottom: 14px; }
            .print-header img { width: 112px; max-height: 58px; object-fit: contain; }
            .print-header h1 { margin: 0; color: #0f3b5c; font-size: 24px; }
            .print-header p { margin: 4px 0 0; color: #64748b; font-weight: 700; }
            .print-order-ref { text-align: center; border: 1px solid #cbd5e1; border-radius: 14px; padding: 10px 14px; min-width: 120px; }
            .print-order-ref span, .print-info-grid span, .print-note-box span { display:block; color: #64748b; font-size: 12px; font-weight: 800; }
            .print-order-ref strong { display:block; margin-top:4px; color:#099999; font-size:18px; }
            .print-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .print-info-grid div { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 12px; padding: 10px 12px; }
            .print-info-grid strong { display:block; margin-top: 4px; font-size: 13px; color:#0f172a; }
            .print-items-table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .print-items-table th { background: #0f3b5c; color: white; padding: 8px; border: 1px solid #0f3b5c; }
            .print-items-table td { padding: 8px; border: 1px solid #cbd5e1; vertical-align: top; text-align: center; }
            .print-items-table .item-name { text-align: right; font-weight: 800; }
            .print-note-box { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 12px; padding: 12px; margin-top: auto; }
            .print-note-box p { margin: 6px 0 0; line-height: 1.7; }
            .print-footer { display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; padding-top: 10px; color:#64748b; font-size: 11px; font-weight: 700; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            @media (max-width: 700px) { .print-info-grid { grid-template-columns: 1fr; } .print-header { align-items:flex-start; flex-direction:column; } .print-items-table { font-size: 11px; } }
        </style></head><body>${printable}<script>window.onload = () => { window.focus(); window.print(); };<\/script></body></html>`);
        printWindow.document.close();
    } catch (error) {
        console.error('Print error:', error);
        showToast('تعذر تجهيز الطباعة.', 'error');
    }
}

function saveAdminSession(name, type, remember) {
    const session = { name, type, token: btoa(encodeURIComponent(`${name}:${Date.now()}`)), savedAt: Date.now(), remember: !!remember };
    const target = remember ? localStorage : sessionStorage;
    target.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    const other = remember ? sessionStorage : localStorage;
    other.removeItem(ADMIN_SESSION_KEY);
    LEGACY_ADMIN_KEYS.forEach(key => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
    return session;
}

function getAdminSession() {
    let raw = localStorage.getItem(ADMIN_SESSION_KEY);
    let source = 'local';
    if (!raw) { raw = sessionStorage.getItem(ADMIN_SESSION_KEY); source = 'session'; }
    if (!raw) {
        const legacyName = localStorage.getItem('managerName') || sessionStorage.getItem('managerName');
        const legacyType = localStorage.getItem('adminType') || sessionStorage.getItem('adminType');
        const legacyToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (legacyName && legacyType && legacyToken) return saveAdminSession(legacyName, legacyType, !!localStorage.getItem('authToken'));
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!parsed.name || !parsed.type || !parsed.token) throw new Error('Invalid admin session');
        if (source === 'local' && Date.now() - (parsed.savedAt || 0) > ADMIN_SESSION_TTL) { localStorage.removeItem(ADMIN_SESSION_KEY); return null; }
        return parsed;
    } catch (error) {
        localStorage.removeItem(ADMIN_SESSION_KEY);
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        return null;
    }
}

function clearAdminSession() {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    LEGACY_ADMIN_KEYS.forEach(key => { localStorage.removeItem(key); sessionStorage.removeItem(key); });
}

function getCurrentFilteredAllOrders() {
    const repFilter = (getEl('filterAllRep')?.value || '').toLowerCase().trim();
    const pharmFilter = (getEl('filterAllPharmacy')?.value || '').toLowerCase().trim();
    const statusFilter = (getEl('filterAllStatus')?.value || '').trim();
    const fromVal = getEl('managerFilterFrom')?.value;
    const toVal = getEl('managerFilterTo')?.value;
    return allOrdersData.filter(order => {
        const repName = (order.repName || '').toLowerCase();
        const pharmName = (order.pharmacyName || '').toLowerCase();
        const orderStatus = (order.status || '').trim();
        return repName.includes(repFilter) && pharmName.includes(pharmFilter) && (statusFilter === '' || orderStatus === statusFilter) && isOrderInDateRange(order, fromVal, toVal);
    });
}

function goToLogin() { window.location.href = 'login.html'; }

function saveRepSession(repId, repName) {
    sessionStorage.setItem('repId', repId);
    sessionStorage.setItem('repName', repName);
}
function loadRepSession() {
    const id = sessionStorage.getItem('repId');
    const name = sessionStorage.getItem('repName');
    if (id && name) {
        currentRepId = id;
        currentRepName = name;
        return true;
    }
    return false;
}
function clearRepSession() {
    sessionStorage.removeItem('repId');
    sessionStorage.removeItem('repName');
}

const repSelect = document.getElementById('repSelect');
const pharmacyInput = document.getElementById('pharmacyInput');
const startOrderBtn = document.getElementById('startOrderBtn');
const orderBody = document.getElementById('orderBody');
const addRowBtn = document.getElementById('addRowBtn');

if (addRowBtn) addRowBtn.onclick = () => {
    const productInputs = document.querySelectorAll('#orderBody .product-input');
    if (productInputs.length > 0) {
        const lastInput = productInputs[productInputs.length - 1];
        if (lastInput.value.trim() === "") {
            showToast("الرجاء اختيار الصنف الحالي أولاً قبل إضافة صنف جديد.", "warning");
            lastInput.focus(); 
            return;
        }
    }
    addNewRow();
};

const grandTotalEl = document.getElementById('grandTotal');
const submitOrderBtn = document.getElementById('submitOrderBtn');
const detailsModal = document.getElementById('detailsModal');
const modalItemsBody = document.getElementById('modalItemsBody');

function getManagerName(repName) {
    return repManagerMap[repName] || "غير محدد";
}

function setupAutocomplete(inputEl, suggestionsEl, dataArray, onSelectCallback) {
    inputEl._autocompleteData = dataArray;
    inputEl._autocompleteCallback = onSelectCallback;
    
    if (inputEl._hasAutocomplete) return;
    inputEl._hasAutocomplete = true;

    let currentFocus = -1;

    function showList() {
        const data = inputEl._autocompleteData || [];
        const cb = inputEl._autocompleteCallback;
        const val = inputEl.value.trim().toLowerCase();
        
        suggestionsEl.innerHTML = '';
        currentFocus = -1;

        const filtered = val ? data.filter(item => item.toLowerCase().includes(val)) : data;

        if (filtered.length > 0) {
            filtered.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'autocomplete-item';
                div.style.padding = '8px 12px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid #eee';
                div.style.backgroundColor = '#ffffff';
                div.style.color = '#000000';
                div.style.textAlign = 'right';
                div.style.fontSize = '14px';
                
                div.onmouseover = () => div.style.backgroundColor = '#f0f8ff';
                div.onmouseout = () => { if (!div.classList.contains('autocomplete-active')) div.style.backgroundColor = '#ffffff'; };

                if (val) {
                    const matchIndex = item.toLowerCase().indexOf(val);
                    if (matchIndex >= 0) {
                        const before = item.substring(0, matchIndex);
                        const match = item.substring(matchIndex, matchIndex + val.length);
                        const after = item.substring(matchIndex + val.length);
                        div.innerHTML = before + '<strong style="color:#004a99;">' + match + '</strong>' + after;
                    } else { div.innerText = item; }
                } else { div.innerText = item; }

                div.addEventListener('click', function(e) {
                    e.preventDefault();
                    inputEl.value = item;
                    suggestionsEl.style.display = 'none';
                    if (cb) cb(item);
                    inputEl.dispatchEvent(new Event('input')); 
                });
                suggestionsEl.appendChild(div);
            });

            const rect = inputEl.getBoundingClientRect();
            suggestionsEl.style.position = 'absolute';
            suggestionsEl.style.top = (inputEl.offsetTop + inputEl.offsetHeight) + 'px';
            suggestionsEl.style.left = inputEl.offsetLeft + 'px';
            suggestionsEl.style.width = rect.width + 'px';
            suggestionsEl.style.zIndex = '9999999';
            suggestionsEl.style.backgroundColor = '#ffffff';
            suggestionsEl.style.border = '1px solid #ccc';
            suggestionsEl.style.borderRadius = '4px';
            suggestionsEl.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            suggestionsEl.style.maxHeight = '200px';
            suggestionsEl.style.overflowY = 'auto';
            suggestionsEl.style.display = 'block';
        } else { suggestionsEl.style.display = 'none'; }
    }

    inputEl.addEventListener('input', showList);
    inputEl.addEventListener('click', showList);
    inputEl.addEventListener('focus', showList);

    inputEl.addEventListener('keydown', function(e) {
        if (suggestionsEl.style.display === 'none') return;
        const items = suggestionsEl.getElementsByClassName('autocomplete-item');
        if (e.key === 'ArrowDown') { currentFocus++; if (currentFocus >= items.length) currentFocus = 0; setActive(items); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { currentFocus--; if (currentFocus < 0) currentFocus = items.length - 1; setActive(items); e.preventDefault(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (currentFocus > -1 && items[currentFocus]) items[currentFocus].click(); else if (items.length === 1) items[0].click(); }
    });

    function setActive(items) { 
        for (let i=0; i<items.length; i++) {
            items[i].classList.remove('autocomplete-active'); 
            items[i].style.backgroundColor = '#ffffff';
        }
        if (items[currentFocus]) { 
            items[currentFocus].classList.add('autocomplete-active'); 
            items[currentFocus].style.backgroundColor = '#e6f2ff';
            items[currentFocus].scrollIntoView({ block: 'nearest', behavior: 'smooth' }); 
        } 
    }

    document.addEventListener('click', function(e) { 
        if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
            suggestionsEl.style.display = 'none'; 
        }
    });

    suggestionsEl.addEventListener('mousedown', function(e) { e.preventDefault(); });
}

async function loadInitialData() {
    try {
        if (APP_PAGE === 'login') normalizeLoginUrlAfterSwitch();
        if (repSelect) {
            repSelect.innerHTML = '<option value="">⏳ جاري تحميل البيانات...</option>';
            repSelect.disabled = true;
        }

        const CACHE_KEY = 'dad_app_cache_20260622_market_popup_actions1';
        const CACHE_TIME_KEY = 'dad_app_cache_time_20260622_market_popup_actions1';
        const CACHE_EXPIRY = 24 * 60 * 60 * 1000;
        const cachedDataStr = localStorage.getItem(CACHE_KEY);
        const cacheTimeStr = localStorage.getItem(CACHE_TIME_KEY);
        const now = new Date().getTime();
        let repsData = [];
        let prodsData = [];

        if (cachedDataStr && cacheTimeStr && (now - parseInt(cacheTimeStr, 10) < CACHE_EXPIRY)) {
            const parsed = JSON.parse(cachedDataStr);
            repsData = parsed.reps || [];
            prodsData = parsed.products || [];
        } else {
            const repsSnap = await getDocs(collection(db, "reps"));
            const prodSnap = await getDocs(collection(db, "products"));
            repsSnap.forEach(d => repsData.push({ id: d.id, ...d.data() }));
            prodSnap.forEach(d => prodsData.push({ id: d.id, ...d.data() }));
            localStorage.setItem(CACHE_KEY, JSON.stringify({ reps: repsData, products: prodsData }));
            localStorage.setItem(CACHE_TIME_KEY, now.toString());
        }

        if (repSelect) {
            repSelect.innerHTML = '<option value="">-- اختر المندوب --</option>';
            repsData.forEach(d => {
                const opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.name;
                repSelect.appendChild(opt);
            });
            const lastRepId = localStorage.getItem('dad_last_rep_id');
            if (APP_PAGE === 'login' && lastRepId && Array.from(repSelect.options).some(opt => opt.value === lastRepId)) {
                repSelect.value = lastRepId;
                repSelect.dispatchEvent(new Event('change'));
            }
        }

        productsList = prodsData.map(prod => ({
            ...prod,
            productCode: prod.productCode || prod.product_code || prod.code || ''
        }));
        productsList.sort((a,b) => (a.name || '').localeCompare(b.name || ''));
        await bootstrapPage();
    } catch(e) {
        console.error("خطأ في تحميل البيانات الأولية:", e);
        if (repSelect) repSelect.innerHTML = '<option value="">❌ فشل التحميل</option>';
        showToast("حدث خطأ في تحميل البيانات. يرجى تحديث الصفحة.", "error");
    } finally {
        if (repSelect) repSelect.disabled = false;
    }
}

async function bootstrapPage() {
    if (APP_PAGE === 'order') {
        const ctxRaw = sessionStorage.getItem('activeOrderContext');
        if (!ctxRaw) return goToLogin();
        try {
            const ctx = JSON.parse(ctxRaw);
            currentRepId = ctx.repId;
            currentRepName = ctx.repName;
            currentPharmacyName = ctx.pharmacyName;
            currentPharmacyCode = ctx.pharmacyCode || '';
            isAdmin = !!ctx.isAdminOrder;
            currentManagerName = ctx.managerName || null;
            saveRepSession(currentRepId, currentRepName);
            getEl('loginScreen')?.style && (getEl('loginScreen').style.display = 'none');
            getEl('orderScreen')?.style && (getEl('orderScreen').style.display = 'block');
            getEl('userInfo')?.style && (getEl('userInfo').style.display = 'flex');
            if (getEl('currentRepName')) getEl('currentRepName').innerHTML = `<i class="ph ph-user"></i> المندوب: <b>${currentRepName}</b>`;
            if (getEl('orderPharmacyName')) {
                getEl('orderPharmacyName').innerHTML = `${currentPharmacyName}
                    <button id="showPharmHistoryBtn" class="btn-icon" style="font-size: 0.8rem; padding: 4px 8px; margin-right: 10px;" title="تاريخ آخر طلبية">
                        <i class="ph ph-clock-counter-clockwise"></i> السجل
                    </button>`;
                bindPharmacyHistoryButton();
            }
            if (!restoreSavedDraft() && orderBody && orderBody.children.length === 0) addNewRow();
            loadMyOrders();
        } catch (error) {
            sessionStorage.removeItem('activeOrderContext');
            goToLogin();
        }
    }

    if (APP_PAGE === 'supervisor') {
        const adminSession = getAdminSession();
        if (!adminSession || adminSession.type !== 'manager') return goToLogin();
        isAdmin = true;
        currentManagerName = adminSession.name;
        initializeManagerView(adminSession.name);
    }

    if (APP_PAGE === 'login') {
        const adminSession = getAdminSession();
        const isAdminOrderMode = sessionStorage.getItem('adminOrderMode') === '1';
        if (adminSession && adminSession.remember && !isAdminOrderMode) {
            if (adminSession.type === 'manager') window.location.href = 'supervisor.html';
            if (adminSession.type === 'reports') window.location.href = 'reports.html';
        }
    }
}

function bindPharmacyHistoryButton() {
    const historyBtn = getEl('showPharmHistoryBtn');
    if (!historyBtn) return;
    historyBtn.onclick = async () => {
        showToast("جاري جلب السجل التاريخي للصيدلية...", "info");
        try {
            const qFilter = query(collection(db, "orders"), where("pharmacyName", "==", currentPharmacyName));
            const snap = await getDocs(qFilter);
            let history = [];
            snap.forEach(d => history.push({ id: d.id, ...d.data() }));
            if (history.length === 0) return showToast("لا توجد طلبيات سابقة لهذه الصيدلية.", "warning");
            history.sort((a,b) => (normalizeDateValue(b.createdAt)?.getTime() || 0) - (normalizeDateValue(a.createdAt)?.getTime() || 0));
            const historyBody = getEl('pharmacyHistoryBody');
            if (!historyBody) return;
            historyBody.innerHTML = '';
            if (getEl('historyModalSubtitle')) getEl('historyModalSubtitle').innerText = `صيدلية ${currentPharmacyName}`;
            history.forEach(o => {
                const tr = document.createElement('tr');
                tr.className = `row-${o.status}`;
                tr.innerHTML = `
                    <td>${(o.id || '').substring(0,6).toUpperCase()}</td>
                    <td>${formatDateTime(o.createdAt)}</td>
                    <td>${o.repName || '-'}</td>
                    <td>${parseAppNumber(o.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })} د.ا</td>
                    <td><span class="status-badge ${o.status}">${getWorkflowStatusLabel(o.status)}</span></td>
                    <td><button class="action-btn edit-btn btn-view-history" title="عرض التفاصيل"><i class="ph ph-eye"></i></button></td>
                `;
                tr.querySelector('.btn-view-history').onclick = () => showOrderDetails(o);
                historyBody.appendChild(tr);
            });
            getEl('pharmacyHistoryModal').style.display = 'flex';
        } catch(e) {
            showToast("تعذر جلب السجل، تأكد من الاتصال.", "error");
        }
    };
}

function restoreSavedDraft() {
    if (!currentRepId || !currentPharmacyName || !getEl('orderBody')) return false;
    try {
        const draftRaw = localStorage.getItem(`draft_${currentRepId}_${currentPharmacyName}`);
        if (!draftRaw) return false;
        const draft = JSON.parse(draftRaw);
        const body = getEl('orderBody');
        body.innerHTML = '';
        if (Array.isArray(draft.items) && draft.items.length > 0) {
            draft.items.forEach(item => addNewRow(item));
        }
        if (getEl('orderNoteInput')) getEl('orderNoteInput').value = draft.note || '';
        updateGrandTotal();
        showToast("تم استرجاع مسودة الطلبية السابقة.", "info");
        return true;
    } catch (error) {
        return false;
    }
}

function printCurrentDraft() {
    const items = [];
    document.querySelectorAll('#orderBody tr').forEach(row => {
        const item = createProductItemFromRow(row);
        if (item.name.trim()) items.push(item);
    });
    if (items.length === 0) return showToast('لا توجد أصناف في المسودة للطباعة.', 'warning');
    const order = {
        id: 'DRAFT',
        repName: currentRepName || '-',
        pharmacyName: currentPharmacyName || '-',
        pharmacyCode: currentPharmacyCode || '',
        createdAt: new Date(),
        status: 'pending',
        items,
        grandTotal: grandTotalEl?.innerText || 0,
        orderNote: getEl('orderNoteInput')?.value || ''
    };
    const previous = currentMyOrdersData;
    currentMyOrdersData = [order];
    printSelectedOrdersFromObjects([order]);
    currentMyOrdersData = previous;
}

function printSelectedOrdersFromObjects(orders) {
    const printable = orders.map(buildPrintableOrder).join('');
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return showToast('المتصفح منع نافذة الطباعة.', 'warning');
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>طباعة مسودة</title><style>@page{size:A4;margin:12mm}body{font-family:Cairo,Arial,sans-serif}.print-order-page{page-break-after:always}.print-header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #099999;padding-bottom:14px}.print-header img{width:112px;object-fit:contain}.print-info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0}.print-info-grid div{border:1px solid #e2e8f0;background:#f8fafc;border-radius:12px;padding:10px}.print-info-grid span,.print-note-box span{display:block;color:#64748b;font-size:12px;font-weight:800}.print-items-table{width:100%;border-collapse:collapse;font-size:12px}.print-items-table th{background:#0f3b5c;color:#fff}.print-items-table th,.print-items-table td{padding:8px;border:1px solid #cbd5e1;text-align:center}.item-name{text-align:right;font-weight:800}.print-note-box{border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:12px;margin-top:14px}.print-footer{display:flex;justify-content:space-between;border-top:1px solid #e2e8f0;padding-top:10px;color:#64748b;font-size:11px;font-weight:700}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${printable}<script>window.onload=()=>{window.focus();window.print();};<\/script></body></html>`);
    printWindow.document.close();
}

function addNewRow(prefill = null) {
    if (productsList.length === 0) { 
        setTimeout(() => addNewRow(), 500); 
        return; 
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><div class="autocomplete-wrapper"><input type="text" class="product-input" placeholder="ابحث باسم الصنف..." style="width:100%;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
        <td><input type="number" class="qty-input" value="1" min="1"></td>
        <td style="position:relative;"><input type="number" class="bonus-input" value="0" min="0"><span class="bonus-pct" style="font-size:0.75rem; color:var(--primary); font-weight:bold; display:block; text-align:center; margin-top:4px;"></span></td>
        <td class="price-cell">0.00</td>
        <td class="row-total">0.00</td>
        <td><input type="text" class="item-note-input" placeholder="ملاحظة..." style="width:100%; padding: 8px;"></td> 
        <td><button type="button" class="btn-danger del-row"><i class="ph ph-trash"></i></button></td>
    `;
    
    const s = tr.querySelector('.product-input'), 
          sug = tr.querySelector('.product-suggestions'), 
          q = tr.querySelector('.qty-input'), 
          b = tr.querySelector('.bonus-input'),
          p = tr.querySelector('.price-cell'), 
          t = tr.querySelector('.row-total'),
          bPct = tr.querySelector('.bonus-pct');
          
    const productNames = productsList.map(prod => prod.name);
    
    setupAutocomplete(s, sug, productNames, (selectedName) => {
        const selectedProd = productsList.find(prod => prod.name === selectedName);
        const pr = selectedProd ? parseAppNumber(selectedProd.price) : 0;
        s.dataset.productCode = selectedProd?.productCode || selectedProd?.product_code || selectedProd?.code || '';
        p.innerText = pr.toFixed(2);
        t.innerText = (pr * q.value).toFixed(2);
        updateGrandTotal();
    });

    s.addEventListener('blur', function() {
        const val = this.value.trim();
        if (val === "") return;
        const isValid = productsList.some(p => p.name === val);
        if (!isValid) {
            this.classList.add('input-error');
            let err = this.parentNode.querySelector('.inline-error-msg');
            if(!err) { err = document.createElement('span'); err.className="inline-error-msg"; err.innerText="صنف غير موجود"; this.parentNode.appendChild(err); }
        } else {
            this.classList.remove('input-error');
            const err = this.parentNode.querySelector('.inline-error-msg');
            if(err) err.remove();
        }
    });

    // 💡 ميزة: حساب نسبة البونص تلقائياً
    function calcBonus() {
        const qVal = parseFloat(q.value) || 0;
        const bVal = parseFloat(b.value) || 0;
        if(qVal > 0 && bVal > 0) {
            bPct.innerText = `${Math.round((bVal / qVal) * 100)}% بونص`;
        } else {
            bPct.innerText = "";
        }
    }

    q.oninput = () => { 
        t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); 
        calcBonus();
        updateGrandTotal(); 
    };
    b.oninput = () => { calcBonus(); updateGrandTotal(); };

    tr.querySelector('.item-note-input').oninput = () => { autoSaveDraft(); };

    tr.querySelector('.del-row').onclick = () => { 
        tr.remove(); 
        updateGrandTotal(); 
    };

    orderBody.appendChild(tr);
    if (prefill) {
        const product = productsList.find(prod => prod.name === prefill.name);
        s.value = prefill.name || '';
        s.dataset.productCode = prefill.productCode || prefill.product_code || prefill.code || product?.productCode || product?.product_code || product?.code || '';
        q.value = prefill.qty ?? 1;
        b.value = prefill.bonus ?? 0;
        const price = prefill.price !== undefined ? parseAppNumber(prefill.price) : parseAppNumber(product?.price);
        p.innerText = price.toFixed(2);
        t.innerText = prefill.total !== undefined ? parseAppNumber(prefill.total).toFixed(2) : (price * parseAppNumber(q.value)).toFixed(2);
        tr.querySelector('.item-note-input').value = prefill.note || '';
        calcBonus();
        updateGrandTotal();
    }
}

function updateGrandTotal() {
    let g = 0; 
    document.querySelectorAll('#orderBody .row-total').forEach(td => {
        g += parseFloat(td.innerText) || 0;
    });
    if (grandTotalEl) grandTotalEl.innerText = g.toFixed(2);
    
    // تشغيل الحفظ التلقائي عند أي تحديث في الفاتورة
    autoSaveDraft();
}

if (repSelect) repSelect.onchange = async (e) => {
    if (!e.target.value) {
        document.getElementById('repPasswordGroup').style.display = 'none';
        return;
    }
    
    // 🟢 إظهار حقل الرقم السري عند اختيار المندوب
    document.getElementById('repPasswordGroup').style.display = 'block';
    
    // 🟢 استرجاع كلمة المرور إذا كانت محفوظة
    const savedPass = localStorage.getItem('savedRepPass_' + e.target.value);
    if (savedPass) {
        document.getElementById('repPasswordInput').value = savedPass;
        if(document.getElementById('rememberRepPass')) document.getElementById('rememberRepPass').checked = true;
    } else {
        document.getElementById('repPasswordInput').value = '';
        if(document.getElementById('rememberRepPass')) document.getElementById('rememberRepPass').checked = false;
    }

    pharmacyInput.value = '';
    pharmacyInput.placeholder = 'جاري التحميل...';
    try {
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", e.target.value));
        const snap = await getDocs(q);
        let pharmacyNames = [];
        currentPharmaciesData = []; 
        snap.forEach(d => {
            currentPharmaciesData.push(d.data()); 
            pharmacyNames.push(d.data().name);
        });
        setupAutocomplete(pharmacyInput, document.getElementById('pharmacySuggestions'), pharmacyNames, () => startOrderBtn.disabled = false);
        pharmacyInput.disabled = false;
        pharmacyInput.placeholder = 'ابحث او اختر الصيدلية...';
    } catch (error) {
        pharmacyInput.placeholder = 'خطأ في التحميل، الرجاء المحاولة مرة أخرى';
    }
};
if (pharmacyInput) pharmacyInput.oninput = () => { if (startOrderBtn) startOrderBtn.disabled = !pharmacyInput.value.trim(); };

function validatePharmacyInput() {
    const pharmacyName = pharmacyInput.value.trim();
    const isValid = pharmacyName !== "" && currentPharmaciesData.some(p => p.name === pharmacyName);
    
    if (!isValid && pharmacyName !== "") {
        pharmacyInput.classList.add('input-error');
        startOrderBtn.disabled = true;
    } else if (pharmacyName === "") {
        pharmacyInput.classList.remove('input-error');
        startOrderBtn.disabled = true;
    } else {
        pharmacyInput.classList.remove('input-error');
        startOrderBtn.disabled = false;
    }
    return isValid;
}

pharmacyInput?.addEventListener('blur', validatePharmacyInput);
pharmacyInput?.addEventListener('input', function() {
    const isValid = currentPharmaciesData.some(p => p.name === this.value.trim());
    if (isValid) {
        this.classList.remove('input-error');
        startOrderBtn.disabled = false;
    } else {
        startOrderBtn.disabled = true;
    }
});

if (startOrderBtn) startOrderBtn.onclick = async (e) => { e.preventDefault(); // 🟢 أضف هذا السطر لمنع إرسال الفورم...
                                      if (productsList.length === 0) { 
        showToast("الرجاء الانتظار... يتم تحميل المنتجات.", "info"); 
        return; 
    }
    const selectedRepNameText = repSelect.options[repSelect.selectedIndex].text;
    const repPassInput = document.getElementById('repPasswordInput');
    const enteredPass = repPassInput.value.trim();
    const expectedHash = repPasswordsMap[selectedRepNameText];

    if (!enteredPass) {
        repPassInput.classList.add('input-error');
        return showToast("الرجاء إدخال الرقم السري الخاص بك.", "warning");
    }

if (expectedHash && btoa(enteredPass) !== expectedHash) {
        repPassInput.classList.add('input-error');
        return showToast("الرقم السري للمندوب غير صحيح!", "error");
    }
    
    repPassInput.classList.remove('input-error');
    // 🟢 حفظ كلمة المرور إذا كان خيار التذكر مفعلاً
    if (document.getElementById('rememberRepPass') && document.getElementById('rememberRepPass').checked) {
        localStorage.setItem('savedRepPass_' + repSelect.value, enteredPass);
    } else {
        localStorage.removeItem('savedRepPass_' + repSelect.value);
        repPassInput.value = ''; // تنظيف الحقل كإجراء أمني إذا لم يطلب التذكر
    }
    const pharmacyName = pharmacyInput.value.trim();
    const selectedPharm = currentPharmaciesData.find(p => p.name === pharmacyName);
    
    if (!selectedPharm) {
        pharmacyInput.classList.add('input-error');
        showToast("الرجاء اختيار صيدلية صحيحة من القائمة حصراً.", "error");
        return;
    }
    
    currentRepId = repSelect.value;
    currentRepName = repSelect.options[repSelect.selectedIndex].text;
    saveRepSession(currentRepId, currentRepName);
    localStorage.setItem('dad_last_rep_id', currentRepId);
    currentPharmacyName = pharmacyName;
    currentPharmacyCode = selectedPharm.pharmacyCode || selectedPharm.pharmacy_code || selectedPharm.customerCode || "";

    const adminOrderSession = getAdminSession();
    const isAdminOrder = sessionStorage.getItem('adminOrderMode') === '1' && adminOrderSession?.type === 'manager';
    sessionStorage.setItem('activeOrderContext', JSON.stringify({
        repId: currentRepId,
        repName: currentRepName,
        pharmacyName: currentPharmacyName,
        pharmacyCode: currentPharmacyCode,
        isAdminOrder,
        managerName: isAdminOrder ? adminOrderSession.name : null
    }));

    window.location.href = 'order.html';
};

const originalRepOnChange = repSelect?.onchange;
if (repSelect) repSelect.onchange = async (e) => {
    if (originalRepOnChange) await originalRepOnChange(e);
    startOrderBtn.disabled = true;
    pharmacyInput.classList.remove('input-error');
    setTimeout(() => { validatePharmacyInput(); }, 100);
};

if (submitOrderBtn) submitOrderBtn.onclick = async () => {
    if (!navigator.onLine) {
        showToast("أنت في وضع عدم الاتصال (Offline). لا يمكن إرسال الطلبية الآن.", "error");
        return;
    }

    const items = [];
    let invalidItem = false;

    document.querySelectorAll('#orderBody tr').forEach(r => {
        const s = r.querySelector('.product-input');
        if (s && s.value.trim() !== "") {
            const isValid = productsList.some(prod => prod.name === s.value.trim());
            
            if (!isValid) {
                invalidItem = true;
                s.classList.add('input-error');
            } else {
                s.classList.remove('input-error'); 
                items.push(createProductItemFromRow(r));
            }
        }
    });

    if (invalidItem) {
        return showToast("يوجد أصناف غير صحيحة، يرجى اختيار الصنف من القائمة حصراً.", "error");
    }

    if (items.length === 0) return showToast("لا يمكن إرسال طلبية فارغة!", "warning");
    
    const orderNoteEl = document.getElementById('orderNoteInput');
    const orderNoteValue = orderNoteEl ? orderNoteEl.value.trim() : "";

    try {
        submitOrderBtn.disabled = true;
        submitOrderBtn.classList.add('btn-loading');
        
        const indicator = document.getElementById('saving-indicator');
        if(indicator) indicator.classList.add('active');

        const initialStatus = isAdmin ? "market_manager_pending" : "pending_supervisor_approval";
        const now = new Date();
        await addDoc(collection(db, "orders"), {
            repId: currentRepId,
            repName: currentRepName,
            managerName: getManagerName(currentRepName),
            pharmacyName: currentPharmacyName,
            pharmacyCode: currentPharmacyCode, 
            items: items,
            orderNote: orderNoteValue,
            grandTotal: parseAppNumber(grandTotalEl.innerText),
            createdAt: now,
            updatedAt: now,
            status: initialStatus,
            previousStatus: '',
            workflowStage: isAdmin ? 'market_manager' : 'supervisor',
            supervisorStatus: isAdmin ? 'supervisor_approved' : 'pending_supervisor_approval',
            supervisorApprovedBy: isAdmin ? (currentManagerName || getManagerName(currentRepName)) : '',
            supervisorApprovedAt: isAdmin ? now : null,
            marketManagerStatus: isAdmin ? 'market_manager_pending' : '',
            financeStatus: '',
            orderStaffStatus: '',
            auditTrail: [buildAuditEntry('order_created', currentRepName, isAdmin ? 'supervisor' : 'representative', null, { status: initialStatus }, orderNoteValue)]
        });
        
        clearDraft(); // تنظيف المسودة بعد الإرسال الناجح

        const successMessage = isAdmin 
            ? "تم تسجيل الطلبية وتحويلها إلى مدير السوق." 
            : "تم ارسال الطلبية بنجاح، في انتظار موافقة المدير.";
        showToast(successMessage, "success");

        sessionStorage.removeItem('adminOrderMode');
        orderBody.innerHTML = '';
        if (grandTotalEl) grandTotalEl.innerText = '0.00';
        if(orderNoteEl) orderNoteEl.value = '';
        addNewRow();

        if (isAdmin) {
            sessionStorage.removeItem('activeOrderContext');
            window.location.href = 'supervisor.html';
            return;
        }

        const orderScreenEl = getEl('orderScreen');
        const myOrdersScreenEl = getEl('myOrdersScreen');
        if (orderScreenEl && myOrdersScreenEl) {
            orderScreenEl.style.display = 'none';
            myOrdersScreenEl.style.display = 'block';
            loadMyOrders();
            document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
            getEl('navMyOrdersBtn')?.classList.add('active');
        }
    } catch(e) { 
        showToast("خطأ في الارسال، يرجى المحاولة لاحقاً.", "error"); 
    } finally {
        submitOrderBtn.disabled = false; 
        submitOrderBtn.classList.remove('btn-loading');
        const indicator = document.getElementById('saving-indicator');
        if(indicator) indicator.classList.remove('active');
    }
};

async function loadMyOrders() {
    if (!currentRepId && !loadRepSession()) { showToast("الرجاء تسجيل الدخول أولاً", "error"); return; }
    const tbody = getEl('myOrdersBody');
    if (!tbody) return;
    setDefaultMyOrdersFilters();
    tbody.innerHTML = '<tr><td colspan="9"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    if (unsubMyOrders) unsubMyOrders();

    try {
        const q = query(collection(db, "orders"), where("repId", "==", currentRepId));
        unsubMyOrders = onSnapshot(q, (snap) => {
            let orders = [];
            snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
            orders.sort((a,b) => (normalizeDateValue(b.createdAt)?.getTime() || 0) - (normalizeDateValue(a.createdAt)?.getTime() || 0));
            currentMyOrdersData = orders.filter(o => isRepVisibleOrderStatus(o.status));
            applyMyOrdersFilters();
        }, () => showToast("خطأ في جلب البيانات.", "error"));
    } catch(e) { showToast("خطأ في جلب البيانات.", "error"); }
}

function applyMyOrdersFilters() {
    const tbody = getEl('myOrdersBody');
    if (!tbody) return;
    const fromVal = getEl('myOrdersDateFrom')?.value || '';
    const toVal = getEl('myOrdersDateTo')?.value || '';
    const pharmacyFilter = (getEl('myOrdersPharmacyFilter')?.value || '').toLowerCase().trim();
    const filtered = currentMyOrdersData.filter(order => {
        const pharmacyName = (order.pharmacyName || '').toLowerCase();
        const pharmacyCode = String(getPharmacyCodeFromOrder(order) || '').toLowerCase();
        return isOrderInDateRange(order, fromVal, toVal) && (!pharmacyFilter || pharmacyName.includes(pharmacyFilter) || pharmacyCode.includes(pharmacyFilter));
    });

    const totalVal = filtered.reduce((sum, order) => sum + parseAppNumber(order.grandTotal), 0);
    if (getEl('myOrdersPendingCount')) getEl('myOrdersPendingCount').innerText = filtered.length;
    if (getEl('myOrdersTotalValue')) getEl('myOrdersTotalValue').innerText = totalVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const badge = getEl('pendingBadge');
    if (badge) { badge.style.display = filtered.length > 0 ? 'inline-block' : 'none'; badge.innerText = filtered.length; }

    tbody.innerHTML = '';
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><i class="ph ph-package"></i><h3>لا توجد طلبيات ضمن الفلاتر الحالية</h3></div></td></tr>`;
        return;
    }

    filtered.forEach(order => {
        const tr = document.createElement('tr');
        tr.className = `row-${order.status}`;
        tr.innerHTML = `
            <td><input type="checkbox" class="my-order-checkbox" value="${order.id}" style="width:18px;height:18px;cursor:pointer;margin:0;"></td>
            <td>${order.id.substring(0,6).toUpperCase()}</td>
            <td>${formatDateTime(order.createdAt)}</td>
            <td>${order.pharmacyName || '-'}</td>
            <td>${getPharmacyCodeFromOrder(order) || '-'}</td>
            <td>${parseAppNumber(order.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="status-badge ${order.status || 'pending'}">${getWorkflowStatusLabel(order.status || 'pending')}</span></td>
            <td>${escapePrintHtml(getOrderRejectionReason(order) || '-')}</td>
            <td>
                <button class="btn-view" title="عرض التفاصيل"><i class="ph ph-eye"></i></button>
                ${canRepresentativeEditReturnedOrder(order) ? `<button class="action-btn edit-returned-order-btn" title="تعديل الطلبية المرجعة"><i class="ph ph-pencil"></i></button>` : ''}
            </td>
        `;
        tr.querySelector('.btn-view').onclick = () => showOrderDetails(order);
        tr.querySelector('.edit-returned-order-btn')?.addEventListener('click', () => openEditOrder(order.id, 'representative'));
        tbody.appendChild(tr);
    });
}

// 💡 تحديث الـ Dashboard المتقدم للمدير
// 💡 تحديث الـ Dashboard المتقدم للمدير (ديناميكي 100%)
function updateAdvancedManagerDashboard(orders) {
    const countLabel = document.querySelector('#dashDailyCount')?.previousElementSibling;
    if(countLabel) countLabel.innerText = "عدد الطلبيات المعروضة";

    let ordersTotal = 0;
    let returnsTotal = 0;
    let approvedCount = 0;
    const pharmCounts = {};
    const uniquePharms = new Set();

    orders.forEach(o => {
        const value = parseAppNumber(o.grandTotal);
        if (value < 0 || o.status === 'returned') returnsTotal += Math.abs(value);
        else ordersTotal += value;
        if (isRepApprovedVisibleStatus(o.status)) approvedCount++;
        if (o.pharmacyName) {
            pharmCounts[o.pharmacyName] = (pharmCounts[o.pharmacyName] || 0) + 1;
            uniquePharms.add(o.pharmacyName);
        }
    });

    const netTotal = ordersTotal - returnsTotal;
    const periodCount = orders.length;
    const appRate = periodCount > 0 ? Math.round((approvedCount / periodCount) * 100) : 0;
    let topPharm = "-";
    let maxC = 0;
    for (const [p, c] of Object.entries(pharmCounts)) {
        if (c > maxC) { maxC = c; topPharm = p; }
    }

    const money = value => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " د.ا";
    const e1 = getEl('dashDailyCount'); if(e1) e1.innerText = periodCount;
    const e2 = getEl('dashTotalValue'); if(e2) e2.innerText = money(ordersTotal);
    const eReturns = getEl('dashReturnsValue'); if(eReturns) eReturns.innerText = money(returnsTotal);
    const eNet = getEl('dashNetValue'); if(eNet) eNet.innerText = money(netTotal);
    const e3 = getEl('dashApprovalRate'); if(e3) e3.innerText = appRate + "%";
    const e4 = getEl('dashTopPharmacy'); if(e4) e4.innerText = topPharm;
    const e5 = getEl('dashUniquePharmacies'); if(e5) e5.innerText = uniquePharms.size;
}

let managerOrdersData = [];

async function loadManagerOrders() {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if (unsubManagerOrders) unsubManagerOrders();

    try {
        unsubManagerOrders = onSnapshot(collection(db, "orders"), (snap) => {
            let allOrders = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.createdAt) {
                    allOrders.push({ id: d.id, ...data });
                }
            });

            allOrders.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
                return dateB - dateA;
            });

            const managerReps = Object.keys(repManagerMap).filter(rep => repManagerMap[rep] === currentManagerName);
            const normalizedUnder = managerReps.map(r => r.trim().toLowerCase());

            managerOrdersData = allOrders.filter(o => {
                const repNameNorm = (o.repName || '').trim().toLowerCase();
                return normalizedUnder.includes(repNameNorm);
            });

            const repDropdown = document.getElementById('managerRepFilter');
            if (repDropdown && repDropdown.options.length <= 1) {
                repDropdown.innerHTML = '<option value="">جميع مندوبي</option>';
                managerReps.forEach(rep => {
                    const opt = document.createElement('option');
                    opt.value = rep;
                    opt.textContent = rep;
                    repDropdown.appendChild(opt);
                });
            }

            applyManagerFilters(); 
        }, (e) => {
            showToast("فشل في مزامنة بيانات الفريق", "error");
        });
    } catch (e) {
        showToast("فشل في مزامنة بيانات الفريق", "error");
    }
}

function applyManagerFilters() {
    const repDropdown = document.getElementById('managerRepFilter');
    let repFilterText = '';
    if (repDropdown && repDropdown.selectedIndex > 0) {
        repFilterText = repDropdown.options[repDropdown.selectedIndex].text.trim().toLowerCase();
    }

    const pharmFilter = document.getElementById('managerPharmacyFilter')?.value.trim().toLowerCase() || '';
    const statusFilter = document.getElementById('managerStatusFilter')?.value || '';

    const fromVal = document.getElementById('managerFilterFrom')?.value;
    const toVal = document.getElementById('managerFilterTo')?.value;

    let filtered = managerOrdersData.filter(o => {
        const repNameClean = (o.repName || '').toLowerCase();
        const matchRep = repFilterText === '' || repNameClean.includes(repFilterText);
        
        const matchPharm = pharmFilter === '' || (o.pharmacyName && o.pharmacyName.toLowerCase().includes(pharmFilter));
        const matchStatus = statusFilter === '' || o.status === statusFilter;
        
        let matchDate = true;
        if (o.createdAt && o.createdAt.toDate) {
            let oDate = o.createdAt.toDate();
            oDate.setHours(0,0,0,0);
            if (fromVal) { let dFrom = new Date(fromVal); dFrom.setHours(0,0,0,0); if (oDate < dFrom) matchDate = false; }
            if (toVal) { let dTo = new Date(toVal); dTo.setHours(0,0,0,0); if (oDate > dTo) matchDate = false; }
        }
        return matchRep && matchPharm && matchStatus && matchDate;
    });

    renderManagerOrders(filtered);
    updateAdvancedManagerDashboard(filtered); // 💡 تحديث اللوحة بالبيانات المفلترة
}

function renderManagerOrders(orders) {
    const tbody = document.getElementById('managerOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-magnifying-glass"></i><h3>لا توجد طلبيات مطابقة للبحث</h3></div></td></tr>`;
        return;
    }

    orders.forEach(order => {
        const isApproved = !isSupervisorPendingStatus(order.status);
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
        
        const tr = document.createElement('tr');
        tr.className = `row-${order.status}`; // 💡 تلوين شرطي
        tr.innerHTML = `
            <td><input type="checkbox" class="order-checkbox" value="${order.id}" style="width: 18px; height: 18px; cursor: pointer; margin: 0;"></td>
            <td>${order.id.substring(0, 6).toUpperCase()}</td>
            <td>${displayDate}</td>
            <td>${order.repName || '-'}</td>
            <td>${order.pharmacyName || '-'}</td>
            <td>${parseAppNumber(order.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="status-badge ${order.status}">${getWorkflowStatusLabel(order.status)}</span></td>
            <td>
                <button class="action-btn edit-btn" title="تعديل"><i class="ph ph-pencil"></i></button>
                ${!isApproved ? `<button class="action-btn approve-btn" title="موافقة"><i class="ph ph-check-circle"></i></button><button class="action-btn return-rep-btn" title="إرجاع للمندوب"><i class="ph ph-arrow-u-down-right"></i></button>` : ''}
            </td>
        `;
        
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'manager');
        if (!isApproved) {
            tr.querySelector('.return-rep-btn')?.addEventListener('click', () => supervisorReturnToRep(order.id, order));
            tr.querySelector('.approve-btn').onclick = async () => { 
                if(confirm("هل توافق على تمرير الطلبية؟")) { 
                    await approveOrderBySupervisor(order.id, order, 'supervisor_approved'); 
                    showToast("تم اعتماد الطلبية وتحويلها إلى مدير السوق", "success");
                } 
            };
        }
        tbody.appendChild(tr);
    });
}
document.getElementById('managerRepFilter')?.addEventListener('change', applyManagerFilters);
document.getElementById('managerPharmacyFilter')?.addEventListener('input', applyManagerFilters);
document.getElementById('managerStatusFilter')?.addEventListener('change', applyManagerFilters);


document.getElementById('selectAllOrders')?.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.order-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
});

async function handleBulkAction(actionType) {
    const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
    const orderIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    
    if (orderIds.length === 0) {
        showToast("الرجاء تحديد طلبية واحدة على الأقل", "warning");
        return;
    }

    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`هل أنت متأكد من ${actionText} ${orderIds.length} طلبية دفعة واحدة؟`)) return;

    try {
        const skipped = [];
        const promises = orderIds.map(id => {
            const order = managerOrdersData.find(o => o.id === id) || {};
            if (actionType === 'approve') {
                if (!isSupervisorPendingStatus(order.status)) {
                    skipped.push(id);
                    return Promise.resolve('skipped_not_pending');
                }
                return approveOrderBySupervisor(id, order, 'supervisor_bulk_approved');
            }
            return softDeleteOrderBySupervisor(id, order, 'supervisor_bulk_soft_delete');
        });
        
        await Promise.all(promises);
        showToast(skipped.length ? `تم تنفيذ العملية للطلبيات القابلة للاعتماد فقط. تم تجاوز ${skipped.length} طلبية.` : "تم تنفيذ العملية المجمعة بنجاح", skipped.length ? "warning" : "success");
        if(document.getElementById('selectAllOrders')) document.getElementById('selectAllOrders').checked = false;
    } catch (error) {
        showToast("حدث خطأ أثناء التنفيذ", "error");
    }
}

document.getElementById('bulkApproveBtn')?.addEventListener('click', () => handleBulkAction('approve'));
document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => handleBulkAction('delete'));

async function loadAllCompanyOrders() {
    const tbody = document.getElementById('allOrdersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    
    if (unsubAllOrders) unsubAllOrders();

    try {
        unsubAllOrders = onSnapshot(collection(db, "orders"), (snap) => {
            allOrdersData = [];
            snap.forEach(d => {
                const data = d.data();
                if (data.createdAt) {
                    allOrdersData.push({ id: d.id, ...data });
                }
            });

            allOrdersData.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : 0;
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : 0;
                return dateB - dateA;
            });

            filterAllOrders(); 
        }, (e) => { 
            showToast("خطأ في تحميل النظام الشامل", "error"); 
        });
    } catch(e) { 
        showToast("خطأ في التحميل", "error"); 
    }
}

function renderAllOrders(orders) {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '';
    if(orders.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-package"></i><h3>لا توجد بيانات مطابقة</h3></div></td></tr>`; 
        updateAllOrdersStats(orders); 
        return; 
    }
    orders.forEach(order => {
        const tr = document.createElement('tr');
        tr.className = `row-${order.status}`; // 💡 تلوين شرطي
        const displayDate = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString('en-GB') : "غير متوفر";
        
        const canApproveFromAll = canCurrentSupervisorApproveOrder(order);
        const unassignedBadge = isOrderWithoutAssignedSupervisor(order) ? '<small class="workflow-reason" style="color:#92400e;">بدون مشرف محدد</small>' : '';
        tr.innerHTML = `
            <td><input type="checkbox" class="all-order-checkbox" value="${order.id}" style="width: 18px; height: 18px; cursor: pointer; margin: 0;"></td>
            <td>${order.id.substring(0,6).toUpperCase()}</td>
            <td>${displayDate}</td>
            <td class="all-rep-col">${order.repName || '-'}</td>
            <td class="all-pharm-col">${order.pharmacyName || '-'}${unassignedBadge}</td>
            <td>${parseAppNumber(order.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td><span class="status-badge ${order.status}">${getWorkflowStatusLabel(order.status)}</span></td>
            <td><button class="btn-view" title="عرض التفاصيل"><i class="ph ph-eye"></i></button>
                <button class="action-btn edit-btn" title="تعديل"><i class="ph ph-pencil"></i></button>
                ${canApproveFromAll ? `<button class="action-btn approve-all-order-btn" title="موافقة"><i class="ph ph-check-circle"></i></button>` : ''}</td>
        `;
        tr.querySelector('.edit-btn').onclick = () => openEditOrder(order.id, 'all');
        tr.querySelector('.btn-view').onclick = () => showOrderDetails(order);
        tr.querySelector('.approve-all-order-btn')?.addEventListener('click', async () => {
            if (!confirm('اعتماد الطلبية وتحويلها إلى مدير السوق؟')) return;
            await approveOrderBySupervisor(order.id, order, isOrderWithoutAssignedSupervisor(order) ? 'supervisor_approved_unassigned_order' : 'supervisor_approved_all_orders');
            showToast('تم اعتماد الطلبية وتحويلها إلى مدير السوق', 'success');
        });
        tbody.appendChild(tr);
    });
    updateAllOrdersStats(orders);
}

function updateAllOrdersStats(orders) {
    const count = orders.length;
    let ordersTotal = 0;
    let returnsTotal = 0;
    orders.forEach(order => {
        const value = parseAppNumber(order.grandTotal);
        if (value < 0 || order.status === 'returned') returnsTotal += Math.abs(value);
        else ordersTotal += value;
    });
    const netTotal = ordersTotal - returnsTotal;
    const fmt = value => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (getEl('totalOrdersCount')) getEl('totalOrdersCount').innerText = count;
    if (getEl('totalOrdersSum')) getEl('totalOrdersSum').innerText = fmt(ordersTotal);
    if (getEl('totalReturnsSum')) getEl('totalReturnsSum').innerText = fmt(returnsTotal);
    if (getEl('totalNetSum')) getEl('totalNetSum').innerText = fmt(netTotal);
}

function showOrderDetails(order) {
    const modal = getEl('detailsModal');
    const body = getEl('modalItemsBody');
    if (!modal || !body) return;
    detailsModalOrder = order;
    body.innerHTML = '';
    const subtitle = getEl('modalPharmacySubtitle');
    if (subtitle) subtitle.innerText = `الصيدلية: ${order.pharmacyName || '-'} - المندوب: ${order.repName || '-'}${getPharmacyCodeFromOrder(order) ? ' - كود الصيدلية: ' + getPharmacyCodeFromOrder(order) : ''}`;

    const noteContainer = getEl('modalOrderNoteContainer');
    const noteText = getEl('modalOrderNoteText');
    if (noteContainer && noteText) {
        const note = order.orderNote || order.note || '';
        noteContainer.style.display = note ? 'block' : 'none';
        noteText.innerText = note;
    }

    const modalContent = modal.querySelector('.modal-content') || modal.firstElementChild;
    if(modalContent) {
        modalContent.style.display = 'flex';
        modalContent.style.flexDirection = 'column';
        modalContent.style.maxHeight = '90vh';
        const tableWrap = body.closest('.table-responsive') || body.parentElement;
        if(tableWrap) {
            tableWrap.style.flex = '1';
            tableWrap.style.overflowY = 'auto';
        }
    }

    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach(i => {
        const row = document.createElement('tr');
        const qtyVal = parseAppNumber(i.qty);
        const bonusVal = parseAppNumber(i.bonus);
        const bonusPctStr = (qtyVal > 0 && bonusVal > 0)
            ? `<div style="font-size:0.75rem; color:var(--primary); font-weight:bold; margin-top:2px;">${Math.round((bonusVal / qtyVal) * 100)}% بونص</div>`
            : '';
        row.innerHTML = `
            <td style="font-weight:600;">${i.name || '-'}</td>
            <td>${getProductCodeFromItem(i) || '-'}</td>
            <td style="text-align:center;">${qtyVal}</td>
            <td style="text-align:center;">${bonusVal} ${bonusPctStr}</td>
            <td style="text-align:center;">${parseAppNumber(i.price).toFixed(2)}</td>
            <td style="text-align:center;">${parseAppNumber(i.total).toFixed(2)}</td>
            <td>${i.note || '-'}</td>
        `;
        body.appendChild(row);
    });
    let footer = getEl('detailsModalActions');
    if (!footer) {
        footer = document.createElement('div');
        footer.id = 'detailsModalActions';
        footer.className = 'workflow-modal-footer';
        footer.style.marginTop = '16px';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.gap = '10px';
        footer.style.flexWrap = 'wrap';
        modal.querySelector('.modal-content')?.appendChild(footer);
    }
    if (APP_PAGE === 'supervisor') {
        const canApprove = canCurrentSupervisorApproveOrder(order);
        footer.innerHTML = `
            <button class="btn-secondary" id="detailsEditOrderBtn" type="button"><i class="ph ph-pencil"></i> تعديل الكميات / الأصناف / البونص</button>
            ${canApprove ? `<button class="btn-success" id="detailsApproveOrderBtn" type="button"><i class="ph ph-check-circle"></i> اعتماد الطلبية</button>` : ''}
            <button class="btn-danger" id="detailsDeleteOrderBtn" type="button"><i class="ph ph-trash"></i> حذف الطلبية</button>
        `;
        getEl('detailsEditOrderBtn')?.addEventListener('click', () => { modal.style.display = 'none'; openEditOrder(order.id, 'all'); });
        getEl('detailsApproveOrderBtn')?.addEventListener('click', async () => {
            if (!detailsModalOrder || !confirm('اعتماد الطلبية وتحويلها إلى مدير السوق؟')) return;
            await approveOrderBySupervisor(detailsModalOrder.id, detailsModalOrder, isOrderWithoutAssignedSupervisor(detailsModalOrder) ? 'supervisor_approved_unassigned_order_from_popup' : 'supervisor_approved_from_popup');
            showToast('تم اعتماد الطلبية وتحويلها إلى مدير السوق', 'success');
            modal.style.display = 'none';
        });
        getEl('detailsDeleteOrderBtn')?.addEventListener('click', async () => {
            if (!detailsModalOrder || !confirm('تحذير: سيتم حذف الطلبية كحذف ناعم مع حفظها في Firebase. هل تريد المتابعة؟')) return;
            await softDeleteOrderBySupervisor(detailsModalOrder.id, detailsModalOrder, 'supervisor_soft_delete_from_popup');
            showToast('تم حذف الطلبية من مسار العمل.', 'success');
            modal.style.display = 'none';
        });
    } else {
        footer.innerHTML = '';
        footer.style.display = 'none';
    }
    modal.style.display = 'flex';
}

function filterAllOrders() {
    const repFilter = (getEl('filterAllRep')?.value || '').toLowerCase().trim();
    const pharmFilter = (getEl('filterAllPharmacy')?.value || '').toLowerCase().trim();
    const statusFilter = (getEl('filterAllStatus')?.value || '').trim();
    const fromVal = getEl('managerFilterFrom')?.value;
    const toVal = getEl('managerFilterTo')?.value;

    const filtered = allOrdersData.filter(order => {
        const repName = (order.repName || '').toLowerCase();
        const pharmName = (order.pharmacyName || '').toLowerCase();
        const orderStatus = (order.status || '').trim();
        return repName.includes(repFilter) &&
               pharmName.includes(pharmFilter) &&
               (statusFilter === '' || orderStatus === statusFilter) &&
               isOrderInDateRange(order, fromVal, toVal);
    });

    renderAllOrders(filtered);
    updateAdvancedManagerDashboard(filtered);
}

const exportAllOrdersBtn = getEl('exportAllOrdersBtn');
if (exportAllOrdersBtn) exportAllOrdersBtn.onclick = () => {
    const btn = exportAllOrdersBtn;
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري التجهيز...";
    try {
        const ordersToExport = getCurrentFilteredAllOrders();
        const flatData = buildFlatOrderExportRows(ordersToExport);
        if(flatData.length === 0) {
            showToast("لا توجد بيانات مطابقة للفلاتر للتصدير", "warning");
            return;
        }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_الطلبيات_المفلترة.xlsx");
        showToast("تم تصدير الملف بنجاح", "success");
    } catch(e) {
        showToast("حدث خطأ أثناء التصدير", "error");
    } finally {
        btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير الطلبيات المفلترة";
    }
};

async function ensureProductsLoaded() {
    if (productsList.length > 0) return true;
    try {
        const prodSnap = await getDocs(collection(db, "products"));
        productsList = [];
        prodSnap.forEach(d => productsList.push({ id: d.id, ...d.data() }));
        productsList.sort((a,b) => a.name.localeCompare(b.name));
        return true;
    } catch(e) {
        return false;
    }
}

async function openEditOrder(orderId, userType) {
    const loaded = await ensureProductsLoaded();
    if (!loaded) { showToast("لم يتم تحميل المنتجات بشكل صحيح.", "error"); return; }

    const orderDoc = await getDoc(doc(db, "orders", orderId));
    if (!orderDoc.exists()) return showToast("الطلب غير موجود بالقاعدة.", "error");
    const order = orderDoc.data();
    editingOrderId = orderId;
    const isRepresentativeReturnedEdit = userType === 'representative' && canRepresentativeEditReturnedOrder({ id: orderId, ...order });

    let repOptionsHTML = '<option value="">-- اختر المندوب --</option>';
    const mainRepSelect = document.getElementById('repSelect');
    if(mainRepSelect) {
        Array.from(mainRepSelect.options).forEach(opt => {
            if (opt.value) {
                repOptionsHTML += `<option value="${opt.value}" ${opt.value === order.repId ? 'selected' : ''}>${opt.textContent}</option>`;
            }
        });
    }

    let editPharmaciesData = [];
    let editPharmacyNames = [];
    try {
        const q = query(collection(db, "pharmacies"), where("rep_id", "==", order.repId));
        const pharmSnap = await getDocs(q);
        pharmSnap.forEach(d => {
            editPharmaciesData.push(d.data());
            editPharmacyNames.push(d.data().name);
        });
    } catch (error) {}

    const editModal = document.getElementById('editOrderModal');
    if (editModal) editModal.style.display = 'flex';

    const container = document.getElementById('editOrderContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; height: 100%; max-height: 85vh; background: #fff; overflow: hidden;">
            <div style="flex: 0 0 auto; padding-bottom: 15px; margin-bottom: 10px; border-bottom: 2px solid #eee;">
                <h3 style="margin: 0 0 15px 0; color: #004a99;"><i class="ph ph-pencil-simple"></i> تعديل طلبية</h3>
                <div style="display: flex; gap: 15px; flex-wrap: wrap; background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div style="flex: 1; min-width: 200px;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block; color: #333;">المندوب:</label>
                        <select id="editRepSelect" ${isRepresentativeReturnedEdit ? 'disabled' : ''} style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; outline: none; font-family: inherit; font-size: 14px;">
                            ${repOptionsHTML}
                        </select>
                    </div>
                    <div style="flex: 1; min-width: 200px; position: relative;">
                        <label style="font-weight: 600; font-size: 14px; margin-bottom: 8px; display: block; color: #333;">اسم الصيدلية:</label>
                        <div class="autocomplete-wrapper" style="width: 100%;">
                            <input type="text" id="editPharmacyInput" value="${order.pharmacyName || ''}" placeholder="ابحث عن الصيدلية..." style="width:100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; outline: none; font-family: inherit; font-size: 14px;" autocomplete="off">
                            <div id="editPharmacySuggestions" class="autocomplete-list"></div>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="flex: 1 1 auto; overflow-y: auto; min-height: 0; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; background: #fff;">
                <table class="order-table" style="width: 100%; border-collapse: collapse; text-align: right; margin: 0;">
                    <thead style="background-color: #004a99; color: white; position: sticky; top: 0; z-index: 10;">
                        <tr>
                            <th style="padding: 12px; font-weight: normal; border-bottom: none;">الصنف</th>
                            <th style="padding: 12px; text-align: center; width: 70px; font-weight: normal; border-bottom: none;">الكمية</th>
                            <th style="padding: 12px; text-align: center; width: 70px; font-weight: normal; border-bottom: none;">البونص</th>
                            <th style="padding: 12px; text-align: center; width: 90px; font-weight: normal; border-bottom: none;">السعر</th>
                            <th style="padding: 12px; text-align: center; width: 100px; font-weight: normal; border-bottom: none;">المجموع</th>
                            <th style="padding: 12px; text-align: center; width: 120px; font-weight: normal; border-bottom: none;">ملاحظة</th>
                            <th style="padding: 12px; text-align: center; width: 50px; font-weight: normal; border-bottom: none;">حذف</th>
                        </tr>
                    </thead>
                    <tbody id="editOrderBody"></tbody>
                </table>
            </div>

            <div style="flex: 0 0 auto; background: #fff; padding-top: 10px; border-top: 2px solid #eee;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px; padding: 15px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e0e0e0;">
                    <div>
                        <button type="button" id="editAddRowBtn" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #004a99; background: #e6f2ff; color: #004a99; font-weight: bold; font-family: inherit; transition: all 0.2s;">
                            <i class="ph ph-plus"></i> إضافة صنف
                        </button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                        <h3 style="margin: 0; color: #d32f2f; font-size: 18px; font-weight: bold;"> الإجمالي: <span id="editGrandTotal">${parseFloat(order.grandTotal).toFixed(2)}</span> </h3>
                        <div style="display: flex; gap: 10px;">
                            <button type="button" onclick="closeEditModal()" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; border: 1px solid #ccc; background: #fff; color: #333; font-weight: bold; font-family: inherit;"> إلغاء </button>
                            <button type="button" id="saveEditOrderBtn" style="padding: 10px 20px; border-radius: 6px; cursor: pointer; background: #004a99; color: white; border: none; font-weight: bold; font-family: inherit; display: flex; align-items: center; gap: 5px;"> <i class="ph ph-floppy-disk"></i> حفظ التعديلات </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const editRepSelect = document.getElementById('editRepSelect');
    const editPharmInput = document.getElementById('editPharmacyInput');
    const editPharmSuggestions = document.getElementById('editPharmacySuggestions');

    setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);

    editRepSelect.addEventListener('change', async function() {
        const selectedRepId = this.value;
        editPharmaciesData = [];
        editPharmacyNames = [];
        editPharmInput.value = ''; 
        
        if (!selectedRepId) {
            editPharmInput.placeholder = 'اختر المندوب أولاً';
            setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);
            return;
        }

        editPharmInput.placeholder = 'جاري تحميل الصيدليات...';
        try {
            const q = query(collection(db, "pharmacies"), where("rep_id", "==", selectedRepId));
            const pharmSnap = await getDocs(q);
            pharmSnap.forEach(d => { editPharmaciesData.push(d.data()); editPharmacyNames.push(d.data().name); });
            editPharmInput.placeholder = 'ابحث عن الصيدلية...';
            setupAutocomplete(editPharmInput, editPharmSuggestions, editPharmacyNames);
        } catch (error) { editPharmInput.placeholder = 'خطأ في التحميل'; }
    });

    editPharmInput.addEventListener('blur', function() {
        const val = this.value.trim();
        const isValid = editPharmacyNames.includes(val);
        if (!isValid && val !== "") { this.style.border = "2px solid red"; } 
        else { this.style.border = "1px solid #ccc"; }
    });

    const editBody = document.getElementById('editOrderBody');
    if (editBody) editBody.innerHTML = ''; 

    function updateEditTotal() {
        let total = 0;
        document.querySelectorAll('#editOrderBody .row-total').forEach(td => total += parseFloat(td.innerText) || 0);
        const grandTotalEl = document.getElementById('editGrandTotal');
        if (grandTotalEl) grandTotalEl.innerText = total.toFixed(2);
    }

function addEditRow(productName='', qty=1, bonus=0, price=0, rowTotal=0, note='') {
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #eee";
        tr.innerHTML = `
            <td style="padding: 8px;"><div class="autocomplete-wrapper"><input type="text" class="product-input" value="${productName.replace(/"/g, '&quot;')}" style="width:100%; min-width:200px; padding:8px; border:1px solid #ccc; border-radius:4px; outline:none;" autocomplete="off"><div class="autocomplete-list product-suggestions"></div></div></td>
            <td style="padding: 8px; text-align: center;"><input type="number" class="qty-input" value="${qty}" min="1" style="width: 65px; text-align: center; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;"></td>
            <td style="padding: 8px; text-align: center; position:relative;">
                <input type="number" class="bonus-input" value="${bonus}" min="0" style="width: 65px; text-align: center; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;">
                <span class="edit-bonus-pct" style="font-size:0.75rem; color:#004a99; font-weight:bold; display:block; text-align:center; margin-top:4px;"></span>
            </td>
            <td class="price-cell" style="padding: 8px; text-align: center; font-weight: bold; color: #333;">${parseFloat(price).toFixed(2)}</td>
            <td class="row-total" style="padding: 8px; text-align: center; font-weight: bold; color: #d32f2f;">${parseFloat(rowTotal).toFixed(2)}</td>
            <td style="padding: 8px;"><input type="text" class="item-note-input" value="${note}" placeholder="ملاحظة..." style="width:100%; min-width:100px; padding: 8px; border:1px solid #ccc; border-radius:4px; outline:none;"></td>
            <td style="padding: 8px; text-align: center;"><button type="button" class="btn-danger del-row" style="padding: 6px 10px; border-radius: 4px; border:none; background:#dc3545; color:white; cursor:pointer;"><i class="ph ph-trash"></i></button></td>
        `;
        const s = tr.querySelector('.product-input'), sug = tr.querySelector('.product-suggestions');
        const q = tr.querySelector('.qty-input'), p = tr.querySelector('.price-cell'), t = tr.querySelector('.row-total');
        const b = tr.querySelector('.bonus-input'), bPct = tr.querySelector('.edit-bonus-pct'); // 🟢 جلب حقول البونص
        const productNames = productsList.map(prod => prod.name);
        
        // 🟢 وظيفة حساب نسبة البونص للتعديل
        function calcEditBonus() {
            const qVal = parseFloat(q.value) || 0;
            const bVal = parseFloat(b.value) || 0;
            if(qVal > 0 && bVal > 0) {
                bPct.innerText = `${Math.round((bVal / qVal) * 100)}% بونص`;
            } else {
                bPct.innerText = "";
            }
        }

        setupAutocomplete(s, sug, productNames, (selectedName) => { 
            const prod = productsList.find(pr => pr.name === selectedName); 
            const pr = prod ? parseFloat(prod.price) : 0; 
            s.dataset.productCode = prod?.productCode || prod?.product_code || prod?.code || ''; 
            p.innerText = pr.toFixed(2); 
            t.innerText = (pr * q.value).toFixed(2); 
            updateEditTotal(); 
        });

        s.addEventListener('blur', function() {
            const val = this.value.trim();
            if (val === "") return;
            const isValid = productsList.some(pr => pr.name === val);
            if (!isValid) { this.style.border = "2px solid red"; } 
            else { this.style.border = "1px solid #ccc"; }
        });

        q.oninput = () => { 
            t.innerText = (parseFloat(p.innerText) * q.value).toFixed(2); 
            calcEditBonus(); // 🟢 التحديث عند تغيير الكمية
            updateEditTotal(); 
        };
        b.oninput = () => { calcEditBonus(); updateEditTotal(); }; // 🟢 التحديث عند تغيير البونص

        tr.querySelector('.del-row').onclick = () => { tr.remove(); updateEditTotal(); };
        
        if (editBody) editBody.appendChild(tr);
        calcEditBonus(); // 🟢 حساب النسبة لحظة تحميل السطر للمرة الأولى
        updateEditTotal();
    }    
    if (order.items && order.items.length > 0) {
        order.items.forEach(item => { addEditRow(item.name, item.qty, item.bonus, item.price, item.total, item.note || ''); });
    } else { addEditRow(); }   
    const editAddBtn = document.getElementById('editAddRowBtn');
    if (editAddBtn) editAddBtn.onclick = () => addEditRow();
    
    const saveBtn = document.getElementById('saveEditOrderBtn');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.onclick = async () => {
            const items = [];
            let invalidItem = false;

            const newRepId = editRepSelect.value;
            if (!newRepId) { editRepSelect.style.border = "2px solid red"; return showToast("يرجى اختيار المندوب أولاً.", "warning"); }
            const newRepName = editRepSelect.options[editRepSelect.selectedIndex].text;

            const newPharmName = editPharmInput.value.trim();
            const selectedPharm = editPharmaciesData.find(p => p.name === newPharmName);
            
            if (!selectedPharm) { editPharmInput.style.border = "2px solid red"; return showToast("يرجى اختيار صيدلية صحيحة من القائمة.", "error"); }

            document.querySelectorAll('#editOrderBody tr').forEach(r => {
                const inp = r.querySelector('.product-input');
                if (inp && inp.value.trim() !== "") {
                    const isValid = productsList.some(prod => prod.name === inp.value.trim());
                    if (!isValid) { invalidItem = true; inp.style.border = "2px solid red"; } 
                    else {
                        inp.style.border = "1px solid #ccc";
                        items.push(createProductItemFromRow(r));                    
                    }
                }
            });

            if (invalidItem) return showToast("تأكد من صحة الأصناف المختارة.", "error");
            if (items.length === 0) return showToast("لا يمكن حفظ مسودة فارغة!", "warning");

            try {
                const grandTotalEl = document.getElementById('editGrandTotal');
                const newGrandTotal = grandTotalEl ? parseFloat(grandTotalEl.innerText) : 0;
                
                const workflowReset = (isSupervisorPendingStatus(order.status) || isRepresentativeReturnedEdit)
                    ? { status: "pending_supervisor_approval", workflowStage: "supervisor", supervisorStatus: "pending_supervisor_approval", returnResolvedAt: new Date(), returnResolvedBy: newRepName }
                    : {};
                await updateOrderWithAudit(editingOrderId, { 
                    repId: newRepId, repName: newRepName, managerName: getManagerName(newRepName), 
                    pharmacyName: newPharmName, pharmacyCode: selectedPharm.pharmacyCode || selectedPharm.pharmacy_code || "",
                    items: items, grandTotal: newGrandTotal, ...workflowReset
                }, buildAuditEntry(isRepresentativeReturnedEdit ? 'representative_resubmitted_returned_order' : 'supervisor_order_edited', isRepresentativeReturnedEdit ? newRepName : (currentManagerName || 'Supervisor'), isRepresentativeReturnedEdit ? 'representative' : 'supervisor', { orderId: editingOrderId, status: order.status || '' }, { grandTotal: newGrandTotal, status: workflowReset.status || order.status || '' }));
                showToast("تم تحديث الطلبية بنجاح", "success");
                closeEditModal();
            } catch (e) { showToast("حدث خطأ أثناء التحديث", "error"); }
        };
    }
}
function closeEditModal() { 
    const editModal = document.getElementById('editOrderModal');
    if (editModal) { editModal.style.display = 'none'; }
    editingOrderId = null; 
}
window.closeEditModal = closeEditModal;

async function loadReports() {
    const body = getEl('reportsBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="8"><div class="skeleton" style="height:40px;width:100%;"></div></td></tr>';
    if(unsubReports) unsubReports();

    try {
        unsubReports = onSnapshot(collection(db, "orders"), (snap) => {
            let os = [];
            snap.forEach(d => os.push({ id: d.id, ...d.data() }));
            os.sort((a,b) => (normalizeDateValue(b.createdAt)?.getTime() || 0) - (normalizeDateValue(a.createdAt)?.getTime() || 0));
            if (!isAdmin && currentRepName) os = os.filter(o => o.repName === currentRepName);
            reportsOrdersData = os;
            body.innerHTML = '';
            if (os.length === 0) {
                body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-package"></i><h3>لا توجد طلبيات</h3></div></td></tr>`;
                return;
            }
            os.forEach(o => {
                const tr = document.createElement('tr');
                tr.className = `row-${o.status}`;
                tr.innerHTML = `
                    <td><input type="checkbox" class="report-order-checkbox" value="${o.id}" style="width:18px;height:18px;cursor:pointer;margin:0;"></td>
                    <td><b>${o.id.substring(0,5).toUpperCase()}</b></td>
                    <td>${formatDateTime(o.createdAt)}</td>
                    <td class="rep-col">${o.repName || '-'}</td>
                    <td class="pharm-col">${o.pharmacyName || '-'}</td>
                    <td>${parseAppNumber(o.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td><span class="status-badge ${o.status}">${getWorkflowStatusLabel(o.status)}</span></td>
                    <td><button class="btn-view" style="color:#004a99;"><i class="ph ph-eye"></i></button></td>
                `;
                tr.querySelector('.btn-view').onclick = () => showOrderDetails(o);
                body.appendChild(tr);
            });
            filterReportsTable();
        });
    } catch(e) { showToast("خطأ في الاتصال بالبيانات", "error"); }
}

function filterReportsTable() {
    const repFilter = (getEl('filterRep')?.value || '').toLowerCase();
    const pharmFilter = (getEl('filterPharmacy')?.value || '').toLowerCase();
    document.querySelectorAll('#reportsBody tr').forEach(row => {
        if(row.children.length > 1) {
            const rep = row.querySelector('.rep-col')?.innerText.toLowerCase() || '';
            const pharm = row.querySelector('.pharm-col')?.innerText.toLowerCase() || '';
            row.style.display = (rep.includes(repFilter) && pharm.includes(pharmFilter)) ? '' : 'none';
        }
    });
}
getEl('filterRep')?.addEventListener('input', filterReportsTable);
getEl('filterPharmacy')?.addEventListener('input', filterReportsTable);
getEl('selectAllReportsOrders')?.addEventListener('change', function() {
    document.querySelectorAll('.report-order-checkbox').forEach(cb => cb.checked = this.checked);
});

const exportExcelBtn = getEl('exportExcelBtn');
if (exportExcelBtn) exportExcelBtn.onclick = async () => {
    const btn = exportExcelBtn;
    btn.innerHTML = "<i class='ph ph-spinner ph-spin'></i> جاري...";
    try {
        const snap = await getDocs(collection(db, "orders"));
        let allOrders = [];
        snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
        if (!isAdmin && currentRepName) allOrders = allOrders.filter(o => o.repName === currentRepName);
        const flatData = buildFlatOrderExportRows(allOrders);
        if (flatData.length === 0) { showToast("لا توجد بيانات للتصدير", "warning"); return; }
        const ws = XLSX.utils.json_to_sheet(flatData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "الطلبيات");
        XLSX.writeFile(wb, "تقرير_طلبيات.xlsx");
        showToast("اكتمل التصدير!", "success");
    } catch (e) { showToast("حدث خطأ في استخراج البيانات", "error"); }
    finally { btn.innerHTML = "<i class='ph ph-file-xls'></i> تصدير للاكسل"; }
};

const navOrderBtn = getEl('navOrderBtn');
if (navOrderBtn) navOrderBtn.onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    getEl('orderScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    navOrderBtn.classList.add('active');
};
const navMyOrdersBtn = getEl('navMyOrdersBtn');
if (navMyOrdersBtn) navMyOrdersBtn.onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    getEl('myOrdersScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    navMyOrdersBtn.classList.add('active');
    loadMyOrders();
};
const navReportsBtn = getEl('navReportsBtn');
if (navReportsBtn) navReportsBtn.onclick = () => {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    getEl('reportsScreen').style.display = 'block';
    document.querySelectorAll('.btn-tab').forEach(b => b.classList.remove('active'));
    navReportsBtn.classList.add('active');
    loadReports();
};
const logoutBtn = getEl('logoutBtn');
if (logoutBtn) logoutBtn.onclick = () => {
    if (!confirm("هل أنت متأكد من تسجيل الخروج؟")) return;
    clearRepSession();
    clearAdminSession();
    sessionStorage.removeItem('activeOrderContext');
    sessionStorage.removeItem('adminOrderMode');
    window.location.href = 'login.html';
};

let selectedAdminType = null;
let selectedAdminName = null;

document.querySelectorAll('.btn-admin-opt').forEach(btn => {
    btn.onclick = (e) => {
        document.querySelectorAll('.btn-admin-opt').forEach(b => b.classList.remove('active'));
        const targetBtn = e.currentTarget;
        targetBtn.classList.add('active');
        selectedAdminType = targetBtn.getAttribute('data-type');
        selectedAdminName = targetBtn.getAttribute('data-name');
    };
});

const adminModeBtn = getEl('adminModeBtn');
if (adminModeBtn) adminModeBtn.onclick = () => {
    const isNoticeShown = localStorage.getItem('systemUpdate_v1');
    if (!isNoticeShown && getEl('updateNoticeModal')) {
        getEl('updateNoticeModal').style.display = 'flex';
        const closeBtn = getEl('closeUpdateNoticeBtn');
        if (closeBtn) closeBtn.onclick = () => {
            getEl('updateNoticeModal').style.display = 'none';
            localStorage.setItem('systemUpdate_v1', 'true');
            openAdminLoginBox();
        };
    } else { openAdminLoginBox(); }
};

function openAdminLoginBox() {
    const modal = getEl('adminLoginModal');
    if (!modal) return;
    modal.style.display = 'flex';
    const passInput = getEl('adminPasswordInput');
    if (passInput) { passInput.value = ''; passInput.focus(); }
}

getEl('adminPasswordInput')?.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); getEl('confirmAdminLoginBtn')?.click(); }
});

const confirmAdminLoginBtn = getEl('confirmAdminLoginBtn');
if (confirmAdminLoginBtn) confirmAdminLoginBtn.onclick = (e) => {
    e.preventDefault();
    if (!selectedAdminType) return showToast("الرجاء تحديد هويتك من البطاقات أعلاه", "warning");
    const pass = getEl('adminPasswordInput')?.value || '';
    const SECRET_HASH = "MjAyNjA0";
    if (btoa(pass) === SECRET_HASH) {
        const rememberMe = !!(getEl('rememberAdmin')?.checked || getEl('rememberMe')?.checked);
        saveAdminSession(selectedAdminName, selectedAdminType, rememberMe);
        if (selectedAdminType === 'reports') {
            sessionStorage.removeItem('adminOrderMode');
            window.location.href = 'reports.html';
        } else {
            window.location.href = 'supervisor.html';
        }
    } else {
        showToast("رمز المرور غير صحيح!", "error");
    }
};
getEl('selectAllAllOrders')?.addEventListener('change', function() {
    const checkboxes = document.querySelectorAll('.all-order-checkbox');
    checkboxes.forEach(cb => cb.checked = this.checked);
});

async function handleAllOrdersBulkAction(actionType) {
    const selectedCheckboxes = document.querySelectorAll('.all-order-checkbox:checked');
    const orderIds = Array.from(selectedCheckboxes).map(cb => cb.value);
    if (orderIds.length === 0) { return showToast("الرجاء تحديد طلبية واحدة على الأقل", "warning"); }
    const actionText = actionType === 'approve' ? 'الموافقة على' : 'حذف';
    if (!confirm(`تحذير: هل أنت متأكد من ${actionText} ${orderIds.length} طلبية دفعة واحدة؟`)) return;
    try {
        const skipped = [];
        const promises = orderIds.map(id => {
            const order = allOrdersData.find(o => o.id === id) || {};
            if (actionType === 'approve') {
                if (!canCurrentSupervisorApproveOrder(order)) {
                    skipped.push(id);
                    return Promise.resolve('skipped_not_allowed');
                }
                return approveOrderBySupervisor(id, order, isOrderWithoutAssignedSupervisor(order) ? 'supervisor_bulk_approved_unassigned_orders' : 'supervisor_bulk_approved_all_orders');
            }
            if (!isOrderUnderCurrentManager(order)) {
                skipped.push(id);
                return Promise.resolve('skipped_not_under_manager');
            }
            return softDeleteOrderBySupervisor(id, order, 'supervisor_bulk_soft_delete_all_orders');
        });
        await Promise.all(promises);
        showToast(skipped.length ? `تم تنفيذ الأمر على الطلبيات المسموحة فقط. تم تجاوز ${skipped.length} طلبية.` : "تم تنفيذ الأمر بنجاح", skipped.length ? "warning" : "success");
        if(getEl('selectAllAllOrders')) getEl('selectAllAllOrders').checked = false;
    } catch (error) { showToast("حدث خطأ أثناء التنفيذ الشامل", "error"); }
}

getEl('bulkApproveAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('approve'));
getEl('bulkDeleteAllBtn')?.addEventListener('click', () => handleAllOrdersBulkAction('delete'));

window.closeModal = () => { const modal = getEl('detailsModal'); if (modal) modal.style.display = 'none'; detailsModalOrder = null; };

// تشغيل التحميل المبدئي
loadInitialData();

// فلاتر التاريخ (للمدير)
const managerFilterFrom = document.getElementById('managerFilterFrom');
const managerFilterTo = document.getElementById('managerFilterTo');
const btnTodayOrders = document.getElementById('btnTodayOrders');
const btnClearManagerFilter = document.getElementById('btnClearManagerFilter');

managerFilterFrom?.addEventListener('change', () => { applyManagerFilters(); filterAllOrders(); });
managerFilterTo?.addEventListener('change', () => { applyManagerFilters(); filterAllOrders(); });

btnTodayOrders?.addEventListener('click', () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    managerFilterFrom.value = todayStr;
    managerFilterTo.value = todayStr;
    applyManagerFilters();
    filterAllOrders();
});

btnClearManagerFilter?.addEventListener('click', () => {
    managerFilterFrom.value = '';
    managerFilterTo.value = '';
    applyManagerFilters();
    filterAllOrders();
});
