import { db, collection, getDocs } from './firebase.js';

const C = window.medrepCommon;
const state = {
    session: null,
    rows: [],
    filtered: [],
    areaRules: [],
    otherShares: [],
    targets: [],
    ordersLoadedAt: null
};

function requireSession() {
    const session = C.readSession();
    if (!session?.name || session.role !== `medical_rep`) {
        window.location.href = `index.html`;
        return null;
    }
    state.session = session;
    C.$(`repName`).textContent = session.name || `-`;
    C.$(`repTeam`).textContent = session.team || `-`;
    return session;
}

async function getAll(collectionName) {
    const snap = await getDocs(collection(db, collectionName));
    const rows = [];
    snap.forEach(item => rows.push({ id: item.id, ...item.data() }));
    return rows;
}

function isInvoicedOrder(order = {}) {
    const status = String(order.status || ``);
    const staffStatus = String(order.orderStaffStatus || ``);
    const exportHistory = Array.isArray(order.exportHistory) ? order.exportHistory : [];
    const auditTrail = Array.isArray(order.auditTrail) ? order.auditTrail : [];
    return status === `orders_staff_hidden` ||
        staffStatus === `orders_staff_hidden` ||
        !!order.invoicedAt ||
        !!order.isInvoiced ||
        !!order.hiddenByOrderStaff ||
        exportHistory.some(entry => entry?.hideAfterExport === true || entry?.invoiced === true) ||
        auditTrail.some(entry => [`orders_staff_hidden`, `orders_staff_hide_after_export`, `orders_staff_invoiced_and_hidden_after_export`].includes(entry?.action));
}

function orderDate(order = {}) {
    return order.invoicedAt || order.hiddenAt || order.exportedAt || order.updatedAt || order.createdAt;
}

function getPharmacyCode(order = {}) {
    return String(order.pharmacyCode || order.pharmacy_code || order.customerCode || order.code || ``).trim();
}

function getProductCode(item = {}) {
    return String(item.productCode || item.product_code || item.code || ``).trim();
}

function getOrderArea(order = {}, pharmaciesByCode, pharmaciesByName) {
    const direct = String(order.area || order.Area || order.pharmacyArea || order.region || order.Region || ``).trim();
    if (direct && direct !== `-`) return direct;
    const code = getPharmacyCode(order);
    const name = String(order.pharmacyName || ``).trim();
    const byCode = code ? pharmaciesByCode.get(C.normalizeArabic(code)) : null;
    const byName = name ? pharmaciesByName.get(C.normalizeArabic(name)) : null;
    return String(byCode?.area || byCode?.Area || byCode?.region || byName?.area || byName?.Area || byName?.region || `-`).trim();
}

function lineValue(item = {}) {
    const total = C.parseNumber(item.total || item.rowTotal || item.subtotal);
    if (total) return total;
    return C.parseNumber(item.price) * C.parseNumber(item.qty);
}

function buildLookup(rows = [], keyFactory) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFactory(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    });
    return map;
}

function buildRows(orders, pharmacies) {
    const repKey = state.session.normalizedName || C.normalizeArabic(state.session.name);
    const pharmaciesByCode = new Map();
    const pharmaciesByName = new Map();
    pharmacies.forEach(pharmacy => {
        const code = String(pharmacy.pharmacyCode || pharmacy.pharmacy_code || pharmacy.code || pharmacy.id || ``).trim();
        const name = String(pharmacy.name || pharmacy.Name || ``).trim();
        if (code) pharmaciesByCode.set(C.normalizeArabic(code), pharmacy);
        if (name) pharmaciesByName.set(C.normalizeArabic(name), pharmacy);
    });

    const myAreaRules = state.areaRules.filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrep) === repKey);
    const myOtherShares = state.otherShares.filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrep) === repKey);
    const areaRuleMap = buildLookup(myAreaRules, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}|${rule.areaKey || C.normalizeArabic(rule.area)}`);
    const otherShareMap = buildLookup(myOtherShares, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}`);
    const result = [];

    orders.filter(isInvoicedOrder).forEach(order => {
        const area = getOrderArea(order, pharmaciesByCode, pharmaciesByName);
        const areaKey = C.normalizeArabic(area);
        const date = orderDate(order);
        const items = Array.isArray(order.items) ? order.items : [];

        items.forEach(item => {
            const itemName = String(item.name || item.itemName || item.productName || ``).trim();
            if (!itemName) return;
            const itemKey = C.normalizeItem(itemName);
            const qty = C.parseNumber(item.qty || item.quantity);
            const value = lineValue(item);
            const code = getProductCode(item);

            if (C.isOtherArea(area)) {
                const matches = otherShareMap.get(itemKey) || [];
                matches.forEach(match => {
                    const pct = C.parseNumber(match.percentage);
                    if (!pct) return;
                    result.push({
                        orderId: order.id,
                        date,
                        dateText: C.formatDate(date),
                        pharmacyName: order.pharmacyName || `-`,
                        pharmacyCode: getPharmacyCode(order),
                        area,
                        areaKey,
                        itemName,
                        itemKey,
                        productCode: code,
                        sourceQty: qty,
                        allocatedQty: qty * pct / 100,
                        sourceValue: value,
                        allocatedValue: value * pct / 100,
                        percentage: pct,
                        channel: `others`,
                        team: match.team || state.session.team || ``,
                        ruleNote: `منطقة اخرين`
                    });
                });
                return;
            }

            const matches = areaRuleMap.get(`${itemKey}|${areaKey}`) || [];
            matches.forEach(match => {
                result.push({
                    orderId: order.id,
                    date,
                    dateText: C.formatDate(date),
                    pharmacyName: order.pharmacyName || `-`,
                    pharmacyCode: getPharmacyCode(order),
                    area,
                    areaKey,
                    itemName,
                    itemKey,
                    productCode: code,
                    sourceQty: qty,
                    allocatedQty: qty,
                    sourceValue: value,
                    allocatedValue: value,
                    percentage: 100,
                    channel: `direct`,
                    team: match.team || state.session.team || ``,
                    ruleNote: `منطقة مباشرة`
                });
            });
        });
    });
    return result.sort((a, b) => (C.toDate(b.date)?.getTime() || 0) - (C.toDate(a.date)?.getTime() || 0));
}

function populateFilters() {
    const itemSelect = C.$(`itemFilter`);
    const areaSelect = C.$(`areaFilter`);
    const items = [...new Set(state.rows.map(row => row.itemName).filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
    const areas = [...new Set(state.rows.map(row => row.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
    itemSelect.innerHTML = `<option value="">كل الأصناف</option>${items.map(item => `<option value="${C.escapeHtml(item)}">${C.escapeHtml(item)}</option>`).join(``)}`;
    areaSelect.innerHTML = `<option value="">كل المناطق</option>${areas.map(area => `<option value="${C.escapeHtml(area)}">${C.escapeHtml(area)}</option>`).join(``)}`;
}

function applyFilters() {
    const from = C.$(`dateFrom`)?.value || ``;
    const to = C.$(`dateTo`)?.value || ``;
    const item = C.$(`itemFilter`)?.value || ``;
    const area = C.$(`areaFilter`)?.value || ``;
    const channel = C.$(`channelFilter`)?.value || `all`;
    const search = C.normalizeArabic(C.$(`searchInput`)?.value || ``);

    state.filtered = state.rows.filter(row => {
        if (!C.isWithinRange(row.date, from, to)) return false;
        if (item && row.itemName !== item) return false;
        if (area && row.area !== area) return false;
        if (channel !== `all` && row.channel !== channel) return false;
        if (search) {
            const haystack = C.normalizeArabic(`${row.pharmacyName} ${row.pharmacyCode} ${row.itemName} ${row.area} ${row.productCode}`);
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
    renderDashboard();
}

function targetForCurrentFilter() {
    const from = C.$(`dateFrom`)?.value || ``;
    const to = C.$(`dateTo`)?.value || ``;
    const item = C.$(`itemFilter`)?.value || ``;
    const repKey = state.session.normalizedName || C.normalizeArabic(state.session.name);
    const fromMonth = from ? from.slice(0, 7) : ``;
    const toMonth = to ? to.slice(0, 7) : ``;
    return state.targets
        .filter(row => C.normalizeArabic(row.medrep || row.medrepKey) === repKey || C.normalizeArabic(row.medrep) === repKey)
        .filter(row => !item || row.itemName === item)
        .filter(row => {
            const key = row.periodKey || `${row.year}-${String(row.month).padStart(2, `0`)}`;
            if (fromMonth && key < fromMonth) return false;
            if (toMonth && key > toMonth) return false;
            return true;
        })
        .reduce((acc, row) => {
            acc.value += C.parseNumber(row.targetValue);
            acc.qty += C.parseNumber(row.targetQty);
            return acc;
        }, { value: 0, qty: 0 });
}

function renderDashboard() {
    const totalValue = state.filtered.reduce((sum, row) => sum + C.parseNumber(row.allocatedValue), 0);
    const directValue = state.filtered.filter(row => row.channel === `direct`).reduce((sum, row) => sum + C.parseNumber(row.allocatedValue), 0);
    const otherValue = state.filtered.filter(row => row.channel === `others`).reduce((sum, row) => sum + C.parseNumber(row.allocatedValue), 0);
    const totalQty = state.filtered.reduce((sum, row) => sum + C.parseNumber(row.allocatedQty), 0);
    const targets = targetForCurrentFilter();
    const ach = targets.value ? (totalValue / targets.value) * 100 : null;

    C.$(`cardTotalValue`).textContent = `${C.formatMoney(totalValue)} د.أ`;
    C.$(`cardDirectValue`).textContent = `${C.formatMoney(directValue)} د.أ`;
    C.$(`cardOtherValue`).textContent = `${C.formatMoney(otherValue)} د.أ`;
    C.$(`cardQty`).textContent = C.formatQty(totalQty);
    C.$(`cardLines`).textContent = state.filtered.length.toLocaleString(`en-US`);
    C.$(`cardTarget`).textContent = targets.value ? `${C.formatMoney(targets.value)} د.أ` : `غير مرفوع`;
    C.$(`cardAch`).textContent = ach === null ? `-` : `${ach.toFixed(1)}%`;

    renderItemSummary();
    renderRowsTable();
}

function renderItemSummary() {
    const map = new Map();
    state.filtered.forEach(row => {
        const current = map.get(row.itemKey) || { itemName: row.itemName, qty: 0, value: 0, other: 0, direct: 0 };
        current.qty += C.parseNumber(row.allocatedQty);
        current.value += C.parseNumber(row.allocatedValue);
        if (row.channel === `others`) current.other += C.parseNumber(row.allocatedValue);
        if (row.channel === `direct`) current.direct += C.parseNumber(row.allocatedValue);
        map.set(row.itemKey, current);
    });
    const rows = [...map.values()].sort((a, b) => b.value - a.value).slice(0, 30);
    const target = C.$(`itemSummaryBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="5"><div class="empty-state compact">لا توجد بيانات ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td>${C.formatMoney(row.direct)}</td>
            <td class="other-cell">${C.formatMoney(row.other)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
        </tr>
    `).join(``);
}

function renderRowsTable() {
    const target = C.$(`salesRowsBody`);
    const rows = state.filtered.slice(0, 500);
    C.$(`visibleRowsNote`).textContent = state.filtered.length > 500 ? `يتم عرض أول 500 سطر فقط. استخدم التصدير لرؤية كامل البيانات.` : ``;
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="12"><div class="empty-state"><i class="ph ph-chart-line-down"></i><span>لا توجد مبيعات محتسبة لهذا المندوب ضمن الفلاتر الحالية.</span></div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="${row.channel === `others` ? `row-other` : ``}">
            <td>${C.escapeHtml(row.dateText)}</td>
            <td>${C.escapeHtml(row.area)}</td>
            <td>${C.escapeHtml(row.pharmacyName)}</td>
            <td>${C.escapeHtml(row.pharmacyCode || `-`)}</td>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.escapeHtml(row.productCode || `-`)}</td>
            <td>${C.formatQty(row.sourceQty)}</td>
            <td>${C.formatQty(row.allocatedQty)}</td>
            <td>${C.formatMoney(row.sourceValue)}</td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
            <td>${row.channel === `others` ? `<span class="badge badge-other">اخرين ${C.parseNumber(row.percentage)}%</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
            <td>${C.escapeHtml((row.orderId || ``).slice(0, 6).toUpperCase())}</td>
        </tr>
    `).join(``);
}

async function loadDashboard() {
    const button = C.$(`refreshBtn`);
    try {
        C.setLoading(button, true, `تحديث البيانات`);
        const [orders, pharmacies, areaRules, otherShares, targets] = await Promise.all([
            getAll(`orders`),
            getAll(`pharmacies`),
            getAll(`medicalRepAreaRules`),
            getAll(`medicalRepOtherShares`),
            getAll(`medicalRepTargets`)
        ]);
        state.areaRules = areaRules;
        state.otherShares = otherShares;
        state.targets = targets;
        state.rows = buildRows(orders, pharmacies);
        state.ordersLoadedAt = new Date();
        C.$(`lastRefresh`).textContent = `آخر تحديث: ${state.ordersLoadedAt.toLocaleString(`ar-JO`)}`;
        populateFilters();
        applyFilters();
        if (!state.rows.length) C.showToast(`لا توجد مبيعات محتسبة. تحقق من رفع ربط المناطق ونسب اخرين.`, `warning`);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات المبيعات. تحقق من الصلاحيات والاتصال.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function exportRows() {
    if (!state.filtered.length) return C.showToast(`لا توجد بيانات للتصدير.`, `warning`);
    const rows = state.filtered.map(row => ({
        'Date': row.dateText,
        'Team': row.team || state.session.team || ``,
        'Medical Rep': state.session.name,
        'Area': row.area,
        'Pharmacy Code': row.pharmacyCode,
        'Pharmacy': row.pharmacyName,
        'Product Code': row.productCode,
        'Item Name': row.itemName,
        'Source Qty': row.sourceQty,
        'Allocated Qty': row.allocatedQty,
        'Source Value': row.sourceValue,
        'Allocated Value': row.allocatedValue,
        'Channel': row.channel === `others` ? `Other Area` : `Direct Area`,
        'Other %': row.channel === `others` ? `${row.percentage}%` : `100%`,
        'Order ID': row.orderId
    }));
    C.downloadWorkbook(rows, `Medical Rep Sales`, `medical_rep_sales_${state.session.employeeNo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function bindEvents() {
    C.$(`logoutBtn`)?.addEventListener(`click`, () => {
        C.clearSession();
        window.location.href = `index.html`;
    });
    C.$(`refreshBtn`)?.addEventListener(`click`, loadDashboard);
    C.$(`exportBtn`)?.addEventListener(`click`, exportRows);
    [`dateFrom`, `dateTo`, `itemFilter`, `areaFilter`, `channelFilter`, `searchInput`].forEach(id => {
        C.$(id)?.addEventListener(id === `searchInput` ? `input` : `change`, applyFilters);
    });
}

function initDefaults() {
    if (C.$(`dateFrom`) && !C.$(`dateFrom`).value) C.$(`dateFrom`).value = C.firstDayOfMonth();
    if (C.$(`dateTo`) && !C.$(`dateTo`).value) C.$(`dateTo`).value = C.toDateInputValue(new Date());
}

if (requireSession()) {
    bindEvents();
    initDefaults();
    loadDashboard();
}
