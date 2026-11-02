import { db } from './firebase.js';
import { collection, doc, query, orderBy, documentId, limit, startAfter, getDocFromServer, getDocsFromServer, getDocFromCache, getDocsFromCache, FieldPath, arrayUnion, setDoc, writeBatch, runTransaction, serverTimestamp } from './firestore-meter.js?v=20261006_reads1';
import { ammanMonth, validMonth, repDocumentId, resolveRoutes, eligibleRows, isComplete, permitActive, progress } from './forecast-core.js?v=20261102_monthly_append_v2';

const configRef = () => doc(db, `system_settings`, `forecast`);
const salesRef = year => doc(db, `forecast_sales`, String(year));
const forecastRef = (month, repId) => doc(db, `monthly_forecasts`, repDocumentId(month, repId));
const permitRef = (month, repId) => doc(db, `forecast_permits`, repDocumentId(month, repId));
let adminPassword = ``;
export function session() {
    const read = (storage, key) => { try { return JSON.parse(storage.getItem(key) || `null`); } catch { return null; } };
    const admin = read(localStorage, `dad_admin_session_v2`) || read(sessionStorage, `dad_admin_session_v2`);
    const validAdmin = admin?.name && admin?.token && Date.now() - Number(admin.savedAt || 0) < 30 * 86400000;
    const context = read(sessionStorage, `activeOrderContext`);
    const remembered = read(localStorage, `dad_rep_session_v1`);
    const validRemembered = remembered?.remember === true && remembered.repId && Date.now() - Number(remembered.savedAt || 0) < 30 * 86400000;
    return { admin: validAdmin ? admin : null, repId: sessionStorage.getItem(`repId`) || context?.repId || (validRemembered ? remembered.repId : ``), repName: sessionStorage.getItem(`repName`) || context?.repName || (validRemembered ? remembered.repName : ``) };
}
export async function decryptPayload(payload, password) {
    const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
    const material = await crypto.subtle.importKey(`raw`, new TextEncoder().encode(password), `PBKDF2`, false, [`deriveKey`]);
    const key = await crypto.subtle.deriveKey({ name: `PBKDF2`, salt: bytes(payload.salt), iterations: 600000, hash: `SHA-256` }, material, { name: `AES-GCM`, length: 256 }, false, [`decrypt`]);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: `AES-GCM`, iv: bytes(payload.iv) }, key, bytes(payload.data))));
}
export async function unlockAdmin(password) {
    const response = await fetch(`pass.html?t=${Date.now()}`, { cache: `no-store` });
    if (!response.ok) throw new Error(`تعذر التحقق من كلمة مرور الإدارة`);
    const match = (await response.text()).match(/const payload = (.*);/);
    if (!match) throw new Error(`تعذر التحقق من كلمة مرور الإدارة`);
    try { await decryptPayload(JSON.parse(match[1]), password); }
    catch { throw new Error(`كلمة مرور الإدارة غير صحيحة`); }
    adminPassword = password;
}
function requireAdmin() { if (!adminPassword) throw new Error(`افتح إدارة التوقعات بكلمة مرور الصفحة السرية أولا`); }
export function lockAdmin() { adminPassword = ``; }
export async function attachedBaseline() {
    requireAdmin();
    const response = await fetch(`forecast-baseline.enc.json?v=20261006_reads1`, { cache: `no-store` });
    if (!response.ok) throw new Error(`تعذر تحميل الملف المرفق`);
    return decryptPayload(await response.json(), adminPassword);
}
const rows = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
const pendingReads = new Map();
const recentReads = new Map();
const ROUTING_CACHE_MS = 5 * 60 * 1000;
const ROUTING_PERSISTED_MS = 30 * 60 * 1000;
const ROUTING_MARKER_KEY = `dad_forecast_full_routing_cache_v1`;
function routingMarker() {
    try {
        const value = JSON.parse(localStorage.getItem(ROUTING_MARKER_KEY) || `null`);
        return Number.isInteger(value?.pharmacies) && value.pharmacies > 0 && Number.isInteger(value?.reps) && value.reps > 0 ? value : null;
    } catch { return null; }
}
function markRouting(pharmacies, reps, assignments) {
    try { localStorage.setItem(ROUTING_MARKER_KEY, JSON.stringify({ pharmacies: pharmacies.size, reps: reps.size, assignmentsExist: assignments.exists(), at: Date.now() })); } catch {}
}
function shareRead(key, action, maxAgeMs = 0) {
    const cached = recentReads.get(key);
    if (maxAgeMs > 0 && cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
    if (pendingReads.has(key)) return pendingReads.get(key);
    const request = Promise.resolve().then(action).then(value => {
        if (maxAgeMs > 0) recentReads.set(key, { value, expiresAt: Date.now() + maxAgeMs });
        return value;
    }).finally(() => pendingReads.delete(key));
    pendingReads.set(key, request);
    return request;
}
export function invalidateRoutingCache() {
    recentReads.clear();
    try { localStorage.removeItem(ROUTING_MARKER_KEY); } catch {}
}
export function errorMessage(error) {
    return /(^|\/)resource-exhausted$/.test(error?.code || ``) ? `وصل Firestore إلى حد الاستهلاك أو الطلبات. تعذر التحقق من البيانات؛ راجع Usage في Firebase قبل إعادة المحاولة.` : error?.message || `تعذر إتمام العملية`;
}
export async function loadSalesYear(year, { preferCache = false } = {}) {
    requireAdmin();
    if (!/^20\d\d$/.test(String(year))) throw new Error(`السنة غير صحيحة`);
    let snap = null;
    if (preferCache) {
        try { snap = await getDocFromCache(salesRef(year)); }
        catch { /* The year has not previously been cached in this browser. */ }
    }
    if (!snap || !snap.exists()) {
        try { snap = await getDocFromServer(salesRef(year)); }
        catch (error) {
            if (!/(^|\/)resource-exhausted$/.test(error?.code || ``)) throw error;
            try { snap = await getDocFromCache(salesRef(year)); }
            catch { throw error; }
            if (!snap.exists()) throw error;
        }
    }
    return snap.exists() ? snap.data() : null;
}
export function loadConfig({ preferCache = false } = {}) {
    return shareRead(`config:${preferCache}`, async () => {
        let snapshot;
        if (preferCache) {
            try { snapshot = await getDocFromCache(configRef()); } catch { /* No locally cached config. */ }
        }
        if (!snapshot) snapshot = await getDocFromServer(configRef());
        return snapshot.exists() ? snapshot.data() : { enabled: false, activeMonth: ammanMonth() };
    }, preferCache ? 30000 : 15000);
}
async function loadRouting() {
    return shareRead(`routing`, async () => {
        const pharmaciesRef = collection(db, `pharmacies`), repsRef = collection(db, `reps`);
        const assignmentsRef = doc(db, `system_settings`, `rep_supervisor_assignments`);
        const marker = routingMarker();
        let pharmacies = null, reps = null, assignments = null;
        // Only trust a cached collection if this browser previously fetched the
        // FULL collections and the number of cached documents still matches.
        // Otherwise query the server and retain existing correctness checks.
        if (marker && Date.now() - marker.at < ROUTING_PERSISTED_MS) {
            try {
                const cache = await Promise.all([
                    getDocsFromCache(pharmaciesRef), getDocsFromCache(repsRef),
                    marker.assignmentsExist === false ? Promise.resolve({ exists: () => false }) : getDocFromCache(assignmentsRef)
                ]);
                if (cache[0].size === marker.pharmacies && cache[1].size === marker.reps) [pharmacies, reps, assignments] = cache;
            } catch { /* Cache incomplete: use the server. */ }
        }
        if (!pharmacies || !reps || !assignments) {
            [pharmacies, reps, assignments] = await Promise.all([
                getDocsFromServer(pharmaciesRef), getDocsFromServer(repsRef), getDocFromServer(assignmentsRef)
            ]);
            markRouting(pharmacies, reps, assignments);
        }
        const repRows = rows(reps), pharmacyRows = rows(pharmacies);
        return { reps: repRows, pharmacies: pharmacyRows, ...resolveRoutes(pharmacyRows, repRows, assignments.exists() ? assignments.data()?.assignments : {}) };
    }, ROUTING_CACHE_MS);
}
export function loadDataset(month, { routingOnly = false } = {}) {
    if (!validMonth(month)) throw new Error(`اختر شهرا صحيحا`);
    return shareRead(`dataset:${month.slice(0, 4)}:${routingOnly}`, async () => {
        const sales = routingOnly ? null : await shareRead(`sales:${month.slice(0, 4)}`, async () => getDocFromServer(salesRef(month.slice(0, 4))), ROUTING_CACHE_MS);
        const salesData = sales?.exists() ? sales.data() : null;
        if (!routingOnly && !salesData) return { sales: null, reps: [], pharmacies: [], routes: new Map(), conflicts: new Map(), invalid: [], rows: [] };
        const routing = await loadRouting();
        return { sales: salesData, ...routing, rows: eligibleRows(salesData, routing.routes) };
    });
}
export async function loadForecast(month, repId) {
    const snapshot = await getDocFromServer(forecastRef(month, repId));
    return snapshot.exists() ? snapshot.data() : { month, repId, status: `draft`, revision: 0, entries: {} };
}
export async function loadTeamForecasts(month, repIds) {
    return new Map(await Promise.all([...new Set(repIds)].map(async repId => [repId, await loadForecast(month, repId)])));
}
async function serverNow() {
    const project = `dad-ordering-system`;
    const response = await fetch(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery`, {
        method: `POST`, headers: { [`Content-Type`]: `application/json` },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: `system_settings` }], limit: 1, select: { fields: [{ fieldPath: `__name__` }] } } })
    });
    if (!response.ok) throw new Error(`تعذر التحقق من وقت انتهاء المهلة`);
    const data = await response.json();
    const value = data.find(row => row.readTime)?.readTime;
    if (!value || Number.isNaN(new Date(value).getTime())) throw new Error(`تعذر التحقق من وقت الخادم`);
    return new Date(value);
}
export async function checkOrderGate(repId) {
    if (!navigator.onLine) throw new Error(`يجب الاتصال بالإنترنت للتحقق من التوقعات`);
    const config = await loadConfig();
    if (!config.enabled) return { allowed: true };
    const month = config.activeMonth;
    const dataset = await loadDataset(month);
    if (!dataset.sales) throw new Error(`لم يتم اعتماد ملف المبيعات للشهر الحالي`);
    const ambiguous = [...dataset.conflicts.values()].some(routes => routes.some(route => route.repId === repId));
    if (ambiguous) throw new Error(`يوجد كود صيدلية مرتبط بأكثر من مندوب. اطلب من الإدارة تصحيح الربط.`);
    const repRows = eligibleRows(dataset.sales, dataset.routes, repId);
    if (!repRows.length) return { allowed: true, month, noEligibleRows: true };
    const [forecast, permit] = await Promise.all([loadForecast(month, repId), getDocFromServer(permitRef(month, repId))]);
    if (isComplete(forecast, repRows)) return { allowed: true, month };
    const permission = permit.exists() ? permit.data() : null;
    if (permission && permitActive(permission, await serverNow())) return { allowed: true, temporary: true, month };
    return { allowed: false, month, ...progress(forecast, repRows) };
}
export async function ensureForecastBeforeOrder(repId) {
    try {
        const result = await checkOrderGate(repId);
        if (result.allowed) return true;
        window.showToast?.(`أكد توقعات ${result.month} لجميع الصيدليات قبل إدخال طلبية.`, `warning`);
        window.dispatchEvent(new CustomEvent(`forecast:blocked`, { detail: result }));
        return false;
    } catch (error) { window.showToast?.(errorMessage(error), `error`); return false; }
}
export async function saveForecast(month, repId, entries, revision, confirm, screenContext = null) {
    if (session().repId !== repId || sessionStorage.getItem(`adminOrderMode`) === `1`) throw new Error(`الدخول كمندوب مطلوب لتعبئة التوقع`);
    // The page has already loaded and validated these rows. Reusing them here avoids
    // downloading every pharmacy again for a single representative's save.
    const config = await loadConfig();
    if (config.activeMonth !== month) throw new Error(`هذا الشهر مغلق للتعبئة`);
    const dataset = screenContext?.month === month && screenContext?.repId === repId && Array.isArray(screenContext.rows) && screenContext.conflicts instanceof Map
        ? { conflicts: screenContext.conflicts, sales: null, routes: null }
        : await loadDataset(month);
    if ([...dataset.conflicts.values()].some(routes => routes.some(route => route.repId === repId))) throw new Error(`ربط الصيدليات غير واضح؛ راجع الإدارة`);
    const eligible = dataset.sales ? eligibleRows(dataset.sales, dataset.routes, repId) : screenContext.rows;
    if (!eligible.length) throw new Error(`لا توجد صيدليات مؤهلة لهذا المندوب`);
    const clean = {};
    for (const row of eligible) {
        const entry = entries[row.code];
        if (entry?.amount !== null && entry?.amount !== undefined && !Number.isSafeInteger(entry.amount)) throw new Error(`قيمة غير صحيحة للصيدلية ${row.code}`);
        clean[row.code] = { amount: entry?.amount ?? null, note: String(entry?.note || ``).trim().slice(0, 1000) };
    }
    const ref = forecastRef(month, repId);
    return runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.exists() ? snapshot.data() : { revision: 0 };
        if (previous.status === `confirmed`) throw new Error(`التوقع مؤكد. إعادة الفتح متاحة للأدمن فقط`);
        if ((previous.revision || 0) !== revision) throw new Error(`تغيرت البيانات من نافذة أخرى. حدث الصفحة قبل الحفظ`);
        const write = { month, repId, repName: session().repName, entries: clean, codes: eligible.map(row => row.code), status: confirm ? `confirmed` : `draft`, revision: revision + 1, updatedAt: serverTimestamp(), confirmedAt: confirm ? serverTimestamp() : null };
        transaction.set(ref, write);
        // The transaction result is returned only after a successful commit. Do not
        // issue another server read: a quota failure there could falsely report save failure.
        const savedAt = new Date();
        return { ...write, updatedAt: savedAt, confirmedAt: confirm ? savedAt : null };
    });
}
export async function importSales(parsed, year, filename) {
    requireAdmin();
    if (!/^20\d\d$/.test(String(year))) throw new Error(`السنة غير صحيحة`);
    // A complete annual workbook is authoritative; no server read or transaction.
    const payload = { year: Number(year), customers: parsed.customers, months: parsed.months, filename, updatedAt: serverTimestamp(), importMode: `full_replace` };
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 750000) throw new Error(`ملف المبيعات أكبر من الحد الآمن للحفظ`);
    const batch = writeBatch(db);
    batch.set(salesRef(year), payload);
    batch.set(doc(collection(db, `forecast_audit`)), { action: `sales_import`, mode: `full_replace`, year: Number(year), rowCount: parsed.count, months: parsed.months, filename, at: serverTimestamp() });
    await batch.commit();
}
/**
 * Append one month's invoiced sales to the existing yearly document.
 * Older months are never sent back to Firestore or overwritten.
 * The caller must first verify that month follows the saved months.
 */
export async function appendSalesMonth(parsed, year, month, filename, previousMonths, existingCustomerCodes = null) {
    requireAdmin();
    if (!/^20\d\d$/.test(String(year))) throw new Error(`السنة غير صحيحة`);
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`الشهر غير صحيح`);
    if (!Array.isArray(previousMonths) || !previousMonths.length || previousMonths.some((m, index) => m !== index + 1) || month > previousMonths.at(-1) + 1)
        throw new Error(`يمكن تعديل شهر محفوظ أو إضافة الشهر التالي فقط، بدون إعادة رفع الأشهر السابقة`);
    const customers = Object.entries(parsed.customers || {});
    if (!customers.length || customers.length > 20000) throw new Error(`ملف الشهر فارغ أو كبير جدا`);
    const existingCodes = new Set(Array.isArray(existingCustomerCodes) ? existingCustomerCodes : []);
    const updates = [new FieldPath(`months`), arrayUnion(month), new FieldPath(`updatedAt`), serverTimestamp(),
        new FieldPath(`lastMonthFile`), filename, new FieldPath(`importMode`), `monthly_append`];
    for (const [code, customer] of customers) {
        if (!/^\d+$/.test(code) || !Number.isSafeInteger(customer.amount)) throw new Error(`قيمة أو كود غير صالح في ملف الشهر`);
        // Preserve established pharmacy names; only introduce names for new codes.
        if (!existingCustomerCodes || !existingCodes.has(code)) updates.push(new FieldPath(`customers`, code, `name`), String(customer.name).slice(0, 500));
        updates.push(new FieldPath(`customers`, code, `months`, String(month)), customer.amount);
    }
    const batch = writeBatch(db);
    batch.update(salesRef(year), ...updates);
    batch.set(doc(collection(db, `forecast_audit`)), { action: `sales_month_append`, year: Number(year), month, filename,
        rowCount: customers.length, at: serverTimestamp() });
    await batch.commit();
    recentReads.delete(`sales:${year}`);
    return { year: Number(year), months: month > previousMonths.at(-1) ? [...previousMonths, month] : [...previousMonths] };
}
export async function saveConfig(month, enabled) {
    requireAdmin();
    const data = await loadDataset(month);
    if (!data.sales || !Object.keys(data.sales.customers || {}).length) throw new Error(`ارفع مبيعات سنة الشهر المختار أولا`);
    if ([...data.conflicts.keys()].some(code => data.sales.customers[code])) throw new Error(`صحح الأكواد المرتبطة بأكثر من مندوب قبل تفعيل الشهر`);
    await setDoc(configRef(), { activeMonth: month, enabled: Boolean(enabled), updatedAt: serverTimestamp() });
}
export async function reopenForecast(month, repId, reason) {
    requireAdmin();
    if (!reason.trim()) throw new Error(`اكتب سبب إعادة الفتح`);
    await runTransaction(db, async transaction => {
        const ref = forecastRef(month, repId), snapshot = await transaction.get(ref);
        if (!snapshot.exists() || snapshot.data().status !== `confirmed`) throw new Error(`التوقع غير مؤكد`);
        const previous = snapshot.data();
        transaction.set(doc(collection(db, `forecast_audit`)), { action: `reopen`, month, repId, reason, previous, at: serverTimestamp() });
        transaction.update(ref, { status: `draft`, confirmedAt: null, revision: (previous.revision || 0) + 1, reopenedAt: serverTimestamp(), reopenReason: reason, updatedAt: serverTimestamp() });
    });
}
export async function grantPermit(month, repId, hours) {
    requireAdmin();
    if (!Number.isFinite(hours) || hours <= 0 || hours > 720) throw new Error(`أدخل مدة أكبر من صفر وحتى 720 ساعة`);
    await setDoc(permitRef(month, repId), { month, repId, hours, grantedAt: serverTimestamp(), revoked: false });
    await setDoc(doc(collection(db, `forecast_audit`)), { action: `grant_permit`, month, repId, hours, at: serverTimestamp() });
}
export async function revokePermit(month, repId) {
    requireAdmin();
    await setDoc(permitRef(month, repId), { revoked: true }, { merge: true });
}
export async function loadPermits(month, repIds) {
    return new Map(await Promise.all(repIds.map(async id => { const snap = await getDocFromServer(permitRef(month, id)); return [id, snap.exists() ? snap.data() : null]; })));
}
export async function loadOrders() {
    const orders = []; let last = null;
    while (true) {
        const constraints = [orderBy(documentId()), limit(500)];
        if (last) constraints.push(startAfter(last));
        const snapshot = await getDocsFromServer(query(collection(db, `orders`), ...constraints));
        orders.push(...rows(snapshot));
        if (snapshot.size < 500) break;
        last = snapshot.docs.at(-1);
    }
    return orders;
}

