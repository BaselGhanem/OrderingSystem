import { loadCoreData, buildRowsForTeam, distinctTeams, targetForRows } from './analytics-engine.js';

const C = window.medrepCommon;
const state = {
    core: null,
    rows: [],
    filtered: [],
    teams: [],
    selectedTeam: ``
};

function requireAccess() {
    const admin = C.readAdminSession();
    const teamSession = C.readTeamSession();
    const medrepSession = C.readSession();
    if (admin?.role === `medical_rep_admin`) return { mode: `admin`, team: teamSession?.team || new URLSearchParams(location.search).get(`team`) || `` };
    if (teamSession?.role === `medical_team_leader`) return { mode: `team`, team: teamSession.team || `` };
    if (medrepSession?.role === `medical_rep`) return { mode: `rep_team_view`, team: medrepSession.team || `` };
    window.location.href = `index.html`;
    return null;
}

function populateTeamFilter() {
    const select = C.$(`teamFilter`);
    select.innerHTML = `<option value="">اختر الفريق</option>${state.teams.map(team => `<option value="${C.escapeHtml(team)}">${C.escapeHtml(team)}</option>`).join(``)}`;
    if (state.selectedTeam) select.value = state.selectedTeam;
    if (!select.value && state.teams.length === 1) {
        select.value = state.teams[0];
        state.selectedTeam = state.teams[0];
    }
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
            const haystack = C.normalizeArabic(`${row.medrep} ${row.pharmacyName} ${row.pharmacyCode} ${row.itemName} ${row.area} ${row.orderShort}`);
            if (!haystack.includes(search)) return false;
        }
        return true;
    });
    render();
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

function render() {
    const totalValue = C.sumRows(state.filtered, `allocatedValue`);
    const totalQty = C.sumRows(state.filtered, `allocatedQty`);
    const otherRows = state.filtered.filter(row => row.channel === `others`);
    const otherValue = C.sumRows(otherRows, `allocatedValue`);
    const repCount = new Set(state.filtered.map(row => row.medrepKey || C.normalizeArabic(row.medrep)).filter(Boolean)).size;
    const itemCount = new Set(state.filtered.map(row => row.itemKey).filter(Boolean)).size;
    const pharmacyCount = new Set(state.filtered.map(row => row.pharmacyCode || row.pharmacyName).filter(Boolean)).size;
    const avgPrice = totalQty ? totalValue / totalQty : 0;
    const target = targetForRows(state.filtered, state.core?.targets || [], {
        team: state.selectedTeam,
        itemName: C.$(`itemFilter`)?.value || ``,
        from: C.$(`dateFrom`)?.value || ``,
        to: C.$(`dateTo`)?.value || ``
    });
    const achValue = target.value ? (totalValue / target.value) * 100 : null;

    C.$(`teamName`).textContent = state.selectedTeam || `-`;
    C.$(`heroValue`).textContent = C.formatMoney(totalValue);
    C.$(`heroQty`).textContent = C.formatQty(totalQty);
    C.$(`cardTotalValue`).textContent = `${C.formatMoney(totalValue)} د.أ`;
    C.$(`cardAvgPrice`).textContent = `متوسط السعر: ${C.formatMoney(avgPrice)}`;
    C.$(`cardQty`).textContent = C.formatQty(totalQty);
    C.$(`cardLines`).textContent = `${state.filtered.length.toLocaleString(`en-US`)} سطر`;
    C.$(`cardReps`).textContent = repCount.toLocaleString(`en-US`);
    C.$(`cardItems`).textContent = itemCount.toLocaleString(`en-US`);
    C.$(`cardPharmacies`).textContent = pharmacyCount.toLocaleString(`en-US`);
    C.$(`cardOtherValue`).textContent = `${C.formatMoney(otherValue)} د.أ`;
    C.$(`cardOtherShare`).textContent = totalValue ? `${((otherValue / totalValue) * 100).toFixed(1)}% من الإجمالي` : `0%`;
    C.$(`cardTarget`).textContent = target.value ? `${C.formatMoney(target.value)} د.أ` : `غير مرفوع`;
    C.$(`cardAch`).textContent = `Achievement: ${achValue === null ? `-` : `${achValue.toFixed(1)}%`}`;

    renderItemSummary();
    renderRepSummary();
    renderPharmacyItems();
    renderDetails();
}

function renderItemSummary() {
    const rows = aggregateBy(state.filtered, row => row.itemKey, row => ({ itemName: row.itemName, qty: 0, value: 0, other: 0, reps: new Set() }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
        if (row.channel === `others`) acc.other += C.parseNumber(row.allocatedValue);
        if (row.medrep) acc.reps.add(row.medrep);
    }).sort((a, b) => b.value - a.value).slice(0, 80);
    const target = C.$(`itemSummaryBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="5"><div class="empty-state compact">لا توجد بيانات.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td class="other-cell">${C.formatMoney(row.other)}</td>
            <td>${row.reps.size}</td>
        </tr>
    `).join(``);
}

function renderRepSummary() {
    const rows = aggregateBy(state.filtered, row => row.medrepKey || C.normalizeArabic(row.medrep), row => ({ medrep: row.medrep, qty: 0, value: 0, other: 0, items: new Set() }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
        if (row.channel === `others`) acc.other += C.parseNumber(row.allocatedValue);
        if (row.itemKey) acc.items.add(row.itemKey);
    }).sort((a, b) => b.value - a.value);
    const target = C.$(`repSummaryBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="5"><div class="empty-state compact">لا توجد بيانات.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr>
            <td class="item-name">${C.escapeHtml(row.medrep || `-`)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td class="other-cell">${C.formatMoney(row.other)}</td>
            <td>${row.items.size}</td>
        </tr>
    `).join(``);
}

function renderPharmacyItems() {
    const rows = aggregateBy(state.filtered, row => `${row.pharmacyCode || row.pharmacyName}|${row.itemKey}|${row.medrepKey}|${row.channel}`, row => ({
        pharmacyName: row.pharmacyName,
        pharmacyCode: row.pharmacyCode,
        area: row.area,
        itemName: row.itemName,
        medrep: row.medrep,
        channel: row.channel,
        percentage: row.percentage,
        qty: 0,
        value: 0
    }), (acc, row) => {
        acc.qty += C.parseNumber(row.allocatedQty);
        acc.value += C.parseNumber(row.allocatedValue);
    }).sort((a, b) => b.value - a.value).slice(0, 400);
    const target = C.$(`pharmacyItemBody`);
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="8"><div class="empty-state compact">لا توجد بيانات صيدليات.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="${row.channel === `others` ? `row-other` : ``}">
            <td class="item-name">${C.escapeHtml(row.pharmacyName)}</td>
            <td>${C.escapeHtml(row.pharmacyCode || `-`)}</td>
            <td>${C.escapeHtml(row.area)}</td>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.escapeHtml(row.medrep || `-`)}</td>
            <td>${C.formatQty(row.qty)}</td>
            <td><strong>${C.formatMoney(row.value)}</strong></td>
            <td>${row.channel === `others` ? `<span class="badge badge-other">${C.parseNumber(row.percentage)}%</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
        </tr>
    `).join(``);
}

function renderDetails() {
    const rows = state.filtered.slice(0, 800);
    const target = C.$(`detailsBody`);
    C.$(`visibleRowsNote`).textContent = state.filtered.length > 800 ? `يتم عرض أول 800 سطر فقط. استخدم التصدير لرؤية كامل البيانات.` : ``;
    if (!rows.length) {
        target.innerHTML = `<tr><td colspan="11"><div class="empty-state compact">لا توجد تفاصيل ضمن الفلاتر.</div></td></tr>`;
        return;
    }
    target.innerHTML = rows.map(row => `
        <tr class="${row.channel === `others` ? `row-other` : ``}">
            <td>${C.escapeHtml(row.dateText)}</td>
            <td>${C.escapeHtml(row.area)}</td>
            <td class="item-name">${C.escapeHtml(row.pharmacyName)}</td>
            <td class="item-name">${C.escapeHtml(row.itemName)}</td>
            <td>${C.escapeHtml(row.medrep || `-`)}</td>
            <td>${C.formatQty(row.sourceQty)}</td>
            <td><strong>${C.formatQty(row.allocatedQty)}</strong></td>
            <td>${C.formatMoney(row.sourceValue)}</td>
            <td><strong>${C.formatMoney(row.allocatedValue)}</strong></td>
            <td>${row.channel === `others` ? `${C.parseNumber(row.percentage)}%` : `100%`}</td>
            <td>${row.channel === `others` ? `<span class="badge badge-other">اخرين</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
        </tr>
    `).join(``);
}

async function loadTeam(force = false) {
    const button = C.$(`refreshBtn`);
    try {
        C.setLoading(button, true, force ? `تحديث مباشر` : `تحميل`);
        state.core = await loadCoreData(force);
        state.teams = distinctTeams(state.core);
        if (!state.selectedTeam) {
            const access = requireAccess();
            state.selectedTeam = access?.team || state.teams[0] || ``;
        }
        populateTeamFilter();
        rebuildRows();
        C.$(`lastRefresh`).textContent = new Date().toLocaleTimeString(`ar-JO`, { hour: `2-digit`, minute: `2-digit` });
        C.$(`cacheStatus`).textContent = state.core.cacheText || `-`;
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات الفريق.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function rebuildRows() {
    state.rows = state.selectedTeam ? buildRowsForTeam(state.selectedTeam, state.core) : [];
    populateFilters();
    applyFilters();
}

function exportRows() {
    if (!state.filtered.length) return C.showToast(`لا توجد بيانات للتصدير.`, `warning`);
    const rows = state.filtered.map(row => ({
        'Date': row.dateText,
        'Team': row.team || state.selectedTeam,
        'Medical Rep': row.medrep || ``,
        'Area': row.area,
        'Pharmacy Code': row.pharmacyCode,
        'Pharmacy': row.pharmacyName,
        'Item Name': row.itemName,
        'Source Qty': row.sourceQty,
        'Allocated Qty': row.allocatedQty,
        'Source Value': row.sourceValue,
        'Allocated Value': row.allocatedValue,
        'Channel': row.channel === `others` ? `Other Area` : `Direct Area`,
        'Other %': row.channel === `others` ? `${row.percentage}%` : `100%`,
        'Order ID': row.orderId
    }));
    C.downloadWorkbook(rows, `Team Sales`, `team_leader_${state.selectedTeam || `team`}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function bindEvents() {
    C.$(`teamFilter`)?.addEventListener(`change`, () => {
        state.selectedTeam = C.$(`teamFilter`).value || ``;
        C.saveTeamSession({ team: state.selectedTeam, adminPreview: !!C.readAdminSession() }, true);
        rebuildRows();
    });
    C.$(`refreshBtn`)?.addEventListener(`click`, () => loadTeam(true));
    C.$(`exportBtn`)?.addEventListener(`click`, exportRows);
    [`dateFrom`, `dateTo`, `itemFilter`, `areaFilter`, `channelFilter`, `searchInput`].forEach(id => {
        C.$(id)?.addEventListener(id === `searchInput` ? `input` : `change`, applyFilters);
    });
}

function initDefaults() {
    if (C.$(`dateFrom`) && !C.$(`dateFrom`).value) C.$(`dateFrom`).value = C.firstDayOfMonth();
    if (C.$(`dateTo`) && !C.$(`dateTo`).value) C.$(`dateTo`).value = C.toDateInputValue(new Date());
}

const access = requireAccess();
if (access) {
    state.selectedTeam = access.team || ``;
    bindEvents();
    initDefaults();
    loadTeam(false);
}
