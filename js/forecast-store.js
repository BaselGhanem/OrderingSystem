import { db } from './firebase.js';
import { collection, doc, query, orderBy, documentId, limit, startAfter, getDocFromServer, getDocsFromServer, setDoc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { ammanMonth, validMonth, repDocumentId, resolveRoutes, eligibleRows, isComplete, permitActive, progress } from './forecast-core.js?v=20261006_forecast1';

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
    const response = await fetch(`forecast-baseline.enc.json?v=20261006_forecast1`, { cache: `no-store` });
    if (!response.ok) throw new Error(`تعذر تحميل الملف المرفق`);
    return decryptPayload(await response.json(), adminPassword);
}
const rows = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
export async function loadConfig() {
    const snapshot = await getDocFromServer(configRef());
    return snapshot.exists() ? snapshot.data() : { enabled: false, activeMonth: ammanMonth() };
}
export async function loadDataset(month) {
    if (!validMonth(month)) throw new Error(`اختر شهرا صحيحا`);
    const [sales, pharmacies, reps, assignments] = await Promise.all([
        getDocFromServer(salesRef(month.slice(0, 4))), getDocsFromServer(collection(db, `pharmacies`)), getDocsFromServer(collection(db, `reps`)),
        getDocFromServer(doc(db, `system_settings`, `rep_supervisor_assignments`))
    ]);
    const salesData = sales.exists() ? sales.data() : null;
    const repRows = rows(reps), pharmacyRows = rows(pharmacies);
    const routing = resolveRoutes(pharmacyRows, repRows, assignments.exists() ? assignments.data()?.assignments : {});
    return { sales: salesData, reps: repRows, pharmacies: pharmacyRows, ...routing, rows: eligibleRows(salesData, routing.routes) };
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
    } catch (error) { window.showToast?.(error.message, `error`); return false; }
}
export async function saveForecast(month, repId, entries, revision, confirm) {
    if (session().repId !== repId || sessionStorage.getItem(`adminOrderMode`) === `1`) throw new Error(`الدخول كمندوب مطلوب لتعبئة التوقع`);
    const config = await loadConfig();
    if (config.activeMonth !== month) throw new Error(`هذا الشهر مغلق للتعبئة`);
    const dataset = await loadDataset(month);
    if ([...dataset.conflicts.values()].some(routes => routes.some(route => route.repId === repId))) throw new Error(`ربط الصيدليات غير واضح؛ راجع الإدارة`);
    const eligible = eligibleRows(dataset.sales, dataset.routes, repId);
    if (!eligible.length) throw new Error(`لا توجد صيدليات مؤهلة لهذا المندوب`);
    const clean = {};
    for (const row of eligible) {
        const entry = entries[row.code];
        if (entry?.amount !== null && entry?.amount !== undefined && !Number.isSafeInteger(entry.amount)) throw new Error(`قيمة غير صحيحة للصيدلية ${row.code}`);
        clean[row.code] = { amount: entry?.amount ?? null, note: String(entry?.note || ``).trim().slice(0, 1000) };
    }
    if (confirm && eligible.some(row => clean[row.code].amount === null)) throw new Error(`لا يمكن التأكيد قبل تعبئة جميع الصيدليات`);
    const ref = forecastRef(month, repId);
    await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.exists() ? snapshot.data() : { revision: 0 };
        if (previous.status === `confirmed`) throw new Error(`التوقع مؤكد. إعادة الفتح متاحة للأدمن فقط`);
        if ((previous.revision || 0) !== revision) throw new Error(`تغيرت البيانات من نافذة أخرى. حدث الصفحة قبل الحفظ`);
        transaction.set(ref, { month, repId, repName: session().repName, entries: clean, codes: eligible.map(row => row.code), status: confirm ? `confirmed` : `draft`, revision: revision + 1, updatedAt: serverTimestamp(), confirmedAt: confirm ? serverTimestamp() : null });
    });
    return loadForecast(month, repId);
}
export async function importSales(parsed, year, filename) {
    requireAdmin();
    if (!/^20\d\d$/.test(String(year))) throw new Error(`السنة غير صحيحة`);
    const ref = salesRef(year);
    await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref);
        const previous = snapshot.exists() ? snapshot.data() : {};
        const customers = { ...(previous.customers || {}) };
        for (const [code, row] of Object.entries(parsed.customers)) customers[code] = { name: row.name, months: { ...(customers[code]?.months || {}), ...row.months } };
        const mergedMonths = [...new Set([...(previous.months || []), ...parsed.months])].sort((a, b) => a - b);
        const payload = { year: Number(year), customers, months: mergedMonths, filename, updatedAt: serverTimestamp(), revision: (previous.revision || 0) + 1 };
        if (new TextEncoder().encode(JSON.stringify(payload)).length > 750000) throw new Error(`ملف المبيعات أكبر من الحد الآمن للحفظ`);
        transaction.set(ref, payload);
        transaction.set(doc(collection(db, `forecast_audit`)), { action: `sales_import`, year: Number(year), rowCount: parsed.count, months: parsed.months, filename, at: serverTimestamp() });
    });
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
