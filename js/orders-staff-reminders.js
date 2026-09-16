const firebase = await import(`./firebase.js`);
const { db, collection, getDocs, query, where, doc, getDoc } = firebase;

const $rem = id => document.getElementById(id);

const DEFAULT_REP_MANAGER_MAP = Object.fromEntries([
    [`مراد عمر`, `محمد طوالبه`],
    [`مؤيد الزعبي`, `محمد طوالبه`],
    [`محمد عبدربه`, `محمد طوالبه`],
    [`محمد الفاعوري`, `عبدالله الناطور`],
    [`اجود التلهوني`, `عبدالله الناطور`],
    [`يزيد الرقب`, `محمد طوالبه`],
    [`تامر عقل`, `محمد طوالبه`],
    [`محمد ابو يامين`, `عبدالله الناطور`],
    [`مراد الظاهر`, `عبدالله الناطور`],
    [`آخرين - عبدالله`, `عبدالله الناطور`],
    [`اخرين - عبدالله`, `عبدالله الناطور`],
    [`آخرين - محمد`, `محمد طوالبه`],
    [`اخرين - محمد`, `محمد طوالبه`]
]);

const APPROVAL_CONTACTS = [
    { key: `mohammad_tawalbeh`, name: `محمد طوالبة`, role: `مشرف مبيعات`, phone: `0797954876`, email: `Mohammad.Tawalbeh@dadgroup.com` },
    { key: `abdallah_alnatour`, name: `عبدالله الناطور`, role: `مشرف مبيعات`, phone: `0791520783`, email: `Abdallah.ALnatour@dadgroup.com` },
    { key: `mohammad_amira`, name: `محمد عميرة`, role: `Market Manager`, phone: `0796993332`, email: `Mohammad.Amira@dadgroup.com` },
    { key: `hamza_shbatee`, name: `حمزة الشبيطي`, role: `المراقب المالي`, phone: `0770037491`, email: `hamza.shbatee@dadgroup.com` }
];

const PENDING_WORKFLOW_STATUSES = [
    `pending`,
    `pending_supervisor_approval`,
    `supervisor_approved`,
    `market_manager_pending`,
    `market_manager_approved`,
    `finance_pending`
];

function normalizeArabic(value = ``) {
    return String(value || ``)
        .trim()
        .replace(/[أإآ]/g, `ا`)
        .replace(/ة/g, `ه`)
        .replace(/[–—]/g, `-`)
        .replace(/\s*-\s*/g, ` - `)
        .replace(/\s+/g, ` `)
        .toLocaleLowerCase(`ar`);
}

function localDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, `0`);
    const day = String(date.getDate()).padStart(2, `0`);
    return `${year}-${month}-${day}`;
}

function defaultMonthRange() {
    const now = new Date();
    return {
        from: localDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: localDateInput(now)
    };
}

function applyMainDefaultDates() {
    const from = $rem(`filterDateFrom`);
    const to = $rem(`filterDateTo`);
    if (!from || !to) return;

    const range = defaultMonthRange();
    from.value = range.from;
    to.value = range.to;
    from.dispatchEvent(new Event(`change`, { bubbles: true }));
    to.dispatchEvent(new Event(`change`, { bubbles: true }));
}

function applyReminderDefaultDates() {
    const from = $rem(`reminderDateFrom`);
    const to = $rem(`reminderDateTo`);
    if (!from || !to) return;

    const range = defaultMonthRange();
    if (!from.value) from.value = range.from;
    if (!to.value) to.value = range.to;
}

function normalizeDate(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value?.toDate === `function`) {
        const date = value.toDate();
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === `object` && typeof value.seconds === `number`) {
        const date = new Date((value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1000000));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function getOrderDate(order = {}) {
    return normalizeDate(
        order.createdAt || order.date || order.orderDate || order.timestamp || order.created_at ||
        order.updatedAt || order.changedAt
    );
}

function isWithinReminderDateRange(order = {}) {
    const fromValue = $rem(`reminderDateFrom`)?.value || ``;
    const toValue = $rem(`reminderDateTo`)?.value || ``;
    if (!fromValue && !toValue) return true;

    const orderDate = getOrderDate(order);
    if (!orderDate) return false;

    if (fromValue) {
        const from = new Date(`${fromValue}T00:00:00`);
        if (orderDate < from) return false;
    }
    if (toValue) {
        const to = new Date(`${toValue}T23:59:59.999`);
        if (orderDate > to) return false;
    }
    return true;
}

function parseMoney(value) {
    if (typeof value === `number`) return Number.isFinite(value) ? value : 0;
    const normalized = String(value ?? ``).replace(/,/g, ``).replace(/[^0-9.\-]/g, ``);
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
}

function orderValue(order = {}) {
    for (const candidate of [order.grandTotal, order.total, order.orderTotal, order.totalValue]) {
        if (candidate !== undefined && candidate !== null && candidate !== ``) return parseMoney(candidate);
    }
    if (!Array.isArray(order.items)) return 0;
    return order.items.reduce((sum, item) => {
        const quantity = parseMoney(item.quantity ?? item.qty ?? 0);
        const price = parseMoney(item.price ?? item.unitPrice ?? item.salePrice ?? 0);
        return sum + (quantity * price);
    }, 0);
}

function currentStatus(order = {}) {
    const direct = String(order.status || order.orderStatus || order.workflowStatus || ``).trim();
    if (direct) return direct;

    const stage = String(order.workflowStage || ``).trim();
    if (stage === `orders_staff` && order.orderStaffStatus) return order.orderStaffStatus;
    if (stage === `finance` && order.financeStatus) return order.financeStatus;
    if (stage === `market_manager` && order.marketManagerStatus) return order.marketManagerStatus;
    if (stage === `supervisor` && order.supervisorStatus) return order.supervisorStatus;
    return order.orderStaffStatus || order.financeStatus || order.marketManagerStatus || order.supervisorStatus || stage || ``;
}

function isDeletedOrder(order = {}) {
    const status = currentStatus(order).toLowerCase();
    const stage = String(order.workflowStage || ``).trim().toLowerCase();
    if (stage === `deleted`) return true;
    if (status) return status === `deleted` || status.startsWith(`deleted_`);
    return order.isDeleted === true || order.deleted === true || Boolean(order.deletedAt);
}

function pendingOwner(order = {}) {
    const status = currentStatus(order);
    if ([`pending`, `pending_supervisor_approval`].includes(status)) return `supervisor`;
    if ([`supervisor_approved`, `market_manager_pending`].includes(status)) return `market_manager`;
    if ([`market_manager_approved`, `finance_pending`].includes(status)) return `finance_controller`;
    return ``;
}

function isAwaitingHamzaApproval(order = {}) {
    const status = currentStatus(order);
    if (![ `market_manager_approved`, `finance_pending` ].includes(status)) return false;

    const financeStatus = String(order.financeStatus || ``).trim();
    if ([`finance_approved`, `finance_rejected`].includes(financeStatus)) return false;
    if (order.financeApprovedAt || order.financeRejectedAt) return false;
    if (String(order.financeApprovedBy || ``).trim()) return false;
    if (String(order.financeRejectedBy || ``).trim()) return false;
    return true;
}

async function loadRepSupervisorMap() {
    const assignments = { ...DEFAULT_REP_MANAGER_MAP };
    try {
        const snapshot = await getDoc(doc(db, `system_settings`, `rep_supervisor_assignments`));
        const saved = snapshot.exists() ? snapshot.data()?.assignments : null;
        if (saved && typeof saved === `object` && !Array.isArray(saved)) Object.assign(assignments, saved);
    } catch (error) {
        console.warn(`تعذر تحميل ربط المندوبين بالمشرفين، سيتم استخدام الربط الافتراضي.`, error);
    }

    const normalized = new Map();
    Object.entries(assignments).forEach(([rep, supervisor]) => {
        normalized.set(normalizeArabic(rep), String(supervisor || ``).trim());
    });
    return normalized;
}

function resolveSupervisor(order = {}, supervisorMap) {
    const rep = order.repName || order.representativeName || order.salesRep || ``;
    return supervisorMap.get(normalizeArabic(rep)) || order.supervisorName || order.supervisor || order.managerName || ``;
}

function pharmacyName(order = {}) {
    return String(order.pharmacyName || order.customerName || order.pharmacy || `صيدلية بدون اسم`).trim();
}

function formatMoney(value) {
    return parseMoney(value).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
    return String(value ?? ``)
        .replace(/&/g, `&amp;`)
        .replace(/</g, `&lt;`)
        .replace(/>/g, `&gt;`);
}

function buildReminderMessage(contact, orders) {
    const total = orders.reduce((sum, order) => sum + orderValue(order), 0);
    const details = orders.map((order, index) => `${index + 1}- ${pharmacyName(order)} وقيمتها ${formatMoney(orderValue(order))} د.ا`).join(`\n`);
    return `مرحباً ${contact.name}،\nلديك طلبيات عدد ${orders.length} يرجى الموافقة.\nإليك تفصيل الطلبيات:\n${details}\n\nعدد الطلبيات المطلوب منك الموافقة عليها هو: ${orders.length}\nقيمة الطلبيات المطلوبة هي: ${formatMoney(total)} د.ا`;
}

function whatsappNumber(phone) {
    const digits = String(phone || ``).replace(/\D/g, ``);
    return digits.startsWith(`0`) ? `962${digits.slice(1)}` : digits;
}

function reminderCardHtml(contact, orders) {
    const total = orders.reduce((sum, order) => sum + orderValue(order), 0);
    const disabled = orders.length ? `` : `disabled`;
    const message = buildReminderMessage(contact, orders);

    return `<article class="approval-reminder-card" data-reminder-contact="${contact.key}">
        <div class="approval-reminder-person">
            <div><h3>${contact.name}</h3><div class="approval-reminder-role">${contact.role}</div></div>
            <div class="approval-reminder-contact">${contact.phone}<br>${contact.email}</div>
        </div>
        <div class="approval-reminder-stats">
            <div class="approval-reminder-stat"><span>بانتظار الموافقة</span><strong>${orders.length} طلبية</strong></div>
            <div class="approval-reminder-stat"><span>القيمة</span><strong>${formatMoney(total)} د.ا</strong></div>
        </div>
        <div class="approval-reminder-actions">
            <button class="approval-whatsapp" data-reminder-action="whatsapp" type="button" ${disabled}><i class="ph ph-whatsapp-logo"></i> واتساب</button>
            <button class="approval-email" data-reminder-action="email" type="button" ${disabled}><i class="ph ph-envelope-simple"></i> إيميل</button>
        </div>
        <details class="approval-reminder-preview"><summary>معاينة الرسالة</summary><pre>${escapeHtml(message)}</pre></details>
    </article>`;
}

let lastReminderData = new Map();

async function fetchPendingApprovalOrders() {
    const ordersQuery = query(
        collection(db, `orders`),
        where(`status`, `in`, PENDING_WORKFLOW_STATUSES)
    );
    const snapshot = await getDocs(ordersQuery);
    const orders = [];
    snapshot.forEach(row => orders.push({ id: row.id, ...row.data() }));
    return orders;
}

async function loadApprovalReminders() {
    const grid = $rem(`approvalReminderGrid`);
    const warning = $rem(`approvalReminderWarning`);
    if (!grid) return;

    grid.innerHTML = `<div class="approval-reminder-loading"><i class="ph ph-circle-notch ph-spin"></i> جاري تحميل الطلبيات المعلقة...</div>`;
    if (warning) {
        warning.hidden = true;
        warning.textContent = ``;
    }

    try {
        const startedAt = performance.now();
        const [orders, supervisorMap] = await Promise.all([
            fetchPendingApprovalOrders(),
            loadRepSupervisorMap()
        ]);

        const buckets = new Map(APPROVAL_CONTACTS.map(contact => [contact.key, []]));
        let unresolvedSupervisorCount = 0;

        orders.forEach(order => {
            if (isDeletedOrder(order)) return;
            if (!isWithinReminderDateRange(order)) return;

            const owner = pendingOwner(order);
            if (owner === `finance_controller`) {
                if (isAwaitingHamzaApproval(order)) buckets.get(`hamza_shbatee`).push(order);
                return;
            }
            if (owner === `market_manager`) {
                buckets.get(`mohammad_amira`).push(order);
                return;
            }
            if (owner !== `supervisor`) return;

            const supervisor = normalizeArabic(resolveSupervisor(order, supervisorMap));
            if (supervisor === normalizeArabic(`محمد طوالبه`) || supervisor === normalizeArabic(`محمد طوالبة`)) {
                buckets.get(`mohammad_tawalbeh`).push(order);
            } else if (supervisor === normalizeArabic(`عبدالله الناطور`)) {
                buckets.get(`abdallah_alnatour`).push(order);
            } else {
                unresolvedSupervisorCount += 1;
            }
        });

        lastReminderData = buckets;
        grid.innerHTML = APPROVAL_CONTACTS.map(contact => reminderCardHtml(contact, buckets.get(contact.key) || [])).join(``);

        if (warning && unresolvedSupervisorCount > 0) {
            warning.textContent = `تنبيه: يوجد ${unresolvedSupervisorCount} طلبية بانتظار المشرف ضمن الفترة المحددة ولم يتم تحديد المشرف المرتبط بها من بيانات النظام.`;
            warning.hidden = false;
        }

        grid.querySelectorAll(`[data-reminder-action]`).forEach(button => {
            button.addEventListener(`click`, () => {
                const card = button.closest(`[data-reminder-contact]`);
                const contact = APPROVAL_CONTACTS.find(item => item.key === card?.dataset.reminderContact);
                if (!contact) return;

                const ordersForContact = lastReminderData.get(contact.key) || [];
                if (!ordersForContact.length) return;

                const message = buildReminderMessage(contact, ordersForContact);
                if (button.dataset.reminderAction === `whatsapp`) {
                    window.open(`https://wa.me/${whatsappNumber(contact.phone)}?text=${encodeURIComponent(message)}`, `_blank`, `noopener,noreferrer`);
                    return;
                }

                const subject = `تذكير بالموافقة على الطلبيات (${ordersForContact.length})`;
                window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
            });
        });

        console.info(`Approval reminders loaded: ${orders.length} pending-state orders fetched in ${Math.round(performance.now() - startedAt)}ms`);
    } catch (error) {
        console.error(`Failed to load approval reminders`, error);
        grid.innerHTML = `<div class="approval-reminder-loading"><i class="ph ph-warning-circle"></i> تعذر تحميل الطلبيات المعلقة. حاول التحديث مرة أخرى.</div>`;
    }
}

function setReminderMode(enabled) {
    const panel = $rem(`approvalReminderPanel`);
    const reminderTab = $rem(`approvalReminderTab`);
    document.body.classList.toggle(`orders-staff-reminder-mode`, enabled);
    if (panel) panel.hidden = !enabled;
    if (reminderTab) reminderTab.classList.toggle(`reminder-active`, enabled);

    if (enabled) {
        document.querySelectorAll(`.orders-staff-tab`).forEach(button => button.classList.remove(`active`));
        reminderTab?.classList.add(`active`);
    }
}

$rem(`approvalReminderTab`)?.addEventListener(`click`, async () => {
    setReminderMode(true);
    applyReminderDefaultDates();
    await loadApprovalReminders();
});
$rem(`approvedByFinanceTab`)?.addEventListener(`click`, () => setReminderMode(false));
$rem(`followupOrdersTab`)?.addEventListener(`click`, () => setReminderMode(false));
$rem(`refreshApprovalRemindersBtn`)?.addEventListener(`click`, loadApprovalReminders);
$rem(`reminderDateFrom`)?.addEventListener(`change`, loadApprovalReminders);
$rem(`reminderDateTo`)?.addEventListener(`change`, loadApprovalReminders);

function scheduleDefaultDates() {
    applyMainDefaultDates();
    applyReminderDefaultDates();
    window.setTimeout(applyMainDefaultDates, 250);
}

if (document.readyState === `complete`) scheduleDefaultDates();
else window.addEventListener(`load`, scheduleDefaultDates, { once: true });