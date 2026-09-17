import webpush from 'web-push';
import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    setDoc,
    deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: `AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g`,
    authDomain: `dad-ordering-system.firebaseapp.com`,
    projectId: `dad-ordering-system`,
    storageBucket: `dad-ordering-system.firebasestorage.app`,
    messagingSenderId: `43886677849`,
    appId: `1:43886677849:web:de5f80c06e1b743c948648`
};

const VAPID_PUBLIC_KEY = `BDKdgrn3Z9nYEs6ZlD_IofwG7Ors1VorIfpIkx3JmuJtlhmuveILrQvNM5PkWiRkjFDgKRxEX4jRy8yi5ZPPoC4`;
const VAPID_PRIVATE_KEY = process.env.WEB_PUSH_VAPID_PRIVATE_KEY || ``;
const FORCE_RUN = String(process.env.FORCE_RUN || ``).toLowerCase() === `true`;
const TEST_USER = String(process.env.TEST_USER || ``).trim();
const BASE_URL = `https://baselghanem.github.io/OrderingSystem/`;

if (!VAPID_PRIVATE_KEY) throw new Error(`Missing WEB_PUSH_VAPID_PRIVATE_KEY repository secret.`);

webpush.setVapidDetails(BASE_URL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const USERS = [
    { key: `hamza_shbatee`, name: `حمزة الشبيطي`, role: `finance`, target: `finance_controller.html` },
    { key: `ziad_hourany`, name: `زياد الحوراني`, role: `orders_staff`, target: `orders_staff.html` },
    { key: `zakaria`, name: `زكريا`, role: `orders_staff`, target: `orders_staff.html` },
    { key: `mohammad_amira`, name: `محمد عميرة`, role: `market_manager`, target: `market_manager.html` },
    { key: `abdallah_alnatour`, name: `عبدالله الناطور`, role: `supervisor`, target: `supervisor.html` },
    { key: `mohammad_tawalbeh`, name: `محمد طوالبة`, role: `supervisor`, target: `supervisor.html` }
];

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

const ACTIONABLE_STATUSES = [
    `pending`,
    `pending_supervisor_approval`,
    `returned_to_supervisor`,
    `supervisor_approved`,
    `market_manager_pending`,
    `returned_to_market_manager`,
    `market_manager_approved`,
    `finance_pending`,
    `returned_to_finance`,
    `finance_approved`,
    `orders_staff_pending`,
    `approved`
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

function ammanScheduleAllowsRun() {
    if (FORCE_RUN) return true;
    const parts = new Intl.DateTimeFormat(`en-GB`, {
        timeZone: `Asia/Amman`,
        weekday: `short`,
        hour: `2-digit`,
        minute: `2-digit`,
        hour12: false
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    if (![ `Sun`, `Mon`, `Tue`, `Wed`, `Thu` ].includes(map.weekday)) return false;
    const minutes = (Number(map.hour) * 60) + Number(map.minute);
    return minutes >= (8 * 60 + 30) && minutes <= (17 * 60);
}

function currentStatus(order = {}) {
    const raw = String(order.status || order.orderStatus || order.workflowStatus || ``).trim();
    const staffState = String(order.orderStaffStatus || ``).trim();
    if ([`orders_staff_exported`, `orders_staff_hidden`].includes(staffState)) return staffState;
    if (order.isInvoiced === true || order.exportedAt || order.invoicedAt) return staffState || `orders_staff_exported`;
    if (raw) return raw;

    const stage = String(order.workflowStage || order.currentStep || ``).trim();
    if (stage === `orders_staff`) return staffState || (order.financeStatus === `finance_approved` ? `orders_staff_pending` : ``);
    if (stage === `finance`) return order.financeStatus || ``;
    if (stage === `market_manager`) return order.marketManagerStatus || ``;
    if (stage === `supervisor`) return order.supervisorStatus || ``;
    if (order.financeStatus === `finance_approved`) return `orders_staff_pending`;
    return staffState || order.financeStatus || order.marketManagerStatus || order.supervisorStatus || stage || ``;
}

function isDeleted(order = {}) {
    const status = currentStatus(order).toLowerCase();
    return order.deleted === true || order.isDeleted === true || Boolean(order.deletedAt) || status === `deleted` || status.startsWith(`deleted_`);
}

function isAwaitingFinance(order = {}) {
    const status = currentStatus(order);
    if (![ `market_manager_approved`, `finance_pending`, `returned_to_finance` ].includes(status)) return false;
    if ([`finance_approved`, `finance_rejected`].includes(String(order.financeStatus || ``).trim())) return false;
    if (order.financeApprovedAt || order.financeRejectedAt) return false;
    if (String(order.financeApprovedBy || ``).trim() || String(order.financeRejectedBy || ``).trim()) return false;
    return true;
}

function isAwaitingOrdersStaff(order = {}) {
    const status = currentStatus(order);
    if (![ `finance_approved`, `orders_staff_pending`, `approved` ].includes(status)) return false;
    if ([`orders_staff_exported`, `orders_staff_hidden`].includes(String(order.orderStaffStatus || ``).trim())) return false;
    if (order.isInvoiced === true || order.exportedAt || order.invoicedAt || order.hiddenByOrderStaff === true) return false;
    return true;
}

async function loadSupervisorMap() {
    const assignments = { ...DEFAULT_REP_MANAGER_MAP };
    try {
        const snap = await getDoc(doc(db, `system_settings`, `rep_supervisor_assignments`));
        const saved = snap.exists() ? snap.data()?.assignments : null;
        if (saved && typeof saved === `object` && !Array.isArray(saved)) Object.assign(assignments, saved);
    } catch (error) {
        console.warn(`Using default supervisor mapping:`, error?.message || error);
    }
    const normalized = new Map();
    Object.entries(assignments).forEach(([rep, supervisor]) => normalized.set(normalizeArabic(rep), normalizeArabic(supervisor)));
    return normalized;
}

async function loadActionableOrders() {
    const merged = new Map();
    const statusQuery = query(collection(db, `orders`), where(`status`, `in`, ACTIONABLE_STATUSES));
    const statusSnap = await getDocs(statusQuery);
    statusSnap.forEach(row => merged.set(row.id, { id: row.id, ...row.data() }));

    const financeSnap = await getDocs(query(collection(db, `orders`), where(`financeStatus`, `==`, `finance_approved`)));
    financeSnap.forEach(row => merged.set(row.id, { id: row.id, ...row.data() }));
    return [...merged.values()];
}

function assignOrdersToUsers(orders, supervisorMap) {
    const buckets = new Map(USERS.map(user => [user.key, []]));

    for (const order of orders) {
        if (isDeleted(order)) continue;
        const status = currentStatus(order);

        if ([`pending`, `pending_supervisor_approval`, `returned_to_supervisor`].includes(status)) {
            const rep = order.repName || order.representativeName || order.salesRep || ``;
            const supervisor = supervisorMap.get(normalizeArabic(rep)) || normalizeArabic(order.supervisorName || order.supervisor || order.managerName || ``);
            if ([normalizeArabic(`محمد طوالبه`), normalizeArabic(`محمد طوالبة`)].includes(supervisor)) buckets.get(`mohammad_tawalbeh`).push(order);
            if (supervisor === normalizeArabic(`عبدالله الناطور`)) buckets.get(`abdallah_alnatour`).push(order);
            continue;
        }

        if ([`supervisor_approved`, `market_manager_pending`, `returned_to_market_manager`].includes(status)) {
            buckets.get(`mohammad_amira`).push(order);
            continue;
        }

        if (isAwaitingFinance(order)) {
            buckets.get(`hamza_shbatee`).push(order);
            continue;
        }

        if (isAwaitingOrdersStaff(order)) {
            buckets.get(`ziad_hourany`).push(order);
            buckets.get(`zakaria`).push(order);
        }
    }

    return buckets;
}

async function getSubscriptionsForUser(userKey) {
    const snap = await getDocs(query(collection(db, `push_subscriptions`), where(`userKey`, `==`, userKey), where(`active`, `==`, true)));
    return snap.docs.map(row => ({ id: row.id, ...row.data() }));
}

async function getNotificationState(userKey) {
    const snap = await getDoc(doc(db, `push_notification_state`, userKey));
    const ids = snap.exists() && Array.isArray(snap.data()?.notifiedOrderIds) ? snap.data().notifiedOrderIds : [];
    return new Set(ids.map(String));
}

async function saveNotificationState(userKey, orderIds) {
    await setDoc(doc(db, `push_notification_state`, userKey), {
        notifiedOrderIds: [...orderIds],
        updatedAt: new Date()
    }, { merge: true });
}

function buildPayload(user, newOrders) {
    const count = newOrders.length;
    const isOrdersStaff = user.role === `orders_staff`;
    return JSON.stringify({
        title: `نظام الطلبيات`,
        body: isOrdersStaff
            ? `لديك ${count} ${count === 1 ? `طلبية جديدة جاهزة للمعالجة` : `طلبيات جديدة جاهزة للمعالجة`}. اضغط لعرضها.`
            : `لديك ${count} ${count === 1 ? `طلبية جديدة بحاجة إلى موافقتك` : `طلبيات جديدة بحاجة إلى موافقتك`}. اضغط للمراجعة.`,
        tag: `orders-${user.key}`,
        url: `${BASE_URL}${user.target}`,
        userKey: user.key
    });
}

function buildTestPayload(user) {
    return JSON.stringify({
        title: `نظام الطلبيات - اختبار حقيقي`,
        body: `هذا إشعار Web Push حقيقي لـ ${user.name}. إذا ظهر فهذا يعني أن مسار الإشعارات الخارجي يعمل بنجاح.`,
        tag: `orders-real-test-${user.key}-${Date.now()}`,
        url: `${BASE_URL}${user.target}`,
        userKey: user.key
    });
}

async function sendToSubscription(subscriptionRow, payload) {
    const subscription = {
        endpoint: subscriptionRow.endpoint,
        keys: subscriptionRow.keys
    };
    try {
        await webpush.sendNotification(subscription, payload, { TTL: 1800 });
        return true;
    } catch (error) {
        const code = Number(error?.statusCode || 0);
        if (code === 404 || code === 410) {
            await deleteDoc(doc(db, `push_subscriptions`, subscriptionRow.id));
            console.log(`Removed expired subscription ${subscriptionRow.id}`);
            return false;
        }
        console.error(`Push failed for ${subscriptionRow.id}:`, error?.message || error);
        return false;
    }
}

async function runRealPushTest(userKey) {
    const user = USERS.find(item => item.key === userKey);
    if (!user) throw new Error(`Unknown TEST_USER: ${userKey}`);
    const subscriptions = await getSubscriptionsForUser(user.key);
    if (!subscriptions.length) throw new Error(`${user.name}: no active push subscription found. Re-enable notifications on that device first.`);
    const payload = buildTestPayload(user);
    const results = await Promise.all(subscriptions.map(subscription => sendToSubscription(subscription, payload)));
    const delivered = results.filter(Boolean).length;
    if (!delivered) throw new Error(`${user.name}: real push test failed for all subscriptions.`);
    console.log(`${user.name}: real push test sent to ${delivered} active subscription(s).`);
    return delivered;
}

async function processQueuedRealPushTests() {
    const snap = await getDocs(query(collection(db, `push_test_requests`), where(`processed`, `==`, false)));
    if (snap.empty) return;

    for (const row of snap.docs) {
        const request = row.data() || {};
        try {
            const delivered = await runRealPushTest(String(request.userKey || ``));
            await setDoc(doc(db, `push_test_requests`, row.id), {
                processed: true,
                success: true,
                delivered,
                processedAt: new Date()
            }, { merge: true });
            console.log(`Processed real push test request ${row.id}.`);
        } catch (error) {
            await setDoc(doc(db, `push_test_requests`, row.id), {
                processed: true,
                success: false,
                error: String(error?.message || error),
                processedAt: new Date()
            }, { merge: true });
            console.error(`Real push test request ${row.id} failed:`, error?.message || error);
        }
    }
}

async function main() {
    await processQueuedRealPushTests();

    if (TEST_USER) {
        await runRealPushTest(TEST_USER);
        return;
    }

    if (!ammanScheduleAllowsRun()) {
        console.log(`Outside Amman notification schedule; exiting.`);
        return;
    }

    const [orders, supervisorMap] = await Promise.all([loadActionableOrders(), loadSupervisorMap()]);
    const buckets = assignOrdersToUsers(orders, supervisorMap);

    for (const user of USERS) {
        const currentOrders = buckets.get(user.key) || [];
        const currentIds = new Set(currentOrders.map(order => String(order.id)));
        const [subscriptions, previousIds] = await Promise.all([
            getSubscriptionsForUser(user.key),
            getNotificationState(user.key)
        ]);

        if (!subscriptions.length) {
            console.log(`${user.name}: no active subscriptions.`);
            continue;
        }

        const newOrders = currentOrders.filter(order => !previousIds.has(String(order.id)));
        if (!newOrders.length) {
            await saveNotificationState(user.key, currentIds);
            console.log(`${user.name}: no new actionable orders.`);
            continue;
        }

        const payload = buildPayload(user, newOrders);
        const results = await Promise.all(subscriptions.map(subscription => sendToSubscription(subscription, payload)));
        if (results.some(Boolean)) {
            await saveNotificationState(user.key, currentIds);
            console.log(`${user.name}: notified for ${newOrders.length} new order(s).`);
        } else {
            console.warn(`${user.name}: no notification was delivered; state was not advanced.`);
        }
    }
}

await main();
