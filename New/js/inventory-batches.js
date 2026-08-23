import { db, collection, getDocs, query, where, doc, setDoc, updateDoc } from './firebase.js';

const INVENTORY = `new_inventory_batches`;
const SALES = `new_sales_batch_balances`;
const IMPORTS = `new_return_imports`;
const INVENTORY_HISTORY = `new_inventory_batch_history`;
let inventoryRows = [];
let salesRows = [];
let inventoryFileMeta = null;
let salesFileMeta = null;

const $ = id => document.getElementById(id);
const text = value => String(value ?? ``).trim();
const number = value => {
    const parsed = Number(String(value ?? ``).replace(/,/g, ``).replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit))));
    return Number.isFinite(parsed) ? parsed : 0;
};
const normalize = value => text(value).toLowerCase();
const dateValue = value => {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const raw = text(value);
    if (!raw) return ``;
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) return raw.slice(0, 10);
    const dayFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dayFirst) return `${dayFirst[3]}-${dayFirst[2].padStart(2, `0`)}-${dayFirst[1].padStart(2, `0`)}`;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString().slice(0, 10);
};
const compactId = value => {
    let hashA = 2166136261, hashB = 2246822519;
    for (const char of String(value)) { const code = char.charCodeAt(0); hashA = Math.imul(hashA ^ code, 16777619); hashB = Math.imul(hashB ^ code, 3266489917); }
    return `${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
};
const timestamp = () => new Date();

function readAdminSession() {
    for (const storage of [localStorage, sessionStorage]) {
        try {
            const session = JSON.parse(storage.getItem(`dad_admin_session_v2`) || `null`);
            if (session) return session;
        } catch (_) {}
    }
    return null;
}

function showBanner(message, type = `info`) {
    const banner = $(`pageBanner`);
    banner.className = `returns-banner show ${type}`;
    banner.textContent = message;
}

function switchTab(name) {
    document.querySelectorAll(`[data-import-tab]`).forEach(button => button.classList.toggle(`active`, button.dataset.importTab === name));
    document.querySelectorAll(`[data-panel]`).forEach(panel => panel.classList.toggle(`hidden`, panel.dataset.panel !== name));
    if (name === `logs`) loadLogs();
}

function downloadWorkbook(type) {
    const wb = XLSX.utils.book_new();
    if (type === `inventory`) {
        const rows = [[`كود الصنف`, `اسم الصنف`, `Batch`, `تاريخ الانتهاء`, `الكمية المتاحة`], [`P-001`, `مثال صنف`, `BATCH-001`, `2028-12-31`, 100]];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws[`!cols`] = [{ wch: 18 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, ws, `الأرصدة والباتشات`);
        XLSX.writeFile(wb, `Template_Inventory_Batches.xlsx`);
        return;
    }
    const rows = [[`تاريخ البيع`, `رقم الفاتورة`, `كود الصيدلية`, `اسم الصيدلية`, `كود الصنف`, `اسم الصنف`, `Batch`, `تاريخ الانتهاء`, `الكمية المباعة`, `الكمية المجانية`, `سعر الوحدة`], [`2025-01-15`, `INV-001`, `PH-001`, `صيدلية مثال`, `P-001`, `مثال صنف`, `BATCH-001`, `2028-12-31`, 10, 2, 2.5]];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws[`!cols`] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 18 }, { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, `المبيعات القديمة`);
    XLSX.writeFile(wb, `Template_Historical_Batch_Sales.xlsx`);
}

async function fileHash(file) {
    const digest = await crypto.subtle.digest(`SHA-256`, await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, `0`)).join(``);
}

async function readSheet(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: `array`, cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: ``, raw: false });
}

function renderPreview(targetId, rows, errors) {
    const target = $(targetId);
    const sample = rows.slice(0, 8);
    target.innerHTML = `<div class="preview-meta"><span class="preview-pill">السجلات الصالحة: ${rows.length}</span><span class="preview-pill">الأخطاء: ${errors.length}</span></div>${errors.length ? `<div class="returns-banner show error">${errors.slice(0, 6).join(` — `)}</div>` : ``}<div class="returns-table-wrap"><table class="returns-table"><thead><tr>${sample[0] ? Object.keys(sample[0]).map(key => `<th>${key}</th>`).join(``) : `<th>لا توجد بيانات</th>`}</tr></thead><tbody>${sample.map(row => `<tr>${Object.values(row).map(value => `<td>${text(value)}</td>`).join(``)}</tr>`).join(``)}</tbody></table></div>`;
}

async function parseInventory(file) {
    const source = await readSheet(file);
    const errors = [];
    inventoryRows = source.map((row, index) => {
        const result = {
            productCode: text(row[`كود الصنف`]), productName: text(row[`اسم الصنف`]), batch: text(row[`Batch`] || row[`الباتش`]),
            expiryDate: dateValue(row[`تاريخ الانتهاء`]), initialQty: number(row[`الكمية المتاحة`])
        };
        if (!result.productCode || !result.productName || !result.batch || result.initialQty < 0) errors.push(`سطر ${index + 2}: بيانات ناقصة أو كمية غير صحيحة`);
        return result;
    }).filter(row => row.productCode && row.productName && row.batch && row.initialQty >= 0);
    inventoryFileMeta = { name: file.name, size: file.size, hash: await fileHash(file), errors };
    renderPreview(`inventoryPreview`, inventoryRows, errors);
    $(`commitInventory`).disabled = inventoryRows.length === 0 || errors.length > 0;
}

async function parseSales(file) {
    const source = await readSheet(file);
    const errors = [];
    const parsedRows = source.map((row, index) => {
        const result = {
            saleDate: dateValue(row[`تاريخ البيع`]), invoiceNumber: text(row[`رقم الفاتورة`]), pharmacyCode: text(row[`كود الصيدلية`]), pharmacyName: text(row[`اسم الصيدلية`]),
            productCode: text(row[`كود الصنف`]), productName: text(row[`اسم الصنف`]), batch: text(row[`Batch`] || row[`الباتش`]), expiryDate: dateValue(row[`تاريخ الانتهاء`]), soldQty: number(row[`الكمية المباعة`]), bonusQty: number(row[`الكمية المجانية`] || row[`البونص`]), unitPrice: number(row[`سعر الوحدة`])
        };
        result.totalPurchasedQty = result.soldQty + result.bonusQty;
        if (!result.invoiceNumber || !result.pharmacyCode || !result.productCode || !result.batch || result.soldQty < 0 || result.bonusQty < 0 || result.totalPurchasedQty <= 0 || result.unitPrice < 0) errors.push(`سطر ${index + 2}: رقم الفاتورة والكود والباتش إلزامية، ويجب أن يكون مجموع الكمية والبونص أكبر من صفر`);
        return result;
    }).filter(row => row.invoiceNumber && row.pharmacyCode && row.productCode && row.batch && row.totalPurchasedQty > 0 && row.unitPrice >= 0);
    const aggregated = new Map();
    parsedRows.forEach(row => {
        const key = `${normalize(row.invoiceNumber)}__${normalize(row.pharmacyCode)}__${normalize(row.productCode)}__${normalize(row.batch)}__${row.unitPrice}`;
        const current = aggregated.get(key) || { ...row, soldQty: 0, bonusQty: 0, totalPurchasedQty: 0, sourceRows: 0, firstSaleDate: row.saleDate, lastSaleDate: row.saleDate };
        current.soldQty += row.soldQty; current.bonusQty += row.bonusQty; current.totalPurchasedQty += row.totalPurchasedQty; current.sourceRows += 1;
        if (row.saleDate && (!current.firstSaleDate || row.saleDate < current.firstSaleDate)) current.firstSaleDate = row.saleDate;
        if (row.saleDate && (!current.lastSaleDate || row.saleDate > current.lastSaleDate)) current.lastSaleDate = row.saleDate;
        aggregated.set(key, current);
    });
    salesRows = [...aggregated.values()];
    salesFileMeta = { name: file.name, size: file.size, hash: await fileHash(file), errors };
    renderPreview(`salesPreview`, salesRows, errors);
    $(`commitSales`).disabled = salesRows.length === 0 || errors.length > 0;
}

async function writeSequential(tasks, size = 80) {
    for (let index = 0; index < tasks.length; index += size) await Promise.all(tasks.slice(index, index + size).map(task => task()));
}

async function commitInventory() {
    const button = $(`commitInventory`);
    button.disabled = true;
    showBanner(`جاري تعطيل الرصيد السابق واعتماد الملف الجديد...`, `info`);
    try {
        const uploadId = `inventory_${Date.now()}_${compactId(inventoryFileMeta.hash)}`;
        const activeSnap = await getDocs(query(collection(db, INVENTORY), where(`active`, `==`, true)));
        const deactivate = [];
        activeSnap.forEach(item => {
            const previous = item.data();
            deactivate.push(async () => {
                await setDoc(doc(db, INVENTORY_HISTORY, `${compactId(uploadId)}_${item.id}`), { ...previous, sourceInventoryId: item.id, archivedAt: timestamp(), replacedBy: uploadId });
                await updateDoc(item.ref, { active: false, deactivatedAt: timestamp(), replacedBy: uploadId });
            });
        });
        await writeSequential(deactivate);
        const writes = inventoryRows.map(row => () => {
            const id = `batch_${compactId(row.productCode)}_${compactId(row.batch)}`;
            return setDoc(doc(db, INVENTORY, id), { ...row, normalizedProductCode: normalize(row.productCode), normalizedBatch: normalize(row.batch), remainingQty: row.initialQty, active: true, uploadId, createdAt: timestamp(), updatedAt: timestamp() });
        });
        await writeSequential(writes);
        await setDoc(doc(db, IMPORTS, uploadId), { type: `inventory`, fileName: inventoryFileMeta.name, fileHash: inventoryFileMeta.hash, records: inventoryRows.length, status: `active`, createdAt: timestamp(), previousActiveCount: activeSnap.size });
        showBanner(`تم اعتماد ${inventoryRows.length} رصيد Batch وتعطيل ${activeSnap.size} رصيد سابق.`, `success`);
        inventoryRows = []; inventoryFileMeta = null; $(`inventoryFile`).value = ``; $(`inventoryPreview`).innerHTML = ``;
    } catch (error) {
        console.error(error); showBanner(`تعذر اعتماد الملف. تحقق من الصلاحيات والاتصال.`, `error`); button.disabled = false;
    }
}

async function commitSales() {
    const button = $(`commitSales`);
    button.disabled = true;
    showBanner(`جاري فحص الملف وحفظ المبيعات القديمة...`, `info`);
    try {
        const duplicate = await getDocs(query(collection(db, IMPORTS), where(`fileHash`, `==`, salesFileMeta.hash)));
        if (!duplicate.empty) throw new Error(`DUPLICATE_FILE`);
        const uploadId = `sales_${Date.now()}_${compactId(salesFileMeta.hash)}`;
        const writes = salesRows.map(row => () => {
            const ledgerKey = `${normalize(row.invoiceNumber)}__${normalize(row.pharmacyCode)}__${normalize(row.productCode)}__${normalize(row.batch)}__${row.unitPrice}`;
            return setDoc(doc(db, SALES, `historical_${compactId(ledgerKey)}`), { ...row, ledgerKey, source: `historical_import`, uploadId, createdAt: timestamp() });
        });
        await writeSequential(writes);
        await setDoc(doc(db, IMPORTS, uploadId), { type: `historical_sales`, fileName: salesFileMeta.name, fileHash: salesFileMeta.hash, records: salesRows.length, status: `active`, createdAt: timestamp() });
        showBanner(`تم حفظ ${salesRows.length} سجل مبيعات قديمة بنجاح.`, `success`);
        salesRows = []; salesFileMeta = null; $(`salesFile`).value = ``; $(`salesPreview`).innerHTML = ``;
    } catch (error) {
        console.error(error);
        showBanner(error.message === `DUPLICATE_FILE` ? `هذا الملف مرفوع مسبقًا ولن يتم تكراره.` : `تعذر حفظ المبيعات القديمة.`, `error`);
        button.disabled = false;
    }
}

async function loadLogs() {
    const target = $(`importLogs`); target.innerHTML = `<div class="returns-empty">جاري تحميل السجل...</div>`;
    try {
        const snap = await getDocs(collection(db, IMPORTS));
        const rows = []; snap.forEach(item => rows.push({ id: item.id, ...item.data() }));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        target.innerHTML = rows.length ? rows.slice(0, 50).map(row => `<div class="import-log-row"><div><strong>${row.fileName || row.id}</strong><div style="color:#64748b;font-size:.8rem">${row.type === `inventory` ? `أرصدة وباتشات` : `مبيعات قديمة`} — ${row.records || 0} سجل</div></div><span class="returns-status ${row.status === `active` ? `approved` : ``}">${row.status === `active` ? `نشط` : row.status}</span></div>`).join(``) : `<div class="returns-empty">لا توجد عمليات رفع بعد.</div>`;
    } catch (error) { target.innerHTML = `<div class="returns-empty">تعذر تحميل السجل.</div>`; }
}

document.addEventListener(`DOMContentLoaded`, () => {
    const session = readAdminSession();
    if (!session || ![`reports`, `system_admin`].includes(session.type)) {
        document.querySelector(`main`).innerHTML = `<section class="returns-card"><div class="returns-empty"><h2>هذه الشاشة لمدير النظام فقط</h2><p>سجّل الدخول بحساب لوحة التقارير/مدير النظام.</p></div></section>`;
        showBanner(`لا توجد صلاحية لإدارة الأرصدة والـ Batches.`, `error`);
        return;
    }
    document.querySelectorAll(`[data-import-tab]`).forEach(button => button.addEventListener(`click`, () => switchTab(button.dataset.importTab)));
    const requestedTab = new URLSearchParams(location.search).get(`tab`);
    if ([`inventory`, `sales`, `logs`].includes(requestedTab)) switchTab(requestedTab);
    $(`downloadInventoryTemplate`).onclick = () => downloadWorkbook(`inventory`);
    $(`downloadSalesTemplate`).onclick = () => downloadWorkbook(`sales`);
    $(`inventoryFile`).onchange = event => event.target.files[0] && parseInventory(event.target.files[0]);
    $(`salesFile`).onchange = event => event.target.files[0] && parseSales(event.target.files[0]);
    $(`commitInventory`).onclick = commitInventory;
    $(`commitSales`).onclick = commitSales;
});
