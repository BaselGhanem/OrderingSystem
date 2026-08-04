const sourceUrl = new URL(`./app.status-source.js?v=20260804_supervisor_delete_rules_v1`, import.meta.url);
const firebaseUrl = new URL(`./firebase.js`, import.meta.url).href;

const readyListeners = [];
const readyTargets = [document, window];
const originalListeners = readyTargets.map(target => ({
    target,
    addEventListener: target.addEventListener
}));

// Capture DOMContentLoaded handlers while the original module is being loaded.
// This prevents the async source transformation from missing page initialization.
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
    if (!response.ok) throw new Error(`Unable to load application source: ${response.status}`);

    let source = await response.text();
    const resolverPattern = /function getEffectiveOrderStatus\(order = \{\}\) \{[\s\S]*?\n\}/;
    const canonicalResolver = `function getEffectiveOrderStatus(order = {}) {
    return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
}`;

    const supervisorDeletePattern = /function canCurrentSupervisorDeleteOrder\(order = \{\}\) \{[\s\S]*?\n\}/;
    const supervisorDeleteResolver = `function canCurrentSupervisorDeleteOrder(order = {}) {
    const status = getEffectiveOrderStatus(order) || 'pending_supervisor_approval';
    if (isDeletedOrderStatus(status)) return false;

    const ownerOk = isOrderUnderCurrentManager(order) || isOrderWithoutAssignedSupervisor(order);
    if (!ownerOk) return false;

    const deletableStatuses = [
        'pending',
        'pending_supervisor_approval',
        'returned_to_rep',
        'returned_to_supervisor',
        'finance_rejected'
    ];

    return deletableStatuses.includes(status);
}`;

    if (!resolverPattern.test(source)) {
        throw new Error(`Status resolver was not found in application source.`);
    }
    if (!supervisorDeletePattern.test(source)) {
        throw new Error(`Supervisor delete permission resolver was not found in application source.`);
    }

    source = source.replace(resolverPattern, canonicalResolver);
    source = source.replace(supervisorDeletePattern, supervisorDeleteResolver);
    source = source.replace(/from\s+(['"])\.\/firebase\.js\1/, `from ${JSON.stringify(firebaseUrl)}`);
    source = source.replace(
        `deleted_by_orders_staff: 'محذوفة من فريق المعالجة'`,
        `deleted_by_orders_staff: 'محذوفة من قسم الطلبيات'`
    );
    source = source.replace(
        'حذف المشرف مسموح فقط قبل موافقة المشرف. بعد الموافقة استخدم الإرجاع حسب مسار العمل.',
        'لا يمكن للمشرف حذف الطلبية في حالتها الحالية.'
    );
    source = source.replace(
        'تم حذف الطلبيات المسموح حذفها فقط. تم تجاوز ${skipped.length} طلبية لأنها ليست قبل موافقة المشرف.',
        'تم حذف الطلبيات المسموح حذفها فقط. تم تجاوز ${skipped.length} طلبية لأن حالتها الحالية غير مسموح حذفها للمشرف.'
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
    // The real event has not fired yet: register every captured handler normally.
    readyListeners.forEach(({ target, listener, options }) => {
        target.addEventListener(`DOMContentLoaded`, listener, options);
    });
} else {
    // The event fired during the async import: execute the captured handlers once now.
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
