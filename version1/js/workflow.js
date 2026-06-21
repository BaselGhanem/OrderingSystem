import { db, collection, getDocs, doc, getDoc, updateDoc, onSnapshot } from './firebase.js';

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
    orders_staff_hidden: 'مخفي بعد التصدير',
    approved: 'موافق عليه',
    returned: 'مرتجع',
    rejected: 'مرفوض',
    deleted_by_market_manager: 'محذوف من مدير السوق'
};

const state = {
    orders: [],
    visibleOrders: [],
    selectedOrder: null,
    unsub: null,
    productsByName: new Map()
};

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

function getPharmacyCode(order = {}) {
    return order.pharmacyCode || order.pharmacy_code || order.customerCode || '';
}

function getItemProductCode(item = {}) {
    if (item.productCode || item.product_code || item.code) return item.productCode || item.product_code || item.code;
    const product = state.productsByName.get(item.name || '');
    return product?.productCode || product?.product_code || product?.code || '';
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
    if (from && !from.value) from.value = firstDayOfMonth();
    if (to && !to.value) to.value = toDateInputValue(new Date());
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
    await updateDoc(ref, {
        ...updates,
        previousStatus: current.status || '',
        changedBy: entry.user,
        changedByRole: entry.role,
        changedAt: new Date(),
        actionType: entry.action,
        auditTrail: [...trail, { ...entry, previousStatus: current.status || '', orderId }],
        updatedAt: new Date()
    });
}

async function loadProducts() {
    try {
        const snap = await getDocs(collection(db, 'products'));
        snap.forEach(d => {
            const data = { id: d.id, ...d.data() };
            if (data.name) state.productsByName.set(data.name, data);
        });
    } catch (error) {
        console.warn('Products could not be loaded', error);
    }
}

function subscribeOrders(onChange) {
    if (state.unsub) state.unsub();
    state.unsub = onSnapshot(collection(db, 'orders'), snap => {
        state.orders = [];
        snap.forEach(d => state.orders.push({ id: d.id, ...d.data() }));
        state.orders.sort((a, b) => (normalizeDate(b.createdAt)?.getTime() || 0) - (normalizeDate(a.createdAt)?.getTime() || 0));
        onChange();
    }, () => showToast('فشل تحميل الطلبيات من Firebase', 'error'));
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
    ['filterDateFrom', 'filterDateTo', 'filterPharmacy', 'filterRepresentative', 'filterProduct', 'filterStatus', 'showHiddenMode'].forEach(id => {
        $(id)?.addEventListener('input', applyFn);
        $(id)?.addEventListener('change', applyFn);
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

function fullOrderRows(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    return items.map((item, index) => {
        const calc = calculateItem(item);
        return `
            <tr data-index="${index}">
                <td>${index + 1}</td>
                <td>${escapeHtml(getItemProductCode(calc) || '-')}</td>
                <td class="item-name-cell">${escapeHtml(calc.name || '-')}</td>
                <td><input class="mm-qty" type="number" min="0" step="1" value="${calc.qty}"></td>
                <td><input class="mm-bonus" type="number" min="0" step="1" value="${calc.bonus}"></td>
                <td><input class="mm-bonus-pct" type="number" min="0" step="0.01" value="${calc.bonusPct}"></td>
                <td class="mm-price" data-price="${calc.price}">${formatMoney(calc.price)}</td>
                <td class="mm-subtotal">${formatMoney(calc.total)}</td>
                <td>${escapeHtml(calc.note || '-')}</td>
                <td><button class="action-btn workflow-delete-item" type="button" title="حذف الصنف"><i class="ph ph-trash"></i></button></td>
            </tr>
        `;
    }).join('');
}

function recalcMarketRow(row, source = '') {
    const qtyInput = row.querySelector('.mm-qty');
    const bonusInput = row.querySelector('.mm-bonus');
    const pctInput = row.querySelector('.mm-bonus-pct');
    const price = parseNumber(row.querySelector('.mm-price')?.dataset.price);
    let qty = Math.max(0, parseNumber(qtyInput.value));
    let bonus = Math.max(0, parseNumber(bonusInput.value));
    let pct = Math.max(0, parseNumber(pctInput.value));

    if (source === 'pct') {
        bonus = qty > 0 ? Math.round((qty * pct) / 100) : 0;
        bonusInput.value = bonus;
    } else {
        pct = qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0;
        pctInput.value = pct;
    }

    qtyInput.value = qty;
    const subtotal = qty * price;
    row.querySelector('.mm-subtotal').textContent = formatMoney(subtotal);
    updateMarketModalTotal();
}

function updateMarketModalTotal() {
    let total = 0;
    document.querySelectorAll('#marketOrderItemsBody tr').forEach(row => {
        total += parseNumber(row.querySelector('.mm-subtotal')?.textContent);
    });
    if ($('marketModalGrandTotal')) $('marketModalGrandTotal').textContent = `${formatMoney(total)} د.ا`;
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
    $('marketOrderNote').textContent = order.orderNote || order.note || 'لا توجد ملاحظات.';
    $('marketOrderItemsBody').innerHTML = fullOrderRows(order) || `<tr><td colspan="10">لا توجد أصناف.</td></tr>`;
    document.querySelectorAll('#marketOrderItemsBody tr').forEach(row => {
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
    });
    $('marketOrderModal').style.display = 'flex';
}

function closeMarketOrderModal() {
    $('marketOrderModal').style.display = 'none';
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
        kept.push(calculateItem({
            ...original,
            qty,
            bonus,
            bonusPct: qty > 0 ? Number(((bonus / qty) * 100).toFixed(2)) : 0,
            price,
            total: qty * price,
            productCode: getItemProductCode(original)
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
    if (!confirm('سيتم حفظ أي تعديلات حالية ثم اعتماد الطلبية وتحويلها إلى Hamza/Finance. هل تريد المتابعة؟')) return;
    const orderId = state.selectedOrder.id;
    const saved = await saveMarketEdits({ close: false, silent: true });
    if (saved) await marketApprove(orderId);
}

async function marketApprove(orderId) {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'finance_pending',
        workflowStage: 'finance',
        marketManagerStatus: 'market_manager_approved',
        marketManagerApprovedBy: 'Market Manager',
        marketManagerApprovedAt: new Date(),
        financeStatus: 'finance_pending'
    }, auditEntry('market_manager_approved', 'Market Manager', 'market_manager', { status: order.status }, { status: 'finance_pending' }));
    showToast('تم اعتماد الطلبية وتحويلها إلى المالية.', 'success');
    closeMarketOrderModal();
}

async function marketReject(orderId, reason = '') {
    const order = state.orders.find(o => o.id === orderId) || state.selectedOrder || {};
    await updateOrderWithAudit(orderId, {
        status: 'market_manager_rejected',
        workflowStage: 'market_manager',
        marketManagerStatus: 'market_manager_rejected',
        marketManagerRejectedBy: 'Market Manager',
        marketManagerRejectedAt: new Date(),
        marketManagerRejectionReason: reason
    }, auditEntry('market_manager_rejected', 'Market Manager', 'market_manager', { status: order.status }, { status: 'market_manager_rejected' }, reason));
    showToast('تم رفض الطلبية من مدير السوق.', 'success');
    closeMarketOrderModal();
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
    showToast('تم حذف الطلبية Soft Delete وحفظ سجل التدقيق.', 'success');
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
        const eligible = ['market_manager_pending', 'supervisor_approved'].includes(orderStatus);
        const statusMatch = status ? orderStatus === status : eligible;
        return statusMatch &&
            inDateRange(order, from, to) &&
            (!rep || (order.repName || '').toLowerCase().includes(rep)) &&
            (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm));
    });
    renderMarketOrders();
}

function renderMarketOrders() {
    const body = $('marketOrdersBody');
    if (!body) return;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('marketOrdersBody', 11, 'لا توجد طلبيات بانتظار مدير السوق');
    state.visibleOrders.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input class="workflow-order-checkbox" type="checkbox" value="${order.id}"></td>
            <td>${escapeHtml(formatDateTime(order.createdAt))}</td>
            <td>${escapeHtml(order.repName || '-')}</td>
            <td>${escapeHtml(getPharmacyCode(order) || '-')}</td>
            <td>${escapeHtml(order.pharmacyName || '-')}</td>
            <td>${buildItemsPreview(order)}</td>
            <td>${formatMoney(order.grandTotal)} د.ا</td>
            <td><span class="status-badge ${order.status}">${statusLabel(order.status)}</span></td>
            <td>${escapeHtml(order.orderNote || '-')}</td>
            <td class="workflow-actions-cell">
                <button class="action-btn view-btn" type="button" title="عرض وتعديل"><i class="ph ph-eye"></i></button>
                <button class="action-btn approve-btn" type="button" title="اعتماد"><i class="ph ph-check-circle"></i></button>
                <button class="action-btn reject-btn" type="button" title="رفض"><i class="ph ph-x-circle"></i></button>
                <button class="action-btn danger-btn delete-btn" type="button" title="حذف"><i class="ph ph-trash"></i></button>
            </td>
        `;
        tr.querySelector('.view-btn').onclick = () => openMarketOrderModal(order);
        tr.querySelector('.approve-btn').onclick = () => confirm('اعتماد الطلبية وتحويلها إلى Hamza/Finance؟') && marketApprove(order.id);
        tr.querySelector('.reject-btn').onclick = () => {
            const reason = confirmReason('سبب رفض مدير السوق:', true);
            if (reason !== null) marketReject(order.id, reason);
        };
        tr.querySelector('.delete-btn').onclick = () => confirm('تحذير قوي: سيتم حذف الطلبية من مسار العمل كـ Soft Delete ولن تظهر للمراحل التالية. هل تريد المتابعة؟') && marketDeleteOrder(order.id);
        body.appendChild(tr);
    });
}

async function marketBulk(action) {
    const ids = selectedIds();
    if (ids.length === 0) return showToast('اختر طلبية واحدة على الأقل.', 'warning');
    if (action === 'approve') {
        if (!confirm(`اعتماد ${ids.length} طلبية وتحويلها إلى المالية؟`)) return;
        const results = await Promise.allSettled(ids.map(id => marketApprove(id)));
        showToast(`تم تنفيذ الاعتماد: ${results.filter(r => r.status === 'fulfilled').length}/${ids.length}`, 'success');
    }
    if (action === 'reject') {
        const reason = confirmReason(`سبب رفض ${ids.length} طلبية من مدير السوق:`, true);
        if (reason === null) return;
        const results = await Promise.allSettled(ids.map(id => marketReject(id, reason)));
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
    $('saveMarketEditsBtn')?.addEventListener('click', saveMarketEdits);
    $('approveMarketModalBtn')?.addEventListener('click', approveSelectedMarketOrderFromModal);
    $('rejectMarketModalBtn')?.addEventListener('click', () => {
        if (!state.selectedOrder) return;
        const reason = confirmReason('سبب رفض مدير السوق:', true);
        if (reason !== null) marketReject(state.selectedOrder.id, reason);
    });
    $('deleteMarketModalBtn')?.addEventListener('click', () => state.selectedOrder && confirm('تحذير قوي: هل تريد حذف الطلبية بالكامل من مسار العمل؟') && marketDeleteOrder(state.selectedOrder.id));
    subscribeOrders(applyMarketFilters);
}

function applyFinanceFilters() {
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const status = $('filterStatus')?.value || '';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';
    state.visibleOrders = state.orders.filter(order => {
        const financeState = order.financeStatus || (order.status === 'finance_pending' ? 'finance_pending' : '');
        const defaultEligible = order.status === 'finance_pending' || (order.marketManagerStatus === 'market_manager_approved' && financeState === 'finance_pending');
        const statusMatch = status ? order.status === status || financeState === status : defaultEligible;
        return statusMatch && inDateRange(order, from, to) && (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm));
    });
    renderFinanceOrders();
}

function renderFinanceOrders() {
    const body = $('financeOrdersBody');
    if (!body) return;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('financeOrdersBody', 4, 'لا توجد طلبيات مالية بانتظار الاعتماد');
    state.visibleOrders.forEach(order => {
        const tr = document.createElement('tr');
        const isPending = order.status === 'finance_pending' || (order.financeStatus || '') === 'finance_pending';
        tr.innerHTML = `
            <td>${escapeHtml(getPharmacyCode(order) || '-')}</td>
            <td>${escapeHtml(order.pharmacyName || '-')}</td>
            <td>${formatMoney(order.grandTotal)} د.ا</td>
            <td class="workflow-actions-cell">
                ${isPending ? `<button class="action-btn approve-btn" type="button"><i class="ph ph-check-circle"></i> اعتماد</button><button class="action-btn reject-btn" type="button"><i class="ph ph-x-circle"></i> رفض</button>` : `<span class="status-badge ${order.status}">${statusLabel(order.status)}</span>`}
            </td>
        `;
        tr.querySelector('.approve-btn')?.addEventListener('click', () => confirm('اعتماد الطلبية مالياً وتحويلها إلى Ziad/Zakaria؟') && financeApprove(order.id));
        tr.querySelector('.reject-btn')?.addEventListener('click', () => {
            const reason = confirmReason('سبب الرفض المالي:', true);
            if (reason !== null) financeReject(order.id, reason);
        });
        body.appendChild(tr);
    });
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
            'Order Note': order.orderNote || order.note || '',
            'Status': statusLabel(order.status),
            'Order Staff Status': statusLabel(order.orderStaffStatus)
        };
    });
}

function applyOrdersStaffFilters() {
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const rep = ($('filterRepresentative')?.value || '').toLowerCase().trim();
    const product = ($('filterProduct')?.value || '').toLowerCase().trim();
    const statusMode = $('showHiddenMode')?.value || 'active';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';
    state.visibleOrders = state.orders.filter(order => {
        const isHidden = order.status === 'orders_staff_hidden' || order.hiddenByOrderStaff === true;
        const isActive = order.status === 'orders_staff_pending' && !isHidden;
        const isExported = order.orderStaffStatus === 'orders_staff_exported' || order.exportedAt;
        let modeOk = isActive;
        if (statusMode === 'hidden') modeOk = isHidden;
        if (statusMode === 'exported') modeOk = isExported && !isHidden;
        if (statusMode === 'all') modeOk = ['orders_staff_pending', 'orders_staff_hidden'].includes(order.status) || isExported || order.financeStatus === 'finance_approved';
        const itemMatch = !product || (Array.isArray(order.items) && order.items.some(item => `${item.name || ''} ${getItemProductCode(item)}`.toLowerCase().includes(product)));
        return modeOk && itemMatch && inDateRange(order, from, to) &&
            (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm)) &&
            (!rep || (order.repName || '').toLowerCase().includes(rep));
    });
    renderOrdersStaffRows();
}

function renderOrdersStaffRows() {
    const body = $('ordersStaffBody');
    if (!body) return;
    body.innerHTML = '';
    updateStats(state.visibleOrders);
    if (state.visibleOrders.length === 0) return setTableEmpty('ordersStaffBody', 13, 'لا توجد طلبيات جاهزة للمعالجة ضمن الفلاتر الحالية');
    state.visibleOrders.forEach(order => {
        const items = Array.isArray(order.items) && order.items.length ? order.items : [{}];
        items.forEach((item, index) => {
            const calc = calculateItem(item);
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index === 0 ? `<input class="workflow-order-checkbox" type="checkbox" value="${order.id}">` : ''}</td>
                <td>${escapeHtml(getPharmacyCode(order) || '-')}</td>
                <td>${escapeHtml(order.pharmacyName || '-')}</td>
                <td>${escapeHtml(order.repName || '-')}</td>
                <td>${escapeHtml(getItemProductCode(calc) || '-')}</td>
                <td class="item-name-cell">${escapeHtml(calc.name || '-')}</td>
                <td>${calc.qty}</td>
                <td>${calc.bonus}</td>
                <td>${calc.bonusPct}%</td>
                <td>${formatMoney(calc.total)}</td>
                <td>${formatMoney(order.grandTotal)}</td>
                <td>${escapeHtml(calc.note || '-')}</td>
                <td>${escapeHtml(order.orderNote || order.note || '-')}</td>
            `;
            body.appendChild(tr);
        });
    });
}

function getOrdersByIds(ids) {
    const uniq = new Set(ids);
    return state.visibleOrders.filter(order => uniq.has(order.id));
}

async function exportOrders(orders) {
    if (orders.length === 0) return showToast('لا توجد طلبيات للتصدير.', 'warning');
    const rows = orders.flatMap(orderToExportRows);
    if (rows.length === 0) return showToast('لا توجد أصناف قابلة للتصدير.', 'warning');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    XLSX.writeFile(wb, `orders_staff_${toDateInputValue(new Date())}.xlsx`);

    const hide = confirm('Do you want to hide these orders so only newly approved orders appear next time?\n\nOK = Yes, hide exported orders.\nCancel = No, keep visible.');
    const action = hide ? 'orders_staff_hide_after_export' : 'orders_staff_export';
    const results = await Promise.allSettled(orders.map(order => updateOrderWithAudit(order.id, {
        status: hide ? 'orders_staff_hidden' : 'orders_staff_pending',
        orderStaffStatus: hide ? 'orders_staff_hidden' : 'orders_staff_exported',
        exportedBy: 'Ziad/Zakaria',
        exportedAt: new Date(),
        hiddenByOrderStaff: !!hide,
        hiddenAt: hide ? new Date() : null
    }, auditEntry(action, 'Ziad/Zakaria', 'orders_staff', { status: order.status, orderStaffStatus: order.orderStaffStatus || '' }, { status: hide ? 'orders_staff_hidden' : 'orders_staff_pending', orderStaffStatus: hide ? 'orders_staff_hidden' : 'orders_staff_exported' }))));
    showToast(`تم التصدير وتحديث الحالة: ${results.filter(r => r.status === 'fulfilled').length}/${orders.length}`, 'success');
}

function initOrdersStaff() {
    setDefaultDateFilters();
    bindCommonFilters(applyOrdersStaffFilters);
    $('selectAllWorkflow')?.addEventListener('change', e => document.querySelectorAll('.workflow-order-checkbox').forEach(cb => cb.checked = e.target.checked));
    $('exportSelectedBtn')?.addEventListener('click', () => exportOrders(getOrdersByIds(selectedIds())));
    $('exportVisibleBtn')?.addEventListener('click', () => exportOrders(state.visibleOrders));
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

    await loadProducts();
    if (WORKFLOW_PAGE === 'market-manager') initMarketManager();
    if (WORKFLOW_PAGE === 'finance-controller') initFinanceController();
    if (WORKFLOW_PAGE === 'orders-staff') initOrdersStaff();
}

boot();
