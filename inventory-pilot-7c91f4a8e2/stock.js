import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection,
    getDocs,
    doc,
    setDoc,
    writeBatch,
    onSnapshot,
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
const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
const INVENTORY_COLLECTION = `product_inventory_v1`;
const DEFAULT_STOCK = 1000;
const state = { products: [], inventory: new Map(), editingProduct: null };
const byId = id => document.getElementById(id);

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

function toDateInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, `0`);
    const day = String(date.getDate()).padStart(2, `0`);
    return `${year}-${month}-${day}`;
}

function formatDate(value) {
    if (!value) return `—`;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(`ar-JO`, { year: `numeric`, month: `short`, day: `numeric` }).format(date);
}

function batchesFor(product) {
    const record = state.inventory.get(product.id);
    if (Array.isArray(record?.batches) && record.batches.length) {
        return record.batches.map(batch => ({
            id: batch.id || crypto.randomUUID(),
            batchNo: batch.batchNo || `بدون رقم`,
            quantity: numberValue(batch.quantity),
            expiryDate: batch.expiryDate || ``
        }));
    }
    return [{ id: `opening-balance`, batchNo: `رصيد افتتاحي`, quantity: numberValue(record?.stock ?? DEFAULT_STOCK), expiryDate: `` }];
}

function metrics(product) {
    const batches = batchesFor(product);
    const total = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    const dated = batches.filter(batch => batch.expiryDate && batch.quantity !== 0).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const limit = new Date();
    limit.setMonth(limit.getMonth() + 6);
    return {
        batches,
        total,
        nearest: dated[0]?.expiryDate || ``,
        expiring: dated.some(batch => batch.quantity > 0 && batch.expiryDate <= toDateInput(limit))
    };
}

function showToast(message, type = ``) {
    const toast = document.createElement(`div`);
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    byId(`toastContainer`).appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

function render() {
    const rows = state.products.map(product => ({ product, metrics: metrics(product) }));
    byId(`productCount`).textContent = rows.length.toLocaleString(`ar-JO`);
    byId(`batchCount`).textContent = rows.reduce((sum, row) => sum + row.metrics.batches.length, 0).toLocaleString(`ar-JO`);
    byId(`unitCount`).textContent = rows.reduce((sum, row) => sum + row.metrics.total, 0).toLocaleString(`ar-JO`);
    byId(`expiryCount`).textContent = rows.filter(row => row.metrics.expiring).length.toLocaleString(`ar-JO`);
    drawRows(rows);
}

function drawRows(rows = state.products.map(product => ({ product, metrics: metrics(product) }))) {
    const term = byId(`stockSearch`).value.trim().toLocaleLowerCase(`ar`);
    const filtered = rows.filter(row => `${productCode(row.product)} ${row.product.name} ${row.metrics.batches.map(batch => batch.batchNo).join(` `)}`.toLocaleLowerCase(`ar`).includes(term));
    byId(`stockRows`).innerHTML = filtered.length ? filtered.map(({ product, metrics: row }) => `
        <tr>
            <td><span class="code-pill">${escapeHtml(productCode(product) || `—`)}</span></td>
            <td>
                <strong>${escapeHtml(product.name)}</strong>
                <div class="batch-list">${row.batches.map(batch => `<span>${escapeHtml(batch.batchNo)} · ${batch.quantity.toLocaleString(`ar-JO`)}${batch.expiryDate ? ` · ${escapeHtml(formatDate(batch.expiryDate))}` : ``}</span>`).join(``)}</div>
            </td>
            <td>${row.total.toLocaleString(`ar-JO`)}</td>
            <td>${row.nearest ? escapeHtml(formatDate(row.nearest)) : `—`}</td>
            <td><button class="secondary-btn small-btn" type="button" data-edit-product="${escapeHtml(product.id)}"><i class="ph ph-pencil-simple"></i> إدارة الباتشات</button></td>
        </tr>`).join(``) : `<tr><td colspan="5"><div class="empty-state"><i class="ph ph-magnifying-glass"></i><p>لا توجد أصناف مطابقة.</p></div></td></tr>`;
    byId(`stockRows`).querySelectorAll(`[data-edit-product]`).forEach(button => button.addEventListener(`click`, () => openBatchEditor(button.dataset.editProduct)));
}

function batchRow(batch = {}) {
    return `
        <div class="batch-row" data-batch-id="${escapeHtml(batch.id || crypto.randomUUID())}">
            <label><span>رقم الباتش</span><input data-field="batchNo" value="${escapeHtml(batch.batchNo || ``)}" placeholder="مثال: B-2026-01" required></label>
            <label><span>الكمية</span><input data-field="quantity" type="number" step="1" value="${numberValue(batch.quantity)}" required></label>
            <label><span>تاريخ الانتهاء</span><input data-field="expiryDate" type="date" value="${escapeHtml(batch.expiryDate || ``)}"></label>
            <button class="remove-batch" type="button" title="حذف الباتش"><i class="ph ph-trash"></i></button>
        </div>`;
}

function openBatchEditor(productId) {
    const product = state.products.find(item => item.id === productId);
    if (!product) return;
    state.editingProduct = product;
    byId(`batchModalContent`).innerHTML = `
        <div class="login-head"><span class="login-icon"><i class="ph ph-stack"></i></span><h2>إدارة باتشات الصنف</h2><p>أضف أو عدّل الكمية وتاريخ الانتهاء لكل باتش.</p></div>
        <div class="product-context"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(productCode(product) || `بدون كود`)}</small></div>
        <form id="batchForm">
            <div id="batchEditor" class="batch-editor">${batchesFor(product).map(batchRow).join(``)}</div>
            <button id="addBatchBtn" class="secondary-btn" type="button"><i class="ph ph-plus"></i> إضافة باتش</button>
            <button class="primary-btn full-btn" type="submit"><i class="ph ph-floppy-disk"></i> حفظ الرصيد</button>
        </form>`;
    byId(`batchModal`).hidden = false;
    bindBatchRows();
    byId(`addBatchBtn`).addEventListener(`click`, () => {
        byId(`batchEditor`).insertAdjacentHTML(`beforeend`, batchRow());
        bindBatchRows();
    });
    byId(`batchForm`).addEventListener(`submit`, saveBatches);
}

function bindBatchRows() {
    byId(`batchEditor`).querySelectorAll(`.remove-batch`).forEach(button => {
        button.onclick = () => {
            const rows = byId(`batchEditor`).querySelectorAll(`.batch-row`);
            if (rows.length === 1) return showToast(`يجب إبقاء باتش واحد على الأقل.`, `error`);
            button.closest(`.batch-row`).remove();
        };
    });
}

async function saveBatches(event) {
    event.preventDefault();
    const product = state.editingProduct;
    const batches = [...byId(`batchEditor`).querySelectorAll(`.batch-row`)].map(row => ({
        id: row.dataset.batchId,
        batchNo: row.querySelector(`[data-field="batchNo"]`).value.trim() || `بدون رقم`,
        quantity: numberValue(row.querySelector(`[data-field="quantity"]`).value),
        expiryDate: row.querySelector(`[data-field="expiryDate"]`).value
    }));
    const stock = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    try {
        await setDoc(doc(db, INVENTORY_COLLECTION, product.id), {
            productId: product.id,
            productCode: productCode(product),
            productName: product.name,
            batches,
            stock,
            updatedAt: serverTimestamp()
        }, { merge: true });
        byId(`batchModal`).hidden = true;
        showToast(`تم حفظ باتشات ${product.name}.`, `success`);
    } catch (error) {
        console.error(error);
        showToast(`تعذر حفظ الرصيد.`, `error`);
    }
}

function downloadTemplate() {
    const data = [];
    state.products.forEach(product => {
        batchesFor(product).forEach(batch => data.push({
            [`Product Code`]: productCode(product),
            [`Product Name`]: product.name,
            [`Batch Number`]: batch.batchNo,
            [`Quantity`]: batch.quantity,
            [`Expiry Date`]: batch.expiryDate
        }));
    });
    const sheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, `Stock Batches`);
    XLSX.writeFile(workbook, `stock-batches-template.xlsx`);
}

function cell(row, ...keys) {
    for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
    return ``;
}

async function uploadTemplate(file) {
    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: `array`, cellDates: true });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: `` });
        if (!rows.length) throw new Error(`الملف فارغ`);
        const grouped = new Map();
        rows.forEach((row, index) => {
            const code = String(cell(row, `Product Code`, `كود الصنف`)).trim();
            const name = String(cell(row, `Product Name`, `اسم الصنف`)).trim();
            const product = state.products.find(item => (code && String(productCode(item)) === code) || (!code && item.name === name));
            if (!product) throw new Error(`لم يتم العثور على الصنف في السطر ${index + 2}: ${code || name}`);
            const rawExpiry = cell(row, `Expiry Date`, `تاريخ الانتهاء`);
            let expiryDate = ``;
            if (rawExpiry instanceof Date && !Number.isNaN(rawExpiry.getTime())) expiryDate = toDateInput(rawExpiry);
            else if (rawExpiry) {
                const parsed = new Date(rawExpiry);
                expiryDate = Number.isNaN(parsed.getTime()) ? String(rawExpiry).slice(0, 10) : toDateInput(parsed);
            }
            if (!grouped.has(product.id)) grouped.set(product.id, { product, batches: [] });
            grouped.get(product.id).batches.push({
                id: crypto.randomUUID(),
                batchNo: String(cell(row, `Batch Number`, `رقم الباتش`) || `بدون رقم`).trim(),
                quantity: numberValue(cell(row, `Quantity`, `الكمية`)),
                expiryDate
            });
        });
        if (!window.confirm(`سيتم استبدال باتشات ${grouped.size} صنف حسب الملف. هل تريد المتابعة؟`)) return;
        const batch = writeBatch(db);
        grouped.forEach(({ product, batches }) => batch.set(doc(db, INVENTORY_COLLECTION, product.id), {
            productId: product.id,
            productCode: productCode(product),
            productName: product.name,
            batches,
            stock: batches.reduce((sum, item) => sum + item.quantity, 0),
            updatedAt: serverTimestamp()
        }, { merge: true }));
        await batch.commit();
        showToast(`تم تحديث ${grouped.size} صنف من الملف.`, `success`);
    } catch (error) {
        console.error(error);
        showToast(error.message || `تعذر قراءة الملف.`, `error`);
    } finally {
        byId(`uploadTemplateInput`).value = ``;
    }
}

byId(`stockSearch`).addEventListener(`input`, () => drawRows());
byId(`downloadTemplateBtn`).addEventListener(`click`, downloadTemplate);
byId(`uploadTemplateInput`).addEventListener(`change`, event => event.target.files[0] && uploadTemplate(event.target.files[0]));
byId(`closeBatchModal`).addEventListener(`click`, () => { byId(`batchModal`).hidden = true; });
byId(`batchModal`).addEventListener(`click`, event => { if (event.target === byId(`batchModal`)) byId(`batchModal`).hidden = true; });

async function boot() {
    try {
        const productsSnap = await getDocs(collection(db, `products`));
        state.products = productsSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.name).sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));
        onSnapshot(collection(db, INVENTORY_COLLECTION), snapshot => {
            state.inventory = new Map(snapshot.docs.map(item => [item.id, { id: item.id, ...item.data() }]));
            render();
        }, error => {
            console.error(error);
            showToast(`تعذر تحميل الأرصدة.`, `error`);
        });
    } catch (error) {
        console.error(error);
        showToast(`تعذر تحميل الأصناف.`, `error`);
    }
}

boot();
