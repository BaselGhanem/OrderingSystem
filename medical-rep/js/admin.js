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
        renderSummary();
        renderTables();
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات البوابة.`, `error`);
    }
}

function renderSummary() {
    C.$(`repsCount`).textContent = state.managedReps.length;
    C.$(`areaRulesCount`).textContent = state.areaRules.length;
    C.$(`otherSharesCount`).textContent = state.otherShares.length;
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
                <tbody>${rows.map(row => `<tr>${keys.map(key => `<td>${C.escapeHtml(key === `percentage` ? `${C.parseNumber(row[key])}%` : row[key] ?? `-`)}</td>`).join(``)}</tr>`).join(``)}</tbody>
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
        const percentage = C.parseNumber(C.rowValue(row, [`Percentage from others`, `Percentage`, `%`, `نسبة اخرين`, `نسبة منطقة اخرين`, `النسبة`]));
        if (!medrep) errors.push(`السطر ${index + 2}: اسم المندوب مفقود.`);
        if (!itemName) errors.push(`السطر ${index + 2}: اسم الصنف مفقود.`);
        if (!percentage) errors.push(`السطر ${index + 2}: النسبة مفقودة أو صفر.`);
        if (percentage < 0 || percentage > 200) errors.push(`السطر ${index + 2}: النسبة غير منطقية (${percentage}%).`);
        return { team, medrep, medrepKey: C.normalizeArabic(medrep), itemName, itemKey: C.normalizeItem(itemName), percentage, source: `other_share_upload` };
    }).filter(row => row.medrep && row.itemName && row.percentage > 0);
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
        otherShares: { name: `medical_rep_other_shares_template_${today}.xlsx`, sheet: `Other Shares`, rows: [{ 'Team': `Matador`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Medrep': `شاكر سائد`, 'Percentage from others': `20%` }] },
        targets: { name: `medical_rep_targets_template_${today}.xlsx`, sheet: `Targets`, rows: [{ 'Year': new Date().getFullYear(), 'Month': new Date().getMonth() + 1, 'Team': `Matador`, 'Medrep': `شاكر سائد`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Target Value': 10000, 'Target Qty': 500 }] }
    }[kind];
    C.downloadWorkbook(templates.rows, templates.sheet, templates.name);
}

function exportCurrent(kind) {
    const today = new Date().toISOString().slice(0, 10);
    const config = {
        reps: { rows: state.managedReps.map(row => ({ 'Employee No': row.employeeNo || ``, 'Birth Date': row.birthDate || ``, 'Medrep': row.name || ``, 'Team': row.team || ``, 'Active': row.active === false ? `no` : `yes` })), sheet: `Medical Reps`, name: `medical_reps_current_${today}.xlsx` },
        areaRules: { rows: state.areaRules.map(row => ({ 'Team': row.team || ``, 'Medrep': row.medrep || ``, 'Item Name': row.itemName || ``, 'Area': row.area || `` })), sheet: `Area Rules`, name: `medical_rep_area_rules_current_${today}.xlsx` },
        otherShares: { rows: state.otherShares.map(row => ({ 'Team': row.team || ``, 'Item Name': row.itemName || ``, 'Medrep': row.medrep || ``, 'Percentage from others': row.percentage || 0 })), sheet: `Other Shares`, name: `medical_rep_other_shares_current_${today}.xlsx` },
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
