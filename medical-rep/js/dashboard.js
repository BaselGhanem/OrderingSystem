import { loadCoreData, buildRowsForRep, targetForRows } from './analytics-engine.js';

const C = window.medrepCommon;
const state = {
    session: null,
    core: null,
    rows: [],
    filtered: [],
    orderGroups: []
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
    if (session.adminPreview && C.readAdminSession()?.role === `medical_rep_admin`) {
        C.$(`adminBackLink`).hidden = false;
    }
    return session;
}

function populateFilters() {
    const itemSelect = C.$(`itemFilter`);
    const areaSelect = C.$(`areaFilter`);
    const items = [...new Set(state.rows.map(row => row.itemName).filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
    const areas = [...new Set(state.rows.map(row => row.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
    const oldItem = itemSelect.value;
    const oldArea = areaSelect.value;
    itemSelect.innerHTML = `<option value="">كل الأصناف</option>${items.map(item => `<option value="${C.escapeHtml(item)}">${C.escapeHtml(item)}</option>`).join(``)}`;
    areaSelect.innerHTML = `<option value="">كل المناطق</option>${areas.map(area => `<option value="${C.escapeHtml(area)}">${C.escapeHtml(area)}</option>`).join(``)}`;
    if (oldItem) itemSelect.value = oldItem;
    if (oldArea) areaSelect.value = oldArea;
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
            const haystack = C.normalizeArabic(`${row.pharmacyName} ${row.pharmacyCode} ${row.itemName} ${row.area} ${row.salesRepName} ${row.orderShort}`);
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
    state.orderGroups = buildOrderGroups(state.filtered);
    renderDashboard();
}

function buildOrderGroups(rows = []) {
    const groups = [];
    C.groupBy(rows, row => row.orderId).forEach(groupRows => {
        const first = groupRows[0] || {};
        groups.push({
            orderId: first.orderId,
            orderShort: first.orderShort,
            date: first.date,
            dateText: first.dateText,
            pharmacyName: first.pharmacyName,
            pharmacyCode: first.pharmacyCode,
            area: first.area,
            lineCount: groupRows.length,
            itemCount: new Set(groupRows.map(row => row.itemKey)).size,
            qty: C.sumRows(groupRows, `allocatedQty`),
            value: C.sumRows(groupRows, `allocatedValue`),
            sourceValue: C.sumRows(groupRows, `sourceValue`),
            otherValue: C.sumRows(groupRows.filter(row => row.channel === `others`), `allocatedValue`),
            rows: groupRows
        });
    });
    return groups.sort((a, b) => (C.toDate(b.date)?.getTime() || 0) - (C.toDate(a.date)?.getTime() || 0));
}

function aggregateBy(rows = [], keyFactory, seedFactory, reducer) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFactory(row);
        const current = map.get(key) || seedFactory(row);
        reducer(current, row);
        map.set(key, current);
    });
    return [...map.values()];
}

function renderDashboard() {
    const totalValue = C.sumRows(state.filtered, `allocatedValue`);
    const directRows = state.filtered.filter(row => row.channel === `direct`);
    const otherRows = state.filtered.filter(row => row.channel === `others`);
    const directValue = C.sumRows(directRows, `allocatedValue`);
    const otherValue = C.sumRows(otherRows, `allocatedValue`);
    const totalQty = C.sumRows(state.filtered, `allocatedQty`);
    const directQty = C.sumRows(directRows, `allocatedQty`);
    const otherQty = C.sumRows(otherRows, `allocatedQty`);
    const sourceOtherValue = C.sumRows(otherRows, `sourceValue`);
    const target = targetForRows(state.filtered, state.core?.targets || [], {
        repName: state.session.name,
        team: state.session.team,
        itemName: C.$(`itemFilter`)?.value || ``,
        from: C.$(`dateFrom`)?.value || ``,
        to: C.$(`dateTo`)?.value || ``
    });
    const achValue = target.value ? (totalValue / target.value) * 100 : null;
    const activePharmacies = new Set(state.filtered.map(row => row.pharmacyCode || row.pharmacyName).filter(Boolean)).size;
    const activeItems = new Set(state.filtered.map(row => row.itemKey).filter(Boolean)).size;
    const avgPrice = totalQty ? totalValue / totalQty : 0;

    C.$(`heroValue`).textContent = C.formatMoney(totalValue);
    C.$(`heroQty`).textContent = C.formatQty(totalQty);
    C.$(`cardTotalValue`).textContent = `${C.formatMoney(totalValue)} د.أ`;
    C.$(`cardAvgPrice`).textContent = `متوسط السعر: ${C.formatMoney(avgPrice)}`;
    C.$(`cardQty`).textContent = C.formatQty(totalQty);
    C.$(`cardLines`).textContent = `${state.filtered.length.toLocaleString(`en-US`)} سطر`;
    C.$(`cardDirectValue`).textContent = `${C.formatMoney(directValue)} د.أ`;
    C.$(`cardDirectQty`).textContent = `${C.formatQty(directQty)} كمية`;
    C.$(`cardOtherValue`).textContent = `${C.formatMoney(otherValue)} د.أ`;
    C.$(`cardOtherQty`).textContent = `${C.formatQty(otherQty)} كمية`;
    C.$(`cardPharmacies`).textContent = activePharmacies.toLocaleString(`en-US`);
    C.$(`cardItems`).textContent = activeItems.toLocaleString(`en-US`);
    C.$(`cardTarget`).textContent = target.value ? `${C.formatMoney(target.value)} د.أ` : `غير مرفوع`;
    C.$(`cardAch`).textContent = `Achievement: ${achValue === null ? `-` : `${achValue.toFixed(1)}%`}`;
    C.$(`otherContribution`).textContent = totalValue ? `${((otherValue / totalValue) * 100).toFixed(1)}%` : `0%`;

    renderInsightCards();
    renderItemSummary();
    renderOtherSummary(sourceOtherValue);
    renderOrdersTable();
    renderMobileCards();
    renderRowsTable();
}

function renderInsightCards() {
    const byItem = aggregateBy(state.filtered, row => row.itemKey, row => ({ itemName: row.itemName, value: 0, qty: 0 }), (acc, row) => {
        acc.value += C.parseNumber(row.allocatedValue);
        acc.qty += C.parseNumber(row.allocatedQty);
    }).sort((a, b) => b.value - a.value);
    const byItemQty = [...byItem].sort((a, b) => b.qty - a.qty);
    const byPharmacy = aggregateBy(state.filtered, row => row.pharmacyCode || row.pharmacyName, row => ({ pharmacyName: row.pharmacyName, value: 0, qty: 0 }), (acc, row) => {
        acc.value += C.parseNumber(row.allocatedValue);
        acc.qty += C.parseNumber(row.allocatedQty);
    }).sort((a, b) => b.value - a.value);
    const bestValue = byItem[0];
    const bestQty = byItemQty[0];
    const bestPharmacy = byPharmacy[0];
    C.$(`bestItemByValue`).textContent = bestValue?.itemName || `-`;
    C.$(`bestItemByValueMeta`).textContent = bestValue ? `${C.formatMoney(bestValue.value)} د.أ / ${C.formatQty(bestValue.qty)} كمية` : `-`;
    C.$(`bestItemByQty`).textContent = bestQty?.itemName || `-`;
    C.$(`bestItemByQtyMeta`).textContent = bestQty ? `${C.formatQty(bestQty.qty)} كمية / ${C.formatMoney(bestQty.value)} د.أ` : `-`;
    C.$(`bestPharmacy`).textContent = bestPharmacy?.pharmacyName || `-`;
    C.$(`bestPharmacyMeta`).textContent = bestPharmacy ? `${C.formatMoney(bestPharmacy.value)} د.أ / ${C.formatQty(bestPharmacy.qty)} كمية` : `-`;
}

function renderItemSummary() {
    const rows = aggregateBy(state.filtered, row => row.itemKey, row => ({ itemName: row.itemName, qty: 0, value: 0, other: 0, direct: 0 }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
        if (row.channel === `others`) acc.other += C.parseNumber(row.allocatedValue);
        if (row.channel === `direct`) acc.direct += C.parseNumber(row.allocatedValue);
    }).sort((a, b) => b.value - a.value).slice(0, 60);
    const target = C.$(`itemSummaryBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="6"><div class="empty-state compact">لا توجد بيانات ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td>${C.formatMoney(row.direct)}</td>
            <td class="other-cell">${C.formatMoney(row.other)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td>${row.value ? `${((row.other / row.value) * 100).toFixed(1)}%` : `0%`}</td>
        </tr>
    `).join(``);
}

function renderOtherSummary() {
    const rows = aggregateBy(state.filtered.filter(row => row.channel === `others`), row => `${row.itemKey}|${row.percentage}`, row => ({ itemName: row.itemName, percentage: row.percentage, sourceQty: 0, sourceValue: 0, allocatedQty: 0, allocatedValue: 0 }), (acc, row) => {
        acc.sourceQty += C.parseNumber(row.sourceQty);
        acc.sourceValue += C.parseNumber(row.sourceValue);
        acc.allocatedQty += C.parseNumber(row.allocatedQty);
        acc.allocatedValue += C.parseNumber(row.allocatedValue);
    }).sort((a, b) => b.allocatedValue - a.allocatedValue);
    const target = C.$(`otherSummaryBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="6"><div class="empty-state compact">لا توجد مبيعات اخرين ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="row-other">
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td><span class="badge badge-other">${C.parseNumber(row.percentage)}%</span></td>
            <td>${C.formatQty(row.sourceQty)}</td>
            <td>${C.formatMoney(row.sourceValue)}</td>
            <td><strong>${C.formatQty(row.allocatedQty)}</strong></td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
        </tr>
    `).join(``);
}

function renderOrdersTable() {
    const rows = state.orderGroups.slice(0, 120);
    const target = C.$(`ordersBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="8"><div class="empty-state compact">لا توجد طلبيات ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(order => `
        <tr>
            <td>${C.escapeHtml(order.dateText)}</td>
            <td class="item-name">${C.escapeHtml(order.pharmacyName)}</td>
            <td>${C.escapeHtml(order.area)}</td>
            <td>${order.itemCount}</td>
            <td>${C.formatQty(order.qty)}</td>
            <td><strong>${C.formatMoney(order.value)}</strong></td>
            <td>${order.otherValue ? `<span class="badge badge-other">${C.formatMoney(order.otherValue)}</span>` : `<span class="badge badge-direct">لا يوجد</span>`}</td>
            <td><button class="btn btn-mini btn-light" type="button" data-order-id="${C.escapeHtml(order.orderId)}"><i class="ph ph-eye"></i> عرض</button></td>
        </tr>
    `).join(``);
}

function renderMobileCards() {
    const target = C.$(`mobileCards`);
    const rows = state.filtered.slice(0, 40);
    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact">لا توجد بيانات.</div>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <article class="line-card ${row.channel === `others` ? `is-other` : ``}">
            <div class="line-card-top">
                <strong>${C.escapeHtml(row.itemName)}</strong>
                ${row.channel === `others` ? `<span class="badge badge-other">اخرين ${C.parseNumber(row.percentage)}%</span>` : `<span class="badge badge-direct">مباشر</span>`}
            </div>
            <div class="line-card-meta"><span>${C.escapeHtml(row.pharmacyName)}</span><span>${C.escapeHtml(row.area)}</span></div>
            <div class="line-card-numbers">
                <div><span>كمية</span><strong>${C.formatQty(row.allocatedQty)}</strong></div>
                <div><span>قيمة</span><strong>${C.formatMoney(row.allocatedValue)}</strong></div>
                <div><span>أصلية</span><strong>${C.formatMoney(row.sourceValue)}</strong></div>
            </div>
        </article>
    `).join(``);
}

function renderRowsTable() {
    const target = C.$(`salesRowsBody`);
    const rows = state.filtered.slice(0, 700);
    C.$(`visibleRowsNote`).textContent = state.filtered.length > 700 ? `يتم عرض أول 700 سطر فقط. استخدم التصدير لرؤية كامل البيانات.` : ``;
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="12"><div class="empty-state"><i class="ph ph-chart-line-down"></i><span>لا توجد مبيعات محتسبة لهذا المندوب ضمن الفلاتر الحالية.</span></div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="${row.channel === `others` ? `row-other` : ``}">
            <td>${C.escapeHtml(row.dateText)}</td>
            <td>${C.escapeHtml(row.area)}</td>
            <td class="item-name">${C.escapeHtml(row.pharmacyName)}</td>
            <td>${C.escapeHtml(row.pharmacyCode || `-`)}</td>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.sourceQty)}</td>
            <td><strong>${C.formatQty(row.allocatedQty)}</strong></td>
            <td>${C.formatMoney(row.sourceValue)}</td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
            <td>${row.channel === `others` ? `${C.parseNumber(row.percentage)}%` : `100%`}</td>
            <td>${row.channel === `others` ? `<span class="badge badge-other">اخرين</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
            <td><button class="btn btn-mini btn-light" type="button" data-order-id="${C.escapeHtml(row.orderId)}"><i class="ph ph-eye"></i></button></td>
        </tr>
    `).join(``);
}

function openOrderModal(orderId) {
    const order = state.orderGroups.find(item => item.orderId === orderId);
    if (!order) return;
    const rowsHtml = order.rows.map(row => `
        <tr class="${row.channel === `others` ? `row-other` : ``}">
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.sourceQty)}</td>
            <td>${C.formatQty(row.allocatedQty)}</td>
            <td>${C.formatMoney(row.sourceValue)}</td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
            <td>${row.channel === `others` ? `${C.parseNumber(row.percentage)}%` : `100%`}</td>
            <td>${row.channel === `others` ? `اخرين` : `مباشر`}</td>
        </tr>
    `).join(``);
    C.$(`orderModalContent`).innerHTML = `
        <div class="modal-head">
            <div>
                <span class="eyebrow"><i class="ph ph-receipt"></i> طلبية مفوترة</span>
                <h2>${C.escapeHtml(order.pharmacyName)}</h2>
                <p>${C.escapeHtml(order.area)} • ${C.escapeHtml(order.dateText)} • كود ${C.escapeHtml(order.pharmacyCode || `-`)} • طلب ${C.escapeHtml(order.orderShort)}</p>
            </div>
        </div>
        <div class="modal-stats">
            <div><span>قيمة محتسبة</span><strong>${C.formatMoney(order.value)} د.أ</strong></div>
            <div><span>كمية محتسبة</span><strong>${C.formatQty(order.qty)}</strong></div>
            <div><span>أصناف</span><strong>${order.itemCount}</strong></div>
            <div><span>اخرين</span><strong>${C.formatMoney(order.otherValue)}</strong></div>
        </div>
        <p class="privacy-note"><i class="ph ph-shield-check"></i> البونص مخفي بالكامل عن مندوب الدعاية الطبية.</p>
        <div class="table-scroll">
            <table class="data-table compact-table">
                <thead><tr><th>الصنف</th><th>الكمية الأصلية</th><th>الكمية المحتسبة</th><th>قيمة السطر</th><th>القيمة المحتسبة</th><th>النسبة</th><th>النوع</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
    C.$(`orderModal`).hidden = false;
}

async function loadDashboard(force = false) {
    const button = C.$(`refreshBtn`);
    try {
        C.setLoading(button, true, force ? `تحديث مباشر` : `تحميل`);
        state.core = await loadCoreData(force);
        state.rows = buildRowsForRep(state.session, state.core);
        C.$(`lastRefresh`).textContent = new Date().toLocaleTimeString(`ar-JO`, { hour: `2-digit`, minute: `2-digit` });
        C.$(`cacheStatus`).textContent = state.core.cacheText || `-`;
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
        'Sales Rep': row.salesRepName,
        'Item Name': row.itemName,
        'Source Qty': row.sourceQty,
        'Allocated Qty': row.allocatedQty,
        'Source Value': row.sourceValue,
        'Allocated Value': row.allocatedValue,
        'Channel': row.channel === `others` ? `Other Area` : `Direct Area`,
        'My Other %': row.channel === `others` ? `${row.percentage}%` : `100%`,
        'Order ID': row.orderId
    }));
    C.downloadWorkbook(rows, `Medical Rep Sales`, `medical_rep_sales_${state.session.employeeNo}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function bindEvents() {
    C.$(`logoutBtn`)?.addEventListener(`click`, () => {
        C.clearSession();
        window.location.href = `index.html`;
    });
    C.$(`refreshBtn`)?.addEventListener(`click`, () => loadDashboard(true));
    C.$(`exportBtn`)?.addEventListener(`click`, exportRows);
    C.$(`closeOrderModal`)?.addEventListener(`click`, () => C.$(`orderModal`).hidden = true);
    C.$(`orderModal`)?.addEventListener(`click`, event => {
        if (event.target.id === `orderModal`) C.$(`orderModal`).hidden = true;
    });
    document.body.addEventListener(`click`, event => {
        const button = event.target.closest(`[data-order-id]`);
        if (button) openOrderModal(button.dataset.orderId);
    });
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
    loadDashboard(false);
}
