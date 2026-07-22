const sourceUrl = new URL(`./app.status-source.js?v=20260722_status_unified_v2`, import.meta.url);
const firebaseUrl = new URL(`./firebase.js`, import.meta.url).href;

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Unable to load application source: ${response.status}`);

let source = await response.text();
const resolverPattern = /function getEffectiveOrderStatus\(order = \{\}\) \{[\s\S]*?\n\}/;
const canonicalResolver = `function getEffectiveOrderStatus(order = {}) {
    return order.status || order.workflowStage || order.supervisorStatus ||
        order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || '';
}`;

if (!resolverPattern.test(source)) throw new Error(`Status resolver was not found in app source.`);
source = source.replace(resolverPattern, canonicalResolver);
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

const moduleUrl = URL.createObjectURL(new Blob([source], { type: `text/javascript` }));
try {
    await import(moduleUrl);
} finally {
    URL.revokeObjectURL(moduleUrl);
}
