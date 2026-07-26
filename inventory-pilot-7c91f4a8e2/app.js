import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    getDocs,
    addDoc,
    setDoc,
    doc,
    onSnapshot,
    query,
    where,
    writeBatch,
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

const INVENTORY_COLLECTION = `product_inventory_v1`;
const DEFAULT_STOCK = 1000;
const INVOICED_STATUSES = new Set([`orders_staff_hidden`, `orders_staff_invoiced_and_hidden_after_export`]);
const STATUS_LABELS = {
    pending: `بانتظار المشرف`,
    pending_supervisor_approval: `بانتظار المشرف`,
    returned_to_rep: `معادة للمندوب`,
    market_manager_pending: `بانتظار مدير السوق`,
    market_manager_approved: `موافقة مدير السوق`,
    finance_pending: `بانتظار المالية`,
    finance_approved: `موافقة المالية`,
    orders_staff_pending: `جاهزة للمعالجة`,
    orders_staff_exported: `تم تصديرها`,
    orders_staff_hidden: `تمت الفوترة`,
    orders_staff_invoiced_and_hidden_after_export: `تمت الفوترة`,
    returned: `مرتجع`,
    rejected: `مرفوضة`
};

const state = {
    role: null,
    user: null,
    reps: [],
    pharmacies: [],
    products: [],
    inventory: new Map(),
    orders: [],
    activeView: null,
    unsubOrders: null,
    unsubInventory: null,
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
const productModal = byId(`productModal`);
const templateUpload = byId(`templateUpload`);
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

function showToast(message, type = ``) {
    const toast = document.createElement(`div`);
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    byId(`toastContainer`).appendChild(toast);
    setTimeout(() => toast.remove(), 3800);
}

function updateNetworkState() {
    document.body.classList.toggle(`offline`, !navigator.onLine);
}

window.addEventListener(`online`, updateNetworkState);
window.addEventListener(`offline`, updateNetworkState);
updateNetworkState();

function stockFor(product) {
    return state.inventory.get(product.id)?.stock ?? DEFAULT_STOCK;
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

function formatDate(value) {
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value || 0);
    if (Number.isNaN(date.getTime())) return `-`;
    return new Intl.DateTimeFormat(`ar-JO`, { dateStyle: `medium`, timeStyle: `short` }).format(date);
}

async function loadReferenceData() {
    const [repsSnap, pharmaciesSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, `reps`)),
        getDocs(collection(db, `pharmacies`)),
        getDocs(collection(db, `products`))
    ]);

    state.reps = repsSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
    state.pharmacies = pharmaciesSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
    state.products = productsSnap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
}

function startInventoryListener() {
    if (state.unsubInventory) state.unsubInventory();
    state.unsubInventory = onSnapshot(collection(db, INVENTORY_COLLECTION), snapshot => {
        state.inventory = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]));
        if ([`inventory`, `order`].includes(state.activeView)) renderActiveView();
    }, error => {
        console.error(error);
        showToast(`تعذر تحميل أرصدة المخزون.`, `error`);
    });
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
                    showToast(`تعذر خصم مخزون طلبية مفوترة. ستتم إعادة المحاولة تلقائياً.`, `error`);
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
            const id = match?.id || safeDocumentId(item.productCode || item.name || `unknown`);
            const quantity = numberValue(item.qty) + numberValue(item.bonus);
            const current = grouped.get(id) || { product: match || item, quantity: 0 };
            current.quantity += quantity;
            grouped.set(id, current);
        });

        const rows = [...grouped.entries()].filter(([, row]) => row.quantity > 0);
        const snapshots = await Promise.all(rows.map(([id]) => transaction.get(doc(db, INVENTORY_COLLECTION, id))));
        let shortageDetected = false;

        rows.forEach(([id, row], index) => {
            const inventoryRef = doc(db, INVENTORY_COLLECTION, id);
            const existing = snapshots[index].exists() ? snapshots[index].data() : {};
            const currentStock = numberValue(existing.stock ?? DEFAULT_STOCK);
            const newStock = currentStock - row.quantity;
            if (newStock < 0) shortageDetected = true;
            transaction.set(inventoryRef, {
                productId: id,
                productCode: productCode(row.product),
                productName: row.product.name || ``,
                stock: newStock,
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

function safeDocumentId(value) {
    const normalized = String(value || `product`).trim().replace(/[/.#$[\]]/g, `-`).replace(/\s+/g, `-`).slice(0, 120);
    return normalized || `product-${Date.now()}`;
}

roleButtons.forEach(button => {
    button.addEventListener(`click`, () => chooseRole(button.dataset.role));
});

function chooseRole(role) {
    if (role === `rep`) return showRepSelection();
    if (role === `supervisor`) return showSupervisorSelection();
    enterDashboard(`manager`, { id: `reports`, name: `لوحة التقارير` });
}

function showRepSelection() {
    selectionModalContent.innerHTML = `
        <div class="modal-heading">
            <span class="modal-icon"><i class="ph ph-user-circle"></i></span>
            <div><h2>اختر اسم المندوب</h2><p>سيتم عرض طلبيات المندوب المحدد فقط.</p></div>
        </div>
        <div class="selection-list">
            ${state.reps.map(rep => `<button class="selection-btn" data-rep-id="${escapeHtml(rep.id)}" type="button"><span>${escapeHtml(rep.name || `مندوب`)}</span><i class="ph ph-arrow-left"></i></button>`).join(``)}
        </div>
    `;
    selectionModal.hidden = false;
    selectionModalContent.querySelectorAll(`[data-rep-id]`).forEach(button => {
        button.addEventListener(`click`, () => {
            const rep = state.reps.find(item => item.id === button.dataset.repId);
            if (rep) enterDashboard(`rep`, rep);
        });
    });
}

function showSupervisorSelection() {
    const supervisors = [
        { id: `abdullah`, name: `عبدالله الناطور` },
        { id: `mohammad`, name: `محمد طوالبه` }
    ];
    selectionModalContent.innerHTML = `
        <div class="modal-heading">
            <span class="modal-icon"><i class="ph ph-users-three"></i></span>
            <div><h2>اختر اسم المشرف</h2><p>سيتم تسجيل الاسم تلقائياً على الطلبية.</p></div>
        </div>
        <div class="selection-list">
            ${supervisors.map(user => `<button class="selection-btn" data-supervisor-id="${user.id}" type="button"><span>${user.name}</span><i class="ph ph-arrow-left"></i></button>`).join(``)}
        </div>
    `;
    selectionModal.hidden = false;
    selectionModalContent.querySelectorAll(`[data-supervisor-id]`).forEach(button => {
        button.addEventListener(`click`, () => {
            const user = supervisors.find(item => item.id === button.dataset.supervisorId);
            if (user) enterDashboard(`supervisor`, user);
        });
    });
}

function enterDashboard(role, user) {
    state.role = role;
    state.user = user;
    selectionModal.hidden = true;
    roleScreen.hidden = true;
    dashboardScreen.hidden = false;
    homeBtn.hidden = false;
    activeUserBadge.hidden = false;
    activeUserBadge.textContent = user.name;
    renderNavigation();
    startOrdersListener();
    setView(role === `manager` ? `reports` : `orders`);
}

function leaveDashboard() {
    state.role = null;
    state.user = null;
    state.orders = [];
    if (state.unsubOrders) state.unsubOrders();
    state.unsubOrders = null;
    dashboardScreen.hidden = true;
    roleScreen.hidden = false;
    homeBtn.hidden = true;
    activeUserBadge.hidden = true;
    dashboardContent.innerHTML = ``;
}

homeBtn.addEventListener(`click`, leaveDashboard);
document.querySelector(`[data-close-modal]`).addEventListener(`click`, () => selectionModal.hidden = true);
document.querySelector(`[data-close-product]`).addEventListener(`click`, () => productModal.hidden = true);
selectionModal.addEventListener(`click`, event => { if (event.target === selectionModal) selectionModal.hidden = true; });
productModal.addEventListener(`click`, event => { if (event.target === productModal) productModal.hidden = true; });

function navigationItems() {
    if (state.role === `manager`) {
        return [
            { id: `reports`, icon: `ph-chart-line-up`, label: `لوحة التقارير` },
            { id: `inventory`, icon: `ph-package`, label: `أرصدة البضاعة` }
        ];
    }
    return [
        { id: `orders`, icon: `ph-receipt`, label: state.role === `rep` ? `طلبياتي` : `الطلبيات` },
        { id: `inventory`, icon: `ph-package`, label: `أرصدة البضاعة` },
        { id: `order`, icon: `ph-plus-circle`, label: `طلبية جديدة` }
    ];
}

function renderNavigation() {
    dashboardNav.innerHTML = navigationItems().map(item => `
        <button class="nav-btn" data-view="${item.id}" type="button"><i class="ph ${item.icon}"></i>${item.label}</button>
    `).join(``);
    dashboardNav.querySelectorAll(`[data-view]`).forEach(button => button.addEventListener(`click`, () => setView(button.dataset.view)));
}

function setView(view) {
    state.activeView = view;
    dashboardNav.querySelectorAll(`[data-view]`).forEach(button => button.classList.toggle(`active`, button.dataset.view === view));
    renderActiveView();
}

function renderActiveView() {
    if (state.activeView === `inventory`) return renderInventory();
    if (state.activeView === `order`) return renderOrderEntry();
    if (state.activeView === `reports`) return renderReports();
    renderOrders();
}

function startOrdersListener() {
    if (state.unsubOrders) state.unsubOrders();
    const source = state.role === `rep`
        ? query(collection(db, `orders`), where(`repId`, `==`, state.user.id))
        : collection(db, `orders`);
    state.unsubOrders = onSnapshot(source, snapshot => {
        state.orders = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .sort((a, b) => timestampNumber(b.createdAt) - timestampNumber(a.createdAt));
        if (state.activeView === `orders`) renderOrders();
    }, error => {
        console.error(error);
        showToast(`تعذر تحميل الطلبيات.`, `error`);
    });
}

function timestampNumber(value) {
    if (value?.toMillis) return value.toMillis();
    const date = new Date(value || 0);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function renderOrders() {
    const total = state.orders.reduce((sum, order) => sum + numberValue(order.grandTotal), 0);
    const invoiced = state.orders.filter(order => INVOICED_STATUSES.has(effectiveStatus(order))).length;
    const visible = state.orders.slice(0, 100);
    dashboardContent.innerHTML = `
        <section class="page-section">
            <div class="section-head">
                <div><h2>${state.role === `rep` ? `طلبياتي` : `متابعة الطلبيات`}</h2><p>آخر 100 طلبية مرتبة من الأحدث إلى الأقدم.</p></div>
                <button class="primary-btn" data-new-order type="button"><i class="ph ph-plus-circle"></i> طلبية جديدة</button>
            </div>
            <div class="stats-grid">
                <div class="stat-card"><i class="ph ph-receipt"></i><span>عدد الطلبيات</span><strong>${state.orders.length.toLocaleString(`en-US`)}</strong></div>
                <div class="stat-card"><i class="ph ph-check-circle"></i><span>تمت الفوترة</span><strong>${invoiced.toLocaleString(`en-US`)}</strong></div>
                <div class="stat-card"><i class="ph ph-coins"></i><span>القيمة الإجمالية</span><strong>${total.toLocaleString(`en-US`, { maximumFractionDigits: 2 })}</strong></div>
                <div class="stat-card"><i class="ph ph-package"></i><span>عدد الأصناف</span><strong>${state.products.length.toLocaleString(`en-US`)}</strong></div>
            </div>
            <div class="panel">
                <div class="filter-row"><input id="ordersSearch" class="input" type="search" placeholder="ابحث بالصيدلية، المندوب، أو رقم الطلبية..."><button class="secondary-btn" data-refresh-orders type="button"><i class="ph ph-arrows-clockwise"></i> تحديث</button></div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>المرجع</th><th>التاريخ</th><th>الصيدلية</th><th>المندوب</th><th>الأصناف</th><th>الإجمالي</th><th>الحالة</th><th>المخزون</th></tr></thead>
                        <tbody id="ordersRows">${ordersRows(visible)}</tbody>
                    </table>
                </div>
            </div>
        </section>
    `;
    dashboardContent.querySelector(`[data-new-order]`).addEventListener(`click`, () => setView(`order`));
    dashboardContent.querySelector(`[data-refresh-orders]`).addEventListener(`click`, () => renderOrders());
    byId(`ordersSearch`).addEventListener(`input`, event => {
        const term = event.target.value.trim().toLowerCase();
        const filtered = state.orders.filter(order => [order.id, order.pharmacyName, order.repName].some(value => String(value || ``).toLowerCase().includes(term))).slice(0, 100);
        byId(`ordersRows`).innerHTML = ordersRows(filtered);
    });
}

function ordersRows(orders) {
    if (!orders.length) return `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-receipt"></i>لا توجد طلبيات</div></td></tr>`;
    return orders.map(order => {
        const status = effectiveStatus(order);
        const inventoryState = order.inventoryPilot !== true ? `—` : order.inventoryDeducted === true ? `تم الخصم` : INVOICED_STATUSES.has(status) ? `جارٍ الخصم` : `بانتظار الفوترة`;
        return `
            <tr>
                <td>${escapeHtml(order.id.slice(0, 7).toUpperCase())}</td>
                <td>${escapeHtml(formatDate(order.createdAt))}</td>
                <td>${escapeHtml(order.pharmacyName || `-`)}</td>
                <td>${escapeHtml(order.repName || `-`)}</td>
                <td>${Array.isArray(order.items) ? order.items.length : 0}</td>
                <td>${numberValue(order.grandTotal).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td><span class="status">${escapeHtml(STATUS_LABELS[status] || status || `-`)}</span></td>
                <td>${inventoryState}</td>
            </tr>
        `;
    }).join(``);
}

function renderInventory() {
    const stocks = state.products.map(product => stockFor(product));
    const totalUnits = stocks.reduce((sum, value) => sum + value, 0);
    const lowStock = stocks.filter(value => value < 200).length;
    dashboardContent.innerHTML = `
        <section class="page-section">
            <div class="section-head">
                <div><h2>أرصدة البضاعة</h2><p>الرصيد الافتراضي 1000، ولا يتم الخصم إلا بعد الفوترة.</p></div>
                ${state.role === `manager` ? `
                    <div class="toolbar">
                        <button class="secondary-btn" data-download-template type="button"><i class="ph ph-file-xls"></i> تنزيل Template</button>
                        <button class="secondary-btn" data-upload-template type="button"><i class="ph ph-upload-simple"></i> رفع الملف</button>
                        <button class="primary-btn" data-add-product type="button"><i class="ph ph-plus-circle"></i> إضافة صنف</button>
                    </div>
                ` : ``}
            </div>
            <div class="stats-grid">
                <div class="stat-card"><i class="ph ph-package"></i><span>عدد الأصناف</span><strong>${state.products.length.toLocaleString(`en-US`)}</strong></div>
                <div class="stat-card"><i class="ph ph-stack"></i><span>إجمالي الوحدات</span><strong>${totalUnits.toLocaleString(`en-US`)}</strong></div>
                <div class="stat-card"><i class="ph ph-warning"></i><span>أرصدة أقل من 200</span><strong>${lowStock.toLocaleString(`en-US`)}</strong></div>
                <div class="stat-card"><i class="ph ph-check-fat"></i><span>قاعدة الخصم</span><strong>بعد الفوترة</strong></div>
            </div>
            <div class="panel">
                <div class="filter-row"><input id="inventorySearch" class="input" type="search" placeholder="ابحث باسم الصنف أو الكود..."><span></span></div>
                <div class="table-wrap">
                    <table>
                        <thead><tr><th>كود الصنف</th><th>اسم الصنف</th><th>السعر</th><th>الرصيد الحالي</th>${state.role === `manager` ? `<th>تحديث الرصيد</th>` : ``}<th>آخر تحديث</th></tr></thead>
                        <tbody id="inventoryRows">${inventoryRows(state.products)}</tbody>
                    </table>
                </div>
            </div>
        </section>
    `;

    byId(`inventorySearch`).addEventListener(`input`, event => {
        const term = event.target.value.trim().toLowerCase();
        const filtered = state.products.filter(product => [product.name, productCode(product)].some(value => String(value || ``).toLowerCase().includes(term)));
        byId(`inventoryRows`).innerHTML = inventoryRows(filtered);
        bindInventoryActions();
    });

    if (state.role === `manager`) {
        dashboardContent.querySelector(`[data-add-product]`).addEventListener(`click`, () => productModal.hidden = false);
        dashboardContent.querySelector(`[data-download-template]`).addEventListener(`click`, downloadInventoryTemplate);
        dashboardContent.querySelector(`[data-upload-template]`).addEventListener(`click`, () => templateUpload.click());
        bindInventoryActions();
    }
}

function inventoryRows(products) {
    if (!products.length) {
        return `<tr><td colspan="${state.role === `manager` ? 6 : 5}"><div class="empty-state"><i class="ph ph-package"></i>لا توجد أصناف</div></td></tr>`;
    }
    return products.map(product => {
        const stock = stockFor(product);
        const inventory = state.inventory.get(product.id);
        const stockClass = stock < 0 ? `negative` : stock < 200 ? `low` : ``;
        return `
            <tr>
                <td>${escapeHtml(productCode(product) || `-`)}</td>
                <td><strong>${escapeHtml(product.name || `-`)}</strong></td>
                <td>${numberValue(product.price).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td><span class="stock-pill ${stockClass}">${stock.toLocaleString(`en-US`)}</span></td>
                ${state.role === `manager` ? `
                    <td><div class="stock-editor"><input data-stock-input="${escapeHtml(product.id)}" type="number" step="1" min="0" value="${stock}"><button data-save-stock="${escapeHtml(product.id)}" type="button"><i class="ph ph-check"></i></button></div></td>
                ` : ``}
                <td>${inventory?.updatedAt ? escapeHtml(formatDate(inventory.updatedAt)) : `الرصيد الافتراضي`}</td>
            </tr>
        `;
    }).join(``);
}

function bindInventoryActions() {
    dashboardContent.querySelectorAll(`[data-save-stock]`).forEach(button => {
        button.addEventListener(`click`, async () => {
            const product = state.products.find(item => item.id === button.dataset.saveStock);
            const input = dashboardContent.querySelector(`[data-stock-input="${CSS.escape(button.dataset.saveStock)}"]`);
            if (!product || !input) return;
            const stock = numberValue(input.value);
            if (stock < 0) return showToast(`لا يمكن إدخال رصيد سالب يدوياً.`, `error`);
            await saveStock(product, stock, `manual`);
            showToast(`تم تحديث رصيد ${product.name}.`, `success`);
        });
    });
}

async function saveStock(product, stock, source) {
    await setDoc(doc(db, INVENTORY_COLLECTION, product.id), {
        productId: product.id,
        productCode: productCode(product),
        productName: product.name || ``,
        stock,
        updateSource: source,
        updatedBy: state.user?.name || `Manager`,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

byId(`productForm`).addEventListener(`submit`, async event => {
    event.preventDefault();
    const code = byId(`newProductCode`).value.trim();
    const name = byId(`newProductName`).value.trim();
    const price = numberValue(byId(`newProductPrice`).value);
    const stock = numberValue(byId(`newProductStock`).value);
    if (!code || !name || stock < 0) return showToast(`أكمل بيانات الصنف بشكل صحيح.`, `error`);

    const duplicate = state.products.some(product => productCode(product).toLowerCase() === code.toLowerCase() || String(product.name || ``).toLowerCase() === name.toLowerCase());
    if (duplicate) return showToast(`الصنف أو الكود موجود مسبقاً.`, `error`);

    const id = safeDocumentId(code);
    await setDoc(doc(db, `products`, id), { name, productCode: code, price });
    const product = { id, name, productCode: code, price };
    await saveStock(product, stock, `new_product`);
    state.products.push(product);
    state.products.sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
    productModal.hidden = true;
    event.target.reset();
    byId(`newProductStock`).value = `1000`;
    showToast(`تمت إضافة الصنف بنجاح.`, `success`);
    renderInventory();
});

function downloadInventoryTemplate() {
    if (!window.XLSX) return showToast(`تعذر تحميل أداة Excel.`, `error`);
    const rows = state.products.map(product => ({
        [`Product Code`]: productCode(product),
        [`Product Name`]: product.name || ``,
        [`Price`]: numberValue(product.price),
        [`Stock`]: stockFor(product)
    }));
    if (!rows.length) rows.push({ [`Product Code`]: `P001`, [`Product Name`]: `Example Product`, [`Price`]: 0, [`Stock`]: 1000 });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet[`!cols`] = [{ wch: 18 }, { wch: 42 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, `Inventory`);
    XLSX.writeFile(workbook, `Inventory_Template.xlsx`);
}

templateUpload.addEventListener(`change`, async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: `array` });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: `` });
        await importInventoryRows(rows);
        showToast(`تم رفع وتحديث ${rows.length} صفاً.`, `success`);
    } catch (error) {
        console.error(error);
        showToast(`الملف غير صالح أو عناوين الأعمدة غير صحيحة.`, `error`);
    } finally {
        templateUpload.value = ``;
    }
});

async function importInventoryRows(rows) {
    const normalized = rows.map((row, index) => ({
        rowNumber: index + 2,
        code: String(row[`Product Code`] ?? row[`كود الصنف`] ?? ``).trim(),
        name: String(row[`Product Name`] ?? row[`اسم الصنف`] ?? ``).trim(),
        price: numberValue(row[`Price`] ?? row[`السعر`] ?? 0),
        stock: numberValue(row[`Stock`] ?? row[`الرصيد`] ?? DEFAULT_STOCK)
    }));
    if (!normalized.length || normalized.some(row => !row.code || !row.name || row.stock < 0)) {
        throw new Error(`Invalid inventory rows`);
    }

    for (let start = 0; start < normalized.length; start += 200) {
        const batch = writeBatch(db);
        normalized.slice(start, start + 200).forEach(row => {
            const existing = state.products.find(product => productCode(product).toLowerCase() === row.code.toLowerCase() || String(product.name || ``).toLowerCase() === row.name.toLowerCase());
            const id = existing?.id || safeDocumentId(row.code);
            batch.set(doc(db, `products`, id), { name: row.name, productCode: row.code, price: row.price }, { merge: true });
            batch.set(doc(db, INVENTORY_COLLECTION, id), {
                productId: id,
                productCode: row.code,
                productName: row.name,
                stock: row.stock,
                updateSource: `template_import`,
                updatedBy: state.user?.name || `Manager`,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();
    }
    await loadReferenceData();
    renderInventory();
}

function renderOrderEntry() {
    dashboardContent.innerHTML = `
        <section class="page-section">
            <div class="section-head"><div><h2>إدخال طلبية جديدة</h2><p>${state.role === `supervisor` ? `اختر الصيدلية وسيظهر اسم المندوب تلقائياً.` : `أدخل طلبية باسم المندوب المحدد.`}</p></div></div>
            <form id="orderForm" class="order-layout">
                <div class="panel">
                    <div class="order-grid">
                        <label>الصيدلية
                            <select id="orderPharmacy" required>
                                <option value="">اختر الصيدلية</option>
                                ${availablePharmacies().map(pharmacy => `<option value="${escapeHtml(pharmacy.id)}">${escapeHtml(pharmacy.name || `-`)}${pharmacyCode(pharmacy) ? ` — ${escapeHtml(pharmacyCode(pharmacy))}` : ``}</option>`).join(``)}
                            </select>
                        </label>
                        <label>المندوب<input id="orderRepName" value="${state.role === `rep` ? escapeHtml(state.user.name || ``) : ``}" readonly placeholder="يظهر تلقائياً بعد اختيار الصيدلية"></label>
                        <label class="wide">ملاحظة الطلبية<textarea id="orderNote" rows="2" placeholder="ملاحظة اختيارية..."></textarea></label>
                    </div>
                    <div class="line-items" id="lineItems"></div>
                    <button class="secondary-btn" id="addLineBtn" type="button"><i class="ph ph-plus"></i> إضافة صنف</button>
                </div>
                <aside class="panel order-summary">
                    <h3>ملخص الطلبية</h3>
                    <div class="summary-row"><span>عدد الأصناف</span><strong id="summaryItems">0</strong></div>
                    <div class="summary-row"><span>إجمالي الكمية</span><strong id="summaryQty">0</strong></div>
                    <div class="summary-row"><span>إجمالي البونص</span><strong id="summaryBonus">0</strong></div>
                    <div class="summary-total"><span>الإجمالي</span><strong><span id="summaryTotal">0.00</span> د.ا</strong></div>
                    <button class="primary-btn full-btn" type="submit"><i class="ph ph-paper-plane-tilt"></i> إرسال الطلبية</button>
                </aside>
            </form>
        </section>
    `;

    byId(`orderPharmacy`).addEventListener(`change`, updateOrderRepresentative);
    byId(`addLineBtn`).addEventListener(`click`, () => addOrderLine());
    byId(`orderForm`).addEventListener(`submit`, submitOrder);
    addOrderLine();
}

function availablePharmacies() {
    if (state.role !== `rep`) return state.pharmacies;
    return state.pharmacies.filter(pharmacy => String(pharmacy.rep_id || pharmacy.repId || ``) === String(state.user.id));
}

function updateOrderRepresentative() {
    if (state.role === `rep`) return;
    const pharmacy = state.pharmacies.find(item => item.id === byId(`orderPharmacy`).value);
    const repId = pharmacy?.rep_id || pharmacy?.repId || ``;
    const rep = state.reps.find(item => String(item.id) === String(repId));
    byId(`orderRepName`).value = rep?.name || ``;
    byId(`orderRepName`).dataset.repId = rep?.id || ``;
    if (pharmacy && !rep) showToast(`هذه الصيدلية غير مرتبطة بمندوب.`, `error`);
}

function addOrderLine(prefill = {}) {
    const line = document.createElement(`div`);
    line.className = `line-item`;
    line.innerHTML = `
        <label class="product-field">الصنف
            <select class="line-product" required>
                <option value="">اختر الصنف</option>
                ${state.products.map(product => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name || `-`)}${productCode(product) ? ` — ${escapeHtml(productCode(product))}` : ``}</option>`).join(``)}
            </select>
            <span class="line-stock">الرصيد: —</span>
        </label>
        <label>الكمية<input class="line-qty" type="number" min="1" step="1" value="${numberValue(prefill.qty) || 1}" required></label>
        <label>البونص<input class="line-bonus" type="number" min="0" step="1" value="${numberValue(prefill.bonus)}"></label>
        <label>السعر<input class="line-price" type="number" min="0" step="0.01" value="0" readonly></label>
        <button class="remove-line" type="button" title="حذف"><i class="ph ph-trash"></i></button>
    `;
    byId(`lineItems`).appendChild(line);
    const productSelect = line.querySelector(`.line-product`);
    productSelect.addEventListener(`change`, () => {
        const product = state.products.find(item => item.id === productSelect.value);
        line.querySelector(`.line-price`).value = numberValue(product?.price).toFixed(2);
        line.querySelector(`.line-stock`).textContent = `الرصيد: ${product ? stockFor(product).toLocaleString(`en-US`) : `—`}`;
        updateOrderSummary();
    });
    line.querySelectorAll(`input`).forEach(input => input.addEventListener(`input`, updateOrderSummary));
    line.querySelector(`.remove-line`).addEventListener(`click`, () => {
        if (byId(`lineItems`).children.length === 1) return showToast(`يجب أن تحتوي الطلبية على صنف واحد على الأقل.`, `error`);
        line.remove();
        updateOrderSummary();
    });
    updateOrderSummary();
}

function collectOrderItems() {
    return [...document.querySelectorAll(`.line-item`)].map(line => {
        const product = state.products.find(item => item.id === line.querySelector(`.line-product`).value);
        const qty = numberValue(line.querySelector(`.line-qty`).value);
        const bonus = numberValue(line.querySelector(`.line-bonus`).value);
        const price = numberValue(line.querySelector(`.line-price`).value);
        return {
            productId: product?.id || ``,
            productCode: productCode(product),
            name: product?.name || ``,
            qty,
            bonus,
            price,
            total: qty * price
        };
    });
}

function updateOrderSummary() {
    const items = collectOrderItems();
    byId(`summaryItems`).textContent = items.filter(item => item.name).length;
    byId(`summaryQty`).textContent = items.reduce((sum, item) => sum + item.qty, 0).toLocaleString(`en-US`);
    byId(`summaryBonus`).textContent = items.reduce((sum, item) => sum + item.bonus, 0).toLocaleString(`en-US`);
    byId(`summaryTotal`).textContent = items.reduce((sum, item) => sum + item.total, 0).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function submitOrder(event) {
    event.preventDefault();
    const pharmacy = state.pharmacies.find(item => item.id === byId(`orderPharmacy`).value);
    const rep = state.role === `rep`
        ? state.user
        : state.reps.find(item => item.id === byId(`orderRepName`).dataset.repId);
    const items = collectOrderItems();

    if (!pharmacy || !rep) return showToast(`اختر صيدلية مرتبطة بمندوب.`, `error`);
    if (!items.length || items.some(item => !item.productId || item.qty < 1 || item.bonus < 0)) return showToast(`راجع الأصناف والكميات.`, `error`);

    const exceedsStock = items.find(item => item.qty + item.bonus > stockFor(state.products.find(product => product.id === item.productId)));
    if (exceedsStock) return showToast(`كمية ${exceedsStock.name} أكبر من الرصيد المتاح.`, `error`);

    const isSupervisor = state.role === `supervisor`;
    const initialStatus = isSupervisor ? `market_manager_pending` : `pending_supervisor_approval`;
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

    await addDoc(collection(db, `orders`), {
        repId: rep.id,
        repName: rep.name || ``,
        pharmacyName: pharmacy.name || ``,
        pharmacyCode: pharmacyCode(pharmacy),
        items,
        grandTotal,
        orderNote: byId(`orderNote`).value.trim(),
        status: initialStatus,
        previousStatus: ``,
        workflowStage: isSupervisor ? `market_manager` : `supervisor`,
        supervisorStatus: isSupervisor ? `supervisor_approved` : `pending_supervisor_approval`,
        marketManagerStatus: isSupervisor ? `market_manager_pending` : ``,
        financeStatus: ``,
        orderStaffStatus: ``,
        managerName: isSupervisor ? state.user.name : ``,
        inventoryPilot: true,
        inventoryDeducted: false,
        createdAt: serverTimestamp(),
        auditTrail: [{
            action: `order_created`,
            actor: state.user.name || ``,
            role: isSupervisor ? `supervisor` : `representative`,
            createdAt: new Date().toISOString(),
            newStatus: initialStatus
        }]
    });

    showToast(`تم إرسال الطلبية بنجاح دون خصم المخزون.`, `success`);
    setView(`orders`);
}

function renderReports() {
    dashboardContent.innerHTML = `
        <section class="page-section">
            <div class="section-head"><div><h2>لوحة التقارير</h2><p>نفس لوحة التقارير الحالية، مع تبويب مستقل لأرصدة البضاعة.</p></div><button class="secondary-btn" data-open-reports type="button"><i class="ph ph-arrow-square-out"></i> فتح بصفحة كاملة</button></div>
            <iframe class="report-frame" src="../reports.html" title="لوحة التقارير"></iframe>
        </section>
    `;
    dashboardContent.querySelector(`[data-open-reports]`).addEventListener(`click`, () => window.open(`../reports.html`, `_blank`, `noopener`));
}

async function boot() {
    roleButtons.forEach(button => button.disabled = true);
    try {
        await loadReferenceData();
        startInventoryListener();
        startInventoryDeductionWorker();
        roleButtons.forEach(button => button.disabled = false);
    } catch (error) {
        console.error(error);
        showToast(`تعذر تحميل بيانات النظام. تحقق من الاتصال وصلاحيات Firebase.`, `error`);
    }
}

boot();
