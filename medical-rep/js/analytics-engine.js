import { db, collection, getDocs, query, where, Timestamp } from './firebase.js';

const C = window.medrepCommon;
const CACHE_NEVER_EXPIRES = 0;
const ORDERS_CACHE_KEY = `orders_medrep_dashboard_smart_v7_legacy_missing_status`;
const INVOICED_CACHE_KEY = `orders_invoiced_smart_v6`;
const ORDER_INCREMENTAL_FIELDS = [`updatedAt`, `changedAt`, `createdAt`, `exportedAt`, `hiddenAt`, `financeApprovedAt`, `marketManagerApprovedAt`, `supervisorApprovedAt`];
const PHARMACY_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24;

function nowIso() {
    return new Date().toISOString();
}

function metaKey(key) {
    return `meta_${key}`;
}

function readRowsCache(key, ttlMs = CACHE_NEVER_EXPIRES) {
    const payload = C.cacheGet(key, ttlMs);
    if (!payload) return null;
    return { rows: Array.isArray(payload.data) ? payload.data : [], savedAt: payload.savedAt, cacheAge: C.cacheAgeText(payload) };
}

function readMeta(key) {
    const payload = C.cacheGet(metaKey(key), CACHE_NEVER_EXPIRES);
    return payload?.data || {};
}

function writeRowsCache(key, rows, extraMeta = {}) {
    C.cacheSet(key, rows || []);
    C.cacheSet(metaKey(key), { ...readMeta(key), ...extraMeta, lastSyncAt: nowIso(), rowsCount: Array.isArray(rows) ? rows.length : 0 });
}

function mergeRowsById(baseRows = [], changedRows = []) {
    const map = new Map();
    baseRows.forEach(row => {
        if (row?.id) map.set(row.id, row);
    });
    changedRows.forEach(row => {
        if (row?.id) map.set(row.id, row);
    });
    return [...map.values()];
}

function snapshotToRows(snap) {
    const rows = [];
    snap.forEach(item => rows.push({ id: item.id, ...item.data() }));
    return rows;
}

async function fetchFullCollection(collectionName) {
    const snap = await getDocs(collection(db, collectionName));
    return snapshotToRows(snap);
}

async function fetchChangedByIsoFields(collectionName, fields = [], sinceIso = ``) {
    if (!sinceIso) return [];
    const rowsById = new Map();
    for (const field of fields) {
        try {
            const snap = await getDocs(query(collection(db, collectionName), where(field, `>`, sinceIso)));
            snapshotToRows(snap).forEach(row => rowsById.set(row.id, row));
        } catch (error) {
            console.warn(`تعذر تحديث ${collectionName}.${field} تفاضليًا:`, error);
        }
    }
    return [...rowsById.values()];
}

async function fetchChangedByTimestampField(collectionName, field = `updatedAt`, sinceIso = ``) {
    if (!sinceIso) return [];
    const sinceDate = C.toDate(sinceIso) || new Date(Date.now() - 1000 * 60 * 60 * 24);
    try {
        const snap = await getDocs(query(collection(db, collectionName), where(field, `>`, Timestamp.fromDate(sinceDate))));
        return snapshotToRows(snap);
    } catch (timestampError) {
        try {
            const snap = await getDocs(query(collection(db, collectionName), where(field, `>`, sinceIso)));
            return snapshotToRows(snap);
        } catch (stringError) {
            console.warn(`تعذر تحديث ${collectionName} تفاضليًا:`, timestampError, stringError);
            return [];
        }
    }
}

async function getCollectionSmart(collectionName, force = false, options = {}) {
    const key = `collection_${collectionName}`;
    const cached = readRowsCache(key, CACHE_NEVER_EXPIRES);
    const meta = readMeta(key);
    const isPharmacies = collectionName === `pharmacies`;
    const isMappingCollection = [`medicalReps`, `medicalRepAreaRules`, `medicalRepOtherShares`, `medicalRepTargets`].includes(collectionName);

    if (cached && !force) {
        return { rows: cached.rows, fromCache: true, cacheAge: cached.cacheAge, cacheOnly: true };
    }

    if (cached && force && isMappingCollection && meta.lastSyncAt) {
        const changed = await fetchChangedByTimestampField(collectionName, `updatedAt`, meta.lastSyncAt);
        const rows = mergeRowsById(cached.rows, changed);
        writeRowsCache(key, rows, { syncMode: `incremental`, changedCount: changed.length });
        return { rows, fromCache: false, cacheAge: `الآن`, changedCount: changed.length, syncMode: `incremental` };
    }

    if (cached && force && isPharmacies) {
        const age = Date.now() - (cached.savedAt || 0);
        if (age < PHARMACY_CACHE_MAX_AGE_MS) {
            return { rows: cached.rows, fromCache: true, cacheAge: cached.cacheAge, cacheOnly: true, syncMode: `pharmacy_cache_24h` };
        }
    }

    const rows = await fetchFullCollection(collectionName);
    writeRowsCache(key, rows, { syncMode: `full` });
    return { rows, fromCache: false, cacheAge: `الآن`, syncMode: `full` };
}

async function getInvoicedOrders(force = false) {
    return getOrdersSmart(INVOICED_CACHE_KEY, false, force);
}

async function getMedicalRepDashboardOrders(force = false) {
    return getOrdersSmart(ORDERS_CACHE_KEY, true, force);
}

async function getOrdersSmart(cacheKey, includeLegacySales = true, force = false) {
    const cached = readRowsCache(cacheKey, CACHE_NEVER_EXPIRES);
    const meta = readMeta(cacheKey);

    if (cached && !force) {
        return { rows: cached.rows, fromCache: true, cacheAge: cached.cacheAge, cacheOnly: true };
    }

    if (cached && meta.lastSyncAt) {
        const changedRows = await fetchChangedByIsoFields(`orders`, ORDER_INCREMENTAL_FIELDS, meta.lastSyncAt);
        const mergedRaw = mergeRowsById(cached.rows, changedRows);
        const rows = includeLegacySales ? keepMedicalRepEligibleOrders(mergedRaw) : keepInvoicedOnly(mergedRaw);
        writeRowsCache(cacheKey, rows, { syncMode: `incremental`, changedCount: changedRows.length });
        return { rows, fromCache: false, cacheAge: `الآن`, changedCount: changedRows.length, syncMode: `incremental` };
    }

    const rows = includeLegacySales ? await fetchFullMedicalRepOrders() : await fetchModernInvoicedOrders();
    writeRowsCache(cacheKey, rows, { syncMode: `full` });
    return { rows, fromCache: false, cacheAge: `الآن`, syncMode: `full` };
}

function keepInvoicedOnly(rows = []) {
    return rows.filter(order => isInvoicedOrder(order)).map(order => ({ ...order, medicalRepSaleSource: `invoiced` }));
}

function keepMedicalRepEligibleOrders(rows = []) {
    return rows.filter(order => isInvoicedOrder(order) || isLegacySalesOrder(order)).map(order => ({
        ...order,
        medicalRepSaleSource: isLegacySalesOrder(order) ? `legacy` : `invoiced`
    }));
}

async function fetchFullMedicalRepOrders() {
    const ordersById = new Map();
    const modernRows = await fetchModernInvoicedOrders();
    modernRows.forEach(order => ordersById.set(order.id, { ...order, medicalRepSaleSource: `invoiced` }));

    const legacyRows = await fetchLegacySalesOrders();
    legacyRows.forEach(order => {
        if (!ordersById.has(order.id)) ordersById.set(order.id, { ...order, medicalRepSaleSource: `legacy` });
    });

    return [...ordersById.values()];
}

async function fetchModernInvoicedOrders() {
    const ordersById = new Map();
    const invoicedQueries = [
        query(collection(db, `orders`), where(`status`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`orderStaffStatus`, `==`, `orders_staff_hidden`)),
        query(collection(db, `orders`), where(`hiddenByOrderStaff`, `==`, true))
    ];

    for (const q of invoicedQueries) {
        try {
            const snap = await getDocs(q);
            snapshotToRows(snap).forEach(order => {
                if (isInvoicedOrder(order)) ordersById.set(order.id, order);
            });
        } catch (error) {
            console.warn(`تعذر تنفيذ استعلام الطلبيات المفوترة:`, error);
        }
    }
    return [...ordersById.values()];
}

async function fetchLegacySalesOrders() {
    try {
        // مهم لشاشة مندوب الدعاية فقط:
        // Firestore لا يستطيع جلب المستندات التي لا تحتوي حقل status باستخدام where(status == null).
        // لذلك يتم عمل backfill كامل مرة واحدة فقط لهذا الكاش الجديد، ثم تعتمد التحديثات التالية على incremental sync.
        const allRows = await fetchFullCollection(`orders`);
        return allRows.filter(order => isLegacySalesOrder(order));
    } catch (fullError) {
        console.warn(`تعذر تنفيذ فحص الطلبيات القديمة الكامل لشاشة مندوب الدعاية، سيتم استخدام استعلامات احتياطية:`, fullError);
        const ordersById = new Map();
        const legacyQueries = [
            query(collection(db, `orders`), where(`status`, `==`, `approved`)),
            query(collection(db, `orders`), where(`status`, `==`, ``)),
            query(collection(db, `orders`), where(`status`, `==`, null))
        ];

        for (const q of legacyQueries) {
            try {
                const snap = await getDocs(q);
                snapshotToRows(snap).forEach(order => {
                    if (isLegacySalesOrder(order)) ordersById.set(order.id, order);
                });
            } catch (error) {
                console.warn(`تعذر تنفيذ استعلام الطلبيات القديمة لشاشة مندوب الدعاية:`, error);
            }
        }
        return [...ordersById.values()];
    }
}

function readCoreCache(includeLegacySales = false) {
    const orderKey = includeLegacySales ? ORDERS_CACHE_KEY : INVOICED_CACHE_KEY;
    const orders = readRowsCache(orderKey, CACHE_NEVER_EXPIRES);
    const pharmacies = readRowsCache(`collection_pharmacies`, CACHE_NEVER_EXPIRES);
    const areaRules = readRowsCache(`collection_medicalRepAreaRules`, CACHE_NEVER_EXPIRES);
    const otherShares = readRowsCache(`collection_medicalRepOtherShares`, CACHE_NEVER_EXPIRES);
    const targets = readRowsCache(`collection_medicalRepTargets`, CACHE_NEVER_EXPIRES);
    if (!orders || !pharmacies || !areaRules) return null;
    return {
        orders: orders.rows,
        pharmacies: pharmacies.rows,
        areaRules: areaRules.rows,
        otherShares: otherShares?.rows || [],
        targets: targets?.rows || [],
        cacheText: `من التخزين المحلي - ${orders.cacheAge}`,
        fromCache: true
    };
}

async function syncCoreData(force = false, options = {}) {
    const includeLegacySales = options.includeLegacySales === true;
    const ordersLoader = includeLegacySales ? getMedicalRepDashboardOrders : getInvoicedOrders;
    const [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack] = await Promise.all([
        ordersLoader(force),
        getCollectionSmart(`pharmacies`, force),
        getCollectionSmart(`medicalRepAreaRules`, force),
        getCollectionSmart(`medicalRepOtherShares`, force),
        getCollectionSmart(`medicalRepTargets`, force)
    ]);
    const changed = [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack].reduce((sum, pack) => sum + C.parseNumber(pack.changedCount || 0), 0);
    const hasCache = [ordersPack, pharmaciesPack, areaRulesPack, otherSharesPack, targetsPack].some(pack => pack.fromCache);
    return {
        orders: ordersPack.rows,
        pharmacies: pharmaciesPack.rows,
        areaRules: areaRulesPack.rows,
        otherShares: otherSharesPack.rows,
        targets: targetsPack.rows,
        cacheText: hasCache ? `من التخزين المحلي - ${ordersPack.cacheAge}` : (changed ? `تم تحديث ${changed} سجل جديد/معدل` : `محدث - لا توجد تغييرات جديدة`),
        fromCache: hasCache,
        changedCount: changed
    };
}

async function loadCoreData(force = false, options = {}) {
    const includeLegacySales = options.includeLegacySales === true;
    const cacheFirst = options.cacheFirst !== false;

    if (!force && cacheFirst) {
        const cachedCore = readCoreCache(includeLegacySales);
        if (cachedCore) {
            cachedCore.backgroundPromise = syncCoreData(true, options);
            return cachedCore;
        }
    }

    if (force && cacheFirst) {
        const cachedCore = readCoreCache(includeLegacySales);
        if (cachedCore) {
            cachedCore.backgroundPromise = syncCoreData(true, options);
            cachedCore.cacheText = `من التخزين المحلي - تحديث بالخلفية`;
            return cachedCore;
        }
    }

    return syncCoreData(true, options);
}

function isInvoicedOrder(order = {}) {
    const status = String(order.status || ``);
    const staffStatus = String(order.orderStaffStatus || ``);
    const exportHistory = Array.isArray(order.exportHistory) ? order.exportHistory : [];
    const auditTrail = Array.isArray(order.auditTrail) ? order.auditTrail : [];
    return status === `orders_staff_hidden` ||
        staffStatus === `orders_staff_hidden` ||
        !!order.invoicedAt ||
        !!order.isInvoiced ||
        !!order.hiddenByOrderStaff ||
        exportHistory.some(entry => entry?.hideAfterExport === true || entry?.invoiced === true) ||
        auditTrail.some(entry => [`orders_staff_hidden`, `orders_staff_hide_after_export`, `orders_staff_invoiced_and_hidden_after_export`].includes(entry?.action));
}

function isLegacySalesOrder(order = {}) {
    if (isInvoicedOrder(order)) return false;
    const modernWorkflowKeys = [
        `orderStaffStatus`,
        `financeStatus`,
        `marketManagerStatus`,
        `supervisorStatus`,
        `workflowStage`,
        `hiddenByOrderStaff`,
        `exportedAt`,
        `financeApprovedAt`,
        `marketManagerApprovedAt`,
        `supervisorApprovedAt`,
        `previousStatus`,
        `actionType`,
        `changedByRole`
    ];
    const hasModernWorkflow = modernWorkflowKeys.some(key => Object.prototype.hasOwnProperty.call(order, key));
    if (hasModernWorkflow) return false;

    const rawStatus = Object.prototype.hasOwnProperty.call(order, `status`) ? String(order.status || ``).trim() : ``;
    const normalizedStatus = C.normalizeArabic(rawStatus).toLowerCase();
    const blockedStatuses = [`pending`, `rejected`, `deleted`, `cancelled`, `canceled`, `returned`, `draft`, `طلب جديد`, `مرفوض`, `محذوف`, `ملغي`, `مرتجع`];
    if (blockedStatuses.some(status => normalizedStatus === C.normalizeArabic(status).toLowerCase())) return false;

    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return false;
    return !rawStatus || normalizedStatus === `approved` || normalizedStatus === C.normalizeArabic(`معتمد`).toLowerCase();
}

function orderDate(order = {}) {
    return order.invoicedAt || order.hiddenAt || order.exportedAt || order.updatedAt || order.createdAt;
}

function getPharmacyCode(order = {}) {
    return String(order.pharmacyCode || order.pharmacy_code || order.customerCode || order.code || ``).trim();
}

function getProductCode(item = {}) {
    return String(item.productCode || item.product_code || item.code || ``).trim();
}

function getOrderArea(order = {}, pharmaciesByCode, pharmaciesByName) {
    const direct = String(order.area || order.Area || order.pharmacyArea || order.region || order.Region || ``).trim();
    if (direct && direct !== `-`) return direct;
    const code = getPharmacyCode(order);
    const name = String(order.pharmacyName || ``).trim();
    const byCode = code ? pharmaciesByCode.get(C.normalizeArabic(code)) : null;
    const byName = name ? pharmaciesByName.get(C.normalizeArabic(name)) : null;
    return String(byCode?.area || byCode?.Area || byCode?.region || byName?.area || byName?.Area || byName?.region || `-`).trim();
}

function lineValue(item = {}) {
    const total = C.parseNumber(item.total || item.rowTotal || item.subtotal);
    if (total) return total;
    return C.parseNumber(item.price) * C.parseNumber(item.qty || item.quantity);
}

function buildPharmacyLookups(pharmacies = []) {
    const pharmaciesByCode = new Map();
    const pharmaciesByName = new Map();
    pharmacies.forEach(pharmacy => {
        const code = String(pharmacy.pharmacyCode || pharmacy.pharmacy_code || pharmacy.code || pharmacy.id || ``).trim();
        const name = String(pharmacy.name || pharmacy.Name || ``).trim();
        if (code) pharmaciesByCode.set(C.normalizeArabic(code), pharmacy);
        if (name) pharmaciesByName.set(C.normalizeArabic(name), pharmacy);
    });
    return { pharmaciesByCode, pharmaciesByName };
}

function buildLookup(rows = [], keyFactory) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyFactory(row);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(row);
    });
    return map;
}

function buildRowsForRep(session = {}, data = {}) {
    const repKey = session.normalizedName || C.normalizeArabic(session.name);
    const { pharmaciesByCode, pharmaciesByName } = buildPharmacyLookups(data.pharmacies || []);
    const myAreaRules = (data.areaRules || []).filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrepKey) === repKey);
    const myOtherShares = (data.otherShares || []).filter(rule => C.normalizeArabic(rule.medrep || rule.medrepKey) === repKey || C.normalizeArabic(rule.medrepKey) === repKey);
    const areaRuleMap = buildLookup(myAreaRules, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}|${rule.areaKey || C.normalizeArabic(rule.area)}`);
    const otherShareMap = buildLookup(myOtherShares, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}`);
    return buildRowsFromMaps(data.orders || [], pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, { defaultTeam: session.team || ``, owner: session.name || `` });
}

function buildRowsForTeam(teamName = ``, data = {}) {
    const teamKey = C.normalizeArabic(teamName);
    const { pharmaciesByCode, pharmaciesByName } = buildPharmacyLookups(data.pharmacies || []);
    const teamAreaRules = (data.areaRules || []).filter(rule => !teamKey || C.normalizeArabic(rule.team) === teamKey);
    const teamOtherShares = (data.otherShares || []).filter(rule => !teamKey || C.normalizeArabic(rule.team) === teamKey);
    const areaRuleMap = buildLookup(teamAreaRules, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}|${rule.areaKey || C.normalizeArabic(rule.area)}`);
    const otherShareMap = buildLookup(teamOtherShares, rule => `${rule.itemKey || C.normalizeItem(rule.itemName)}`);
    return buildRowsFromMaps(data.orders || [], pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, { defaultTeam: teamName || ``, owner: `team` });
}

function buildRowsFromMaps(orders, pharmaciesByCode, pharmaciesByName, areaRuleMap, otherShareMap, meta = {}) {
    const result = [];
    orders.filter(order => isInvoicedOrder(order) || isLegacySalesOrder(order)).forEach(order => {
        const area = getOrderArea(order, pharmaciesByCode, pharmaciesByName);
        const areaKey = C.normalizeArabic(area);
        const date = orderDate(order);
        const items = Array.isArray(order.items) ? order.items : [];
        const orderKey = String(order.id || ``);

        items.forEach((item, itemIndex) => {
            const itemName = String(item.name || item.itemName || item.productName || ``).trim();
            if (!itemName) return;
            const itemKey = C.normalizeItem(itemName);
            const qty = C.parseNumber(item.qty || item.quantity);
            const value = lineValue(item);
            const code = getProductCode(item);
            const common = {
                orderId: orderKey,
                orderShort: orderKey.slice(0, 6).toUpperCase(),
                lineKey: `${orderKey}_${itemIndex}`,
                date,
                dateText: C.formatDate(date),
                dateTimeText: C.formatDateTime(date),
                pharmacyName: order.pharmacyName || `-`,
                pharmacyCode: getPharmacyCode(order),
                salesRepName: order.repName || `-`,
                salesManagerName: order.managerName || `-`,
                area,
                areaKey,
                itemName,
                itemKey,
                productCode: code,
                sourceQty: qty,
                sourceValue: value,
                unitPrice: qty ? value / qty : C.parseNumber(item.price),
                invoiceStatus: order.medicalRepSaleSource === `legacy` ? `legacy_sale` : (order.orderStaffStatus || order.status || `-`)
            };

            if (C.isOtherArea(area)) {
                const matches = otherShareMap.get(itemKey) || [];
                matches.forEach(match => {
                    const pct = C.parsePercentageRatio(match.percentage);
                    if (!Number.isFinite(pct) || pct <= 0) return;
                    result.push({
                        ...common,
                        allocatedQty: qty * pct,
                        allocatedValue: value * pct,
                        percentage: pct,
                        channel: `others`,
                        team: match.team || meta.defaultTeam || ``,
                        medrep: match.medrep || meta.owner || ``,
                        medrepKey: match.medrepKey || C.normalizeArabic(match.medrep || meta.owner || ``),
                        ruleNote: `منطقة اخرين`
                    });
                });
                return;
            }

            const matches = areaRuleMap.get(`${itemKey}|${areaKey}`) || [];
            matches.forEach(match => {
                result.push({
                    ...common,
                    allocatedQty: qty,
                    allocatedValue: value,
                    percentage: 1,
                    channel: `direct`,
                    team: match.team || meta.defaultTeam || ``,
                    medrep: match.medrep || meta.owner || ``,
                    medrepKey: match.medrepKey || C.normalizeArabic(match.medrep || meta.owner || ``),
                    ruleNote: `منطقة مباشرة`
                });
            });
        });
    });
    return result.sort((a, b) => (C.toDate(b.date)?.getTime() || 0) - (C.toDate(a.date)?.getTime() || 0));
}

function distinctTeams(data = {}) {
    return [...new Set([...(data.areaRules || []), ...(data.otherShares || []), ...(data.targets || [])]
        .map(row => String(row.team || ``).trim())
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, `ar`));
}

function targetForRows(rows = [], targets = [], filters = {}) {
    const repKey = filters.repName ? C.normalizeArabic(filters.repName) : ``;
    const teamKey = filters.team ? C.normalizeArabic(filters.team) : ``;
    const item = filters.itemName || ``;
    const fromMonth = filters.from ? filters.from.slice(0, 7) : ``;
    const toMonth = filters.to ? filters.to.slice(0, 7) : ``;
    return targets
        .filter(row => !repKey || C.normalizeArabic(row.medrep || row.medrepKey) === repKey || C.normalizeArabic(row.medrepKey) === repKey)
        .filter(row => !teamKey || C.normalizeArabic(row.team) === teamKey)
        .filter(row => !item || row.itemName === item)
        .filter(row => {
            const key = row.periodKey || `${row.year}-${String(row.month).padStart(2, `0`)}`;
            if (fromMonth && key < fromMonth) return false;
            if (toMonth && key > toMonth) return false;
            return true;
        })
        .reduce((acc, row) => {
            acc.value += C.parseNumber(row.targetValue);
            acc.qty += C.parseNumber(row.targetQty);
            return acc;
        }, { value: 0, qty: 0 });
}

export {
    getCollectionSmart,
    getInvoicedOrders,
    getMedicalRepDashboardOrders,
    loadCoreData,
    buildRowsForRep,
    buildRowsForTeam,
    distinctTeams,
    targetForRows
};
