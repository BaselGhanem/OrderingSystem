import {
    db, collection, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc
} from './firebase.js';
import {
    loadSystemConfig,
    invalidateSystemConfigCache,
    hashPassword,
    ROLE_LABELS,
    ROLE_ROUTES,
    PERMISSION_CATALOG,
    DEFAULT_ROLE_PERMISSIONS,
    DEFAULT_SYSTEM_USERS,
    DEFAULT_GENERAL_SETTINGS,
    normalizeRole,
    guardPage,
    hasPermission
} from './system-config.js?v=20260712_settings_control_center_v2';

const $ = id => document.getElementById(id);
const ROLE_ORDER = ['supervisor', 'market_manager', 'finance_controller', 'orders_staff', 'reports', 'settings', 'audit', 'control'];

const LEGACY_REP_SUPERVISORS = Object.freeze({
    'مراد عمر': 'محمد طوالبه',
    'مؤيد الزعبي': 'محمد طوالبه',
    'محمد عبدربه': 'محمد طوالبه',
    'محمد الفاعوري': 'عبدالله الناطور',
    'اجود التلهوني': 'عبدالله الناطور',
    'يزيد الرقب': 'محمد طوالبه',
    'تامر عقل': 'محمد طوالبه',
    'محمد ابو يامين': 'عبدالله الناطور',
    'مراد الظاهر': 'عبدالله الناطور'
});

const LEGACY_REP_PASSWORDS = Object.freeze({
    'قضايا': 'MjAyNg==',
    'LPO': 'MjAyNg==',
    'Settlement': 'MjAyNg==',
    'الهاتف': 'MjAyNg==',
    'مراد الظاهر': 'MzQ3OA==',
    'محمد ابو يامين': 'NDA5OQ==',
    'يزيد الرقب': 'NDE4Nw==',
    'محمد النسور': 'MjAyNg==',
    'مؤيد الزعبي': 'MzQ3OQ==',
    'محمد طوالبه': 'MjAyNjA0',
    'اجود التلهوني': 'MzczNw==',
    'تامر عقل': 'MzU2OQ==',
    'Inactive': 'MjAyNg==',
    'مغلقه': 'MjAyNg==',
    'اخرين': 'MjAyNg==',
    'محمد الفاعوري': 'NDAyMA==',
    'مراد عمر': 'MTUxMA==',
    'محمد عبدربه': 'NDAyOQ=='
});

const state = {
    reps: [],
    users: [],
    products: [],
    pharmacies: [],
    orders: [],
    permissions: {},
    general: {},
    initialized: false
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function toast(message, type = 'info') {
    let container = document.getElementById('settingsConsoleToast');
    if (!container) {
        container = document.createElement('div');
        container.id = 'settingsConsoleToast';
        container.className = 'settings-console-toast-wrap';
        document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.className = `settings-console-toast ${type}`;
    item.innerHTML = `<i class="ph ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : 'ph-info'}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(item);
    requestAnimationFrame(() => item.classList.add('show'));
    setTimeout(() => {
        item.classList.remove('show');
        setTimeout(() => item.remove(), 250);
    }, 3600);
}

function setBusy(button, busy, text = 'جاري الحفظ...') {
    if (!button) return;
    if (busy) {
        button.dataset.originalHtml = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="ph ph-circle-notch ph-spin"></i> ${escapeHtml(text)}`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
}

async function runInChunks(rows, handler, chunkSize = 25) {
    const safeChunkSize = Math.min(Math.max(Number(chunkSize) || 25, 1), 25);
    let completed = 0;
    for (let i = 0; i < rows.length; i += safeChunkSize) {
        const chunk = rows.slice(i, i + safeChunkSize);
        await Promise.all(chunk.map(handler));
        completed += chunk.length;
        if (i + safeChunkSize < rows.length) await new Promise(resolve => setTimeout(resolve, 80));
    }
    return completed;
}

function invalidateAllOperationalCaches(scope = 'settings') {
    const prefixes = ['dad_app_cache', 'dad_orders_', 'dad_products_', 'dad_system_config_', 'dad_report_cache'];
    [localStorage, sessionStorage].forEach(storage => {
        try {
            Object.keys(storage).forEach(key => {
                if (prefixes.some(prefix => key.startsWith(prefix))) storage.removeItem(key);
            });
            storage.setItem('dad_cache_invalidated_at', new Date().toISOString());
            storage.setItem('dad_cache_invalidated_scope', scope);
        } catch (_) {}
    });
    invalidateSystemConfigCache();
}

function normalizeRep(row = {}) {
    return {
        id: String(row.id || '').trim(),
        name: String(row.name || row.id || '').trim(),
        supervisorId: String(row.supervisorId || row.managerId || '').trim(),
        supervisorName: String(row.supervisorName || row.managerName || row.supervisor || '').trim(),
        passwordHash: String(row.passwordHash || '').trim(),
        active: row.active !== false,
        raw: row
    };
}

function normalizeUser(row = {}) {
    return {
        id: String(row.id || '').trim(),
        displayName: String(row.displayName || row.name || '').trim(),
        username: String(row.username || '').trim(),
        role: normalizeRole(row.role || row.type || ''),
        passwordHash: String(row.passwordHash || '').trim(),
        active: row.active !== false,
        route: String(row.route || '').trim(),
        permissions: row.permissions && typeof row.permissions === 'object' ? row.permissions : {},
        raw: row
    };
}

function roleOptions(selected = '') {
    return ROLE_ORDER.map(role => `<option value="${role}"${role === selected ? ' selected' : ''}>${escapeHtml(ROLE_LABELS[role] || role)}</option>`).join('');
}

function supervisorOptions(selectedId = '', selectedName = '') {
    const supervisors = state.users.filter(user => user.active && user.role === 'supervisor');
    const options = ['<option value="">-- بدون مشرف --</option>'];
    supervisors.forEach(user => {
        const selected = user.id === selectedId || (!selectedId && user.displayName === selectedName);
        options.push(`<option value="${escapeHtml(user.id)}" data-name="${escapeHtml(user.displayName)}"${selected ? ' selected' : ''}>${escapeHtml(user.displayName)}</option>`);
    });
    if (selectedName && !supervisors.some(user => user.displayName === selectedName)) {
        options.push(`<option value="" data-name="${escapeHtml(selectedName)}" selected>${escapeHtml(selectedName)} — غير موجود كحساب</option>`);
    }
    return options.join('');
}

async function loadAllData(showMessage = true, forceCollections = true) {
    const refreshBtn = $('refreshControlCenterBtn');
    setBusy(refreshBtn, true, 'جاري الفحص...');
    try {
        const refreshCollections = forceCollections || !state.initialized;
        const [config, repsSnap, productsSnap, pharmaciesSnap, ordersSnap] = await Promise.all([
            loadSystemConfig(state.initialized),
            getDocs(collection(db, 'reps')),
            refreshCollections ? getDocs(collection(db, 'products')) : Promise.resolve(null),
            refreshCollections ? getDocs(collection(db, 'pharmacies')) : Promise.resolve(null),
            refreshCollections ? getDocs(collection(db, 'orders')) : Promise.resolve(null)
        ]);

        state.reps = repsSnap.docs.map(item => normalizeRep({ id: item.id, ...item.data() })).sort((a, b) => a.name.localeCompare(b.name));
        if (productsSnap) state.products = productsSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        if (pharmaciesSnap) state.pharmacies = pharmaciesSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        if (ordersSnap) state.orders = ordersSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        state.users = (config.users || []).map(normalizeUser).sort((a, b) => a.displayName.localeCompare(b.displayName));
        state.permissions = JSON.parse(JSON.stringify(config.rolePermissions || DEFAULT_ROLE_PERMISSIONS));
        state.general = { ...DEFAULT_GENERAL_SETTINGS, ...(config.general || {}) };
        state.initialized = true;

        renderDashboard();
        renderRepresentatives();
        renderSystemUsers();
        renderPermissions();
        renderGeneralSettings();
        if (showMessage) toast('تم فحص جميع بيانات النظام وتحديث مركز التحكم.', 'success');
    } catch (error) {
        console.error('Control center load failed:', error);
        toast('تعذر تحميل بعض بيانات مركز التحكم. راجع اتصال Firebase.', 'error');
    } finally {
        setBusy(refreshBtn, false);
    }
}

function countDuplicates(values) {
    const seen = new Map();
    values.filter(Boolean).forEach(value => {
        const key = String(value).trim().toLowerCase();
        seen.set(key, (seen.get(key) || 0) + 1);
    });
    return Array.from(seen.values()).filter(count => count > 1).reduce((sum, count) => sum + count, 0);
}

function renderDashboard() {
    const cards = $('controlCenterStats');
    if (cards) {
        cards.innerHTML = [
            ['ph-users-three', 'المناديب', state.reps.length, `${state.reps.filter(rep => rep.active).length} فعّال`],
            ['ph-identification-card', 'حسابات النظام', state.users.length, `${state.users.filter(user => user.active).length} فعّال`],
            ['ph-package', 'الأصناف', state.products.length, `${countDuplicates(state.products.map(p => p.productCode || p.product_code || p.code))} كود مكرر`],
            ['ph-storefront', 'الصيدليات', state.pharmacies.length, `${state.pharmacies.filter(p => !(p.rep_id || p.repId)).length} بدون مندوب`],
            ['ph-receipt', 'الطلبيات', state.orders.length, 'مشمولة بفحص التأثير']
        ].map(([icon, label, value, note]) => `
            <article class="control-stat-card">
                <i class="ph ${icon}"></i>
                <div><span>${escapeHtml(label)}</span><strong>${Number(value).toLocaleString('en-US')}</strong><small>${escapeHtml(note)}</small></div>
            </article>`).join('');
    }

    const issues = [];
    const repsWithoutPassword = state.reps.filter(rep => !rep.passwordHash).length;
    const legacyRepPasswords = state.reps.filter(rep => rep.active && rep.passwordHash && !String(rep.passwordHash).startsWith('sha256:')).length;
    const repsWithoutSupervisor = state.reps.filter(rep => rep.active && !rep.supervisorName).length;
    const usersWithoutPassword = state.users.filter(user => user.active && !user.passwordHash).length;
    const activeSupervisors = state.users.filter(user => user.active && user.role === 'supervisor');
    const invalidSupervisorAssignments = state.reps.filter(rep => rep.active && rep.supervisorName && !activeSupervisors.some(user => user.id === rep.supervisorId || user.displayName === rep.supervisorName)).length;
    const legacyDefaultUsers = state.users.filter(user => user.active && (user.raw?.legacy === true || user.passwordHash === 'MjAyNjA0')).length;
    const orphanPharmacies = state.pharmacies.filter(pharmacy => {
        const repId = String(pharmacy.rep_id || pharmacy.repId || '').trim();
        return repId && !state.reps.some(rep => rep.id === repId);
    }).length;
    const duplicateProductCodes = countDuplicates(state.products.map(product => product.productCode || product.product_code || product.code));
    const duplicateProductNames = countDuplicates(state.products.map(product => product.name));

    if (repsWithoutPassword) issues.push(['warning', `${repsWithoutPassword} مندوب بدون كلمة سر محفوظة في Firebase.`]);
    if (legacyRepPasswords) issues.push(['info', `${legacyRepPasswords} مندوب يستخدم كلمة سر قديمة متوافقة؛ يمكن تحديثها تدريجياً إلى تشفير SHA-256 من الجدول.`]);
    if (repsWithoutSupervisor) issues.push(['warning', `${repsWithoutSupervisor} مندوب فعّال بدون مشرف محدد.`]);
    if (usersWithoutPassword) issues.push(['danger', `${usersWithoutPassword} حساب نظام فعّال بدون كلمة سر.`]);
    if (invalidSupervisorAssignments) issues.push(['danger', `${invalidSupervisorAssignments} مندوب مرتبط بمشرف غير موجود أو غير فعّال كحساب مشرف.`]);
    if (legacyDefaultUsers) issues.push(['warning', `${legacyDefaultUsers} حساب يستخدم كلمة السر الافتراضية القديمة؛ غيّرها قبل تفعيل الصلاحيات الصارمة.`]);
    if (orphanPharmacies) issues.push(['danger', `${orphanPharmacies} صيدلية مرتبطة بمعرّف مندوب غير موجود.`]);
    if (duplicateProductCodes) issues.push(['warning', `${duplicateProductCodes} سجل صنف ضمن أكواد مكررة.`]);
    if (duplicateProductNames) issues.push(['warning', `${duplicateProductNames} سجل صنف ضمن أسماء مكررة.`]);
    if (!state.general.enforcePermissions) issues.push(['info', 'تطبيق الصلاحيات الصارم غير مفعّل؛ النظام يعمل بوضع التوافق الحالي.']);
    if (!issues.length) issues.push(['success', 'لم يكتشف الفحص أي مشكلة هيكلية واضحة.']);

    const issueBox = $('systemHealthList');
    if (issueBox) issueBox.innerHTML = issues.map(([type, text]) => `<div class="health-row ${type}"><i class="ph ${type === 'success' ? 'ph-check-circle' : type === 'danger' ? 'ph-warning-octagon' : type === 'warning' ? 'ph-warning' : 'ph-info'}"></i><span>${escapeHtml(text)}</span></div>`).join('');

    const source = $('configSourceBadge');
    if (source) source.textContent = state.users.some(user => !user.raw?.legacy) || state.general.updatedAt ? 'إعدادات Firebase مفعّلة' : 'وضع التوافق الافتراضي';
}

function filterRows(containerSelector, query) {
    const normalized = String(query || '').trim().toLowerCase();
    document.querySelectorAll(`${containerSelector} tr[data-search]`).forEach(row => {
        row.hidden = normalized && !String(row.dataset.search || '').toLowerCase().includes(normalized);
    });
}

function renderRepresentatives() {
    const body = $('representativesTableBody');
    if (!body) return;
    body.innerHTML = state.reps.map(rep => `
        <tr data-id="${escapeHtml(rep.id)}" data-search="${escapeHtml(`${rep.name} ${rep.supervisorName}`)}">
            <td class="doc-id-text">${escapeHtml(rep.id)}</td>
            <td><input class="table-input rep-console-name" value="${escapeHtml(rep.name)}"></td>
            <td><select class="table-select rep-console-supervisor">${supervisorOptions(rep.supervisorId, rep.supervisorName)}</select></td>
            <td><input class="table-input rep-console-password" type="password" autocomplete="new-password" placeholder="اتركها فارغة دون تغيير"></td>
            <td><label class="switch-line"><input class="rep-console-active" type="checkbox"${rep.active ? ' checked' : ''}><span>فعّال</span></label></td>
            <td><button class="btn-local btn-small btn-green save-rep-console-btn" type="button"><i class="ph ph-floppy-disk"></i> حفظ وتطبيق</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty-inline">لا توجد مناديب.</td></tr>';

    body.querySelectorAll('.save-rep-console-btn').forEach(button => button.addEventListener('click', () => saveRepresentativeRow(button.closest('tr'))));
}

async function saveRepresentativeRow(row) {
    const id = row?.dataset.id;
    const current = state.reps.find(rep => rep.id === id);
    if (!id || !current) return;
    const button = row.querySelector('.save-rep-console-btn');
    const name = row.querySelector('.rep-console-name')?.value.trim() || '';
    const supervisorSelect = row.querySelector('.rep-console-supervisor');
    const supervisorId = supervisorSelect?.value || '';
    const supervisorName = supervisorId
        ? supervisorSelect?.selectedOptions?.[0]?.dataset?.name || supervisorSelect?.selectedOptions?.[0]?.textContent?.replace(/ — غير موجود كحساب$/, '') || ''
        : '';
    const password = row.querySelector('.rep-console-password')?.value || '';
    const active = !!row.querySelector('.rep-console-active')?.checked;
    if (!name) return toast('اسم المندوب لا يمكن أن يكون فارغاً.', 'error');
    if (state.general.representativePasswordRequired !== false && name !== current.name && !current.passwordHash && !password) {
        return toast('عند تغيير اسم مندوب قديم يجب تعيين كلمة سر جديدة حتى لا يفقد إمكانية الدخول.', 'error');
    }

    const cascade = $('cascadeRepChanges')?.checked !== false;
    const nameChanged = name !== current.name;
    const supervisorChanged = supervisorName !== current.supervisorName || supervisorId !== current.supervisorId;
    const confirmed = !nameChanged && !supervisorChanged ? true : confirm(`سيتم حفظ بيانات المندوب${cascade ? ' وتطبيق الاسم/المشرف على الصيدليات والطلبيات الحالية' : ''}. هل تريد المتابعة؟`);
    if (!confirmed) return;

    setBusy(button, true);
    try {
        const payload = {
            name,
            supervisorId,
            supervisorName,
            managerName: supervisorName,
            supervisor: supervisorName,
            active,
            updatedAt: new Date(),
            updatedFrom: 'setting.html'
        };
        if (password) payload.passwordHash = await hashPassword(password);
        await setDoc(doc(db, 'reps', id), payload, { merge: true });

        let changedPharmacies = 0;
        let changedOrders = 0;
        if (cascade && (nameChanged || supervisorChanged)) {
            const pharmacies = state.pharmacies.filter(pharmacy => String(pharmacy.rep_id || pharmacy.repId || '') === id);
            await runInChunks(pharmacies, async pharmacy => {
                await updateDoc(doc(db, 'pharmacies', pharmacy.id), {
                    repName: name,
                    supervisor: supervisorName || '-',
                    supervisorName: supervisorName || '',
                    updatedAt: new Date()
                });
                changedPharmacies += 1;
            });

            const orders = state.orders.filter(order => String(order.repId || order.representativeId || '') === id || [order.repName, order.representativeName].includes(current.name));
            await runInChunks(orders, async order => {
                const patch = { updatedAt: new Date() };
                if (nameChanged) {
                    patch.repName = name;
                    patch.representativeName = name;
                }
                if (supervisorChanged) {
                    patch.managerName = supervisorName || '';
                    patch.supervisorName = supervisorName || '';
                }
                await updateDoc(doc(db, 'orders', order.id), patch);
                changedOrders += 1;
            });
        }

        invalidateAllOperationalCaches('representatives');
        toast(`تم حفظ المندوب. صيدليات محدثة: ${changedPharmacies}، طلبيات محدثة: ${changedOrders}.`, 'success');
        await loadAllData(false, true);
    } catch (error) {
        console.error('Representative save failed:', error);
        toast('تعذر حفظ المندوب أو تطبيق التغييرات.', 'error');
    } finally {
        setBusy(button, false);
    }
}

async function addRepresentative() {
    const button = $('addRepresentativeBtn');
    const name = $('newRepresentativeName')?.value.trim() || '';
    const password = $('newRepresentativePassword')?.value || '';
    const supervisorSelect = $('newRepresentativeSupervisor');
    const supervisorId = supervisorSelect?.value || '';
    const supervisorName = supervisorId
        ? supervisorSelect?.selectedOptions?.[0]?.dataset?.name || supervisorSelect?.selectedOptions?.[0]?.textContent || ''
        : '';
    if (!name) return toast('أدخل اسم المندوب.', 'error');
    if (state.general.representativePasswordRequired !== false && !password) return toast('كلمة السر مطلوبة لأن دخول المناديب محمي حالياً.', 'error');
    if (state.reps.some(rep => rep.name.toLowerCase() === name.toLowerCase())) return toast('يوجد مندوب بنفس الاسم.', 'error');
    setBusy(button, true);
    try {
        const payload = {
            name,
            active: true,
            supervisorId,
            supervisorName,
            managerName: supervisorName,
            supervisor: supervisorName,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdFrom: 'setting.html'
        };
        if (password) payload.passwordHash = await hashPassword(password);
        await addDoc(collection(db, 'reps'), payload);
        $('newRepresentativeName').value = '';
        $('newRepresentativePassword').value = '';
        invalidateAllOperationalCaches('representatives');
        toast('تمت إضافة المندوب.', 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر إضافة المندوب.', 'error');
    } finally {
        setBusy(button, false);
    }
}

function renderSystemUsers() {
    const body = $('systemUsersTableBody');
    if (!body) return;
    body.innerHTML = state.users.map(user => `
        <tr data-id="${escapeHtml(user.id)}" data-search="${escapeHtml(`${user.displayName} ${user.role}`)}">
            <td class="doc-id-text">${escapeHtml(user.id)}</td>
            <td><input class="table-input system-user-name" value="${escapeHtml(user.displayName)}"></td>
            <td><select class="table-select system-user-role">${roleOptions(user.role)}</select></td>
            <td><input class="table-input system-user-password" type="password" autocomplete="new-password" placeholder="اتركها فارغة دون تغيير"></td>
            <td><label class="switch-line"><input class="system-user-active" type="checkbox"${user.active ? ' checked' : ''}><span>فعّال</span></label></td>
            <td><button class="btn-local btn-small btn-green save-system-user-btn" type="button"><i class="ph ph-floppy-disk"></i> حفظ</button></td>
        </tr>`).join('') || '<tr><td colspan="6" class="empty-inline">لا توجد حسابات نظام.</td></tr>';
    body.querySelectorAll('.save-system-user-btn').forEach(button => button.addEventListener('click', () => saveSystemUserRow(button.closest('tr'))));

    const newSupervisor = $('newRepresentativeSupervisor');
    if (newSupervisor) newSupervisor.innerHTML = supervisorOptions('', '');
}

async function saveSystemUserRow(row) {
    const id = row?.dataset.id;
    const current = state.users.find(user => user.id === id);
    if (!id || !current) return;
    const button = row.querySelector('.save-system-user-btn');
    const displayName = row.querySelector('.system-user-name')?.value.trim() || '';
    const role = normalizeRole(row.querySelector('.system-user-role')?.value || '');
    const password = row.querySelector('.system-user-password')?.value || '';
    const active = !!row.querySelector('.system-user-active')?.checked;
    if (!displayName || !role) return toast('الاسم والدور مطلوبان.', 'error');
    if (state.users.some(user => user.id !== id && user.displayName.toLowerCase() === displayName.toLowerCase())) return toast('يوجد حساب نظام آخر بنفس الاسم.', 'error');
    const otherActiveSettingsAccounts = state.users.filter(user => user.id !== id && user.active && user.role === 'settings');
    if (current.role === 'settings' && (role !== 'settings' || !active) && otherActiveSettingsAccounts.length === 0) {
        return toast('لا يمكن تعطيل آخر حساب إعدادات أو تغيير دوره؛ أضف حساب إعدادات فعّالاً أولاً.', 'error');
    }

    const cascade = $('cascadeSupervisorChanges')?.checked !== false;
    const assignedReps = state.reps.filter(rep => rep.supervisorId === id || rep.supervisorName === current.displayName);
    if (current.role === 'supervisor' && assignedReps.length && (role !== 'supervisor' || !active)) {
        return toast(`لا يمكن تغيير دور هذا المشرف أو تعطيله قبل إعادة توزيع ${assignedReps.length} مندوب تابع له.`, 'error');
    }
    const supervisorRename = current.role === 'supervisor' && displayName !== current.displayName;
    if (supervisorRename && cascade && !confirm('سيتم تغيير اسم المشرف داخل المناديب والصيدليات والطلبيات الحالية. هل تريد المتابعة؟')) return;

    setBusy(button, true);
    try {
        const payload = {
            displayName,
            name: displayName,
            role,
            type: role,
            active,
            route: ROLE_ROUTES[role] || '',
            updatedAt: new Date(),
            updatedFrom: 'setting.html'
        };
        if (password) payload.passwordHash = await hashPassword(password);
        await setDoc(doc(db, 'systemUsers', id), payload, { merge: true });

        let affected = 0;
        if (supervisorRename && cascade) {
            const reps = state.reps.filter(rep => rep.supervisorId === id || rep.supervisorName === current.displayName);
            await runInChunks(reps, async rep => {
                await updateDoc(doc(db, 'reps', rep.id), {
                    supervisorId: id,
                    supervisorName: displayName,
                    managerName: displayName,
                    supervisor: displayName,
                    updatedAt: new Date()
                });
                affected += 1;
            });
            const pharmacies = state.pharmacies.filter(pharmacy => [pharmacy.supervisor, pharmacy.supervisorName].includes(current.displayName));
            await runInChunks(pharmacies, async pharmacy => {
                await updateDoc(doc(db, 'pharmacies', pharmacy.id), { supervisor: displayName, supervisorName: displayName, updatedAt: new Date() });
                affected += 1;
            });
            const orders = state.orders.filter(order => [order.managerName, order.supervisorName, order.supervisor].includes(current.displayName));
            await runInChunks(orders, async order => {
                await updateDoc(doc(db, 'orders', order.id), { managerName: displayName, supervisorName: displayName, updatedAt: new Date() });
                affected += 1;
            });
        }

        invalidateAllOperationalCaches('system-users');
        toast(`تم حفظ الحساب${affected ? ` وتحديث ${affected} سجل تابع` : ''}.`, 'success');
        await loadAllData(false, true);
    } catch (error) {
        console.error(error);
        toast('تعذر حفظ حساب النظام.', 'error');
    } finally {
        setBusy(button, false);
    }
}

async function addSystemUser() {
    const button = $('addSystemUserBtn');
    const displayName = $('newSystemUserName')?.value.trim() || '';
    const role = normalizeRole($('newSystemUserRole')?.value || '');
    const password = $('newSystemUserPassword')?.value || '';
    if (!displayName || !role || !password) return toast('الاسم والدور وكلمة السر مطلوبة للحساب الجديد.', 'error');
    if (state.users.some(user => user.displayName.toLowerCase() === displayName.toLowerCase())) return toast('يوجد حساب نظام بنفس الاسم.', 'error');
    setBusy(button, true);
    try {
        await addDoc(collection(db, 'systemUsers'), {
            displayName,
            name: displayName,
            role,
            type: role,
            passwordHash: await hashPassword(password),
            active: true,
            route: ROLE_ROUTES[role] || '',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdFrom: 'setting.html'
        });
        $('newSystemUserName').value = '';
        $('newSystemUserPassword').value = '';
        invalidateAllOperationalCaches('system-users');
        toast('تمت إضافة حساب النظام.', 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر إضافة حساب النظام.', 'error');
    } finally {
        setBusy(button, false);
    }
}

function renderPermissions() {
    const host = $('permissionsMatrix');
    if (!host) return;
    host.innerHTML = ROLE_ORDER.map(role => {
        const permissions = state.permissions[role] || {};
        return `
            <article class="permission-role-card" data-role="${role}">
                <div class="permission-role-head">
                    <div><i class="ph ph-shield-check"></i><strong>${escapeHtml(ROLE_LABELS[role] || role)}</strong></div>
                    <div class="permission-role-actions">
                        <button type="button" class="mini-link permission-all">تحديد الكل</button>
                        <button type="button" class="mini-link permission-none">إلغاء الكل</button>
                    </div>
                </div>
                <div class="permission-checkbox-grid">
                    ${PERMISSION_CATALOG.map(([key, label]) => `
                        <label class="permission-check">
                            <input type="checkbox" data-permission-key="${escapeHtml(key)}"${permissions[key] === true ? ' checked' : ''}>
                            <span>${escapeHtml(label)}</span>
                        </label>`).join('')}
                </div>
            </article>`;
    }).join('');

    host.querySelectorAll('.permission-all').forEach(button => button.addEventListener('click', () => button.closest('.permission-role-card').querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = true)));
    host.querySelectorAll('.permission-none').forEach(button => button.addEventListener('click', () => button.closest('.permission-role-card').querySelectorAll('input[type="checkbox"]').forEach(input => input.checked = false)));
}

async function savePermissions() {
    const button = $('savePermissionsBtn');
    const cards = Array.from(document.querySelectorAll('.permission-role-card'));
    const nextMatrix = {};
    cards.forEach(card => {
        const role = card.dataset.role;
        const permissions = {};
        card.querySelectorAll('[data-permission-key]').forEach(input => { permissions[input.dataset.permissionKey] = input.checked; });
        nextMatrix[role] = permissions;
    });

    const requiredControlPermissions = ['page.settings', 'settings.manage_permissions', 'settings.manage_users', 'settings.manage_system'];
    const activeUsers = state.users.filter(user => user.active && user.passwordHash);
    const missingControlPermission = requiredControlPermissions.find(permission => !activeUsers.some(user => {
        if (Object.prototype.hasOwnProperty.call(user.permissions || {}, permission)) return user.permissions[permission] === true;
        return nextMatrix[user.role]?.[permission] === true;
    }));
    if (missingControlPermission) {
        const label = PERMISSION_CATALOG.find(([key]) => key === missingControlPermission)?.[1] || missingControlPermission;
        return toast(`لا يمكن الحفظ: لا يوجد حساب فعّال سيحتفظ بصلاحية «${label}».`, 'error');
    }

    setBusy(button, true);
    try {
        await Promise.all(Object.entries(nextMatrix).map(([role, permissions]) =>
            setDoc(doc(db, 'rolePermissions', role), { role, permissions, updatedAt: new Date(), updatedFrom: 'setting.html' }, { merge: true })
        ));
        invalidateAllOperationalCaches('permissions');
        toast('تم حفظ مصفوفة الصلاحيات.', 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر حفظ الصلاحيات.', 'error');
    } finally {
        setBusy(button, false);
    }
}

function renderGeneralSettings() {
    const fields = {
        systemNameInput: state.general.systemName,
        companyNameInput: state.general.companyName,
        companyLogoInput: state.general.companyLogoUrl,
        currencyLabelInput: state.general.currencyLabel,
        cacheVersionInput: state.general.cacheVersion
    };
    Object.entries(fields).forEach(([id, value]) => { if ($(id)) $(id).value = value || ''; });
    if ($('enforcePermissionsInput')) $('enforcePermissionsInput').checked = state.general.enforcePermissions === true;
    if ($('representativePasswordRequiredInput')) $('representativePasswordRequiredInput').checked = state.general.representativePasswordRequired !== false;
    if ($('allowRememberPasswordsInput')) $('allowRememberPasswordsInput').checked = state.general.allowRememberPasswords !== false;
    const logo = $('generalLogoPreview');
    if (logo) logo.src = state.general.companyLogoUrl || DEFAULT_GENERAL_SETTINGS.companyLogoUrl;
}

async function saveGeneralSettings() {
    const button = $('saveGeneralSettingsBtn');
    const enforcePermissions = !!$('enforcePermissionsInput')?.checked;
    if (enforcePermissions) {
        const activeProtectedRoles = state.users.filter(user => user.active && user.passwordHash && ['supervisor', 'market_manager', 'finance_controller', 'orders_staff', 'reports', 'settings'].includes(user.role));
        if (activeProtectedRoles.length < 6 && !confirm('بعض الأدوار الأساسية لا تملك حساباً فعالاً بكلمة سر. تفعيل الصلاحيات الصارمة قد يمنع الوصول لبعض الشاشات. هل تريد المتابعة؟')) return;
    }
    setBusy(button, true);
    try {
        const currentRevision = Number(state.general.dataRevision || 1);
        const payload = {
            systemName: $('systemNameInput')?.value.trim() || DEFAULT_GENERAL_SETTINGS.systemName,
            companyName: $('companyNameInput')?.value.trim() || DEFAULT_GENERAL_SETTINGS.companyName,
            companyLogoUrl: $('companyLogoInput')?.value.trim() || DEFAULT_GENERAL_SETTINGS.companyLogoUrl,
            currencyLabel: $('currencyLabelInput')?.value.trim() || DEFAULT_GENERAL_SETTINGS.currencyLabel,
            cacheVersion: $('cacheVersionInput')?.value.trim() || DEFAULT_GENERAL_SETTINGS.cacheVersion,
            enforcePermissions,
            representativePasswordRequired: !!$('representativePasswordRequiredInput')?.checked,
            allowRememberPasswords: !!$('allowRememberPasswordsInput')?.checked,
            dataRevision: currentRevision + 1,
            updatedAt: new Date(),
            updatedFrom: 'setting.html'
        };
        await setDoc(doc(db, 'systemSettings', 'main'), payload, { merge: true });
        invalidateAllOperationalCaches('general-settings');
        toast('تم حفظ إعدادات النظام ورفع رقم مراجعة البيانات.', 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر حفظ إعدادات النظام.', 'error');
    } finally {
        setBusy(button, false);
    }
}

async function bumpDataRevision() {
    const button = $('bumpDataRevisionBtn');
    setBusy(button, true, 'جاري التحديث...');
    try {
        const snap = await getDoc(doc(db, 'systemSettings', 'main'));
        const current = snap.exists() ? snap.data() : {};
        await setDoc(doc(db, 'systemSettings', 'main'), {
            ...DEFAULT_GENERAL_SETTINGS,
            ...current,
            dataRevision: Number(current.dataRevision || 1) + 1,
            cacheVersion: current.cacheVersion || DEFAULT_GENERAL_SETTINGS.cacheVersion,
            updatedAt: new Date(),
            cacheInvalidatedAt: new Date()
        }, { merge: true });
        invalidateAllOperationalCaches('manual-refresh');
        toast('تم إجبار جميع الأجهزة على قراءة البيانات الجديدة عند الفتح التالي.', 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر رفع رقم مراجعة البيانات.', 'error');
    } finally {
        setBusy(button, false);
    }
}

async function initializeControlCollections() {
    const button = $('initializeControlCenterBtn');
    if (!confirm('سيتم إنشاء إعدادات النظام والحسابات والصلاحيات الافتراضية فقط عند عدم وجودها. لن يتم حذف أي بيانات حالية.')) return;
    setBusy(button, true, 'جاري التهيئة...');
    try {
        const settingsRef = doc(db, 'systemSettings', 'main');
        const settingsSnap = await getDoc(settingsRef);
        if (!settingsSnap.exists()) await setDoc(settingsRef, { ...DEFAULT_GENERAL_SETTINGS, createdAt: new Date(), updatedAt: new Date() });

        const usersSnap = await getDocs(collection(db, 'systemUsers'));
        if (usersSnap.empty) {
            await Promise.all(DEFAULT_SYSTEM_USERS.map(user => setDoc(doc(db, 'systemUsers', user.id), { ...user, createdAt: new Date(), updatedAt: new Date() })));
        }
        const initializationUsers = usersSnap.empty
            ? DEFAULT_SYSTEM_USERS
            : usersSnap.docs.map(item => ({ id: item.id, ...item.data() }));
        const supervisorIdByName = new Map(initializationUsers
            .filter(user => normalizeRole(user.role || user.type) === 'supervisor')
            .map(user => [String(user.displayName || user.name || '').trim(), user.id]));

        const permissionsSnap = await getDocs(collection(db, 'rolePermissions'));
        const existingRoles = new Set(permissionsSnap.docs.map(item => item.id));
        await Promise.all(ROLE_ORDER.filter(role => !existingRoles.has(role)).map(role => setDoc(doc(db, 'rolePermissions', role), {
            role,
            permissions: DEFAULT_ROLE_PERMISSIONS[role] || {},
            createdAt: new Date(),
            updatedAt: new Date()
        })));

        const repsSnap = await getDocs(collection(db, 'reps'));
        let migratedPasswords = 0;
        let migratedSupervisors = 0;
        await runInChunks(repsSnap.docs, async repDoc => {
            const data = repDoc.data() || {};
            const name = String(data.name || repDoc.id || '').trim();
            const patch = {};
            if (!data.passwordHash && LEGACY_REP_PASSWORDS[name]) {
                patch.passwordHash = LEGACY_REP_PASSWORDS[name];
                migratedPasswords += 1;
            }
            const currentSupervisor = String(data.supervisorName || data.managerName || data.supervisor || '').trim();
            const resolvedSupervisorName = currentSupervisor || LEGACY_REP_SUPERVISORS[name] || '';
            if (!currentSupervisor && resolvedSupervisorName) {
                patch.supervisorName = resolvedSupervisorName;
                patch.managerName = resolvedSupervisorName;
                patch.supervisor = resolvedSupervisorName;
                migratedSupervisors += 1;
            }
            if (!data.supervisorId && resolvedSupervisorName && supervisorIdByName.has(resolvedSupervisorName)) {
                patch.supervisorId = supervisorIdByName.get(resolvedSupervisorName);
            }
            if (Object.keys(patch).length) {
                patch.updatedAt = new Date();
                patch.migratedFromLegacySettings = true;
                await setDoc(doc(db, 'reps', repDoc.id), patch, { merge: true });
            }
        });

        invalidateAllOperationalCaches('initialization');
        toast(`تمت تهيئة مركز التحكم دون حذف أي بيانات. كلمات سر منقولة: ${migratedPasswords}، ارتباطات مشرفين منقولة: ${migratedSupervisors}.`, 'success');
        await loadAllData(false, false);
    } catch (error) {
        console.error(error);
        toast('تعذر تهيئة مجموعات مركز التحكم.', 'error');
    } finally {
        setBusy(button, false);
    }
}

async function repairAssignments() {
    const button = $('repairAssignmentsBtn');
    if (!confirm('سيتم توحيد اسم المشرف واسم المندوب داخل الصيدليات والطلبيات اعتماداً على معرّف المندوب الحالي. لا يتم تغيير الأسعار أو الكميات أو الحالات.')) return;
    setBusy(button, true, 'جاري الإصلاح...');
    try {
        const repMap = new Map(state.reps.map(rep => [rep.id, rep]));
        let pharmaciesChanged = 0;
        let ordersChanged = 0;

        await runInChunks(state.pharmacies, async pharmacy => {
            const rep = repMap.get(String(pharmacy.rep_id || pharmacy.repId || ''));
            if (!rep) return;
            const currentSupervisor = String(pharmacy.supervisor || pharmacy.supervisorName || '');
            const currentRepName = String(pharmacy.repName || '');
            if (currentSupervisor === rep.supervisorName && currentRepName === rep.name) return;
            await updateDoc(doc(db, 'pharmacies', pharmacy.id), {
                repName: rep.name,
                supervisor: rep.supervisorName || '-',
                supervisorName: rep.supervisorName || '',
                updatedAt: new Date()
            });
            pharmaciesChanged += 1;
        });

        await runInChunks(state.orders, async order => {
            const rep = repMap.get(String(order.repId || order.representativeId || ''));
            if (!rep) return;
            const patches = {};
            if (order.repName !== rep.name || order.representativeName !== rep.name) {
                patches.repName = rep.name;
                patches.representativeName = rep.name;
            }
            if ((order.managerName || order.supervisorName || '') !== rep.supervisorName) {
                patches.managerName = rep.supervisorName || '';
                patches.supervisorName = rep.supervisorName || '';
            }
            if (!Object.keys(patches).length) return;
            patches.updatedAt = new Date();
            await updateDoc(doc(db, 'orders', order.id), patches);
            ordersChanged += 1;
        });

        invalidateAllOperationalCaches('assignment-repair');
        toast(`تم الإصلاح: ${pharmaciesChanged} صيدلية و${ordersChanged} طلبية.`, 'success');
        await loadAllData(false, true);
    } catch (error) {
        console.error(error);
        toast('تعذر إكمال إصلاح الارتباطات.', 'error');
    } finally {
        setBusy(button, false);
    }
}

function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportControlBackup() {
    downloadJson(`ordering-system-settings-${new Date().toISOString().slice(0, 10)}.json`, {
        exportedAt: new Date().toISOString(),
        systemSettings: state.general,
        systemUsers: state.users.map(({ raw, ...user }) => user),
        rolePermissions: state.permissions,
        representatives: state.reps.map(({ raw, ...rep }) => rep)
    });
    toast('تم تنزيل نسخة إعدادات قابلة للاسترجاع.', 'success');
}

async function importControlBackup() {
    const input = $('controlBackupFile');
    const file = input?.files?.[0];
    if (!file) return toast('اختر ملف النسخة الاحتياطية JSON.', 'error');
    if (!confirm('سيتم تحديث إعدادات النظام والحسابات والصلاحيات والمناديب الموجودة حسب المعرّفات في الملف. لن يتم حذف السجلات غير الموجودة في الملف.')) return;
    const button = $('importControlBackupBtn');
    setBusy(button, true, 'جاري الاسترجاع...');
    try {
        const data = JSON.parse(await file.text());
        if (data.systemSettings) await setDoc(doc(db, 'systemSettings', 'main'), { ...data.systemSettings, updatedAt: new Date(), restoredAt: new Date() }, { merge: true });
        if (Array.isArray(data.systemUsers)) {
            await runInChunks(data.systemUsers.filter(user => user.id), user => setDoc(doc(db, 'systemUsers', user.id), { ...user, updatedAt: new Date(), restoredAt: new Date() }, { merge: true }));
        }
        if (data.rolePermissions && typeof data.rolePermissions === 'object') {
            await Promise.all(Object.entries(data.rolePermissions).map(([role, permissions]) => setDoc(doc(db, 'rolePermissions', role), { role, permissions, updatedAt: new Date(), restoredAt: new Date() }, { merge: true })));
        }
        if (Array.isArray(data.representatives)) {
            await runInChunks(data.representatives.filter(rep => rep.id), rep => setDoc(doc(db, 'reps', rep.id), { ...rep, updatedAt: new Date(), restoredAt: new Date() }, { merge: true }));
        }
        input.value = '';
        invalidateAllOperationalCaches('settings-restore');
        toast('تم استرجاع نسخة الإعدادات.', 'success');
        await loadAllData(false, true);
    } catch (error) {
        console.error(error);
        toast('ملف النسخة غير صالح أو تعذر استرجاعه.', 'error');
    } finally {
        setBusy(button, false);
    }
}

function bindEvents() {
    $('refreshControlCenterBtn')?.addEventListener('click', () => loadAllData());
    $('initializeControlCenterBtn')?.addEventListener('click', initializeControlCollections);
    $('addRepresentativeBtn')?.addEventListener('click', addRepresentative);
    $('addSystemUserBtn')?.addEventListener('click', addSystemUser);
    $('savePermissionsBtn')?.addEventListener('click', savePermissions);
    $('saveGeneralSettingsBtn')?.addEventListener('click', saveGeneralSettings);
    $('bumpDataRevisionBtn')?.addEventListener('click', bumpDataRevision);
    $('repairAssignmentsBtn')?.addEventListener('click', repairAssignments);
    $('exportControlBackupBtn')?.addEventListener('click', exportControlBackup);
    $('importControlBackupBtn')?.addEventListener('click', importControlBackup);
    $('representativesSearch')?.addEventListener('input', event => filterRows('#representativesTableBody', event.target.value));
    $('systemUsersSearch')?.addEventListener('input', event => filterRows('#systemUsersTableBody', event.target.value));
    $('companyLogoInput')?.addEventListener('input', event => {
        if ($('generalLogoPreview')) $('generalLogoPreview').src = event.target.value || DEFAULT_GENERAL_SETTINGS.companyLogoUrl;
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!(await guardPage('page.settings'))) return;
    const [manageUsers, managePermissions, manageSystem, manageProducts, managePharmacies, exportData, importHistory] = await Promise.all([
        hasPermission('settings.manage_users'),
        hasPermission('settings.manage_permissions'),
        hasPermission('settings.manage_system'),
        hasPermission('settings.manage_products'),
        hasPermission('settings.manage_pharmacies'),
        hasPermission('settings.export_data'),
        hasPermission('settings.import_history')
    ]);

    const visibility = [
        ['systemConfigPanel', manageSystem],
        ['productsPanel', manageProducts],
        ['pharmaciesPanel', managePharmacies],
        ['exportPanel', exportData],
        ['oldOrdersPanel', importHistory],
        ['oldReturnsPanel', importHistory]
    ];
    visibility.forEach(([panelId, allowed]) => {
        const panel = document.getElementById(panelId);
        const tab = document.querySelector(`[data-target="${panelId}"]`);
        if (panel) panel.dataset.permissionAllowed = allowed ? '1' : '0';
        if (tab) tab.hidden = !allowed;
    });

    const usersPanelAllowed = manageUsers || managePermissions;
    const usersPanel = document.getElementById('usersAccessPanel');
    const usersTab = document.querySelector('[data-target="usersAccessPanel"]');
    if (usersPanel) usersPanel.dataset.permissionAllowed = usersPanelAllowed ? '1' : '0';
    if (usersTab) usersTab.hidden = !usersPanelAllowed;
    ['representativeManagementBlock', 'systemUserManagementBlock'].forEach(id => {
        const block = document.getElementById(id);
        if (block) block.hidden = !manageUsers;
    });
    const permissionsBlock = document.getElementById('permissionsManagementBlock');
    if (permissionsBlock) permissionsBlock.hidden = !managePermissions;

    ['initializeControlCenterBtn', 'bumpDataRevisionBtn', 'exportControlBackupBtn', 'importControlBackupBtn'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.hidden = !manageSystem;
    });
    const repairButton = document.getElementById('repairAssignmentsBtn');
    if (repairButton) repairButton.hidden = !manageUsers;

    bindEvents();
    await loadAllData(false, true);
});
