import { db, collection, getDocs, query, where, doc, getDoc, setDoc } from './firebase.js';

const TARGETS_COLLECTION = `monthly_targets`;
const TARGET_UPDATE_NOTICE_DATE = `2026-08-19`;
const TARGET_UPDATE_NOTICE_VERSION = `targets_v1`;
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

const targetState = {
    supervisorName: ``,
    repName: ``,
    reps: [],
    products: [],
    targetRows: [],
    orders: [],
    repManagerMap: { ...DEFAULT_REP_MANAGER_MAP },
    repTargetFilter: `all`,
    supervisorLoaded: false,
    repLoaded: false
};

function el(id) {
    return document.getElementById(id);
}

function currentMonthValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, `0`)}`;
}

function normalizeText(value) {
    return String(value || ``).trim().toLowerCase();
}

function parseQuantity(value) {
    if (value === null || value === undefined || value === ``) return 0;
    const normalized = String(value)
        .replace(/,/g, ``)
        .replace(/[٠-٩]/g, digit => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(digit)))
        .replace(/[^0-9.\-]/g, ``);
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === `function`) return value.toDate();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function monthOfOrder(order = {}) {
    const date = toDate(order.invoicedAt) || toDate(order.hiddenAt) || toDate(order.createdAt);
    return date ? currentMonthValue(date) : ``;
}

function isDeletedOrder(order = {}) {
    const fields = [
        order.status,
        order.orderStatus,
        order.workflowStatus,
        order.workflowStage,
        order.supervisorStatus,
        order.marketManagerStatus,
        order.financeStatus,
        order.orderStaffStatus
    ];
    return fields.some(value => {
        const normalized = normalizeText(value);
        return normalized === `deleted` || normalized.startsWith(`deleted_`);
    }) || order.isDeleted === true || order.deleted === true || Boolean(order.deletedAt);
}

function isInvoicedOrder(order = {}) {
    if (isDeletedOrder(order)) return false;
    const fields = [order.status, order.orderStatus, order.workflowStatus, order.orderStaffStatus];
    return fields.some(value => [`orders_staff_hidden`, `orders_staff_invoiced_and_hidden_after_export`].includes(normalizeText(value))) ||
        order.isInvoiced === true ||
        order.hiddenByOrderStaff === true ||
        Boolean(order.invoicedAt);
}

function productIdentity(product = {}) {
    return String(product.id || product.productId || product.productCode || product.code || product.name || ``);
}

function productCode(product = {}) {
    return String(product.productCode || product.product_code || product.code || ``).trim();
}

function itemMatchesProduct(item = {}, product = {}) {
    const itemId = normalizeText(item.productId || item.id);
    const itemCode = normalizeText(item.productCode || item.product_code || item.code);
    const itemName = normalizeText(item.name || item.productName);
    return (itemId && itemId === normalizeText(product.id)) ||
        (itemCode && itemCode === normalizeText(productCode(product))) ||
        (itemName && itemName === normalizeText(product.name));
}

function targetDocId(month, supervisorName) {
    return `${month}__${String(supervisorName || ``).replace(/[\\/#?]/g, `_`)}`;
}

function readAdminSession() {
    for (const storage of [localStorage, sessionStorage]) {
        try {
            const parsed = JSON.parse(storage.getItem(`dad_admin_session_v2`) || `null`);
            if (parsed?.name) return parsed;
        } catch (error) {
            console.warn(`تعذر قراءة جلسة المشرف.`, error);
        }
    }
    return null;
}

function readRepresentativeContext() {
    try {
        const context = JSON.parse(sessionStorage.getItem(`activeOrderContext`) || `null`);
        if (context?.repName) return context;
    } catch (error) {
        console.warn(`تعذر قراءة سياق المندوب.`, error);
    }
    return {
        repId: sessionStorage.getItem(`repId`) || ``,
        repName: sessionStorage.getItem(`repName`) || ``
    };
}

function showTargetToast(message, type = `info`) {
    if (typeof window.showToast === `function`) window.showToast(message, type);
}

function showTargetUpdateNoticeOnce(role, userId) {
    const today = currentMonthValue().concat(`-`, String(new Date().getDate()).padStart(2, `0`));
    if (today !== TARGET_UPDATE_NOTICE_DATE || !userId) return;

    const storageKey = `target_update_notice_${TARGET_UPDATE_NOTICE_VERSION}_${role}_${normalizeText(userId)}`;
    try {
        if (localStorage.getItem(storageKey) === `shown`) return;
        localStorage.setItem(storageKey, `shown`);
    } catch (error) {
        console.warn(`تعذر حفظ حالة تنبيه تحديث التارجت.`, error);
    }

    const modal = document.createElement(`div`);
    modal.id = `targetUpdateNoticeModal`;
    modal.className = `modal-overlay`;
    modal.style.cssText = `display:flex;z-index:11000;`;
    modal.innerHTML = `
        <div class="modal-content glass-panel" role="dialog" aria-modal="true" aria-labelledby="targetUpdateNoticeTitle" style="max-width:460px;text-align:center;padding:40px 30px;">
            <div style="background:rgba(9,153,153,.12);width:80px;height:80px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
                <i class="ph ph-target" aria-hidden="true" style="font-size:3.5rem;color:#099999;"></i>
            </div>
            <h2 id="targetUpdateNoticeTitle" style="color:var(--primary);margin-bottom:15px;font-weight:800;">تحديث جديد: نظام التارجت</h2>
            <p style="color:var(--secondary);font-size:1.05rem;line-height:1.8;margin-bottom:30px;">
                تمت إضافة قسم جديد لتحديد الأهداف الشهرية ومتابعة الكميات المباعة والمتبقية ونسبة الإنجاز.
            </p>
            <button class="btn-primary" id="closeTargetUpdateNoticeBtn" type="button" style="width:100%;height:50px;font-size:1.05rem;">
                علمت ذلك، شكراً
            </button>
        </div>`;
    document.body.appendChild(modal);

    const closeNotice = () => modal.remove();
    el(`closeTargetUpdateNoticeBtn`)?.addEventListener(`click`, closeNotice, { once: true });
    modal.addEventListener(`click`, event => {
        if (event.target === modal) closeNotice();
    });
}

async function loadAssignments() {
    try {
        const snap = await getDoc(doc(db, `system_settings`, `rep_supervisor_assignments`));
        const assignments = snap.exists() ? snap.data()?.assignments : null;
        if (assignments && typeof assignments === `object` && !Array.isArray(assignments)) {
            targetState.repManagerMap = { ...DEFAULT_REP_MANAGER_MAP, ...assignments };
        }
    } catch (error) {
        console.warn(`تعذر تحميل ربط المندوبين بالمشرفين.`, error);
    }
}

async function loadBaseData() {
    const [productsSnap, repsSnap] = await Promise.all([
        getDocs(collection(db, `products`)),
        getDocs(collection(db, `reps`))
    ]);
    targetState.products = [];
    productsSnap.forEach(productDoc => {
        const product = { id: productDoc.id, ...productDoc.data() };
        if (product.name) targetState.products.push(product);
    });
    targetState.products.sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));

    const repsByName = new Map();
    repsSnap.forEach(repDoc => {
        const rep = { id: repDoc.id, ...repDoc.data() };
        if (rep.name) repsByName.set(normalizeText(rep.name), rep);
    });
    targetState.reps = Object.entries(targetState.repManagerMap)
        .filter(([, manager]) => normalizeText(manager) === normalizeText(targetState.supervisorName))
        .map(([name]) => repsByName.get(normalizeText(name)) || { id: ``, name })
        .sort((a, b) => String(a.name).localeCompare(String(b.name), `ar`));
}

async function loadOrders() {
    const snap = await getDocs(collection(db, `orders`));
    targetState.orders = [];
    snap.forEach(orderDoc => targetState.orders.push({ id: orderDoc.id, ...orderDoc.data() }));
}

async function loadTargetRows(month, supervisorName) {
    const snap = await getDoc(doc(db, TARGETS_COLLECTION, targetDocId(month, supervisorName)));
    const rows = snap.exists() && Array.isArray(snap.data()?.rows) ? snap.data().rows : [];
    return rows.map(row => ({
        repId: String(row.repId || ``),
        repName: String(row.repName || ``),
        productId: String(row.productId || ``),
        productCode: String(row.productCode || ``),
        productName: String(row.productName || ``),
        targetQty: parseQuantity(row.targetQty)
    }));
}

function targetLookup(rows = []) {
    const lookup = new Map();
    rows.forEach(row => lookup.set(`${normalizeText(row.repName)}__${normalizeText(row.productId || row.productCode || row.productName)}`, parseQuantity(row.targetQty)));
    return lookup;
}

function findTarget(lookup, rep, product) {
    const repKey = normalizeText(rep.name || rep.repName);
    const keys = [product.id, productCode(product), product.name].filter(Boolean);
    for (const key of keys) {
        const found = lookup.get(`${repKey}__${normalizeText(key)}`);
        if (found !== undefined) return found;
    }
    return 0;
}

function actualSoldQuantity(repName, product, month) {
    return targetState.orders.reduce((total, order) => {
        if (!isInvoicedOrder(order) || monthOfOrder(order) !== month || normalizeText(order.repName || order.representativeName) !== normalizeText(repName)) return total;
        const items = Array.isArray(order.items) ? order.items : [];
        return total + items.reduce((sum, item) => sum + (itemMatchesProduct(item, product) ? parseQuantity(item.qty ?? item.quantity) : 0), 0);
    }, 0);
}

function setSupervisorTargetSection(sectionId) {
    const sections = [`teamOrdersSection`, `allOrdersSection`, `setTargetsSection`, `targetDashboardSection`];
    sections.forEach(id => {
        if (el(id)) el(id).style.display = id === sectionId ? `block` : `none`;
    });
    const targetView = [`setTargetsSection`, `targetDashboardSection`].includes(sectionId);
    if (el(`advancedManagerDashboard`)) el(`advancedManagerDashboard`).style.display = targetView ? `none` : `grid`;
    if (el(`managerDateFilters`)) el(`managerDateFilters`).style.display = targetView ? `none` : `block`;
    document.querySelectorAll(`.supervisor-premium-tabs .btn-subtab`).forEach(button => button.classList.toggle(`active`, button.dataset.targetSection === sectionId));
}

function renderTargetEntryTable(rows = []) {
    const head = el(`targetEntryHead`);
    const body = el(`targetEntryBody`);
    if (!head || !body) return;
    head.innerHTML = `<tr><th class="target-sticky-product">الصنف</th>${targetState.reps.map(rep => `<th>${rep.name}</th>`).join(``)}</tr>`;
    if (targetState.products.length === 0 || targetState.reps.length === 0) {
        body.innerHTML = `<tr><td colspan="${Math.max(1, targetState.reps.length + 1)}"><div class="empty-state"><h3>لا توجد أصناف أو مندوبون مرتبطون بهذا المشرف</h3></div></td></tr>`;
        return;
    }
    const lookup = targetLookup(rows);
    body.innerHTML = targetState.products.map(product => `
        <tr data-product-id="${productIdentity(product)}">
            <td class="target-sticky-product"><strong>${product.name}</strong>${productCode(product) ? `<small>${productCode(product)}</small>` : ``}</td>
            ${targetState.reps.map(rep => `<td><input class="target-qty-input" min="0" step="1" type="number" inputmode="numeric" data-rep-id="${rep.id || ``}" data-rep-name="${rep.name}" data-product-id="${productIdentity(product)}" value="${findTarget(lookup, rep, product) || ``}" aria-label="هدف ${product.name} للمندوب ${rep.name}"></td>`).join(``)}
        </tr>
    `).join(``);
}

async function refreshTargetEntry() {
    const month = el(`targetMonthPicker`)?.value || currentMonthValue();
    if (el(`targetMonthPicker`)) el(`targetMonthPicker`).value = month;
    const rows = await loadTargetRows(month, targetState.supervisorName);
    targetState.targetRows = rows;
    renderTargetEntryTable(rows);
}

function collectTargetRows() {
    const productMap = new Map(targetState.products.map(product => [productIdentity(product), product]));
    return [...document.querySelectorAll(`#targetEntryBody .target-qty-input`)].map(input => {
        const product = productMap.get(input.dataset.productId) || {};
        return {
            repId: input.dataset.repId || ``,
            repName: input.dataset.repName || ``,
            productId: String(product.id || input.dataset.productId || ``),
            productCode: productCode(product),
            productName: String(product.name || ``),
            targetQty: parseQuantity(input.value)
        };
    }).filter(row => row.targetQty > 0);
}

async function saveTargets() {
    const month = el(`targetMonthPicker`)?.value;
    if (!month) return showTargetToast(`يرجى اختيار الشهر أولاً.`, `warning`);
    const button = el(`approveTargetsBtn`);
    if (button) button.disabled = true;
    try {
        const rows = collectTargetRows();
        await setDoc(doc(db, TARGETS_COLLECTION, targetDocId(month, targetState.supervisorName)), {
            month,
            supervisorName: targetState.supervisorName,
            repNames: targetState.reps.map(rep => rep.name),
            rows,
            updatedAt: new Date(),
            updatedBy: targetState.supervisorName
        }, { merge: true });
        targetState.targetRows = rows;
        showTargetToast(`تم حفظ واعتماد أهداف ${month} بنجاح.`, `success`);
    } catch (error) {
        console.error(`تعذر حفظ الأهداف.`, error);
        showTargetToast(`تعذر حفظ الأهداف. تحقق من الاتصال والصلاحيات.`, `error`);
    } finally {
        if (button) button.disabled = false;
    }
}

function downloadTargetTemplate() {
    if (typeof XLSX === `undefined`) return showTargetToast(`مكتبة Excel غير محملة.`, `error`);
    const month = el(`targetMonthPicker`)?.value || currentMonthValue();
    const rows = targetState.products.map(product => {
        const row = {
            [`كود الصنف`]: productCode(product),
            [`اسم الصنف`]: product.name
        };
        targetState.reps.forEach(rep => { row[rep.name] = ``; });
        return row;
    });
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [`كود الصنف`, `اسم الصنف`, ...targetState.reps.map(rep => rep.name)] });
    sheet[`!cols`] = [{ wch: 18 }, { wch: 38 }, ...targetState.reps.map(() => ({ wch: 18 }))];
    sheet[`!freeze`] = { xSplit: 2, ySplit: 1 };
    const instructions = XLSX.utils.aoa_to_sheet([
        [`نموذج الأهداف الشهرية`],
        [`الشهر`, month],
        [`المشرف`, targetState.supervisorName],
        [`التعليمات`, `أدخل الكمية المستهدفة لكل مندوب أمام كل صنف، ولا تعدّل أسماء الأعمدة أو الأصناف.`]
    ]);
    instructions[`!cols`] = [{ wch: 18 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, instructions, `تعليمات`);
    XLSX.utils.book_append_sheet(workbook, sheet, `الأهداف`);
    XLSX.writeFile(workbook, `نموذج_الأهداف_${month}.xlsx`);
}

async function uploadTargetTemplate(file) {
    if (!file) return;
    if (typeof XLSX === `undefined`) return showTargetToast(`مكتبة Excel غير محملة.`, `error`);
    try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: `array` });
        const sheetName = workbook.SheetNames.includes(`الأهداف`) ? `الأهداف` : workbook.SheetNames[workbook.SheetNames.length - 1];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: `` });
        const productByCode = new Map(targetState.products.map(product => [normalizeText(productCode(product)), product]));
        const productByName = new Map(targetState.products.map(product => [normalizeText(product.name), product]));
        const values = new Map();
        rows.forEach(row => {
            const product = productByCode.get(normalizeText(row[`كود الصنف`])) || productByName.get(normalizeText(row[`اسم الصنف`]));
            if (!product) return;
            targetState.reps.forEach(rep => values.set(`${productIdentity(product)}__${normalizeText(rep.name)}`, parseQuantity(row[rep.name])));
        });
        document.querySelectorAll(`#targetEntryBody .target-qty-input`).forEach(input => {
            const key = `${input.dataset.productId}__${normalizeText(input.dataset.repName)}`;
            if (values.has(key)) input.value = values.get(key) || ``;
        });
        showTargetToast(`تم تحميل ملف Excel وتعبئة الجدول. راجع البيانات ثم اضغط اعتماد الهدف.`, `success`);
    } catch (error) {
        console.error(`تعذر قراءة ملف الأهداف.`, error);
        showTargetToast(`تعذر قراءة الملف. استخدم النموذج الذي تم تنزيله من النظام.`, `error`);
    }
}

function progressRows(rows, month, reps = targetState.reps) {
    const lookup = targetLookup(rows);
    const output = [];
    reps.forEach(rep => targetState.products.forEach(product => {
        const targetQty = findTarget(lookup, rep, product);
        if (targetQty <= 0) return;
        const soldQty = actualSoldQuantity(rep.name || rep.repName, product, month);
        const remainingQty = Math.max(targetQty - soldQty, 0);
        const achievement = targetQty > 0 ? (soldQty / targetQty) * 100 : 0;
        output.push({ repName: rep.name || rep.repName, product, targetQty, soldQty, remainingQty, achievement });
    }));
    return output;
}

function renderProgressTable(rows) {
    const body = el(`targetProgressBody`);
    if (!body) return;
    const repFilter = normalizeText(el(`targetProgressRepFilter`)?.value);
    const productFilter = normalizeText(el(`targetProgressProductFilter`)?.value);
    const filtered = rows.filter(row => (!repFilter || normalizeText(row.repName) === repFilter) && (!productFilter || normalizeText(row.product.name) === productFilter));
    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><h3>لا توجد أهداف مطابقة للفلاتر</h3></div></td></tr>`;
        return;
    }
    body.innerHTML = filtered.map(row => `
        <tr>
            <td>${row.repName}</td>
            <td><strong>${row.product.name}</strong>${productCode(row.product) ? `<small class="target-product-code">${productCode(row.product)}</small>` : ``}</td>
            <td>${row.targetQty.toLocaleString(`en-US`)}</td>
            <td>${row.soldQty.toLocaleString(`en-US`)}</td>
            <td>${row.remainingQty.toLocaleString(`en-US`)}</td>
            <td><div class="target-progress-cell"><span>${row.achievement.toFixed(1)}%</span><div class="target-progress-track"><i style="width:${Math.min(row.achievement, 100)}%"></i></div></div></td>
        </tr>
    `).join(``);
}

async function refreshSupervisorProgress() {
    const month = el(`targetProgressMonth`)?.value || currentMonthValue();
    if (el(`targetProgressMonth`)) el(`targetProgressMonth`).value = month;
    const rows = await loadTargetRows(month, targetState.supervisorName);
    await loadOrders();
    const progress = progressRows(rows, month);
    renderProgressTable(progress);
}

function populateProgressFilters() {
    const repSelect = el(`targetProgressRepFilter`);
    const productSelect = el(`targetProgressProductFilter`);
    if (repSelect) repSelect.innerHTML = `<option value="">كل المندوبين</option>${targetState.reps.map(rep => `<option value="${rep.name}">${rep.name}</option>`).join(``)}`;
    if (productSelect) productSelect.innerHTML = `<option value="">كل الأصناف</option>${targetState.products.map(product => `<option value="${product.name}">${product.name}</option>`).join(``)}`;
}

async function initializeSupervisorTargets() {
    if (targetState.supervisorLoaded) return;
    targetState.supervisorLoaded = true;
    targetState.supervisorName = readAdminSession()?.name || ``;
    if (!targetState.supervisorName) return;
    showTargetUpdateNoticeOnce(`supervisor`, targetState.supervisorName);
    await loadAssignments();
    await loadBaseData();
    const month = currentMonthValue();
    if (el(`targetMonthPicker`)) el(`targetMonthPicker`).value = month;
    if (el(`targetProgressMonth`)) el(`targetProgressMonth`).value = month;
    populateProgressFilters();
    await refreshTargetEntry();

    el(`managerSetTargetsBtn`)?.addEventListener(`click`, async () => {
        setSupervisorTargetSection(`setTargetsSection`);
        await refreshTargetEntry();
    });
    el(`managerTargetDashboardBtn`)?.addEventListener(`click`, async () => {
        setSupervisorTargetSection(`targetDashboardSection`);
        await refreshSupervisorProgress();
    });
    [`managerMyTeamBtn`, `managerAllOrdersBtn`].forEach(id => el(id)?.addEventListener(`click`, () => setSupervisorTargetSection(id === `managerMyTeamBtn` ? `teamOrdersSection` : `allOrdersSection`)));
    el(`targetMonthPicker`)?.addEventListener(`change`, refreshTargetEntry);
    el(`targetProgressMonth`)?.addEventListener(`change`, refreshSupervisorProgress);
    el(`targetProgressRepFilter`)?.addEventListener(`change`, refreshSupervisorProgress);
    el(`targetProgressProductFilter`)?.addEventListener(`change`, refreshSupervisorProgress);
    el(`downloadTargetTemplateBtn`)?.addEventListener(`click`, downloadTargetTemplate);
    el(`uploadTargetTemplateBtn`)?.addEventListener(`click`, () => el(`targetExcelInput`)?.click());
    el(`targetExcelInput`)?.addEventListener(`change`, event => {
        uploadTargetTemplate(event.target.files?.[0]);
        event.target.value = ``;
    });
    el(`approveTargetsBtn`)?.addEventListener(`click`, saveTargets);
}

async function findRepresentativeTargetRows(month, repName) {
    const snap = await getDocs(query(collection(db, TARGETS_COLLECTION), where(`month`, `==`, month)));
    const rows = [];
    snap.forEach(targetDoc => {
        const data = targetDoc.data();
        if (Array.isArray(data.rows)) rows.push(...data.rows.filter(row => normalizeText(row.repName) === normalizeText(repName)));
    });
    return rows;
}

async function refreshRepresentativeTarget() {
    const month = el(`repTargetMonth`)?.value || currentMonthValue();
    if (el(`repTargetMonth`)) el(`repTargetMonth`).value = month;
    const rows = await findRepresentativeTargetRows(month, targetState.repName);
    await loadOrders();
    const progress = progressRows(rows, month, [{ name: targetState.repName }]);
    const filteredProgress = progress.filter(row => {
        if (targetState.repTargetFilter === `incomplete`) return row.achievement < 100;
        if (targetState.repTargetFilter === `low`) return row.achievement <= 50;
        return true;
    });
    const body = el(`repTargetBody`);
    if (!body) return;
    const summary = el(`repTargetResultsSummary`);
    if (summary) summary.textContent = progress.length > 0 ? `عرض ${filteredProgress.length} من أصل ${progress.length} صنف` : ``;
    if (progress.length === 0) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><h3>لم يتم تحديد أهداف لهذا الشهر بعد</h3></div></td></tr>`;
        return;
    }
    if (filteredProgress.length === 0) {
        body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><i class="ph ph-check-circle"></i><h3>لا توجد أصناف مطابقة لهذا الفلتر</h3></div></td></tr>`;
        return;
    }
    body.innerHTML = filteredProgress.map(row => `
        <tr>
            <td><strong>${row.product.name}</strong>${productCode(row.product) ? `<small class="target-product-code">${productCode(row.product)}</small>` : ``}</td>
            <td>${row.targetQty.toLocaleString(`en-US`)}</td>
            <td>${row.soldQty.toLocaleString(`en-US`)}</td>
            <td>${row.remainingQty.toLocaleString(`en-US`)}</td>
            <td><div class="target-progress-cell"><span>${row.achievement.toFixed(1)}%</span><div class="target-progress-track"><i style="width:${Math.min(row.achievement, 100)}%"></i></div></div></td>
        </tr>
    `).join(``);
}

async function initializeRepresentativeTarget() {
    if (targetState.repLoaded) return;
    targetState.repLoaded = true;
    const context = readRepresentativeContext();
    targetState.repName = context.repName || ``;
    if (!targetState.repName) return;
    showTargetUpdateNoticeOnce(`representative`, context.repId || targetState.repName);
    await loadAssignments();
    targetState.supervisorName = targetState.repManagerMap[targetState.repName] || ``;
    await loadBaseData();
    if (el(`repTargetMonth`)) el(`repTargetMonth`).value = currentMonthValue();
    el(`navTargetsBtn`)?.addEventListener(`click`, async () => {
        document.querySelectorAll(`.screen`).forEach(screen => screen.style.display = `none`);
        if (el(`repTargetScreen`)) el(`repTargetScreen`).style.display = `block`;
        document.querySelectorAll(`.btn-tab`).forEach(button => button.classList.remove(`active`));
        el(`navTargetsBtn`)?.classList.add(`active`);
        await refreshRepresentativeTarget();
    });
    el(`repTargetMonth`)?.addEventListener(`change`, refreshRepresentativeTarget);
    document.querySelectorAll(`.target-filter-chip`).forEach(button => button.addEventListener(`click`, async () => {
        targetState.repTargetFilter = button.dataset.targetFilter || `all`;
        document.querySelectorAll(`.target-filter-chip`).forEach(chip => chip.classList.toggle(`active`, chip === button));
        await refreshRepresentativeTarget();
    }));
}

window.addEventListener(`DOMContentLoaded`, async () => {
    try {
        if (document.body?.dataset?.page === `supervisor`) await initializeSupervisorTargets();
        if (document.body?.dataset?.page === `order`) await initializeRepresentativeTarget();
    } catch (error) {
        console.error(`تعذر تهيئة نظام الأهداف.`, error);
        showTargetToast(`تعذر تحميل نظام الأهداف.`, `error`);
    }
});
