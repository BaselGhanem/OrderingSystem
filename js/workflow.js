const sourceUrl = new URL(`./workflow.status-source.js?v=20260915_orders_staff_visibility_v3`, import.meta.url);
const firebaseUrl = new URL(`./firebase.js`, import.meta.url).href;

const readyListeners = [];
const readyTargets = [document, window];
const originalListeners = readyTargets.map(target => ({
    target,
    addEventListener: target.addEventListener
}));

originalListeners.forEach(({ target, addEventListener }) => {
    target.addEventListener = function(type, listener, options) {
        if (type === `DOMContentLoaded`) {
            readyListeners.push({ target, listener, options });
            return;
        }
        return addEventListener.call(target, type, listener, options);
    };
});

let moduleUrl = ``;
try {
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`Unable to load workflow source: ${response.status}`);

    let source = await response.text();

    const rawResolverPattern = /function getRawPrimaryStatus\(order = \{\}\) \{[\s\S]*?\n\}/;
    const primaryResolverPattern = /function getPrimaryStatus\(order = \{\}\) \{[\s\S]*?\n\}/;
    const deletedResolverPattern = /function isOrderDeleted\(order = \{\}\) \{[\s\S]*?\n\}\n\nfunction orderHasAuditAction/;
    const followUpPattern = /function getWorkflowFollowUp\(order = \{\}\) \{[\s\S]*?\n\}\n+\s*function historyDate/;
    const canTouchPattern = /function canOrdersStaffTouchOrder\(order = \{\}\) \{[\s\S]*?\n\}\n\nfunction buildExportEntry/;
    const ordersStaffDatePattern = /function getOrdersStaffFilterDate\(order = \{\}\) \{[\s\S]*?\n\}/;
    const defaultDatePattern = /function setDefaultDateFilters\(\) \{[\s\S]*?\n\}/;
    const allOrdersLoaderPattern = /async function refreshAllOrdersForStaffPaginated\(\) \{[\s\S]*?\n\}\n\nfunction subscribeOrders/;
    const staffFiltersPattern = /function applyOrdersStaffFilters\(\) \{[\s\S]*?\n\}\n\nfunction renderOrdersStaffRows/;
    const initOrdersStaffPattern = /function initOrdersStaff\(\) \{[\s\S]*?\n\}\n\nasync function boot/;

    const canonicalRawResolver = `function getRawPrimaryStatus(order = {}) {
    const directStatus = order.status || order.orderStatus || order.workflowStatus || '';
    if (directStatus) return directStatus;

    const stage = String(order.workflowStage || '').trim();
    if (stage === 'orders_staff' && order.orderStaffStatus) return order.orderStaffStatus;
    if (stage === 'finance' && order.financeStatus) return order.financeStatus;
    if (stage === 'market_manager' && order.marketManagerStatus) return order.marketManagerStatus;
    if (stage === 'supervisor' && order.supervisorStatus) return order.supervisorStatus;

    return order.orderStaffStatus || order.financeStatus || order.marketManagerStatus ||
        order.supervisorStatus || stage || '';
}`;

    const canonicalPrimaryResolver = `function getPrimaryStatus(order = {}) {
    const rawStatus = getRawPrimaryStatus(order);
    const terminalOrReturned = rawStatus.startsWith('deleted_') ||
        ['returned_to_rep', 'returned_to_supervisor', 'returned_to_market_manager', 'returned_to_finance',
            'market_manager_rejected', 'finance_rejected', 'rejected'].includes(rawStatus);
    if (terminalOrReturned || String(order.workflowStage || '').trim() === 'deleted') return rawStatus;

    const explicitWorkflowStatuses = new Set([
        'pending', 'pending_supervisor_approval', 'supervisor_approved', 'market_manager_pending',
        'market_manager_approved', 'finance_pending', 'finance_approved', 'orders_staff_pending',
        'orders_staff_exported', 'orders_staff_hidden'
    ]);
    if (explicitWorkflowStatuses.has(rawStatus)) return rawStatus;

    const staffState = order.orderStaffStatus || '';
    if (['orders_staff_pending', 'orders_staff_exported', 'orders_staff_hidden'].includes(staffState)) return staffState;
    if (order.financeStatus === 'finance_approved') return 'orders_staff_pending';
    if (order.financeStatus === 'finance_pending') return 'finance_pending';
    if (order.marketManagerStatus === 'market_manager_approved') return 'finance_pending';
    if (order.marketManagerStatus === 'market_manager_pending') return 'market_manager_pending';
    if (order.supervisorStatus === 'supervisor_approved') return 'market_manager_pending';

    // Historical export/invoice evidence is legacy evidence only. Never let it
    // override an authoritative current workflow state.
    if (!rawStatus && orderHasHiddenInvoiceEvidence(order)) return 'orders_staff_hidden';
    if (!rawStatus && orderHasExportEvidence(order)) return 'orders_staff_exported';
    return rawStatus;
}`;

    const canonicalDeletedResolver = `function isOrderDeleted(order = {}) {
    const directStatus = String(order.status || order.orderStatus || order.workflowStatus || '').trim().toLowerCase();
    const stage = String(order.workflowStage || '').trim().toLowerCase();

    if (stage === 'deleted') return true;
    if (directStatus) return directStatus === 'deleted' || directStatus.startsWith('deleted_');

    let stagedStatus = '';
    if (stage === 'orders_staff') stagedStatus = order.orderStaffStatus || '';
    else if (stage === 'finance') stagedStatus = order.financeStatus || '';
    else if (stage === 'market_manager') stagedStatus = order.marketManagerStatus || '';
    else if (stage === 'supervisor') stagedStatus = order.supervisorStatus || '';

    if (stagedStatus) {
        const normalized = String(stagedStatus).trim().toLowerCase();
        return normalized === 'deleted' || normalized.startsWith('deleted_');
    }

    const legacyStatuses = [order.supervisorStatus, order.marketManagerStatus, order.financeStatus, order.orderStaffStatus]
        .map(value => String(value || '').trim().toLowerCase())
        .filter(Boolean);
    if (legacyStatuses.some(value => value === 'deleted' || value.startsWith('deleted_'))) return true;

    // Legacy flags are consulted only when there is no authoritative current status.
    return order.isDeleted === true || order.deleted === true || Boolean(order.deletedAt);
}`;

    const canonicalFollowUp = `function getWorkflowFollowUp(order = {}) {
    const status = getPrimaryStatus(order);
    const supervisorState = order.supervisorStatus || '';
    const marketState = order.marketManagerStatus || '';
    const financeState = order.financeStatus || '';
    const staffState = order.orderStaffStatus || '';
    const returnedBy = order.returnedBy ? \` — أرجعها: \${order.returnedBy}\` : '';
    const returnReason = order.returnReason ? \`سبب الإرجاع: \${order.returnReason}\` : '';

    if (status === 'returned_to_rep') return { ownerKey: 'representative', owner: 'المندوب', detail: returnReason || \`مطلوب تعديل الطلبية من المندوب\${returnedBy}\` };
    if (status === 'pending' || status === 'pending_supervisor_approval') return { ownerKey: 'supervisor', owner: 'المشرف', detail: 'بانتظار موافقة المشرف' };
    if (status === 'returned_to_supervisor') return { ownerKey: 'supervisor', owner: 'المشرف', detail: returnReason || \`مطلوب مراجعة المشرف\${returnedBy}\` };
    if (status === 'supervisor_approved' || status === 'market_manager_pending') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: 'بانتظار موافقة مدير السوق' };
    if (status === 'returned_to_market_manager') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: returnReason || \`مطلوب مراجعة مدير السوق\${returnedBy}\` };
    if (status === 'market_manager_rejected') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: order.marketManagerRejectionReason || 'مرفوض من مدير السوق' };
    if (status === 'market_manager_approved' || status === 'finance_pending') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: 'بانتظار الاعتماد المالي' };
    if (status === 'finance_rejected') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: order.financeRejectionReason || 'مرفوض مالياً' };
    if (status === 'returned_to_finance') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: returnReason || \`مرجعة للمراقب المالي\${returnedBy}\` };
    if (status === 'orders_staff_hidden') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تمت الفوترة / مخفية بعد التصدير' };
    if (status === 'orders_staff_exported') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تم التصدير ولم تُخفَ بعد' };
    if (status === 'finance_approved' || status === 'orders_staff_pending') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'جاهزة للمعالجة / التصدير' };
    if (status === 'deleted_by_orders_staff' || status === 'deleted_by_market_manager' || status === 'deleted_by_supervisor' || status === 'deleted_by_reports') return { ownerKey: 'none', owner: 'لا يوجد', detail: 'الطلبية محذوفة من مسار العمل' };

    // Legacy fallback only after current status has been evaluated.
    if (financeState === 'finance_approved' || staffState === 'orders_staff_pending') return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'جاهزة للمعالجة / التصدير' };
    if (financeState === 'finance_pending' || marketState === 'market_manager_approved') return { ownerKey: 'finance_controller', owner: 'المراقب المالي', detail: 'بانتظار الاعتماد المالي' };
    if (marketState === 'market_manager_pending' || supervisorState === 'supervisor_approved') return { ownerKey: 'market_manager', owner: 'مدير السوق', detail: 'بانتظار موافقة مدير السوق' };
    if (supervisorState === 'pending_supervisor_approval') return { ownerKey: 'supervisor', owner: 'المشرف', detail: 'بانتظار موافقة المشرف' };
    if (staffState === 'orders_staff_hidden' || (!status && orderHasHiddenInvoiceEvidence(order))) return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تمت الفوترة / مخفية بعد التصدير' };
    if (staffState === 'orders_staff_exported' || (!status && orderHasExportEvidence(order))) return { ownerKey: 'orders_staff', owner: 'قسم الطلبيات', detail: 'تم التصدير ولم تُخفَ بعد' };

    return { ownerKey: '', owner: '-', detail: statusLabel(status) };
}`;

    const canonicalCanTouch = `function canOrdersStaffTouchOrder(order = {}) {
    if (isOrderDeleted(order)) return false;
    const status = getPrimaryStatus(order);
    return ['finance_approved', 'orders_staff_pending', 'orders_staff_exported'].includes(status);
}`;

    const canonicalOrdersStaffDate = `function getOrdersStaffFilterDate(order = {}) {
    return normalizeDate(
        order.createdAt || order.date || order.orderDate || order.timestamp || order.created_at ||
        order.updatedAt || order.changedAt
    );
}`;

    const canonicalDefaultDateFilters = `function setDefaultDateFilters() {
    const from = $('filterDateFrom');
    const to = $('filterDateTo');

    if (WORKFLOW_PAGE === 'orders-staff') {
        if (from) from.value = '';
        if (to) to.value = '';
        return;
    }

    const today = toDateInputValue(new Date());
    if (from && !from.value) from.value = firstDayOfMonth();
    if (to && !to.value) to.value = today;
}`;

    const canonicalAllOrdersLoader = `async function refreshAllOrdersForStaffPaginated() {
    const loadToken = ++state.loadToken;
    try {
        // Use the same full-collection read strategy as Audit Center. This avoids
        // partial/realtime-listener transport failures causing orders to disappear.
        const snap = await getDocs(collection(db, 'orders'));
        if (loadToken !== state.loadToken) return state.orders;

        const allOrders = [];
        snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
        state.orders = sortOrders(allOrders);
        state.allOrdersLoaded = true;
        state.lastRefreshAt = Date.now();
        writeCache(ALL_ORDERS_CACHE_KEY, state.orders);
        showDataModeNotice(\`آخر تحديث للكل: \${new Date().toLocaleTimeString('en-GB')} — \${state.orders.length} طلبية\`);
        state.onOrdersChange?.();
        return state.orders;
    } catch (error) {
        console.error('Full Orders Staff load failed', error);
        showToast('فشل تحميل كل الطلبيات من Firebase. تم إبقاء آخر بيانات ظاهرة.', 'error');
        return state.orders;
    }
}`;

    const canonicalStaffFilters = `function applyOrdersStaffFilters() {
    const pharm = ($('filterPharmacy')?.value || '').toLowerCase().trim();
    const rep = ($('filterRepresentative')?.value || '').toLowerCase().trim();
    const product = ($('filterProduct')?.value || '').toLowerCase().trim();
    const statusMode = $('showHiddenMode')?.value || 'active';
    const requiredOwner = $('filterRequiredOwner')?.value || '';
    const orderType = $('filterOrderType')?.value || '';
    const from = $('filterDateFrom')?.value || '';
    const to = $('filterDateTo')?.value || '';

    const normalizedStatusMode = statusMode === 'all' ? 'followup' : statusMode;
    if (normalizedStatusMode === 'followup' && !state.allOrdersLoaded) {
        ensureOrdersStaffAllLoaded();
        return;
    }

    state.visibleOrders = state.orders.filter(order => {
        if (isOrderDeleted(order)) return false;

        const status = getPrimaryStatus(order);
        const followUp = getWorkflowFollowUp(order);
        const isActive = status === 'orders_staff_pending' || status === 'finance_approved';
        const isHidden = status === 'orders_staff_hidden';
        const isExported = status === 'orders_staff_exported';

        let modeOk = isActive;
        if (normalizedStatusMode === 'followup') modeOk = true;
        if (normalizedStatusMode === 'hidden') modeOk = isHidden;
        if (normalizedStatusMode === 'exported') modeOk = isExported;

        const itemMatch = !product || (Array.isArray(order.items) && order.items.some(item =>
            \`\${item.name || ''} \${getItemProductCode(item)}\`.toLowerCase().includes(product)
        ));
        const orderTypeMatch = !orderType || getOrderTypeForFilter(order) === orderType;

        return modeOk && itemMatch && orderTypeMatch &&
            inDateRange(order, from, to) &&
            (!requiredOwner || followUp.ownerKey === requiredOwner) &&
            (!pharm || (order.pharmacyName || '').toLowerCase().includes(pharm) || getPharmacyCode(order).toLowerCase().includes(pharm)) &&
            (!rep || (order.repName || order.representativeName || '').toLowerCase().includes(rep));
    });
    renderOrdersStaffRows();
}`;

    const canonicalInitOrdersStaff = `function initOrdersStaff() {
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

    // Do not rely exclusively on Listen/WebChannel. A one-shot read guarantees the
    // actionable queue is populated even when realtime transport temporarily fails.
    refreshOrdersFromFirebase(currentPageOrderSource(), PAGE_CACHE_KEY, false).catch(error => {
        console.warn('Orders Staff one-shot refresh failed', error);
    });
}`;

    const requiredPatterns = [
        rawResolverPattern,
        primaryResolverPattern,
        deletedResolverPattern,
        followUpPattern,
        canTouchPattern,
        ordersStaffDatePattern,
        defaultDatePattern,
        allOrdersLoaderPattern,
        staffFiltersPattern,
        initOrdersStaffPattern
    ];
    if (requiredPatterns.some(pattern => !pattern.test(source))) {
        throw new Error(`Required Orders Staff workflow resolver was not found in workflow source.`);
    }

    source = source.replace(rawResolverPattern, canonicalRawResolver);
    source = source.replace(primaryResolverPattern, canonicalPrimaryResolver);
    source = source.replace(deletedResolverPattern, `${canonicalDeletedResolver}\n\nfunction orderHasAuditAction`);
    source = source.replace(followUpPattern, `${canonicalFollowUp}\n\nfunction historyDate`);
    source = source.replace(canTouchPattern, `${canonicalCanTouch}\n\nfunction buildExportEntry`);
    source = source.replace(ordersStaffDatePattern, canonicalOrdersStaffDate);
    source = source.replace(defaultDatePattern, canonicalDefaultDateFilters);
    source = source.replace(allOrdersLoaderPattern, `${canonicalAllOrdersLoader}\n\nfunction subscribeOrders`);
    source = source.replace(staffFiltersPattern, `${canonicalStaffFilters}\n\nfunction renderOrdersStaffRows`);
    source = source.replace(initOrdersStaffPattern, `${canonicalInitOrdersStaff}\n\nasync function boot`);

    source = source.replace(
        `const WORKFLOW_CACHE_VERSION = '20260630_orders_staff_export_columns_finance_note_fix1';`,
        `const WORKFLOW_CACHE_VERSION = '20260915_orders_staff_visibility_v3';`
    );

    // Any new Finance approval reopens the order cleanly even if historical flags
    // from a previous invoice/delete cycle remain on the document.
    source = source.replace(
        `orderStaffStatus: 'orders_staff_pending',\n        hiddenByOrderStaff: false`,
        `orderStaffStatus: 'orders_staff_pending',\n        hiddenByOrderStaff: false,\n        hiddenAt: null,\n        isInvoiced: false,\n        invoicedAt: null,\n        invoicedBy: '',\n        isDeleted: false,\n        deleted: false,\n        deletedAt: null`
    );

    source = source.replace(/from\s+(['"])\.\/firebase\.js\1/, `from ${JSON.stringify(firebaseUrl)}`);
    source = source.replace(
        `deleted_by_orders_staff: 'محذوفة من فريق المعالجة'`,
        `deleted_by_orders_staff: 'محذوفة من قسم الطلبيات'`
    );

    if (!source.includes(`orders_staff_edited_returned_to_finance: 'تم تعديله وإرجاعه للمالية'`)) {
        source = source.replace(
            `orders_staff_hidden: 'تمت الفوترة',`,
            `orders_staff_hidden: 'تمت الفوترة',\n    orders_staff_edited_returned_to_finance: 'تم تعديله وإرجاعه للمالية',`
        );
    }

    moduleUrl = URL.createObjectURL(new Blob([source], { type: `text/javascript` }));
    await import(moduleUrl);
} finally {
    originalListeners.forEach(({ target, addEventListener }) => {
        target.addEventListener = addEventListener;
    });

    if (moduleUrl) URL.revokeObjectURL(moduleUrl);
}

if (document.readyState === `loading`) {
    readyListeners.forEach(({ target, listener, options }) => {
        target.addEventListener(`DOMContentLoaded`, listener, options);
    });
} else {
    const readyEvent = new Event(`DOMContentLoaded`, { bubbles: true, cancelable: false });
    readyListeners.forEach(({ target, listener }) => {
        try {
            if (typeof listener === `function`) listener.call(target, readyEvent);
            else if (listener && typeof listener.handleEvent === `function`) listener.handleEvent(readyEvent);
        } catch (error) {
            console.error(`Deferred DOMContentLoaded listener failed:`, error);
        }
    });
}
