import { loadCoreData, buildRowsForTeam, distinctTeams, targetForRows } from './analytics-engine.js';

const C = window.medrepCommon;
const state = {
    core: null,
    rows: [],
    allTeamRows: [],
    filtered: [],
    teams: [],
    selectedTeam: ``,
    access: null
};

function requireAccess() {
    const admin = C.readAdminSession();
    const teamSession = C.readTeamSession();
    const medrepSession = C.readSession();
    if (admin?.role === `medical_rep_admin`) {
        if (C.$(`teamAdminLink`)) C.$(`teamAdminLink`).hidden = false;
        return { mode: `admin`, team: teamSession?.team || new URLSearchParams(location.search).get(`team`) || ``, canViewAllTeams: true, label: `Admin` };
    }
    if (teamSession?.role === `medical_team_audit`) {
        return { mode: `audit`, team: ``, canViewAllTeams: true, label: teamSession.displayName || teamSession.username || `Audit` };
    }
    if (teamSession?.role === `medical_team_leader`) {
        return { mode: `team`, team: teamSession.team || ``, canViewAllTeams: false, label: teamSession.team || `Team Leader` };
    }
    if (medrepSession?.role === `medical_rep`) return { mode: `rep_team_view`, team: medrepSession.team || ``, canViewAllTeams: false, label: medrepSession.team || `Team` };
    window.location.href = `index.html`;
    return null;
}

function canViewAllTeams() {
    return !!state.access?.canViewAllTeams;
}

function replaceTeamSelectOptions(selectId, baseLabel, values = []) {
    const select = C.$(selectId);
    if (!select) return;
    const current = select.value || ``;
    const options = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
    select.innerHTML = `<option value="">${baseLabel}</option>${options.map(value => `<option value="${C.escapeHtml(value)}">${C.escapeHtml(value)}</option>`).join(``)}`;
    select.value = current && options.includes(current) ? current : ``;
}

function selectedTeamChannel() {
    return C.$(`channelFilter`)?.value || `all`;
}

function teamRowMatches(row = {}, overrides = {}) {
    const from = overrides.from ?? (C.$(`dateFrom`)?.value || ``);
    const to = overrides.to ?? (C.$(`dateTo`)?.value || ``);
    const team = overrides.team ?? state.selectedTeam;
    const item = overrides.item ?? (C.$(`itemFilter`)?.value || ``);
    const area = overrides.area ?? (C.$(`areaFilter`)?.value || ``);
    const channel = overrides.channel ?? selectedTeamChannel();
    const search = overrides.search ?? C.normalizeArabic(C.$(`searchInput`)?.value || ``);
    if (!C.isWithinRange(row.date, from, to)) return false;
    if (team && row.team !== team) return false;
    if (item && row.itemName !== item) return false;
    if (area && row.area !== area) return false;
    if (channel !== `all` && row.channel !== channel) return false;
    if (search) {
        const haystack = C.normalizeArabic(`${row.medrep} ${row.pharmacyName} ${row.pharmacyCode} ${row.itemName} ${row.area} ${row.orderShort}`);
        if (!haystack.includes(search)) return false;
    }
    return true;
}

function populateTeamFilter() {
    const group = C.$(`teamFilterGroup`);
    const select = C.$(`teamFilter`);
    if (!select) return;

    if (!canViewAllTeams()) {
        if (group) group.hidden = true;
        select.innerHTML = ``;
        return;
    }

    if (group) group.hidden = false;
    replaceTeamSelectOptions(`teamFilter`, `كل الفرق`, state.teams);
    state.selectedTeam = select.value || ``;
}

function syncTeamChannelFilterOptions() {
    const select = C.$(`channelFilter`);
    if (!select) return;
    const current = select.value || `all`;
    const counts = { direct: 0, others: 0 };
    state.rows.forEach(row => {
        if (teamRowMatches(row, { channel: `all` }) && counts[row.channel] !== undefined) counts[row.channel] += 1;
    });
    const options = [{ value: `all`, label: `الكل` }];
    if (counts.direct > 0) options.push({ value: `direct`, label: `مباشر`, count: counts.direct });
    if (counts.others > 0) options.push({ value: `others`, label: `اخرين فقط`, count: counts.others });
    select.innerHTML = options.map(option => {
        const countText = Number.isFinite(option.count) ? ` (${option.count.toLocaleString(`en-US`)})` : ``;
        return `<option value="${option.value}">${option.label}${countText}</option>`;
    }).join(``);
    select.value = options.some(option => option.value === current) ? current : `all`;
}

function syncTeamSmartFilters() {
    if (canViewAllTeams()) {
        const allRows = state.allTeamRows.length ? state.allTeamRows : buildRowsForTeam(``, state.core);
        const teams = [];
        allRows.forEach(row => {
            if (teamRowMatches(row, { team: `` })) teams.push(row.team);
        });
        const previousTeam = state.selectedTeam;
        replaceTeamSelectOptions(`teamFilter`, `كل الفرق`, teams);
        state.selectedTeam = C.$(`teamFilter`)?.value || ``;
        if (previousTeam !== state.selectedTeam) {
            state.rows = buildRowsForTeam(state.selectedTeam || ``, state.core);
        }
    }

    const items = [];
    const areas = [];
    state.rows.forEach(row => {
        if (teamRowMatches(row, { item: `` })) items.push(row.itemName);
        if (teamRowMatches(row, { area: `` })) areas.push(row.area);
    });
    replaceTeamSelectOptions(`itemFilter`, `كل الأصناف`, items);
    replaceTeamSelectOptions(`areaFilter`, `كل المناطق`, areas);
    syncTeamChannelFilterOptions();
}

function populateFilters() {
    syncTeamSmartFilters();
}

function applyFilters() {
    syncTeamSmartFilters();
    syncTeamSmartFilters();
    state.filtered = state.rows.filter(row => teamRowMatches(row));
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
        team: state.selectedTeam || ``,
        itemName: C.$(`itemFilter`)?.value || ``,
        from: C.$(`dateFrom`)?.value || ``,
        to: C.$(`dateTo`)?.value || ``
    });
    const achValue = target.value ? (totalValue / target.value) * 100 : null;

    C.$(`teamName`).textContent = state.selectedTeam || (canViewAllTeams() ? `كل الفرق` : (state.access?.team || `الفريق`));
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
    renderAreaChart();
}


function renderAreaChart() {
    const target = C.$(`areaChart`);
    const meta = C.$(`areaChartMeta`);
    if (!target) return;
    const rows = aggregateBy(state.filtered, row => row.areaKey || C.normalizeArabic(row.area), row => ({
        area: row.area || `-`,
        value: 0,
        qty: 0,
        reps: new Set(),
        pharmacies: new Set()
    }), (acc, row) => {
        acc.value += C.parseNumber(row.allocatedValue);
        acc.qty += C.parseNumber(row.allocatedQty);
        if (row.medrep) acc.reps.add(row.medrep);
        if (row.pharmacyCode || row.pharmacyName) acc.pharmacies.add(row.pharmacyCode || row.pharmacyName);
    }).sort((a, b) => b.value - a.value).slice(0, 14);

    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-chart-bar"></i><span>لا توجد بيانات مناطق.</span></div>`;
        if (meta) meta.textContent = `-`;
        return;
    }

    const maxValue = Math.max(...rows.map(row => C.parseNumber(row.value)), 1);
    const top = rows[0];
    if (meta) meta.textContent = `${rows.length} منطقة • الأعلى: ${top.area} (${C.formatMoney(top.value)} د.أ)`;
    target.innerHTML = rows.map((row, index) => {
        const width = Math.max(4, (C.parseNumber(row.value) / maxValue) * 100);
        return `
            <div class="chart-row">
                <div class="chart-rank">${index + 1}</div>
                <div class="chart-main">
                    <div class="chart-label"><strong>${C.escapeHtml(row.area)}</strong><span>${C.formatQty(row.qty)} كمية • ${row.reps.size} مندوب • ${row.pharmacies.size} صيدلية</span></div>
                    <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
                </div>
                <div class="chart-value">${C.formatMoney(row.value)}</div>
            </div>
        `;
    }).join(``);
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
            <td>${row.channel === `others` ? `<span class="badge badge-other">${C.formatPercentageRatio(row.percentage)}</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
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
            <td>${row.channel === `others` ? `${C.formatPercentageRatio(row.percentage)}` : `100%`}</td>
            <td>${row.channel === `others` ? `<span class="badge badge-other">اخرين</span>` : `<span class="badge badge-direct">مباشر</span>`}</td>
        </tr>
    `).join(``);
}

function applyTeamCore(core) {
    state.core = core;
    state.teams = distinctTeams(state.core);
    state.allTeamRows = canViewAllTeams() ? buildRowsForTeam(``, state.core) : [];
    if (canViewAllTeams()) {
        if (state.selectedTeam && !state.teams.includes(state.selectedTeam)) state.selectedTeam = ``;
    } else {
        state.selectedTeam = state.access?.team || state.selectedTeam || ``;
    }
    populateTeamFilter();
    rebuildRows();
    C.$(`lastRefresh`).textContent = new Date().toLocaleTimeString(`ar-JO`, { hour: `2-digit`, minute: `2-digit` });
    C.$(`cacheStatus`).textContent = state.core.cacheText || `-`;
}

async function hydrateTeamBackground(backgroundPromise) {
    if (!backgroundPromise) return;
    try {
        const freshCore = await backgroundPromise;
        if (!freshCore) return;
        applyTeamCore(freshCore);
        if (freshCore.changedCount) C.showToast(`تم تحديث ${freshCore.changedCount} سجل جديد/معدل.`, `success`);
    } catch (error) {
        console.warn(`تعذر إكمال تحديث الفريق التفاضلي بالخلفية:`, error);
    }
}

async function loadTeam(force = false) {
    const button = C.$(`refreshBtn`);
    try {
        C.setLoading(button, true, force ? `تحديث` : `تحميل`);
        const core = await loadCoreData(force, { cacheFirst: true, includeLegacySales: true });
        applyTeamCore(core);
        hydrateTeamBackground(core.backgroundPromise);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات الفريق.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function rebuildRows() {
    const teamScope = canViewAllTeams() ? (state.selectedTeam || ``) : (state.access?.team || state.selectedTeam || ``);
    state.rows = buildRowsForTeam(teamScope, state.core);
    populateFilters();
    applyFilters();
}

function exportRows() {
    if (!state.filtered.length) return C.showToast(`لا توجد بيانات للتصدير.`, `warning`);
    const rows = state.filtered.map(row => ({
        'Date': row.dateText,
        'Team': row.team || ``,
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
        'Other %': row.channel === `others` ? C.formatPercentageRatio(row.percentage) : `100%`,
        'Order ID': row.orderId
    }));
    const scope = state.selectedTeam ? C.normalizeArabic(state.selectedTeam).replace(/\s+/g, `_`) : `all_teams`;
    C.downloadWorkbook(rows, `Team Sales`, `team_leader_${scope}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function bindEvents() {
    C.$(`refreshBtn`)?.addEventListener(`click`, () => loadTeam(true));
    C.$(`exportBtn`)?.addEventListener(`click`, exportRows);
    C.$(`teamLogoutBtn`)?.addEventListener(`click`, () => {
        C.clearTeamSession();
        window.location.href = `index.html`;
    });
    C.$(`teamFilter`)?.addEventListener(`change`, () => {
        state.selectedTeam = C.$(`teamFilter`)?.value || ``;
        rebuildRows();
    });
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
    state.access = access;
    state.selectedTeam = access.canViewAllTeams ? `` : (access.team || ``);
    bindEvents();
    initDefaults();
    loadTeam(false);
}
