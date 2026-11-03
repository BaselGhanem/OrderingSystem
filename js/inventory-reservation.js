import { db, collection, getDocs, onSnapshot, doc, writeBatch } from './firebase.js';

const ADMIN_SESSION_KEY = 'dad_admin_session_v2';
const AUTHORIZED_MANAGERS = new Set(['محمد طوالبه', 'عبدالله الناطور']);
const REPORTS_ACCOUNT = 'لوحة التقارير';
const $ = id => document.getElementById(id);

let products = [];
let reservations = new Map();
let hiddenProducts = new Map();
let auditRows = [];
let session = null;
let unsubReservations = null;
let unsubAudit = null;

function showToast(message, type = 'info') {
    const container = $('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="ph ${type === 'success' ? 'ph-check-circle' : type === 'error' ? 'ph-warning-circle' : type === 'warning' ? 'ph-warning' : 'ph-info'}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function parseSession() {
    for (const store of [localStorage, sessionStorage]) {
        try {
            const raw = store.getItem(ADMIN_SESSION_KEY);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed?.name && parsed?.type && parsed?.token) return parsed;
        } catch (_) {}
    }
    return null;
}

function isAuthorized(value) {
    if (!value) return false;
    if (value.type === 'manager' && AUTHORIZED_MANAGERS.has(value.name)) return true;
    if (value.type === 'reports' && value.name === REPORTS_ACCOUNT) return true;
    return false;
}

function actorInfo() {
    if (session.type === 'reports') return { name: 'المدير العام (لوحة التقارير)', role: 'general_manager' };
    return { name: session.name, role: 'supervisor' };
}

function formatDate(value) {
    if (!value) return '-';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('en-GB');
}

function productCode(product = {}) {
    return product.productCode || product.product_code || product.code || '';
}

function productPrice(product = {}) {
    const value = Number(product.price || 0);
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

function renderStats() {
    $('statProducts').textContent = products.length;
    $('statReserved').textContent = reservations.size;
    $('statHidden').textContent = hiddenProducts.size;
    $('statAudit').textContent = auditRows.length;
}

function filteredProducts() {
    const q = String($('searchInput')?.value || '').trim().toLocaleLowerCase('ar');
    const status = $('statusFilter')?.value || '';
    return products.filter(product => {
        const reserved = reservations.has(product.id);
        const hidden = hiddenProducts.has(product.id);
        const haystack = `${product.name || ''} ${productCode(product)}`.toLocaleLowerCase('ar');
        if (q && !haystack.includes(q)) return false;
        if (status === 'reserved' && !reserved) return false;
        if (status === 'available' && reserved) return false;
        if (status === 'hidden' && !hidden) return false;
        if (status === 'visible' && hidden) return false;
        return true;
    });
}

function renderProducts() {
    const body = $('productsBody');
    if (!body) return;
    const rows = filteredProducts();
    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="6" class="ir-empty">لا توجد أصناف مطابقة.</td></tr>';
        renderStats();
        return;
    }
    body.innerHTML = '';
    rows.forEach(product => {
        const reservation = reservations.get(product.id);
        const reserved = !!reservation;
        const hidden = hiddenProducts.has(product.id);
        const tr = document.createElement('tr');
        if (reserved) tr.classList.add('reserved');
        if (hidden) tr.classList.add('product-hidden');
        tr.innerHTML = `
            <td><div class="ir-status-stack"><span class="ir-status ${reserved ? 'on' : 'off'}"><i class="ph ${reserved ? 'ph-lock-key' : 'ph-check-circle'}"></i>${reserved ? 'محجوز / مقطوع' : 'عادي'}</span>${hidden ? '<span class="ir-status hidden"><i class="ph ph-eye-slash"></i> مخفي عن الطلبيات</span>' : ''}</div></td>
            <td class="ir-code">${escapeHtml(productCode(product) || '-')}</td>
            <td><strong>${escapeHtml(product.name || '-')}</strong></td>
            <td>${escapeHtml(productPrice(product))}</td>
            <td>${reserved ? `<strong>${escapeHtml(reservation.reservedBy || '-')}</strong><div class="ir-actor">${escapeHtml(formatDate(reservation.reservedAt))}</div>` : '-'}</td>
            <td><div class="ir-row-actions"><button type="button" class="ir-btn ${reserved ? 'danger' : 'reserve'} toggle-reservation"><i class="ph ${reserved ? 'ph-lock-open' : 'ph-lock-key'}"></i>${reserved ? 'فك الحجز' : 'حجز الصنف'}</button><button type="button" class="ir-btn ${hidden ? 'show-product' : 'hide-product'} toggle-visibility"><i class="ph ${hidden ? 'ph-eye' : 'ph-eye-slash'}"></i>${hidden ? 'اظهار الصنف' : 'اخفاء الصنف'}</button></div></td>`;
        tr.querySelector('.toggle-reservation').addEventListener('click', () => toggleReservation(product, !reserved));
        tr.querySelector('.toggle-visibility').addEventListener('click', () => toggleVisibility(product, !hidden));
        body.appendChild(tr);
    });
    renderStats();
}

function renderAudit() {
    const body = $('auditBody');
    if (!body) return;
    if (!auditRows.length) {
        body.innerHTML = '<tr><td colspan="6" class="ir-empty">لا توجد حركات مسجلة بعد.</td></tr>';
        renderStats();
        return;
    }
    body.innerHTML = auditRows.slice(0, 300).map(row => `
        <tr>
            <td>${escapeHtml(formatDate(row.timestamp || row.createdAt))}</td>
            <td><span class="ir-status ${row.action === 'inventory_reserved' ? 'on' : row.action === 'inventory_hidden' ? 'hidden' : 'off'}">${escapeHtml(({ inventory_reserved: 'حجز', inventory_released: 'فك حجز', inventory_hidden: 'اخفاء', inventory_shown: 'اظهار' })[row.action] || row.action || '-')}</span></td>
            <td class="ir-code">${escapeHtml(row.productCode || '-')}</td>
            <td>${escapeHtml(row.productName || '-')}</td>
            <td>${escapeHtml(row.actor || '-')}</td>
            <td>${escapeHtml(row.actorRole || '-')}</td>
        </tr>`).join('');
    renderStats();
}

async function toggleReservation(product, shouldReserve) {
    if (!isAuthorized(session)) return showToast('لا تملك صلاحية حجز الأصناف.', 'error');
    const actionText = shouldReserve ? 'حجز' : 'فك حجز';
    if (!confirm(`${actionText} الصنف: ${product.name || '-'}؟`)) return;
    const actor = actorInfo();
    const buttonCandidates = document.querySelectorAll('.toggle-reservation, .toggle-visibility');
    buttonCandidates.forEach(btn => btn.disabled = true);
    try {
        const batch = writeBatch(db);
        const reservationRef = doc(db, 'inventoryReservations', product.id);
        const auditRef = doc(collection(db, 'inventoryReservationAudit'));
        const now = new Date();
        const reservationPayload = {
            active: true,
            productId: product.id,
            productName: product.name || '',
            productCode: productCode(product),
            reservedBy: actor.name,
            reservedByRole: actor.role,
            reservedAt: now,
            updatedAt: now
        };
        if (shouldReserve) batch.set(reservationRef, reservationPayload, { merge: true });
        else if (hiddenProducts.has(product.id)) batch.set(reservationRef, { active: false, reservedBy: '', reservedByRole: '', reservedAt: null, updatedAt: now }, { merge: true });
        else batch.delete(reservationRef);
        batch.set(auditRef, {
            action: shouldReserve ? 'inventory_reserved' : 'inventory_released',
            productId: product.id,
            productName: product.name || '',
            productCode: productCode(product),
            actor: actor.name,
            actorRole: actor.role,
            timestamp: now,
            oldValue: shouldReserve ? { reserved: false } : { reserved: true, reservedBy: reservations.get(product.id)?.reservedBy || '' },
            newValue: { reserved: shouldReserve }
        });
        await batch.commit();
        showToast(shouldReserve ? 'تم حجز الصنف وتسجيل العملية في سجل التدقيق.' : 'تم فك الحجز وتسجيل العملية في سجل التدقيق.', 'success');
    } catch (error) {
        console.error(error);
        showToast('تعذر تنفيذ العملية. لم يتم تغيير حالة الحجز.', 'error');
    } finally {
        buttonCandidates.forEach(btn => btn.disabled = false);
    }
}

async function toggleVisibility(product, shouldHide) {
    if (!isAuthorized(session)) return showToast('لا تملك صلاحية تعديل ظهور الاصناف.', 'error');
    const label = shouldHide ? 'اخفاء' : 'اظهار';
    const detail = shouldHide ? 'لن يظهر هذا الصنف في قائمة اختيار الاصناف للطلبيات الجديدة، ولن يتمكن المندوب من اضافته' : 'سيظهر هذا الصنف مجددا للمندوبين';
    if (!confirm(`${label} الصنف: ${product.name || '-'}؟\n${detail}\nحالة الحجز لن تتغير.`)) return;
    const buttons = document.querySelectorAll('.toggle-reservation, .toggle-visibility');
    buttons.forEach(button => button.disabled = true);
    try {
        const actor = actorInfo();
        const now = new Date();
        const ref = doc(db, 'inventoryReservations', product.id);
        const auditRef = doc(collection(db, 'inventoryReservationAudit'));
        const batch = writeBatch(db);
        const reserved = reservations.has(product.id);
        if (shouldHide) {
            batch.set(ref, {
                productId: product.id,
                productName: product.name || '',
                productCode: productCode(product),
                active: reserved,
                hiddenFromOrders: true,
                hiddenBy: actor.name,
                hiddenByRole: actor.role,
                hiddenAt: now,
                updatedAt: now
            }, { merge: true });
        } else if (reserved) {
            batch.set(ref, { hiddenFromOrders: false, hiddenBy: '', hiddenByRole: '', hiddenAt: null, updatedAt: now }, { merge: true });
        } else {
            batch.delete(ref);
        }
        batch.set(auditRef, {
            action: shouldHide ? 'inventory_hidden' : 'inventory_shown',
            productId: product.id,
            productName: product.name || '',
            productCode: productCode(product),
            actor: actor.name,
            actorRole: actor.role,
            timestamp: now,
            oldValue: { hiddenFromOrders: !shouldHide, reserved },
            newValue: { hiddenFromOrders: shouldHide, reserved }
        });
        await batch.commit();
        showToast(shouldHide ? 'تم اخفاء الصنف عن ادخال الطلبيات مع بقاء الحجز كما هو.' : 'تم اظهار الصنف مجددا دون تغيير الحجز.', 'success');
    } catch (error) {
        console.error(error);
        showToast('تعذر تعديل ظهور الصنف. لم يتم حفظ التغيير.', 'error');
    } finally {
        buttons.forEach(button => button.disabled = false);
    }
}

async function loadProducts() {
    const snap = await getDocs(collection(db, 'products'));
    products = [];
    snap.forEach(row => products.push({ id: row.id, ...row.data() }));
    products.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    renderProducts();
}

function subscribeReservations() {
    unsubReservations?.();
    unsubReservations = onSnapshot(collection(db, 'inventoryReservations'), snap => {
        reservations = new Map();
        hiddenProducts = new Map();
        snap.forEach(row => {
            const data = row.data();
            const id = data.productId || row.id;
            if (data.hiddenFromOrders === true) hiddenProducts.set(id, { id: row.id, ...data });
            if (data.active !== false) reservations.set(id, { id: row.id, ...data });
        });
        renderProducts();
    }, error => { console.error(error); showToast('تعذر مزامنة حالات الحجز.', 'error'); });
}

function subscribeAudit() {
    unsubAudit?.();
    unsubAudit = onSnapshot(collection(db, 'inventoryReservationAudit'), snap => {
        auditRows = [];
        snap.forEach(row => auditRows.push({ id: row.id, ...row.data() }));
        auditRows.sort((a,b) => {
            const da = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
            const dbb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
            return dbb - da;
        });
        renderAudit();
    }, error => { console.error(error); showToast('تعذر تحميل سجل التدقيق.', 'error'); });
}

async function refreshAll() {
    $('refreshBtn').disabled = true;
    try {
        await loadProducts();
        showToast('تم تحديث قائمة الأصناف.', 'success');
    } catch (error) {
        console.error(error);
        showToast('تعذر تحديث قائمة الأصناف.', 'error');
    } finally {
        $('refreshBtn').disabled = false;
    }
}

async function boot() {
    session = parseSession();
    if (!isAuthorized(session)) {
        alert('هذه الصفحة محصورة بعبدالله الناطور، محمد طوالبه، والمدير العام عبر لوحة التقارير.');
        window.location.replace('login.html?switch=1');
        return;
    }
    const actor = actorInfo();
    $('currentActor').textContent = `المستخدم الحالي: ${actor.name}`;
    $('backBtn').href = session.type === 'reports' ? 'reports.html' : 'supervisor.html';
    $('searchInput').addEventListener('input', renderProducts);
    $('statusFilter').addEventListener('change', renderProducts);
    $('refreshBtn').addEventListener('click', refreshAll);
    subscribeReservations();
    subscribeAudit();
    await refreshAll();
}

boot().catch(error => {
    console.error(error);
    showToast('تعذر تشغيل لوحة حجز الأصناف.', 'error');
});
