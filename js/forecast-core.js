export const MONTH_NAMES = [`يناير`, `فبراير`, `مارس`, `أبريل`, `مايو`, `يونيو`, `يوليو`, `أغسطس`, `سبتمبر`, `أكتوبر`, `نوفمبر`, `ديسمبر`];
export const DEFAULT_ASSIGNMENTS = {
    [`مراد عمر`]: `محمد طوالبه`, [`مؤيد الزعبي`]: `محمد طوالبه`, [`محمد عبدربه`]: `محمد طوالبه`,
    [`محمد الفاعوري`]: `عبدالله الناطور`, [`اجود التلهوني`]: `عبدالله الناطور`, [`يزيد الرقب`]: `محمد طوالبه`,
    [`تامر عقل`]: `محمد طوالبه`, [`محمد ابو يامين`]: `عبدالله الناطور`, [`مراد الظاهر`]: `عبدالله الناطور`,
    [`آخرين - عبدالله`]: `عبدالله الناطور`, [`آخرين - محمد`]: `محمد طوالبه`
};
export function normalizeName(value = ``) {
    return String(value ?? ``).trim().replace(/[أإآ]/g, `ا`).replace(/[\u064B-\u065F]/g, ``).replace(/\s+/g, ` `).toLowerCase();
}
export function digits(value) {
    return String(value ?? ``).replace(/[٠-٩]/g, c => String(`٠١٢٣٤٥٦٧٨٩`.indexOf(c))).replace(/[۰-۹]/g, c => String(`۰۱۲۳۴۵۶۷۸۹`.indexOf(c)));
}
export function codeKey(value) {
    const text = digits(value).trim();
    if (!/^\d+(?:\.0+)?$/.test(text)) return ``;
    return text.replace(/\.0+$/, ``).replace(/^0+(?=\d)/, ``);
}
export function cents(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error(`قيمة مالية غير صالحة`);
    const result = Math.sign(n) * Math.round(Math.abs(n) * 100 + 1e-7);
    if (!Number.isSafeInteger(result)) throw new Error(`القيمة المالية أكبر من الحد المسموح`);
    return result;
}
export function forecastValue(value) {
    const text = digits(value).trim().replace(/٫/g, `.`);
    if (!text) return null;
    if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`أدخل مبلغا صحيحا بمنزلتين عشريتين كحد أقصى`);
    return cents(text);
}
export function dateValue(value) {
    if (!value) return null;
    if (typeof value.toDate === `function`) return value.toDate();
    if (typeof value === `object` && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}
export function ammanMonth(date = new Date()) {
    const parts = new Intl.DateTimeFormat(`en-GB`, { timeZone: `Asia/Amman`, year: `numeric`, month: `2-digit` }).formatToParts(date);
    return `${parts.find(p => p.type === `year`).value}-${parts.find(p => p.type === `month`).value}`;
}
export function monthLabel(month) {
    return `${MONTH_NAMES[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
}
export function validMonth(month) { return /^20\d\d-(0[1-9]|1[0-2])$/.test(month); }
export function repDocumentId(month, repId) {
    if (!validMonth(month) || !repId || /[\/]/.test(repId)) throw new Error(`هوية المندوب أو الشهر غير صالح`);
    return `${month}__${repId}`;
}
export function resolveRoutes(pharmacies, reps, assignments = {}) {
    const repMap = new Map(reps.map(rep => [rep.id, rep]));
    const assignmentMap = new Map(Object.entries({ ...DEFAULT_ASSIGNMENTS, ...assignments }).map(([name, supervisor]) => [normalizeName(name), supervisor]));
    const routes = new Map(), conflicts = new Map(), invalid = [];
    for (const pharmacy of pharmacies) {
        const code = codeKey(pharmacy.pharmacyCode || pharmacy.pharmacy_code);
        const repId = String(pharmacy.rep_id || pharmacy.repId || ``).trim();
        const rep = repMap.get(repId);
        if (!code || !rep) { invalid.push(pharmacy); continue; }
        const explicitSupervisor = String(pharmacy.supervisor || pharmacy.supervisorName || pharmacy.managerName || ``).trim();
        const supervisor = explicitSupervisor || assignmentMap.get(normalizeName(rep.name)) || ``;
        let repName = rep.name;
        if (normalizeName(rep.name) === `اخرين` && supervisor) repName = supervisor.includes(`عبدالله`) ? `آخرين - عبدالله` : supervisor.includes(`محمد`) ? `آخرين - محمد` : rep.name;
        const route = { code, repId, repName, supervisor, pharmacyName: pharmacy.name || pharmacy.pharmacyName || ``, pharmacyId: pharmacy.id };
        const previous = routes.get(code);
        if (previous && (previous.repId !== route.repId || normalizeName(previous.supervisor) !== normalizeName(route.supervisor))) {
            conflicts.set(code, [previous, route]);
        } else if (!previous) routes.set(code, route);
    }
    for (const code of conflicts.keys()) routes.delete(code);
    return { routes, conflicts, invalid };
}
export function eligibleRows(sales, routes, repId = ``) {
    return Object.entries(sales?.customers || {}).flatMap(([code, customer]) => {
        const route = routes.get(code);
        return route && (!repId || route.repId === repId) ? [{ ...route, salesName: customer.name, months: customer.months || {} }] : [];
    }).sort((a, b) => a.pharmacyName.localeCompare(b.pharmacyName, `ar`) || a.code.localeCompare(b.code, `en`, { numeric: true }));
}
export function isComplete(document, rows) {
    return document?.status === `confirmed` && rows.every(row => Number.isSafeInteger(document.entries?.[row.code]?.amount));
}
export function progress(document, rows) {
    const filled = rows.filter(row => Number.isSafeInteger(document?.entries?.[row.code]?.amount)).length;
    return { filled, total: rows.length, confirmed: isComplete(document, rows), totalCents: rows.reduce((sum, row) => sum + (document?.entries?.[row.code]?.amount ?? 0), 0) };
}
export function permitActive(permit, now) {
    const granted = dateValue(permit?.grantedAt);
    return Boolean(!permit?.revoked && granted && Number.isFinite(permit.hours) && permit.hours > 0 && granted.getTime() <= now.getTime() && now.getTime() < granted.getTime() + permit.hours * 3600000);
}
export function invoiceDate(order) {
    const status = String(order.status || order.orderStatus || order.workflowStatus || order.orderStaffStatus || ``);
    if (order.deleted || order.isDeleted || order.deletedAt || status.startsWith(`deleted`) || status.includes(`rejected`) || status.startsWith(`returned`) || order.workflowStage === `deleted`) return null;
    const terminal = [`orders_staff_hidden`, `orders_staff_invoiced_and_hidden_after_export`, `orders_staff_invoiced_after_export`].includes(status);
    // A current active/returned workflow is not an invoice, regardless of old export history.
    if (!terminal && status && ![`تمت الفوترة`, `invoiced`].includes(status)) return null;
    const history = (order.exportHistory || []).filter(entry => /orders_staff/i.test(entry?.source || ``) || entry?.invoiced === true || entry?.hideAfterExport === true);
    const audit = (order.auditTrail || []).filter(entry => /orders_staff_(?:invoiced|export)/.test(entry.action || ``));
    const direct = dateValue(order.invoicedAt) || dateValue(order.hiddenAt);
    if (direct) return direct;
    const dates = [...history.map(entry => dateValue(entry.exportedAt || entry.timestamp)), ...audit.map(entry => dateValue(entry.timestamp || entry.at || entry.createdAt))].filter(Boolean).sort((a, b) => a - b);
    return dates[0] || (terminal ? dateValue(order.exportedAt) : null);
}
export function invoiceTotals(orders, month) {
    const totals = new Map(), seen = new Set(); let missingDates = 0, missingCodes = 0;
    for (const order of orders) {
        if (!order.id || seen.has(order.id)) continue;
        seen.add(order.id);
        const date = invoiceDate(order);
        if (!date) { if (order.status === `orders_staff_hidden`) missingDates++; continue; }
        if (ammanMonth(date) !== month) continue;
        const code = codeKey(order.pharmacyCode || order.pharmacy_code || order.customerCode);
        if (!code) { missingCodes++; continue; }
        const raw = order.grandTotal ?? order.total;
        if (raw === undefined || raw === null || raw === ``) throw new Error(`الطلبية ${order.id} لا تحتوي قيمة إجمالية موثوقة`);
        const total = totals.get(code) || { amount: 0, count: 0 };
        total.amount += cents(raw); total.count++; totals.set(code, total);
    }
    return { totals, missingDates, missingCodes };
}
const MONTH_HEADERS = [
    [`jan`, `january`], [`feb`, `february`], [`mar`, `march`], [`apr`, `april`], [`may`], [`jun`, `june`],
    [`jul`, `july`], [`aug`, `august`], [`sep`, `sept`, `september`], [`oct`, `october`], [`nov`, `november`], [`dec`, `december`]
];
export function parseSalesRows(matrix) {
    const nonempty = matrix.filter(row => row.some(value => value !== null && value !== undefined && String(value).trim() !== ``));
    if (nonempty.length < 2) throw new Error(`ملف المبيعات فارغ`);
    const headers = nonempty[0].map(value => String(value ?? ``).trim().toLowerCase().replace(/\s+/g, ` `));
    if (new Set(headers).size !== headers.length) throw new Error(`عناوين الأعمدة مكررة`);
    const codeIndex = headers.indexOf(`cust no`), nameIndex = headers.indexOf(`cust name`);
    if (codeIndex < 0 || nameIndex < 0) throw new Error(`يجب وجود عمودي Cust No و Cust Name`);
    const months = MONTH_HEADERS.map((aliases, index) => ({ month: index + 1, index: headers.findIndex(value => aliases.includes(value)) })).filter(item => item.index >= 0);
    if (!months.length || months.some((item, index) => item.month !== index + 1)) throw new Error(`يجب أن تكون الأشهر متصلة من يناير حتى آخر شهر مرفوع`);
    const known = new Set([codeIndex, nameIndex, ...months.map(item => item.index)]);
    if (headers.some((header, index) => header && !known.has(index))) throw new Error(`يوجد عمود غير معروف؛ استخدم نفس أعمدة ملف المبيعات فقط`);
    const customers = {}, totals = {};
    for (const [i, row] of nonempty.slice(1).entries()) {
        const code = codeKey(row[codeIndex]), name = String(row[nameIndex] ?? ``).trim();
        if (!code || !name) throw new Error(`الصف ${i + 2}: كود أو اسم الصيدلية غير صالح`);
        if (customers[code]) throw new Error(`كود الصيدلية ${code} مكرر في الملف`);
        const values = {};
        for (const item of months) {
            const value = row[item.index];
            if (typeof value !== `number` || !Number.isFinite(value)) throw new Error(`الصف ${i + 2}: قيمة شهر ${item.month} فارغة أو ليست رقما`);
            values[String(item.month)] = cents(value);
            totals[item.month] = (totals[item.month] || 0) + cents(value);
        }
        customers[code] = { name, months: values };
    }
    return { customers, months: months.map(item => item.month), totals, count: Object.keys(customers).length };
}
