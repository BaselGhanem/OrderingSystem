import {
    db,
    collection,
    setDoc,
    doc,
    deleteDoc,
    writeBatch,
    serverTimestamp
} from './firebase.js';
import { getCollectionSmart } from './analytics-engine.js';

const C = window.medrepCommon;
const COLLECTIONS = {
    reps: `medicalReps`,
    areaRules: `medicalRepAreaRules`,
    otherShares: `medicalRepOtherShares`,
    targets: `medicalRepTargets`
};
const REP_PAGE_SIZE = 30;

const state = {
    allRepDocs: [],
    reps: [],
    managedReps: [],
    areaRules: [],
    otherShares: [],
    targets: [],
    teamAccess: [],
    otherShareGroups: [],
    otherShareSearch: ``,
    showOnlyOtherShareIssues: true,
    repPage: 1,
    repSearch: ``,
    teamAccessSearch: ``
};

function requireAdmin() {
    const session = C.readAdminSession();
    const login = C.$(`adminLoginPanel`);
    const app = C.$(`adminApp`);
    if (session?.role === `medical_rep_admin`) {
        if (login) login.hidden = true;
        if (app) app.hidden = false;
        refreshAll();
        return true;
    }
    if (login) login.hidden = false;
    if (app) app.hidden = true;
    return false;
}

function normalizeBirthDate(value = ``) {
    if (!value) return ``;
    const text = String(value).trim();
    const maybe = new Date(text);
    if (!Number.isNaN(maybe.getTime())) return C.toDateInputValue(maybe);
    return text;
}

function isTeamAccessDoc(row = {}) {
    return row.role === `medical_team_leader` || String(row.id || ``).startsWith(`team_access_`);
}


function cssEscape(value = ``) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/\\/g, `\\\\`).replace(/"/g, `\\"`);
}

function validEmployeeNo(value = ``) {
    return /^[0-9]{2,}$/.test(String(value || ``).trim());
}

function validBirthDate(value = ``) {
    const date = new Date(`${value}T00:00:00`);
    const year = date.getFullYear();
    return !!value && !Number.isNaN(date.getTime()) && year >= 1930 && date <= new Date();
}

async function upsertRows(collectionName, rows, docIdFactory) {
    let done = 0;
    for (let i = 0; i < rows.length; i += 450) {
        const chunk = rows.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach(row => {
            const id = docIdFactory(row);
            batch.set(doc(db, collectionName, id), {
                ...row,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();
        done += chunk.length;
    }
    return done;
}

async function loadCollection(collectionName, force = false) {
    const pack = await getCollectionSmart(collectionName, force);
    return pack.rows || [];
}

async function refreshAll(force = false) {
    try {
        const [allRepDocs, areaRules, otherShares, targets] = await Promise.all([
            loadCollection(COLLECTIONS.reps, force),
            loadCollection(COLLECTIONS.areaRules, force),
            loadCollection(COLLECTIONS.otherShares, force),
            loadCollection(COLLECTIONS.targets, force)
        ]);
        state.allRepDocs = allRepDocs;
        state.reps = allRepDocs.filter(row => !isTeamAccessDoc(row)).sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
        state.teamAccess = allRepDocs.filter(isTeamAccessDoc);
        state.areaRules = areaRules;
        state.otherShares = otherShares;
        state.targets = targets;
        state.managedReps = buildManagedRepRows();
        state.otherShareGroups = buildOtherShareGroups();
        renderSummary();
        renderTables();
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات البوابة.`, `error`);
    }
}

function renderSummary() {
    const invalidOtherGroups = state.otherShareGroups.filter(group => !group.isBalanced).length;
    C.$(`repsCount`).textContent = state.managedReps.length;
    C.$(`areaRulesCount`).textContent = state.areaRules.length;
    C.$(`otherSharesCount`).textContent = invalidOtherGroups ? `${invalidOtherGroups}/${state.otherShareGroups.length}` : state.otherShares.length;
    C.$(`targetsCount`).textContent = state.targets.length;
}

function buildManagedRepRows() {
    const map = new Map();
    const ensure = (name = ``, team = ``, source = ``) => {
        const cleanName = String(name || ``).trim();
        if (!cleanName) return null;
        const key = C.normalizeArabic(cleanName);
        const current = map.get(key) || {
            key,
            name: cleanName,
            team: String(team || ``).trim(),
            employeeNo: ``,
            birthDate: ``,
            active: true,
            role: `medical_rep`,
            sourceSet: new Set(),
            id: ``
        };
        if (!current.team && team) current.team = String(team || ``).trim();
        current.sourceSet.add(source || `data`);
        map.set(key, current);
        return current;
    };

    state.areaRules.forEach(row => ensure(row.medrep, row.team, `area`));
    state.otherShares.forEach(row => ensure(row.medrep, row.team, `other`));
    state.targets.forEach(row => ensure(row.medrep, row.team, `target`));
    state.reps.forEach(row => {
        const current = ensure(row.name || row.medrep, row.team, `login`);
        if (!current) return;
        current.id = row.id || String(row.employeeNo || ``);
        current.employeeNo = row.employeeNo || current.employeeNo || ``;
        current.birthDate = row.birthDate || current.birthDate || ``;
        current.active = row.active !== false;
        current.role = `medical_rep`;
    });

    return [...map.values()]
        .map(row => ({ ...row, sources: [...row.sourceSet].join(`,`) }))
        .sort((a, b) => a.name.localeCompare(b.name, `ar`));
}

function deriveTeams() {
    return [...new Set([
        ...state.areaRules.map(row => row.team),
        ...state.otherShares.map(row => row.team),
        ...state.targets.map(row => row.team),
        ...state.managedReps.map(row => row.team),
        ...state.teamAccess.map(row => row.team)
    ].map(team => String(team || ``).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, `ar`));
}


function normalizedShareRow(row = {}) {
    const team = String(row.team || ``).trim();
    const itemName = String(row.itemName || row.item || row.product || ``).trim();
    const medrep = String(row.medrep || row.name || ``).trim();
    const itemKey = row.itemKey || C.normalizeItem(itemName);
    const medrepKey = row.medrepKey || C.normalizeArabic(medrep);
    const pct = C.parsePercentageRatio(row.percentage, { allowEmpty: true, allowLegacyPercent: true });
    return {
        ...row,
        team,
        itemName,
        medrep,
        itemKey,
        medrepKey,
        percentage: Number.isFinite(pct) ? pct : 0,
        docId: row.id || C.makeDocId([itemKey, medrepKey])
    };
}

function buildOtherShareGroups() {
    const groups = new Map();
    state.otherShares.map(normalizedShareRow).forEach(row => {
        if (!row.itemKey || !row.medrepKey) return;
        const teamKey = C.normalizeArabic(row.team || `بدون فريق`);
        const groupKey = C.makeDocId([teamKey, row.itemKey]);
        const current = groups.get(groupKey) || {
            groupKey,
            team: row.team || `بدون فريق`,
            teamKey,
            itemName: row.itemName || `-`,
            itemKey: row.itemKey,
            shares: [],
            total: 0,
            missing: 1,
            isBalanced: false
        };
        current.shares.push(row);
        current.total += C.parseNumber(row.percentage);
        groups.set(groupKey, current);
    });

    return [...groups.values()].map(group => {
        group.shares.sort((a, b) => String(a.medrep || ``).localeCompare(String(b.medrep || ``), `ar`));
        group.total = Math.round(group.total * 1000000000) / 1000000000;
        group.missing = Math.round((1 - group.total) * 1000000000) / 1000000000;
        group.isBalanced = Math.abs(group.total - 1) <= 0.000001;
        return group;
    }).sort((a, b) => {
        if (a.isBalanced !== b.isBalanced) return a.isBalanced ? 1 : -1;
        return String(a.itemName || ``).localeCompare(String(b.itemName || ``), `ar`);
    });
}

function eligibleRepsForShareGroup(group = {}) {
    const existing = new Set((group.shares || []).map(row => row.medrepKey));
    const teamKey = C.normalizeArabic(group.team || ``);
    const preferred = state.managedReps.filter(rep => {
        const repKey = rep.key || C.normalizeArabic(rep.name || ``);
        if (existing.has(repKey)) return false;
        if (!teamKey || group.team === `بدون فريق`) return true;
        return C.normalizeArabic(rep.team || ``) === teamKey;
    });
    const fallback = state.managedReps.filter(rep => {
        const repKey = rep.key || C.normalizeArabic(rep.name || ``);
        return !existing.has(repKey) && !preferred.some(item => (item.key || C.normalizeArabic(item.name || ``)) === repKey);
    });
    return [...preferred, ...fallback].slice(0, 250);
}

function filteredOtherShareGroups() {
    const search = C.normalizeArabic(state.otherShareSearch);
    return state.otherShareGroups.filter(group => {
        if (state.showOnlyOtherShareIssues && group.isBalanced) return false;
        if (!search) return true;
        const haystack = C.normalizeArabic(`${group.team} ${group.itemName} ${(group.shares || []).map(row => row.medrep).join(` `)}`);
        return haystack.includes(search);
    });
}

function shareStatusBadge(group = {}) {
    if (group.isBalanced) return `<span class="badge badge-direct">مكتمل 100%</span>`;
    if (group.total < 1) return `<span class="badge badge-warning">ناقص ${C.formatPercentageRatio(1 - group.total)}</span>`;
    return `<span class="badge badge-danger">زائد ${C.formatPercentageRatio(group.total - 1)}</span>`;
}

function renderOtherShareReconciliation() {
    const target = C.$(`otherShareReconcilePreview`);
    const summary = C.$(`otherShareReconcileSummary`);
    if (!target) return;

    const invalidCount = state.otherShareGroups.filter(group => !group.isBalanced).length;
    const balancedCount = state.otherShareGroups.length - invalidCount;
    if (summary) {
        summary.innerHTML = `
            <div class="other-reconcile-chip ${invalidCount ? `danger` : `ok`}"><span>بحاجة إعادة احتساب</span><strong>${invalidCount.toLocaleString(`en-US`)}</strong></div>
            <div class="other-reconcile-chip"><span>مكتملة 100%</span><strong>${balancedCount.toLocaleString(`en-US`)}</strong></div>
            <div class="other-reconcile-chip"><span>إجمالي الأصناف</span><strong>${state.otherShareGroups.length.toLocaleString(`en-US`)}</strong></div>
        `;
    }

    const groups = filteredOtherShareGroups();
    if (!state.otherShareGroups.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-percent"></i><span>لا توجد نسب مرفوعة لمنطقة اخرين.</span></div>`;
        return;
    }
    if (!groups.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-check-circle"></i><span>لا توجد نتائج ضمن الفلتر الحالي.</span></div>`;
        return;
    }

    target.innerHTML = `
        <div class="other-share-card-list">
            ${groups.map(group => {
                const reps = eligibleRepsForShareGroup(group);
                return `
                    <article class="other-share-card ${group.isBalanced ? `is-balanced` : `needs-work`}" data-other-group="${C.escapeHtml(group.groupKey)}">
                        <div class="other-share-card-head">
                            <div>
                                <span class="mini-label">${C.escapeHtml(group.team || `بدون فريق`)}</span>
                                <h3>${C.escapeHtml(group.itemName || `-`)}</h3>
                            </div>
                            <div class="other-share-total">
                                ${shareStatusBadge(group)}
                                <strong>${C.formatPercentageRatio(group.total, { maximumFractionDigits: 4 })}</strong>
                            </div>
                        </div>
                        <div class="table-scroll mobile-safe-scroll">
                            <table class="data-table compact-table other-share-edit-table">
                                <thead><tr><th>المندوب</th><th>النسبة %</th><th>حذف</th></tr></thead>
                                <tbody>
                                    ${group.shares.map(share => `
                                        <tr>
                                            <td class="item-name">${C.escapeHtml(share.medrep || `-`)}</td>
                                            <td>
                                                <input class="input-control table-input percent-input" type="number" inputmode="decimal" min="0" max="100" step="0.000001" value="${(C.parseNumber(share.percentage) * 100).toFixed(6).replace(/\.0+$/, ``).replace(/(\.\d*?)0+$/, `$1`)}" data-share-pct="${C.escapeHtml(group.groupKey)}" data-share-doc="${C.escapeHtml(share.docId)}" data-share-team="${C.escapeHtml(group.team || ``)}" data-share-item="${C.escapeHtml(group.itemName || ``)}" data-share-item-key="${C.escapeHtml(group.itemKey || ``)}" data-share-medrep="${C.escapeHtml(share.medrep || ``)}" data-share-medrep-key="${C.escapeHtml(share.medrepKey || ``)}">
                                            </td>
                                            <td><button class="btn btn-mini btn-light danger-mini" type="button" data-delete-share="${C.escapeHtml(share.docId)}"><i class="ph ph-trash"></i></button></td>
                                        </tr>
                                    `).join(``)}
                                </tbody>
                            </table>
                        </div>
                        <div class="other-share-add-row">
                            <select class="select-control" data-add-share-rep="${C.escapeHtml(group.groupKey)}">
                                <option value="">إضافة مندوب...</option>
                                ${reps.map(rep => `<option value="${C.escapeHtml(rep.key || C.normalizeArabic(rep.name || ``))}" data-rep-name="${C.escapeHtml(rep.name || ``)}" data-rep-team="${C.escapeHtml(rep.team || ``)}">${C.escapeHtml(rep.name || ``)}${rep.team ? ` - ${C.escapeHtml(rep.team)}` : ``}</option>`).join(``)}
                            </select>
                            <input class="input-control" type="number" inputmode="decimal" min="0" max="100" step="0.000001" placeholder="النسبة %" data-add-share-pct="${C.escapeHtml(group.groupKey)}">
                            <button class="btn btn-light" type="button" data-add-share="${C.escapeHtml(group.groupKey)}"><i class="ph ph-plus"></i> إضافة</button>
                        </div>
                        <div class="other-share-card-actions">
                            <span>المجموع يجب أن يساوي 100% قبل اعتماد المجموعة.</span>
                            <button class="btn btn-primary" type="button" data-save-share-group="${C.escapeHtml(group.groupKey)}"><i class="ph ph-floppy-disk"></i> حفظ المجموعة</button>
                        </div>
                    </article>
                `;
            }).join(``)}
        </div>
    `;
}

function teamAccessFor(team = ``) {
    const key = C.normalizeArabic(team);
    return state.teamAccess.find(row => C.normalizeArabic(row.team || row.teamName || ``) === key) || null;
}

function renderTables() {
    renderRepsTable();
    renderTeamAccessTable();
    renderSimpleTable(`areaRulesPreview`, state.areaRules.slice(0, 80), [`team`, `medrep`, `itemName`, `area`], {
        team: `الفريق`, medrep: `المندوب`, itemName: `الصنف`, area: `المنطقة`
    });
    renderOtherShareReconciliation();
    renderSimpleTable(`otherSharesPreview`, state.otherShares.slice(0, 80), [`team`, `itemName`, `medrep`, `percentage`], {
        team: `الفريق`, itemName: `الصنف`, medrep: `المندوب`, percentage: `نسبة اخرين`
    });
    renderSimpleTable(`targetsPreview`, state.targets.slice(0, 80), [`year`, `month`, `team`, `medrep`, `itemName`, `targetValue`, `targetQty`], {
        year: `السنة`, month: `الشهر`, team: `الفريق`, medrep: `المندوب`, itemName: `الصنف`, targetValue: `Target Value`, targetQty: `Target Qty`
    });
}

function filteredManagedReps() {
    const search = C.normalizeArabic(state.repSearch);
    return state.managedReps.filter(row => {
        if (!search) return true;
        const haystack = C.normalizeArabic(`${row.name} ${row.team} ${row.employeeNo} ${row.birthDate}`);
        return haystack.includes(search);
    });
}

function renderRepsTable() {
    const target = C.$(`repsPreview`);
    if (!target) return;
    const rows = filteredManagedReps();
    const totalPages = Math.max(1, Math.ceil(rows.length / REP_PAGE_SIZE));
    state.repPage = Math.min(Math.max(1, state.repPage), totalPages);
    const pageRows = rows.slice((state.repPage - 1) * REP_PAGE_SIZE, state.repPage * REP_PAGE_SIZE);

    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-users-three"></i><span>لا توجد نتائج.</span></div>`;
        renderRepPager(0, 1);
        return;
    }

    target.innerHTML = `
        <div class="table-scroll admin-edit-scroll">
            <table class="data-table compact-table admin-reps-table">
                <thead><tr><th>المندوب الطبي</th><th>الفريق</th><th>الرقم الوظيفي</th><th>تاريخ الميلاد</th><th>الحالة</th><th>حفظ</th><th>فتح</th></tr></thead>
                <tbody>
                    ${pageRows.map(row => `
                        <tr data-rep-row="${C.escapeHtml(row.key)}">
                            <td class="item-name">${C.escapeHtml(row.name || `-`)}</td>
                            <td>${C.escapeHtml(row.team || `-`)}</td>
                            <td><input class="input-control table-input" data-rep-employee="${C.escapeHtml(row.key)}" type="text" inputmode="numeric" value="${C.escapeHtml(row.employeeNo || ``)}" placeholder="الرقم"></td>
                            <td><input class="input-control table-input" data-rep-birth="${C.escapeHtml(row.key)}" type="date" value="${C.escapeHtml(row.birthDate || ``)}"></td>
                            <td>${row.active === false ? `<span class="badge badge-danger">غير فعال</span>` : `<span class="badge badge-direct">فعال</span>`}</td>
                            <td><button class="btn btn-mini btn-primary" type="button" data-save-rep="${C.escapeHtml(row.key)}"><i class="ph ph-floppy-disk"></i> حفظ</button></td>
                            <td>
                                <div class="row-actions">
                                    <button class="btn btn-mini btn-light" type="button" ${row.employeeNo ? `` : `disabled`} data-open-rep="${C.escapeHtml(row.employeeNo || ``)}"><i class="ph ph-user-focus"></i> كمندوب</button>
                                    <button class="btn btn-mini btn-light" type="button" ${row.team ? `` : `disabled`} data-open-team="${C.escapeHtml(row.team || ``)}"><i class="ph ph-users-three"></i> Team</button>
                                </div>
                            </td>
                        </tr>
                    `).join(``)}
                </tbody>
            </table>
        </div>
    `;
    renderRepPager(rows.length, totalPages);
}

function renderRepPager(totalRows, totalPages) {
    const target = C.$(`repPager`);
    if (!target) return;
    target.innerHTML = `
        <span>${totalRows.toLocaleString(`en-US`)} مندوب</span>
        <div>
            <button class="btn btn-mini btn-light" type="button" data-rep-page="prev" ${state.repPage <= 1 ? `disabled` : ``}>السابق</button>
            <strong>${state.repPage} / ${totalPages}</strong>
            <button class="btn btn-mini btn-light" type="button" data-rep-page="next" ${state.repPage >= totalPages ? `disabled` : ``}>التالي</button>
        </div>
    `;
}

function renderTeamAccessTable() {
    const target = C.$(`teamAccessPreview`);
    if (!target) return;
    const search = C.normalizeArabic(state.teamAccessSearch);
    const rows = deriveTeams().filter(team => !search || C.normalizeArabic(team).includes(search));
    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-users-three"></i><span>لا توجد فرق.</span></div>`;
        return;
    }
    target.innerHTML = `
        <div class="table-scroll admin-edit-scroll">
            <table class="data-table compact-table">
                <thead><tr><th>Team Name</th><th>الحالة</th><th>كلمة مرور جديدة</th><th>آخر تحديث</th><th>حفظ</th><th>فتح</th></tr></thead>
                <tbody>
                    ${rows.map(team => {
                        const access = teamAccessFor(team);
                        return `
                            <tr>
                                <td class="item-name"><strong>${C.escapeHtml(team)}</strong></td>
                                <td>${access?.passwordHash ? `<span class="badge badge-direct">مفعّل</span>` : `<span class="badge badge-warning">بدون كلمة مرور</span>`}</td>
                                <td><input class="input-control table-input" type="password" data-team-pass="${C.escapeHtml(team)}" placeholder="كلمة مرور جديدة"></td>
                                <td>${access?.passwordUpdatedAt ? C.escapeHtml(C.formatDateTime(access.passwordUpdatedAt)) : `-`}</td>
                                <td><button class="btn btn-mini btn-primary" type="button" data-save-team-pass="${C.escapeHtml(team)}"><i class="ph ph-key"></i> حفظ</button></td>
                                <td><button class="btn btn-mini btn-light" type="button" data-open-team="${C.escapeHtml(team)}"><i class="ph ph-arrow-square-out"></i> فتح</button></td>
                            </tr>
                        `;
                    }).join(``)}
                </tbody>
            </table>
        </div>
    `;
}

function renderSimpleTable(id, rows, keys, labels) {
    const target = C.$(id);
    if (!target) return;
    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-database"></i><span>لا توجد بيانات.</span></div>`;
        return;
    }
    target.innerHTML = `
        <div class="table-scroll">
            <table class="data-table compact-table">
                <thead><tr>${keys.map(key => `<th>${labels[key] || key}</th>`).join(``)}</tr></thead>
                <tbody>${rows.map(row => `<tr>${keys.map(key => `<td>${C.escapeHtml(key === `percentage` ? C.formatPercentageRatio(row[key]) : row[key] ?? `-`)}</td>`).join(``)}</tr>`).join(``)}</tbody>
            </table>
        </div>
    `;
}

function buildRepRows(rows) {
    const errors = [];
    const clean = rows.map((row, index) => {
        const employeeNo = String(C.rowValue(row, [`Employee No`, `employeeNo`, `Employee Number`, `الرقم الوظيفي`, `رقم الموظف`])).trim();
        const name = String(C.rowValue(row, [`Medrep`, `Medical Rep`, `Name`, `اسم المندوب`, `المندوب الطبي`, `الاسم`])).trim();
        const team = String(C.rowValue(row, [`Team`, `الفريق`, `اسم الفريق`])).trim();
        const birthDate = normalizeBirthDate(C.rowValue(row, [`Birth Date`, `birthDate`, `DOB`, `تاريخ الميلاد`]));
        const activeRaw = String(C.rowValue(row, [`Active`, `Status`, `فعال`], `yes`)).trim().toLowerCase();
        if (!employeeNo) errors.push(`السطر ${index + 2}: الرقم الوظيفي مفقود.`);
        if (!validEmployeeNo(employeeNo)) errors.push(`السطر ${index + 2}: الرقم الوظيفي غير صحيح.`);
        if (!name) errors.push(`السطر ${index + 2}: اسم المندوب الطبي مفقود.`);
        if (!validBirthDate(birthDate)) errors.push(`السطر ${index + 2}: تاريخ الميلاد غير صحيح.`);
        return {
            employeeNo,
            name,
            normalizedName: C.normalizeArabic(name),
            team,
            birthDate,
            active: ![`no`, `false`, `0`, `inactive`, `غير فعال`].includes(activeRaw),
            role: `medical_rep`
        };
    }).filter(row => validEmployeeNo(row.employeeNo) && row.name && validBirthDate(row.birthDate));
    return { clean, errors };
}

function buildAreaRows(rows) {
    const errors = [];
    const clean = rows.map((row, index) => {
        const team = String(C.rowValue(row, [`Team`, `الفريق`, `اسم الفريق`])).trim();
        const medrep = String(C.rowValue(row, [`Medrep`, `Medical Rep`, `مندوب`, `المندوب`, `اسم المندوب`])).trim();
        const itemName = String(C.rowValue(row, [`Item Name`, `Item`, `Product`, `الصنف`, `اسم الصنف`])).trim();
        const area = String(C.rowValue(row, [`Area`, `Region`, `المنطقة`, `اسم المنطقة`])).trim();
        if (!medrep) errors.push(`السطر ${index + 2}: اسم المندوب مفقود.`);
        if (!itemName) errors.push(`السطر ${index + 2}: اسم الصنف مفقود.`);
        if (!area) errors.push(`السطر ${index + 2}: اسم المنطقة مفقود.`);
        return { team, medrep, medrepKey: C.normalizeArabic(medrep), itemName, itemKey: C.normalizeItem(itemName), area, areaKey: C.normalizeArabic(area), source: `area_rule_upload` };
    }).filter(row => row.medrep && row.itemName && row.area);
    return { clean, errors };
}

function buildOtherShareRows(rows) {
    const errors = [];
    const clean = rows.map((row, index) => {
        const team = String(C.rowValue(row, [`Team`, `الفريق`, `اسم الفريق`])).trim();
        const medrep = String(C.rowValue(row, [`Medrep`, `Medical Rep`, `مندوب`, `المندوب`, `اسم المندوب`])).trim();
        const itemName = String(C.rowValue(row, [`Item Name`, `Item`, `Product`, `الصنف`, `اسم الصنف`])).trim();
        const rawPercentage = C.rowValue(row, [`Percentage from others`, `Percentage`, `%`, `نسبة اخرين`, `نسبة منطقة اخرين`, `النسبة`]);
        const percentage = C.parsePercentageRatio(rawPercentage, { allowEmpty: true, allowLegacyPercent: true });
        if (!medrep) errors.push(`السطر ${index + 2}: اسم المندوب مفقود.`);
        if (!itemName) errors.push(`السطر ${index + 2}: اسم الصنف مفقود.`);
        if (percentage === null || percentage === 0) errors.push(`السطر ${index + 2}: النسبة مفقودة أو صفر.`);
        if (Number.isNaN(percentage)) errors.push(`السطر ${index + 2}: النسبة غير صحيحة. استخدم رقمًا بين 0 و 1 أو صيغة مثل 20%.`);
        if (Number.isFinite(percentage) && percentage > 1) errors.push(`السطر ${index + 2}: النسبة أعلى من 100%.`);
        return {
            team,
            medrep,
            medrepKey: C.normalizeArabic(medrep),
            itemName,
            itemKey: C.normalizeItem(itemName),
            percentage,
            source: `other_share_upload`
        };
    }).filter(row => row.medrep && row.itemName && Number.isFinite(row.percentage) && row.percentage > 0 && row.percentage <= 1);
    return { clean, errors };
}

function buildTargetRows(rows) {
    const errors = [];
    const clean = rows.map((row, index) => {
        const year = C.parseNumber(C.rowValue(row, [`Year`, `السنة`], new Date().getFullYear()));
        const month = C.parseNumber(C.rowValue(row, [`Month`, `الشهر`], new Date().getMonth() + 1));
        const team = String(C.rowValue(row, [`Team`, `الفريق`, `اسم الفريق`])).trim();
        const medrep = String(C.rowValue(row, [`Medrep`, `Medical Rep`, `مندوب`, `المندوب`, `اسم المندوب`])).trim();
        const itemName = String(C.rowValue(row, [`Item Name`, `Item`, `Product`, `الصنف`, `اسم الصنف`])).trim();
        const targetValue = C.parseNumber(C.rowValue(row, [`Target Value`, `Value Target`, `Target`, `تارجت القيمة`, `هدف القيمة`]));
        const targetQty = C.parseNumber(C.rowValue(row, [`Target Qty`, `Qty Target`, `هدف الكمية`, `تارجت الكمية`]));
        if (!medrep) errors.push(`السطر ${index + 2}: اسم المندوب مفقود.`);
        if (!itemName) errors.push(`السطر ${index + 2}: اسم الصنف مفقود.`);
        if (!year || !month) errors.push(`السطر ${index + 2}: السنة أو الشهر مفقود.`);
        return { year, month, team, medrep, medrepKey: C.normalizeArabic(medrep), itemName, itemKey: C.normalizeItem(itemName), targetValue, targetQty, periodKey: `${year}-${String(month).padStart(2, `0`)}` };
    }).filter(row => row.medrep && row.itemName && row.year && row.month);
    return { clean, errors };
}

async function importByKind(kind) {
    const config = {
        reps: { fileId: `repsFile`, buttonId: `importRepsBtn`, collectionName: COLLECTIONS.reps, build: buildRepRows, docId: row => String(row.employeeNo).trim(), label: `بيانات المندوبين` },
        areaRules: { fileId: `areaRulesFile`, buttonId: `importAreaRulesBtn`, collectionName: COLLECTIONS.areaRules, build: buildAreaRows, docId: row => C.makeDocId([row.itemKey, row.areaKey, row.medrepKey]), label: `ربط المناطق` },
        otherShares: { fileId: `otherSharesFile`, buttonId: `importOtherSharesBtn`, collectionName: COLLECTIONS.otherShares, build: buildOtherShareRows, docId: row => C.makeDocId([row.itemKey, row.medrepKey]), label: `نسب اخرين` },
        targets: { fileId: `targetsFile`, buttonId: `importTargetsBtn`, collectionName: COLLECTIONS.targets, build: buildTargetRows, docId: row => C.makeDocId([row.periodKey, row.itemKey, row.medrepKey]), label: `Targets` }
    }[kind];
    const file = C.$(config.fileId)?.files?.[0];
    if (!file) return C.showToast(`اختر ملف Excel أولاً.`, `warning`);
    const button = C.$(config.buttonId);
    try {
        C.setLoading(button, true, `رفع`);
        const rawRows = await C.readExcelFile(file);
        const { clean, errors } = config.build(rawRows);
        C.$(`importWarnings`).innerHTML = errors.length ? `<strong>تنبيهات الاستيراد:</strong><ul>${errors.slice(0, 25).map(error => `<li>${C.escapeHtml(error)}</li>`).join(``)}</ul>${errors.length > 25 ? `<p>و ${errors.length - 25} تنبيه إضافي.</p>` : ``}` : ``;
        if (!clean.length) return C.showToast(`لا توجد صفوف صالحة للاستيراد.`, `error`);
        const count = await upsertRows(config.collectionName, clean, config.docId);
        C.cacheRemove(`collection_${config.collectionName}`);
        C.cacheRemove(`meta_collection_${config.collectionName}`);
        C.showToast(`تم رفع ${count} سجل.`, `success`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(error.message || `تعذر تنفيذ الرفع.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function downloadTemplate(kind) {
    const today = new Date().toISOString().slice(0, 10);
    const templates = {
        reps: { name: `medical_reps_login_template_${today}.xlsx`, sheet: `Medical Reps`, rows: [{ 'Employee No': `1001`, 'Birth Date': `1990-01-31`, 'Medrep': `شاكر سائد`, 'Team': `Matador`, 'Active': `yes` }] },
        areaRules: { name: `medical_rep_area_rules_template_${today}.xlsx`, sheet: `Area Rules`, rows: [{ 'Team': `Matador`, 'Medrep': `شاكر سائد`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Area': `مادبا` }] },
        otherShares: { name: `medical_rep_other_shares_template_${today}.xlsx`, sheet: `Other Shares`, rows: [{ 'Team': `Matador`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Medrep': `شاكر سائد`, 'Percentage from others': 0.2 }, { 'Team': `Matador`, 'Item Name': `Oprim 10 Mg Tabs 30`, 'Medrep': `شاكر سائد`, 'Percentage from others': 0.00002096721775504 }] },
        targets: { name: `medical_rep_targets_template_${today}.xlsx`, sheet: `Targets`, rows: [{ 'Year': new Date().getFullYear(), 'Month': new Date().getMonth() + 1, 'Team': `Matador`, 'Medrep': `شاكر سائد`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Target Value': 10000, 'Target Qty': 500 }] }
    }[kind];
    C.downloadWorkbook(templates.rows, templates.sheet, templates.name);
}

function exportCurrent(kind) {
    const today = new Date().toISOString().slice(0, 10);
    const config = {
        reps: { rows: state.managedReps.map(row => ({ 'Employee No': row.employeeNo || ``, 'Birth Date': row.birthDate || ``, 'Medrep': row.name || ``, 'Team': row.team || ``, 'Active': row.active === false ? `no` : `yes` })), sheet: `Medical Reps`, name: `medical_reps_current_${today}.xlsx` },
        areaRules: { rows: state.areaRules.map(row => ({ 'Team': row.team || ``, 'Medrep': row.medrep || ``, 'Item Name': row.itemName || ``, 'Area': row.area || `` })), sheet: `Area Rules`, name: `medical_rep_area_rules_current_${today}.xlsx` },
        otherShares: { rows: state.otherShares.map(row => ({ 'Team': row.team || ``, 'Item Name': row.itemName || ``, 'Medrep': row.medrep || ``, 'Percentage from others': Number.isFinite(C.parsePercentageRatio(row.percentage, { allowEmpty: true })) ? C.parsePercentageRatio(row.percentage) : `` })), sheet: `Other Shares`, name: `medical_rep_other_shares_current_${today}.xlsx` },
        targets: { rows: state.targets.map(row => ({ 'Year': row.year || ``, 'Month': row.month || ``, 'Team': row.team || ``, 'Medrep': row.medrep || ``, 'Item Name': row.itemName || ``, 'Target Value': row.targetValue || 0, 'Target Qty': row.targetQty || 0 })), sheet: `Targets`, name: `medical_rep_targets_current_${today}.xlsx` }
    }[kind];
    if (!config.rows.length) return C.showToast(`لا توجد بيانات للتصدير.`, `warning`);
    C.downloadWorkbook(config.rows, config.sheet, config.name);
}

async function saveManualRep(repKey, button) {
    const row = state.managedReps.find(item => item.key === repKey);
    if (!row) return C.showToast(`تعذر تحديد المندوب.`, `error`);
    const employeeNo = document.querySelector(`[data-rep-employee="${cssEscape(repKey)}"]`)?.value.trim() || ``;
    const birthDate = document.querySelector(`[data-rep-birth="${cssEscape(repKey)}"]`)?.value || ``;
    if (!validEmployeeNo(employeeNo)) return C.showToast(`الرقم الوظيفي غير صحيح.`, `warning`);
    if (!validBirthDate(birthDate)) return C.showToast(`تاريخ الميلاد غير صحيح.`, `warning`);

    const conflict = state.reps.find(item => String(item.employeeNo || item.id || ``) === employeeNo && C.normalizeArabic(item.name || item.medrep || ``) !== repKey);
    if (conflict) return C.showToast(`هذا الرقم الوظيفي مستخدم لمندوب آخر.`, `error`);

    const oldId = String(row.employeeNo || row.id || ``).trim();
    const payload = {
        employeeNo,
        name: row.name,
        normalizedName: repKey,
        team: row.team || ``,
        birthDate,
        active: row.active !== false,
        role: `medical_rep`,
        updatedAt: serverTimestamp()
    };

    try {
        C.setLoading(button, true, `حفظ`);
        await setDoc(doc(db, COLLECTIONS.reps, employeeNo), payload, { merge: true });
        if (oldId && oldId !== employeeNo && !isTeamAccessDoc({ id: oldId })) {
            try { await deleteDoc(doc(db, COLLECTIONS.reps, oldId)); } catch (error) { console.warn(`تعذر حذف السجل القديم:`, error); }
        }
        C.cacheRemove(`collection_${COLLECTIONS.reps}`);
        C.cacheRemove(`meta_collection_${COLLECTIONS.reps}`);
        C.showToast(`تم حفظ بيانات الدخول.`, `success`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر حفظ البيانات.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

async function saveTeamPassword(team, button) {
    const input = document.querySelector(`[data-team-pass="${cssEscape(team)}"]`);
    const password = input?.value || ``;
    if (!team) return C.showToast(`اسم الفريق غير موجود.`, `error`);
    if (password.length < 4) return C.showToast(`كلمة المرور يجب أن تكون 4 أحرف على الأقل.`, `warning`);
    try {
        C.setLoading(button, true, `حفظ`);
        const passwordHash = await C.hashText(password);
        await setDoc(doc(db, COLLECTIONS.reps, C.makeTeamAccessDocId(team)), {
            role: `medical_team_leader`,
            name: `Team Leader - ${team}`,
            team,
            normalizedTeam: C.normalizeArabic(team),
            teamLeaderAccessEnabled: true,
            passwordHash,
            passwordUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });
        if (input) input.value = ``;
        C.cacheRemove(`collection_${COLLECTIONS.reps}`);
        C.cacheRemove(`meta_collection_${COLLECTIONS.reps}`);
        C.showToast(`تم حفظ كلمة مرور الفريق.`, `success`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر حفظ كلمة المرور.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}


async function saveOtherShareGroup(groupKey, button) {
    const group = state.otherShareGroups.find(item => item.groupKey === groupKey);
    if (!group) return C.showToast(`تعذر تحديد الصنف.`, `error`);
    const inputs = [...document.querySelectorAll(`[data-share-pct="${cssEscape(groupKey)}"]`)];
    if (!inputs.length) return C.showToast(`لا توجد نسب قابلة للحفظ.`, `warning`);

    const rows = [];
    let total = 0;
    for (const input of inputs) {
        const pct = C.parsePercentageRatio(`${input.value}%`, { allowEmpty: true, allowLegacyPercent: true });
        if (!Number.isFinite(pct) || pct <= 0 || pct > 1) {
            return C.showToast(`كل النسب يجب أن تكون أكبر من 0 وأقل أو تساوي 100%.`, `warning`);
        }
        total += pct;
        rows.push({
            docId: input.dataset.shareDoc,
            team: input.dataset.shareTeam || group.team || ``,
            itemName: input.dataset.shareItem || group.itemName || ``,
            itemKey: input.dataset.shareItemKey || group.itemKey || C.normalizeItem(group.itemName || ``),
            medrep: input.dataset.shareMedrep || ``,
            medrepKey: input.dataset.shareMedrepKey || C.normalizeArabic(input.dataset.shareMedrep || ``),
            percentage: pct
        });
    }

    if (Math.abs(total - 1) > 0.000001) {
        return C.showToast(`لا يمكن الحفظ: مجموع نسب هذا الصنف ${C.formatPercentageRatio(total, { maximumFractionDigits: 4 })} وليس 100%.`, `warning`);
    }

    try {
        C.setLoading(button, true, `حفظ`);
        const batch = writeBatch(db);
        rows.forEach(row => {
            const docId = row.docId || C.makeDocId([row.itemKey, row.medrepKey]);
            batch.set(doc(db, COLLECTIONS.otherShares, docId), {
                team: row.team,
                itemName: row.itemName,
                itemKey: row.itemKey,
                medrep: row.medrep,
                medrepKey: row.medrepKey,
                percentage: row.percentage,
                source: `admin_manual_rebalance`,
                updatedAt: serverTimestamp()
            }, { merge: true });
        });
        await batch.commit();
        C.cacheRemove(`collection_${COLLECTIONS.otherShares}`);
        C.cacheRemove(`meta_collection_${COLLECTIONS.otherShares}`);
        C.showToast(`تم حفظ المجموعة ومجموعها 100%.`, `success`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر حفظ نسب الصنف.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

async function addOtherShareToGroup(groupKey, button) {
    const group = state.otherShareGroups.find(item => item.groupKey === groupKey);
    if (!group) return C.showToast(`تعذر تحديد الصنف.`, `error`);
    const select = document.querySelector(`[data-add-share-rep="${cssEscape(groupKey)}"]`);
    const input = document.querySelector(`[data-add-share-pct="${cssEscape(groupKey)}"]`);
    const repKey = select?.value || ``;
    const selected = select?.selectedOptions?.[0];
    const medrep = selected?.dataset?.repName || ``;
    const team = group.team && group.team !== `بدون فريق` ? group.team : (selected?.dataset?.repTeam || ``);
    const pct = C.parsePercentageRatio(`${input?.value || ``}%`, { allowEmpty: true, allowLegacyPercent: true });
    if (!repKey || !medrep) return C.showToast(`اختر المندوب أولاً.`, `warning`);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 1) return C.showToast(`أدخل نسبة صحيحة بين 0 و 100%.`, `warning`);
    if ((group.shares || []).some(row => row.medrepKey === repKey)) return C.showToast(`هذا المندوب موجود على الصنف بالفعل.`, `warning`);

    const nextTotal = group.total + pct;
    if (nextTotal > 1.000001) {
        return C.showToast(`لا يمكن الإضافة: المجموع سيصبح ${C.formatPercentageRatio(nextTotal, { maximumFractionDigits: 4 })}.`, `warning`);
    }

    const payload = {
        team,
        itemName: group.itemName,
        itemKey: group.itemKey,
        medrep,
        medrepKey: repKey,
        percentage: pct,
        source: `admin_manual_add`,
        updatedAt: serverTimestamp()
    };

    try {
        C.setLoading(button, true, `إضافة`);
        await setDoc(doc(db, COLLECTIONS.otherShares, C.makeDocId([group.itemKey, repKey])), payload, { merge: true });
        C.cacheRemove(`collection_${COLLECTIONS.otherShares}`);
        C.cacheRemove(`meta_collection_${COLLECTIONS.otherShares}`);
        C.showToast(nextTotal === 1 ? `تمت الإضافة والمجموع 100%.` : `تمت الإضافة. لا يزال الصنف بحاجة ضبط إلى 100%.`, nextTotal === 1 ? `success` : `warning`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر إضافة المندوب للصنف.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

async function deleteOtherShare(docId, button) {
    if (!docId) return C.showToast(`تعذر تحديد السجل.`, `error`);
    const ok = window.confirm(`هل تريد حذف هذه النسبة من منطقة اخرين؟`);
    if (!ok) return;
    try {
        C.setLoading(button, true, `حذف`);
        await deleteDoc(doc(db, COLLECTIONS.otherShares, docId));
        C.cacheRemove(`collection_${COLLECTIONS.otherShares}`);
        C.cacheRemove(`meta_collection_${COLLECTIONS.otherShares}`);
        C.showToast(`تم حذف النسبة.`, `success`);
        await refreshAll(true);
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر حذف النسبة.`, `error`);
    } finally {
        C.setLoading(button, false);
    }
}

function openRepDashboard(employeeNo) {
    const rep = state.managedReps.find(row => String(row.employeeNo || ``) === String(employeeNo || ``));
    if (!rep || !rep.employeeNo) return C.showToast(`أدخل الرقم الوظيفي أولاً.`, `warning`);
    if (rep.active === false) return C.showToast(`هذا المندوب غير فعال.`, `warning`);
    C.saveAdminImpersonation(rep);
    window.open(`dashboard.html`, `_blank`);
}

function openTeamLeader(team) {
    if (!team) return C.showToast(`اسم الفريق غير موجود.`, `warning`);
    C.saveTeamSession({ team, adminPreview: true }, true);
    window.open(`team_leader.html?team=${encodeURIComponent(team)}`, `_blank`);
}

function bindEvents() {
    C.$(`adminLoginBtn`)?.addEventListener(`click`, () => {
        const pass = C.$(`adminPassword`)?.value || ``;
        if (btoa(pass) !== C.ADMIN_SECRET_HASH) return C.showToast(`كلمة مرور الأدمن غير صحيحة.`, `error`);
        C.saveAdminSession(!!C.$(`rememberAdmin`)?.checked);
        requireAdmin();
        C.showToast(`تم تسجيل الدخول.`, `success`);
    });
    C.$(`adminPassword`)?.addEventListener(`keydown`, event => {
        if (event.key === `Enter`) C.$(`adminLoginBtn`)?.click();
    });
    C.$(`adminLogoutBtn`)?.addEventListener(`click`, () => {
        C.clearAdminSession();
        window.location.reload();
    });
    document.querySelectorAll(`.tab-btn`).forEach(button => {
        button.addEventListener(`click`, () => {
            document.querySelectorAll(`.tab-btn`).forEach(btn => btn.classList.remove(`active`));
            document.querySelectorAll(`.tab-panel`).forEach(panel => panel.classList.remove(`active`));
            button.classList.add(`active`);
            C.$(button.dataset.tab)?.classList.add(`active`);
        });
    });
    C.$(`importRepsBtn`)?.addEventListener(`click`, () => importByKind(`reps`));
    C.$(`importAreaRulesBtn`)?.addEventListener(`click`, () => importByKind(`areaRules`));
    C.$(`importOtherSharesBtn`)?.addEventListener(`click`, () => importByKind(`otherShares`));
    C.$(`importTargetsBtn`)?.addEventListener(`click`, () => importByKind(`targets`));
    C.$(`repAdminSearch`)?.addEventListener(`input`, event => {
        state.repSearch = event.target.value || ``;
        state.repPage = 1;
        renderRepsTable();
    });
    C.$(`teamAccessSearch`)?.addEventListener(`input`, event => {
        state.teamAccessSearch = event.target.value || ``;
        renderTeamAccessTable();
    });
    C.$(`otherShareSearch`)?.addEventListener(`input`, event => {
        state.otherShareSearch = event.target.value || ``;
        renderOtherShareReconciliation();
    });
    C.$(`showOnlyOtherShareIssues`)?.addEventListener(`change`, event => {
        state.showOnlyOtherShareIssues = !!event.target.checked;
        renderOtherShareReconciliation();
    });
    document.querySelectorAll(`[data-template]`).forEach(button => button.addEventListener(`click`, () => downloadTemplate(button.dataset.template)));
    document.querySelectorAll(`[data-export]`).forEach(button => button.addEventListener(`click`, () => exportCurrent(button.dataset.export)));
    document.body.addEventListener(`click`, event => {
        const repButton = event.target.closest(`[data-open-rep]`);
        if (repButton) openRepDashboard(repButton.dataset.openRep);
        const teamButton = event.target.closest(`[data-open-team]`);
        if (teamButton) openTeamLeader(teamButton.dataset.openTeam);
        const saveRepButton = event.target.closest(`[data-save-rep]`);
        if (saveRepButton) saveManualRep(saveRepButton.dataset.saveRep, saveRepButton);
        const saveTeamButton = event.target.closest(`[data-save-team-pass]`);
        if (saveTeamButton) saveTeamPassword(saveTeamButton.dataset.saveTeamPass, saveTeamButton);
        const saveShareGroupButton = event.target.closest(`[data-save-share-group]`);
        if (saveShareGroupButton) saveOtherShareGroup(saveShareGroupButton.dataset.saveShareGroup, saveShareGroupButton);
        const addShareButton = event.target.closest(`[data-add-share]`);
        if (addShareButton) addOtherShareToGroup(addShareButton.dataset.addShare, addShareButton);
        const deleteShareButton = event.target.closest(`[data-delete-share]`);
        if (deleteShareButton) deleteOtherShare(deleteShareButton.dataset.deleteShare, deleteShareButton);
        const pagerButton = event.target.closest(`[data-rep-page]`);
        if (pagerButton) {
            state.repPage += pagerButton.dataset.repPage === `next` ? 1 : -1;
            renderRepsTable();
        }
    });
    C.$(`refreshBtn`)?.addEventListener(`click`, () => refreshAll(true));
}

bindEvents();
requireAdmin();
