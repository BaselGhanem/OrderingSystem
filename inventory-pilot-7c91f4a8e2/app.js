import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    getDocs,
    getDoc,
    updateDoc,
    doc,
    onSnapshot,
    query,
    where,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: `AIzaSyDSTrX3Y-jF4k7lBS1AApVHHZXTGmWjk-g`,
    authDomain: `dad-ordering-system.firebaseapp.com`,
    projectId: `dad-ordering-system`,
    storageBucket: `dad-ordering-system.firebasestorage.app`,
    messagingSenderId: `43886677849`,
    appId: `1:43886677849:web:de5f80c06e1b743c948648`
};

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

const ADMIN_SESSION_KEY = `dad_admin_session_v2`;
const INVENTORY_COLLECTION = `product_inventory_v1`;
const DEFAULT_STOCK = 1000;
const ADMIN_HASH = `MjAyNjA0`;
const INVOICED_STATUSES = new Set([`orders_staff_hidden`, `orders_staff_invoiced_and_hidden_after_export`]);
const LEGACY_THEME_URL = new URL(`./legacy-theme.css?v=20260727_1`, import.meta.url).href;
const ROOT_ORDER_URL = new URL(`../order.html`, window.location.href).href;
const ROOT_SUPERVISOR_URL = new URL(`../supervisor.html`, window.location.href).href;
const ROOT_REPORTS_URL = new URL(`../reports.html`, window.location.href).href;

const REP_PASSWORDS = {
    [`قضايا`]: `MjAyNg==`,
    [`LPO`]: `MjAyNg==`,
    [`Settlement`]: `MjAyNg==`,
    [`الهاتف`]: `MjAyNg==`,
    [`مراد الظاهر`]: `MzQ3OA==`,
    [`محمد ابو يامين`]: `NDA5OQ==`,
    [`يزيد الرقب`]: `NDE4Nw==`,
    [`محمد النسور`]: `MjAyNg==`,
    [`مؤيد الزعبي`]: `MzQ3OQ==`,
    [`محمد طوالبه`]: `MjAyNjA0`,
    [`اجود التلهوني`]: `MzczNw==`,
    [`تامر عقل`]: `MzU2OQ==`,
    [`Inactive`]: `MjAyNg==`,
    [`مغلقه`]: `MjAyNg==`,
    [`اخرين`]: `MjAyNg==`,
    [`محمد الفاعوري`]: `NDAyMA==`,
    [`مراد عمر`]: `MTUxMA==`,
    [`محمد عبدربه`]: `NDAyOQ==`
};

const DEFAULT_REP_MANAGER_MAP = {
    [`مراد عمر`]: `محمد طوالبه`,
    [`مؤيد الزعبي`]: `محمد طوالبه`,
    [`محمد عبدربه`]: `محمد طوالبه`,
    [`محمد الفاعوري`]: `عبدالله الناطور`,
    [`اجود التلهوني`]: `عبدالله الناطور`,
    [`يزيد الرقب`]: `محمد طوالبه`,
    [`تامر عقل`]: `محمد طوالبه`,
    [`محمد ابو يامين`]: `عبدالله الناطور`,
    [`مراد الظاهر`]: `عبدالله الناطور`
};

const state = {
    role: null,
    user: null,
    reps: [],
    pharmacies: [],
    products: [],
    inventory: new Map(),
    orders: [],
    repManagerMap: { ...DEFAULT_REP_MANAGER_MAP },
    activeView: null,
    workspaceFrame: null,
    pendingPilotOrder: null,
    currentPharmacy: null,
    unsubInventory: null,
    unsubOrders: null,
    unsubPilotOrders: null
};

const byId = id => document.getElementById(id);
const roleScreen = byId(`roleScreen`);
const dashboardScreen = byId(`dashboardScreen`);
const dashboardNav = byId(`dashboardNav`);
const dashboardContent = byId(`dashboardContent`);
const activeUserBadge = byId(`activeUserBadge`);
const homeBtn = byId(`homeBtn`);
const selectionModal = byId(`selectionModal`);
const selectionModalContent = byId(`selectionModalContent`);
const roleButtons = [...document.querySelectorAll(`[data-role]`)];

function escapeHtml(value = ``) {
    const node = document.createElement(`div`);
    node.textContent = String(value ?? ``);
    return node.innerHTML;
}

function numberValue(value) {
    const parsed = Number(String(value ?? 0).replace(/,/g, ``));
    return Number.isFinite(parsed) ? parsed : 0;
}

function productCode(product = {}) {
    return product.productCode || product.product_code || product.code || ``;
}

function pharmacyCode(pharmacy = {}) {
    return pharmacy.pharmacyCode || pharmacy.pharmacy_code || pharmacy.customerCode || pharmacy.code || ``;
}

function effectiveStatus(order = {}) {
    return order.status || order.workflowStage || order.supervisorStatus || order.marketManagerStatus || order.financeStatus || order.orderStaffStatus || ``;
}

function timestampNumber(value) {
    if (value?.toMillis) return value.toMillis();
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateValue(value) {
    if (!value) return null;
    if (value?.toDate) return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, `0`);
    const day = String(date.getDate()).padStart(2, `0`);
    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    const date = dateValue(value);
    if (!date) return `—`;
    return new Intl.DateTimeFormat(`ar-JO`, { year: `numeric`, month: `short`, day: `numeric` }).format(date);
}

function showToast(message, type = ``) {
    const toast = document.createElement(`div`);
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    byId(`toastContainer`).appendChild(toast);
    setTimeout(() => toast.remove(), 3900);
}

function updateNetworkState() {
    document.body.classList.toggle(`offline`, !navigator.onLine);
}

window.addEventListener(`online`, updateNetworkState);
window.addEventListener(`offline`, updateNetworkState);
updateNetworkState();

async function loadReferenceData() {
    const [repsSnap, pharmaciesSnap, productsSnap, assignmentsSnap] = await Promise.all([
        getDocs(collection(db, `reps`)),
        getDocs(collection(db, `pharmacies`)),
        getDocs(collection(db, `products`)),
        getDoc(doc(db, `system_settings`, `rep_supervisor_assignments`))
    ]);
    state.reps = repsSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.name).sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));
    state.pharmacies = pharmaciesSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.name).sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));
    state.products = productsSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.name).sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));
    if (assignmentsSnap.exists()) {
        const saved = assignmentsSnap.data()?.assignments;
        if (saved && typeof saved === `object` && !Array.isArray(saved)) state.repManagerMap = { ...DEFAULT_REP_MANAGER_MAP, ...saved };
    }
}

function normalizedBatches(product) {
    const inventory = state.inventory.get(product.id);
    if (Array.isArray(inventory?.batches) && inventory.batches.length) {
        return inventory.batches.map(batch => ({
            id: batch.id || `batch`,
            batchNo: batch.batchNo || `بدون رقم`,
            quantity: numberValue(batch.quantity),
            expiryDate: batch.expiryDate || ``
        }));
    }
    return [{
        id: `opening-balance`,
        batchNo: `رصيد افتتاحي`,
        quantity: numberValue(inventory?.stock ?? DEFAULT_STOCK),
        expiryDate: ``
    }];
}

function inventoryMetrics(product) {
    const batches = normalizedBatches(product);
    const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const dated = batches.filter(batch => batch.expiryDate && batch.quantity !== 0).sort((a, b) => String(a.expiryDate).localeCompare(String(b.expiryDate)));
    const nearestExpiry = dated[0]?.expiryDate || ``;
    const today = toDateInput(new Date());
    const inSixMonths = new Date();
    inSixMonths.setMonth(inSixMonths.getMonth() + 6);
    const expiryLimit = toDateInput(inSixMonths);
    const expired = dated.some(batch => batch.expiryDate < today && batch.quantity > 0);
    const expiring = dated.some(batch => batch.expiryDate >= today && batch.expiryDate <= expiryLimit && batch.quantity > 0);
    return { batches, total, nearestExpiry, expired, expiring };
}

function startInventoryListener() {
    if (state.unsubInventory) state.unsubInventory();
    state.unsubInventory = onSnapshot(collection(db, INVENTORY_COLLECTION), snapshot => {
        state.inventory = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]));
        if (state.activeView === `inventory`) renderInventoryReport();
    }, error => {
        console.error(error);
        showToast(`تعذر تحميل أرصدة البضاعة.`, `error`);
    });
}

function startOrdersListener() {
    if (state.unsubOrders) state.unsubOrders();
    state.unsubOrders = onSnapshot(collection(db, `orders`), snapshot => {
        state.orders = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => timestampNumber(b.createdAt) - timestampNumber(a.createdAt));
        detectPilotOrder(snapshot.docChanges());
    }, error => console.error(error));
}

function detectPilotOrder(changes) {
    const pending = state.pendingPilotOrder;
    if (!pending) return;
    const earliest = pending.startedAt - 5000;
    const match = changes.filter(change => change.type === `added`).map(change => ({ id: change.doc.id, ...change.doc.data() })).find(order =>
        order.inventoryPilot !== true &&
        String(order.repId || ``) === String(pending.repId || ``) &&
        String(order.pharmacyName || ``) === String(pending.pharmacyName || ``) &&
        timestampNumber(order.createdAt) >= earliest
    );
    if (!match) return;
    state.pendingPilotOrder = null;
    updateDoc(doc(db, `orders`, match.id), {
        inventoryPilot: true,
        inventoryDeducted: false,
        inventoryPilotMarkedAt: serverTimestamp()
    }).catch(error => console.error(error));
}

function startInventoryDeductionWorker() {
    if (state.unsubPilotOrders) state.unsubPilotOrders();
    const pilotQuery = query(collection(db, `orders`), where(`inventoryPilot`, `==`, true));
    state.unsubPilotOrders = onSnapshot(pilotQuery, snapshot => {
        snapshot.docChanges().forEach(change => {
            const order = { id: change.doc.id, ...change.doc.data() };
            if (INVOICED_STATUSES.has(effectiveStatus(order)) && order.inventoryDeducted !== true) {
                deductInvoicedOrder(order.id).catch(error => {
                    console.error(error);
                    showToast(`تعذر خصم مخزون طلبية مفوترة، وستتم إعادة المحاولة.`, `error`);
                });
            }
        });
    });
}

async function deductInvoicedOrder(orderId) {
    await runTransaction(db, async transaction => {
        const orderRef = doc(db, `orders`, orderId);
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists()) return;
        const order = orderSnap.data();
        if (order.inventoryDeducted === true || !INVOICED_STATUSES.has(effectiveStatus(order))) return;

        const grouped = new Map();
        (Array.isArray(order.items) ? order.items : []).forEach(item => {
            const match = state.products.find(product => {
                const itemCode = item.productCode || item.product_code || item.code || ``;
                return (itemCode && productCode(product) === itemCode) || product.name === item.name;
            });
            if (!match) return;
            const quantity = numberValue(item.qty) + numberValue(item.bonus);
            grouped.set(match.id, { product: match, quantity: (grouped.get(match.id)?.quantity || 0) + quantity });
        });

        const rows = [...grouped.entries()].filter(([, row]) => row.quantity > 0);
        const inventoryRefs = rows.map(([id]) => doc(db, INVENTORY_COLLECTION, id));
        const inventorySnaps = await Promise.all(inventoryRefs.map(ref => transaction.get(ref)));
        let shortageDetected = false;

        rows.forEach(([id, row], index) => {
            const existing = inventorySnaps[index].exists() ? inventorySnaps[index].data() : {};
            let batches = Array.isArray(existing.batches) && existing.batches.length
                ? existing.batches.map(batch => ({ id: batch.id || `batch-${Date.now()}`, batchNo: batch.batchNo || `بدون رقم`, quantity: numberValue(batch.quantity), expiryDate: batch.expiryDate || `` }))
                : [{ id: `opening-balance`, batchNo: `رصيد افتتاحي`, quantity: numberValue(existing.stock ?? DEFAULT_STOCK), expiryDate: `` }];
            batches.sort((a, b) => {
                if (!a.expiryDate && !b.expiryDate) return 0;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return String(a.expiryDate).localeCompare(String(b.expiryDate));
            });
            let remaining = row.quantity;
            batches = batches.map(batch => {
                if (remaining <= 0 || batch.quantity <= 0) return batch;
                const deducted = Math.min(batch.quantity, remaining);
                remaining -= deducted;
                return { ...batch, quantity: batch.quantity - deducted };
            });
            if (remaining > 0) {
                shortageDetected = true;
                batches.push({ id: `shortage-${orderId}`, batchNo: `عجز مخزون`, quantity: -remaining, expiryDate: `` });
            }
            const stock = batches.reduce((sum, batch) => sum + numberValue(batch.quantity), 0);
            transaction.set(inventoryRefs[index], {
                productId: id,
                productCode: productCode(row.product),
                productName: row.product.name || ``,
                batches,
                stock,
                lastDeductionOrderId: orderId,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
        transaction.update(orderRef, {
            inventoryDeducted: true,
            inventoryDeductedAt: serverTimestamp(),
            inventoryShortageDetected: shortageDetected
        });
    });
}

function saveAdminSession(name, type, remember) {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    const session = {
        name,
        type,
        token: btoa(encodeURIComponent(`${name}:${Date.now()}`)),
        savedAt: Date.now(),
        remember
    };
    (remember ? localStorage : sessionStorage).setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function saveRepSession(rep) {
    sessionStorage.setItem(`repId`, rep.id);
    sessionStorage.setItem(`repName`, rep.name);
}

function clearSessions() {
    sessionStorage.removeItem(`repId`);
    sessionStorage.removeItem(`repName`);
    sessionStorage.removeItem(`activeOrderContext`);
    sessionStorage.removeItem(`adminOrderMode`);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_SESSION_KEY);
}

roleButtons.forEach(button => button.addEventListener(`click`, () => openLogin(button.dataset.role)));
homeBtn.addEventListener(`click`, logoutToHome);
selectionModal.addEventListener(`click`, event => {
    if (event.target === selectionModal || event.target.closest(`[data-close-modal]`)) closeModal();
});

function closeModal() {
    selectionModal.hidden = true;
    selectionModalContent.innerHTML = ``;
}

function openModal(content) {
    selectionModalContent.innerHTML = content;
    selectionModal.hidden = false;
}

function loginShell(title, subtitle, fields) {
    return `
        <div class="login-head">
            <span class="login-icon"><i class="ph ph-lock-key"></i></span>
            <h2>${title}</h2>
            <p>${subtitle}</p>
        </div>
        <form id="roleLoginForm" class="login-form">
            ${fields}
            <label class="password-field">
                <span>كلمة المرور</span>
                <div class="input-with-icon">
                    <i class="ph ph-password"></i>
                    <input id="rolePassword" type="password" autocomplete="current-password" required autofocus>
                </div>
            </label>
            <label class="remember-row"><input id="rememberLogin" type="checkbox"> تذكر تسجيل الدخول على هذا الجهاز</label>
            <p id="loginError" class="form-error" hidden></p>
            <button class="primary-btn full-btn" type="submit"><i class="ph ph-sign-in"></i> دخول</button>
        </form>`;
}

function openLogin(role) {
    if (role === `rep`) renderRepLogin();
    if (role === `supervisor`) renderSupervisorLogin();
    if (role === `manager`) renderManagerLogin();
}

function renderRepLogin() {
    const options = state.reps
        .filter(rep => REP_PASSWORDS[rep.name])
        .map(rep => `<option value="${escapeHtml(rep.id)}">${escapeHtml(rep.name)}</option>`)
        .join(``);
    openModal(loginShell(`دخول المندوب`, `اختر اسمك وأدخل نفس كلمة المرور المستخدمة في النظام الحالي.`, `
        <label><span>اسم المندوب</span><select id="loginRep" required><option value="">اختر المندوب</option>${options}</select></label>
    `));
    byId(`roleLoginForm`).addEventListener(`submit`, event => {
        event.preventDefault();
        const rep = state.reps.find(item => item.id === byId(`loginRep`).value);
        const error = byId(`loginError`);
        if (!rep || btoa(byId(`rolePassword`).value) !== REP_PASSWORDS[rep.name]) {
            error.textContent = `اسم المندوب أو كلمة المرور غير صحيحة.`;
            error.hidden = false;
            return;
        }
        saveRepSession(rep);
        closeModal();
        enterDashboard(`rep`, { id: rep.id, name: rep.name });
    });
}

function renderSupervisorLogin() {
    openModal(loginShell(`دخول المشرف`, `اختر الاسم ثم أدخل كلمة مرور المشرف المعتمدة.`, `
        <label><span>اسم المشرف</span>
            <select id="loginSupervisor" required>
                <option value="">اختر المشرف</option>
                <option value="عبدالله الناطور">عبدالله الناطور</option>
                <option value="محمد طوالبه">محمد طوالبه</option>
            </select>
        </label>
    `));
    byId(`roleLoginForm`).addEventListener(`submit`, event => {
        event.preventDefault();
        const name = byId(`loginSupervisor`).value;
        const error = byId(`loginError`);
        if (!name || btoa(byId(`rolePassword`).value) !== ADMIN_HASH) {
            error.textContent = `اسم المشرف أو كلمة المرور غير صحيحة.`;
            error.hidden = false;
            return;
        }
        saveAdminSession(name, `supervisor`, byId(`rememberLogin`).checked);
        closeModal();
        enterDashboard(`supervisor`, { name });
    });
}

function renderManagerLogin() {
    openModal(loginShell(`دخول المدير`, `أدخل نفس كلمة مرور لوحة التقارير الحالية.`, `
        <label><span>الاسم</span><input id="loginManager" value="المدير" autocomplete="username" required></label>
    `));
    byId(`roleLoginForm`).addEventListener(`submit`, event => {
        event.preventDefault();
        const name = byId(`loginManager`).value.trim() || `المدير`;
        const error = byId(`loginError`);
        if (btoa(byId(`rolePassword`).value) !== ADMIN_HASH) {
            error.textContent = `كلمة المرور غير صحيحة.`;
            error.hidden = false;
            return;
        }
        saveAdminSession(name, `manager`, byId(`rememberLogin`).checked);
        closeModal();
        enterDashboard(`manager`, { name });
    });
}

const NAV_ITEMS = {
    rep: [
        { id: `new-order`, icon: `ph-plus-circle`, label: `طلبية جديدة` },
        { id: `my-orders`, icon: `ph-receipt`, label: `طلبياتي` },
        { id: `inventory`, icon: `ph-package`, label: `أرصدة البضاعة` },
        { id: `rep-reports`, icon: `ph-chart-bar`, label: `التقارير` }
    ],
    supervisor: [
        { id: `supervisor-dashboard`, icon: `ph-squares-four`, label: `لوحة المشرف` },
        { id: `new-order`, icon: `ph-plus-circle`, label: `طلبية جديدة` },
        { id: `inventory`, icon: `ph-package`, label: `أرصدة البضاعة` }
    ],
    manager: [
        { id: `manager-reports`, icon: `ph-chart-donut`, label: `لوحة التقارير` },
        { id: `inventory`, icon: `ph-package`, label: `أرصدة البضاعة` }
    ]
};

function enterDashboard(role, user) {
    state.role = role;
    state.user = user;
    roleScreen.hidden = true;
    dashboardScreen.hidden = false;
    homeBtn.hidden = false;
    activeUserBadge.hidden = false;
    activeUserBadge.innerHTML = `<i class="ph ph-user"></i> ${escapeHtml(user.name)}`;
    dashboardNav.innerHTML = NAV_ITEMS[role].map(item => `
        <button type="button" data-view="${item.id}"><i class="ph ${item.icon}"></i><span>${item.label}</span></button>
    `).join(``);
    dashboardNav.querySelectorAll(`[data-view]`).forEach(button => button.addEventListener(`click`, () => setView(button.dataset.view)));
    setView(NAV_ITEMS[role][0].id);
}

function logoutToHome() {
    clearSessions();
    state.role = null;
    state.user = null;
    state.activeView = null;
    state.pendingPilotOrder = null;
    state.workspaceFrame = null;
    dashboardContent.innerHTML = ``;
    dashboardScreen.hidden = true;
    roleScreen.hidden = false;
    homeBtn.hidden = true;
    activeUserBadge.hidden = true;
}

function setView(view) {
    state.activeView = view;
    dashboardNav.querySelectorAll(`[data-view]`).forEach(button => button.classList.toggle(`active`, button.dataset.view === view));
    if (view === `inventory`) return renderInventoryReport();
    if (view === `supervisor-dashboard`) return renderLegacyWorkspace(ROOT_SUPERVISOR_URL, `supervisor`);
    if (view === `manager-reports`) return renderLegacyWorkspace(ROOT_REPORTS_URL, `manager`);
    if (view === `new-order`) return renderOrderPreparation();
    if (view === `my-orders`) return renderRepresentativeLegacySection(`my-orders`);
    if (view === `rep-reports`) return renderRepresentativeLegacySection(`reports`);
}

function renderLegacyWorkspace(url, mode) {
    dashboardContent.innerHTML = `<div class="workspace-card"><div class="frame-loader"><i class="ph ph-spinner-gap"></i> جارٍ تحميل الصفحة كاملة…</div><iframe id="workspaceFrame" class="workspace-frame" title="مساحة العمل"></iframe></div>`;
    const frame = byId(`workspaceFrame`);
    state.workspaceFrame = frame;
    frame.addEventListener(`load`, () => {
        const loader = dashboardContent.querySelector(`.frame-loader`);
        if (loader) loader.remove();
        applyLegacyTheme(frame);
        if (mode === `supervisor`) enhanceSupervisorFrame(frame);
        if (mode === `manager`) enhanceManagerFrame(frame);
        if (mode === `rep`) enhanceRepresentativeFrame(frame);
    });
    frame.src = url;
}

function applyLegacyTheme(frame) {
    try {
        const target = frame.contentDocument;
        if (!target || target.querySelector(`[data-pilot-theme]`)) return;
        const link = target.createElement(`link`);
        link.rel = `stylesheet`;
        link.href = LEGACY_THEME_URL;
        link.dataset.pilotTheme = `true`;
        target.head.appendChild(link);
        target.documentElement.dataset.inventoryPilot = `true`;
    } catch (error) {
        console.error(error);
    }
}

function enhanceSupervisorFrame(frame) {
    try {
        const target = frame.contentDocument;
        const addButton = target.querySelector(`#managerAddNewOrderBtn`);
        if (addButton && !addButton.dataset.pilotBound) {
            addButton.dataset.pilotBound = `true`;
            addButton.addEventListener(`click`, event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                setView(`new-order`);
            }, true);
        }
        const main = target.querySelector(`main`) || target.body;
        if (!target.querySelector(`.pilot-inventory-callout`)) {
            const callout = target.createElement(`button`);
            callout.type = `button`;
            callout.className = `pilot-inventory-callout`;
            callout.innerHTML = `<i class="ph ph-package"></i><span><strong>أرصدة البضاعة</strong><small>عرض الكميات والباتشات وتواريخ الانتهاء</small></span><i class="ph ph-arrow-left"></i>`;
            callout.addEventListener(`click`, () => setView(`inventory`));
            main.prepend(callout);
        }
    } catch (error) {
        console.error(error);
    }
}

function enhanceManagerFrame(frame) {
    try {
        const target = frame.contentDocument;
        const grid = target.querySelector(`.report-cards-grid`) || target.querySelector(`main`) || target.body;
        if (!target.querySelector(`.pilot-stock-report-card`)) {
            const card = target.createElement(`button`);
            card.type = `button`;
            card.className = `pilot-stock-report-card`;
            card.innerHTML = `<i class="ph ph-package"></i><span><strong>تقرير أرصدة البضاعة</strong><small>الرصيد، الباتشات، وتواريخ الانتهاء</small></span><i class="ph ph-arrow-left"></i>`;
            card.addEventListener(`click`, () => setView(`inventory`));
            grid.appendChild(card);
        }
    } catch (error) {
        console.error(error);
    }
}

function enhanceRepresentativeFrame(frame) {
    try {
        const target = frame.contentDocument;
        const changeButton = target.querySelector(`#changePharmacyBtn`);
        if (changeButton && !changeButton.dataset.pilotBound) {
            changeButton.dataset.pilotBound = `true`;
            changeButton.addEventListener(`click`, event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                renderOrderPreparation();
            }, true);
        }
    } catch (error) {
        console.error(error);
    }
}

function allowedRepsForSupervisor() {
    if (state.role !== `supervisor`) return [];
    return state.reps.filter(rep => state.repManagerMap[rep.name] === state.user.name);
}

function renderOrderPreparation() {
    const reps = state.role === `rep` ? [state.user] : allowedRepsForSupervisor();
    dashboardContent.innerHTML = `
        <section class="content-panel order-prep">
            <div class="section-heading">
                <div><span class="eyebrow">طلبية جديدة</span><h2>اختيار الصيدلية</h2><p>بعد الاختيار ستظهر صفحة الطلبية الأصلية بجميع ميزاتها.</p></div>
                <span class="context-chip"><i class="ph ph-user"></i> ${escapeHtml(state.role === `rep` ? state.user.name : state.user.name)}</span>
            </div>
            <div class="prep-grid">
                ${state.role === `supervisor` ? `
                    <label><span>المندوب</span><select id="orderRepSelect"><option value="">اختر المندوب</option>${reps.map(rep => `<option value="${escapeHtml(rep.id)}">${escapeHtml(rep.name)}</option>`).join(``)}</select></label>
                ` : ``}
                <label class="pharmacy-search"><span>ابحث عن الصيدلية</span><div class="input-with-icon"><i class="ph ph-magnifying-glass"></i><input id="pharmacySearch" type="search" placeholder="اكتب اسم الصيدلية أو الكود"></div></label>
            </div>
            <div id="pharmacyResults" class="pharmacy-results"></div>
        </section>`;

    const input = byId(`pharmacySearch`);
    const results = byId(`pharmacyResults`);
    const draw = () => {
        const term = input.value.trim().toLocaleLowerCase(`ar`);
        const matches = state.pharmacies.filter(pharmacy => {
            const haystack = `${pharmacy.name || ``} ${pharmacyCode(pharmacy)}`.toLocaleLowerCase(`ar`);
            return !term || haystack.includes(term);
        }).slice(0, 60);
        results.innerHTML = matches.length ? matches.map(pharmacy => `
            <button type="button" class="pharmacy-option" data-pharmacy="${escapeHtml(pharmacy.id)}">
                <span class="pharmacy-mark"><i class="ph ph-first-aid-kit"></i></span>
                <span><strong>${escapeHtml(pharmacy.name)}</strong><small>${escapeHtml(pharmacyCode(pharmacy) || `بدون كود`)}</small></span>
                <i class="ph ph-arrow-left"></i>
            </button>`).join(``) : `<div class="empty-state"><i class="ph ph-magnifying-glass"></i><p>لا توجد نتائج مطابقة.</p></div>`;
        results.querySelectorAll(`[data-pharmacy]`).forEach(button => button.addEventListener(`click`, () => {
            const pharmacy = state.pharmacies.find(item => item.id === button.dataset.pharmacy);
            let rep = state.user;
            if (state.role === `supervisor`) rep = reps.find(item => item.id === byId(`orderRepSelect`).value);
            if (!rep) return showToast(`اختر المندوب أولاً.`, `error`);
            launchLegacyOrder(rep, pharmacy);
        }));
    };
    input.addEventListener(`input`, draw);
    draw();
}

function launchLegacyOrder(rep, pharmacy) {
    saveRepSession(rep);
    state.currentPharmacy = pharmacy;
    const isAdminOrder = state.role === `supervisor`;
    sessionStorage.setItem(`activeOrderContext`, JSON.stringify({
        repId: rep.id,
        repName: rep.name,
        pharmacyName: pharmacy.name,
        pharmacyCode: pharmacyCode(pharmacy),
        isAdminOrder,
        managerName: isAdminOrder ? state.user.name : ``
    }));
    if (isAdminOrder) sessionStorage.setItem(`adminOrderMode`, `1`);
    else sessionStorage.removeItem(`adminOrderMode`);
    state.pendingPilotOrder = {
        repId: rep.id,
        pharmacyName: pharmacy.name,
        startedAt: Date.now()
    };
    renderLegacyWorkspace(ROOT_ORDER_URL, `rep`);
}

function ensureRepresentativeContext() {
    saveRepSession(state.user);
    const context = JSON.parse(sessionStorage.getItem(`activeOrderContext`) || `null`);
    if (!context || context.repId !== state.user.id) {
        const fallbackPharmacy = state.pharmacies[0];
        if (fallbackPharmacy) {
            sessionStorage.setItem(`activeOrderContext`, JSON.stringify({
                repId: state.user.id,
                repName: state.user.name,
                pharmacyName: fallbackPharmacy.name,
                pharmacyCode: pharmacyCode(fallbackPharmacy),
                isAdminOrder: false,
                managerName: ``
            }));
        }
    }
}

function renderRepresentativeLegacySection(section) {
    ensureRepresentativeContext();
    renderLegacyWorkspace(ROOT_ORDER_URL, `rep`);
    const frame = byId(`workspaceFrame`);
    frame.addEventListener(`load`, () => {
        const target = frame.contentDocument;
        if (section === `my-orders`) {
            target.querySelector(`#navMyOrdersBtn`)?.click();
            setTimeout(() => injectSmartMyOrdersFilters(target), 200);
        } else {
            target.querySelector(`#navReportsBtn`)?.click();
        }
    }, { once: true });
}

function injectSmartMyOrdersFilters(target) {
    const anchor = target.querySelector(`#myOrdersDateFrom`)?.closest(`.filter-group`)?.parentElement
        || target.querySelector(`#myOrdersFilters`)
        || target.querySelector(`#myOrdersSection`);
    if (!anchor || target.querySelector(`.pilot-smart-filters`)) return;
    const wrapper = target.createElement(`div`);
    wrapper.className = `pilot-smart-filters`;
    wrapper.innerHTML = `
        <strong><i class="ph ph-magic-wand"></i> فلاتر سريعة</strong>
        <button type="button" data-range="today">طلبيات اليوم</button>
        <button type="button" data-range="month" class="active">طلبيات هذا الشهر</button>
        <button type="button" data-range="all">كل الطلبيات</button>`;
    anchor.prepend(wrapper);
    const applyRange = range => {
        const from = target.querySelector(`#myOrdersDateFrom`);
        const to = target.querySelector(`#myOrdersDateTo`);
        if (!from || !to) return;
        const today = new Date();
        if (range === `today`) {
            from.value = toDateInput(today);
            to.value = toDateInput(today);
        } else if (range === `month`) {
            from.value = toDateInput(new Date(today.getFullYear(), today.getMonth(), 1));
            to.value = toDateInput(today);
        } else {
            from.value = ``;
            to.value = ``;
        }
        [from, to].forEach(input => input.dispatchEvent(new Event(`change`, { bubbles: true })));
        wrapper.querySelectorAll(`button`).forEach(button => button.classList.toggle(`active`, button.dataset.range === range));
    };
    wrapper.querySelectorAll(`button`).forEach(button => button.addEventListener(`click`, () => applyRange(button.dataset.range)));
    applyRange(`month`);
}

function inventoryBadge(metrics) {
    if (metrics.total < 0) return `<span class="stock-badge danger">عجز</span>`;
    if (metrics.total === 0) return `<span class="stock-badge danger">نفد</span>`;
    if (metrics.expired) return `<span class="stock-badge danger">منتهي</span>`;
    if (metrics.expiring) return `<span class="stock-badge warning">قريب الانتهاء</span>`;
    if (metrics.total <= 100) return `<span class="stock-badge warning">منخفض</span>`;
    return `<span class="stock-badge success">متوفر</span>`;
}

function renderInventoryReport() {
    if (state.activeView !== `inventory`) return;
    const rows = state.products.map(product => ({ product, metrics: inventoryMetrics(product) }));
    const totalStock = rows.reduce((sum, row) => sum + row.metrics.total, 0);
    const low = rows.filter(row => row.metrics.total <= 100).length;
    const expiring = rows.filter(row => row.metrics.expired || row.metrics.expiring).length;
    dashboardContent.innerHTML = `
        <section class="content-panel inventory-report">
            <div class="section-heading">
                <div><span class="eyebrow">قراءة فقط</span><h2>تقرير أرصدة البضاعة</h2><p>الرصيد لا يتغير إلا بعد وصول الطلبية إلى حالة تمت الفوترة.</p></div>
                ${state.role === `manager` ? `<button id="exportInventoryBtn" class="secondary-btn" type="button"><i class="ph ph-file-xls"></i> تنزيل Excel</button>` : ``}
            </div>
            <div class="metric-grid compact">
                <article><i class="ph ph-package"></i><span>عدد الأصناف<strong>${rows.length.toLocaleString(`ar-JO`)}</strong></span></article>
                <article><i class="ph ph-stack"></i><span>إجمالي الوحدات<strong>${totalStock.toLocaleString(`ar-JO`)}</strong></span></article>
                <article><i class="ph ph-warning"></i><span>منخفض أو نافد<strong>${low.toLocaleString(`ar-JO`)}</strong></span></article>
                <article><i class="ph ph-calendar-warning"></i><span>انتهاء قريب/منتهي<strong>${expiring.toLocaleString(`ar-JO`)}</strong></span></article>
            </div>
            <div class="inventory-tools">
                <div class="input-with-icon"><i class="ph ph-magnifying-glass"></i><input id="inventorySearch" type="search" placeholder="بحث باسم الصنف أو الكود أو الباتش"></div>
                <select id="inventoryStatusFilter">
                    <option value="">كل الحالات</option><option value="available">متوفر</option><option value="low">منخفض أو نافد</option><option value="expiry">انتهاء قريب أو منتهي</option>
                </select>
            </div>
            <div class="table-scroll">
                <table class="inventory-table">
                    <thead><tr><th>كود الصنف</th><th>اسم الصنف</th><th>الرصيد</th><th>عدد الباتشات</th><th>أقرب انتهاء</th><th>الحالة</th></tr></thead>
                    <tbody id="inventoryRows"></tbody>
                </table>
            </div>
            <p class="read-only-note"><i class="ph ph-lock-key"></i> لا يمكن تعديل الأرصدة من أي من هذه الواجهات.</p>
        </section>`;

    const draw = () => {
        const term = byId(`inventorySearch`).value.trim().toLocaleLowerCase(`ar`);
        const status = byId(`inventoryStatusFilter`).value;
        const filtered = rows.filter(row => {
            const haystack = `${productCode(row.product)} ${row.product.name} ${row.metrics.batches.map(batch => batch.batchNo).join(` `)}`.toLocaleLowerCase(`ar`);
            const statusMatch = !status
                || (status === `available` && row.metrics.total > 100 && !row.metrics.expired && !row.metrics.expiring)
                || (status === `low` && row.metrics.total <= 100)
                || (status === `expiry` && (row.metrics.expired || row.metrics.expiring));
            return (!term || haystack.includes(term)) && statusMatch;
        });
        byId(`inventoryRows`).innerHTML = filtered.length ? filtered.map(row => `
            <tr>
                <td><span class="code-pill">${escapeHtml(productCode(row.product) || `—`)}</span></td>
                <td><strong>${escapeHtml(row.product.name)}</strong><small>${row.metrics.batches.map(batch => `${escapeHtml(batch.batchNo)}: ${batch.quantity.toLocaleString(`ar-JO`)}`).join(` · `)}</small></td>
                <td class="stock-number">${row.metrics.total.toLocaleString(`ar-JO`)}</td>
                <td>${row.metrics.batches.length.toLocaleString(`ar-JO`)}</td>
                <td>${row.metrics.nearestExpiry ? escapeHtml(formatDate(row.metrics.nearestExpiry)) : `—`}</td>
                <td>${inventoryBadge(row.metrics)}</td>
            </tr>`).join(``) : `<tr><td colspan="6"><div class="empty-state"><i class="ph ph-package"></i><p>لا توجد أصناف مطابقة.</p></div></td></tr>`;
    };
    byId(`inventorySearch`).addEventListener(`input`, draw);
    byId(`inventoryStatusFilter`).addEventListener(`change`, draw);
    byId(`exportInventoryBtn`)?.addEventListener(`click`, () => exportInventory(rows));
    draw();
}

function exportInventory(rows) {
    const data = [];
    rows.forEach(({ product, metrics }) => {
        metrics.batches.forEach(batch => data.push({
            [`كود الصنف`]: productCode(product),
            [`اسم الصنف`]: product.name,
            [`رقم الباتش`]: batch.batchNo,
            [`الكمية`]: batch.quantity,
            [`تاريخ الانتهاء`]: batch.expiryDate,
            [`إجمالي رصيد الصنف`]: metrics.total
        }));
    });
    const sheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, `أرصدة البضاعة`);
    XLSX.writeFile(workbook, `inventory-report-${toDateInput(new Date())}.xlsx`);
}

async function boot() {
    try {
        await loadReferenceData();
        startInventoryListener();
        startOrdersListener();
        startInventoryDeductionWorker();
    } catch (error) {
        console.error(error);
        showToast(`تعذر تحميل بيانات النظام. تحقق من الاتصال ثم أعد المحاولة.`, `error`);
    }
}

boot();
