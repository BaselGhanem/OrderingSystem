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

/**
 * Parse a representative's Excel forecast. Only rows explicitly present in the
 * workbook are updated; an empty Forecast (JOD) cell explicitly means null.
 */
export function parseForecastExcel(matrix, expectedRows) {
    const expected = new Set(expectedRows.map(row => codeKey(row.code)));
    if (!Array.isArray(matrix) || !Array.isArray(matrix[0])) throw new Error(`ملف توقعات Excel فارغ أو غير صالح`);
    const header = matrix[0].map(value => String(value ?? ``).trim().toLowerCase().replace(/\s+/g, ` `));
    const codeIndex = header.findIndex(value => [`cust no`, `customer code`, `code`, `كود الصيدلية`].includes(value));
    const amountIndex = header.findIndex(value => [`forecast (jod)`, `التوقع (د.ا)`, `التوقع بالدينار`].includes(value));
    const noteIndex = header.findIndex(value => [`notes`, `الملاحظة`].includes(value));
    if (codeIndex < 0 || amountIndex < 0) throw new Error(`يجب وجود عمودي Cust No و Forecast (JOD) كما في الملف المصدر`);
    if (matrix.length > 20001) throw new Error(`عدد صفوف الملف أكبر من الحد المسموح`);
    const entries = {}, seen = new Set();
    let filled = 0, cleared = 0;
    for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i] || [];
        if (row.every(value => value === null || value === undefined || String(value).trim() === ``)) continue;
        const code = codeKey(row[codeIndex]);
        if (!code) throw new Error(`كود الصيدلية غير صالح في صف Excel رقم ${i + 1}`);
        if (!expected.has(code)) throw new Error(`الكود ${code} في صف ${i + 1} لا يتبع لهذا المندوب في الشهر المختار`);
        if (seen.has(code)) throw new Error(`كود الصيدلية ${code} مكرر في الملف`);
        seen.add(code);
        let amount;
        try { amount = forecastValue(row[amountIndex]); }
        catch (error) { throw new Error(`خطأ في توقع الصيدلية ${code}، صف ${i + 1}: ${error.message}`); }
        const note = noteIndex < 0 ? `` : String(row[noteIndex] ?? ``);
        if (note.length > 1000) throw new Error(`ملاحظة الصيدلية ${code} أطول من 1000 حرف`);
        entries[code] = { amount, note };
        if (amount === null) cleared++; else filled++;
    }
    if (!seen.size) throw new Error(`ملف Excel لا يحتوي على أي صيدلية`);
    return { entries, count: seen.size, filled, cleared };
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
    return document?.status === `confirmed` && rows.every(row => Object.prototype.hasOwnProperty.call(document.entries || {}, row.code) && (document.entries[row.code]?.amount === null || Number.isSafeInteger(document.entries[row.code]?.amount)));
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
    [`jan`, `january`, `يناير`], [`feb`, `february`, `فبراير`], [`mar`, `march`, `مارس`], [`apr`, `april`, `ابريل`, `أبريل`], [`may`, `مايو`], [`jun`, `june`, `يونيو`],
    [`jul`, `july`, `يوليو`], [`aug`, `august`, `اغسطس`, `أغسطس`], [`sep`, `sept`, `september`, `سبتمبر`], [`oct`, `october`, `اكتوبر`, `أكتوبر`], [`nov`, `november`, `نوفمبر`], [`dec`, `december`, `ديسمبر`]
];
/**
 * Accept a single month beside Cust No / Cust Name. Historical columns may be
 * present in the workbook but are deliberately ignored, never uploaded again.
 */
export function parseSalesMonth(matrix, month) {
    if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`شهر المبيعات غير صالح`);
    if (!Array.isArray(matrix)) throw new Error(`ملف المبيعات فارغ`);
    const nonempty = matrix.filter(row => Array.isArray(row) && row.some(value => value !== null && value !== undefined && String(value).trim() !== ``));
    if (nonempty.length < 2 || nonempty.length > 20001) throw new Error(`ملف الشهر فارغ أو يتجاوز 20000 صيدلية`);
    const headers = nonempty[0].map(value => String(value ?? ``).trim().toLowerCase().replace(/\s+/g, ` `));
    const codeIndex = headers.indexOf(`cust no`), nameIndex = headers.indexOf(`cust name`);
    const monthIndices = headers.map((value, index) => MONTH_HEADERS[month - 1].includes(value) ? index : -1).filter(index => index >= 0);
    if (codeIndex < 0 || nameIndex < 0 || monthIndices.length !== 1) throw new Error(`يجب وجود Cust No و Cust Name وعمود ${MONTH_NAMES[month - 1]} مرة واحدة فقط`);
    const monthIndex = monthIndices[0], customers = {};
    let total = 0;
    nonempty.slice(1).forEach((row, i) => {
        const code = codeKey(row[codeIndex]), name = String(row[nameIndex] ?? ``).trim();
        if (!code || !name) throw new Error(`الصف ${i + 2}: كود او اسم الصيدلية غير صالح`);
        if (Object.prototype.hasOwnProperty.call(customers, code)) throw new Error(`كود الصيدلية ${code} مكرر في الملف`);
        const amount = row[monthIndex];
        if (typeof amount !== `number` || !Number.isFinite(amount)) throw new Error(`الصف ${i + 2}: مبيعات ${MONTH_NAMES[month - 1]} غير رقمية او فارغة`);
        customers[code] = { name, amount: cents(amount) };
        total += cents(amount);
    });
    return { customers, count: Object.keys(customers).length, month, total };
}
export function parseSalesRows(matrix, lastMonth = null) {
    const nonempty = matrix.filter(row => row.some(value => value !== null && value !== undefined && String(value).trim() !== ``));
    if (nonempty.length < 2) throw new Error(`ملف المبيعات فارغ`);
    const headers = nonempty[0].map(value => String(value ?? ``).trim().toLowerCase().replace(/\s+/g, ` `));
    if (new Set(headers).size !== headers.length) throw new Error(`عناوين الأعمدة مكررة`);
    const codeIndex = headers.indexOf(`cust no`), nameIndex = headers.indexOf(`cust name`);
    if (codeIndex < 0 || nameIndex < 0) throw new Error(`يجب وجود عمودي Cust No و Cust Name`);
    const allMonths = MONTH_HEADERS.map((aliases, index) => ({ month: index + 1, index: headers.findIndex(value => aliases.includes(value)) })).filter(item => item.index >= 0);
    if (lastMonth !== null && (!Number.isInteger(lastMonth) || lastMonth < 1 || lastMonth > 12)) throw new Error(`آخر شهر مبيعات غير صالح`);
    const months = allMonths.filter(item => lastMonth === null || item.month <= lastMonth);
    if (lastMonth !== null && !months.some(item => item.month === lastMonth)) throw new Error(`عمود الشهر المحدد غير موجود في الملف`);
    if (months.some(item => headers.filter(value => MONTH_HEADERS[item.month - 1].includes(value)).length > 1)) throw new Error(`لا يمكن تكرار الشهر بأكثر من عنوان`);
    if (!months.length || months.some((item, index) => item.month !== index + 1)) throw new Error(`يجب أن تكون الأشهر متصلة من يناير حتى آخر شهر مرفوع`);
    // A template may include future months with no sales yet. Ignore only wholly blank trailing columns.
    while (months.length && nonempty.slice(1).every(row => row[months[months.length - 1].index] === null || row[months[months.length - 1].index] === undefined || String(row[months[months.length - 1].index]).trim() === ``)) months.pop();
    if (!months.length) throw new Error(`لا توجد مبيعات شهرية في الملف`);
    const known = new Set([codeIndex, nameIndex, ...allMonths.map(item => item.index)]);
    if (headers.some((header, index) => header && !known.has(index))) throw new Error(`يوجد عمود غير معروف؛ استخدم نفس أعمدة ملف المبيعات فقط`);
    const customers = {}, totals = {};
    for (const [i, row] of nonempty.slice(1).entries()) {
        const code = codeKey(row[codeIndex]), name = String(row[nameIndex] ?? ``).trim();
        if (!code || !name) throw new Error(`الصف ${i + 2}: كود أو اسم الصيدلية غير صالح`);
        if (customers[code]) throw new Error(`كود الصيدلية ${code} مكرر في الملف`);
        const values = {};
        for (const item of months) {
            const value = row[item.index];
            if (typeof value !== `number` || !Number.isFinite(value)) throw new Error(`الصف ${i + 2}: قيمة شهر ${MONTH_NAMES[item.month - 1]} فارغة أو ليست رقما`);
            values[String(item.month)] = cents(value);
            totals[item.month] = (totals[item.month] || 0) + cents(value);
        }
        customers[code] = { name, months: values };
    }
    return { customers, months: months.map(item => item.month), totals, count: Object.keys(customers).length };
}
