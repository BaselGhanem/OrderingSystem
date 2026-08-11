import { loadCoreData, buildRowsForRep, targetForRows } from './analytics-engine.js';

const C = window.medrepCommon;
const state = {
    session: null,
    core: null,
    rows: [],
    filtered: [],
    orderGroups: [],
    ui: {
        showOther: false,
        showTarget: false
    }
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

function repKey() {
    return state.session?.normalizedName || C.normalizeArabic(state.session?.name || ``);
}

function selectedItemKey() {
    const item = C.$(`itemFilter`)?.value || ``;
    return item ? C.normalizeItem(item) : ``;
}

function selectedDateFilters() {
    return {
        from: C.$(`dateFrom`)?.value || ``,
        to: C.$(`dateTo`)?.value || ``
    };
}

function hasConfiguredOtherShares() {
    const currentRepKey = repKey();
    const itemKey = selectedItemKey();
    return (state.core?.otherShares || []).some(rule => {
        const ruleRepKey = C.normalizeArabic(rule.medrep || rule.medrepKey || ``);
        const ruleItemKey = rule.itemKey || C.normalizeItem(rule.itemName || ``);
        const pct = C.parsePercentageRatio(rule.percentage);
        if (!pct) return false;
        if (currentRepKey && ruleRepKey !== currentRepKey) return false;
        if (itemKey && ruleItemKey !== itemKey) return false;
        return true;
    });
}

function hasTargetData(target = {}) {
    return C.parseNumber(target.value) > 0 || C.parseNumber(target.qty) > 0;
}

function setFeatureVisibility(feature, visible) {
    document.querySelectorAll(`[data-feature="${feature}"]`).forEach(element => {
        element.hidden = !visible;
    });
}

function updateConditionalUi(showOther, showTarget) {
    state.ui.showOther = showOther;
    state.ui.showTarget = showTarget;
    setFeatureVisibility(`others`, showOther);
    setFeatureVisibility(`target`, showTarget);

    const channelFilter = C.$(`channelFilter`);
    const otherOption = channelFilter?.querySelector(`option[value="others"]`);
    if (otherOption) otherOption.hidden = !showOther;
    if (!showOther && channelFilter?.value === `others`) channelFilter.value = `all`;
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
    const showOther = hasConfiguredOtherShares();
    let channel = C.$(`channelFilter`)?.value || `all`;
    if (!showOther && channel === `others`) {
        C.$(`channelFilter`).value = `all`;
        channel = `all`;
    }
    const search = C.normalizeArabic(C.$(`searchInput`)?.value || ``);

    state.filtered = state.rows.filter(row => {
        if (!C.isWithinRange(row.date, from, to)) return false;
        if (item && row.itemName !== item) return false;
        if (area && row.area !== area) return false;
        if (!showOther && row.channel === `others`) return false;
        if (channel !== `all` && row.channel !== channel) return false;
        if (search) {
            const haystack = row.channel === `others`
                ? C.normalizeArabic(`${row.itemName} اخرين مبيعات محتسبة`)
                : C.normalizeArabic(`${row.pharmacyName} ${row.pharmacyCode} ${row.itemName} ${row.area} ${row.salesRepName} ${row.orderShort}`);
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
    state.orderGroups = buildOrderGroups(directDetailRows(state.filtered));
    renderDashboard(showOther);
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

function directDetailRows(rows = state.filtered) {
    return rows.filter(row => row.channel !== `others`);
}

function otherOnlyRows(rows = state.filtered) {
    return rows.filter(row => row.channel === `others`);
}

function otherItemSummaryRows(rows = state.filtered) {
    return aggregateBy(otherOnlyRows(rows), row => row.itemKey, row => ({
        itemName: row.itemName,
        qty: 0,
        value: 0
    }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
    }).sort((a, b) => b.value - a.value);
}

function renderDashboard(showOtherFromFilters = false) {
    const totalValue = C.sumRows(state.filtered, `allocatedValue`);
    const directRows = directDetailRows(state.filtered);
    const otherRows = otherOnlyRows(state.filtered);
    const directValue = C.sumRows(directRows, `allocatedValue`);
    const otherValue = C.sumRows(otherRows, `allocatedValue`);
    const totalQty = C.sumRows(state.filtered, `allocatedQty`);
    const directQty = C.sumRows(directRows, `allocatedQty`);
    const otherQty = C.sumRows(otherRows, `allocatedQty`);
    const target = targetForRows(state.filtered, state.core?.targets || [], {
        repName: state.session.name,
        team: state.session.team,
        itemName: C.$(`itemFilter`)?.value || ``,
        from: C.$(`dateFrom`)?.value || ``,
        to: C.$(`dateTo`)?.value || ``
    });
    const showTarget = hasTargetData(target);
    const showOther = !!showOtherFromFilters;
    updateConditionalUi(showOther, showTarget);

    const targetValue = C.parseNumber(target.value);
    const targetQty = C.parseNumber(target.qty);
    const achValue = targetValue ? (totalValue / targetValue) * 100 : null;
    const achQty = targetQty ? (totalQty / targetQty) * 100 : null;
    const activePharmacies = new Set(directRows.map(row => row.pharmacyCode || row.pharmacyName).filter(Boolean)).size;
    const activeItems = new Set(state.filtered.map(row => row.itemKey).filter(Boolean)).size;
    const avgPrice = totalQty ? totalValue / totalQty : 0;

    C.$(`heroValue`).textContent = C.formatMoney(totalValue);
    C.$(`heroQty`).textContent = C.formatQty(totalQty);
    C.$(`cardTotalValue`).textContent = `${C.formatMoney(totalValue)} د.أ`;
    C.$(`cardAvgPrice`).textContent = `متوسط السعر: ${C.formatMoney(avgPrice)}`;
    C.$(`cardQty`).textContent = C.formatQty(totalQty);
    C.$(`cardLines`).textContent = `تفاصيل مباشرة: ${directRows.length.toLocaleString(`en-US`)} سطر`;
    C.$(`cardDirectValue`).textContent = `${C.formatMoney(directValue)} د.أ`;
    C.$(`cardDirectQty`).textContent = `${C.formatQty(directQty)} كمية`;
    C.$(`cardOtherValue`).textContent = `${C.formatMoney(otherValue)} د.أ`;
    C.$(`cardOtherQty`).textContent = `${C.formatQty(otherQty)} كمية`;
    C.$(`cardPharmacies`).textContent = activePharmacies.toLocaleString(`en-US`);
    C.$(`cardItems`).textContent = activeItems.toLocaleString(`en-US`);

    if (showTarget) {
        C.$(`cardTarget`).textContent = targetValue ? `${C.formatMoney(targetValue)} د.أ` : `${C.formatQty(targetQty)} كمية`;
        C.$(`cardAch`).textContent = targetValue ? `Achievement: ${achValue.toFixed(1)}%` : `Qty Achievement: ${achQty.toFixed(1)}%`;
    }

    C.$(`otherContribution`).textContent = totalValue ? `${((otherValue / totalValue) * 100).toFixed(1)}%` : `0%`;

    renderInsightCards();
    renderItemSummary(showOther);
    renderOtherSummary(showOther);
    renderOrdersTable(showOther);
    renderMobileCards(showOther);
    renderRowsTable(showOther);
    renderAreaChart();
}


function renderAreaChart() {
    const target = C.$(`areaChart`);
    const meta = C.$(`areaChartMeta`);
    if (!target) return;
    const rows = aggregateBy(directDetailRows(state.filtered), row => row.areaKey || C.normalizeArabic(row.area), row => ({
        area: row.area || `-`,
        value: 0,
        qty: 0,
        pharmacies: new Set()
    }), (acc, row) => {
        acc.value += C.parseNumber(row.allocatedValue);
        acc.qty += C.parseNumber(row.allocatedQty);
        if (row.pharmacyCode || row.pharmacyName) acc.pharmacies.add(row.pharmacyCode || row.pharmacyName);
    }).sort((a, b) => b.value - a.value).slice(0, 12);

    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-chart-bar"></i><span>لا توجد بيانات مباشرة حسب المنطقة. ملخص اخرين يظهر حسب الصنف فقط.</span></div>`;
        if (meta) meta.textContent = `مباشر فقط`;
        return;
    }

    const maxValue = Math.max(...rows.map(row => C.parseNumber(row.value)), 1);
    const top = rows[0];
    if (meta) meta.textContent = `${rows.length} منطقة مباشرة • الأعلى: ${top.area} (${C.formatMoney(top.value)} د.أ)`;
    target.innerHTML = rows.map((row, index) => {
        const width = Math.max(4, (C.parseNumber(row.value) / maxValue) * 100);
        return `
            <div class="chart-row">
                <div class="chart-rank">${index + 1}</div>
                <div class="chart-main">
                    <div class="chart-label"><strong>${C.escapeHtml(row.area)}</strong><span>${C.formatQty(row.qty)} كمية • ${row.pharmacies.size} صيدلية</span></div>
                    <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
                </div>
                <div class="chart-value">${C.formatMoney(row.value)}</div>
            </div>
        `;
    }).join(``);
}

function renderInsightCards() {
    const byItem = aggregateBy(state.filtered, row => row.itemKey, row => ({ itemName: row.itemName, value: 0, qty: 0 }), (acc, row) => {
        acc.value += C.parseNumber(row.allocatedValue);
        acc.qty += C.parseNumber(row.allocatedQty);
    }).sort((a, b) => b.value - a.value);
    const byItemQty = [...byItem].sort((a, b) => b.qty - a.qty);
    const byPharmacy = aggregateBy(directDetailRows(state.filtered), row => row.pharmacyCode || row.pharmacyName, row => ({ pharmacyName: row.pharmacyName, value: 0, qty: 0 }), (acc, row) => {
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
    C.$(`bestPharmacyMeta`).textContent = bestPharmacy ? `${C.formatMoney(bestPharmacy.value)} د.أ / ${C.formatQty(bestPharmacy.qty)} كمية` : `مباشر فقط`;
}

function renderItemSummary(showOther) {
    const rows = aggregateBy(state.filtered, row => row.itemKey, row => ({ itemName: row.itemName, qty: 0, value: 0, other: 0, direct: 0, lines: 0 }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
        acc.lines += 1;
        if (row.channel === `others`) acc.other += C.parseNumber(row.allocatedValue);
        if (row.channel === `direct`) acc.direct += C.parseNumber(row.allocatedValue);
    }).sort((a, b) => b.value - a.value).slice(0, 60);
    const target = C.$(`itemSummaryBody`);
    const head = C.$(`itemSummaryHead`);

    if (showOther) {
        head.innerHTML = `<tr><th>الصنف</th><th>الكمية</th><th>مباشر</th><th>اخرين</th><th>الإجمالي</th><th>% اخرين</th></tr>`;
    } else {
        head.innerHTML = `<tr><th>الصنف</th><th>الكمية</th><th>قيمة البيع</th><th>عدد السطور</th></tr>`;
    }

    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="${showOther ? 6 : 4}"><div class="empty-state compact">لا توجد بيانات ضمن الفلاتر.</div></td></tr>`;
        return;
    }

    target.innerHTML = rows.map(row => showOther ? `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td>${C.formatMoney(row.direct)}</td>
            <td class="other-cell">${C.formatMoney(row.other)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td>${row.value ? `${((row.other / row.value) * 100).toFixed(1)}%` : `0%`}</td>
        </tr>
    ` : `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td>${row.lines}</td>
        </tr>
    `).join(``);
}

function renderOtherSummary(showOther) {
    const target = C.$(`otherSummaryBody`);
    const head = C.$(`otherSummaryHead`);
    if (head) head.innerHTML = `<tr><th>الصنف</th><th>كمية اخرين المحتسبة</th><th>قيمة اخرين المحتسبة</th></tr>`;
    if (!showOther) {
        target.innerHTML = ``;
        return;
    }
    const rows = otherItemSummaryRows(state.filtered);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="3"><div class="empty-state compact">لا توجد مبيعات اخرين ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="row-other">
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td><strong>${C.formatQty(row.qty)}</strong></td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
        </tr>
    `).join(``);
}

function renderOrdersTable(showOther) {
    const rows = state.orderGroups.slice(0, 120);
    const target = C.$(`ordersBody`);
    const head = C.$(`ordersHead`);
    head.innerHTML = `<tr><th>التاريخ</th><th>الصيدلية</th><th>المنطقة</th><th>عدد الأصناف</th><th>الكمية</th><th>القيمة</th><th>تفاصيل</th></tr>`;

    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="7"><div class="empty-state compact">لا توجد طلبيات مباشرة ضمن الفلاتر. مبيعات اخرين تظهر كملخص أصناف فقط.</div></td></tr>`;
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
            <td><button class="btn btn-mini btn-light" type="button" data-order-id="${C.escapeHtml(order.orderId)}"><i class="ph ph-eye"></i> عرض</button></td>
        </tr>
    `).join(``);
}

function renderMobileCards(showOther) {
    const target = C.$(`mobileCards`);
    const rows = directDetailRows(state.filtered).slice(0, 50);
    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact">لا توجد تفاصيل مباشرة. مبيعات اخرين تظهر في ملخص الأصناف فقط.</div>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <article class="line-card">
            <div class="line-card-top">
                <strong>${C.escapeHtml(row.itemName)}</strong>
                <span class="badge badge-direct">مباشر</span>
            </div>
            <div class="line-card-meta"><span>${C.escapeHtml(row.pharmacyName)}</span><span>${C.escapeHtml(row.area)}</span></div>
            <div class="line-card-numbers two-metrics">
                <div><span>كمية</span><strong>${C.formatQty(row.allocatedQty)}</strong></div>
                <div><span>قيمة</span><strong>${C.formatMoney(row.allocatedValue)}</strong></div>
            </div>
            <button class="line-card-action" type="button" data-order-id="${C.escapeHtml(row.orderId)}"><i class="ph ph-receipt"></i> تفاصيل الطلبية</button>
        </article>
    `).join(``);
}

function renderRowsTable(showOther) {
    const target = C.$(`salesRowsBody`);
    const head = C.$(`salesRowsHead`);
    const rows = directDetailRows(state.filtered).slice(0, 700);
    head.innerHTML = `<tr><th>التاريخ</th><th>المنطقة</th><th>الصيدلية</th><th>كود الصيدلية</th><th>الصنف</th><th>الكمية</th><th>القيمة</th><th>تفاصيل الطلب</th></tr>`;
    const directCount = directDetailRows(state.filtered).length;
    C.$(`visibleRowsNote`).textContent = directCount > 700 ? `يتم عرض أول 700 سطر مباشر فقط. استخدم التصدير لرؤية كامل التفاصيل المباشرة. مبيعات اخرين تبقى ملخص أصناف فقط.` : `مبيعات اخرين لا تعرض تفاصيل صيدلية أو طلبية أو مندوب؛ تظهر كقيمة وكمية حسب الصنف فقط.`;
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="8"><div class="empty-state"><i class="ph ph-chart-line-down"></i><span>لا توجد مبيعات مباشرة ضمن الفلاتر الحالية. راجع ملخص الأصناف لمبيعات اخرين.</span></div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr>
            <td>${C.escapeHtml(row.dateText)}</td>
            <td>${C.escapeHtml(row.area)}</td>
            <td class="item-name">${C.escapeHtml(row.pharmacyName)}</td>
            <td>${C.escapeHtml(row.pharmacyCode || `-`)}</td>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td><strong>${C.formatQty(row.allocatedQty)}</strong></td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
            <td><button class="btn btn-mini btn-light" type="button" data-order-id="${C.escapeHtml(row.orderId)}"><i class="ph ph-eye"></i></button></td>
        </tr>
    `).join(``);
}

function openOrderModal(orderId) {
    const order = state.orderGroups.find(item => item.orderId === orderId);
    if (!order) return;
    const rowsHtml = order.rows.map(row => `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td><strong>${C.formatQty(row.allocatedQty)}</strong></td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
        </tr>
    `).join(``);
    C.$(`orderModalContent`).innerHTML = `
        <div class="modal-head">
            <div>
                <span class="eyebrow"><i class="ph ph-receipt"></i> طلبية مباشرة</span>
                <h2>${C.escapeHtml(order.pharmacyName)}</h2>
                <p>${C.escapeHtml(order.area)} • ${C.escapeHtml(order.dateText)} • كود ${C.escapeHtml(order.pharmacyCode || `-`)} • طلب ${C.escapeHtml(order.orderShort)}</p>
            </div>
        </div>
        <div class="modal-stats modal-stats-compact">
            <div><span>قيمة مباشرة</span><strong>${C.formatMoney(order.value)} د.أ</strong></div>
            <div><span>كمية مباشرة</span><strong>${C.formatQty(order.qty)}</strong></div>
            <div><span>أصناف</span><strong>${order.itemCount}</strong></div>
        </div>
        <div class="table-scroll">
            <table class="data-table compact-table">
                <thead><tr><th>الصنف</th><th>الكمية</th><th>القيمة</th></tr></thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
    C.$(`orderModal`).hidden = false;
}

function applyCoreData(core, options = {}) {
    state.core = core;
    state.rows = buildRowsForRep(state.session, state.core);
    C.$(`lastRefresh`).textContent = new Date().toLocaleTimeString(`ar-JO`, { hour: `2-digit`, minute: `2-digit` });
    C.$(`cacheStatus`).textContent = state.core.cacheText || `-`;
    populateFilters();
    applyFilters();
    if (!state.rows.length && !options.silent) C.showToast(`لا توجد مبيعات محتسبة. تحقق من رفع ربط المناطق.`, `warning`);
}

async function hydrateBackground(backgroundPromise) {
    if (!backgroundPromise) return;
    try {
        const freshCore = await backgroundPromise;
        if (!freshCore) return;
        applyCoreData(freshCore, { silent: true });
        if (freshCore.changedCount) C.showToast(`تم تحديث ${freshCore.changedCount} سجل جديد/معدل.`, `success`);
    } catch (error) {
        console.warn(`تعذر إكمال التحديث التفاضلي بالخلفية:`, error);
    }
}

async function loadDashboard(force = false) {
    const button = C.$(`refreshBtn`);
    try {
        C.setLoading(button, true, force ? `تحديث` : `تحميل`);
        const core = await loadCoreData(force, { includeLegacySales: true, cacheFirst: true });
        applyCoreData(core, { silent: false });
        hydrateBackground(core.backgroundPromise);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات المبيعات. تحقق من الصلاحيات والاتصال.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function exportRows() {
    if (!state.filtered.length) return C.showToast(`لا توجد بيانات للتصدير.`, `warning`);
    const directRows = directDetailRows(state.filtered);
    const otherRows = otherItemSummaryRows(state.filtered);
    const rangeLabel = `${C.$(`dateFrom`)?.value || `بداية`} إلى ${C.$(`dateTo`)?.value || `اليوم`}`;
    const rows = directRows.map(row => ({
        'Type': `مباشر`,
        'Date / Range': row.dateText,
        'Team': row.team || state.session.team || ``,
        'Medical Rep': state.session.name,
        'Area': row.area,
        'Pharmacy Code': row.pharmacyCode,
        'Pharmacy': row.pharmacyName,
        'Sales Rep': row.salesRepName,
        'Item Name': row.itemName,
        'Qty': row.allocatedQty,
        'Value': row.allocatedValue,
        'Order ID': row.orderId
    }));

    if (otherRows.length) {
        otherRows.forEach(row => rows.push({
            'Type': `اخرين - ملخص صنف`,
            'Date / Range': rangeLabel,
            'Team': state.session.team || ``,
            'Medical Rep': state.session.name,
            'Area': `اخرين`,
            'Pharmacy Code': ``,
            'Pharmacy': ``,
            'Sales Rep': ``,
            'Item Name': row.itemName,
            'Qty': row.qty,
            'Value': row.value,
            'Order ID': ``
        }));
    }

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
    document.querySelectorAll(`[data-scroll-to]`).forEach(button => {
        button.addEventListener(`click`, () => {
            const target = document.getElementById(button.dataset.scrollTo);
            if (!target) return;
            document.querySelectorAll(`.mobile-tab`).forEach(tab => tab.classList.remove(`active`));
            button.classList.add(`active`);
            target.scrollIntoView({ behavior: `smooth`, block: `start` });
        });
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
    setTimeout(() => C.maybeShowFirstRunDemo(`rep`, {
        userKey: state.session.employeeNo || state.session.normalizedName || state.session.name,
        employeeNo: state.session.employeeNo || ``,
        name: state.session.name || ``
    }), 500);
    loadDashboard(false);
}
