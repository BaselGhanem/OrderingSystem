const sourceUrl = new URL(`./workflow.status-source.js?v=20260813_finance_action_menu_v6`, import.meta.url);
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
    return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
}`;
    const canonicalPrimaryResolver = `function getPrimaryStatus(order = {}) {
    return getRawPrimaryStatus(order);
}`;

    if (!rawResolverPattern.test(source) || !primaryResolverPattern.test(source)) {
        throw new Error(`Status resolver was not found in workflow source.`);
    }

    source = source.replace(rawResolverPattern, canonicalRawResolver);
    source = source.replace(primaryResolverPattern, canonicalPrimaryResolver);
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
