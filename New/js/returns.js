import { db, collection, getDocs, query, where, addDoc, doc, updateDoc, deleteDoc } from './firebase.js';

const RETURNS = `new_returns`;
const SALES = `new_sales_batch_balances`;
const ORDERS = `orders`;
const ACTIVE_RETURN_STATUSES = new Set([`pending_supervisor_approval`, `market_manager_pending`, `approved`]);
const STATUS_LABELS = {
    pending_supervisor_approval: `بانتظار موافقة المشرف`, market_manager_pending: `بانتظار مدير السوق`, approved: `معتمد نهائيًا`,
    supervisor_rejected: `مرفوض من المشرف`, market_manager_rejected: `مرفوض من مدير السوق`
};
const REP_MANAGER_MAP = { 'مراد عمر':'محمد طوالبه','مؤيد الزعبي':'محمد طوالبه','محمد عبدربه':'محمد طوالبه','محمد الفاعوري':'عبدالله الناطور','اجود التلهوني':'عبدالله الناطور','يزيد الرقب':'محمد طوالبه','تامر عقل':'محمد طوالبه','محمد ابو يامين':'عبدالله الناطور','مراد الظاهر':'عبدالله الناطور' };
const $ = id => document.getElementById(id);
const text = value => String(value ?? ``).trim();
const normalize = value => text(value).toLowerCase();
const number = value => {
    const parsed = Number(String(value ?? ``).replace(/,/g, ``).replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit))));
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatMoney = value => number(value).toLocaleString(`en-US`, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const escapeHtml = value => text(value).replace(/&/g, `&amp;`).replace(/</g, `&lt;`).replace(/>/g, `&gt;`).replace(/"/g, `&quot;`).replace(/'/g, `&#039;`);
const dateText = value => {
    const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? `-` : date.toLocaleString(`en-GB`);
};

let context = null;
let salesMap = new Map();
let editingReturnId = ``;
let currentRows = [];

function showBanner(message, type = `info`) {
    const banner = $(`pageBanner`); if (!banner) return;
    banner.className = `returns-banner show ${type}`; banner.textContent = message;
}

function readRepContext() {
    try {
        const active = JSON.parse(sessionStorage.getItem(`activeOrderContext`) || `null`);
        if (active?.repName) return active;
    } catch (_) {}
    return { repId: sessionStorage.getItem(`repId`) || ``, repName: sessionStorage.getItem(`repName`) || ``, pharmacyName: ``, pharmacyCode: `` };
}

function readAdminSession() {
    for (const storage of [localStorage, sessionStorage]) {
        try { const session = JSON.parse(storage.getItem(`dad_admin_session_v2`) || `null`); if (session) return session; } catch (_) {}
    }
    return null;
}

function isInvoiced(order = {}) {
    return order.isInvoiced === true || order.hiddenByOrderStaff === true || Boolean(order.invoicedAt) || [`orders_staff_hidden`, `orders_staff_invoiced_and_hidden_after_export`].includes(normalize(order.status || order.orderStaffStatus));
}

function saleKey(row) { return `${normalize(row.invoiceNumber)}__${normalize(row.productCode || row.productName)}__${normalize(row.batch)}__${number(row.unitPrice)}`; }

function addSale(row) {
    if (!row.batch || number(row.soldQty) <= 0) return;
    const key = saleKey(row);
    const existing = salesMap.get(key) || { invoiceNumber: text(row.invoiceNumber), productCode: text(row.productCode), productName: text(row.productName), batch: text(row.batch), unitPrice: number(row.unitPrice), soldQty: 0, usedQty: 0 };
    existing.soldQty += number(row.soldQty); salesMap.set(key, existing);
}

async function loadReturnableSales() {
    salesMap = new Map();
    const pharmacyCode = text(context.pharmacyCode);
    if (!pharmacyCode) throw new Error(`لا يوجد كود صيدلية في جلسة المندوب.`);
    const [historicalSnap, ordersSnap, returnsSnap] = await Promise.all([
        getDocs(query(collection(db, SALES), where(`pharmacyCode`, `==`, pharmacyCode))),
        getDocs(query(collection(db, ORDERS), where(`pharmacyCode`, `==`, pharmacyCode))),
        getDocs(query(collection(db, RETURNS), where(`pharmacyCode`, `==`, pharmacyCode)))
    ]);
    historicalSnap.forEach(item => addSale(item.data()));
    ordersSnap.forEach(item => {
        const order = item.data(); if (!isInvoiced(order)) return;
        (Array.isArray(order.items) ? order.items : []).forEach(line => addSale({ invoiceNumber: order.invoiceNumber, productCode: line.productCode, productName: line.name, batch: line.batch, soldQty: line.qty, unitPrice: line.price }));
    });
    returnsSnap.forEach(item => {
        const returned = item.data(); if (!ACTIVE_RETURN_STATUSES.has(returned.status)) return;
        (Array.isArray(returned.items) ? returned.items : []).forEach(line => {
            const key = saleKey(line); const sale = salesMap.get(key); if (sale) sale.usedQty += number(line.qty);
        });
    });
    salesMap.forEach(sale => sale.availableQty = Math.max(0, sale.soldQty - sale.usedQty));
}

function productOptions() {
    const products = new Map();
    salesMap.forEach(sale => { if (sale.availableQty > 0) products.set(normalize(sale.productCode || sale.productName), { code: sale.productCode, name: sale.productName }); });
    return [...products.values()].sort((a, b) => a.name.localeCompare(b.name, `ar`));
}

function batchOptions(productKey) {
    return [...salesMap.entries()].filter(([, sale]) => normalize(sale.productCode || sale.productName) === productKey && sale.availableQty > 0);
}

function updateReturnTotal() {
    let total = 0;
    document.querySelectorAll(`.return-item`).forEach(row => {
        const key = row.querySelector(`.return-batch`)?.value; const sale = salesMap.get(key);
        total += number(row.querySelector(`.return-qty`)?.value) * number(sale?.unitPrice);
    });
    $(`returnTotal`).textContent = formatMoney(total);
}

function addReturnRow(prefill = null) {
    const products = productOptions();
    const row = document.createElement(`div`); row.className = `return-item`;
    row.innerHTML = `<div><label>الصنف</label><select class="return-product"><option value="">اختر الصنف</option>${products.map(product => `<option value="${escapeHtml(normalize(product.code || product.name))}">${escapeHtml(product.code ? `${product.code} — ${product.name}` : product.name)}</option>`).join(``)}</select></div><div><label>Batch</label><select class="return-batch" disabled><option value="">اختر الباتش</option></select></div><div><label>المتاح</label><div class="return-availability">0</div></div><div><label>الكمية المرتجعة</label><input class="return-qty" type="number" min="1" step="1" value="1"></div><div><label>السبب</label><select class="return-reason"><option value="good">بضاعة جيدة</option><option value="expired">Expired</option></select></div><div><label>&nbsp;</label><button class="returns-btn danger remove-return-item" type="button"><i class="ph ph-trash"></i></button></div>`;
    const productSelect = row.querySelector(`.return-product`), batchSelect = row.querySelector(`.return-batch`), availability = row.querySelector(`.return-availability`), qty = row.querySelector(`.return-qty`);
    const populateBatches = () => {
        const rows = batchOptions(productSelect.value);
        batchSelect.innerHTML = `<option value="">اختر الباتش والفاتورة</option>${rows.map(([key, sale]) => `<option value="${escapeHtml(key)}">${escapeHtml(sale.batch)} — فاتورة ${escapeHtml(sale.invoiceNumber || `غير مسجل`)} — متاح ${sale.availableQty} — ${formatMoney(sale.unitPrice)} د.ا</option>`).join(``)}`;
        batchSelect.disabled = rows.length === 0;
    };
    productSelect.onchange = () => { populateBatches(); availability.textContent = `0`; updateReturnTotal(); };
    batchSelect.onchange = () => { const sale = salesMap.get(batchSelect.value); availability.textContent = sale ? sale.availableQty.toLocaleString(`en-US`) : `0`; qty.max = sale?.availableQty || 0; updateReturnTotal(); };
    qty.oninput = updateReturnTotal;
    row.querySelector(`.remove-return-item`).onclick = () => { row.remove(); updateReturnTotal(); };
    $(`returnItems`).appendChild(row);
    if (prefill) {
        const productKey = normalize(prefill.productCode || prefill.productName); productSelect.value = productKey; populateBatches();
        const match = [...salesMap.entries()].find(([, sale]) => normalize(sale.invoiceNumber) === normalize(prefill.invoiceNumber) && normalize(sale.productCode || sale.productName) === productKey && normalize(sale.batch) === normalize(prefill.batch) && number(sale.unitPrice) === number(prefill.unitPrice));
        if (match) { batchSelect.value = match[0]; availability.textContent = match[1].availableQty; }
        qty.value = number(prefill.qty); row.querySelector(`.return-reason`).value = prefill.reason || `good`;
    }
    updateReturnTotal();
}

function collectReturnItems() {
    const items = []; const requested = new Map();
    document.querySelectorAll(`.return-item`).forEach((row, index) => {
        const key = row.querySelector(`.return-batch`).value; const sale = salesMap.get(key); const qty = number(row.querySelector(`.return-qty`).value);
        if (!sale || qty <= 0) throw new Error(`أكمل الصنف والـ Batch والكمية في السطر ${index + 1}.`);
        requested.set(key, (requested.get(key) || 0) + qty);
        items.push({ invoiceNumber: sale.invoiceNumber, productCode: sale.productCode, productName: sale.productName, batch: sale.batch, qty, unitPrice: sale.unitPrice, lineValue: qty * sale.unitPrice, reason: row.querySelector(`.return-reason`).value, soldQty: sale.soldQty, availableBefore: sale.availableQty });
    });
    requested.forEach((qty, key) => { const sale = salesMap.get(key); if (qty > sale.availableQty) throw new Error(`الكمية المطلوبة للصنف ${sale.productName} والباتش ${sale.batch} هي ${qty}، بينما المتاح ${sale.availableQty} فقط.`); });
    if (items.length === 0) throw new Error(`أضف صنفًا واحدًا على الأقل.`);
    return items;
}

async function submitReturn() {
    const button = $(`submitReturn`); button.disabled = true;
    try {
        await loadReturnableSales();
        const items = collectReturnItems(); const totalValue = items.reduce((sum, item) => sum + item.lineValue, 0); const now = new Date();
        const payload = { repId: text(context.repId), repName: text(context.repName), managerName: text(context.managerName || REP_MANAGER_MAP[text(context.repName)]), pharmacyCode: text(context.pharmacyCode), pharmacyName: text(context.pharmacyName), items, totalValue, note: text($(`returnNote`).value), status: `pending_supervisor_approval`, rejectionReason: ``, createdAt: now, updatedAt: now, auditTrail: [{ action: editingReturnId ? `representative_resubmitted` : `return_created`, actor: text(context.repName), role: `representative`, at: now }] };
        if (editingReturnId) { await updateDoc(doc(db, RETURNS, editingReturnId), payload); editingReturnId = ``; }
        else await addDoc(collection(db, RETURNS), payload);
        showBanner(`تم إرسال المرتجع للمشرف بنجاح.`, `success`); $(`returnItems`).innerHTML = ``; $(`returnNote`).value = ``; await loadReturnableSales(); addReturnRow(); loadMyReturns();
    } catch (error) { console.error(error); showBanner(error.message || `تعذر إرسال المرتجع.`, `error`); }
    finally { button.disabled = false; }
}

async function loadMyReturns() {
    const body = $(`myReturnsBody`); if (!body) return;
    body.innerHTML = `<tr><td colspan="7"><div class="returns-empty">جاري التحميل...</div></td></tr>`;
    try {
        const snap = await getDocs(query(collection(db, RETURNS), where(`repName`, `==`, text(context.repName))));
        const rows = []; snap.forEach(item => rows.push({ id: item.id, ...item.data() })); rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        body.innerHTML = rows.length ? rows.map(row => `<tr><td>${dateText(row.createdAt)}</td><td>${escapeHtml(row.pharmacyName)}</td><td>${(row.items || []).map(item => `${escapeHtml(item.productName)} / ${escapeHtml(item.batch)} / فاتورة ${escapeHtml(item.invoiceNumber || `غير مسجل`)} × ${item.qty}`).join(`<br>`)}</td><td>${formatMoney(row.totalValue)}</td><td><span class="returns-status ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td><td>${escapeHtml(row.rejectionReason || `-`)}</td><td>${[`supervisor_rejected`, `market_manager_rejected`].includes(row.status) ? `<button class="returns-btn warning edit-return" data-id="${row.id}" type="button">تعديل</button> <button class="returns-btn danger delete-return" data-id="${row.id}" type="button">حذف</button>` : `مشاهدة فقط`}</td></tr>`).join(``) : `<tr><td colspan="7"><div class="returns-empty">لا توجد مرتجعات بعد.</div></td></tr>`;
        body.querySelectorAll(`.edit-return`).forEach(button => button.onclick = () => editReturn(rows.find(row => row.id === button.dataset.id)));
        body.querySelectorAll(`.delete-return`).forEach(button => button.onclick = async () => { if (confirm(`حذف المرتجع المرفوض نهائيًا؟`)) { await deleteDoc(doc(db, RETURNS, button.dataset.id)); loadMyReturns(); } });
    } catch (error) { body.innerHTML = `<tr><td colspan="7"><div class="returns-empty">تعذر تحميل المرتجعات.</div></td></tr>`; }
}

async function editReturn(row) {
    editingReturnId = row.id; await loadReturnableSales(); $(`returnItems`).innerHTML = ``; (row.items || []).forEach(addReturnRow); $(`returnNote`).value = row.note || ``;
    $(`newReturnPanel`).classList.remove(`hidden`); $(`myReturnsPanel`).classList.add(`hidden`); document.querySelectorAll(`[data-rep-tab]`).forEach(button => button.classList.toggle(`active`, button.dataset.repTab === `new`));
    showBanner(`تم تحميل المرتجع المرفوض للتعديل وإعادة الإرسال.`, `info`);
}

function switchRepTab(name) {
    $(`newReturnPanel`).classList.toggle(`hidden`, name !== `new`); $(`myReturnsPanel`).classList.toggle(`hidden`, name !== `history`);
    document.querySelectorAll(`[data-rep-tab]`).forEach(button => button.classList.toggle(`active`, button.dataset.repTab === name)); if (name === `history`) loadMyReturns();
}

async function initRepresentative() {
    context = readRepContext();
    if (!context.repName || !context.pharmacyCode) { showBanner(`اختر المندوب والصيدلية من شاشة الدخول أولًا.`, `error`); $(`submitReturn`).disabled = true; return; }
    $(`returnContext`).textContent = `${context.repName} — ${context.pharmacyName}`; $(`returnPharmacyCode`).value = context.pharmacyCode; $(`returnPharmacyName`).value = context.pharmacyName;
    try { await loadReturnableSales(); if (productOptions().length === 0) showBanner(`لا توجد مبيعات مسجلة حسب Batch لهذه الصيدلية.`, `info`); addReturnRow(); }
    catch (error) { showBanner(error.message || `تعذر تحميل المبيعات.`, `error`); }
    $(`addReturnItem`).onclick = () => addReturnRow(); $(`submitReturn`).onclick = submitReturn; document.querySelectorAll(`[data-rep-tab]`).forEach(button => button.onclick = () => switchRepTab(button.dataset.repTab));
}

function reviewMode() { return new URLSearchParams(location.search).get(`mode`) || `finance`; }

async function loadGrossSales() {
    const snap = await getDocs(collection(db, ORDERS)); let total = 0;
    snap.forEach(item => { const order = item.data(); if (isInvoiced(order)) total += number(order.grandTotal); }); return total;
}

async function loadReviewRows() {
    const mode = reviewMode(); const session = readAdminSession(); let snap;
    if (mode === `supervisor`) {
        if (!session?.name) throw new Error(`سجل الدخول كمشرف أولًا.`);
        snap = await getDocs(query(collection(db, RETURNS), where(`managerName`, `==`, session.name)));
    } else snap = await getDocs(collection(db, RETURNS));
    currentRows = []; snap.forEach(item => currentRows.push({ id: item.id, ...item.data() })); currentRows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    renderReviewRows();
    if (mode === `finance`) {
        const gross = await loadGrossSales(); const approvedValue = currentRows.filter(row => row.status === `approved`).reduce((sum, row) => sum + number(row.totalValue), 0);
        $(`grossSales`).textContent = `${formatMoney(gross)} د.ا`; $(`netSales`).textContent = `${formatMoney(gross - approvedValue)} د.ا`;
    }
}

function renderReviewRows() {
    const mode = reviewMode(); const pharmacy = normalize($(`filterPharmacy`).value), rep = normalize($(`filterRep`).value), status = $(`filterStatus`).value;
    const filtered = currentRows.filter(row => (!pharmacy || normalize(`${row.pharmacyName} ${row.pharmacyCode}`).includes(pharmacy)) && (!rep || normalize(row.repName).includes(rep)) && (!status || row.status === status));
    $(`returnsCount`).textContent = filtered.length; $(`returnsValue`).textContent = `${formatMoney(filtered.reduce((sum, row) => sum + number(row.totalValue), 0))} د.ا`;
    const body = $(`reviewReturnsBody`);
    body.innerHTML = filtered.length ? filtered.map(row => {
        const canApprove = (mode === `supervisor` && row.status === `pending_supervisor_approval`) || (mode === `market` && row.status === `market_manager_pending`);
        return `<tr><td>${dateText(row.createdAt)}</td><td>${escapeHtml(row.repName)}</td><td>${escapeHtml(row.pharmacyCode)}<br><strong>${escapeHtml(row.pharmacyName)}</strong></td><td>${(row.items || []).map(item => `${escapeHtml(item.productName)} — ${escapeHtml(item.batch)} — فاتورة ${escapeHtml(item.invoiceNumber || `غير مسجل`)} — ${item.qty} × ${formatMoney(item.unitPrice)} — ${item.reason === `expired` ? `Expired` : `بضاعة جيدة`}`).join(`<br>`)}</td><td>${formatMoney(row.totalValue)}</td><td><span class="returns-status ${row.status}">${STATUS_LABELS[row.status] || row.status}</span></td><td>${escapeHtml(row.rejectionReason || `-`)}</td><td>${canApprove ? `<button class="returns-btn success approve-return" data-id="${row.id}" type="button">موافقة</button> <button class="returns-btn danger reject-return" data-id="${row.id}" type="button">رفض</button>` : `مشاهدة`}</td></tr>`;
    }).join(``) : `<tr><td colspan="8"><div class="returns-empty">لا توجد مرتجعات مطابقة.</div></td></tr>`;
    body.querySelectorAll(`.approve-return`).forEach(button => button.onclick = () => approveReturn(button.dataset.id));
    body.querySelectorAll(`.reject-return`).forEach(button => button.onclick = () => rejectReturn(button.dataset.id));
}

async function approveReturn(id) {
    const mode = reviewMode(), row = currentRows.find(item => item.id === id); if (!row) return;
    const nextStatus = mode === `supervisor` ? `market_manager_pending` : `approved`; const now = new Date();
    await updateDoc(doc(db, RETURNS, id), { status: nextStatus, rejectionReason: ``, updatedAt: now, [`${mode}ApprovedAt`]: now, auditTrail: [...(row.auditTrail || []), { action: `${mode}_approved`, role: mode, at: now }] });
    showBanner(mode === `supervisor` ? `تمت الموافقة وتحويل المرتجع إلى مدير السوق.` : `تم اعتماد المرتجع نهائيًا واحتسابه في Net Sales.`, `success`); await loadReviewRows();
}

async function rejectReturn(id) {
    const reason = prompt(`سبب الرفض إجباري:`); if (reason === null) return; if (!text(reason)) return showBanner(`لا يمكن رفض المرتجع دون سبب.`, `error`);
    const mode = reviewMode(), row = currentRows.find(item => item.id === id), now = new Date(); const status = mode === `supervisor` ? `supervisor_rejected` : `market_manager_rejected`;
    await updateDoc(doc(db, RETURNS, id), { status, rejectionReason: text(reason), updatedAt: now, rejectedAt: now, auditTrail: [...(row.auditTrail || []), { action: `${mode}_rejected`, role: mode, reason: text(reason), at: now }] });
    showBanner(`تم رفض المرتجع وإعادته للمندوب مع السبب.`, `success`); await loadReviewRows();
}

function exportVisible() {
    const rows = currentRows.flatMap(row => (row.items || []).map(item => ({ [`التاريخ`]: dateText(row.createdAt), [`رقم الفاتورة`]: item.invoiceNumber || ``, [`المندوب`]: row.repName, [`كود الصيدلية`]: row.pharmacyCode, [`الصيدلية`]: row.pharmacyName, [`الصنف`]: item.productName, [`Batch`]: item.batch, [`الكمية المرتجعة`]: item.qty, [`سعر الوحدة`]: item.unitPrice, [`قيمة السطر`]: item.lineValue, [`قيمة المرتجع`]: row.totalValue, [`الحالة`]: STATUS_LABELS[row.status] || row.status, [`سبب الرفض`]: row.rejectionReason || `` })));
    const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); XLSX.utils.book_append_sheet(wb, ws, `Returns`); XLSX.writeFile(wb, `Returns_${reviewMode()}.xlsx`);
}

async function initReview() {
    const mode = reviewMode(); const settings = {
        supervisor: [`موافقات مرتجعات الفريق`, `الموافقة أو الرفض قبل التحويل لمدير السوق`, `supervisor.html`],
        market: [`اعتماد المرتجعات`, `الاعتماد النهائي للمرتجعات بعد موافقة المشرف`, `market_manager.html`],
        finance: [`عرض المرتجعات المالي`, `مشاهدة فقط مع Gross Sales وNet Sales`, `finance_controller.html`]
    }[mode] || [`عرض المرتجعات`, `مشاهدة فقط`, `index.html`];
    $(`reviewTitle`).textContent = settings[0]; $(`reviewSubtitle`).textContent = settings[1]; $(`reviewBack`).href = settings[2];
    if (mode !== `finance`) { $(`grossSales`).closest(`.returns-stat`).classList.add(`hidden`); $(`netSales`).closest(`.returns-stat`).classList.add(`hidden`); }
    [`filterPharmacy`, `filterRep`, `filterStatus`].forEach(id => $(`${id}`).addEventListener(id === `filterStatus` ? `change` : `input`, renderReviewRows)); $(`exportReturns`).onclick = exportVisible;
    try { await loadReviewRows(); } catch (error) { showBanner(error.message || `تعذر تحميل المرتجعات.`, `error`); }
}

document.addEventListener(`DOMContentLoaded`, () => document.body.dataset.returnsPage === `representative` ? initRepresentative() : initReview());
