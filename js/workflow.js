const sourceUrl = new URL(`./workflow.status-source.js?v=20260915_orders_staff_visibility_v1`, import.meta.url);
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
    if (terminalOrReturned || order.workflowStage === 'deleted') return rawStatus;

    const explicitWorkflowStatuses = new Set([
        'pending', 'pending_supervisor_approval', 'supervisor_approved', 'market_manager_pending',
        'market_manager_approved', 'finance_pending', 'finance_approved', 'orders_staff_pending',
        'orders_staff_exported', 'orders_staff_hidden'
    ]);
    if (explicitWorkflowStatuses.has(rawStatus)) return rawStatus;

    const staffState = order.orderStaffStatus || '';
    if (['orders_staff_pending', 'orders_staff_exported', 'orders_staff_hidden'].includes(staffState)) {
        return staffState;
    }
    if (order.financeStatus === 'finance_approved') return 'orders_staff_pending';
    if (order.financeStatus === 'finance_pending') return 'finance_pending';
    if (order.marketManagerStatus === 'market_manager_approved') return 'finance_pending';
    if (order.marketManagerStatus === 'market_manager_pending') return 'market_manager_pending';
    if (order.supervisorStatus === 'supervisor_approved') return 'market_manager_pending';

    // Historical export/invoice evidence is only a legacy fallback when no current
    // workflow field gives us an authoritative state. It must never override a
    // reopened/current order such as orders_staff_pending or finance_approved.
    if (orderHasHiddenInvoiceEvidence(order)) return 'orders_staff_hidden';
    if (orderHasExportEvidence(order)) return 'orders_staff_exported';
    return rawStatus;
}`;

    if (!rawResolverPattern.test(source) || !primaryResolverPattern.test(source)) {
        throw new Error(`Status resolver was not found in workflow source.`);
    }

    source = source.replace(rawResolverPattern, canonicalRawResolver);
    source = source.replace(primaryResolverPattern, canonicalPrimaryResolver);

    source = source.replace(
        `const hidden = status === 'orders_staff_hidden' || staffState === 'orders_staff_hidden' || orderHasHiddenInvoiceEvidence(order);`,
        `const hidden = status === 'orders_staff_hidden';`
    );

    source = source.replace(
        `const financeApproved = status === 'orders_staff_pending' || status === 'finance_approved' || staffState === 'orders_staff_pending' || order.financeStatus === 'finance_approved';\n    const exported = status === 'orders_staff_exported' || staffState === 'orders_staff_exported' || orderHasStaffExportEvidence(order);\n    const hidden = status === 'orders_staff_hidden' || staffState === 'orders_staff_hidden' || orderHasHiddenInvoiceEvidence(order);`,
        `const financeApproved = ['orders_staff_pending', 'finance_approved'].includes(status);\n    const exported = status === 'orders_staff_exported';\n    const hidden = status === 'orders_staff_hidden';`
    );

    source = source.replace(
        `const isInvoiced = status === 'orders_staff_hidden' || staffState === 'orders_staff_hidden' || orderHasHiddenInvoiceEvidence(order);\n        const isHidden = isInvoiced && (order.hiddenByOrderStaff === true || !!order.hiddenAt ||\n            (Array.isArray(order.exportHistory) && order.exportHistory.some(entry => entry?.hideAfterExport === true)));\n        const isActive = (status === 'orders_staff_pending' || status === 'finance_approved' || staffState === 'orders_staff_pending' || order.financeStatus === 'finance_approved') && !isInvoiced;\n        const isExported = isInvoiced || orderHasStaffExportEvidence(order);`,
        `const isActive = status === 'orders_staff_pending' || status === 'finance_approved';\n        const isHidden = status === 'orders_staff_hidden';\n        const isInvoiced = isHidden;\n        const isExported = status === 'orders_staff_exported' || isHidden;`
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
