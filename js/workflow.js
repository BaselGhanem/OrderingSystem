import { db, collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy, limit, startAfter, documentId } from './firebase.js';

const COMPANY_LOGO_URL = 'https://www.dadgroup.com/wp-content/uploads/2023/11/uplift-dad-website-05.png';
const WORKFLOW_PAGE = document.body?.dataset?.page || '';
const $ = id => document.getElementById(id);

const STATUS_LABELS = {
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
    deleted_by_reports: 'محذوف من التقارير'
};

const state = {
    orders: [],
    visibleOrders: [],
    selectedOrder: null,
    unsub: null,
    productsByName: new Map(),
    onOrdersChange: null,
    renderToken: 0,
    allOrdersLoaded: false,
    allOrdersLoading: false,
    lastRefreshAt: 0,
    loadToken: 0,
    suspendRender: false,
    ordersStaffTab: 'approved'
};

const WORKFLOW_CACHE_VERSION = '20260622_product_code_sync1';
const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12;
const PAGE_CACHE_KEY = `dad_orders_${WORKFLOW_CACHE_VERSION}_${WORKFLOW_PAGE || 'workflow'}`;
const ALL_ORDERS_CACHE_KEY = `dad_orders_${WORKFLOW_CACHE_VERSION}_orders_staff_all`;

function debounce(fn, delay = 160) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function nextFrame() {
    return new Promise(resolve => {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(resolve, { timeout: 120 });
        } else {
            setTimeout(resolve, 0);
        }
    });
}

function compactOrder(order = {}) {
    return {
        id: order.id || '',
        status: order.status || '',
        workflowStage: order.workflowStage || '',
        createdAt: order.createdAt || null,
        updatedAt: order.updatedAt || null,
        changedAt: order.changedAt || null,
        repName: order.repName || '',
        representativeName: order.representativeName || '',
        pharmacyName: order.pharmacyName || '',
        pharmacyCode: order.pharmacyCode || order.pharmacy_code || order.customerCode || '',
        pharmacy_code: order.pharmacy_code || '',
        customerCode: order.customerCode || '',
        grandTotal: order.grandTotal || 0,
        total: order.total || 0,
        orderNote: order.orderNote || '',
        note: order.note || '',
        notes: order.notes || '',
        repNote: order.repNote || '',
        representativeNote: order.representativeNote || '',
        items: Array.isArray(order.items) ? order.items : [],
        supervisorStatus: order.supervisorStatus || '',
        supervisorRejectionReason: order.supervisorRejectionReason || '',
        marketManagerStatus: order.marketManagerStatus || '',
        marketManagerRejectionReason: order.marketManagerRejectionReason || '',
        financeStatus: order.financeStatus || '',
        financeRejectionReason: order.financeRejectionReason || '',
        returnReason: order.returnReason || '',
        returnTarget: order.returnTarget || '',
        returnedBy: order.returnedBy || '',
        returnedByRole: order.returnedByRole || '',
        returnedAt: order.returnedAt || null,
        orderStaffStatus: order.orderStaffStatus || '',
        exportedAt: order.exportedAt || null,
        hiddenByOrderStaff: order.hiddenByOrderStaff === true,
        hiddenAt: order.hiddenAt || null
    };
}

function sortOrders(orders) {
    return [...orders].sort((a, b) => (normalizeDate(b.createdAt)?.getTime() || 0) - (normalizeDate(a.createdAt)?.getTime() || 0));
}

function readCache(key) {
    try {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.orders)) return null;
        if (Date.now() - (payload.savedAt || 0) > CACHE_MAX_AGE_MS) return null;
        return payload.orders;
    } catch (error) {
        return null;
    }
}

function writeCache(key, orders) {
    const maxCacheRows = key === ALL_ORDERS_CACHE_KEY ? 2000 : 3000;
    try {
        const compact = orders.slice(0, maxCacheRows).map(compactOrder);
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), orders: compact }));
    } catch (error) {
        try { sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), orders: orders.slice(0, 400).map(compactOrder) })); } catch (_) {}
    }
}

function readProductsCache() {
    try {
        const raw = localStorage.getItem(`dad_products_${WORKFLOW_CACHE_VERSION}`) || sessionStorage.getItem(`dad_products_${WORKFLOW_CACHE_VERSION}`);
        if (!raw) return null;
        const payload = JSON.parse(raw);
        if (!payload || !Array.isArray(payload.products)) return null;
        if (Date.now() - (payload.savedAt || 0) > CACHE_MAX_AGE_MS) return null;
        return payload.products;
    } catch (_) {
        return null;
    }
}

function writeProductsCache(products) {
    const compact = products.map(product => ({
        id: product.id || '',
        name: product.name || '',
        productCode: product.productCode || product.product_code || product.code || '',
        product_code: product.product_code || '',
        code: product.code || '',
        price: product.price ?? product.unitPrice ?? product.value ?? 0
    }));
    try {
        localStorage.setItem(`dad_products_${WORKFLOW_CACHE_VERSION}`, JSON.stringify({ savedAt: Date.now(), products: compact }));
    } catch (_) {
        try { sessionStorage.setItem(`dad_products_${WORKFLOW_CACHE_VERSION}`, JSON.stringify({ savedAt: Date.now(), products: compact.slice(0, 1000) })); } catch (__) {}
    }
}

function setLoadingRow(tbodyId, colspan, message = 'جاري تحميل البيانات...') {
    const body = $(tbodyId);
    if (!body) return;
    body.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><i class="ph ph-circle-notch ph-spin"></i><h3>${escapeHtml(message)}</h3></div></td></tr>`;
}

function showDataModeNotice(message) {
    const el = $('dataModeNotice');
    if (el) el.textContent = message || '';
}

function currentPageOrderSource() {
    const ordersRef = collection(db, 'orders');
    if (WORKFLOW_PAGE === 'market-manager') return query(ordersRef, where('status', 'in', ['market_manager_pending', 'supervisor_approved', 'returned_to_market_manager']));
    if (WORKFLOW_PAGE === 'finance-controller') return query(ordersRef, where('status', 'in', ['finance_pending', 'finance_rejected', 'returned_to_finance']));
    if (WORKFLOW_PAGE === 'orders-staff') return query(ordersRef, where('status', 'in', ['orders_staff_pending', 'orders_staff_hidden', 'orders_staff_exported', 'finance_approved']));
    return ordersRef;
}

function showToast(message, type = 'info') {
    const container = $('toast-container');
    if (!container) return alert(message);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : type === 'warning' ? 'ph-warning' : 'ph-info';
    toast.innerHTML = `<i class="ph ${icon}" style="font-size:1.25rem"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.25s forwards';
        setTimeout(() => toast.remove(), 250);
    }, 3600);
}

function parseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const normalized = String(value)
        .replace(/,/g, '')
        .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
        .replace(/[^0-9.\-]/g, '')
        .trim();
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
    return parseNumber(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeDate(value) {
    if (!value) return null;
    if (value.toDate && typeof value.toDate === 'function') return value.toDate();
    if (typeof value === 'object' && typeof value.seconds === 'number') {
        return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1000000));
    }
    const d = value instanceof Date ? value : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateTime(value) {
    const d = normalizeDate(value);
    return d ? d.toLocaleString('en-GB') : '-';
}

function toDateInputValue(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function firstDayOfMonth() {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function statusLabel(status) {
    return STATUS_LABELS[status] || status || '-';
}

function getOrderNote(order = {}) {
    return order.orderNote || order.note || order.notes || order.repNote || order.representativeNote || order.order_note || '';
}

function getPrimaryStatus(order = {}) {
    return order.status || order.orderStatus || order.workflowStatus || '';
}

function getWorkflowFollowUp(order = {}) {
    const status = getPrimaryStatus(order);
    const supervisorState = order.supervisorStatus || '';
    const marketState = order.marketManagerStatus || '';
    const financeState = order.financeStatus || '';
    const staffState = order.orderStaffStatus || '';
    const returnedBy = order.returnedBy ? ` — أرجعها: ${order.returnedBy}` : '';
    const returnReason = order.returnReason ? `سبب الإرجاع: ${order.returnReason}` : '';

    if (status === 'returned_to_rep') return { ownerKey: 'representative', owner: 'المندوب', detail: returnReason || `مطلوب تعديل الطلبية من المندوب${returnedBy}` };
    if (status === 'pending' || status === 'pending_supervisor_approval' || supervisorState === 'pending_supervisor_approval') return { ownerKey: 'supervisor', owner: 'المشرف', detail: 'بانتظار موافقة المشرف' };
    if (status === 'returned_to_supervisor') return { ownerKey: 'supervisor', owner: 'المشرف', detail: returnReason || `مطلوب مراجعة المشرف${returnedBy}` };
    if (status === 'supervisor_approved' || status === 'market_manager_pending' || marketState === 'market_manager_pending') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: 'بانتظار موافقة مدير السوق' };
    if (status === 'returned_to_market_manager') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: returnReason || `مطلوب مراجعة مدير السوق${returnedBy}` };
    if (status === 'market_manager_rejected' || marketState === 'market_manager_rejected') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: order.marketManagerRejectionReason || 'مرفوض من مدير السوق' };
    if (status === 'market_manager_approved' || status === 'finance_pending' || financeState === 'finance_pending') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: 'بانتظار الاعتماد المالي' };
    if (status === 'finance_rejected' || financeState === 'finance_rejected') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: order.financeRejectionReason || 'مرفوض مالياً' };
    if (status === 'returned_to_finance') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: returnReason || `مرجعة للمراقب المالي${returnedBy}` };
    if (status === 'finance_approved' || status === 'orders_staff_pending' || staffState === 'orders_staff_pending') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'جاهزة للمعالجة / التصدير' };
    if (status === 'orders_staff_exported' || staffState === 'orders_staff_exported') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تم التصدير ولم تُخفَ بعد' };
    if (status === 'orders_staff_hidden' || staffState === 'orders_staff_hidden' || order.hiddenByOrderStaff === true) return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تمت الفوترة / مخفية بعد التصدير' };
    if (status === 'deleted_by_orders_staff' || status === 'deleted_by_market_manager') return { ownerKey: 'none', owner: 'لا يوجد', detail: 'الطلبية محذوفة من مسار العمل' };
    return { ownerKey: '', owner: '-', detail: statusLabel(status) };
}

function getPharmacyCode(order = {}) {
    return order.pharmacyCode || order.pharmacy_code || order.customerCode || '';
}

function getItemProductCode(item = {}) {
    if (item.productCode || item.product_code || item.code) return item.productCode || item.product_code || item.code;
    const product = state.productsByName.get(item.name || '');
    return product?.productCode || product?.product_code || product?.code || '';
}

function productCatalog() {
    return Array.from(state.productsByName.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
}

function getProductByName(name = '') {
    return state.productsByName.get(String(name || '').trim()) || null;
}

function getProductPrice(product = {}, fallback = 0) {
    return parseNumber(product.price ?? product.unitPrice ?? product.value ?? fallback);
}

function productOptionsHtml(selectedName = '') {
    const products = productCatalog();
    const selected = String(selectedName || '').trim();
    const hasSelected = selected && products.some(product => String(product.name || '').trim() === selected);
    const options = products.map(product => {
        const name = String(product.name || '').trim();
        const selectedAttr = name === selected ? ' selected' : '';
        return `<option value="${escapeHtml(name)}"${selectedAttr}>${escapeHtml(name)}</option>`;
    }).join('');
    const manualOption = selected && !hasSelected ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>` : '';
    return `<option value="">اختر الصنف</option>${manualOption}${options}`;
}

function itemCountLabel(order = {}) {
    const count = Array.isArray(order.items) ? order.items.length : 0;
    if (!count) return '0';
    return `${count} صنف`;
}

function buildOrderSummaryRowActions(kind = 'staff') {
    if (kind === 'market') {
        return `<select class="workflow-action-select market-row-action-select" aria-label="اتخاذ إجراء">
                    <option value="">اتخاذ إجراء</option>
                    <option value="view">عرض وتعديل</option>
                    <option value="approve">اعتماد وتحويل للمالية</option>
                    <option value="reject">رفض الطلبية</option>
                    <option value="return_rep">إرجاع للمندوب</option>
                    <option value="return_supervisor">إرجاع للمشرف</option>
                    <option value="delete">حذف الطلبية</option>
                </select>`;
    }
    return `<button class="action-btn staff-edit-btn" type="button" title="عرض وتعديل"><i class="ph ph-eye"></i> عرض</button>
            <button class="action-btn staff-return-btn" type="button"><i class="ph ph-arrow-u-down-left"></i> إرجاع</button>
            <button class="action-btn danger-btn staff-delete-btn" type="button"><i class="ph ph-trash"></i> حذف</button>`;
}

function getBonusPct(item = {}) {
    const qty = parseNumber(item.qty);
    const bonus = parseNumber(item.bonus);
    if (item.bonusPct !== undefined && item.bonusPct !== '') return parseNumber(item.bonusPct);
    return qty > 0 && bonus > 0 ? (bonus / qty) * 100 : 0;
}

function calculateItem(item = {}) {
    const qty = Math.max(0, parseNumber(item.qty));
    const bonus = Math.max(0, parseNumber(item.bonus));
    const price = Math.max(0, parseNumber(item.price));
    const total = qty * price;
    return {
        ...item,
        productCode: getItemProductCode(item),
        qty,
        bonus,
        bonusPct: qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0,
        price,
        total: Number(total.toFixed(3))
    };
}

function calculateGrandTotal(items = []) {
    return Number(items.reduce((sum, item) => sum + parseNumber(item.total), 0).toFixed(3));
}

function inDateRange(order, from, to) {
    const date = normalizeDate(order.createdAt || order.updatedAt);
    if (!date) return true;
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (from) {
        const f = new Date(from);
        f.setHours(0, 0, 0, 0);
        if (d < f) return false;
    }
    if (to) {
        const t = new Date(to);
        t.setHours(0, 0, 0, 0);
        if (d > t) return false;
    }
    return true;
}

function setDefaultDateFilters() {
    const from = $('filterDateFrom');
    const to = $('filterDateTo');
    const today = toDateInputValue(new Date());
    if (WORKFLOW_PAGE === 'orders-staff') {
        if (from) from.value = today;
        if (to) to.value = today;
        return;
    }
    if (from && !from.value) from.value = firstDayOfMonth();
    if (to && !to.value) to.value = today;
}

function selectedIds(selector = '.workflow-order-checkbox') {
    return Array.from(document.querySelectorAll(`${selector}:checked`)).map(cb => cb.value).filter(Boolean);
}

function auditEntry(action, user, role, oldValue = null, newValue = null, notes = '') {
    return {
        action,
        user: user || 'Workflow Page',
        role,
        timestamp: new Date().toISOString(),
        oldValue,
        newValue,
        orderId: state.selectedOrder?.id || '',
        notes: notes || ''
    };
}

async function updateOrderWithAudit(orderId, updates, entry) {
    const ref = doc(db, 'orders', orderId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error('Order not found');
    const current = snap.data();
    const trail = Array.isArray(current.auditTrail) ? current.auditTrail : [];
    const localUpdates = {
        ...updates,
        previousStatus: current.status || '',
        changedBy: entry.user,
        changedByRole: entry.role,
        changedAt: new Date(),
        actionType: entry.action,
        auditTrail: [...trail, { ...entry, previousStatus: current.status || '', orderId }],
        updatedAt: new Date()
    };
    await updateDoc(ref, localUpdates);
    const index = state.orders.findIndex(order => order.id === orderId);
    if (index >= 0) state.orders[index] = { ...state.orders[index], ...localUpdates };
    if (state.selectedOrder?.id === orderId) state.selectedOrder = { ...state.selectedOrder, ...localUpdates };
    writeCache(state.allOrdersLoaded ? ALL_ORDERS_CACHE_KEY : PAGE_CACHE_KEY, state.orders);
    if (!state.suspendRender) state.onOrdersChange?.();
}

async function loadProducts() {
    try {
        const cached = readProductsCache();
        if (cached) {
            cached.forEach(data => { if (data.name) state.productsByName.set(data.name, data); });
        }
    } catch (_) {}

    setTimeout(async () => {
        try {
            const snap = await getDocs(collection(db, 'products'));
            const products = [];
            snap.forEach(d => {
                const data = { id: d.id, ...d.data() };
                products.push(data);
                if (data.name) state.productsByName.set(data.name, data);
            });
            writeProductsCache(products);
            state.onOrdersChange?.();
        } catch (error) {
            console.warn('Products could not be loaded', error);
        }
    }, 0);
}

async function refreshOrdersFromFirebase(source = currentPageOrderSource(), cacheKey = PAGE_CACHE_KEY, markAllLoaded = false) {
    const startedAt = Date.now();
    const loadToken = ++state.loadToken;
    try {
        const snap = await getDocs(source);
        if (loadToken !== state.loadToken && !markAllLoaded) return state.orders;
        const fresh = [];
        snap.forEach(d => fresh.push({ id: d.id, ...d.data() }));
        state.orders = sortOrders(fresh);
        state.lastRefreshAt = Date.now();
        if (markAllLoaded) state.allOrdersLoaded = true;
        writeCache(cacheKey, state.orders);
        showDataModeNotice(`آخر تحديث: ${new Date().toLocaleTimeString('en-GB')}`);
        state.onOrdersChange?.();
        return state.orders;
    } catch (error) {
        console.error('Workflow orders load failed', error);
        showToast('فشل تحميل الطلبيات من Firebase. تم عرض آخر نسخة مخزنة إن وجدت.', 'error');
        return state.orders;
    } finally {
        console.debug(`workflow load ${WORKFLOW_PAGE}: ${Date.now() - startedAt}ms`);
    }
}

async function refreshAllOrdersForStaffPaginated() {
    const ordersRef = collection(db, 'orders');
    const pageSize = 250;
    const maxPages = 80;
    const loadToken = ++state.loadToken;
    let lastDoc = null;
    let allOrders = [];

    try {
        for (let page = 0; page < maxPages; page++) {
            const pageQuery = lastDoc
                ? query(ordersRef, orderBy(documentId()), startAfter(lastDoc), limit(pageSize))
                : query(ordersRef, orderBy(documentId()), limit(pageSize));
            const snap = await getDocs(pageQuery);
            if (loadToken !== state.loadToken) return state.orders;
            if (snap.empty) break;

            snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
            lastDoc = snap.docs[snap.docs.length - 1];
            state.orders = sortOrders(allOrders);
            state.allOrdersLoaded = true;
            showDataModeNotice(`تم تحميل ${state.orders.length} طلبية من التخزين/Firebase...`);
            if (page === 0 || allOrders.length % 1000 === 0 || snap.size < pageSize) state.onOrdersChange?.();
            await nextFrame();

            if (snap.size < pageSize) break;
        }
        state.allOrdersLoaded = true;
        writeCache(ALL_ORDERS_CACHE_KEY, state.orders);
        showDataModeNotice(`آخر تحديث للكل: ${new Date().toLocaleTimeString('en-GB')} — ${state.orders.length} طلبية`);
        return state.orders;
    } catch (error) {
        console.error('Paginated all orders load failed', error);
        showToast('فشل تحميل كل الطلبيات. تم إبقاء آخر بيانات ظاهرة بدون تعليق الصفحة.', 'error');
        return state.orders;
    }
}

function subscribeOrders(onChange) {
    state.onOrdersChange = onChange;
    const cached = readCache(PAGE_CACHE_KEY);
    if (cached) {
        state.orders = sortOrders(cached);
        showDataModeNotice('تم عرض نسخة مخزنة محليًا، ويتم تحديثها الآن من Firebase.');
        onChange();
    } else {
        const target = WORKFLOW_PAGE === 'market-manager' ? ['marketOrdersBody', 9] : WORKFLOW_PAGE === 'finance-controller' ? ['financeOrdersBody', 8] : ['ordersStaffBody', 12];
        setLoadingRow(target[0], target[1]);
    }
    refreshOrdersFromFirebase();
}

async function ensureOrdersStaffAllLoaded() {
    if (WORKFLOW_PAGE !== 'orders-staff' || state.allOrdersLoaded || state.allOrdersLoading) return;
    const cached = readCache(ALL_ORDERS_CACHE_KEY);
    if (cached && cached.length) {
        state.loadToken++;
        state.orders = sortOrders(cached);
        state.allOrdersLoaded = true;
        showDataModeNotice('تم عرض نسخة محلية للكل، ويتم تحديثها من Firebase بدون تعليق الصفحة.');
        state.onOrdersChange?.();
        state.allOrdersLoading = true;
        refreshAllOrdersForStaffPaginated().finally(() => { state.allOrdersLoading = false; });
        return;
    }
    state.allOrdersLoading = true;
    setLoadingRow('ordersStaffBody', 19, 'جاري تحميل كل الطلبيات من التخزين المحلي/Firebase...');
    try {
        await refreshAllOrdersForStaffPaginated();
    } finally {
        state.allOrdersLoading = false;
    }
}

function buildItemsPreview(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) return '-';
    return items.slice(0, 3).map(item => `${escapeHtml(item.name || '-')}: ${parseNumber(item.qty)}`).join('<br>') + (items.length > 3 ? `<br><small>+${items.length - 3} أصناف أخرى</small>` : '');
}

function updateStats(orders) {
    if ($('ordersCount')) $('ordersCount').textContent = orders.length;
    if ($('ordersValue')) $('ordersValue').textContent = `${formatMoney(orders.reduce((sum, order) => sum + parseNumber(order.grandTotal), 0))} د.ا`;
}

function setTableEmpty(tbodyId, colspan, message) {
    const body = $(tbodyId);
    if (body) body.innerHTML = `<tr><td colspan="${colspan}"><div class="empty-state"><i class="ph ph-package"></i><h3>${escapeHtml(message)}</h3></div></td></tr>`;
}

function bindCommonFilters(applyFn) {
    const debouncedApply = debounce(applyFn, 180);
    ['filterDateFrom', 'filterDateTo', 'filterPharmacy', 'filterRepresentative', 'filterProduct', 'filterStatus', 'showHiddenMode', 'filterRequiredOwner'].forEach(id => {
        $(id)?.addEventListener('input', debouncedApply);
        $(id)?.addEventListener('change', debouncedApply);
    });
}

function confirmReason(message, requireReason = false) {
    const reason = prompt(message, '');
    if (reason === null) return null;
    if (requireReason && !reason.trim()) {
        showToast('سبب الرفض مطلوب.', 'warning');
        return null;
    }
    return reason.trim();
}
function confirmRequiredNote(message) {
    const note = prompt(message, '');
    if (note === null) return null;
    if (!note.trim()) {
        showToast('الملاحظة إجبارية لإرجاع الطلبية خطوة للوراء.', 'warning');
        return null;
    }
    return note.trim();
}

function returnTargetPayload(target, actor, role, reason) {
    const base = {
        returnReason: reason,
        returnTarget: target,
        returnedBy: actor,
        returnedByRole: role,
        returnedAt: new Date()
    };
    if (target === 'representative') return {
        ...base,
        status: 'returned_to_rep',
        workflowStage: 'representative',
        supervisorStatus: 'returned_to_rep'
    };
    if (target === 'supervisor') return {
        ...base,
        status: 'returned_to_supervisor',
        workflowStage: 'supervisor',
        supervisorStatus: 'returned_to_supervisor',
        marketManagerStatus: 'returned_to_supervisor'
    };
    if (target === 'market_manager') return {
        ...base,
        status: 'returned_to_market_manager',
        workflowStage: 'market_manager',
        marketManagerStatus: 'returned_to_market_manager',
        financeStatus: 'returned_to_market_manager'
    };
    if (target === 'finance') return {
        ...base,
        status: 'returned_to_finance',
        workflowStage: 'finance',
        financeStatus: 'returned_to_finance',
        orderStaffStatus: 'returned_to_finance'
    };
    return base;
}

async function returnOrderStep(orderId, target, reason, actor, role, action) {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    const updates = returnTargetPayload(target, actor, role, reason);
    await updateOrderWithAudit(orderId, updates, auditEntry(action, actor, role, { status: order.status || '', returnReason: order.returnReason || '' }, { status: updates.status, returnReason: reason }, reason));
    showToast('تم إرجاع الطلبية وتسجيل الملاحظة بنجاح.', 'success');
}


function buildWorkflowItemRow(item = {}, index = 0, prefix = 'mm') {
    const calc = calculateItem(item);
    return `
        <tr data-index="${index}">
            <td>${index + 1}</td>
            <td class="${prefix}-code-cell" data-original-code="${escapeHtml(getItemProductCode(calc) || '')}">${escapeHtml(getItemProductCode(calc) || '-')}</td>
            <td class="item-name-cell">
                <select class="${prefix}-product workflow-product-select">
                    ${productOptionsHtml(calc.name || '')}
                </select>
            </td>
            <td><input class="${prefix}-qty" type="number" min="0" step="1" value="${calc.qty}"></td>
            <td><input class="${prefix}-bonus" type="number" min="0" step="1" value="${calc.bonus}"></td>
            <td><input class="${prefix}-bonus-pct" type="number" min="0" step="0.01" value="${calc.bonusPct}"></td>
            <td class="${prefix}-price" data-price="${calc.price}">${formatMoney(calc.price)}</td>
            <td class="${prefix}-subtotal">${formatMoney(calc.total)}</td>
            <td><input class="${prefix}-note workflow-item-note-input" type="text" value="${escapeHtml(calc.note || '')}" placeholder="ملاحظة الصنف"></td>
            <td><button class="action-btn ${prefix === 'mm' ? 'workflow-delete-item' : 'staff-delete-item'}" type="button" title="حذف الصنف"><i class="ph ph-trash"></i></button></td>
        </tr>
    `;
}

function fullOrderRows(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item, index) => buildWorkflowItemRow(item, index, 'mm')).join('');
}

function updateMarketRowProduct(row) {
    const select = row.querySelector('.mm-product');
    const selectedName = select?.value || '';
    const product = getProductByName(selectedName);
    const codeCell = row.querySelector('.mm-code-cell');
    const fallbackCode = codeCell?.dataset.originalCode || (codeCell?.textContent === '-' ? '' : codeCell?.textContent) || '';
    const code = product?.productCode || product?.product_code || product?.code || fallbackCode;
    const price = getProductPrice(product, parseNumber(row.querySelector('.mm-price')?.dataset.price));
    const priceCell = row.querySelector('.mm-price');
    if (codeCell) codeCell.textContent = code || '-';
    if (priceCell) {
        priceCell.dataset.price = String(price);
        priceCell.textContent = formatMoney(price);
    }
}

function recalcMarketRow(row, source = '') {
    updateMarketRowProduct(row);
    const qtyInput = row.querySelector('.mm-qty');
    const bonusInput = row.querySelector('.mm-bonus');
    const pctInput = row.querySelector('.mm-bonus-pct');
    const price = parseNumber(row.querySelector('.mm-price')?.dataset.price);
    let qty = Math.max(0, parseNumber(qtyInput?.value));
    let bonus = Math.max(0, parseNumber(bonusInput?.value));
    let pct = Math.max(0, parseNumber(pctInput?.value));

    if (source === 'pct') {
        bonus = qty > 0 ? Math.round((qty * pct) / 100) : 0;
        if (bonusInput) bonusInput.value = bonus;
    } else {
        pct = qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0;
        if (pctInput) pctInput.value = pct;
    }

    if (qtyInput) qtyInput.value = qty;
    const subtotal = qty * price;
    row.querySelector('.mm-subtotal').textContent = formatMoney(subtotal);
    updateMarketModalTotal();
}

function updateMarketModalTotal() {
    let total = 0;
    document.querySelectorAll('#marketOrderItemsBody tr').forEach(row => {
        if (row.dataset.deleted !== '1') total += parseNumber(row.querySelector('.mm-subtotal')?.textContent);
    });
    if ($('marketModalGrandTotal')) $('marketModalGrandTotal').textContent = `${formatMoney(total)} د.ا`;
}

function bindMarketItemRow(row) {
    row.querySelector('.mm-product')?.addEventListener('change', () => recalcMarketRow(row, 'product'));
    row.querySelector('.mm-qty')?.addEventListener('input', () => recalcMarketRow(row, 'qty'));
    row.querySelector('.mm-bonus')?.addEventListener('input', () => recalcMarketRow(row, 'bonus'));
    row.querySelector('.mm-bonus-pct')?.addEventListener('input', () => recalcMarketRow(row, 'pct'));
    row.querySelector('.workflow-delete-item')?.addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من حذف هذا الصنف من الطلبية؟ سيتم تسجيل العملية في سجل التدقيق.')) return;
        row.dataset.deleted = '1';
        row.style.display = 'none';
        updateMarketModalTotal();
    });
    recalcMarketRow(row);
}

function addMarketItemRow(item = {}) {
    const body = $('marketOrderItemsBody');
    if (!body) return;
    const empty = body.querySelector('td[colspan]')?.closest('tr');
    if (empty) empty.remove();
    const index = body.querySelectorAll('tr').length;
    body.insertAdjacentHTML('beforeend', buildWorkflowItemRow({ qty: 1, bonus: 0, ...item }, index, 'mm'));
    bindMarketItemRow(body.lastElementChild);
    updateMarketModalTotal();
}

function openMarketOrderModal(order) {
    state.selectedOrder = order;
    $('marketModalTitle').textContent = `طلبية ${order.id.substring(0, 8).toUpperCase()}`;
    $('marketModalMeta').innerHTML = `
        <span><b>التاريخ:</b> ${escapeHtml(formatDateTime(order.createdAt))}</span>
        <span><b>المندوب:</b> ${escapeHtml(order.repName || '-')}</span>
        <span><b>الصيدلية:</b> ${escapeHtml(order.pharmacyName || '-')}</span>
        <span><b>كود الصيدلية:</b> ${escapeHtml(getPharmacyCode(order) || '-')}</span>
    `;
    $('marketOrderNote').textContent = getOrderNote(order) || 'لا توجد ملاحظات.';
    $('marketOrderItemsBody').innerHTML = fullOrderRows(order) || `<tr><td colspan="10">لا توجد أصناف.</td></tr>`;
    document.querySelectorAll('#marketOrderItemsBody tr').forEach(bindMarketItemRow);
    if ($('marketModalActionSelect')) $('marketModalActionSelect').value = '';
    $('marketOrderModal').style.display = 'flex';
}

function closeMarketOrderModal() {
    if ($('marketOrderModal')) $('marketOrderModal').style.display = 'none';
    if ($('marketModalActionSelect')) $('marketModalActionSelect').value = '';
    state.selectedOrder = null;
}

function collectMarketModalItems() {
    const originalItems = Array.isArray(state.selectedOrder?.items) ? state.selectedOrder.items : [];
    const kept = [];
    const deleted = [];
    document.querySelectorAll('#marketOrderItemsBody tr').forEach(row => {
        const index = Number(row.dataset.index);
        const original = originalItems[index] || {};
        if (row.dataset.deleted === '1') {
            deleted.push({ index, item: original });
            return;
        }
        const qty = Math.max(0, parseNumber(row.querySelector('.mm-qty')?.value));
        const bonus = Math.max(0, parseNumber(row.querySelector('.mm-bonus')?.value));
        const price = parseNumber(row.querySelector('.mm-price')?.dataset.price);
        const productName = row.querySelector('.mm-product')?.value || original.name || '';
        const product = getProductByName(productName);
        const productCode = product?.productCode || product?.product_code || product?.code || row.querySelector('.mm-code-cell')?.textContent || getItemProductCode(original);
        kept.push(calculateItem({
            ...original,
            name: productName,
            qty,
            bonus,
            bonusPct: qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0,
            price,
            total: qty * price,
            note: row.querySelector('.mm-note')?.value || '',
            productCode,
            product_code: productCode,
            code: productCode
        }));
    });
    return { kept, deleted, grandTotal: calculateGrandTotal(kept) };
}

async function saveMarketEdits(options = {}) {
    const { close = true, silent = false } = options;
    if (!state.selectedOrder) return false;
    const { kept, deleted, grandTotal } = collectMarketModalItems();
    if (kept.length === 0) { showToast('لا يمكن حفظ طلبية بدون أصناف.', 'warning'); return false; }
    const oldValue = {
        items: state.selectedOrder.items || [],
        grandTotal: state.selectedOrder.grandTotal || 0
    };
    await updateOrderWithAudit(state.selectedOrder.id, {
        items: kept,
        grandTotal,
        marketManagerEditedAt: new Date(),
        marketManagerEditedBy: 'Market Manager',
        marketManagerDeletedItems: deleted
    }, auditEntry('market_manager_edit', 'Market Manager', 'market_manager', oldValue, { items: kept, grandTotal }, deleted.length ? `Deleted items: ${deleted.length}` : ''));
    if (!silent) showToast('تم حفظ تعديلات مدير السوق.', 'success');
    if (close) closeMarketOrderModal();
    return true;
}


async function approveSelectedMarketOrderFromModal() {
    if (!state.selectedOrder) return;
    if (!confirm('سيتم حفظ أي تعديلات حالية ثم اعتماد الطلبية وتحويلها إلى المالية. هل تريد المتابعة؟')) return;
    const orderId = state.selectedOrder.id;
    const saved = await saveMarketEdits({ close: false, silent: true });
    if (saved) await marketApprove(orderId);
}

async function marketApprove(orderId, options = {}) {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'finance_pending',
        workflowStage: 'finance',
        marketManagerStatus: 'market_manager_approved',
        marketManagerApprovedBy: 'Market Manager',
        marketManagerApprovedAt: new Date(),
        financeStatus: 'finance_pending'
    }, auditEntry('market_manager_approved', 'Market Manager', 'market_manager', { status: order.status }, { status: 'finance_pending' }));
    if (!options.silent) showToast('تم اعتماد الطلبية وتحويلها إلى المالية.', 'success');
    if (!options.keepModalOpen) closeMarketOrderModal();
}

async function marketReject(orderId, reason = '', options = {}) {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'market_manager_rejected',
        workflowStage: 'market_manager',
        marketManagerStatus: 'market_manager_rejected',
        marketManagerRejectedBy: 'Market Manager',
        marketManagerRejectedAt: new Date(),
        marketManagerRejectionReason: reason
    }, auditEntry('market_manager_rejected', 'Market Manager', 'market_manager', { status: order.status }, { status: 'market_manager_rejected' }, reason));
    if (!options.silent) showToast('تم رفض الطلبية من مدير السوق.', 'success');
    if (!options.keepModalOpen) closeMarketOrderModal();
}

async function marketDeleteOrder(orderId) {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'deleted_by_market_manager',
        workflowStage: 'deleted',
        deletedByMarketManager: 'Market Manager',
        deletedAt: new Date(),
        marketManagerStatus: 'deleted_by_market_manager'
    }, auditEntry('market_manager_order_deleted', 'Market Manager', 'market_manager', { status: order.status, items: order.items || [] }, { status: 'deleted_by_market_manager' }, 'Soft delete only'));
    showToast('تم حذف الطلبية كحذف ناعم مع حفظ سجل التدقيق.', 'success');
    closeMarketOrderModal();
}

function applyMarketFilters() {
    const rep = ($('filterRepresentative')?.value || '').toLowerCase().trim();
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const status = $('filterStatus')?.value || '';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';
    state.visibleOrders = state.orders.filter(order => {
        const orderStatus = order.status || '';
        const eligible = ['market_manager_pending', 'supervisor_approved', 'returned_to_market_manager'].includes(orderStatus);
        const statusMatch = status ? orderStatus === status : eligible;
        return statusMatch &&
            inDateRange(order, from, to) &&
            (!rep || (order.repName || '').toLowerCase().includes(rep)) &&
            (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm));
    });
    renderMarketOrders();
}

function handleMarketAction(order, action) {
    if (!order || !action) return;
    if (action === 'view') {
        openMarketOrderModal(order);
        return;
    }
    if (action === 'approve') {
        if (confirm('اعتماد الطلبية وتحويلها إلى المالية؟')) marketApprove(order.id);
        return;
    }
    if (action === 'reject') {
        const reason = confirmReason('سبب رفض مدير السوق:', true);
        if (reason !== null) marketReject(order.id, reason);
        return;
    }
    if (action === 'return_rep') {
        const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمندوب:');
        if (reason !== null) returnOrderStep(order.id, 'representative', reason, 'Market Manager', 'market_manager', 'market_manager_returned_to_rep');
        return;
    }
    if (action === 'return_supervisor') {
        const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمشرف:');
        if (reason !== null) returnOrderStep(order.id, 'supervisor', reason, 'Market Manager', 'market_manager', 'market_manager_returned_to_supervisor');
        return;
    }
    if (action === 'delete') {
        if (confirm('تحذير: سيتم حذف الطلبية من مسار العمل كحذف ناعم ولن تظهر للمراحل التالية. هل تريد المتابعة؟')) marketDeleteOrder(order.id);
    }
}

function handleMarketModalAction(action) {
    if (!state.selectedOrder || !action) return;
    if (action === 'approve') {
        approveSelectedMarketOrderFromModal();
        return;
    }
    if (action === 'reject') {
        const reason = confirmReason('سبب رفض مدير السوق:', true);
        if (reason !== null) marketReject(state.selectedOrder.id, reason);
        return;
    }
    if (action === 'return_rep') {
        const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمندوب:');
        if (reason !== null) returnOrderStep(state.selectedOrder.id, 'representative', reason, 'Market Manager', 'market_manager', 'market_manager_returned_to_rep').then(closeMarketOrderModal);
        return;
    }
    if (action === 'return_supervisor') {
        const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمشرف:');
        if (reason !== null) returnOrderStep(state.selectedOrder.id, 'supervisor', reason, 'Market Manager', 'market_manager', 'market_manager_returned_to_supervisor').then(closeMarketOrderModal);
        return;
    }
    if (action === 'delete') {
        if (confirm('تحذير: هل تريد حذف الطلبية بالكامل من مسار العمل؟')) marketDeleteOrder(state.selectedOrder.id);
    }
}

function renderMarketOrders() {
    const body = $('marketOrdersBody');
    if (!body) return;
    const token = ++state.renderToken;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('marketOrdersBody', 9, 'لا توجد طلبيات بانتظار مدير السوق');

    const renderChunk = async (startIndex = 0) => {
        if (token !== state.renderToken) return;
        const fragment = document.createDocumentFragment();
        const chunk = state.visibleOrders.slice(startIndex, startIndex + 50);
        chunk.forEach(order => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input class="workflow-order-checkbox" type="checkbox" value="${order.id}"></td>
                <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
                <td>${escapeHtml(order.repName || '-')}</td>
                <td class="staff-pharmacy-cell" title="${escapeHtml(order.pharmacyName || '-')}">${escapeHtml(order.pharmacyName || '-')}</td>
                <td><button class="action-btn view-btn" type="button" title="عرض تفاصيل الأصناف"><i class="ph ph-eye"></i> ${escapeHtml(itemCountLabel(order))}</button></td>
                <td>${formatMoney(order.grandTotal)} د.ا</td>
                <td><span class="status-badge ${escapeHtml(order.status || '')}">${escapeHtml(statusLabel(order.status))}</span></td>
                <td class="workflow-note-cell" title="${escapeHtml(getOrderNote(order) || '-')}">${escapeHtml(getOrderNote(order) || '-')}</td>
                <td class="workflow-actions-cell">${buildOrderSummaryRowActions('market')}</td>
            `;
            tr.querySelector('.view-btn')?.addEventListener('click', () => openMarketOrderModal(order));
            tr.querySelector('.market-row-action-select')?.addEventListener('change', event => {
                const action = event.target.value;
                event.target.value = '';
                handleMarketAction(order, action);
            });
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
        if (startIndex + 50 < state.visibleOrders.length) {
            await nextFrame();
            renderChunk(startIndex + 50);
        }
    };
    renderChunk();
}

async function marketBulk(action) {
    const ids = selectedIds();
    if (ids.length === 0) return showToast('اختر طلبية واحدة على الأقل.', 'warning');
    if (action === 'approve') {
        if (!confirm(`اعتماد ${ids.length} طلبية وتحويلها إلى المالية؟`)) return;
        state.suspendRender = true;
        const results = await Promise.allSettled(ids.map(id => marketApprove(id, { silent: true, keepModalOpen: true })));
        state.suspendRender = false;
        state.onOrdersChange?.();
        showToast(`تم تنفيذ الاعتماد: ${results.filter(r => r.status === 'fulfilled').length}/${ids.length}`, 'success');
    }
    if (action === 'reject') {
        const reason = confirmReason(`سبب رفض ${ids.length} طلبية من مدير السوق:`, true);
        if (reason === null) return;
        state.suspendRender = true;
        const results = await Promise.allSettled(ids.map(id => marketReject(id, reason, { silent: true, keepModalOpen: true })));
        state.suspendRender = false;
        state.onOrdersChange?.();
        showToast(`تم تنفيذ الرفض: ${results.filter(r => r.status === 'fulfilled').length}/${ids.length}`, 'success');
    }
    $('selectAllWorkflow') && ($('selectAllWorkflow').checked = false);
}

function initMarketManager() {
    setDefaultDateFilters();
    bindCommonFilters(applyMarketFilters);
    $('selectAllWorkflow')?.addEventListener('change', e => document.querySelectorAll('.workflow-order-checkbox').forEach(cb => cb.checked = e.target.checked));
    $('bulkApproveBtn')?.addEventListener('click', () => marketBulk('approve'));
    $('bulkRejectBtn')?.addEventListener('click', () => marketBulk('reject'));
    $('closeMarketModalBtn')?.addEventListener('click', closeMarketOrderModal);
    $('marketOrderModal')?.addEventListener('click', event => {
        if (event.target?.id === 'marketOrderModal') closeMarketOrderModal();
    });
    $('addMarketItemBtn')?.addEventListener('click', () => addMarketItemRow());
    $('saveMarketEditsBtn')?.addEventListener('click', saveMarketEdits);
    $('marketModalActionSelect')?.addEventListener('change', event => {
        const action = event.target.value;
        event.target.value = '';
        handleMarketModalAction(action);
    });
    subscribeOrders(applyMarketFilters);
}

function orderToFinanceExportRow(order) {
    return {
        'التاريخ': formatDateTime(order.createdAt),
        'كود الصيدلية': getPharmacyCode(order),
        'اسم الصيدلية': order.pharmacyName || '',
        'المندوب': order.repName || order.representativeName || '',
        'ملاحظة الطلبية': getOrderNote(order),
        'قيمة الطلبية': parseNumber(order.grandTotal)
    };
}

function exportFinanceOrders(orders, scope = 'visible') {
    if (orders.length === 0) return showToast('لا توجد طلبيات للتصدير.', 'warning');
    if (typeof XLSX === 'undefined') return showToast('مكتبة Excel غير محملة. أعد فتح الصفحة وحاول مرة أخرى.', 'error');
    const rows = orders.map(orderToFinanceExportRow);
    if (rows.length === 0) return showToast('لا توجد طلبيات قابلة للتصدير.', 'warning');
    const headers = ['التاريخ', 'كود الصيدلية', 'اسم الصيدلية', 'المندوب', 'ملاحظة الطلبية', 'قيمة الطلبية'];
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    ws['!cols'] = [
        { wch: 20 },
        { wch: 15 },
        { wch: 28 },
        { wch: 22 },
        { wch: 42 },
        { wch: 15 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Finance Orders');
    XLSX.writeFile(wb, `finance_orders_${scope}_${toDateInputValue(new Date())}.xlsx`);
    showToast('تم تصدير ملف Excel المختصر بنجاح بدون تغيير حالة الطلبيات.', 'success');
}

function applyFinanceFilters() {
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const status = $('filterStatus')?.value || '';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';
    state.visibleOrders = state.orders.filter(order => {
        const financeState = order.financeStatus || (order.status === 'finance_pending' ? 'finance_pending' : '');
        const isFinancePending = order.status === 'finance_pending' || (order.marketManagerStatus === 'market_manager_approved' && financeState === 'finance_pending');
        const isFinanceRejected = order.status === 'finance_rejected' || financeState === 'finance_rejected';
        const isReturnedToFinance = order.status === 'returned_to_finance' || financeState === 'returned_to_finance';
        const statusMatch = status
            ? order.status === status || financeState === status
            : (isFinancePending || isFinanceRejected || isReturnedToFinance);
        return statusMatch && inDateRange(order, from, to) && (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm));
    });
    renderFinanceOrders();
}

function renderFinanceOrders() {
    const body = $('financeOrdersBody');
    if (!body) return;
    const token = ++state.renderToken;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('financeOrdersBody', 8, 'لا توجد طلبيات مالية بانتظار الاعتماد');

    const renderChunk = async (startIndex = 0) => {
        if (token !== state.renderToken) return;
        const fragment = document.createDocumentFragment();
        const chunk = state.visibleOrders.slice(startIndex, startIndex + 75);
        chunk.forEach(order => {
            const tr = document.createElement('tr');
            const isPending = order.status === 'finance_pending' || (order.financeStatus || '') === 'finance_pending';
            const isRejected = order.status === 'finance_rejected' || (order.financeStatus || '') === 'finance_rejected';
            const isReturnedToFinance = order.status === 'returned_to_finance' || (order.financeStatus || '') === 'returned_to_finance';
            const rejectionReason = order.financeRejectionReason || order.rejectionReason || '';
            const returnReason = order.returnReason || '';
            const actionHtml = isPending
                ? `<button class="action-btn approve-btn" type="button"><i class="ph ph-check-circle"></i> اعتماد</button><button class="action-btn reject-btn" type="button"><i class="ph ph-x-circle"></i> رفض</button><button class="action-btn return-market-btn" type="button"><i class="ph ph-arrow-u-down-left"></i> إرجاع لمدير السوق</button>`
                : isRejected
                    ? `<span class="status-badge finance_rejected">مرفوض مالياً</span><small class="workflow-reason">${escapeHtml(rejectionReason || 'لا يوجد سبب مسجل')}</small><button class="action-btn approve-btn" type="button"><i class="ph ph-arrow-counter-clockwise"></i> تعديل القرار: اعتماد</button><button class="action-btn reject-btn" type="button"><i class="ph ph-pencil-simple"></i> تعديل سبب الرفض</button><button class="action-btn return-market-btn" type="button"><i class="ph ph-arrow-u-down-left"></i> إرجاع لمدير السوق</button>`
                    : isReturnedToFinance
                        ? `<span class="status-badge returned_to_finance">مرجعة للمالية</span><small class="workflow-reason">${escapeHtml(returnReason || 'لا توجد ملاحظة مسجلة')}</small><button class="action-btn approve-btn" type="button"><i class="ph ph-check-circle"></i> اعتماد</button><button class="action-btn reject-btn" type="button"><i class="ph ph-x-circle"></i> رفض</button><button class="action-btn return-market-btn" type="button"><i class="ph ph-arrow-u-down-left"></i> إرجاع لمدير السوق</button>`
                        : `<span class="status-badge ${order.status}">${statusLabel(order.status)}</span>`;
            tr.innerHTML = `
                <td><input class="workflow-order-checkbox" type="checkbox" value="${order.id}"></td>
                <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
                <td>${escapeHtml(getPharmacyCode(order) || '-')}</td>
                <td>${escapeHtml(order.pharmacyName || '-')}</td>
                <td>${escapeHtml(order.repName || order.representativeName || '-')}</td>
                <td class="workflow-note-cell">${escapeHtml(getOrderNote(order) || '-')}</td>
                <td>${formatMoney(order.grandTotal)} د.ا</td>
                <td class="workflow-actions-cell">${actionHtml}</td>
            `;
            tr.querySelector('.approve-btn')?.addEventListener('click', () => confirm('اعتماد الطلبية مالياً وتحويلها إلى فريق المعالجة؟') && financeApprove(order.id));
            tr.querySelector('.reject-btn')?.addEventListener('click', () => {
                const reason = confirmReason(isRejected ? 'تعديل سبب الرفض المالي:' : 'سبب الرفض المالي:', true);
                if (reason !== null) financeReject(order.id, reason);
            });
            tr.querySelector('.return-market-btn')?.addEventListener('click', () => {
                const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع لمدير السوق:');
                if (reason !== null) returnOrderStep(order.id, 'market_manager', reason, 'Hamza', 'finance_controller', 'finance_returned_to_market_manager');
            });
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
        if (startIndex + 75 < state.visibleOrders.length) {
            await nextFrame();
            renderChunk(startIndex + 75);
        }
    };
    renderChunk();
}

async function financeApprove(orderId) {
    const order = state.orders.find(o => o.id === orderId) || {};
    await updateOrderWithAudit(orderId, {
        status: 'orders_staff_pending',
        workflowStage: 'orders_staff',
        financeStatus: 'finance_approved',
        financeApprovedBy: 'Hamza',
        financeApprovedAt: new Date(),
        orderStaffStatus: 'orders_staff_pending',
        hiddenByOrderStaff: false
    }, auditEntry('finance_approved', 'Hamza', 'finance_controller', { status: order.status }, { status: 'orders_staff_pending' }));
    showToast('تم الاعتماد المالي وتحويل الطلبية إلى فريق المعالجة.', 'success');
}

async function financeReject(orderId, reason = '') {
    const order = state.orders.find(o => o.id === orderId) || {};
    await updateOrderWithAudit(orderId, {
        status: 'finance_rejected',
        workflowStage: 'finance',
        financeStatus: 'finance_rejected',
        financeRejectedBy: 'Hamza',
        financeRejectedAt: new Date(),
        financeRejectionReason: reason
    }, auditEntry('finance_rejected', 'Hamza', 'finance_controller', { status: order.status }, { status: 'finance_rejected' }, reason));
    showToast('تم رفض الطلبية مالياً.', 'success');
}

function initFinanceController() {
    setDefaultDateFilters();
    bindCommonFilters(applyFinanceFilters);
    $('selectAllWorkflow')?.addEventListener('change', e => document.querySelectorAll('.workflow-order-checkbox').forEach(cb => cb.checked = e.target.checked));
    $('financeExportSelectedBtn')?.addEventListener('click', () => exportFinanceOrders(getOrdersByIds(selectedIds()), 'selected'));
    $('financeExportVisibleBtn')?.addEventListener('click', () => exportFinanceOrders(state.visibleOrders, 'visible'));
    subscribeOrders(applyFinanceFilters);
}

function orderToExportRows(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map(item => {
        const calc = calculateItem(item);
        return {
            'Order ID': order.id,
            'Order Date': formatDateTime(order.createdAt),
            'Pharmacy Code': getPharmacyCode(order),
            'Pharmacy Name': order.pharmacyName || '',
            'Representative Name': order.repName || '',
            'Product Code': getItemProductCode(calc),
            'Product Name': calc.name || '',
            'Quantity': calc.qty,
            'Bonus Quantity': calc.bonus,
            'Bonus Percentage': calc.bonusPct,
            'Price': calc.price,
            'Subtotal': calc.total,
            'Grand Total': parseNumber(order.grandTotal),
            'Item Note': calc.note || '',
            'Order Note': getOrderNote(order),
            'Return Note': order.returnReason || '',
            'Status': statusLabel(getPrimaryStatus(order)),
            'Workflow Stage': order.workflowStage || '',
            'Required Owner': getWorkflowFollowUp(order).owner,
            'Follow Up Detail': getWorkflowFollowUp(order).detail,
            'Supervisor Status': statusLabel(order.supervisorStatus),
            'Market Manager Status': statusLabel(order.marketManagerStatus),
            'Finance Status': statusLabel(order.financeStatus),
            'Order Staff Status': statusLabel(order.orderStaffStatus)
        };
    });
}

function applyOrdersStaffFilters() {
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const rep = ($('filterRepresentative')?.value || '').toLowerCase().trim();
    const product = ($('filterProduct')?.value || '').toLowerCase().trim();
    const statusMode = $('showHiddenMode')?.value || 'active';
    const requiredOwner = $('filterRequiredOwner')?.value || '';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';

    if ((statusMode === 'all' || statusMode === 'followup') && !state.allOrdersLoaded) {
        ensureOrdersStaffAllLoaded();
        return;
    }

    state.visibleOrders = state.orders.filter(order => {
        const status = getPrimaryStatus(order);
        const followUp = getWorkflowFollowUp(order);
        const isHidden = status === 'orders_staff_hidden' || order.hiddenByOrderStaff === true;
        const isActive = (status === 'orders_staff_pending' || status === 'finance_approved' || (order.financeStatus === 'finance_approved' && !status)) && !isHidden;
        const isExported = status === 'orders_staff_exported' || order.orderStaffStatus === 'orders_staff_exported' || order.exportedAt;
        let modeOk = isActive;
        if (statusMode === 'followup') modeOk = true;
        if (statusMode === 'hidden') modeOk = isHidden;
        if (statusMode === 'exported') modeOk = isExported && !isHidden;
        if (statusMode === 'all') modeOk = true;
        const itemMatch = !product || (Array.isArray(order.items) && order.items.some(item => `${item.name || ''} ${getItemProductCode(item)}`.toLowerCase().includes(product)));
        return modeOk && itemMatch && inDateRange(order, from, to) &&
            (!requiredOwner || followUp.ownerKey === requiredOwner) &&
            (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm)) &&
            (!rep || (order.repName || order.representativeName || '').toLowerCase().includes(rep));
    });
    renderOrdersStaffRows();
}

function renderOrdersStaffRows() {
    const body = $('ordersStaffBody');
    if (!body) return;
    const token = ++state.renderToken;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('ordersStaffBody', 12, 'لا توجد طلبيات ضمن الفلاتر الحالية');

    const renderChunk = async (startIndex = 0) => {
        if (token !== state.renderToken) return;
        const fragment = document.createDocumentFragment();
        const chunk = state.visibleOrders.slice(startIndex, startIndex + 50);
        chunk.forEach(order => {
            const followUp = getWorkflowFollowUp(order);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><input class="workflow-order-checkbox" type="checkbox" value="${order.id}"></td>
                <td class="staff-date-cell">${escapeHtml(formatDateTime(order.createdAt))}</td>
                <td class="staff-pharmacy-cell" title="${escapeHtml(order.pharmacyName || '-')}">${escapeHtml(order.pharmacyName || '-')}</td>
                <td class="staff-rep-cell" title="${escapeHtml(order.repName || order.representativeName || '-')}">${escapeHtml(order.repName || order.representativeName || '-')}</td>
                <td><span class="status-badge ${escapeHtml(getPrimaryStatus(order))}">${escapeHtml(statusLabel(getPrimaryStatus(order)))}</span></td>
                <td>${escapeHtml(followUp.owner || '-')}</td>
                <td class="workflow-note-cell" title="${escapeHtml(followUp.detail || '-')}">${escapeHtml(followUp.detail || '-')}</td>
                <td><button class="action-btn staff-edit-btn" type="button" title="عرض تفاصيل الأصناف"><i class="ph ph-eye"></i> ${escapeHtml(itemCountLabel(order))}</button></td>
                <td>${formatMoney(order.grandTotal)} د.ا</td>
                <td class="workflow-note-cell" title="${escapeHtml(getOrderNote(order) || '-')}">${escapeHtml(getOrderNote(order) || '-')}</td>
                <td class="workflow-note-cell" title="${escapeHtml(order.returnReason || '-')}">${escapeHtml(order.returnReason || '-')}</td>
                <td class="workflow-actions-cell">
                    <button class="action-btn staff-return-btn" type="button"><i class="ph ph-arrow-u-down-left"></i> إرجاع</button>
                    <button class="action-btn danger-btn staff-delete-btn" type="button"><i class="ph ph-trash"></i> حذف</button>
                </td>
            `;
            tr.querySelectorAll('.staff-edit-btn').forEach(btn => btn.addEventListener('click', () => openStaffOrderModal(order)));
            tr.querySelector('.staff-return-btn')?.addEventListener('click', () => {
                const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمالية:');
                if (reason !== null) staffReturnToFinance(order.id, reason);
            });
            tr.querySelector('.staff-delete-btn')?.addEventListener('click', () => staffDeleteOrder(order.id));
            fragment.appendChild(tr);
        });
        body.appendChild(fragment);
        if (startIndex + 50 < state.visibleOrders.length) {
            await nextFrame();
            renderChunk(startIndex + 50);
        }
    };
    renderChunk();
}

function fullStaffOrderRows(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item, index) => buildWorkflowItemRow(item, index, 'staff')).join('');
}

function updateStaffModalTotal() {
    let total = 0;
    document.querySelectorAll('#staffOrderItemsBody tr').forEach(row => {
        if (row.dataset.deleted !== '1') total += parseNumber(row.querySelector('.staff-subtotal')?.textContent);
    });
    if ($('staffModalGrandTotal')) $('staffModalGrandTotal').textContent = `${formatMoney(total)} د.ا`;
}

function updateStaffRowProduct(row) {
    const select = row.querySelector('.staff-product');
    const selectedName = select?.value || '';
    const product = getProductByName(selectedName);
    const codeCell = row.querySelector('.staff-code-cell');
    const fallbackCode = codeCell?.dataset.originalCode || (codeCell?.textContent === '-' ? '' : codeCell?.textContent) || '';
    const code = product?.productCode || product?.product_code || product?.code || fallbackCode;
    const price = getProductPrice(product, parseNumber(row.querySelector('.staff-price')?.dataset.price));
    const priceCell = row.querySelector('.staff-price');
    if (codeCell) codeCell.textContent = code || '-';
    if (priceCell) {
        priceCell.dataset.price = String(price);
        priceCell.textContent = formatMoney(price);
    }
}

function recalcStaffRow(row, source = '') {
    updateStaffRowProduct(row);
    const qtyInput = row.querySelector('.staff-qty');
    const bonusInput = row.querySelector('.staff-bonus');
    const pctInput = row.querySelector('.staff-bonus-pct');
    const price = parseNumber(row.querySelector('.staff-price')?.dataset.price);
    let qty = Math.max(0, parseNumber(qtyInput?.value));
    let bonus = Math.max(0, parseNumber(bonusInput?.value));
    let pct = Math.max(0, parseNumber(pctInput?.value));
    if (source === 'pct') {
        bonus = qty > 0 ? Math.round((qty * pct) / 100) : 0;
        if (bonusInput) bonusInput.value = bonus;
    } else {
        pct = qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0;
        if (pctInput) pctInput.value = pct;
    }
    if (qtyInput) qtyInput.value = qty;
    row.querySelector('.staff-subtotal').textContent = formatMoney(qty * price);
    updateStaffModalTotal();
}

function bindStaffItemRow(row) {
    row.querySelector('.staff-product')?.addEventListener('change', () => recalcStaffRow(row, 'product'));
    row.querySelector('.staff-qty')?.addEventListener('input', () => recalcStaffRow(row, 'qty'));
    row.querySelector('.staff-bonus')?.addEventListener('input', () => recalcStaffRow(row, 'bonus'));
    row.querySelector('.staff-bonus-pct')?.addEventListener('input', () => recalcStaffRow(row, 'pct'));
    row.querySelector('.staff-delete-item')?.addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من حذف هذا الصنف من الطلبية؟')) return;
        row.dataset.deleted = '1';
        row.style.display = 'none';
        updateStaffModalTotal();
    });
    recalcStaffRow(row);
}

function addStaffItemRow(item = {}) {
    const body = $('staffOrderItemsBody');
    if (!body) return;
    const empty = body.querySelector('td[colspan]')?.closest('tr');
    if (empty) empty.remove();
    const index = body.querySelectorAll('tr').length;
    body.insertAdjacentHTML('beforeend', buildWorkflowItemRow({ qty: 1, bonus: 0, ...item }, index, 'staff'));
    bindStaffItemRow(body.lastElementChild);
    updateStaffModalTotal();
}

function openStaffOrderModal(order) {
    state.selectedOrder = order;
    $('staffModalTitle').textContent = `تعديل طلبية ${order.id.substring(0, 8).toUpperCase()}`;
    $('staffModalMeta').innerHTML = `
        <span><b>المندوب:</b> ${escapeHtml(order.repName || '-')}</span>
        <span><b>الصيدلية:</b> ${escapeHtml(order.pharmacyName || '-')}</span>
        <span><b>كود الصيدلية:</b> ${escapeHtml(getPharmacyCode(order) || '-')}</span>
    `;
    $('staffOrderNote').textContent = getOrderNote(order) || 'لا توجد ملاحظات.';
    $('staffOrderItemsBody').innerHTML = fullStaffOrderRows(order) || `<tr><td colspan="10">لا توجد أصناف.</td></tr>`;
    document.querySelectorAll('#staffOrderItemsBody tr').forEach(bindStaffItemRow);
    $('staffOrderModal').style.display = 'flex';
}

function closeStaffOrderModal() {
    $('staffOrderModal').style.display = 'none';
    state.selectedOrder = null;
}

function collectStaffModalItems() {
    const originalItems = Array.isArray(state.selectedOrder?.items) ? state.selectedOrder.items : [];
    const kept = [];
    const deleted = [];
    document.querySelectorAll('#staffOrderItemsBody tr').forEach(row => {
        const index = Number(row.dataset.index);
        const original = originalItems[index] || {};
        if (row.dataset.deleted === '1') {
            deleted.push({ index, item: original });
            return;
        }
        const qty = Math.max(0, parseNumber(row.querySelector('.staff-qty')?.value));
        const bonus = Math.max(0, parseNumber(row.querySelector('.staff-bonus')?.value));
        const price = parseNumber(row.querySelector('.staff-price')?.dataset.price);
        const productName = row.querySelector('.staff-product')?.value || original.name || '';
        const product = getProductByName(productName);
        const productCode = product?.productCode || product?.product_code || product?.code || row.querySelector('.staff-code-cell')?.textContent || getItemProductCode(original);
        kept.push(calculateItem({
            ...original,
            name: productName,
            qty,
            bonus,
            bonusPct: qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0,
            price,
            total: qty * price,
            note: row.querySelector('.staff-note')?.value || '',
            productCode,
            product_code: productCode,
            code: productCode
        }));
    });
    return { kept, deleted, grandTotal: calculateGrandTotal(kept) };
}

async function saveStaffEdits(options = {}) {
    if (!state.selectedOrder) return false;
    const { close = true, silent = false } = options;
    const { kept, deleted, grandTotal } = collectStaffModalItems();
    if (kept.length === 0) { showToast('لا يمكن حفظ طلبية بدون أصناف.', 'warning'); return false; }
    await updateOrderWithAudit(state.selectedOrder.id, {
        items: kept,
        grandTotal,
        orderStaffEditedBy: 'Ziad/Zakaria',
        orderStaffEditedAt: new Date(),
        orderStaffDeletedItems: deleted
    }, auditEntry('orders_staff_edit', 'Ziad/Zakaria', 'orders_staff', { items: state.selectedOrder.items || [], grandTotal: state.selectedOrder.grandTotal || 0 }, { items: kept, grandTotal }, deleted.length ? `تم حذف ${deleted.length} صنف` : ''));
    if (!silent) showToast('تم حفظ تعديل فريق المعالجة.', 'success');
    if (close) closeStaffOrderModal();
    return true;
}

async function staffReturnToFinance(orderId, reason) {
    await returnOrderStep(orderId, 'finance', reason, 'Ziad/Zakaria', 'orders_staff', 'orders_staff_returned_to_finance');
}

async function staffDeleteOrder(orderId) {
    if (!confirm('تحذير: سيتم حذف الطلبية بالكامل من مسار العمل كحذف ناعم. هل تريد المتابعة؟')) return;
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'deleted_by_orders_staff',
        workflowStage: 'deleted',
        orderStaffStatus: 'deleted_by_orders_staff',
        deletedByOrdersStaff: 'Ziad/Zakaria',
        deletedAt: new Date()
    }, auditEntry('orders_staff_order_deleted', 'Ziad/Zakaria', 'orders_staff', { status: order.status || '', items: order.items || [] }, { status: 'deleted_by_orders_staff' }, 'حذف ناعم من فريق المعالجة'));
    showToast('تم حذف الطلبية كحذف ناعم وحفظ سجل التدقيق.', 'success');
    closeStaffOrderModal();
}

function syncOrdersStaffTabFromMode() {
    if (WORKFLOW_PAGE !== 'orders-staff') return;
    const mode = $('showHiddenMode')?.value || 'active';
    state.ordersStaffTab = mode === 'active' ? 'approved' : 'followup';
    document.querySelectorAll('.orders-staff-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.staffTab === state.ordersStaffTab);
    });
}

function setOrdersStaffTab(tab) {
    if (WORKFLOW_PAGE !== 'orders-staff') return;
    state.ordersStaffTab = tab === 'followup' ? 'followup' : 'approved';
    const modeSelect = $('showHiddenMode');
    if (modeSelect) modeSelect.value = state.ordersStaffTab === 'approved' ? 'active' : 'followup';
    syncOrdersStaffTabFromMode();
    applyOrdersStaffFilters();
}

function getOrdersByIds(ids) {
    const uniq = new Set(ids);
    return state.visibleOrders.filter(order => uniq.has(order.id));
}

function isOrdersStaffExportEligible(order = {}) {
    const status = getPrimaryStatus(order);
    const staffState = order.orderStaffStatus || '';
    return status === 'orders_staff_pending' || status === 'orders_staff_exported' || status === 'orders_staff_hidden' ||
        staffState === 'orders_staff_pending' || staffState === 'orders_staff_exported' || staffState === 'orders_staff_hidden';
}

async function exportOrders(orders) {
    if (orders.length === 0) return showToast('لا توجد طلبيات للتصدير.', 'warning');
    if (typeof XLSX === 'undefined') return showToast('مكتبة Excel غير محملة. أعد فتح الصفحة وحاول مرة أخرى.', 'error');
    const rows = orders.flatMap(orderToExportRows);
    if (rows.length === 0) return showToast('لا توجد أصناف قابلة للتصدير.', 'warning');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders_staff_${toDateInputValue(new Date())}.xlsx`);

    const allEligibleForStatusUpdate = orders.every(isOrdersStaffExportEligible);
    if (!allEligibleForStatusUpdate) {
        showToast('تم تصدير ملف Excel فقط بدون تغيير حالة الطلبيات لأن القائمة تحتوي طلبيات ليست عند قسم الطلبيات.', 'warning');
        return;
    }

    const hide = confirm(`هل تريد إخفاء هذه الطلبيات بعد التصدير حتى تظهر الطلبيات الجديدة فقط في المرة القادمة؟

موافق = نعم، أخفِ الطلبيات المصدرة.
إلغاء = لا، أبقِ الطلبيات ظاهرة.`);
    const action = hide ? 'orders_staff_hide_after_export' : 'orders_staff_export';
    state.suspendRender = true;
    const results = await Promise.allSettled(orders.map(order => updateOrderWithAudit(order.id, {
        status: hide ? 'orders_staff_hidden' : 'orders_staff_pending',
        orderStaffStatus: hide ? 'orders_staff_hidden' : 'orders_staff_exported',
        exportedBy: 'Ziad/Zakaria',
        exportedAt: new Date(),
        hiddenByOrderStaff: !!hide,
        hiddenAt: hide ? new Date() : null
    }, auditEntry(action, 'Ziad/Zakaria', 'orders_staff', { status: order.status, orderStaffStatus: order.orderStaffStatus || '' }, { status: hide ? 'orders_staff_hidden' : 'orders_staff_pending', orderStaffStatus: hide ? 'orders_staff_hidden' : 'orders_staff_exported' }))));
    state.suspendRender = false;
    state.onOrdersChange?.();
    showToast(`تم التصدير وتحديث الحالة: ${results.filter(r => r.status === 'fulfilled').length}/${orders.length}`, 'success');
}

function initOrdersStaff() {
    setDefaultDateFilters();
    if ($('showHiddenMode')) $('showHiddenMode').value = 'active';
    syncOrdersStaffTabFromMode();
    bindCommonFilters(() => {
        syncOrdersStaffTabFromMode();
        applyOrdersStaffFilters();
    });
    $('approvedByFinanceTab')?.addEventListener('click', () => setOrdersStaffTab('approved'));
    $('followupOrdersTab')?.addEventListener('click', () => setOrdersStaffTab('followup'));
    $('selectAllWorkflow')?.addEventListener('change', e => document.querySelectorAll('.workflow-order-checkbox').forEach(cb => cb.checked = e.target.checked));
    $('exportSelectedBtn')?.addEventListener('click', () => exportOrders(getOrdersByIds(selectedIds())));
    $('exportVisibleBtn')?.addEventListener('click', () => exportOrders(state.visibleOrders));
    $('closeStaffModalBtn')?.addEventListener('click', closeStaffOrderModal);
    $('addStaffItemBtn')?.addEventListener('click', () => addStaffItemRow());
    $('saveStaffEditsBtn')?.addEventListener('click', () => saveStaffEdits());
    $('returnStaffToFinanceBtn')?.addEventListener('click', () => {
        if (!state.selectedOrder) return;
        const reason = confirmRequiredNote('اكتب ملاحظة الإرجاع للمالية:');
        if (reason !== null) staffReturnToFinance(state.selectedOrder.id, reason).then(closeStaffOrderModal);
    });
    $('deleteStaffOrderBtn')?.addEventListener('click', () => state.selectedOrder && staffDeleteOrder(state.selectedOrder.id));
    subscribeOrders(applyOrdersStaffFilters);
}

async function boot() {
    const banner = $('offline-banner');
    const updateOnlineStatus = () => {
        if (!banner) return;
        banner.classList.toggle('active', !navigator.onLine);
    };
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    loadProducts();
    if (WORKFLOW_PAGE === 'market-manager') initMarketManager();
    if (WORKFLOW_PAGE === 'finance-controller') initFinanceController();
    if (WORKFLOW_PAGE === 'orders-staff') initOrdersStaff();
}

boot();
