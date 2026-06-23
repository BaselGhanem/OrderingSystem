import {
    db,
    collection,
    getDocs,
    setDoc,
    doc,
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

const state = {
    reps: [],
    areaRules: [],
    otherShares: [],
    targets: []
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
        const [reps, areaRules, otherShares, targets] = await Promise.all([
            loadCollection(COLLECTIONS.reps, force),
            loadCollection(COLLECTIONS.areaRules, force),
            loadCollection(COLLECTIONS.otherShares, force),
            loadCollection(COLLECTIONS.targets, force)
        ]);
        state.reps = reps.sort((a, b) => String(a.name || ``).localeCompare(String(b.name || ``), `ar`));
        state.areaRules = areaRules;
        state.otherShares = otherShares;
        state.targets = targets;
        renderSummary();
        renderTables();
    } catch (error) {
        console.error(error);
        C.showToast(`تعذر تحميل بيانات بوابة الدعاية الطبية. تحقق من صلاحيات Firestore.`, `error`);
    }
}

function renderSummary() {
    C.$(`repsCount`).textContent = state.reps.length;
    C.$(`areaRulesCount`).textContent = state.areaRules.length;
    C.$(`otherSharesCount`).textContent = state.otherShares.length;
    C.$(`targetsCount`).textContent = state.targets.length;
}

function renderTables() {
    renderRepsTable();
    renderSimpleTable(`areaRulesPreview`, state.areaRules.slice(0, 80), [`team`, `medrep`, `itemName`, `area`], {
        team: `الفريق`,
        medrep: `المندوب`,
        itemName: `الصنف`,
        area: `المنطقة`
    });
    renderSimpleTable(`otherSharesPreview`, state.otherShares.slice(0, 80), [`team`, `itemName`, `medrep`, `percentage`], {
        team: `الفريق`,
        itemName: `الصنف`,
        medrep: `المندوب`,
        percentage: `نسبة اخرين`
    });
    renderSimpleTable(`targetsPreview`, state.targets.slice(0, 80), [`year`, `month`, `team`, `medrep`, `itemName`, `targetValue`, `targetQty`], {
        year: `السنة`,
        month: `الشهر`,
        team: `الفريق`,
        medrep: `المندوب`,
        itemName: `الصنف`,
        targetValue: `Target Value`,
        targetQty: `Target Qty`
    });
}

function renderRepsTable() {
    const target = C.$(`repsPreview`);
    if (!target) return;
    if (!state.reps.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-users-three"></i><span>لا توجد بيانات مندوبين مرفوعة بعد.</span></div>`;
        return;
    }
    target.innerHTML = `
        <div class="table-scroll">
            <table class="data-table compact-table admin-reps-table">
                <thead><tr><th>الرقم</th><th>المندوب الطبي</th><th>الفريق</th><th>تاريخ الميلاد</th><th>الحالة</th><th>فتح مباشر</th></tr></thead>
                <tbody>
                    ${state.reps.slice(0, 120).map(row => `
                        <tr>
                            <td>${C.escapeHtml(row.employeeNo || row.id || `-`)}</td>
                            <td class="item-name">${C.escapeHtml(row.name || `-`)}</td>
                            <td>${C.escapeHtml(row.team || `-`)}</td>
                            <td>${C.escapeHtml(row.birthDate || `-`)}</td>
                            <td>${row.active === false ? `<span class="badge badge-danger">غير فعال</span>` : `<span class="badge badge-direct">فعال</span>`}</td>
                            <td>
                                <div class="row-actions">
                                    <button class="btn btn-mini btn-primary" type="button" data-open-rep="${C.escapeHtml(row.employeeNo || row.id || ``)}"><i class="ph ph-user-focus"></i> كمندوب</button>
                                    <button class="btn btn-mini btn-light" type="button" data-open-team="${C.escapeHtml(row.team || ``)}"><i class="ph ph-users-three"></i> Team</button>
                                </div>
                            </td>
                        </tr>
                    `).join(``)}
                </tbody>
            </table>
        </div>
    `;
}

function renderSimpleTable(id, rows, keys, labels) {
    const target = C.$(id);
    if (!target) return;
    if (!rows.length) {
        target.innerHTML = `<div class="empty-state compact"><i class="ph ph-database"></i><span>لا توجد بيانات مرفوعة بعد.</span></div>`;
        return;
    }
    target.innerHTML = `
        <div class="table-scroll">
            <table class="data-table compact-table">
                <thead><tr>${keys.map(key => `<th>${labels[key] || key}</th>`).join(``)}</tr></thead>
                <tbody>
                    ${rows.map(row => `<tr>${keys.map(key => `<td>${C.escapeHtml(key === `percentage` ? `${C.parseNumber(row[key])}%` : row[key] ?? `-`)}</td>`).join(``)}</tr>`).join(``)}
                </tbody>
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
        if (!name) errors.push(`السطر ${index + 2}: اسم المندوب الطبي مفقود.`);
        if (!birthDate) errors.push(`السطر ${index + 2}: تاريخ الميلاد مفقود.`);
        return {
            employeeNo,
            name,
            normalizedName: C.normalizeArabic(name),
            team,
            birthDate,
            active: ![`no`, `false`, `0`, `inactive`, `غير فعال`].includes(activeRaw),
            role: `medical_rep`
        };
    }).filter(row => row.employeeNo && row.name && row.birthDate);
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
        return {
            team,
            medrep,
            medrepKey: C.normalizeArabic(medrep),
            itemName,
            itemKey: C.normalizeItem(itemName),
            area,
            areaKey: C.normalizeArabic(area),
            source: `area_rule_upload`
        };
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
        return {
            team,
            medrep,
            medrepKey: C.normalizeArabic(medrep),
            itemName,
            itemKey: C.normalizeItem(itemName),
            percentage,
            source: `other_share_upload`
        };
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
        return {
            year,
            month,
            team,
            medrep,
            medrepKey: C.normalizeArabic(medrep),
            itemName,
            itemKey: C.normalizeItem(itemName),
            targetValue,
            targetQty,
            periodKey: `${year}-${String(month).padStart(2, `0`)}`
        };
    }).filter(row => row.medrep && row.itemName && row.year && row.month);
    return { clean, errors };
}

async function importByKind(kind) {
    const config = {
        reps: {
            fileId: `repsFile`,
            buttonId: `importRepsBtn`,
            collectionName: COLLECTIONS.reps,
            build: buildRepRows,
            docId: row => String(row.employeeNo).trim(),
            label: `بيانات دخول المندوبين الطبيين`
        },
        areaRules: {
            fileId: `areaRulesFile`,
            buttonId: `importAreaRulesBtn`,
            collectionName: COLLECTIONS.areaRules,
            build: buildAreaRows,
            docId: row => C.makeDocId([row.itemKey, row.areaKey, row.medrepKey]),
            label: `ربط المناطق بالأصناف والمندوبين`
        },
        otherShares: {
            fileId: `otherSharesFile`,
            buttonId: `importOtherSharesBtn`,
            collectionName: COLLECTIONS.otherShares,
            build: buildOtherShareRows,
            docId: row => C.makeDocId([row.itemKey, row.medrepKey]),
            label: `نسب منطقة اخرين`
        },
        targets: {
            fileId: `targetsFile`,
            buttonId: `importTargetsBtn`,
            collectionName: COLLECTIONS.targets,
            build: buildTargetRows,
            docId: row => C.makeDocId([row.periodKey, row.itemKey, row.medrepKey]),
            label: `Targets`
        }
    }[kind];
    const file = C.$(config.fileId)?.files?.[0];
    if (!file) return C.showToast(`اختر ملف Excel أولاً.`, `warning`);
    const button = C.$(config.buttonId);
    try {
        C.setLoading(button, true, `رفع ${config.label}`);
        const rawRows = await C.readExcelFile(file);
        const { clean, errors } = config.build(rawRows);
        if (errors.length) {
            C.$(`importWarnings`).innerHTML = `<strong>تنبيهات الاستيراد:</strong><ul>${errors.slice(0, 25).map(error => `<li>${C.escapeHtml(error)}</li>`).join(``)}</ul>${errors.length > 25 ? `<p>و ${errors.length - 25} تنبيه إضافي.</p>` : ``}`;
        } else {
            C.$(`importWarnings`).innerHTML = ``;
        }
        if (!clean.length) return C.showToast(`لا توجد صفوف صالحة للاستيراد.`, `error`);
        const count = await upsertRows(config.collectionName, clean, config.docId);
        C.cacheRemove(`collection_${config.collectionName}`);
        C.cacheRemove(`meta_collection_${config.collectionName}`);
        C.showToast(`تم رفع ${count} سجل بنجاح. وتم تحديث تخزين هذا الملف فقط.`, `success`);
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
        reps: {
            name: `medical_reps_login_template_${today}.xlsx`,
            sheet: `Medical Reps`,
            rows: [
                { 'Employee No': `1001`, 'Birth Date': `1990-01-31`, 'Medrep': `شاكر سائد`, 'Team': `Matador`, 'Active': `yes` }
            ]
        },
        areaRules: {
            name: `medical_rep_area_rules_template_${today}.xlsx`,
            sheet: `Area Rules`,
            rows: [
                { 'Team': `Matador`, 'Medrep': `شاكر سائد`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Area': `مادبا` }
            ]
        },
        otherShares: {
            name: `medical_rep_other_shares_template_${today}.xlsx`,
            sheet: `Other Shares`,
            rows: [
                { 'Team': `Matador`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Medrep': `شاكر سائد`, 'Percentage from others': `20%` }
            ]
        },
        targets: {
            name: `medical_rep_targets_template_${today}.xlsx`,
            sheet: `Targets`,
            rows: [
                { 'Year': new Date().getFullYear(), 'Month': new Date().getMonth() + 1, 'Team': `Matador`, 'Medrep': `شاكر سائد`, 'Item Name': `Oprim 5 Mg Tabs 30`, 'Target Value': 10000, 'Target Qty': 500 }
            ]
        }
    }[kind];
    C.downloadWorkbook(templates.rows, templates.sheet, templates.name);
}

function exportCurrent(kind) {
    const today = new Date().toISOString().slice(0, 10);
    const config = {
        reps: {
            rows: state.reps.map(row => ({ 'Employee No': row.employeeNo || ``, 'Birth Date': row.birthDate || ``, 'Medrep': row.name || ``, 'Team': row.team || ``, 'Active': row.active === false ? `no` : `yes` })),
            sheet: `Medical Reps`,
            name: `medical_reps_current_${today}.xlsx`
        },
        areaRules: {
            rows: state.areaRules.map(row => ({ 'Team': row.team || ``, 'Medrep': row.medrep || ``, 'Item Name': row.itemName || ``, 'Area': row.area || `` })),
            sheet: `Area Rules`,
            name: `medical_rep_area_rules_current_${today}.xlsx`
        },
        otherShares: {
            rows: state.otherShares.map(row => ({ 'Team': row.team || ``, 'Item Name': row.itemName || ``, 'Medrep': row.medrep || ``, 'Percentage from others': row.percentage || 0 })),
            sheet: `Other Shares`,
            name: `medical_rep_other_shares_current_${today}.xlsx`
        },
        targets: {
            rows: state.targets.map(row => ({ 'Year': row.year || ``, 'Month': row.month || ``, 'Team': row.team || ``, 'Medrep': row.medrep || ``, 'Item Name': row.itemName || ``, 'Target Value': row.targetValue || 0, 'Target Qty': row.targetQty || 0 })),
            sheet: `Targets`,
            name: `medical_rep_targets_current_${today}.xlsx`
        }
    }[kind];
    if (!config.rows.length) return C.showToast(`لا توجد بيانات حالية للتصدير.`, `warning`);
    C.downloadWorkbook(config.rows, config.sheet, config.name);
}

function openRepDashboard(employeeNo) {
    const rep = state.reps.find(row => String(row.employeeNo || row.id || ``) === String(employeeNo || ``));
    if (!rep) return C.showToast(`تعذر تحديد المندوب.`, `error`);
    if (rep.active === false) return C.showToast(`هذا المندوب غير فعال.`, `warning`);
    C.saveAdminImpersonation(rep);
    window.open(`dashboard.html`, `_blank`);
}

function openTeamLeader(team) {
    if (!team) return C.showToast(`اسم الفريق غير موجود لهذا المندوب.`, `warning`);
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
    document.querySelectorAll(`[data-template]`).forEach(button => button.addEventListener(`click`, () => downloadTemplate(button.dataset.template)));
    document.querySelectorAll(`[data-export]`).forEach(button => button.addEventListener(`click`, () => exportCurrent(button.dataset.export)));
    document.body.addEventListener(`click`, event => {
        const repButton = event.target.closest(`[data-open-rep]`);
        if (repButton) openRepDashboard(repButton.dataset.openRep);
        const teamButton = event.target.closest(`[data-open-team]`);
        if (teamButton) openTeamLeader(teamButton.dataset.openTeam);
    });
    C.$(`refreshBtn`)?.addEventListener(`click`, () => refreshAll(true));
}

bindEvents();
requireAdmin();
